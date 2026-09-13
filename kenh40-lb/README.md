# kenh40-lb

Public leaderboard API for the kenh40 quiz game.

Browser clients call this HTTPS API only. Write credentials stay on the server (Cloudflare Workers KV). Spam POSTs can add one validated row; there is no client-held admin token that can wipe the board.

## Live base URL

**https://kenh40-lb.workers.dev** (placeholder — replaced after deploy)

Leaderboard: `GET/POST {BASE}/api/leaderboard`

## Validation (server-enforced)

| Field | Rule |
| --- | --- |
| `name` | string, 1..24 characters (trimmed) |
| `correct` | integer 0..15 |
| `score` | `0` if `correct=0`, else `PRIZE_POINTS[correct-1]` |
| `ms` | integer in `[3000, 7200000]` |
| `at` | optional ISO-8601 or unix ms; server sets `at` when omitted |

`PRIZE_POINTS = [200,400,600,1000,2000,3000,5000,8000,10000,14000,22000,30000,40000,50000,100000]`

Invalid bodies return **400**. CORS is `*`.

GET returns the top 100 rows sorted by `score` desc, then `ms` asc:

```json
{
  "rows": [{ "id": "...", "name": "Bee", "correct": 3, "score": 600, "ms": 12000, "at": "2026-09-13T15:00:00.000Z" }]
}
```

## Example curl

Replace `$BASE` with the live base URL above.

```bash
# GET
curl -sS "$BASE/api/leaderboard"

# POST (valid)
curl -sS -X POST "$BASE/api/leaderboard" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bee","correct":3,"score":600,"ms":12000}'

# POST (invalid score → 400)
curl -sS -o /dev/stderr -w "%{http_code}\n" -X POST "$BASE/api/leaderboard" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bee","correct":3,"score":999,"ms":12000}'
```

## Storage

Rows persist in **Cloudflare Workers KV** (`LEADERBOARD` / key `rows`) on the free tier. `data/leaderboard.json` is only a local seed/schema snapshot.

## Deploy

```bash
cd kenh40-lb
npx wrangler kv namespace create LEADERBOARD
# paste the id into wrangler.toml
npx wrangler deploy
```

Unauthenticated agents can use `npx wrangler deploy --temporary` and then **claim the preview account within 60 minutes** so the Worker + KV stay live.
