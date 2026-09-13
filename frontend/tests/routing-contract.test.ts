import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getSafeReturnTo } from '../shared/navigation/return-to';
import { applicationShell } from '../app/shell';
describe('Routed delivery architecture', () => {
  it('shell serves the React entry point without parallel screen trees', () => {
    const html = applicationShell('https://example.test/</script>');
    expect(html).toContain('/assets/app.js');
    expect(html).not.toMatch(/view-screen|view-landing|form-login|view-workspace|navigateTo/);
    expect(html).not.toContain('https://example.test/</script>');
    expect(readFileSync(new URL('../app/server.ts', import.meta.url), 'utf8')).not.toMatch(/<style>|<form|currentWorkspace|navigateTo/);
    const router = readFileSync(new URL('../app/router.tsx', import.meta.url), 'utf8');
    expect(router.match(/<Routes>/g)).toHaveLength(1);
    expect(readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8')).not.toMatch(/view-screen|view-auth|view-workspace/);
  });
  it.each(['/workspaces', '/workspaces/ws-123/combos', '/workspaces/ws-123/characters/ryu', '/workspaces/ws-123/attacks?character=ryu', '/workspaces/ws-123/director?conversation=c1'])('allows canonical internal return path %s', path => {
    expect(getSafeReturnTo('?returnTo=' + encodeURIComponent(path))).toBe(path);
  });
  it.each(['https://evil.test', '//evil.test', '/login', '/workspaces-evil', '/workspaces/w/unknown', '/workspaces/w/../../login', '/workspaces/evil%2fcombos%2f../../login', '/workspaces/\\evil', '/workspaces/%5cevil', 'javascript:alert(1)', '/workspaces/w\n'])('rejects unsafe or unknown return path %s', path => {
    expect(getSafeReturnTo('?returnTo=' + encodeURIComponent(path))).toBeNull();
  });
});
