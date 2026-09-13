import { clearLeaderboard } from "../../src/store.js";
import { CORS_HEADERS, extractResetKey, timingSafeEqual } from "../../src/security.js";

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const expected = process.env.RESET_KEY || "";
  if (!expected) {
    res.status(503).json({ error: "reset is not configured" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const provided = extractResetKey(req, body);
  if (!timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  await clearLeaderboard();
  res.status(200).json({ rows: [] });
}
