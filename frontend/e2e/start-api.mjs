import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const output = new URL('../../backend/dist/test-api.mjs', import.meta.url);
await build({ entryPoints: [fileURLToPath(new URL('../../backend/src/infrastructure/http/server.ts', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'error' });
const { ApiServer } = await import(output.href);
const server = new ApiServer({ port: Number(process.env.TEST_API_PORT || 3101) });
await server.listen();
process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
