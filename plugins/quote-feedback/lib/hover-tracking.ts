import { hitTestQuotes } from "./hit-test";
import { quoteHighlights } from "./highlights";
import { quoteHoverStore } from "./hover-store";

/**
 * Content-script hover layer for quote highlights. CSS Custom Highlights
 * emit no pointer events, so a throttled mousemove hit-tests the pointer
 * against each quote's live range client rects. On hit, the hover store
 * opens the React popover at the passage and the passage takes the emphasis
 * state. Moving into the popover itself keeps it open (no flicker); leaving
 * both closes it. Scrolling closes the popover so it never floats detached
 * from its passage.
 *
 * The popover root carries `data-quote-feedback-hover`; hit-testing treats
 * pointer targets inside it as "still hovering" and never re-hits
 * coordinates, so the popover keeps its quote even while overlapping
 * another passage.
 */
export const QUOTE_HOVER_POPOVER_ATTRIBUTE = "data-quote-feedback-hover";

// Module-level close path so the React popover's own actions (Edit/Delete)
// dismiss the hover session exactly like the tracking layer does: store
// cleared, tracking emphasis cleared, timers cancelled.
let closeCurrent: (() => void) | null = null;
let activeMount: symbol | null = null;

export function dismissQuoteHover() {
  closeCurrent?.();
}

export function mountQuoteHoverTracking(): () => void {
  const token = Symbol("quote-feedback-hover-tracking");
  activeMount = token;
  let queued: number | null = null;
  let lastEvent: MouseEvent | null = null;
  // The emphasis this layer set; a flash set by the quote list is left
  // alone until its own timer clears it.
  let trackingEmphasis: string | null = null;
  // Crossing the gap between passage and popover must not close the
  // popover mid-transit, so closing is delayed and cancelled by any
  // subsequent hit.
  let closeTimer: number | undefined;

  const clearTrackingEmphasis = () => {
    if (
      trackingEmphasis !== null &&
      quoteHighlights.getEmphasis() === trackingEmphasis
    ) {
      quoteHighlights.setEmphasis(null);
    }
    trackingEmphasis = null;
  };

  const close = () => {
    window.clearTimeout(closeTimer);
    quoteHoverStore.set(null);
    clearTrackingEmphasis();
  };
  closeCurrent = close;

  const settle = () => {
    queued = null;
    const event = lastEvent;
    lastEvent = null;
    if (!event) return;

    // Inside the popover: keep the current quote, never re-hit.
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(`[${QUOTE_HOVER_POPOVER_ATTRIBUTE}]`) !== null
    ) {
      window.clearTimeout(closeTimer);
      return;
    }
    const hit = hitTestQuotes(
      { x: event.clientX, y: event.clientY },
      quoteHighlights.itemRects(),
    );
    if (hit) {
      window.clearTimeout(closeTimer);
      quoteHoverStore.set(hit);
      quoteHighlights.setEmphasis(hit);
      trackingEmphasis = hit;
      return;
    }
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(close, 200);
  };

  const onMouseMove = (event: MouseEvent) => {
    lastEvent = event;
    if (queued !== null) return;
    queued = requestAnimationFrame(settle);
  };
  const onScroll = () => close();

  document.addEventListener("mousemove", onMouseMove, { passive: true });
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => {
    if (activeMount !== token) return;
    activeMount = null;
    closeCurrent = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("scroll", onScroll, { capture: true });
    if (queued !== null) cancelAnimationFrame(queued);
    queued = null;
    lastEvent = null;
    close();
  };
}
