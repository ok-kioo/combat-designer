export interface IngestionLimits {
  maxBundleSizeBytes: number;
  maxFileSizeBytes: number;
  maxFileCount: number;
  maxYamlDepth: number;
  maxExtractedObjects: number;
  maxStringSizeBytes: number;
}

export const DEFAULT_INGESTION_LIMITS: IngestionLimits = {
  maxBundleSizeBytes: 10 * 1024 * 1024, // 10MB
  maxFileSizeBytes: 5 * 1024 * 1024,    // 5MB
  maxFileCount: 500,
  maxYamlDepth: 30,
  maxExtractedObjects: 1000,
  maxStringSizeBytes: 64 * 1024,        // 64KB
};
