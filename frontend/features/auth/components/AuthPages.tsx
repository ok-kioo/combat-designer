import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/auth/AuthProvider';
import { getSafeReturnTo } from '../../../shared/navigation/return-to';
export function LoginPage() { return <AuthForm register={false} />; }
export function RegisterPage() { return <AuthForm register />; }
function AuthForm({ register }: { register: boolean }) {
  const auth = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [visible, setVisible] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget); setError(''); setBusy(true);
    try {
      await auth.login({ username: String(data.get('username')).trim(), password: String(data.get('password')), ...(register ? { display_name: String(data.get('display_name')).trim() } : {}) }, register);
      navigate(getSafeReturnTo(location.search) ?? '/workspaces', { replace: true });
    } catch {
      setError(register ? 'Não foi possível criar a conta. Confira os dados e os requisitos de senha.' : 'Não foi possível entrar. Confira suas credenciais e tente novamente.');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { setBusy(false); }
  }
  return <section className="auth-card" data-page={register ? 'register' : 'login'}><p className="eyebrow">COMBAT DESIGNER</p><h1>{register ? 'Crie sua conta' : 'Entre no seu workbench'}</h1><p className="muted">{register ? 'Comece a explorar o potencial do seu combate.' : 'Continue de onde seu projeto parou.'}</p><form onSubmit={submit} aria-busy={busy}><label>Nome de usuário<input name="username" autoComplete="username" required autoFocus maxLength={64} /></label>{register && <label>Como podemos chamar você?<input name="display_name" autoComplete="nickname" maxLength={100} /></label>}<div><label htmlFor="auth-password">Senha</label><div className="password-field"><input id="auth-password" name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : undefined} aria-describedby={register ? 'password-help' : undefined} /><button className="quiet" type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button></div></div>{register && <p id="password-help" className="muted">Use pelo menos 8 caracteres, uma maiúscula, um número e um símbolo.</p>}{error && <p className="error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}<button type="submit" className="primary" disabled={busy}>{busy ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}</button></form><p>{register ? 'Já tem uma conta? ' : 'Primeiro acesso? '}<Link to={(register ? '/login' : '/register') + location.search}>{register ? 'Entrar' : 'Criar conta'}</Link></p></section>;
}
