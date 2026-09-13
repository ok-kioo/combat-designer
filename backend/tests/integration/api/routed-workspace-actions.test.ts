import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiServer } from '../../../src/infrastructure/http/server.js';
describe('Routed workspace management authorization', () => {
  const server = new ApiServer({ port: 3598 }); const base = 'http://127.0.0.1:3598';
  let owner: string; let outsider: string; let workspaceId: string;
  const call = (path: string, token: string, method = 'GET', data?: unknown) => fetch(base + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  beforeAll(async () => {
    await server.listen();
    const register = async (username: string) => (await (await call('/api/auth/register', '', 'POST', { username, password: 'SecurePass123!' })).json()).access_token;
    owner = await register('routing_owner'); outsider = await register('routing_outsider');
    workspaceId = (await (await call('/api/workspaces', owner, 'POST', { name: 'Original' })).json()).id;
  });
  afterAll(async () => server.close());
  it('renames only owned projects and ignores payload ownership changes', async () => {
    const response = await call('/api/workspaces/' + workspaceId, owner, 'PATCH', { name: 'Renamed', owner_user_id: 'attacker' });
    expect(response.status).toBe(200); const value = await response.json(); expect(value.name).toBe('Renamed'); expect(value.owner_user_id).not.toBe('attacker');
    expect((await call('/api/workspaces/' + workspaceId, outsider, 'PATCH', { name: 'Stolen' })).status).toBe(404);
    expect((await call('/api/workspaces/' + workspaceId, owner, 'PATCH', { name: ' ' })).status).toBe(400);
  });
  it('creates characters within authorized workspace and rejects malformed/cross-scope input', async () => {
    const path = '/api/workspaces/' + workspaceId + '/characters';
    const response = await call(path, owner, 'POST', { name: 'Ryu', workspace_id: 'other', metadata: { archetype: 'Shoto' } });
    expect(response.status).toBe(201); const value = await response.json(); expect(value.workspace_id).toBe(workspaceId);
    expect((await call(path, outsider, 'POST', { name: 'Injected' })).status).toBe(404);
    expect((await call(path, owner, 'POST', { name: '' })).status).toBe(400);
    expect((await call(path, '', 'POST', { name: 'Anonymous' })).status).toBe(401);
    const listing = await (await call(path, owner)).json(); expect(listing.characters).toHaveLength(1);
  });
  it('archived workspace rejects new edits', async () => {
    await call('/api/workspaces/' + workspaceId + '/archive', owner, 'PUT');
    expect((await call('/api/workspaces/' + workspaceId, owner, 'PATCH', { name: 'Nope' })).status).toBe(409);
    expect((await call('/api/workspaces/' + workspaceId + '/characters', owner, 'POST', { name: 'Nope' })).status).toBe(409);
  });
});
