import { createContext, useContext, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useResource, Loading, ErrorState } from '../../shared/ui/Resource';
import type { Workspace } from '../../features/project-workspace/types/product';
export const workspaceNavigation = [ ['', 'Visão Geral'], ['characters', 'Personagens'], ['attacks', 'Golpes'], ['combos', 'Combos'], ['analysis', 'Análises'], ['simulation', 'Simulação'], ['director', 'Combat Director'], ['import', 'Importar Dados'], ['help', 'Ajuda'] ] as const;
interface Context { workspace: Workspace; base: string; apiPath: string; selectedAttacks: string[]; setSelectedAttacks: (ids: string[]) => void }
const WorkspaceContext = createContext<Context | null>(null);
export function useWorkspace() { const value = useContext(WorkspaceContext); if (!value) throw new Error('Missing workspace context'); return value; }
export function WorkspaceLayout() {
  const { workspaceId } = useParams();
  // Remount context only when the route's resource identity changes.
  return <WorkspaceScope key={workspaceId} workspaceId={workspaceId!} />;
}
function WorkspaceScope({ workspaceId }: { workspaceId: string }) {
  const base = '/workspaces/' + encodeURIComponent(workspaceId);
  const apiPath = '/api' + base;
  const value = useResource<Workspace>(apiPath);
  const [selectedAttacks, setSelectedAttacks] = useState<string[]>([]);
  const location = useLocation();
  const tail = location.pathname.slice(base.length + 1).split('/')[0];
  const label = workspaceNavigation.find(([path]) => path === tail)?.[1] || 'Visão Geral';
  if (value.loading) return <Loading label="Carregando projeto…" />;
  if (value.error || !value.data) return <ErrorState message="Este projeto não está disponível ou você não possui acesso." retry={value.reload} />;
  if (value.data.status === 'archived') return <section className="state"><h1>Projeto arquivado</h1><p>O histórico foi preservado. Este projeto está indisponível para edição.</p><Link to="/workspaces">Voltar a Meus Projetos</Link></section>;
  return <WorkspaceContext.Provider value={{ workspace: value.data, base, apiPath, selectedAttacks, setSelectedAttacks }}><div className="workspace-layout"><aside className="sidebar"><p className="eyebrow">PROJETO</p><h2>{value.data.name}</h2><nav aria-label="Navegação do projeto">{workspaceNavigation.map(([path, title]) => <NavLink key={path} to={base + (path ? '/' + path : '')} end={!path}>{title}</NavLink>)}</nav></aside><div className="workspace-content"><nav className="breadcrumbs" aria-label="Caminho"><Link to="/workspaces">Meus Projetos</Link><span aria-hidden="true">/</span><Link to={base}>{value.data.name}</Link>{tail && <><span aria-hidden="true">/</span><span>{label}</span></>}</nav><div className="page-outlet" key={location.pathname}><Outlet /></div></div></div></WorkspaceContext.Provider>;
}
