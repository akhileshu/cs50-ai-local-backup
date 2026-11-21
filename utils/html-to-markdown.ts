/** Minimal HTML → Markdown for CS50 Duck rendered replies (pre/code, lists, links). */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return blockChildrenToMarkdown(doc.body).trim();
}

function blockChildrenToMarkdown(el: Element): string {
  const parts: string[] = [];
  for (const node of el.childNodes) {
    const part = nodeToMarkdown(node);
    if (part) parts.push(part);
  }
  return parts.join('\n\n');
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent?.trim();
    return t ? t : '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'p':
      return inlineToMarkdown(el);
    case 'pre': {
      const code = el.querySelector('code');
      const text = (code ?? el).textContent ?? '';
      const lang = code?.className.match(/language-([\w-]+)/)?.[1] ?? '';
      return '```' + lang + '\n' + text.replace(/\n$/, '') + '\n```';
    }
    case 'code':
      return '`' + (el.textContent ?? '') + '`';
    case 'h1':
      return '# ' + inlineToMarkdown(el);
    case 'h2':
      return '## ' + inlineToMarkdown(el);
    case 'h3':
      return '### ' + inlineToMarkdown(el);
    case 'ul':
    case 'ol': {
      const ordered = tag === 'ol';
      const lines: string[] = [];
      let i = 1;
      for (const li of el.querySelectorAll(':scope > li')) {
        const prefix = ordered ? `${i}. ` : '- ';
        lines.push(prefix + inlineToMarkdown(li));
        i++;
      }
      return lines.join('\n');
    }
    case 'blockquote':
      return blockChildrenToMarkdown(el)
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      return `[${inlineToMarkdown(el)}](${href})`;
    }
    case 'br':
      return '';
    case 'div':
    case 'span':
      return blockChildrenToMarkdown(el);
    default:
      return inlineToMarkdown(el);
  }
}

function inlineToMarkdown(el: Element): string {
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as HTMLElement;
      const t = child.tagName.toLowerCase();
      if (t === 'code') out += '`' + (child.textContent ?? '') + '`';
      else if (t === 'strong' || t === 'b') out += '**' + inlineToMarkdown(child) + '**';
      else if (t === 'em' || t === 'i') out += '*' + inlineToMarkdown(child) + '*';
      else if (t === 'a') {
        const href = child.getAttribute('href') ?? '';
        out += `[${inlineToMarkdown(child)}](${href})`;
      } else out += inlineToMarkdown(child);
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}