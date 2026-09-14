import { sortAndTrim, validateEntry, validatePlayTiming } from "../src/validate.js";
import { consumeRun, loadRows, peekRun, rateLimitIp, saveRows } from "../src/store.js";
import { CORS_HEADERS, clientIp, extractRunToken } from "../src/security.js";

function setCors(res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    const rows = sortAndTrim(await loadRows());
    res.status(200).json({ rows });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const limited = await rateLimitIp(clientIp(req));
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfterSec));
    res.status(429).json({ error: "rate limited" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : null;
  if (!body) {
    res.status(400).json({ error: "invalid JSON" });
    return;
  }

  const token = extractRunToken(req, body);
  const peek = await peekRun(token);
  if (!peek.ok) {
    res.status(400).json({ error: peek.error });
    return;
  }

  const result = validateEntry(body);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  const timing = validatePlayTiming(
    result.row.correct,
    result.row.ms,
    peek.startedAt,
  );
  if (!timing.ok) {
    res.status(400).json({ error: timing.error });
    return;
  }

  const consumed = await consumeRun(token);
  if (!consumed.ok) {
    res.status(400).json({ error: consumed.error });
    return;
  }

  const rows = await loadRows();
  rows.push(result.row);
  const next = sortAndTrim(rows);
  await saveRows(next);
  res.status(201).json({ rows: next });
}
