import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { AutomationRule, PlatformConnection } from "@/lib/types";

/**
 * Persistent store for automation rules and platform connections. These
 * live under .data/ as JSON. The app manages this configuration; a
 * deployed worker (not the web server) is what would actually poll source
 * platforms and publish — this module is its source of truth.
 *
 * Connection tokens are stored separately from the connection metadata so
 * secrets never reach the client: the API returns `PlatformConnection`
 * (no token), while tokens stay in connections.secret.json.
 */

const DATA_ROOT = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const RULES_PATH = path.join(DATA_ROOT, "automations.json");
const CONN_META_PATH = path.join(DATA_ROOT, "connections.json");
const CONN_SECRET_PATH = path.join(DATA_ROOT, "connections.secret.json");

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(p: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, p);
}

// ---- automation rules -----------------------------------------------------

export async function listRules(): Promise<AutomationRule[]> {
  return readJson<AutomationRule[]>(RULES_PATH, []);
}

export async function upsertRule(
  input: Omit<AutomationRule, "id" | "createdAt" | "lastRunAt"> & { id?: string },
): Promise<AutomationRule> {
  const rules = await listRules();
  if (input.id) {
    const idx = rules.findIndex((r) => r.id === input.id);
    if (idx !== -1) {
      rules[idx] = { ...rules[idx], ...input, id: rules[idx].id };
      await writeJson(RULES_PATH, rules);
      return rules[idx];
    }
  }
  const rule: AutomationRule = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    lastRunAt: 0,
  };
  rules.push(rule);
  await writeJson(RULES_PATH, rules);
  return rule;
}

export async function deleteRule(id: string): Promise<boolean> {
  const rules = await listRules();
  const next = rules.filter((r) => r.id !== id);
  if (next.length === rules.length) return false;
  await writeJson(RULES_PATH, next);
  return true;
}

// ---- platform connections -------------------------------------------------

export async function listConnections(): Promise<PlatformConnection[]> {
  return readJson<PlatformConnection[]>(CONN_META_PATH, []);
}

/** Store/replace a connection's token and public metadata. */
export async function setConnection(
  platform: PlatformConnection["platform"],
  account: string,
  token: string,
): Promise<PlatformConnection> {
  const meta = await listConnections();
  const secrets = await readJson<Record<string, string>>(CONN_SECRET_PATH, {});
  secrets[platform] = token;
  await writeJson(CONN_SECRET_PATH, secrets);

  const entry: PlatformConnection = {
    platform,
    account,
    connected: token.length > 0,
    updatedAt: Date.now(),
  };
  const idx = meta.findIndex((c) => c.platform === platform);
  if (idx === -1) meta.push(entry);
  else meta[idx] = entry;
  await writeJson(CONN_META_PATH, meta);
  return entry;
}

export async function removeConnection(
  platform: PlatformConnection["platform"],
): Promise<void> {
  const meta = (await listConnections()).filter((c) => c.platform !== platform);
  await writeJson(CONN_META_PATH, meta);
  const secrets = await readJson<Record<string, string>>(CONN_SECRET_PATH, {});
  delete secrets[platform];
  await writeJson(CONN_SECRET_PATH, secrets);
}
