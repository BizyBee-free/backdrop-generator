import { createRun } from "../../src/store.js";
import { CORS_HEADERS } from "../../src/security.js";

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
  try {
    const started = await createRun();
    res.status(201).json(started);
  } catch (err) {
    res.status(503).json({ error: err.message || "cannot start run" });
  }
}
