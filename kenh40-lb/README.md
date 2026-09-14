# kenh40-lb

Public leaderboard API for the kenh40 quiz game.

Browser clients call this HTTPS API only. Admin reset and KV credentials stay on the server. There is no client-held wipe token.

## Live base URL

**https://temporary-turbo-sable-ih9bdkp.vercel.app**

Anonymous Vercel + Brewpage JSON store (HMAC run tokens). **Claim the Vercel URL within 60 minutes** (link in the PR) or it expires again.

## Client integration (start-token flow)

1. When a player **starts** a quiz, `POST /api/run/start` (empty body is fine).
2. Store `{ runToken, startedAt }` in page memory (not `localStorage` across days). Token TTL is **~2 hours**, one successful submit.
3. When the quiz **ends**, `POST /api/leaderboard` with the token in `X-Run-Token` **or** `body.runToken`.
4. Do **not** send `RESET_KEY` or any admin secret from the browser.

```js
const BASE = "https://temporary-turbo-sable-ih9bdkp.vercel.app";

const start = await fetch(`${BASE}/api/run/start`, { method: "POST" });
const { runToken } = await start.json();

// ... player plays the quiz ...

const submit = await fetch(`${BASE}/api/leaderboard`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Run-Token": runToken,
  },
  body: JSON.stringify({ name, correct, score, ms }),
});
```

## Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/api/leaderboard` | none |
| `POST` | `/api/run/start` | none → `{runToken, startedAt}` |
| `POST` | `/api/leaderboard` | unused `X-Run-Token` / `runToken` |
| `POST` | `/api/leaderboard/reset` | server env `RESET_KEY` via `X-Reset-Key` (never ship in the client) |

GET returns top 100 rows sorted score desc, then ms asc.

## Validation (server-enforced)

| Field | Rule |
| --- | --- |
| `name` | string, 1..24 characters (trimmed) |
| `correct` | integer 0..15 |
| `score` | `0` if `correct=0`, else `PRIZE_POINTS[correct-1]` |
| `ms` | integer in `[3000, 7200000]` |
| `ms` when `correct>=3` | `ms >= max(8000, correct*2500)` (tunable anti-instant-perfect) |
| wall time when `correct>=3` | `now - startedAt` must also meet that minimum |
| `at` | optional ISO-8601 or unix ms |

`PRIZE_POINTS = [200,400,600,1000,2000,3000,5000,8000,10000,14000,22000,30000,40000,50000,100000]`

Also:

- Missing / unknown / already-used run token → **400**
- `POST /api/leaderboard` rate limit: **5 per IP per 10 minutes** (best effort, KV) → **429**
- Invalid bodies → **400**

This does **not** prove a player answered questions. It blocks instant 15/100000/3000ms dumps and requires a fresh server-issued token per submit.

## CORS

Responses send `Access-Control-Allow-Origin: *` so any web origin can call the API. That is convenient for a static quiz host, but **any site can start a run and POST**. Do not treat CORS as access control. Rate limits and run tokens are the request-layer controls; a dedicated origin allow-list is stricter if you later lock the game to one domain.

## Example curl

```bash
BASE=https://temporary-turbo-sable-ih9bdkp.vercel.app

# GET
curl -sS "$BASE/api/leaderboard"

# Start a run, then submit (correct=1 does not need the 8s floor)
TOKEN=$(curl -sS -X POST "$BASE/api/run/start" | python3 -c "import sys,json; print(json.load(sys.stdin)['runToken'])")
curl -sS -X POST "$BASE/api/leaderboard" \
  -H "Content-Type: application/json" \
  -H "X-Run-Token: $TOKEN" \
  -d '{"name":"Bee","correct":1,"score":200,"ms":4000}'

# Instant perfect 15 / 3000ms → 400 (no token even needed after start)
curl -sS -X POST "$BASE/api/leaderboard" \
  -H "Content-Type: application/json" \
  -H "X-Run-Token: $TOKEN" \
  -d '{"name":"Hacker","correct":15,"score":100000,"ms":3000}'

# Admin reset (server key only — not for the browser)
curl -sS -X POST "$BASE/api/leaderboard/reset" \
  -H "X-Reset-Key: $RESET_KEY"
```

## Storage

Rows, run tokens (2h TTL), and rate-limit windows live in **Cloudflare Workers KV**. `RESET_KEY` is a Vercel/Worker env var only.

## Deploy

```bash
cd kenh40-lb
npx vercel deploy --temporary --yes \
  -e CF_ACCOUNT_ID=... \
  -e CF_API_TOKEN=... \
  -e CF_KV_NAMESPACE_ID=... \
  -e RESET_KEY=...
```
