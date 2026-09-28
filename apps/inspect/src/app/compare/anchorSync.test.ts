import { describe, expect, test } from "vitest";

import { AnchorOffsets, makeAnchorSync, Scrollable } from "./anchorSync";

const pane = (max: number): Scrollable => {
  let top = 0;
  return {
    get scrollTop() {
      return top;
    },
    set scrollTop(value: number) {
      top = Math.max(0, Math.min(max, value));
    },
  };
};

// One common anchor in the middle: A reaches it at 100px, B at 300px.
// Segment 0 is proportional (100 vs 300, ratio 3); segment 1 pauses
// (900 vs 100: B rests at 400 while A reads on).
const offsets: AnchorOffsets = { a: [0, 100, 1000], b: [0, 300, 400] };

describe("makeAnchorSync", () => {
  test("wheel moves the driver 1:1 and the other side to the matching point", () => {
    const sync = makeAnchorSync();
    const a = pane(1000);
    const b = pane(400);
    sync.wheel("a", a, b, 50, offsets);
    expect([a.scrollTop, b.scrollTop]).toEqual([50, 150]);
    sync.wheel("a", a, b, 50, offsets);
    expect([a.scrollTop, b.scrollTop]).toEqual([100, 300]); // both on the anchor
  });

  test("the short side rests while the long side reads on, and both come back in step", () => {
    const sync = makeAnchorSync();
    const a = pane(1000);
    const b = pane(400);
    sync.wheel("a", a, b, 600, offsets);
    expect([a.scrollTop, b.scrollTop]).toEqual([600, 400]);
    sync.wheel("a", a, b, -500, offsets);
    expect([a.scrollTop, b.scrollTop]).toEqual([100, 300]); // back on the anchor
    sync.wheel("a", a, b, -100, offsets);
    expect([a.scrollTop, b.scrollTop]).toEqual([0, 0]);
  });

  test("scroll events from its own writes are ignored", () => {
    const sync = makeAnchorSync();
    const a = pane(1000);
    const b = pane(400);
    sync.wheel("a", a, b, 50, offsets);
    sync.scrolled("a", a, b, offsets, true);
    sync.scrolled("b", a, b, offsets, true);
    expect([a.scrollTop, b.scrollTop]).toEqual([50, 150]);
  });

  test("an outside scroll of one pane (scrollbar, tab jump) moves the other to match", () => {
    const sync = makeAnchorSync();
    const a = pane(1000);
    const b = pane(400);
    b.scrollTop = 300;
    sync.scrolled("b", a, b, offsets, true);
    expect(a.scrollTop).toBe(100);
  });

  test("does not follow while disabled", () => {
    const sync = makeAnchorSync();
    const a = pane(1000);
    const b = pane(400);
    b.scrollTop = 300;
    sync.scrolled("b", a, b, offsets, false);
    expect(a.scrollTop).toBe(0);
  });

  test("snap lines the other pane up with the leader", () => {
    const sync = makeAnchorSync();
    const a = pane(1000);
    const b = pane(400);
    a.scrollTop = 100;
    sync.snap("a", a, b, offsets);
    expect(b.scrollTop).toBe(300);
  });

  test("fresh panes (a new sample) resync from where they are", () => {
    const sync = makeAnchorSync();
    sync.wheel("a", pane(1000), pane(400), 700, offsets);
    const a = pane(1000);
    const b = pane(400);
    sync.wheel("a", a, b, 50, offsets);
    expect([a.scrollTop, b.scrollTop]).toEqual([50, 150]);
  });
});
