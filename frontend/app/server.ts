import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Node strip-types executes the transport directly; no browser code is imported here.
// @ts-ignore Node runtime requires the source extension.
import { applicationShell } from './shell.ts';

export function createFrontendServer(options: { apiUrl?: string; publicApiUrl?: string } = {}) {
  const apiUrl = options.apiUrl ?? process.env.API_URL ?? process.env.VITE_API_URL ?? 'http://localhost:3001';
  const shell = applicationShell(options.publicApiUrl ?? process.env.PUBLIC_API_URL ?? '');
  const assets = new Map([
    ['/assets/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/assets/app.css', ['app.css', 'text/css; charset=utf-8']],
    ['/assets/CombatDesignerExporter.cs', ['CombatDesignerExporter.cs', 'text/plain; charset=utf-8']],
  ]);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://frontend.local');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'LIVE', service: 'combat-designer-web' }));
      return;
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const target = new URL(url.pathname + url.search, apiUrl);
      const transport = target.protocol === 'https:' ? https : http;
      const proxy = transport.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, upstream => {
        res.writeHead(upstream.statusCode || 502, upstream.headers);
        upstream.pipe(res);
      });
      proxy.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'BAD_GATEWAY', message: 'Serviço temporariamente indisponível.' }));
      });
      req.pipe(proxy);
      return;
    }
    const asset = assets.get(url.pathname);
    if (asset && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        const bytes = await readFile(new URL('../dist/assets/' + asset[0], import.meta.url));
        res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch { res.writeHead(404); res.end('Asset not found. Run the frontend build.'); }
      return;
    }
    if (url.pathname.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(url.pathname) || !['GET', 'HEAD'].includes(req.method || '')) {
      res.writeHead(404); res.end('Not found'); return;
    }
    // History fallback, including unknown URLs handled by the client's explicit 404.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : shell);
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createFrontendServer().listen(port, () => console.log(`Combat Designer frontend: http://localhost:${port}`));
}
