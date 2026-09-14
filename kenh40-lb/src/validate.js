export const PRIZE_POINTS = [
  200, 400, 600, 1000, 2000, 3000, 5000, 8000, 10000, 14000, 22000, 30000,
  40000, 50000, 100000,
];

export const MAX_ROWS = 100;
export const NAME_MIN = 1;
export const NAME_MAX = 24;
export const CORRECT_MIN = 0;
export const CORRECT_MAX = 15;
export const MS_MIN = 3000;
export const MS_MAX = 7_200_000;
export const FAST_CORRECT_FLOOR = 3;
export const MIN_MS_FLOOR = 8000;
export const MIN_MS_PER_CORRECT = 2500;

/** Extra minimum duration for correct >= 3: max(8000, correct * 2500). */
export function minPlayMs(correct) {
  if (!Number.isInteger(correct) || correct < FAST_CORRECT_FLOOR) return null;
  return Math.max(MIN_MS_FLOOR, correct * MIN_MS_PER_CORRECT);
}

/**
 * @param {number} correct
 * @param {number} ms
 * @param {string} [startedAt]
 * @param {number} [now]
 */
export function validatePlayTiming(correct, ms, startedAt, now = Date.now()) {
  const playMin = minPlayMs(correct);
  if (playMin == null) return { ok: true };
  if (ms < playMin) {
    return {
      ok: false,
      error: `ms must be at least ${playMin} when correct>=3 (max(8000, correct*2500))`,
    };
  }
  if (startedAt) {
    const started = Date.parse(startedAt);
    if (!Number.isNaN(started) && now - started < playMin) {
      return {
        ok: false,
        error: `run too short for correct>=3 (need ${playMin}ms of wall time)`,
      };
    }
  }
  return { ok: true };
}

function isInt(value) {
  return typeof value === "number" && Number.isInteger(value);
}

function expectedScore(correct) {
  if (correct === 0) return 0;
  return PRIZE_POINTS[correct - 1];
}

/**
 * @param {unknown} body
 * @param {{ now?: () => Date, id?: () => string }} [opts]
 * @returns {{ ok: true, row: object } | { ok: false, error: string }}
 */
export function validateEntry(body, opts = {}) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "JSON object required" };
  }

  const { name, correct, score, ms, at } = body;

  if (typeof name !== "string") {
    return { ok: false, error: "name must be a string of 1..24 characters" };
  }
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
    return { ok: false, error: "name must be a string of 1..24 characters" };
  }

  if (!isInt(correct) || correct < CORRECT_MIN || correct > CORRECT_MAX) {
    return { ok: false, error: "correct must be an integer 0..15" };
  }

  if (!isInt(score) || score !== expectedScore(correct)) {
    return {
      ok: false,
      error: "score must be 0 when correct=0, otherwise PRIZE_POINTS[correct-1]",
    };
  }

  if (!isInt(ms) || ms < MS_MIN || ms > MS_MAX) {
    return { ok: false, error: "ms must be an integer in [3000, 7200000]" };
  }

  const playMin = minPlayMs(correct);
  if (playMin != null && ms < playMin) {
    return {
      ok: false,
      error: `ms must be at least ${playMin} when correct>=3 (max(8000, correct*2500))`,
    };
  }

  let atValue;
  if (at === undefined || at === null || at === "") {
    atValue = (opts.now ? opts.now() : new Date()).toISOString();
  } else if (typeof at === "string") {
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed)) {
      return { ok: false, error: "at must be a valid ISO-8601 timestamp" };
    }
    atValue = new Date(parsed).toISOString();
  } else if (isInt(at) && at >= 0) {
    atValue = new Date(at).toISOString();
  } else {
    return { ok: false, error: "at must be a valid ISO-8601 timestamp or unix ms" };
  }

  const id = opts.id ? opts.id() : crypto.randomUUID();

  return {
    ok: true,
    row: {
      id,
      name: trimmed,
      correct,
      score,
      ms,
      at: atValue,
    },
  };
}

export function sortAndTrim(rows) {
  return [...rows]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.ms - b.ms;
    })
    .slice(0, MAX_ROWS);
}
