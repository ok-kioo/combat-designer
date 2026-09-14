# Generated Markdown is untrusted presentation input

## Problem Pattern
An isolated parser test passes while the served chat inserts source text literally, or a second rendering path accepts generated HTML.

## General Principle
Persist source markup, sanitize/render at the presentation boundary, and never rely on raw HTML output from a model. Use a constrained established parser rather than regular expressions. User-authored messages remain plain text by default.

## Validation
Exercise the real message component and served interface with rich text, malicious HTML and unsafe URLs. Check reload, partial content, bounded scrolling and narrow containers.

## Current Harness Mapping
Combat Director uses MarkdownMessage via ChatMessage in DirectorChatPage. The older controller's compatibility adapter uses the same renderer. SPEC14 UX.CHAT.MD.1–10 and SEC-INPUT-001 define the contract. Backend reply and persistence stay strings; rendering never writes HTML back to storage.
