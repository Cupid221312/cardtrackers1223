"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  AutomationRule,
  PlatformConnection,
  SocialPlatform,
} from "@/lib/types";
import clsx from "clsx";

const SOCIALS: Array<{ id: SocialPlatform; label: string; setup: string }> = [
  {
    id: "youtube",
    label: "YouTube",
    setup: "Google Cloud console → YouTube Data API v3 → OAuth2 access token with youtube.upload scope.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    setup: "TikTok for Developers → Content Posting API (requires app review) → access token.",
  },
  {
    id: "instagram",
    label: "Instagram",
    setup: "Meta app + Instagram Business/Creator account → Graph API → long-lived access token.",
  },
];

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [creator, setCreator] = useState("");
  const [sourcePlatform, setSourcePlatform] =
    useState<AutomationRule["sourcePlatform"]>("twitch");
  const [minScore, setMinScore] = useState(80);
  const [publishTo, setPublishTo] = useState<SocialPlatform[]>(["tiktok"]);

  async function refresh() {
    const res = await fetch("/api/automations");
    if (res.ok) {
      const b = await res.json();
      setRules(b.rules);
      setConnections(b.connections);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  const isConnected = (p: SocialPlatform) =>
    connections.find((c) => c.platform === p)?.connected ?? false;

  async function addRule() {
    if (!creator.trim()) return;
    await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        sourcePlatform,
        creator: creator.trim(),
        minScore,
        maxClipsPerVideo: 5,
        captionTemplate: "reels",
        publishTo,
      }),
    });
    setCreator("");
    void refresh();
  }

  async function toggleRule(rule: AutomationRule) {
    await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
    });
    void refresh();
  }

  async function removeRule(id: string) {
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    void refresh();
  }

  async function connect(p: SocialPlatform) {
    const account = prompt(`${p} account handle (display only):`);
    if (!account) return;
    const token = prompt(
      `Paste your ${p} access token.\n\n${SOCIALS.find((s) => s.id === p)?.setup}`,
    );
    if (!token) return;
    await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: p, account, token }),
    });
    void refresh();
  }

  return (
    <div className="min-h-screen bg-ink-950 text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-ink-700 bg-ink-900 px-5">
        <span className="text-sm font-bold text-white">
          ClipForge <span className="font-medium text-accent-glow">Automations</span>
        </span>
        <nav className="flex items-center gap-1 text-xs">
          <Link href="/" className="rounded-md px-2 py-1 font-medium text-slate-400 hover:bg-ink-700 hover:text-white">
            Studio
          </Link>
          <Link href="/dashboard" className="rounded-md px-2 py-1 font-medium text-slate-400 hover:bg-ink-700 hover:text-white">
            Dashboard
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-brand-yellow/30 bg-brand-yellow/5 p-3 text-xs leading-relaxed text-brand-yellow/90">
          <strong>How automation runs.</strong> Rules and connections are saved
          here. A deployed worker polls each creator for new VODs, auto-clips
          them, keeps clips scoring ≥ your threshold, and publishes to the
          connected accounts. Posting needs a real access token from each
          platform&apos;s developer console (below) — ClipForge never
          fabricates credentials, and live posting cannot run inside a
          preview sandbox.
        </div>

        {/* connections */}
        <h2 className="mt-6 text-sm font-bold text-white">Connected accounts</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {SOCIALS.map((s) => (
            <div key={s.id} className="panel p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-100">{s.label}</span>
                <span
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                    isConnected(s.id)
                      ? "bg-brand-green/15 text-brand-green"
                      : "bg-ink-700 text-slate-400",
                  )}
                >
                  {isConnected(s.id) ? "Connected" : "Not connected"}
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{s.setup}</p>
              <button
                className="btn-ghost mt-2 w-full !py-1 text-xs"
                onClick={() => connect(s.id)}
              >
                {isConnected(s.id) ? "Update token" : "Connect"}
              </button>
            </div>
          ))}
        </div>

        {/* new rule */}
        <h2 className="mt-8 text-sm font-bold text-white">Watch a creator</h2>
        <div className="panel mt-2 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-slate-400">
              Source
              <select
                className="text-input mt-1 !py-1.5"
                value={sourcePlatform}
                onChange={(e) =>
                  setSourcePlatform(e.target.value as AutomationRule["sourcePlatform"])
                }
              >
                <option value="twitch">Twitch</option>
                <option value="youtube">YouTube</option>
                <option value="kick">Kick</option>
              </select>
            </label>
            <label className="min-w-[180px] flex-1 text-[11px] text-slate-400">
              Creator / channel
              <input
                className="text-input mt-1 !py-1.5"
                placeholder="e.g. twitch.tv/xqc or a channel handle"
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
              />
            </label>
            <label className="text-[11px] text-slate-400">
              Min score
              <input
                type="number"
                className="text-input mt-1 w-20 !py-1.5"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-[11px] text-slate-400">Publish to:</span>
            {SOCIALS.map((s) => (
              <label key={s.id} className="flex items-center gap-1 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={publishTo.includes(s.id)}
                  onChange={(e) =>
                    setPublishTo((prev) =>
                      e.target.checked
                        ? [...prev, s.id]
                        : prev.filter((p) => p !== s.id),
                    )
                  }
                />
                {s.label}
              </label>
            ))}
            <button className="btn-primary ml-auto !py-1.5" onClick={addRule}>
              + Add rule
            </button>
          </div>
        </div>

        {/* rules list */}
        <div className="mt-4 flex flex-col gap-2">
          {rules.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-500">
              No automation rules yet.
            </p>
          )}
          {rules.map((r) => (
            <div
              key={r.id}
              className="panel flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">
                  <span className="capitalize">{r.sourcePlatform}</span> · {r.creator}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Clips ≥ {r.minScore} → {r.publishTo.join(", ") || "no targets"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className={clsx(
                    "rounded px-2 py-1 text-[11px] font-semibold",
                    r.enabled
                      ? "bg-brand-green/15 text-brand-green"
                      : "bg-ink-700 text-slate-400",
                  )}
                  onClick={() => toggleRule(r)}
                >
                  {r.enabled ? "Active" : "Paused"}
                </button>
                <button
                  className="text-slate-600 hover:text-brand-red"
                  onClick={() => removeRule(r.id)}
                  aria-label="Delete rule"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
