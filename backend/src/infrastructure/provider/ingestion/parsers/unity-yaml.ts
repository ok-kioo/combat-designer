import yaml from "yaml";
import crypto from "node:crypto";
import type { RawExtractionItem, QuarantineRecord } from "@combat-designer/backend";
import { DEFAULT_INGESTION_LIMITS } from "../limits.js";

function getObjectDepth(obj: unknown, currentDepth = 0): number {
  if (!obj || typeof obj !== "object") {
    return currentDepth;
  }
  let maxChildDepth = currentDepth;
  for (const key of Object.keys(obj)) {
    const child = (obj as Record<string, unknown>)[key];
    const depth = getObjectDepth(child, currentDepth + 1);
    if (depth > maxChildDepth) {
      maxChildDepth = depth;
    }
  }
  return maxChildDepth;
}

export interface UnityParseResult {
  item?: RawExtractionItem;
  quarantine?: Omit<QuarantineRecord, "workspace_id" | "project_id" | "project_revision" | "quarantined_at">;
}

export function parseUnityYaml(
  content: string,
  sourcePath: string,
  engine: string,
  projectRevision: string,
  parserVersion: string,
  maxDepth = DEFAULT_INGESTION_LIMITS.maxYamlDepth
): UnityParseResult {
  const sourceHash = crypto.createHash("sha256").update(content).digest("hex");

  // Sanitize Unity-specific tag lines like "%TAG", "%YAML", or "!u!114 &11400000"
  // so standard YAML parser doesn't choke on unknown Unity custom tags
  let cleaned = content.replace(/^%YAML[^\n]*\n?/gm, "");
  cleaned = cleaned.replace(/^%TAG[^\n]*\n?/gm, "");
  cleaned = cleaned.replace(/--- !u!\d+ &\d+/g, "---");

  let parsed: unknown;
  try {
    parsed = yaml.parse(cleaned);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      quarantine: {
        asset_id: sourcePath,
        source_path: sourcePath,
        reason: `YAML parse error: ${msg}`,
        parser_version: parserVersion,
        raw_reference: content.slice(0, 500),
      },
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      quarantine: {
        asset_id: sourcePath,
        source_path: sourcePath,
        reason: "Parsed Unity document is empty or not an object",
        parser_version: parserVersion,
      },
    };
  }

  // Check YAML Depth Guard (02.SEC.3)
  const depth = getObjectDepth(parsed);
  if (depth > maxDepth) {
    return {
      quarantine: {
        asset_id: sourcePath,
        source_path: sourcePath,
        reason: `Excessive YAML nesting depth (${depth} > ${maxDepth})`,
        parser_version: parserVersion,
      },
    };
  }

  // In Unity ScriptableObjects, fields are either at root or inside MonoBehaviour
  const rawObj = parsed as Record<string, unknown>;
  const data = (rawObj.MonoBehaviour && typeof rawObj.MonoBehaviour === "object"
    ? rawObj.MonoBehaviour
    : rawObj) as Record<string, unknown>;

  // Asset ID identification
  const assetId = String(
    data.attackId || data.m_Name || data.asset_id || data.name || ""
  ).trim();

  if (!assetId) {
    return {
      quarantine: {
        asset_id: "unknown",
        source_path: sourcePath,
        reason: "Missing asset identity: neither attackId nor m_Name found",
        parser_version: parserVersion,
        raw_reference: data,
      },
    };
  }

  // Check if it has combat properties
  if (
    data.startupFrames === undefined &&
    data.startup === undefined &&
    data.damage === undefined &&
    data.activeFrames === undefined &&
    data.active === undefined
  ) {
    return {
      quarantine: {
        asset_id: assetId,
        source_path: sourcePath,
        reason: "Unsupported object: asset lacks mandatory combat timing fields (startup, active, damage)",
        parser_version: parserVersion,
        raw_reference: data,
      },
    };
  }

  return {
    item: {
      asset_id: assetId,
      source_path: sourcePath,
      source_hash: sourceHash,
      raw_payload: data,
      untrusted_text: true,
      engine,
      project_revision: projectRevision,
      parser_version: parserVersion,
    },
  };
}
