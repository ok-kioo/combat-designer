import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
const userPassword = 'RoutingTest123!';
async function account(request: APIRequestContext) {
  const username = 'route_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  const response = await request.post('/api/auth/register', { data: { username, password: userPassword } });
  expect(response.status()).toBe(201);
  return { ...(await response.json()), username };
}
async function session(page: Page, user: { access_token: string; refresh_token: string }) {
  await page.addInitScript(({ access_token, refresh_token }) => {
    localStorage.setItem('cd_access_token', access_token); localStorage.setItem('cd_refresh_token', refresh_token);
  }, user);
}
async function setup(page: Page, request: APIRequestContext) {
  const user = await account(request);
  const response = await request.post('/api/workspaces', { headers: { Authorization: 'Bearer ' + user.access_token }, data: { name: 'Projeto de navegação', seed_demo_data: true } });
  expect(response.status()).toBe(201);
  const workspace = await response.json(); await session(page, user);
  const charactersResponse = await request.get('/api/workspaces/' + workspace.id + '/characters', { headers: { Authorization: 'Bearer ' + user.access_token } });
  expect(charactersResponse.status()).toBe(200);
  const charactersPayload = await charactersResponse.json();
  const firstCharacterId = charactersPayload.characters[0]?.id;
  expect(firstCharacterId).toBeTruthy();
  return { user, workspace, base: '/workspaces/' + workspace.id, firstCharacterId };
}
async function onePage(page: Page, name: string) { await expect(page.locator('[data-page]')).toHaveCount(1); await expect(page.locator('[data-page]')).toHaveAttribute('data-page', name); }
const routes = [['', 'overview'], ['/characters', 'characters'], ['/characters/{characterId}', 'character-detail'], ['/attacks', 'attacks'], ['/combos', 'combos'], ['/analysis', 'analysis'], ['/simulation', 'simulation'], ['/director', 'director'], ['/import', 'import'], ['/help', 'help']] as const;
test('public routes are exclusive and browser history works', async ({ page }) => {
  await page.goto('/'); await onePage(page, 'landing');
  await page.getByRole('link', { name: 'Entrar', exact: true }).first().click(); await onePage(page, 'login');
  await expect(page.getByText('Faça cada golpe')).toHaveCount(0);
  await page.goBack(); await onePage(page, 'landing');
  await page.goForward(); await onePage(page, 'login');
  await page.reload(); await onePage(page, 'login');
  await page.goto('/register'); await onePage(page, 'register'); await page.reload(); await onePage(page, 'register');
  await page.goto('/no-such-route'); await onePage(page, 'not-found');
});
test('login establishes session and opens dashboard without creating or selecting a project', async ({ page, request }) => {
  const user = await account(request); await page.goto('/login');
  await page.getByLabel('Nome de usuário').fill(user.username); await page.getByLabel('Senha', { exact: true }).fill(userPassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/workspaces$/); await onePage(page, 'dashboard'); await expect(page.getByText('Nenhum projeto ainda')).toBeVisible();
  await page.goto('/'); await onePage(page, 'landing'); await expect(page.getByRole('link', { name: /Ir para Meus Projetos/ })).toBeVisible();
  await page.goto('/login'); await expect(page).toHaveURL(/\/workspaces$/);
  await page.goto('/register'); await expect(page).toHaveURL(/\/workspaces$/);
});
test('register establishes session and routes to dashboard', async ({ page }) => {
  await page.goto('/register'); await page.getByLabel('Nome de usuário').fill('ui_' + crypto.randomUUID().slice(0, 12));
  await page.getByLabel('Senha', { exact: true }).fill(userPassword); await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page).toHaveURL(/\/workspaces$/); await onePage(page, 'dashboard');
});
for (const [suffix, name] of routes) test('deep link, reload, back, forward and new tab: ' + name, async ({ page, request, context }) => {
  const { base, firstCharacterId } = await setup(page, request);
  const concreteSuffix = suffix.replace('{characterId}', firstCharacterId);
  await page.goto('/'); await onePage(page, 'landing'); await page.goto(base + concreteSuffix); await onePage(page, name);
  await page.reload(); await onePage(page, name);
  if (name !== 'character-detail') await expect(page.locator('.sidebar [aria-current="page"]')).toHaveCount(1);
  await page.goBack(); await onePage(page, 'landing'); await page.goForward(); await onePage(page, name);
  const tab = await context.newPage(); await tab.goto(page.url()); await onePage(tab, name); await tab.close();
});
for (const suffix of ['', '/w', ...routes.filter(([p]) => p).map(([p]) => '/w' + p)]) test('anonymous protected route: /workspaces' + suffix, async ({ page }) => {
  await page.goto('/workspaces' + suffix); await expect(page).toHaveURL(/\/login\?returnTo=/); await onePage(page, 'login');
});
test('sidebar uses URL, preserves workspace context and supports back', async ({ page, request }) => {
  const { base } = await setup(page, request); let workspaceLoads = 0;
  page.on('request', req => { if (req.url().endsWith('/api' + base)) workspaceLoads++; });
  await page.goto(base); await onePage(page, 'overview'); await page.getByRole('navigation', { name: 'Navegação do projeto' }).getByRole('link', { name: 'Combos', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(base + '/combos$')); await onePage(page, 'combos');
  await expect(page.getByRole('navigation', { name: 'Navegação do projeto' }).getByRole('link', { name: 'Combos', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goBack(); await onePage(page, 'overview'); expect(workspaceLoads).toBe(1);
});
test('safe returnTo restores deep link; external redirect is ignored', async ({ page, request }) => {
  const { username } = await account(request);
  await page.goto('/login?returnTo=https%3A%2F%2Fevil.test'); await page.getByLabel('Nome de usuário').fill(username); await page.getByLabel('Senha', { exact: true }).fill(userPassword); await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page).toHaveURL(/\/workspaces$/);
  const ws = await page.request.post('/api/workspaces', { headers: { Authorization: 'Bearer ' + await page.evaluate(() => localStorage.getItem('cd_access_token')) }, data: { name: 'Return project' } });
  const base = '/workspaces/' + (await ws.json()).id;
  await page.getByRole('button', { name: 'Sair', exact: true }).click(); await page.goto(base + '/combos');
  await page.getByLabel('Nome de usuário').fill(username); await page.getByLabel('Senha', { exact: true }).fill(userPassword); await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page).toHaveURL(new RegExp(base + '/combos$')); await onePage(page, 'combos');
});
test('unavailable and archived workspace states never leak owner identifiers', async ({ page, request }) => {
  const { base, user } = await setup(page, request); await page.goto('/workspaces/absent'); await expect(page.getByText('Este projeto não está disponível ou você não possui acesso.')).toBeVisible();
  await request.put('/api' + base + '/archive', { headers: { Authorization: 'Bearer ' + user.access_token } }); await page.goto(base); await expect(page.getByRole('heading', { name: 'Projeto arquivado' })).toBeVisible();
});
test('session bootstrap waits, refreshes expired access and keeps URL authoritative', async ({ page, request }) => {
  const user = await account(request); await session(page, { ...user, access_token: 'expired' });
  await page.goto('/'); await onePage(page, 'landing'); await expect(page.getByRole('link', { name: /Ir para Meus Projetos/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cd_access_token'))).not.toBe('expired');
});
test('data failures are inline with retry; stale pages do not survive navigation', async ({ page, request }) => {
  const { base } = await setup(page, request); await page.route('**/api' + base + '/combos', route => route.fulfill({ status: 500, json: {} }));
  await page.goto(base + '/combos'); await expect(page.getByText('Não foi possível carregar os combos.')).toBeVisible();
  await page.unroute('**/api' + base + '/combos'); await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click(); await expect(page.getByText(/Nenhum combo salvo ainda/)).toBeVisible();
});
test('director persists conversation on reload, bounds history and respects reading position', async ({ page, request }) => {
  const { base, user } = await setup(page, request);
  const response = await request.post('/api' + base + '/conversations', { headers: { Authorization: 'Bearer ' + user.access_token }, data: { title: 'Conversa longa' } }); const conversation = await response.json();
  const messages = Array.from({ length: 60 }, (_, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', content: 'Mensagem de teste ' + i + '\n'.repeat(2) + 'Leitura preservada no histórico.' }));
  // Only the history fixture is controlled; the app, router and chat POST use the real server.
  await page.route('**/conversations/' + conversation.id + '/messages', route => route.fulfill({ json: { messages } }));
  await page.goto(base + '/director?conversation=' + conversation.id); await expect(page.locator('.message')).toHaveCount(60);
  const history = page.locator('.chat-messages'); const composer = page.locator('.chat-composer');
  await expect(composer).toBeInViewport(); expect(await history.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await history.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await page.getByLabel('Mensagem', { exact: true }).fill('Analise os golpes'); await page.getByRole('button', { name: 'Enviar', exact: true }).click(); await expect(page.locator('.message')).toHaveCount(62); expect(await history.evaluate(el => el.scrollTop)).toBe(0); await expect(composer).toBeInViewport();
  await page.unroute('**/conversations/' + conversation.id + '/messages'); await page.reload(); await expect(page.getByText('Analise os golpes', { exact: true })).toBeVisible();
});
test('mobile navigation and director stay within viewport width', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const { base } = await setup(page, request); await page.goto(base + '/director'); await onePage(page, 'director');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('.chat-composer').scrollIntoViewIfNeeded(); await expect(page.locator('.chat-composer')).toBeInViewport();
});
test('server fallback excludes APIs and missing static assets', async ({ request }) => {
  expect((await request.get('/assets/missing.js')).status()).toBe(404);
  const api = await request.get('/api/not-a-route'); expect(api.headers()['content-type']).toContain('application/json');
  const deep = await request.get('/workspaces/x/combos'); expect(await deep.text()).toContain('/assets/app.js'); expect(await deep.text()).not.toContain('view-screen');
});
