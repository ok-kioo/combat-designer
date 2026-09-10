import crypto from "node:crypto";
import type {
  CanonicalAttack,
  CanonicalSnapshotEnvelope,
  QuarantineRecord,
  ConflictRecord,
} from "@combat-designer/backend";
import { validateEnvelope, computeSha256 } from "./envelope.js";
import { checkParserCompatibility } from "./version-check.js";
import { parseUnityYaml } from "./parsers/unity-yaml.js";
import { normalizeRawItem } from "./normalizer.js";
import { IngestionCache } from "./cache.js";
import { DEFAULT_INGESTION_LIMITS, type IngestionLimits } from "./limits.js";

export interface IngestionOptions {
  authorizedWorkspaceId?: string;
  cache?: IngestionCache;
  limits?: IngestionLimits;
  deterministicCreatedAt?: string;
}

export interface IngestionPipelineResult {
  success: boolean;
  envelope: CanonicalSnapshotEnvelope;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Computes a deterministic SHA-256 hash of canonical attacks.
 * Serializes attacks sorted by ID with predictable key ordering.
 */
export function computeDeterministicSnapshotHash(attacks: CanonicalAttack[]): string {
  const sortedAttacks = [...attacks].sort((a, b) => a.id.localeCompare(b.id));
  const canonicalJson = JSON.stringify(sortedAttacks);
  return computeSha256(canonicalJson);
}

export function runIngestionPipeline(
  rawManifest: unknown,
  files: Map<string, string | Buffer>,
  options: IngestionOptions = {}
): IngestionPipelineResult {
  const limits = options.limits ?? DEFAULT_INGESTION_LIMITS;
  const cache = options.cache ?? new IngestionCache();
  const quarantined: QuarantineRecord[] = [];
  const conflicts: ConflictRecord[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  // 1. Envelope & Manifest Validation (02.SEC.1, 02.SEC.2, 02.SEC.6, 02.SEC.7)
  const envValidation = validateEnvelope(
    rawManifest,
    files,
    options.authorizedWorkspaceId,
    limits
  );

  const now = options.deterministicCreatedAt ?? new Date().toISOString();

  if (!envValidation.valid || !envValidation.manifest) {
    const rawObj = (rawManifest && typeof rawManifest === "object" ? rawManifest : {}) as Record<string, unknown>;
    const workspaceId = String(rawObj.workspace_id || options.authorizedWorkspaceId || "unknown");
    const projectId = String(rawObj.project_id || "unknown");
    const revision = String(rawObj.project_revision || "unknown");

    conflicts.push({
      workspace_id: workspaceId,
      project_id: projectId,
      project_revision: revision,
      conflict_type: (envValidation.conflictType as any) || "manifest_tampered",
      details: envValidation.errors.join("; "),
      conflicting_items: [],
      detected_at: now,
    });

    const emptySnapshot = {
      workspace_id: workspaceId,
      project_id: projectId,
      project_revision: revision,
      attacks: [],
      snapshot_hash: computeSha256("[]"),
    };

    return {
      success: false,
      cacheHits: 0,
      cacheMisses: 0,
      envelope: {
        workspace_id: workspaceId,
        project_id: projectId,
        revision,
        snapshot_id: `snap_rejected_${projectId}_error`,
        snapshot_hash: emptySnapshot.snapshot_hash,
        parser_version: String(rawObj.parser_version || "unknown"),
        schema_version: String(rawObj.schema_version || "1.0.0"),
        canonical_snapshot: emptySnapshot,
        quarantined: [],
        conflicts,
        created_at: now,
      },
    };
  }

  const manifest = envValidation.manifest;

  // 2. Compatibility Check (02.SEC.8)
  const compat = checkParserCompatibility(manifest);
  if (!compat.compatible && compat.conflict) {
    conflicts.push({
      workspace_id: manifest.workspace_id,
      project_id: manifest.project_id,
      project_revision: manifest.project_revision,
      conflict_type: (compat.conflict.conflict_type as any) || "unsupported_format",
      details: compat.conflict.details,
      conflicting_items: [],
      detected_at: now,
    });

    const emptySnapshot = {
      workspace_id: manifest.workspace_id,
      project_id: manifest.project_id,
      project_revision: manifest.project_revision,
      attacks: [],
      snapshot_hash: computeSha256("[]"),
    };

    return {
      success: false,
      cacheHits: 0,
      cacheMisses: 0,
      envelope: {
        workspace_id: manifest.workspace_id,
        project_id: manifest.project_id,
        revision: manifest.project_revision,
        snapshot_id: `snap_incompatible_${manifest.project_id}`,
        snapshot_hash: emptySnapshot.snapshot_hash,
        parser_version: manifest.parser_version,
        schema_version: manifest.schema_version,
        canonical_snapshot: emptySnapshot,
        quarantined: [],
        conflicts,
        created_at: now,
      },
    };
  }

  // 3. Process Asset Files (Sorted for determinism)
  const sortedFilePaths = Object.keys(manifest.checksums).sort();
  const seenAssetIds = new Map<string, string>(); // assetId -> firstFilePath (for duplicate check)
  const attacks: CanonicalAttack[] = [];

  for (const relPath of sortedFilePaths) {
    const rawContent = files.get(relPath);
    if (rawContent === undefined) continue;
    const contentStr = typeof rawContent === "string" ? rawContent : rawContent.toString("utf8");

    // Parse Unity YAML
    const parseResult = parseUnityYaml(
      contentStr,
      relPath,
      manifest.engine,
      manifest.project_revision,
      manifest.parser_version,
      limits.maxYamlDepth
    );

    if (parseResult.quarantine) {
      quarantined.push({
        workspace_id: manifest.workspace_id,
        project_id: manifest.project_id,
        project_revision: manifest.project_revision,
        asset_id: parseResult.quarantine.asset_id,
        source_path: parseResult.quarantine.source_path,
        reason: parseResult.quarantine.reason,
        raw_reference: parseResult.quarantine.raw_reference,
        parser_version: parseResult.quarantine.parser_version,
        quarantined_at: now,
      });
      continue;
    }

    const item = parseResult.item!;

    // Duplicate asset identity detection (02.SEC.5)
    if (seenAssetIds.has(item.asset_id)) {
      const priorPath = seenAssetIds.get(item.asset_id)!;
      conflicts.push({
        workspace_id: manifest.workspace_id,
        project_id: manifest.project_id,
        project_revision: manifest.project_revision,
        conflict_type: "duplicate_identity",
        details: `Duplicate asset identity '${item.asset_id}' found in '${relPath}' and '${priorPath}'`,
        conflicting_items: [priorPath, relPath],
        detected_at: now,
      });
      continue;
    }
    seenAssetIds.set(item.asset_id, relPath);

    // Incremental Cache Check
    if (cache.has(item.source_hash, manifest.parser_version)) {
      const cached = cache.get(item.source_hash, manifest.parser_version)!;
      attacks.push(cached);
      cacheHits++;
      continue;
    }

    cacheMisses++;

    // Normalization & Validation
    const normResult = normalizeRawItem(item, manifest.project_id, manifest.engine);
    if (normResult.quarantine) {
      quarantined.push({
        workspace_id: manifest.workspace_id,
        project_id: manifest.project_id,
        project_revision: manifest.project_revision,
        asset_id: normResult.quarantine.asset_id,
        source_path: normResult.quarantine.source_path,
        reason: normResult.quarantine.reason,
        raw_reference: normResult.quarantine.raw_reference,
        parser_version: normResult.quarantine.parser_version,
        quarantined_at: now,
      });
      continue;
    }

    const attack = normResult.attack!;
    cache.set(item.source_hash, manifest.parser_version, attack);
    attacks.push(attack);
  }

  // 4. Deterministic Sort & Hash
  attacks.sort((a, b) => a.id.localeCompare(b.id));
  quarantined.sort((a, b) => a.source_path.localeCompare(b.source_path));
  conflicts.sort((a, b) => a.conflict_type.localeCompare(b.conflict_type));

  const snapshotHash = computeDeterministicSnapshotHash(attacks);
  const snapshotId = `snap_${manifest.project_id}_${snapshotHash.slice(0, 16)}`;

  const canonicalSnapshot = {
    workspace_id: manifest.workspace_id,
    project_id: manifest.project_id,
    project_revision: manifest.project_revision,
    attacks,
    snapshot_hash: snapshotHash,
  };

  const isSuccess = conflicts.length === 0;

  return {
    success: isSuccess,
    cacheHits,
    cacheMisses,
    envelope: {
      workspace_id: manifest.workspace_id,
      project_id: manifest.project_id,
      revision: manifest.project_revision,
      snapshot_id: snapshotId,
      snapshot_hash: snapshotHash,
      parser_version: manifest.parser_version,
      schema_version: manifest.schema_version,
      canonical_snapshot: canonicalSnapshot,
      quarantined,
      conflicts,
      created_at: now,
    },
  };
}
