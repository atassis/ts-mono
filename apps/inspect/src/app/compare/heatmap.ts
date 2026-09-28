// Sequential single-hue encoding (pass share is a magnitude, not a
// polarity): success green, intensity increasing with share. Bounds avoid
// both a fully transparent cell (reads as "no data", which the marks
// already claim) and a fully opaque one (would wash out the glyph on top).
const kMinAlpha = 0.08;
const kMaxAlpha = 0.55;

/** Fill alpha for `var(--bs-success-rgb)` at a given pass share (0…1). */
export const heatAlpha = (share: number): number =>
  kMinAlpha + (kMaxAlpha - kMinAlpha) * Math.min(1, Math.max(0, share));
