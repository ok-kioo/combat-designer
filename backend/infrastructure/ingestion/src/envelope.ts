import crypto from "node:crypto";
import {
  ExportBundleManifestSchema,
  type ExportBundleManifest,
} from "@combat-designer/shared-contracts";
import { DEFAULT_INGESTION_LIMITS, type IngestionLimits } from "./limits.js";

export interface BundleFileEntry {
  path: string;
  content: string | Buffer;
}

export interface EnvelopeValidationResult {
  valid: boolean;
  manifest?: ExportBundleManifest;
  errors: string[];
  conflictType?: string;
}

export function computeSha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function computeCanonicalBundleHash(checksums: Record<string, string>): string {
  const sortedKeys = Object.keys(checksums).sort();
  const canonicalString = sortedKeys.map((k) => `${k}:${checksums[k]}`).join("\n");
  return computeSha256(canonicalString);
}

export function validateEnvelope(
  rawManifest: unknown,
  files: Map<string, string | Buffer>,
  authorizedWorkspaceId?: string,
  limits: IngestionLimits = DEFAULT_INGESTION_LIMITS
): EnvelopeValidationResult {
  const errors: string[] = [];

  // 1. Validate Manifest Schema
  const parseResult = ExportBundleManifestSchema.safeParse(rawManifest);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`Manifest schema error at '${issue.path.join(".")}': ${issue.message}`);
    }
    return { valid: false, errors, conflictType: "manifest_tampered" };
  }

  const manifest = parseResult.data;

  // 2. Workspace Mismatch Check (02.SEC.6)
  if (authorizedWorkspaceId && manifest.workspace_id !== authorizedWorkspaceId) {
    errors.push(
      `Workspace mismatch: manifest workspace_id '${manifest.workspace_id}' does not match authorized workspace '${authorizedWorkspaceId}'`
    );
    return { valid: false, manifest, errors, conflictType: "workspace_mismatch" };
  }

  // 3. Limits Check: File Count
  if (files.size > limits.maxFileCount) {
    errors.push(
      `Bundle file count (${files.size}) exceeds maximum allowed (${limits.maxFileCount})`
    );
    return { valid: false, manifest, errors, conflictType: "oversized_bundle" };
  }

  // 4. Limits Check: Total Bundle Size & Individual File Size (02.SEC.2)
  let totalBytes = 0;
  for (const [filePath, content] of files.entries()) {
    const fileBytes = typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.length;
    if (fileBytes > limits.maxFileSizeBytes) {
      errors.push(
        `File '${filePath}' size (${fileBytes} bytes) exceeds limit (${limits.maxFileSizeBytes} bytes)`
      );
      return { valid: false, manifest, errors, conflictType: "oversized_bundle" };
    }
    totalBytes += fileBytes;
  }

  if (totalBytes > limits.maxBundleSizeBytes) {
    errors.push(
      `Total bundle size (${totalBytes} bytes) exceeds limit (${limits.maxBundleSizeBytes} bytes)`
    );
    return { valid: false, manifest, errors, conflictType: "oversized_bundle" };
  }

  // 5. Path Traversal & Normalization Check (02.SEC.1)
  for (const filePath of Object.keys(manifest.checksums)) {
    if (
      filePath.includes("..") ||
      filePath.startsWith("/") ||
      filePath.startsWith("\\") ||
      /^[a-zA-Z]:/.test(filePath) ||
      filePath.includes("\0")
    ) {
      errors.push(`Illegal file path detected (path traversal attempt): '${filePath}'`);
      return { valid: false, manifest, errors, conflictType: "manifest_tampered" };
    }
  }

  // 6. Check that all files declared in manifest exist and verify checksums (02.SEC.7)
  for (const [relPath, expectedHash] of Object.entries(manifest.checksums)) {
    const fileContent = files.get(relPath);
    if (fileContent === undefined) {
      errors.push(`Missing file declared in manifest: '${relPath}'`);
      return { valid: false, manifest, errors, conflictType: "checksum_mismatch" };
    }

    const actualHash = computeSha256(fileContent);
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      errors.push(
        `Checksum mismatch for '${relPath}': expected ${expectedHash}, got ${actualHash}`
      );
      return { valid: false, manifest, errors, conflictType: "checksum_mismatch" };
    }
  }

  // 7. Verify Bundle Hash
  const expectedBundleHash = computeCanonicalBundleHash(manifest.checksums);
  if (manifest.bundle_hash.toLowerCase() !== expectedBundleHash.toLowerCase()) {
    errors.push(
      `bundle_hash mismatch: declared '${manifest.bundle_hash}', calculated '${expectedBundleHash}'`
    );
    return { valid: false, manifest, errors, conflictType: "checksum_mismatch" };
  }

  return {
    valid: true,
    manifest,
    errors: [],
  };
}
