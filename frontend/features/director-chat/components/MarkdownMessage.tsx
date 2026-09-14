import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useInRouterContext } from 'react-router-dom';

/** Untrusted source becomes React elements; raw HTML is never enabled. */
export function MarkdownMessage({ content }: { content: string }) {
  const inRouter = useInRouterContext();
  return <div className="chat-message-markdown"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => {
      if (!href) return <span>{children}</span>;
      const internal = /^[/?#]/.test(href) && !href.startsWith('//');
      if (internal && inRouter) return <Link to={href}>{children}</Link>;
      return <a href={href} target={internal ? undefined : '_blank'} rel={internal ? undefined : 'noopener noreferrer'}>{children}</a>;
    },
    img: ({ alt }) => <span>{alt}</span>,
    pre: ({ children }) => <pre tabIndex={0} aria-label="Bloco de código">{children}</pre>,
    table: ({ children }) => <div className="markdown-table-scroll" tabIndex={0} role="region" aria-label="Tabela da resposta"><table>{children}</table></div>,
  }}>{content}</ReactMarkdown></div>;
}

export function ChatMessage({ role, content }: { role: string; content: string }) {
  return <article className={'message ' + (role === 'user' ? 'user' : 'assistant')}>
    <strong>{role === 'user' ? 'Você' : 'Combat Director'}</strong>
    {role === 'assistant' ? <MarkdownMessage content={content} /> : <p>{content}</p>}
  </article>;
}
