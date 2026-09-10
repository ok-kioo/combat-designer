/**
 * Safe Markdown Renderer & Sanitizer for DirectorChat (SPEC 13).
 *
 * Capabilities:
 * - Parsing: headings (#, ##, ###), bold (**), italic (*), lists (- and 1.), code blocks (```),
 *   inline code (`), blockquotes (>), tables (| col |), and links ([text](url)).
 * - Strict Sanitization: Eliminates <script>, <iframe>, <embed>, <object>, event handlers (onload, onerror, onclick, etc.),
 *   and dangerous URL protocols (javascript:, vbscript:, data:).
 * - Streaming Buffering: Handles incomplete fences and blocks during streaming without visual degradation.
 */

export class MarkdownRenderer {
  /**
   * Sanitizes raw HTML text to prevent XSS injection.
   */
  public sanitize(html: string): string {
    // 1. Remove dangerous script, iframe, object, embed tags and contents
    let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
    clean = clean.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "");
    clean = clean.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "");

    // 2. Remove any remaining self-closing or unclosed dangerous tags
    clean = clean.replace(/<\/?(script|iframe|object|embed|meta|style|form|input|button|svg|img)\b[^>]*>/gi, "");

    // 3. Remove all on* event handler attributes (onclick, onerror, onload, onmouseover, etc.)
    clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");

    // 4. Remove dangerous javascript: / vbscript: / data: protocols in href and src
    clean = clean.replace(/(href|src)\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, 'href="#"');
    clean = clean.replace(/(href|src)\s*=\s*(?:'vbscript:[^']*'|"vbscript:[^"]*"|vbscript:[^\s>]+)/gi, 'href="#"');
    clean = clean.replace(/(href|src)\s*=\s*(?:'data:[^']*'|"data:[^"]*"|data:[^\s>]+)/gi, 'href="#"');

    return clean;
  }

  /**
   * Parses Markdown string to sanitized HTML.
   */
  public render(markdown: string): string {
    if (!markdown) return "";

    // 0. Pre-sanitize raw dangerous HTML elements
    let text = this.sanitize(markdown);

    // Escape raw remaining HTML entities
    text = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // 1. Code blocks (```code```)
    const codeBlocks: string[] = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const idx = codeBlocks.length;
      const langAttr = lang ? ` class="language-${lang}"` : "";
      codeBlocks.push(`<pre><code${langAttr}>${code.trim()}</code></pre>`);
      return `%%CODEBLOCK_${idx}%%`;
    });

    // Handle unclosed code fence gracefully
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*)$/g, (_match, lang, code) => {
      const idx = codeBlocks.length;
      const langAttr = lang ? ` class="language-${lang}"` : "";
      codeBlocks.push(`<pre><code${langAttr}>${code.trim()}</code></pre>`);
      return `%%CODEBLOCK_${idx}%%`;
    });

    // 2. Inline code (`code`)
    text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");

    // 3. Headings (#, ##, ###)
    text = text.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    text = text.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    text = text.replace(/^# (.*$)/gim, "<h1>$1</h1>");

    // 4. Blockquotes (> quote)
    text = text.replace(/^&gt;\s?(.*$)/gim, "<blockquote>$1</blockquote>");

    // 5. Bold and Italic
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // 6. Tables (| col | col |)
    text = this.renderTables(text);

    // 7. Unordered Lists (- item or * item)
    text = text.replace(/^\s*[-*]\s+(.*)$/gim, "<li>$1</li>");
    text = text.replace(/(<li>.*<\/li>(\n|$))+/g, (match) => `<ul>\n${match}</ul>\n`);

    // 8. Ordered Lists (1. item)
    text = text.replace(/^\s*\d+\.\s+(.*)$/gim, "<oli>$1</oli>");
    text = text.replace(/(<oli>.*<\/oli>(\n|$))+/g, (match) => {
      const replaced = match.replace(/<\/?oli>/g, (tag) => (tag === "<oli>" ? "<li>" : "</li>"));
      return `<ol>\n${replaced}</ol>\n`;
    });

    // 9. Links [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
      const trimmedUrl = url.trim().toLowerCase();
      if (
        trimmedUrl.startsWith("javascript:") ||
        trimmedUrl.startsWith("vbscript:") ||
        trimmedUrl.startsWith("data:")
      ) {
        return `<span>${label}</span>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // 10. Restore code blocks
    for (let i = 0; i < codeBlocks.length; i++) {
      text = text.replace(`%%CODEBLOCK_${i}%%`, codeBlocks[i]);
    }

    // 11. Convert consecutive newlines to paragraph breaks
    const paragraphs = text
      .split(/\n\n+/)
      .map((block) => {
        const trimmed = block.trim();
        if (
          trimmed.startsWith("<h1") ||
          trimmed.startsWith("<h2") ||
          trimmed.startsWith("<h3") ||
          trimmed.startsWith("<ul") ||
          trimmed.startsWith("<ol") ||
          trimmed.startsWith("<pre") ||
          trimmed.startsWith("<blockquote") ||
          trimmed.startsWith("<table")
        ) {
          return trimmed;
        }
        return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
      })
      .filter(Boolean);

    return this.sanitize(paragraphs.join("\n"));
  }

  private renderTables(text: string): string {
    const lines = text.split("\n");
    const result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("|") && line.endsWith("|")) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        tableRows.push(line);
      } else {
        if (inTable) {
          result.push(this.formatTable(tableRows));
          inTable = false;
          tableRows = [];
        }
        result.push(lines[i]);
      }
    }

    if (inTable) {
      result.push(this.formatTable(tableRows));
    }

    return result.join("\n");
  }

  private formatTable(rows: string[]): string {
    if (rows.length < 2) return rows.join("\n");

    const headerCells = rows[0]
      .slice(1, -1)
      .split("|")
      .map((c) => `<th>${c.trim()}</th>`)
      .join("");

    const bodyRows = rows.slice(2).map((row) => {
      const cells = row
        .slice(1, -1)
        .split("|")
        .map((c) => `<td>${c.trim()}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    });

    return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows.join("")}</tbody></table>`;
  }
}

/**
 * Streaming Markdown Buffer:
 * Buffers incoming stream chunks and safely handles incomplete formatting tags.
 */
export class StreamingMarkdownBuffer {
  private accumulated = "";
  private readonly renderer = new MarkdownRenderer();

  public appendChunk(chunk: string): void {
    this.accumulated += chunk;
  }

  public getRaw(): string {
    return this.accumulated;
  }

  public getRendered(): string {
    // Automatically close unclosed code blocks for safe preview rendering
    let preview = this.accumulated;
    const fenceCount = (preview.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      preview += "\n```";
    }
    return this.renderer.render(preview);
  }

  public complete(): string {
    return this.renderer.render(this.accumulated);
  }

  public reset(): void {
    this.accumulated = "";
  }
}
