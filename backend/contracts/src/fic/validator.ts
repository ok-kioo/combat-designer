import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import {
  FeatureImpactContractSchema,
  type FeatureImpactContract,
  SUPPORTED_CATEGORIES,
  type SupportedCategory,
} from "./schema.js";

export interface FicValidationResult {
  valid: boolean;
  filePath?: string;
  data?: FeatureImpactContract;
  errors: string[];
}

export function validateFicObject(obj: unknown, filePath?: string): FicValidationResult {
  if (!obj || typeof obj !== "object") {
    return {
      valid: false,
      filePath,
      errors: ["Invalid FIC: root must be a YAML/JSON object"],
    };
  }

  // Check top-level category keys if present against supported categories
  const rawObj = obj as Record<string, unknown>;
  const errors: string[] = [];

  // Check categories array if present
  if (Array.isArray(rawObj.categories)) {
    for (const cat of rawObj.categories) {
      if (typeof cat === "string" && !SUPPORTED_CATEGORIES.includes(cat as SupportedCategory)) {
        errors.push(`Unknown impact category '${cat}'. Must be one of: ${SUPPORTED_CATEGORIES.join(", ")}`);
      }
    }
  }

  const result = FeatureImpactContractSchema.safeParse(obj);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const fieldPath = issue.path.join(".");
      errors.push(`${fieldPath ? fieldPath + ": " : ""}${issue.message}`);
    }
    return {
      valid: false,
      filePath,
      errors,
    };
  }

  if (errors.length > 0) {
    return {
      valid: false,
      filePath,
      errors,
    };
  }

  return {
    valid: true,
    filePath,
    data: result.data,
    errors: [],
  };
}

export function validateFicYaml(yamlContent: string, filePath?: string): FicValidationResult {
  try {
    const parsed = yaml.parse(yamlContent);
    return validateFicObject(parsed, filePath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      filePath,
      errors: [`YAML parse error: ${message}`],
    };
  }
}

export function validateFicFile(filePath: string): FicValidationResult {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        filePath,
        errors: [`File does not exist: ${filePath}`],
      };
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return validateFicYaml(content, filePath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      filePath,
      errors: [`Error reading file ${filePath}: ${message}`],
    };
  }
}

export function validateFicRegistry(registryDir: string): {
  valid: boolean;
  total: number;
  results: FicValidationResult[];
} {
  if (!fs.existsSync(registryDir)) {
    return {
      valid: false,
      total: 0,
      results: [
        {
          valid: false,
          filePath: registryDir,
          errors: [`Registry directory does not exist: ${registryDir}`],
        },
      ],
    };
  }

  const files = fs
    .readdirSync(registryDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  const results: FicValidationResult[] = [];
  let allValid = true;

  for (const file of files) {
    const fullPath = path.join(registryDir, file);
    const result = validateFicFile(fullPath);
    results.push(result);
    if (!result.valid) {
      allValid = false;
    }
  }

  return {
    valid: allValid && results.length > 0,
    total: results.length,
    results,
  };
}
