import {
  advance,
  panePositions,
  Position,
  positionFromPane,
} from "./scrollMap";

export interface Scrollable {
  scrollTop: number;
}

/** Pixel offsets of the common anchors in each pane: same length n >= 2,
 *  starting at 0 and ending at that pane's scroll max. */
export interface AnchorOffsets {
  a: number[];
  b: number[];
}

type Side = "a" | "b";

/** Keeps two panes in step through one shared anchor-segment position, so
 *  no sequence of scrolls can leave them out of step. Scroll events caused
 *  by its own writes are recognized and ignored. */
export const makeAnchorSync = () => {
  let pos: Position = { k: 0, t: 0 };
  const written = new WeakMap<Scrollable, number>();
  const ours = (el: Scrollable): boolean => {
    const top = written.get(el);
    return top !== undefined && Math.abs(el.scrollTop - top) < 1;
  };

  const apply = (a: Scrollable, b: Scrollable, offsets: AnchorOffsets) => {
    const target = panePositions(pos, offsets.a, offsets.b);
    a.scrollTop = target.a;
    b.scrollTop = target.b;
    written.set(a, a.scrollTop);
    written.set(b, b.scrollTop);
  };

  const pick = (side: Side, a: Scrollable, b: Scrollable) =>
    side === "a" ? a : b;

  const wheel = (
    driver: Side,
    a: Scrollable,
    b: Scrollable,
    delta: number,
    offsets: AnchorOffsets
  ): void => {
    const el = pick(driver, a, b);
    // Moved by someone else since our last write (or never written: a pane
    // for a new sample) — the stored position is stale.
    if (!ours(el))
      pos = positionFromPane(driver, el.scrollTop, offsets.a, offsets.b);
    pos = advance(pos, driver, delta, offsets.a, offsets.b);
    apply(a, b, offsets);
  };

  const scrolled = (
    source: Side,
    a: Scrollable,
    b: Scrollable,
    offsets: AnchorOffsets,
    enabled: boolean
  ): void => {
    const el = pick(source, a, b);
    if (ours(el)) return;
    written.set(el, el.scrollTop);
    if (!enabled) return;
    pos = positionFromPane(source, el.scrollTop, offsets.a, offsets.b);
    apply(a, b, offsets);
  };

  const snap = (
    leader: Side,
    a: Scrollable,
    b: Scrollable,
    offsets: AnchorOffsets
  ): void => {
    pos = positionFromPane(
      leader,
      pick(leader, a, b).scrollTop,
      offsets.a,
      offsets.b
    );
    apply(a, b, offsets);
  };

  return { wheel, scrolled, snap };
};
