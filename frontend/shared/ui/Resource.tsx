import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
export function useResource<T>(path: string) {
  const { api } = useAuth();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ path: string; data?: T; error?: Error; loading: boolean }>({ path, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ path, loading: true });
    api.request<T>(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ path, data, loading: false });
    }, error => { if (!controller.signal.aborted) setState({ path, error, loading: false }); });
    return () => controller.abort();
  }, [api, path, revision]);
  return { ...(state.path === path ? state : { path, data: undefined, error: undefined, loading: true }), reload: () => setRevision(n => n + 1) };
}
export function Loading({ label = 'Carregando…' }: { label?: string }) { return <div className="state" role="status">{label}</div>; }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="state error" role="alert"><p>{message}</p>{retry && <button onClick={retry}>Tentar novamente</button>}</div>; }
export function Resource<T>({ value, children, label }: { value: ReturnType<typeof useResource<T>>; children: (data: T) => ReactNode; label: string }) {
  if (value.loading) return <Loading />;
  if (value.error || value.data === undefined) return <ErrorState message={label} retry={value.reload} />;
  return children(value.data);
}
export function Empty({ children }: { children: ReactNode }) { return <div className="state empty">{children}</div>; }
