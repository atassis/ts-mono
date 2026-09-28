/** Column display order: identity (the order runs were added/selected in),
 *  the default and the only order the disagreement-first row sort assumes
 *  (baseline/run indices stay meaningful positions). */
export const defaultColumnOrder = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => i);

/** Best accuracy first; runs with no accuracy (still loading, or no
 *  common scorer) sort last, keeping their relative order. */
export const columnOrderByAccuracy = (
  accuracies: (number | undefined)[]
): number[] =>
  accuracies
    .map((accuracy, index) => ({ accuracy, index }))
    .sort((x, y) => {
      if (x.accuracy === undefined && y.accuracy === undefined)
        return x.index - y.index;
      if (x.accuracy === undefined) return 1;
      if (y.accuracy === undefined) return -1;
      return y.accuracy - x.accuracy || x.index - y.index;
    })
    .map(({ index }) => index);
