/**
 * Maps a transcript anchor (a `model` event, identified by its index in the
 * sample's `events` array) to a pixel offset in its pane's scroller.
 *
 * A transcript row's DOM id is the event's `uuid` when present, else a
 * position-based fallback `event_index_<n>` keyed to the event's index in
 * the sample's full `events` array — see
 * `packages/inspect-components/src/transcript/transform/treeify.ts`
 * (`eventFallbackIds`). `eventIndex` alone only resolves the fallback case;
 * pass `eventId` (the event's `uuid`) whenever it's known, since model
 * events in current logs normally carry one.
 */

const escapeId = (id: string): string =>
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(id)
    : id.replace(/"/g, '\\"');

const domIdFor = (eventIndex: number, eventId?: string): string =>
  eventId ?? `event_index_${eventIndex}`;

/**
 * Pixel offset of the anchor's row within `scroller`'s scrollable content —
 * setting `scroller.scrollTop` to this value puts the row at the scroller's
 * visible top. Returns undefined when the row isn't currently mounted:
 * TanStack Virtual only renders rows near the viewport (plus overscan), so
 * this only resolves anchors already on screen. Unrendered rows have no
 * offset reachable from the DOM alone — see notes/anchor-dom-report.md.
 */
export const anchorOffset = (
  scroller: HTMLElement,
  eventIndex: number,
  eventId?: string
): number | undefined => {
  const row = scroller.querySelector<HTMLElement>(
    `[id="${escapeId(domIdFor(eventIndex, eventId))}"]`
  );
  if (!row) return undefined;
  return (
    row.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop
  );
};
