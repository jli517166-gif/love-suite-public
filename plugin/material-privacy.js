/** Conservative masking of recognizable credentials, not a general secret detector. */
const MASK = "__REDACTED__";
const credential =
  /\b(access[_-]?token|refresh[_-]?token|api[_-]?key|password|passwd|client[_-]?secret|qqHttpToken|token|secret)\b(["']?\s*[:=]\s*)("(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:''|[^'])*(?:'|$)|[^\s,;&}\]\r\n]+)/gi;
export function redactMaterialText(value) {
  let count = 0;
  const replace = (value) => {
    if (value === MASK) return value;
    count++;
    return MASK;
  };
  const lines = String(value).split(/(?<=\n)/);
  for (let index = 0; index < lines.length; index++) {
    const header = lines[index].match(
      /^([ \t]*(?:-[ \t]+)?)(["']?(?:access[_-]?token|refresh[_-]?token|api[_-]?key|password|passwd|client[_-]?secret|qqHttpToken|token|secret)["']?\s*:\s*)[|>][0-9+-]*[ \t]*(?:#[^\r\n]*)?(\r?\n|$)/i,
    );
    if (!header) continue;
    let end = index + 1;
    while (end < lines.length && (!lines[end].trim() || lines[end].match(/^[ \t]*/)[0].length > header[1].length))
      end++;
    lines.splice(index, end - index, header[1] + header[2] + MASK + header[3]);
    count++;
  }
  const text = lines
    .join("")
    .replace(/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, replace)
    .replace(
      /\bAuthorization\b(["']?\s*[:=]\s*)("(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:''|[^'])*(?:'|$)|(?:Bearer|Basic)\s+[^\s,"'\r\n]+|[^\s,"'\r\n]+)/gi,
      (_all, separator, token) => {
        const quote = /^["']/.test(token) ? token[0] : "";
        return "Authorization" + separator + quote + replace(quote ? token.slice(1, -1) : token) + quote;
      },
    )
    .replace(
      /(https?:\/\/[^\s/:@]+:)([^\s/@]+)(@)/gi,
      (_all, before, password, after) => before + replace(password) + after,
    )
    .replace(credential, (_all, key, separator, token) => {
      const quote = /^["']/.test(token) ? token[0] : "";
      const raw = quote ? token.slice(1, -1) : token;
      return key + separator + quote + replace(raw) + quote;
    })
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, replace);
  return { text, count };
}
export function redactMaterials(materials) {
  return materials.map((item) => ({ ...item, text: redactMaterialText(item.text).text }));
}
