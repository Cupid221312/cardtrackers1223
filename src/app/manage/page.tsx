"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Personal admin page — add or remove tracked cards from any browser.
 *
 * Auth model: the user pastes the shared REFRESH_SECRET once, it's kept in
 * localStorage, and every subsequent action includes it as `?secret=…`.
 * Deliberately kept off the main dashboard so anyone with the URL can still
 * browse the deal feed read-only.
 */
import { useEffect, useState } from "react";

const SPORTS = ["Basketball", "Football", "Baseball", "Hockey", "Soccer", "TCG", "Other"] as const;

interface CardRow {
  id: string;
  playerName: string;
  year: number;
  setName: string;
  cardNumber: string;
  variant: string;
  sport: string;
}

export default function ManagePage() {
  const [secret, setSecret] = useState<string>("");
  const [savedSecret, setSavedSecret] = useState<string>("");
  const [cards, setCards] = useState<CardRow[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    playerName: "",
    year: "" as string,
    setName: "",
    cardNumber: "",
    variant: "Base",
    sport: "Basketball" as (typeof SPORTS)[number],
    searchQuery: "",
  });

  useEffect(() => {
    const s = localStorage.getItem("adminSecret") ?? "";
    setSavedSecret(s);
    setSecret(s);
  }, []);

  async function loadCards() {
    const res = await fetch("/api/cards");
    if (!res.ok) return;
    const j = await res.json();
    setCards(j.cards ?? []);
  }
  useEffect(() => {
    if (savedSecret) void loadCards();
  }, [savedSecret]);

  async function verifyAndSave() {
    setMsg("checking…");
    // Any auth-required endpoint that's a no-op works here; a DELETE on a
    // fake id gives us a 401 (bad secret) vs 404/500 (right secret) signal.
    const res = await fetch(`/api/cards/does-not-exist?secret=${encodeURIComponent(secret)}`, {
      method: "DELETE",
    });
    if (res.status === 401) {
      setMsg("Wrong secret.");
      return;
    }
    localStorage.setItem("adminSecret", secret);
    setSavedSecret(secret);
    setMsg("Unlocked.");
  }

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/cards?secret=${encodeURIComponent(savedSecret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, year: Number(form.year) }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(typeof j.error === "string" ? j.error : "Failed to add — check the form fields.");
      return;
    }
    setMsg(`Added ${form.year} ${form.setName} ${form.playerName} #${form.cardNumber}. Live data will fill in on the next 10-minute refresh.`);
    setForm({ ...form, playerName: "", cardNumber: "", searchQuery: "" });
    void loadCards();
  }

  async function removeCard(id: string, label: string) {
    if (!confirm(`Stop tracking ${label}? This deletes its price history too.`)) return;
    const res = await fetch(`/api/cards/${id}?secret=${encodeURIComponent(savedSecret)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setMsg("Delete failed.");
      return;
    }
    setMsg(`Removed ${label}.`);
    void loadCards();
  }

  const input =
    "w-full rounded border px-3 py-2 text-sm";
  const inputStyle = {
    background: "var(--surface-2)",
    borderColor: "var(--border)",
    color: "var(--text-primary)",
  };

  if (!savedSecret) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="mb-1 text-xl font-bold">Manage cards</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Paste your admin secret (the <code>REFRESH_SECRET</code> value set in Vercel).
          Saved in this browser only.
        </p>
        <input
          type="password"
          className={input}
          style={inputStyle}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="admin secret"
        />
        <button
          onClick={verifyAndSave}
          className="mt-3 rounded px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--series-1)" }}
        >
          Unlock
        </button>
        {msg && <div className="mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>{msg}</div>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Manage tracked cards</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Add or remove cards. New cards get real data on the next 10-minute refresh.
          </p>
        </div>
        <a href="/" className="text-sm underline" style={{ color: "var(--series-1)" }}>← Back to dashboard</a>
      </header>

      <BulkAdd secret={savedSecret} onDone={() => void loadCards()} />

      <section
        className="mb-8 rounded-xl border p-4"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
      >
        <h2 className="mb-3 font-semibold">Track a new card</h2>
        <form onSubmit={addCard} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="col-span-2">
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Player / subject</label>
            <input required className={input} style={inputStyle} value={form.playerName}
              onChange={(e) => setForm({ ...form, playerName: e.target.value })}
              placeholder="Victor Wembanyama" />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Year</label>
            <input required type="number" min={1900} max={2100} className={input} style={inputStyle}
              value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}
              placeholder="2023" />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Sport</label>
            <select className={input} style={inputStyle} value={form.sport}
              onChange={(e) => setForm({ ...form, sport: e.target.value as (typeof SPORTS)[number] })}>
              {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Set name</label>
            <input required className={input} style={inputStyle} value={form.setName}
              onChange={(e) => setForm({ ...form, setName: e.target.value })}
              placeholder="Prizm, Topps Chrome, Pokemon Base Set…" />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Card #</label>
            <input required className={input} style={inputStyle} value={form.cardNumber}
              onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
              placeholder="136" />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Variant</label>
            <input className={input} style={inputStyle} value={form.variant}
              onChange={(e) => setForm({ ...form, variant: e.target.value })}
              placeholder="Base, Silver, Refractor…" />
          </div>
          <div className="col-span-2 md:col-span-4">
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Custom eBay search (optional — leave blank to auto-build one)
            </label>
            <input className={input} style={inputStyle} value={form.searchQuery}
              onChange={(e) => setForm({ ...form, searchQuery: e.target.value })}
              placeholder='e.g. "wembanyama prizm rookie #136"' />
          </div>
          <div className="col-span-2 md:col-span-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--series-1)" }}
            >
              {saving ? "Adding…" : "Track this card"}
            </button>
            {msg && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{msg}</span>}
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Currently tracked ({cards.length})</h2>
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                <th className="px-4 py-3">Card</th>
                <th className="px-4 py-3">Sport</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cards.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                  No cards tracked yet.
                </td></tr>
              )}
              {cards.map((c) => {
                const label = `${c.year} ${c.setName} ${c.playerName} #${c.cardNumber}${c.variant !== "Base" ? ` ${c.variant}` : ""}`;
                return (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">{label}</td>
                    <td className="px-4 py-3">{c.sport}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removeCard(c.id, label)}
                        className="text-xs underline"
                        style={{ color: "var(--status-serious)" }}
                      >Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function BulkAdd({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ parsed: number; added: number; duplicates: number; failed: any[] } | null>(null);

  async function handleFile(f: File) {
    setText(await f.text());
  }

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    const res = await fetch(`/api/cards/bulk?secret=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setResult({ parsed: 0, added: 0, duplicates: 0, failed: [{ input: "", reason: j.error ?? "Request failed" }] });
      return;
    }
    setResult(j);
    if (j.added > 0) onDone();
  }

  return (
    <section
      className="mb-8 rounded-xl border p-4"
      style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
    >
      <h2 className="mb-1 font-semibold">Bulk add — paste a list or upload a file</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        Any of these formats auto-detect: CSV with headers, Excel copy-paste (tab-separated),
        pipe-delimited (<code>2023 | Prizm | Wembanyama | 136 | Base | Basketball</code>),
        or free-form (<code>2023 Prizm Victor Wembanyama #136 Basketball</code>) — one card per line.
      </p>

      <textarea
        rows={6}
        placeholder={`2023 Prizm Victor Wembanyama #136 Basketball\n2017 Prizm Patrick Mahomes #269 Football\n1999 Pokemon Base Set Charizard #4 Holo Unlimited`}
        className="w-full rounded border px-3 py-2 font-mono text-xs"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-primary)" }}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label
          className="cursor-pointer rounded border px-3 py-2 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Upload .csv / .txt
          <input
            type="file"
            accept=".csv,.txt,.tsv,text/plain"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--series-1)" }}
        >
          {busy ? "Adding…" : "Add all"}
        </button>
        {text && (
          <button
            onClick={() => { setText(""); setResult(null); }}
            className="text-xs underline"
            style={{ color: "var(--text-secondary)" }}
          >Clear</button>
        )}
      </div>

      {result && (
        <div className="mt-4 rounded border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div>
            <strong style={{ color: "var(--status-good)" }}>{result.added} added</strong>
            {result.duplicates > 0 && <> · {result.duplicates} already tracked</>}
            {result.failed.length > 0 && <> · <span style={{ color: "var(--status-serious)" }}>{result.failed.length} failed</span></>}
          </div>
          {result.failed.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs" style={{ color: "var(--text-secondary)" }}>Show failures</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {result.failed.map((f, i) => (
                  <li key={i}>
                    <code style={{ color: "var(--text-secondary)" }}>{f.input}</code>
                    <span style={{ color: "var(--status-serious)" }}> — {f.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
