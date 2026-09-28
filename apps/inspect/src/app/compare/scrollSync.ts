export interface Scrollable {
  scrollTop: number;
}

/** Keeps two side-by-side panes at the same scroll position; a shorter pane
 *  rests at its end until the other comes back into its range. `scrollBoth`
 *  moves both in the same frame (wheel input); `onScroll` carries any other
 *  scroll (scrollbar drag, keys) across a frame later; `snap` lines one pane
 *  up with the other. Positions we write are recorded, so the scroll events
 *  they cause are recognized and ignored. */
export const makeScrollSync = () => {
  const last = new WeakMap<Scrollable, number>();
  const record = (...panes: Scrollable[]): void => {
    for (const p of panes) last.set(p, p.scrollTop);
  };

  const onScroll = (
    source: Scrollable,
    target: Scrollable | null | undefined,
    enabled: boolean
  ): void => {
    const moved = source.scrollTop !== (last.get(source) ?? 0);
    record(source);
    if (!enabled || !target || !moved) return;
    target.scrollTop = source.scrollTop;
    record(target);
  };

  const scrollBoth = (a: Scrollable, b: Scrollable, delta: number): void => {
    // The furthest pane holds the shared position; the other may be
    // resting at its own end.
    const position = Math.max(0, Math.max(a.scrollTop, b.scrollTop) + delta);
    a.scrollTop = position;
    b.scrollTop = position;
    record(a, b);
  };

  const snap = (leader: Scrollable, follower: Scrollable): void => {
    follower.scrollTop = leader.scrollTop;
    record(leader, follower);
  };

  return { onScroll, scrollBoth, snap };
};
