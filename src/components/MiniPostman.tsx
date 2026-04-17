import { useEffect, useMemo, useState } from "react";
import {
  applyParamsToUrl,
  highlightJson,
  type HistoryItem,
  type KV,
  loadHistory,
  type Method,
  paramsFromUrl,
  parseCurl,
  saveHistory,
} from "@/lib/postman-utils";

const STATUS_TONE = (status: number) => {
  if (status >= 200 && status < 300) return "text-[var(--color-success)]";
  if (status >= 300 && status < 400) return "text-[var(--color-warning)]";
  if (status >= 400) return "text-[var(--color-destructive)]";
  return "text-muted-foreground";
};

function suggestUseCases(url: string, method: Method, json: any): string[] {
  const ideas: string[] = [];
  const u = url.toLowerCase();
  if (!url) return ["Test an API first to see suggestions here."];

  if (u.includes("user") || u.includes("auth") || u.includes("login")) {
    ideas.push("Build a login or signup screen using this user data.");
    ideas.push("Display user profiles in a directory or admin dashboard.");
  }
  if (u.includes("post") || u.includes("article") || u.includes("blog")) {
    ideas.push("Render a blog feed or news timeline from these posts.");
  }
  if (u.includes("product") || u.includes("shop") || u.includes("cart")) {
    ideas.push("Build an e-commerce product grid with these items.");
  }
  if (u.includes("weather")) ideas.push("Show a weather widget on a dashboard or homepage.");
  if (u.includes("random")) ideas.push("Use as placeholder data while prototyping a new UI.");

  if (method === "POST") ideas.push("Wire this into a form submission flow.");
  if (method === "PUT" || method === "PATCH") ideas.push("Use this in an edit / settings screen.");
  if (method === "DELETE") ideas.push("Add a confirm-and-delete action in your app.");

  if (Array.isArray(json)) ideas.push(`Render the ${json.length} items in a list, table, or card grid.`);
  else if (json && typeof json === "object") {
    const keys = Object.keys(json).slice(0, 3).join(", ");
    if (keys) ideas.push(`Display fields like ${keys} in a detail card.`);
  }

  if (!ideas.length) ideas.push("Use this response to populate a dashboard widget or detail view.");
  return ideas.slice(0, 4);
}

type Tab = "pretty" | "raw" | "headers";

export function MiniPostman() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [url, setUrl] = useState("https://randomuser.me/api/");
  const [method, setMethod] = useState<Method>("GET");
  const [headers, setHeaders] = useState<KV[]>([{ key: "", value: "" }]);
  const [params, setParams] = useState<KV[]>([{ key: "", value: "" }]);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<string>("");
  const [resHeaders, setResHeaders] = useState<KV[]>([]);
  const [isJson, setIsJson] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [time, setTime] = useState<number | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("pretty");
  const [suggestions, setSuggestions] = useState<string[]>([
    "Test an API first to see suggestions here.",
  ]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showCurl, setShowCurl] = useState(false);
  const [curlText, setCurlText] = useState("");
  const [curlError, setCurlError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
    const existing = paramsFromUrl("https://randomuser.me/api/");
    if (existing.length) setParams([...existing, { key: "", value: "" }]);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
  };

  const updateRow = (
    setter: React.Dispatch<React.SetStateAction<KV[]>>,
    i: number,
    field: keyof KV,
    value: string,
  ) => {
    setter((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  // When user edits URL directly, sync params from query string
  const handleUrlChange = (value: string) => {
    setUrl(value);
    const fromUrl = paramsFromUrl(value);
    if (fromUrl.length) setParams([...fromUrl, { key: "", value: "" }]);
  };

  // When user edits param rows, push them into the URL
  const handleParamChange = (i: number, field: keyof KV, value: string) => {
    setParams((rows) => {
      const next = rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r));
      setUrl((prev) => applyParamsToUrl(prev, next));
      return next;
    });
  };

  const removeParam = (i: number) => {
    setParams((rows) => {
      const next = rows.filter((_, idx) => idx !== i);
      const ensured = next.length ? next : [{ key: "", value: "" }];
      setUrl((prev) => applyParamsToUrl(prev, ensured));
      return ensured;
    });
  };

  const sendRequest = async () => {
    if (!url) return;
    setLoading(true);
    setResponse("");
    setStatus(null);
    setStatusText("");
    setTime(null);
    setSize(null);
    setResHeaders([]);

    const start = performance.now();
    try {
      const headerObj: Record<string, string> = {};
      headers.forEach((h) => {
        if (h.key.trim()) headerObj[h.key.trim()] = h.value;
      });

      const init: RequestInit = { method, headers: headerObj };
      if (method !== "GET" && method !== "DELETE" && body.trim()) {
        init.body = body;
        if (!headerObj["Content-Type"] && !headerObj["content-type"]) {
          headerObj["Content-Type"] = "application/json";
          init.headers = headerObj;
        }
      }

      const res = await fetch(url, init);
      const elapsed = Math.round(performance.now() - start);
      setStatus(res.status);
      setStatusText(res.statusText);
      setTime(elapsed);

      const collected: KV[] = [];
      res.headers.forEach((v, k) => collected.push({ key: k, value: v }));
      setResHeaders(collected);

      const text = await res.text();
      setSize(new Blob([text]).size);
      let parsed: any = null;
      let pretty = text;
      let json = false;
      try {
        parsed = JSON.parse(text);
        pretty = JSON.stringify(parsed, null, 2);
        json = true;
      } catch {
        /* not JSON */
      }
      setIsJson(json);
      setResponse(pretty);
      setTab("pretty");
      setSuggestions(suggestUseCases(url, method, parsed));

      const item: HistoryItem = {
        id: `${Date.now()}`,
        url,
        method,
        headers,
        body,
        status: res.status,
        time: elapsed,
        at: Date.now(),
      };
      setHistory((prev) => {
        const next = [item, ...prev].slice(0, 10);
        saveHistory(next);
        return next;
      });
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      setTime(elapsed);
      setStatus(0);
      setStatusText("Network error");
      setIsJson(false);
      setResponse(
        `Request failed:\n${err?.message ?? String(err)}\n\nTip: the API may not allow CORS from the browser.`,
      );
      setSuggestions(["Try a CORS-enabled API like https://jsonplaceholder.typicode.com/posts"]);
    } finally {
      setLoading(false);
    }
  };

  const copyJson = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const loadFromHistory = (h: HistoryItem) => {
    setUrl(h.url);
    setMethod(h.method);
    setHeaders(h.headers.length ? h.headers : [{ key: "", value: "" }]);
    setBody(h.body);
    const fromUrl = paramsFromUrl(h.url);
    setParams(fromUrl.length ? [...fromUrl, { key: "", value: "" }] : [{ key: "", value: "" }]);
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const importCurl = () => {
    const parsed = parseCurl(curlText);
    if (!parsed) {
      setCurlError("Could not parse. Make sure it starts with 'curl' and includes a URL.");
      return;
    }
    setUrl(parsed.url);
    setMethod(parsed.method);
    setHeaders(parsed.headers.length ? [...parsed.headers, { key: "", value: "" }] : [{ key: "", value: "" }]);
    setBody(parsed.body);
    const fromUrl = paramsFromUrl(parsed.url);
    setParams(fromUrl.length ? [...fromUrl, { key: "", value: "" }] : [{ key: "", value: "" }]);
    setCurlError("");
    setCurlText("");
    setShowCurl(false);
  };

  const highlightedHtml = useMemo(
    () => (isJson ? highlightJson(response) : ""),
    [isJson, response],
  );

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={() => setShowCurl((s) => !s)}
            className="rounded-full border border-border bg-card px-5 py-2 text-sm font-medium shadow-[var(--shadow-card)] transition hover:bg-accent"
          >
            📥 Import cURL
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-full border border-border bg-card px-5 py-2 text-sm font-medium shadow-[var(--shadow-card)] transition hover:bg-accent"
          >
            {theme === "dark" ? "🌟 Light Mode" : "🌙 Dark Mode"}
          </button>
        </div>

        {showCurl && (
          <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Import from cURL</h3>
              <button onClick={() => setShowCurl(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Close ✕
              </button>
            </div>
            <textarea
              value={curlText}
              onChange={(e) => setCurlText(e.target.value)}
              placeholder={`curl -X POST https://api.example.com/users \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Ada"}'`}
              rows={5}
              className="mt-3 w-full resize-y rounded-lg border border-border bg-input px-4 py-3 font-mono text-sm outline-none focus:border-primary"
            />
            {curlError && <p className="mt-2 text-xs text-destructive">{curlError}</p>}
            <button
              onClick={importCurl}
              className="mt-3 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90"
            >
              Parse and fill builder
            </button>
          </div>
        )}

        {/* Hero */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <span className="inline-block rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                API Testing Tool
              </span>
              <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">My Mini Postman</h1>
              <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
                Test APIs, check JSON responses, and get simple use-case suggestions in one place.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["GET, POST, PUT, DELETE", "Headers + Query Params", "History + cURL Import"].map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <aside className="rounded-xl border border-primary/30 bg-background/40 p-5 lg:w-80">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary">How to use</h3>
                <span className="text-primary/60">•••</span>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-foreground/90">
                {[
                  "Paste your API URL or import a cURL command",
                  "Add query params, headers, or a JSON body",
                  "Send and inspect status, time, and JSON output",
                ].map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {s}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        {/* Builder + Response */}
        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Request Builder */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Request Builder</h2>
              <span className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
                Mini version
              </span>
            </div>

            <label className="mt-5 block text-sm font-bold">API URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://api.example.com/endpoint"
              className="mt-2 w-full rounded-lg border border-border bg-input px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            />

            <label className="mt-5 block text-sm font-bold">HTTP Method</label>
            <div className="mt-2 grid gap-3 sm:grid-cols-[180px_1fr]">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="rounded-lg border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary"
              >
                {(["GET", "POST", "PUT", "DELETE", "PATCH"] as Method[]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="rounded-lg border border-border bg-background/30 px-4 py-3 text-xs text-muted-foreground">
                Use <b className="text-foreground">GET</b> to fetch data, <b className="text-foreground">POST</b> to create,{" "}
                <b className="text-foreground">PUT</b> to update, and <b className="text-foreground">DELETE</b> to remove records.
              </p>
            </div>

            {/* Query Params */}
            <div className="mt-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">Query Params</h3>
              <button
                onClick={() => setParams((p) => [...p, { key: "", value: "" }])}
                className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
              >
                + Add Param
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Auto-synced into the URL above.</p>
            <div className="mt-3 space-y-2">
              {params.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    placeholder="key"
                    value={p.key}
                    onChange={(e) => handleParamChange(i, "key", e.target.value)}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <input
                    placeholder="value"
                    value={p.value}
                    onChange={(e) => handleParamChange(i, "value", e.target.value)}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => removeParam(i)}
                    className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/20"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Headers */}
            <div className="mt-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">Headers</h3>
              <button
                onClick={() => setHeaders((h) => [...h, { key: "", value: "" }])}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Add Header
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Add custom headers if your API needs them.</p>
            <div className="mt-3 space-y-2">
              {headers.map((h, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    placeholder="Header key"
                    value={h.key}
                    onChange={(e) => updateRow(setHeaders, i, "key", e.target.value)}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <input
                    placeholder="Header value"
                    value={h.value}
                    onChange={(e) => updateRow(setHeaders, i, "value", e.target.value)}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => setHeaders((rows) => rows.filter((_, idx) => idx !== i))}
                    className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/20"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <label className="mt-6 block text-sm font-bold">Body (JSON only)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`{\n  "title": "hello"\n}`}
              rows={6}
              className="mt-2 w-full resize-y rounded-lg border border-border bg-input px-4 py-3 font-mono text-sm outline-none focus:border-primary"
            />

            <button
              onClick={sendRequest}
              disabled={loading}
              className="mt-5 w-full rounded-xl py-3.5 text-base font-bold text-white shadow-[var(--shadow-glow)] transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
              style={{ background: "var(--gradient-send)" }}
            >
              {loading ? "Sending..." : "Send Request"}
            </button>
          </div>

          {/* Response */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-2xl font-bold">Response</h2>
                <div className="flex gap-2">
                  <span className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary">
                    Live output
                  </span>
                  <button
                    onClick={copyJson}
                    className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                  >
                    {copied ? "✓ Copied" : "Copy JSON"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</div>
                  <div className={`mt-1 text-2xl font-bold ${status === null ? "text-muted-foreground" : STATUS_TONE(status)}`}>
                    {status === null ? "—" : `${status}`}
                  </div>
                  {statusText && <div className="text-xs text-muted-foreground">{statusText}</div>}
                </div>
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Time</div>
                  <div className="mt-1 text-2xl font-bold">{time === null ? "—" : `${time} ms`}</div>
                </div>
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Size</div>
                  <div className="mt-1 text-2xl font-bold">
                    {size === null ? "—" : size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="mt-4 flex gap-1 border-b border-border">
                {(["pretty", "raw", "headers"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`relative px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                      tab === t
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                    {tab === t && (
                      <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                ))}
                {tab === "headers" && (
                  <span className="ml-auto self-center pr-2 text-xs text-muted-foreground">
                    {resHeaders.length} headers
                  </span>
                )}
              </div>

              <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-border bg-background/60 p-4 font-mono text-xs leading-relaxed">
                {!response && <span className="text-muted-foreground">Response will appear here...</span>}
                {response && tab === "pretty" && isJson && (
                  <pre dangerouslySetInnerHTML={{ __html: highlightedHtml }} className="whitespace-pre-wrap break-words" />
                )}
                {response && tab === "pretty" && !isJson && (
                  <pre className="whitespace-pre-wrap break-words text-foreground/90">{response}</pre>
                )}
                {response && tab === "raw" && (
                  <pre className="whitespace-pre-wrap break-words text-foreground/90">{response}</pre>
                )}
                {tab === "headers" && (
                  <div className="space-y-1.5">
                    {resHeaders.length === 0 && (
                      <span className="text-muted-foreground">No headers to show.</span>
                    )}
                    {resHeaders.map((h, i) => (
                      <div key={i} className="grid grid-cols-[140px_1fr] gap-3">
                        <span className="text-[var(--color-primary)]">{h.key}</span>
                        <span className="break-all text-foreground/90">{h.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Where can you use this API?</h3>
                <span className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary">
                  Simple ideas
                </span>
              </div>
              <ul className="mt-4 space-y-2">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-lg border-l-2 border-primary bg-background/40 px-4 py-3 text-sm text-foreground/90"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* History */}
        <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Request History</h2>
              <p className="text-sm text-muted-foreground">Last {history.length} of 10 — saved in your browser.</p>
            </div>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition hover:bg-destructive/20"
              >
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="mt-4 rounded-lg border border-border bg-background/40 p-4 text-sm text-muted-foreground">
              No requests yet. Send one to start building history.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => loadFromHistory(h)}
                    className="grid w-full grid-cols-[60px_70px_1fr_70px] items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-3 text-left text-sm transition hover:border-primary/50 hover:bg-background/70"
                  >
                    <span className="rounded px-2 py-0.5 text-center text-xs font-bold text-primary-foreground" style={{ background: methodColor(h.method) }}>
                      {h.method}
                    </span>
                    <span className={`text-sm font-bold ${h.status === null ? "text-muted-foreground" : STATUS_TONE(h.status)}`}>
                      {h.status ?? "—"}
                    </span>
                    <span className="truncate text-foreground/90">{h.url}</span>
                    <span className="text-right text-xs text-muted-foreground">
                      {h.time !== null ? `${h.time} ms` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          Built for quick API exploration • All requests run in your browser.
        </footer>
      </div>
    </div>
  );
}

function methodColor(m: Method): string {
  switch (m) {
    case "GET":
      return "oklch(0.6 0.17 155)";
    case "POST":
      return "oklch(0.65 0.18 50)";
    case "PUT":
      return "oklch(0.6 0.16 230)";
    case "PATCH":
      return "oklch(0.65 0.16 280)";
    case "DELETE":
      return "oklch(0.55 0.2 25)";
  }
}
