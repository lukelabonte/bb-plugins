/**
 * Pure pointer hit-testing over quote highlight rects. CSS Custom Highlights
 * emit no pointer events, so the content script throttles mousemove and asks
 * this module which quote (if any) is under the pointer.
 *
 * Overlap rule: when nested quotes both contain the point, the quote with
 * the smallest containing rect wins (the more specific passage); exact ties
 * resolve to the quote inserted first in the map. Rect edges count as
 * inside. No DOM types cross this boundary.
 */

export type HitRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};
export type Point = { x: number; y: number };

const contains = (rect: HitRect, point: Point) =>
  point.x >= rect.left &&
  point.x <= rect.right &&
  point.y >= rect.top &&
  point.y <= rect.bottom;

const area = (rect: HitRect) =>
  (rect.right - rect.left) * (rect.bottom - rect.top);

export function hitTestQuotes(
  point: Point,
  quotes: ReadonlyMap<string, readonly HitRect[]>,
): string | null {
  let winner: string | null = null;
  let winnerArea = Infinity;
  for (const [id, rects] of quotes) {
    for (const rect of rects) {
      if (!contains(rect, point)) continue;
      const size = area(rect);
      if (size < winnerArea) {
        winner = id;
        winnerArea = size;
      }
      break;
    }
  }
  return winner;
}
