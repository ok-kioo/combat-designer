/** Transport shell only. React Router owns every product route. */
export function applicationShell(publicApiUrl = ''): string {
  const config = JSON.stringify(publicApiUrl).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Combat Designer</title><link rel="stylesheet" href="/assets/app.css"></head><body><div id="root"><p role="status">Inicializando Combat Designer…</p></div><script>window.__API_URL__=${config};</script><script type="module" src="/assets/app.js"></script></body></html>`;
}
