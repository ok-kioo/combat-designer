#!/usr/bin/env node
import path from "node:path";
import { validateFicFile, validateFicRegistry } from "../../../backend/contracts/src/fic/validator.js";

function main() {
  const args = process.argv.slice(2);
  const targetPath = args[0];

  if (targetPath && targetPath !== "--all") {
    const resolvedPath = path.resolve(process.cwd(), targetPath);
    console.log(`Validating FIC file: ${resolvedPath}`);
    const res = validateFicFile(resolvedPath);
    if (!res.valid) {
      console.error(`\x1b[31m[FAILED]\x1b[0m FIC validation failed for ${targetPath}:`);
      for (const err of res.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
    console.log(`\x1b[32m[PASSED]\x1b[0m FIC ${res.data?.feature_id} is valid.`);
    process.exit(0);
  }

  // Default or --all: Validate the entire registry in .harness/docs/feature-impacts
  const defaultRegistryDir = path.resolve(process.cwd(), ".harness/docs/feature-impacts");
  console.log(`Validating all FICs in registry: ${defaultRegistryDir}`);
  const summary = validateFicRegistry(defaultRegistryDir);

  if (summary.total === 0) {
    console.error(`\x1b[31m[FAILED]\x1b[0m No FIC files found in ${defaultRegistryDir}`);
    process.exit(1);
  }

  console.log(`Found ${summary.total} FIC(s).`);
  let hasFailures = false;

  for (const res of summary.results) {
    if (res.valid) {
      console.log(`  \x1b[32m✔\x1b[0m ${res.data?.feature_id} (${res.filePath})`);
    } else {
      hasFailures = true;
      console.error(`  \x1b[31m✖\x1b[0m ${res.filePath}:`);
      for (const err of res.errors) {
        console.error(`      - ${err}`);
      }
    }
  }

  if (hasFailures || !summary.valid) {
    console.error(`\n\x1b[31m[FAILED]\x1b[0m One or more FICs are invalid.`);
    process.exit(1);
  }

  console.log(`\n\x1b[32m[PASSED]\x1b[0m All ${summary.total} FICs are valid.`);
  process.exit(0);
}

main();
