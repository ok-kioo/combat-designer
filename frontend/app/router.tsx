import { useRef } from 'react';
import { Navigate, Outlet, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthProvider';
import { Loading, ErrorState } from '../shared/ui/Resource';
import { PublicLayout, AuthLayout } from './layouts/PublicLayout';
import { WorkspaceLayout } from './layouts/WorkspaceLayout';
import { LandingPage } from '../features/landing/components/LandingPageView';
import { LoginPage, RegisterPage } from '../features/auth/components/AuthPages';
import { WorkspaceDashboard } from '../features/project-workspace/components/WorkspaceDashboardPage';
import { WorkspaceOverview } from '../features/project-workspace/components/WorkspaceOverviewPage';
import { CharacterWorkbench, CharacterDetail } from '../features/characters/components/CharacterWorkbenchPage';
import { AttackCatalog } from '../features/catalog/components/AttackCatalogPage';
import { ComboWorkbench } from '../features/combos/components/ComboWorkbenchPage';
import { AnalysisWorkbench } from '../features/analyses/components/AnalysisWorkbenchPage';
import { SimulationWorkbench } from '../features/simulation-workbench/components/SimulationWorkbenchPage';
import { DirectorChat } from '../features/director-chat/components/DirectorChatPage';
import { ImportPage } from '../features/ingestion/components/ImportPage';
import { HelpCenter } from '../features/help/components/HelpCenterPage';
export function RequireAuth() {
  const { status } = useAuth(); const location = useLocation();
  return status === 'authenticated' ? <Outlet /> : <Navigate to={'/login?returnTo=' + encodeURIComponent(location.pathname + location.search + location.hash)} replace />;
}
export function GuestOnlyRoute() {
  const { status } = useAuth();
  // Redirect sessions present on entry. A login completing here owns its safe returnTo redirect.
  const authenticatedOnEntry = useRef(status === 'authenticated');
  return authenticatedOnEntry.current ? <Navigate to="/workspaces" replace /> : <Outlet />;
}
function NotFound() { const navigate = useNavigate(); return <section className="state" data-page="not-found"><h1>404 — Página não encontrada</h1><p>Este endereço não corresponde a uma página do workbench.</p><div className="actions"><button onClick={() => navigate(-1)}>Voltar</button><Link to="/workspaces">Ir para Meus Projetos</Link></div></section>; }
/** The sole production route tree, also exercised by the served-app browser tests. */
export function AppRoutes() {
  const { status, retry } = useAuth();
  if (status === 'loading') return <Loading label="Restaurando sua sessão…" />;
  if (status === 'error') return <ErrorState message="Não foi possível verificar sua sessão." retry={retry} />;
  return <Routes><Route element={<PublicLayout />}><Route index element={<LandingPage />} /><Route element={<GuestOnlyRoute />}><Route element={<AuthLayout />}><Route path="login" element={<LoginPage />} /><Route path="register" element={<RegisterPage />} /></Route></Route><Route element={<RequireAuth />}><Route path="workspaces" element={<WorkspaceDashboard />} /><Route path="workspaces/:workspaceId" element={<WorkspaceLayout />}><Route index element={<WorkspaceOverview />} /><Route path="characters" element={<CharacterWorkbench />} /><Route path="characters/:characterId" element={<CharacterDetail />} /><Route path="attacks" element={<AttackCatalog />} /><Route path="combos" element={<ComboWorkbench />} /><Route path="analysis" element={<AnalysisWorkbench />} /><Route path="simulation" element={<SimulationWorkbench />} /><Route path="director" element={<DirectorChat />} /><Route path="import" element={<ImportPage />} /><Route path="help" element={<HelpCenter />} /></Route></Route><Route path="*" element={<NotFound />} /></Route></Routes>;
}
