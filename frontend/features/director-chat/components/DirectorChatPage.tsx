import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../shared/auth/AuthProvider';
import { useWorkspace } from '../../../app/layouts/WorkspaceLayout';
import { useResource, Resource, Loading, ErrorState } from '../../../shared/ui/Resource';
import { ChatMessage } from './MarkdownMessage';
interface Conversation { id: string; title: string }
interface Message { id?: string; role: string; content: string }
export function DirectorChat() {
  const { apiPath, selectedAttacks } = useWorkspace(); const { api } = useAuth();
  const [params, setParams] = useSearchParams(); const conversationId = params.get('conversation');
  const conversations = useResource<{ conversations: Conversation[] }>(apiPath + '/conversations');
  const [messages, setMessages] = useState<Message[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [text, setText] = useState(''); const [attempt, setAttempt] = useState(0);
  const history = useRef<HTMLDivElement>(null); const nearEnd = useRef(true); const generation = useRef(0); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    const run = ++generation.current; const abort = new AbortController(); setError(''); setMessages([]); setLoading(!!conversationId); nearEnd.current = true;
    if (conversationId) api.request<{ messages: Message[] }>(apiPath + '/conversations/' + encodeURIComponent(conversationId) + '/messages', { signal: abort.signal }).then(data => { if (run === generation.current) { setMessages(data.messages); setLoading(false); } }, () => { if (!abort.signal.aborted && run === generation.current) { setError('Não foi possível carregar esta conversa.'); setLoading(false); } });
    return () => abort.abort();
  }, [api, apiPath, conversationId, attempt]);
  useEffect(() => { if (nearEnd.current && history.current) history.current.scrollTop = history.current.scrollHeight; }, [messages, loading]);
  async function send(event: FormEvent) {
    event.preventDefault(); if (busy || !text.trim() || loading) return;
    const prompt = text.trim(); const run = generation.current; setBusy(true); setError('');
    try {
      // Explicitly create a conversation: never let backend choose an arbitrary old conversation.
      let id = conversationId;
      if (!id) { const created = await api.request<Conversation>(apiPath + '/conversations', { method: 'POST', body: JSON.stringify({ title: prompt.slice(0, 80) }) }); id = created.id; }
      const result = await api.request<{ reply: string; conversation_id: string }>(apiPath + '/chat', { method: 'POST', body: JSON.stringify({ prompt, context: { conversation_id: id, selected_attack_ids: selectedAttacks } }) });
      if (mounted.current && run === generation.current) {
        setText('');
        if (!conversationId) { setParams({ conversation: result.conversation_id || id }, { replace: true }); conversations.reload(); }
        else setMessages(previous => [...previous, { role: 'user', content: prompt }, { role: 'assistant', content: result.reply }]);
      }
    } catch { if (mounted.current && run === generation.current) setError('Não foi possível enviar. Seu texto foi preservado; tente novamente.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section data-page="director" className="director-page"><h1>Combat Director</h1><p className="muted">{selectedAttacks.length} golpe(s) selecionados no contexto</p><div className="director-layout"><aside className="conversations"><button disabled={busy} onClick={() => setParams({})}>Nova conversa</button><Resource value={conversations} label="Não foi possível carregar as conversas.">{data => <nav aria-label="Conversas">{data.conversations.map(c => <Link aria-current={c.id === conversationId ? 'page' : undefined} key={c.id} to={'?conversation=' + encodeURIComponent(c.id)}>{c.title}</Link>)}{!data.conversations.length && <p>Nenhuma conversa ainda.</p>}</nav>}</Resource></aside><div className="chat"><div className="chat-messages" ref={history} aria-label="Histórico da conversa" role="log" aria-live="polite" onScroll={() => { const el = history.current!; nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64; }}>{loading ? <Loading /> : messages.length ? messages.map((message, i) => <ChatMessage key={message.id || i} role={message.role} content={message.content} />) : <div className="state"><h2>O que vamos explorar?</h2><p>Peça uma análise de golpe, investigue um combo ou compare oportunidades de balanceamento.</p></div>}</div>{error && <ErrorState message={error} retry={() => setAttempt(n => n + 1)} />}<form className="chat-composer" onSubmit={send}><label className="composer-label">Mensagem<textarea value={text} onChange={e => setText(e.target.value)} required maxLength={8000} rows={2} placeholder="Pergunte sobre seu combate…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /></label><button className="primary" disabled={busy || loading || !text.trim()}>{busy ? 'Analisando…' : 'Enviar'}</button></form></div></div></section>;
}
