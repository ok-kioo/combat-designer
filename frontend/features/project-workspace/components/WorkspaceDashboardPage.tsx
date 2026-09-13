import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../shared/auth/AuthProvider';
import { useResource, Resource, Empty } from '../../../shared/ui/Resource';
import type { Workspace } from '../types/product';
export function WorkspaceDashboard() {
  const { api } = useAuth(); const resource = useResource<Workspace[]>('/api/workspaces');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try { await api.request('/api/workspaces', { method: 'POST', body: JSON.stringify(Object.fromEntries(fields)) }); form.reset(); resource.reload(); }
    catch { setError('Não foi possível criar o projeto.'); } finally { setBusy(false); }
  }
  return <section className="dashboard" data-page="dashboard"><p className="eyebrow">SEU ESPAÇO DE DESIGN</p><h1>Meus Projetos</h1><p className="lead">Escolha um projeto para continuar ou comece uma nova ideia.</p><details className="card"><summary>Criar projeto</summary><form onSubmit={create}><label>Nome do projeto<input name="name" required maxLength={120} /></label><label>Descrição<textarea name="description" maxLength={1000} /></label><label>Engine<select name="engine"><option value="unity">Unity</option><option value="unreal">Unreal</option><option value="other">Outra</option></select></label>{error && <p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Criando…' : 'Criar projeto'}</button></form></details><Resource value={resource} label="Não foi possível carregar seus projetos.">{items => items.length ? <div className="cards">{items.map(workspace => <WorkspaceCard key={workspace.id} workspace={workspace} reload={resource.reload} />)}</div> : <Empty><h2>Nenhum projeto ainda</h2><p>Use “Criar projeto” acima para começar. Você decide quando importar seus dados.</p></Empty>}</Resource></section>;
}
function WorkspaceCard({ workspace: ws, reload }: { workspace: Workspace; reload: () => void }) {
  const { api } = useAuth(); const [editing, setEditing] = useState(false); const [name, setName] = useState(ws.name); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function mutate(archive = false) { setBusy(true); setError(''); try { await api.request('/api/workspaces/' + encodeURIComponent(ws.id) + (archive ? '/archive' : ''), { method: archive ? 'PUT' : 'PATCH', body: JSON.stringify(archive ? {} : { name }) }); setEditing(false); reload(); } catch { setError('Não foi possível atualizar o projeto.'); } finally { setBusy(false); } }
  return <article className="card"><span className="badge">{ws.engine || 'Unity'} · {ws.status === 'archived' ? 'Arquivado' : 'Ativo'}</span><h2>{ws.name}</h2><p>{ws.description || 'Seu próximo sistema de combate começa aqui.'}</p><p className="muted">Atualizado em {new Date(ws.updated_at).toLocaleDateString('pt-BR')}</p>{error && <p role="alert" className="error">{error}</p>}{editing && <form onSubmit={e => { e.preventDefault(); void mutate(); }}><label>Novo nome<input value={name} onChange={e => setName(e.target.value)} required maxLength={120} autoFocus /></label><button disabled={busy}>Salvar nome</button><button type="button" onClick={() => setEditing(false)}>Cancelar</button></form>}<div className="actions">{ws.status === 'active' && <><Link className="button primary" to={'/workspaces/' + encodeURIComponent(ws.id)}>Abrir projeto →</Link><button className="quiet" onClick={() => setEditing(true)}>Renomear</button><button className="quiet" disabled={busy} onClick={() => { if (confirm('Arquivar este projeto? O histórico será preservado.')) void mutate(true); }}>Arquivar</button></>}</div></article>;
}
