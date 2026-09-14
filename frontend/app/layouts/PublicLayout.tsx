import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';
export function PublicHeader() {
  const auth = useAuth(); const navigate = useNavigate();
  return <header className="topbar"><Link className="brand" to="/">⚔ Combat Designer <span>WORKBENCH</span></Link><nav aria-label="Conta">{auth.user ? <><Link to="/workspaces">Meus Projetos</Link><span className="user-name">{auth.user.display_name || auth.user.username}</span><button type="button" className="quiet" onClick={async () => { await auth.logout().catch(() => {}); navigate('/'); }}>Sair</button></> : <><Link to="/login">Entrar</Link><Link className="button" to="/register">Criar conta</Link></>}</nav></header>;
}
export function PublicLayout() { return <><a className="skip-link" href="#main">Pular para conteúdo</a><PublicHeader /><main id="main" className="public-main"><Outlet /></main></>; }
export function AuthLayout() { return <div className="auth-layout"><Outlet /></div>; }
