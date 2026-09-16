const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "th", "td", "h1", "h2", "h3", "blockquote", "div"]);
const ALLOWED_ATTRIBUTES = new Set(["href", "target", "rel", "colspan", "rowspan"]);

function safeHref(value: string) {
  const trimmed = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return "#";
}

/** Small, dependency-free allow-list sanitizer used at the API boundary and in PDF text extraction. */
export function sanitizeLetterHtml(input: unknown) {
  let html = typeof input === "string" ? input : "";
  html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<\s*(script|style|iframe|object|embed|form|input|textarea|select|button|svg|math)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|form|input|textarea|select|button|svg|math)\b[^>]*\/?>/gi, "");
  return html.replace(/<\s*([a-z0-9]+)([^>]*)>/gi, (full, rawTag: string, rawAttributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (tag === "br") return "<br>";
    const attrs: string[] = [];
    const attributePattern = /([a-zA-Z][\w:-]*)\s*=\s*(["'])(.*?)\2/g;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(rawAttributes))) {
      const name = match[1].toLowerCase();
      if (!ALLOWED_ATTRIBUTES.has(name)) continue;
      if (name === "href") attrs.push(`href="${safeHref(match[3]).replace(/"/g, "&quot;")}"`);
      else if (name === "target") attrs.push(`target="${match[3] === "_blank" ? "_blank" : "_self"}"`);
      else if (name === "rel") attrs.push(`rel="${match[3].replace(/[^a-z\s-]/gi, "").trim()}"`);
      else if (name === "colspan" || name === "rowspan") attrs.push(`${name}="${Math.max(1, Math.min(20, Number(match[3]) || 1))}"`);
    }
    if (tag === "a" && !attrs.some((attribute) => attribute.startsWith("rel="))) attrs.push('rel="noopener noreferrer"');
    return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
  }).replace(/<\s*\/\s*([a-z0-9]+)\s*>/gi, (full, rawTag: string) => ALLOWED_TAGS.has(rawTag.toLowerCase()) ? `</${rawTag.toLowerCase()}>` : "");
}

export function letterHtmlToText(input: unknown) {
  return sanitizeLetterHtml(input)
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-3])\s*\/?>/gi, "\n")
    .replace(/<\s*li\s*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
