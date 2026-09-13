import { sortAndTrim, validateEntry } from "../src/validate.js";
import { loadRows, saveRows } from "../src/store.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
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

  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : null;
    if (!body) {
      res.status(400).json({ error: "invalid JSON" });
      return;
    }
    const result = validateEntry(body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const rows = await loadRows();
    rows.push(result.row);
    const next = sortAndTrim(rows);
    await saveRows(next);
    res.status(201).json({ rows: next });
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
