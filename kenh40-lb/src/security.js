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
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  const real = get("x-real-ip") || get("cf-connecting-ip");
  if (typeof real === "string" && real.trim()) return real.trim();
  return reqLike.socket?.remoteAddress || "unknown";
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
