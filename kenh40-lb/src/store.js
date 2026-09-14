import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  RUN_TTL_SEC,
  randomOpaqueToken,
  signRunToken,
  verifyRunToken,
} from "./security.js";

const ROWS_KEY = "rows";

function env(name) {
  return process.env[name] || "";
}

function parseRows(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
    return [];
  } catch {
    return [];
  }
}

function cfAuth() {
  return { Authorization: `Bearer ${env("CF_API_TOKEN")}` };
}

function cfBase() {
  const account = env("CF_ACCOUNT_ID");
  const ns = env("CF_KV_NAMESPACE_ID");
  return `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${ns}`;
}

export async function kvGet(key) {
  const res = await fetch(`${cfBase()}/values/${encodeURIComponent(key)}`, {
    headers: cfAuth(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`CF KV read failed: ${res.status}`);
  return await res.text();
}

export async function kvPut(key, value, { expirationTtl } = {}) {
  const url = new URL(`${cfBase()}/values/${encodeURIComponent(key)}`);
  if (expirationTtl) url.searchParams.set("expiration_ttl", String(expirationTtl));
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...cfAuth(), "Content-Type": "text/plain" },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`CF KV write failed: ${res.status}`);
}

export async function kvDelete(key) {
  const res = await fetch(`${cfBase()}/values/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: cfAuth(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`CF KV delete failed: ${res.status}`);
  }
}

export async function kvList(prefix) {
  const url = new URL(`${cfBase()}/keys`);
  if (prefix) url.searchParams.set("prefix", prefix);
  const res = await fetch(url, { headers: cfAuth() });
  if (!res.ok) throw new Error(`CF KV list failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.result) ? data.result.map((k) => k.name) : [];
}

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "kenh40-lb",
  };
  if (env("GITHUB_TOKEN")) {
    headers.Authorization = `Bearer ${env("GITHUB_TOKEN")}`;
  }
  return headers;
}

function githubContentsUrl() {
  const repo = env("GITHUB_REPO");
  const path = env("GITHUB_PATH") || "kenh40-lb/data/leaderboard.json";
  const branch = env("GITHUB_BRANCH");
  const url = new URL(`https://api.github.com/repos/${repo}/contents/${path}`);
  if (branch) url.searchParams.set("ref", branch);
  return url.toString();
}

async function loadGithub() {
  const res = await fetch(githubContentsUrl(), { headers: githubHeaders() });
  if (res.status === 404) return { rows: [], sha: null };
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const data = await res.json();
  const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { rows: parseRows(text), sha: data.sha };
}

async function saveGithub(rows, sha) {
  const branch = env("GITHUB_BRANCH");
  const body = {
    message: "chore: update kenh40 leaderboard",
    content: Buffer.from(JSON.stringify({ rows }, null, 2) + "\n", "utf8").toString("base64"),
  };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;
  const res = await fetch(githubContentsUrl().split("?")[0], {
    method: "PUT",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub write failed: ${res.status}`);
}

function brewpageConfigured() {
  return Boolean(
    env("BREWPAGE_OWNER_URL") && env("BREWPAGE_OWNER_TOKEN") && env("RUN_SECRET"),
  );
}

async function getBrewDoc() {
  const res = await fetch(env("BREWPAGE_OWNER_URL"), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Brewpage read failed: ${res.status}`);
  const data = await res.json();
  const inner =
    data && data.content && typeof data.content === "object" && !Array.isArray(data.content)
      ? data.content
      : data;
  return {
    rows: Array.isArray(inner?.rows) ? inner.rows : [],
    consumed: Array.isArray(inner?.consumed) ? inner.consumed : [],
    rl: inner?.rl && typeof inner.rl === "object" && !Array.isArray(inner.rl) ? inner.rl : {},
  };
}

async function putBrewDoc(doc) {
  const res = await fetch(env("BREWPAGE_OWNER_URL"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Owner-Token": env("BREWPAGE_OWNER_TOKEN"),
    },
    body: JSON.stringify({
      rows: doc.rows,
      consumed: (doc.consumed || []).slice(-400),
      rl: doc.rl || {},
    }),
  });
  if (!res.ok) throw new Error(`Brewpage write failed: ${res.status}`);
}

export function storageMode() {
  if (env("CF_API_TOKEN") && env("CF_ACCOUNT_ID") && env("CF_KV_NAMESPACE_ID")) {
    return "cf-kv";
  }
  if (brewpageConfigured()) {
    return "brewpage";
  }
  if (env("GITHUB_TOKEN") && env("GITHUB_REPO")) {
    return "github";
  }
  return "none";
}

export async function loadRows() {
  const mode = storageMode();
  if (mode === "cf-kv") return parseRows(await kvGet(ROWS_KEY));
  if (mode === "brewpage") return (await getBrewDoc()).rows;
  if (mode === "github") return (await loadGithub()).rows;
  return [];
}

export async function saveRows(rows) {
  const mode = storageMode();
  if (mode === "cf-kv") return kvPut(ROWS_KEY, JSON.stringify(rows));
  if (mode === "brewpage") {
    const doc = await getBrewDoc();
    doc.rows = rows;
    return putBrewDoc(doc);
  }
  if (mode === "github") {
    const current = await loadGithub();
    return saveGithub(rows, current.sha);
  }
  throw new Error("No durable store configured");
}

export async function createRun() {
  const mode = storageMode();
  const startedAt = new Date().toISOString();
  if (mode === "brewpage") {
    const jti = randomOpaqueToken("j");
    const exp = Date.now() + RUN_TTL_SEC * 1000;
    const runToken = await signRunToken(env("RUN_SECRET"), { jti, startedAt, exp });
    return { runToken, startedAt };
  }
  if (mode !== "cf-kv") {
    throw new Error("Run tokens require Cloudflare KV or Brewpage store");
  }
  const runToken = randomOpaqueToken("r");
  await kvPut(
    `run:${runToken}`,
    JSON.stringify({ startedAt, consumed: false }),
    { expirationTtl: RUN_TTL_SEC },
  );
  return { runToken, startedAt };
}

export async function peekRun(token) {
  if (!token) return { ok: false, error: "run token required" };
  if (storageMode() === "brewpage") {
    const verified = await verifyRunToken(env("RUN_SECRET"), token);
    if (!verified.ok) return verified;
    const doc = await getBrewDoc();
    if (doc.consumed.includes(verified.jti)) {
      return { ok: false, error: "run token already used" };
    }
    return { ok: true, startedAt: verified.startedAt, jti: verified.jti };
  }
  const raw = await kvGet(`run:${token}`);
  if (!raw) return { ok: false, error: "invalid or expired run token" };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid or expired run token" };
  }
  if (data.consumed) return { ok: false, error: "run token already used" };
  return { ok: true, startedAt: data.startedAt };
}

export async function consumeRun(token) {
  const peek = await peekRun(token);
  if (!peek.ok) return peek;
  if (storageMode() === "brewpage") {
    const doc = await getBrewDoc();
    if (doc.consumed.includes(peek.jti)) {
      return { ok: false, error: "run token already used" };
    }
    doc.consumed.push(peek.jti);
    await putBrewDoc(doc);
    return peek;
  }
  await kvPut(
    `run:${token}`,
    JSON.stringify({ startedAt: peek.startedAt, consumed: true }),
    { expirationTtl: RUN_TTL_SEC },
  );
  return peek;
}

export async function rateLimitIp(ip) {
  const mode = storageMode();
  const safeIp = String(ip || "unknown").replace(/[^a-zA-Z0-9.:_-]/g, "_");
  const now = Date.now();
  if (mode === "brewpage") {
    const doc = await getBrewDoc();
    const hits = (Array.isArray(doc.rl[safeIp]) ? doc.rl[safeIp] : []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    if (hits.length >= RATE_LIMIT_MAX) {
      return { ok: false, retryAfterSec: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
    }
    hits.push(now);
    doc.rl[safeIp] = hits;
    await putBrewDoc(doc);
    return { ok: true };
  }
  if (mode !== "cf-kv") return { ok: true };
  const prefix = `rl:${safeIp}:`;
  const keys = await kvList(prefix);
  if (keys.length >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterSec: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
  }
  await kvPut(`${prefix}${Date.now()}-${randomOpaqueToken("h")}`, "1", {
    expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  });
  return { ok: true };
}

export async function clearLeaderboard() {
  if (storageMode() === "brewpage") {
    await putBrewDoc({ rows: [], consumed: [], rl: {} });
    return;
  }
  await saveRows([]);
  if (storageMode() !== "cf-kv") return;
  try {
    const keys = await kvList("run:");
    await Promise.all(keys.map((k) => kvDelete(k)));
  } catch {
    // best effort — rows are already cleared
  }
}
