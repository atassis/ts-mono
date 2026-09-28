export interface Scrollable {
  scrollTop: number;
}

/** Keeps two side-by-side panes scrolled together. `scrollBoth` moves both
 *  in the same frame (wheel input); `onScroll` carries any other scroll
 *  (scrollbar drag, keys) across a frame later; `snap` lines one pane up
 *  with the other. Positions are tracked per element, so the scroll events
 *  our own writes cause are recognized and ignored. */
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
    const delta = source.scrollTop - (last.get(source) ?? 0);
    record(source);
    if (!enabled || !target || delta === 0) return;
    target.scrollTop += delta;
    record(target);
  };

  const scrollBoth = (a: Scrollable, b: Scrollable, delta: number): void => {
    a.scrollTop += delta;
    b.scrollTop += delta;
    record(a, b);
  };

  const snap = (leader: Scrollable, follower: Scrollable): void => {
    follower.scrollTop = leader.scrollTop;
    record(leader, follower);
  };

  return { onScroll, scrollBoth, snap };
};
