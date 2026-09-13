import { sortAndTrim, validateEntry, validatePlayTiming } from "./validate.js";
import {
  CORS_HEADERS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  RUN_TTL_SEC,
  clientIp,
  extractResetKey,
  extractRunToken,
  randomOpaqueToken,
  timingSafeEqual,
} from "./security.js";

const ROWS_KEY = "rows";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

async function loadRows(env) {
  const raw = await env.LEADERBOARD.get(ROWS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRows(env, rows) {
  await env.LEADERBOARD.put(ROWS_KEY, JSON.stringify(rows));
}

async function peekRun(env, token) {
  if (!token) return { ok: false, error: "run token required" };
  const raw = await env.LEADERBOARD.get(`run:${token}`);
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

async function rateLimit(env, ip) {
  const key = `rl:${ip || "unknown"}`;
  const now = Date.now();
  const raw = await env.LEADERBOARD.get(key);
  let hits = [];
  if (raw) {
    try {
      hits = JSON.parse(raw).hits || [];
    } catch {
      hits = [];
    }
  }
  hits = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((hits[0] + RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  await env.LEADERBOARD.put(key, JSON.stringify({ hits }), {
    expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  });
  return { ok: true };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        service: "kenh40-lb",
        endpoints: {
          start: "/api/run/start",
          leaderboard: "/api/leaderboard",
          reset: "/api/leaderboard/reset",
        },
      });
    }

    if (url.pathname === "/api/run/start" && request.method === "POST") {
      const runToken = randomOpaqueToken("r");
      const startedAt = new Date().toISOString();
      await env.LEADERBOARD.put(
        `run:${runToken}`,
        JSON.stringify({ startedAt, consumed: false }),
        { expirationTtl: RUN_TTL_SEC },
      );
      return json({ runToken, startedAt }, 201);
    }

    if (url.pathname === "/api/leaderboard/reset" && request.method === "POST") {
      const expected = env.RESET_KEY || "";
      if (!expected) return json({ error: "reset is not configured" }, 503);
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const provided = extractResetKey(request, body);
      if (!timingSafeEqual(provided, expected)) {
        return json({ error: "unauthorized" }, 401);
      }
      await saveRows(env, []);
      return json({ rows: [] });
    }

    if (url.pathname !== "/api/leaderboard") {
      return json({ error: "not found" }, 404);
    }

    if (request.method === "GET") {
      return json({ rows: sortAndTrim(await loadRows(env)) });
    }

    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    const limited = await rateLimit(env, clientIp(request));
    if (!limited.ok) {
      return json({ error: "rate limited" }, 429, {
        "Retry-After": String(limited.retryAfterSec),
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }

    const token = extractRunToken(request, body);
    const peek = await peekRun(env, token);
    if (!peek.ok) return json({ error: peek.error }, 400);

    const result = validateEntry(body);
    if (!result.ok) return json({ error: result.error }, 400);

    const timing = validatePlayTiming(result.row.correct, result.row.ms, peek.startedAt);
    if (!timing.ok) return json({ error: timing.error }, 400);

    const consumed = await peekRun(env, token);
    if (!consumed.ok) return json({ error: consumed.error }, 400);
    await env.LEADERBOARD.put(
      `run:${token}`,
      JSON.stringify({ startedAt: peek.startedAt, consumed: true }),
      { expirationTtl: RUN_TTL_SEC },
    );

    const rows = await loadRows(env);
    rows.push(result.row);
    const next = sortAndTrim(rows);
    await saveRows(env, next);
    return json({ rows: next }, 201);
  },
};
