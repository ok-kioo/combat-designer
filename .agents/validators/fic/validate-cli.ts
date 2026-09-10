import path from "node:path";
import { validateFicFile, validateFicRegistry } from "../../../backend/dist/modules/fic/domain/entity/validator.js";

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

  const runtimeFics = summary.results.filter(
    (r) => !r.filePath?.endsWith("template.yaml") && r.data?.feature_id !== "example-feature-001"
  );
  const templateFics = summary.results.filter(
    (r) => r.filePath?.endsWith("template.yaml") || r.data?.feature_id === "example-feature-001"
  );

  console.log(`Found ${summary.total} FIC(s) (${runtimeFics.length} runtime FICs, ${templateFics.length} template).`);
  let hasFailures = false;

  for (const res of summary.results) {
    const isTemplate = res.filePath?.endsWith("template.yaml") || res.data?.feature_id === "example-feature-001";
    const tag = isTemplate ? " [template]" : "";
    if (res.valid) {
      console.log(`  \x1b[32m✔\x1b[0m ${res.data?.feature_id}${tag} (${res.filePath})`);
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

  const runtimeValidCount = runtimeFics.filter((r) => r.valid).length;
  console.log(`\n\x1b[32m[PASSED]\x1b[0m Runtime FICs: ${runtimeValidCount}/${runtimeFics.length} valid. Template: ${templateFics.length} valid (not counted as runtime SPEC). All ${summary.total} files valid.`);
  process.exit(0);
}

main();
