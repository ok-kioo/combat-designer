import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMessage } from '../features/director-chat/components/MarkdownMessage';

const render = (content: string, role = 'assistant') => renderToStaticMarkup(<ChatMessage role={role} content={content} />);
describe('real chat message Markdown boundary', () => {
  it.each([
    ['**bold**', '<strong>bold</strong>'], ['### Título', '<h3>Título</h3>'],
    ['- item 1\n- item 2', '<li>item 2</li>'], ['---', '<hr/>'],
    ['`code`', '<code>code</code>'], ['*italic*', '<em>italic</em>'],
    ['~~removed~~', '<del>removed</del>'], ['1. item', '<ol>'],
    ['> quote', '<blockquote>'], ['| Golpe |\n|---|\n| Jab |', '<td>Jab</td>'],
  ])('renders %s', (source, expected) => expect(render(source)).toContain(expected));
  it('preserves fenced code whitespace', () => {
    expect(render('```json\n{\n  "example": true\n}\n```')).toContain('<code class="language-json">{\n  &quot;example&quot;: true\n}\n</code>');
  });
  it('renders safe links and rejects executable content', () => {
    expect(render('[OpenAI](https://openai.com)')).toContain('target="_blank" rel="noopener noreferrer"');
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src=x></iframe>\n\n[click](javascript:alert(1))');
    expect(html).not.toMatch(/<script|<img|<iframe|onerror=|href="javascript:/);
  });
  it('keeps user markup literal and escapes HTML', () => {
    const html = render('**texto** <script>alert(1)</script>', 'user');
    expect(html).toContain('**texto** &lt;script&gt;');
    expect(html).not.toContain('<strong>texto');
  });
  it('regresses the reported stun response', () => {
    const html = render('Um **stun de 1,5 segundo (90 frames a 60 FPS)** é uma janela extremamente longa.\n\n### 1. Impacto no Frame Data e Neutro\n\n* **Conversão de Frames:** 1,5s = **90 frames**\n* **Janela de Punição:** 90 frames\n\n---\n\n### 2. Riscos de Balanceamento');
    expect(html).toContain('<h3>1. Impacto'); expect(html).toContain('<ul>'); expect(html).toContain('<hr/>');
    expect(html).not.toMatch(/\*\*|###|---/);
  });
  it('tolerates incomplete streaming source', () => {
    expect(render('**Análise em')).toContain('Análise em');
    expect(render('**Análise em andamento**')).toContain('<strong>Análise em andamento</strong>');
  });
});
