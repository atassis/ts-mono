export interface Position {
  k: number;
  t: number;
}

const EPS = 1e-9;

/** Ratio of the longer segment side to the shorter (floor 1px) past which
 *  the shorter side pauses at its end instead of scaling to match. */
export const segmentMode = (
  la: number,
  lb: number,
  ratio: number = 3
): "proportional" | "pause" =>
  Math.max(la, lb) / Math.max(Math.min(la, lb), 1) <= ratio
    ? "proportional"
    : "pause";

const segment = (
  k: number,
  offsetsA: number[],
  offsetsB: number[]
): { startA: number; startB: number; la: number; lb: number } => ({
  startA: offsetsA[k] ?? 0,
  startB: offsetsB[k] ?? 0,
  la: (offsetsA[k + 1] ?? 0) - (offsetsA[k] ?? 0),
  lb: (offsetsB[k + 1] ?? 0) - (offsetsB[k] ?? 0),
});

const sideAt = (
  t: number,
  start: number,
  l: number,
  lmax: number,
  mode: "proportional" | "pause"
): number => (mode === "proportional" ? start + t * l : start + Math.min(t * lmax, l));

const clampPos = (pos: Position, maxK: number): Position => ({
  k: Math.min(Math.max(pos.k, 0), maxK),
  t: Math.min(Math.max(pos.t, 0), 1),
});

export const panePositions = (
  pos: Position,
  offsetsA: number[],
  offsetsB: number[],
  ratio: number = 3
): { a: number; b: number } => {
  const maxK = offsetsA.length - 2;
  const { k, t } = clampPos(pos, maxK);
  const { startA, startB, la, lb } = segment(k, offsetsA, offsetsB);
  const mode = segmentMode(la, lb, ratio);
  const lmax = Math.max(la, lb);
  return {
    a: sideAt(t, startA, la, lmax, mode),
    b: sideAt(t, startB, lb, lmax, mode),
  };
};

/** Largest k with offsets[k] <= px (canonical: a boundary value resolves to
 *  t=0 of the later segment, not t=1 of the earlier one). */
const segmentForPx = (offsets: number[], px: number, maxK: number): number => {
  for (let i = maxK; i >= 0; i--) {
    if ((offsets[i] ?? 0) <= px + EPS) return i;
  }
  return 0;
};

export const positionFromPane = (
  side: "a" | "b",
  px: number,
  offsetsA: number[],
  offsetsB: number[],
  ratio: number = 3
): Position => {
  const offsets = side === "a" ? offsetsA : offsetsB;
  const maxK = offsetsA.length - 2;
  const max = offsets[offsets.length - 1] ?? 0;
  const min = offsets[0] ?? 0;
  const clamped = Math.min(Math.max(px, min), max);
  if (clamped >= max - EPS) return { k: maxK, t: 1 };

  const k = segmentForPx(offsets, clamped, maxK);
  const { startA, startB, la, lb } = segment(k, offsetsA, offsetsB);
  const mode = segmentMode(la, lb, ratio);
  const lmax = Math.max(la, lb);
  const start = side === "a" ? startA : startB;
  const l = side === "a" ? la : lb;
  const local = clamped - start;

  let t: number;
  if (l <= 0) {
    t = 0;
  } else if (mode === "proportional") {
    t = local / l;
  } else if (local >= l - EPS) {
    // Resting: several t reach this px once the side has stopped moving;
    // pick the smallest one, i.e. the t at which it first arrives.
    t = l / lmax;
  } else {
    t = local / lmax;
  }
  return { k, t: Math.min(Math.max(t, 0), 1) };
};

/** A segment boundary landed on exactly (t=1) canonicalizes to (k+1, t=0),
 *  matching positionFromPane's convention, except at the absolute END. */
const canonicalize = (pos: Position, maxK: number): Position =>
  pos.t >= 1 - EPS && pos.k < maxK ? { k: pos.k + 1, t: 0 } : pos;

export const advance = (
  pos: Position,
  driver: "a" | "b",
  deltaPx: number,
  offsetsA: number[],
  offsetsB: number[],
  ratio: number = 3
): Position => {
  const maxK = offsetsA.length - 2;
  let { k, t } = clampPos(pos, maxK);
  let remaining = deltaPx;

  while (Math.abs(remaining) > EPS) {
    const s = remaining > 0 ? 1 : -1;
    const { la, lb } = segment(k, offsetsA, offsetsB);
    const ld = driver === "a" ? la : lb;
    const lo = driver === "a" ? lb : la;
    const mode = segmentMode(la, lb, ratio);
    const lmax = Math.max(la, lb);

    // Fraction of the segment over which the driver itself still moves;
    // beyond it the driver rests and the other side's motion is used
    // instead, so the wheel still pages through its extra content.
    const thrD =
      mode === "proportional"
        ? ld > 0
          ? 1
          : 0
        : ld >= lmax
          ? 1
          : lmax > 0
            ? ld / lmax
            : 0;

    const active = s > 0 ? t < thrD - EPS : t <= thrD + EPS;
    const rate = active
      ? mode === "proportional"
        ? ld
        : lmax
      : mode === "proportional"
        ? lo
        : lmax;
    const target = active ? (s > 0 ? thrD : 0) : s > 0 ? 1 : thrD;

    if (rate <= EPS) {
      t = target;
    } else {
      const capacity = rate * Math.abs(target - t);
      if (Math.abs(remaining) <= capacity + EPS) {
        t = t + remaining / rate;
        break;
      }
      remaining -= s * capacity;
      t = target;
    }

    if (t >= 1 - EPS && s > 0) {
      if (k >= maxK) {
        k = maxK;
        t = 1;
        break;
      }
      k += 1;
      t = 0;
    } else if (t <= EPS && s < 0) {
      if (k <= 0) {
        k = 0;
        t = 0;
        break;
      }
      k -= 1;
      t = 1;
    }
  }

  return canonicalize({ k, t }, maxK);
};
