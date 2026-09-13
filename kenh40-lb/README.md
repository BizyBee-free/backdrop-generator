# kenh40-lb

Public leaderboard API for the kenh40 quiz game.

Browser clients call this HTTPS API only. Write credentials stay on the server. Spam POSTs can add one validated row; there is no client-held admin token that can wipe the board.

## Live base URL

**https://temporary-agile-argon-ou0k9uo.vercel.app**

Leaderboard: `GET` / `POST` `{BASE}/api/leaderboard`

This is an anonymous Vercel deployment (plus Cloudflare Workers KV for durable rows). **Claim it within 60 minutes** or the URL expires — claim links are in the PR description, not committed here.

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
  "rows": [
    {
      "id": "...",
      "name": "Bee",
      "correct": 3,
      "score": 600,
      "ms": 12000,
      "at": "2026-09-13T15:00:00.000Z"
    }
  ]
}
```

## Example curl

```bash
BASE=https://temporary-agile-argon-ou0k9uo.vercel.app

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

Rows persist in **Cloudflare Workers KV** (free tier). The Vercel function is the public HTTPS front because `*.workers.dev` on a temporary account is behind a bot challenge and is not usable as a CORS API.

`data/leaderboard.json` is a local seed/schema snapshot. Optional GitHub Contents writes are supported if you set `GITHUB_TOKEN`, `GITHUB_REPO`, and `GITHUB_PATH` (repo-scoped token, server-side only).

## Keep it after 60 minutes

1. Claim the Vercel deployment (link in the PR).
2. Claim the Cloudflare preview account (link in the PR) so KV survives.
3. Create a long-lived Cloudflare API token (or a repo-scoped GitHub PAT) and set it on the claimed Vercel project:
   - `CF_ACCOUNT_ID`
   - `CF_API_TOKEN`
   - `CF_KV_NAMESPACE_ID=6a1cedc6501648bc84076c58ad300bea`
   - or `GITHUB_TOKEN` + `GITHUB_REPO` + `GITHUB_PATH` + `GITHUB_BRANCH`

## Deploy

```bash
cd kenh40-lb
npx vercel deploy --temporary --yes \
  -e CF_ACCOUNT_ID=... \
  -e CF_API_TOKEN=... \
  -e CF_KV_NAMESPACE_ID=...
```

```bash
npx wrangler kv namespace create LEADERBOARD
# paste the id into wrangler.toml
npx wrangler deploy --temporary
```
