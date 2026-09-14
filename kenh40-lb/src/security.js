export const RUN_TTL_SEC = 2 * 60 * 60;
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Run-Token, X-Reset-Key",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
};

export function randomOpaqueToken(prefix = "r") {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${b64}`;
}

export function extractRunToken(reqLike, body) {
  const header =
    reqLike.headers?.["x-run-token"] ||
    reqLike.headers?.["X-Run-Token"] ||
    (typeof reqLike.headers?.get === "function" ? reqLike.headers.get("X-Run-Token") : null);
  if (typeof header === "string" && header.trim()) return header.trim();
  if (body && typeof body.runToken === "string" && body.runToken.trim()) {
    return body.runToken.trim();
  }
  return "";
}

export function extractResetKey(reqLike, body) {
  const header =
    reqLike.headers?.["x-reset-key"] ||
    reqLike.headers?.["X-Reset-Key"] ||
    (typeof reqLike.headers?.get === "function" ? reqLike.headers.get("X-Reset-Key") : null);
  if (typeof header === "string" && header.trim()) return header.trim();
  if (body && typeof body.resetKey === "string" && body.resetKey.trim()) {
    return body.resetKey.trim();
  }
  return "";
}

export function clientIp(reqLike) {
  const h = reqLike.headers || {};
  const get = (name) => {
    if (typeof h.get === "function") return h.get(name);
    return h[name] || h[name.toLowerCase()];
  };
  const xf = get("x-forwarded-for") || get("X-Forwarded-For");
  const first = Array.isArray(xf) ? xf[0] : xf;
  if (typeof first === "string" && first.trim()) return first.split(",")[0].trim();
  const real = get("x-real-ip") || get("cf-connecting-ip") || get("x-vercel-forwarded-for");
  const realFirst = Array.isArray(real) ? real[0] : real;
  if (typeof realFirst === "string" && realFirst.trim()) return realFirst.split(",")[0].trim();
  return reqLike.socket?.remoteAddress || "unknown";
}

function bytesToB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256B64url(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToB64url(new Uint8Array(sig));
}

/** Signed run token: base64url(JSON({jti,startedAt,exp})).hmac */
export async function signRunToken(secret, { jti, startedAt, exp }) {
  const payload = bytesToB64url(
    new TextEncoder().encode(JSON.stringify({ jti, startedAt, exp })),
  );
  const hmac = await hmacSha256B64url(secret, payload);
  return `${payload}.${hmac}`;
}

export async function verifyRunToken(secret, token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { ok: false, error: "invalid or expired run token" };
  }
  const idx = token.lastIndexOf(".");
  const payload = token.slice(0, idx);
  const hmac = token.slice(idx + 1);
  if (!payload || !hmac) return { ok: false, error: "invalid or expired run token" };
  const expected = await hmacSha256B64url(secret, payload);
  if (!timingSafeEqual(hmac, expected)) {
    return { ok: false, error: "invalid or expired run token" };
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
  } catch {
    return { ok: false, error: "invalid or expired run token" };
  }
  if (!data?.jti || !data?.startedAt || !data?.exp) {
    return { ok: false, error: "invalid or expired run token" };
  }
  if (Date.now() > Number(data.exp)) {
    return { ok: false, error: "invalid or expired run token" };
  }
  return { ok: true, jti: data.jti, startedAt: data.startedAt, exp: data.exp };
}

export function timingSafeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  const enc = new TextEncoder();
  const ba = enc.encode(left);
  const bb = enc.encode(right);
  const len = Math.max(ba.length, bb.length);
  let out = ba.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    out |= (ba[i] || 0) ^ (bb[i] || 0);
  }
  return out === 0;
}
