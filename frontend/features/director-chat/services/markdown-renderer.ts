import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownMessage } from '../components/MarkdownMessage';

/** Compatibility adapter for the legacy controller, using the canonical renderer. */
export class MarkdownRenderer {
  render(markdown: string): string {
    return renderToStaticMarkup(createElement(MarkdownMessage, { content: markdown }));
  }
}

export class StreamingMarkdownBuffer {
  private accumulated = '';
  private readonly renderer = new MarkdownRenderer();
  appendChunk(chunk: string): void { this.accumulated += chunk; }
  getRaw(): string { return this.accumulated; }
  getRendered(): string { return this.renderer.render(this.accumulated); }
  complete(): string { return this.getRendered(); }
  reset(): void { this.accumulated = ''; }
}
