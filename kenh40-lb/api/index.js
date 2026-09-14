import { CORS_HEADERS } from "../src/security.js";

export default function handler(req, res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
  res.status(200).json({
    ok: true,
    service: "kenh40-lb",
    endpoints: {
      start: "/api/run/start",
      leaderboard: "/api/leaderboard",
      reset: "/api/leaderboard/reset",
    },
  });
}
