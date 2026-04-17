export type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type KV = { key: string; value: string };

export type ParsedCurl = {
  url: string;
  method: Method;
  headers: KV[];
  body: string;
};

/**
 * Lightweight cURL parser. Handles:
 *  - curl 'url' or curl url
 *  - -X / --request METHOD
 *  - -H / --header "K: V"
 *  - -d / --data / --data-raw / --data-binary BODY
 *  - line continuations (\) and single/double quotes
 */
export function parseCurl(input: string): ParsedCurl | null {
  const text = input
    .replace(/\\\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text.toLowerCase().startsWith("curl")) return null;

  const tokens: string[] = [];
  let i = 4; // skip "curl"
  while (i < text.length) {
    while (i < text.length && text[i] === " ") i++;
    if (i >= text.length) break;
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let buf = "";
      while (i < text.length && text[i] !== quote) {
        if (text[i] === "\\" && i + 1 < text.length) {
          buf += text[i + 1];
          i += 2;
        } else {
          buf += text[i++];
        }
      }
      i++;
      tokens.push(buf);
    } else {
      let buf = "";
      while (i < text.length && text[i] !== " ") buf += text[i++];
      tokens.push(buf);
    }
  }

  let url = "";
  let method: Method = "GET";
  const headers: KV[] = [];
  let body = "";
  let methodExplicit = false;

  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    if (t === "-X" || t === "--request") {
      method = (tokens[++j] || "GET").toUpperCase() as Method;
      methodExplicit = true;
    } else if (t === "-H" || t === "--header") {
      const raw = tokens[++j] || "";
      const idx = raw.indexOf(":");
      if (idx > -1) headers.push({ key: raw.slice(0, idx).trim(), value: raw.slice(idx + 1).trim() });
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      body = tokens[++j] || "";
      if (!methodExplicit) method = "POST";
    } else if (t === "-u" || t === "--user") {
      const creds = tokens[++j] || "";
      headers.push({ key: "Authorization", value: "Basic " + btoa(creds) });
    } else if (t.startsWith("-")) {
      // skip unknown flag, also skip its arg if it doesn't start with -
      if (j + 1 < tokens.length && !tokens[j + 1].startsWith("-") && !/^https?:/i.test(tokens[j + 1])) {
        // only consume value for known value-flags; skip otherwise
      }
    } else if (!url) {
      url = t;
    }
  }

  if (!url) return null;
  return { url, method, headers, body };
}

const HISTORY_KEY = "mini-postman-history-v1";
export type HistoryItem = {
  id: string;
  url: string;
  method: Method;
  headers: KV[];
  body: string;
  status: number | null;
  time: number | null;
  at: number;
};

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 10)));
  } catch {
    /* ignore */
  }
}

/** Sync query-param rows into the URL string (preserves hash). */
export function applyParamsToUrl(url: string, params: KV[]): string {
  if (!url) return url;
  const active = params.filter((p) => p.key.trim());
  try {
    const hashIdx = url.indexOf("#");
    const hash = hashIdx > -1 ? url.slice(hashIdx) : "";
    const base = hashIdx > -1 ? url.slice(0, hashIdx) : url;
    const qIdx = base.indexOf("?");
    const path = qIdx > -1 ? base.slice(0, qIdx) : base;
    const qs = active
      .map((p) => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value)}`)
      .join("&");
    return path + (qs ? `?${qs}` : "") + hash;
  } catch {
    return url;
  }
}

/** Extract query params from a URL string into KV rows. */
export function paramsFromUrl(url: string): KV[] {
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return [];
  const hashIdx = url.indexOf("#", qIdx);
  const qs = hashIdx > -1 ? url.slice(qIdx + 1, hashIdx) : url.slice(qIdx + 1);
  if (!qs) return [];
  return qs.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    if (eq === -1) return { key: decodeURIComponent(pair), value: "" };
    return {
      key: decodeURIComponent(pair.slice(0, eq)),
      value: decodeURIComponent(pair.slice(eq + 1)),
    };
  });
}

/** Very small JSON syntax highlighter → HTML string. */
export function highlightJson(json: string): string {
  if (!json) return "";
  const escaped = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+\.?\d*([eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "text-[var(--color-accent-orange)]"; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match)
          ? "text-[var(--color-primary)]" // key
          : "text-[var(--color-success)]"; // string value
      } else if (/true|false/.test(match)) {
        cls = "text-[var(--color-warning)]";
      } else if (/null/.test(match)) {
        cls = "text-muted-foreground";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}
