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
 * pointer targets inside it as "still hovering".
 */
export const QUOTE_HOVER_POPOVER_ATTRIBUTE = "data-quote-feedback-hover";

export function mountQuoteHoverTracking(): () => void {
  let queued = false;
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
    quoteHoverStore.set(null);
    clearTrackingEmphasis();
  };

  const settle = () => {
    queued = false;
    const event = lastEvent;
    lastEvent = null;
    if (!event) return;

    const hit = hitTestQuotes(
      { x: event.clientX, y: event.clientY },
      quoteHighlights.itemRects(),
    );
    const target = event.target;
    const overPopover =
      target instanceof Element &&
      target.closest(`[${QUOTE_HOVER_POPOVER_ATTRIBUTE}]`) !== null;
    if (hit || overPopover) {
      window.clearTimeout(closeTimer);
      if (hit) {
        quoteHoverStore.set(hit);
        quoteHighlights.setEmphasis(hit);
        trackingEmphasis = hit;
      }
      return;
    }
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(close, 200);
  };

  const onMouseMove = (event: MouseEvent) => {
    lastEvent = event;
    if (queued) return;
    queued = true;
    requestAnimationFrame(settle);
  };
  const onScroll = () => {
    window.clearTimeout(closeTimer);
    close();
  };

  document.addEventListener("mousemove", onMouseMove, { passive: true });
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("scroll", onScroll, { capture: true });
    window.clearTimeout(closeTimer);
    close();
  };
}
