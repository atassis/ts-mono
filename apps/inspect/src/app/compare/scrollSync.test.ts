import { describe, expect, test } from "vitest";

import { makeScrollSync, Scrollable } from "./scrollSync";

// scrollTop clamps like a real element: [0, max].
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

describe("makeScrollSync", () => {
  test("scrollBoth moves both panes, and their scroll events are no-ops", () => {
    const sync = makeScrollSync();
    const a = pane(1000);
    const b = pane(1000);
    sync.scrollBoth(a, b, 120);
    expect([a.scrollTop, b.scrollTop]).toEqual([120, 120]);
    sync.onScroll(a, b, true);
    sync.onScroll(b, a, true);
    expect([a.scrollTop, b.scrollTop]).toEqual([120, 120]);
  });

  test("a shorter pane waits at its end instead of drifting out of step", () => {
    const sync = makeScrollSync();
    const short = pane(500);
    const long = pane(5000);
    sync.scrollBoth(short, long, 2000);
    expect([short.scrollTop, long.scrollTop]).toEqual([500, 2000]);
    // Their scroll events must not pull the long pane back.
    sync.onScroll(short, long, true);
    sync.onScroll(long, short, true);
    expect([short.scrollTop, long.scrollTop]).toEqual([500, 2000]);
    sync.scrollBoth(short, long, -1000);
    expect([short.scrollTop, long.scrollTop]).toEqual([500, 1000]);
    sync.scrollBoth(short, long, -800);
    expect([short.scrollTop, long.scrollTop]).toEqual([200, 200]);
  });

  test("onScroll carries other scrolls (scrollbar, keys) across", () => {
    const sync = makeScrollSync();
    const a = pane(1000);
    const b = pane(1000);
    a.scrollTop = 300;
    sync.onScroll(a, b, true);
    expect(b.scrollTop).toBe(300);
    sync.onScroll(b, a, true); // b's echo of our write
    expect(a.scrollTop).toBe(300);
  });

  test("onScroll does nothing when disabled", () => {
    const sync = makeScrollSync();
    const a = pane(1000);
    const b = pane(1000);
    a.scrollTop = 300;
    sync.onScroll(a, b, false);
    expect(b.scrollTop).toBe(0);
  });

  test("snap lines the follower up with the leader", () => {
    const sync = makeScrollSync();
    const a = pane(1000);
    const b = pane(1000);
    a.scrollTop = 640;
    sync.snap(a, b);
    expect(b.scrollTop).toBe(640);
    sync.onScroll(b, a, true); // the snap's own scroll event
    expect(a.scrollTop).toBe(640);
  });
});
