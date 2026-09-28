import { describe, expect, test } from "vitest";

import { anchorOffset } from "./anchorDom";

// jsdom lays out nothing, so rect/scrollTop are stubbed directly — mirrors
// the values a real scroller and row would report.
const rect = (top: number): DOMRect => ({
  top,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
});

const stubScroller = (scrollTop: number): HTMLElement => {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => rect(0);
  Object.defineProperty(el, "scrollTop", { value: scrollTop, configurable: true });
  return el;
};

const appendRow = (scroller: HTMLElement, id: string, top: number): void => {
  const row = document.createElement("div");
  row.id = id;
  row.getBoundingClientRect = () => rect(top);
  scroller.appendChild(row);
};

describe("anchorOffset", () => {
  test("resolves a rendered row by eventId (uuid)", () => {
    const scroller = stubScroller(50);
    appendRow(scroller, "uuid-123", 120);
    expect(anchorOffset(scroller, 3, "uuid-123")).toBe(170);
  });

  test("falls back to the position-based id when eventId is omitted", () => {
    const scroller = stubScroller(0);
    appendRow(scroller, "event_index_7", 40);
    expect(anchorOffset(scroller, 7)).toBe(40);
  });

  test("returns undefined for a row not currently mounted (virtualized out)", () => {
    const scroller = stubScroller(0);
    appendRow(scroller, "event_index_1", 10);
    expect(anchorOffset(scroller, 99, "some-other-uuid")).toBeUndefined();
  });

  test("escapes ids containing characters special to attribute selectors", () => {
    const scroller = stubScroller(0);
    appendRow(scroller, 'weird"id', 15);
    expect(anchorOffset(scroller, 0, 'weird"id')).toBe(15);
  });
});
