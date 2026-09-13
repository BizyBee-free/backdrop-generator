import { sortAndTrim, validateEntry } from "./validate.js";

const KV_KEY = "rows";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS,
    },
  });
}

async function loadRows(env) {
  const raw = await env.LEADERBOARD.get(KV_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRows(env, rows) {
  await env.LEADERBOARD.put(KV_KEY, JSON.stringify(rows));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        service: "kenh40-lb",
        endpoints: {
          leaderboard: "/api/leaderboard",
        },
      });
    }

    if (url.pathname !== "/api/leaderboard") {
      return json({ error: "not found" }, 404);
    }

    if (request.method === "GET") {
      const rows = sortAndTrim(await loadRows(env));
      return json({ rows });
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }

      const result = validateEntry(body);
      if (!result.ok) {
        return json({ error: result.error }, 400);
      }

      const rows = await loadRows(env);
      rows.push(result.row);
      const next = sortAndTrim(rows);
      await saveRows(env, next);
      return json({ rows: next }, 201);
    }

    return json({ error: "method not allowed" }, 405);
  },
};
