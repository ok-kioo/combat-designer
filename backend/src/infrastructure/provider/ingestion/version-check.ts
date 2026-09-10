import type { ExportBundleManifest, CompatibilityResult } from "@combat-designer/backend";

export const SUPPORTED_PARSER_VERSION = "1.0.0";
export const SUPPORTED_ENGINES = ["unity"] as const;
export const SUPPORTED_FORMATS = ["unity-yaml-scriptable-object"] as const;

export function checkParserCompatibility(
  manifest: ExportBundleManifest
): CompatibilityResult {
  // Check engine
  if (!SUPPORTED_ENGINES.includes(manifest.engine as "unity")) {
    return {
      compatible: false,
      conflict: {
        conflict_type: "unsupported_format",
        details: `Engine '${manifest.engine}' is not supported yet by this parser version (${SUPPORTED_PARSER_VERSION}). Supported: ${SUPPORTED_ENGINES.join(", ")}`,
      },
    };
  }

  // Check format
  if (!SUPPORTED_FORMATS.includes(manifest.format as "unity-yaml-scriptable-object")) {
    return {
      compatible: false,
      conflict: {
        conflict_type: "unsupported_format",
        details: `Format '${manifest.format}' is unsupported for engine '${manifest.engine}'. Supported: ${SUPPORTED_FORMATS.join(", ")}`,
      },
    };
  }

  // Check exporter version major
  const exporterMajor = manifest.exporter_version.split(".")[0];
  const parserMajor = SUPPORTED_PARSER_VERSION.split(".")[0];

  if (exporterMajor !== parserMajor) {
    return {
      compatible: false,
      conflict: {
        conflict_type: "version_mismatch",
        details: `Exporter version '${manifest.exporter_version}' is incompatible with server parser version '${SUPPORTED_PARSER_VERSION}' (major version mismatch)`,
      },
    };
  }

  // Check parser version major
  const manifestParserMajor = manifest.parser_version.split(".")[0];
  if (manifestParserMajor !== parserMajor) {
    return {
      compatible: false,
      conflict: {
        conflict_type: "version_mismatch",
        details: `Manifest parser version '${manifest.parser_version}' is incompatible with server parser version '${SUPPORTED_PARSER_VERSION}' (major version mismatch)`,
      },
    };
  }

  return { compatible: true };
}
