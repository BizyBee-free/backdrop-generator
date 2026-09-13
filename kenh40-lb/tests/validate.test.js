import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRIZE_POINTS,
  sortAndTrim,
  validateEntry,
} from "../src/validate.js";

const now = () => new Date("2026-09-13T15:00:00.000Z");
const id = () => "test-id";

function valid(overrides = {}) {
  return {
    name: "Bee",
    correct: 3,
    score: PRIZE_POINTS[2],
    ms: 12_000,
    ...overrides,
  };
}

describe("validateEntry", () => {
  it("accepts a valid score row", () => {
    const result = validateEntry(valid(), { now, id });
    assert.equal(result.ok, true);
    assert.deepEqual(result.row, {
      id: "test-id",
      name: "Bee",
      correct: 3,
      score: 600,
      ms: 12_000,
      at: "2026-09-13T15:00:00.000Z",
    });
  });

  it("requires score 0 when correct is 0", () => {
    const ok = validateEntry(valid({ correct: 0, score: 0 }), { now, id });
    assert.equal(ok.ok, true);
    const bad = validateEntry(valid({ correct: 0, score: 200 }), { now, id });
    assert.equal(bad.ok, false);
  });

  it("requires PRIZE_POINTS[correct-1] when correct > 0", () => {
    const ok = validateEntry(valid({ correct: 15, score: 100000, ms: 4000 }), {
      now,
      id,
    });
    assert.equal(ok.ok, true);
    const bad = validateEntry(valid({ correct: 1, score: 400 }), { now, id });
    assert.equal(bad.ok, false);
  });

  it("rejects name length outside 1..24", () => {
    assert.equal(validateEntry(valid({ name: "" })).ok, false);
    assert.equal(validateEntry(valid({ name: "   " })).ok, false);
    assert.equal(validateEntry(valid({ name: "x".repeat(25) })).ok, false);
    assert.equal(validateEntry(valid({ name: "x".repeat(24) }), { now, id }).ok, true);
  });

  it("rejects out-of-range correct and ms", () => {
    assert.equal(validateEntry(valid({ correct: -1, score: 0 })).ok, false);
    assert.equal(validateEntry(valid({ correct: 16, score: 100000 })).ok, false);
    assert.equal(validateEntry(valid({ ms: 2999 })).ok, false);
    assert.equal(validateEntry(valid({ ms: 7_200_001 })).ok, false);
    assert.equal(validateEntry(valid({ ms: 3000 }), { now, id }).ok, true);
    assert.equal(validateEntry(valid({ ms: 7_200_000 }), { now, id }).ok, true);
  });

  it("rejects non-integers", () => {
    assert.equal(validateEntry(valid({ correct: 1.5, score: 200 })).ok, false);
    assert.equal(validateEntry(valid({ score: 600.2 })).ok, false);
    assert.equal(validateEntry(valid({ ms: 3000.1 })).ok, false);
  });
});

describe("sortAndTrim", () => {
  it("sorts score desc then ms asc and keeps top 100", () => {
    const rows = [
      { id: "a", score: 200, ms: 9000 },
      { id: "b", score: 400, ms: 8000 },
      { id: "c", score: 400, ms: 5000 },
    ];
    for (let i = 0; i < 110; i++) {
      rows.push({ id: `pad-${i}`, score: 0, ms: 10_000 + i });
    }
    const sorted = sortAndTrim(rows);
    assert.equal(sorted.length, 100);
    assert.deepEqual(
      sorted.slice(0, 3).map((r) => r.id),
      ["c", "b", "a"],
    );
  });
});
