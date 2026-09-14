import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signRunToken, verifyRunToken } from "../src/security.js";

const secret = "kenh40_test_secret";

describe("HMAC run tokens", () => {
  it("round-trips a signed payload.hmac token", async () => {
    const startedAt = "2026-09-14T00:00:00.000Z";
    const token = await signRunToken(secret, {
      jti: "j_test",
      startedAt,
      exp: Date.now() + 60_000,
    });
    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const verified = await verifyRunToken(secret, token);
    assert.equal(verified.ok, true);
    assert.equal(verified.jti, "j_test");
    assert.equal(verified.startedAt, startedAt);
  });

  it("rejects a tampered token and a wrong secret", async () => {
    const token = await signRunToken(secret, {
      jti: "j_test",
      startedAt: "2026-09-14T00:00:00.000Z",
      exp: Date.now() + 60_000,
    });
    const bad = await verifyRunToken(secret, token.slice(0, -2) + "xx");
    assert.equal(bad.ok, false);
    const wrong = await verifyRunToken("other", token);
    assert.equal(wrong.ok, false);
  });

  it("rejects an expired token", async () => {
    const token = await signRunToken(secret, {
      jti: "j_old",
      startedAt: "2026-09-14T00:00:00.000Z",
      exp: Date.now() - 1000,
    });
    const verified = await verifyRunToken(secret, token);
    assert.equal(verified.ok, false);
  });
});
