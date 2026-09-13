import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(root + 'dist/assets', { recursive: true });
await build({ absWorkingDir: root, entryPoints: ['app/bootstrap.tsx'], bundle: true, outdir: 'dist/assets', entryNames: 'app', format: 'esm', target: ['es2022'], jsx: 'automatic', minify: true, sourcemap: true, define: { 'process.env.NODE_ENV': '"production"' } });
await copyFile(root + 'features/ingestion/assets/CombatDesignerExporter.cs', root + 'dist/assets/CombatDesignerExporter.cs');
