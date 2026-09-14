import { test, expect } from '@playwright/test';

test('Combat Director renders received and reloaded Markdown safely in bounded history', async ({ page, request }) => {
  const user = await (await request.post('/api/auth/register', { data: { username: 'md_' + crypto.randomUUID().slice(0, 12), password: 'MarkdownTest123!' } })).json();
  const workspace = await (await request.post('/api/workspaces', { headers: { Authorization: 'Bearer ' + user.access_token }, data: { name: 'Markdown Arena' } })).json();
  await page.addInitScript(user => { localStorage.setItem('cd_access_token', user.access_token); localStorage.setItem('cd_refresh_token', user.refresh_token); }, user);
  const source = 'Um **stun de 1,5 segundo (90 frames a 60 FPS)** é uma janela extremamente longa.\n\n### 1. Impacto no Frame Data e Neutro\n\n* **Conversão de Frames:** 1,5s = **90 frames**\n* **Janela de Punição:** 90 frames\n\n---\n\n### 2. Riscos de Balanceamento\n\n*italic* e ~~strikethrough~~\n\n1. Primeiro\n2. Segundo\n\n> Evidência\n\n`inline code`\n\n```json\n{\n  "example": true\n}\n```\n\n[OpenAI](https://openai.com)\n\n| Golpe | Startup | Recovery |\n|---|---:|---:|\n| Jab | 5 | 12 |\n\n<script>window.markdownExploit = true</script>\n\n<img src=x onerror="window.markdownExploit=true">\n\n[click](javascript:alert(1))';
  const messages = Array.from({ length: 12 }, (_, i) => ({ id: String(i), role: 'assistant', content: source }));
  await page.route('**/api/workspaces/*/conversations', route => route.fulfill({ json: { conversations: [{ id: 'md-test', title: 'Markdown regression' }] } }));
  await page.route('**/conversations/md-test/messages', route => route.fulfill({ json: { messages } }));
  await page.route('**/api/workspaces/*/chat', async route => {
    const prompt = route.request().postDataJSON().prompt;
    messages.push({ id: 'user', role: 'user', content: prompt }, { id: 'reply', role: 'assistant', content: source });
    await route.fulfill({ json: { reply: source, conversation_id: 'md-test' } });
  });
  await page.goto('/workspaces/' + workspace.id + '/director?conversation=md-test');
  const history = page.getByRole('log');
  await expect(history.locator('.assistant')).toHaveCount(12);
  await history.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await page.getByLabel('Mensagem', { exact: true }).fill('**texto**');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(history.locator('.assistant')).toHaveCount(13);
  expect(await history.evaluate(el => el.scrollTop)).toBe(0);
  await expect(history.locator('.user p')).toHaveText('**texto**');
  const reply = history.locator('.assistant').last();
  await expect(reply.locator('h3')).toHaveCount(2);
  await expect(reply.locator('hr')).toHaveCount(1);
  await expect(reply.locator('ul li')).toHaveCount(2);
  await expect(reply.locator('ol li')).toHaveCount(2);
  await expect(reply.locator('em')).toHaveText('italic');
  await expect(reply.locator('blockquote')).toContainText('Evidência');
  await expect(reply.locator('pre code')).toHaveText('{\n  "example": true\n}\n');
  await expect(reply.getByRole('link', { name: 'OpenAI' })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(reply.locator('table tbody tr')).toHaveCount(1);
  await expect(history.locator('script, iframe, img, object, embed, [onclick], [onerror], a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { markdownExploit?: boolean }).markdownExploit)).toBeUndefined();
  await page.reload();
  await expect(history.locator('.assistant')).toHaveCount(13);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await history.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await history.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await reply.locator('pre code').evaluate(el => { el.textContent += '\n' + 'frame_data_'.repeat(80); });
    await reply.locator('td').first().evaluate(el => { el.style.whiteSpace = 'nowrap'; el.textContent = 'LongAttackName'.repeat(50); });
    expect(await reply.locator('pre').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await reply.locator('.markdown-table-scroll').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('Mensagem', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeInViewport();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await history.evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/combat-director-markdown.png', fullPage: true });
  await history.evaluate(el => { el.scrollTop = 640; });
  await page.screenshot({ path: '/tmp/combat-director-markdown-details.png', fullPage: true });
});
