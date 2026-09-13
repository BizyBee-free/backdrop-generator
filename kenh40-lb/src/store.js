const KV_KEY = "rows";

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

async function cfHeaders() {
  return {
    Authorization: `Bearer ${env("CF_API_TOKEN")}`,
  };
}

function cfValueUrl() {
  const account = env("CF_ACCOUNT_ID");
  const ns = env("CF_KV_NAMESPACE_ID");
  return `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${ns}/values/${KV_KEY}`;
}

async function githubHeaders() {
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

async function loadCf() {
  const res = await fetch(cfValueUrl(), { headers: await cfHeaders() });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`CF KV read failed: ${res.status}`);
  }
  return parseRows(await res.text());
}

async function saveCf(rows) {
  const res = await fetch(cfValueUrl(), {
    method: "PUT",
    headers: {
      ...(await cfHeaders()),
      "Content-Type": "text/plain",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`CF KV write failed: ${res.status}`);
  }
}

async function loadGithub() {
  const res = await fetch(githubContentsUrl(), { headers: await githubHeaders() });
  if (res.status === 404) return { rows: [], sha: null };
  if (!res.ok) {
    throw new Error(`GitHub read failed: ${res.status}`);
  }
  const data = await res.json();
  const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { rows: parseRows(text), sha: data.sha };
}

async function saveGithub(rows, sha) {
  const path = env("GITHUB_PATH") || "kenh40-lb/data/leaderboard.json";
  const branch = env("GITHUB_BRANCH");
  const body = {
    message: "chore: update kenh40 leaderboard",
    content: Buffer.from(JSON.stringify({ rows }, null, 2) + "\n", "utf8").toString("base64"),
  };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;
  const res = await fetch(githubContentsUrl().split("?")[0], {
    method: "PUT",
    headers: {
      ...(await githubHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub write failed: ${res.status}`);
  }
}

export function storageMode() {
  if (env("CF_API_TOKEN") && env("CF_ACCOUNT_ID") && env("CF_KV_NAMESPACE_ID")) {
    return "cf-kv";
  }
  if (env("GITHUB_TOKEN") && env("GITHUB_REPO")) {
    return "github";
  }
  return "none";
}

export async function loadRows() {
  const mode = storageMode();
  if (mode === "cf-kv") return loadCf();
  if (mode === "github") return (await loadGithub()).rows;
  return [];
}

export async function saveRows(rows) {
  const mode = storageMode();
  if (mode === "cf-kv") return saveCf(rows);
  if (mode === "github") {
    const current = await loadGithub();
    return saveGithub(rows, current.sha);
  }
  throw new Error("No durable store configured");
}
