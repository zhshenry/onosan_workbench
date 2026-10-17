import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const markdown = new Marked({ gfm: true, breaks: true });
const tags = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 's', 'del', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'];

export function renderMarkdown(content: string, documentLinks = false): string {
  return DOMPurify.sanitize(markdown.parse(content, { async: false }), {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: ['href', 'title', 'start'],
    ALLOWED_URI_REGEXP: documentLinks ? /^(?:https?:\/\/|#|(?!(?:[a-z][a-z\d+.-]*:|[\\/]{2}))[^?#]*\.(?:md|markdown)(?:[?#]|$))/i : /^https?:\/\//i,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
