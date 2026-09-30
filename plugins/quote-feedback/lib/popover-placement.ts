/**
 * Pure popover placement geometry: given a passage's anchor rect, the
 * viewport, and the popover's size, decide where the popover goes. Above the
 * passage is preferred; the popover flips below when there is no room (and
 * back above when room returns), picks the roomier side when it fits
 * neither, and clamps horizontally inside the viewport. A zero-sized anchor
 * is treated as a point. No DOM types cross this boundary.
 */

export type AnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};
export type ViewportSize = { width: number; height: number };
export type PopoverSize = { width: number; height: number };
export type Placement = {
  top: number;
  left: number;
  placement: "above" | "below";
};

export function placePopover(
  anchor: AnchorRect,
  viewport: ViewportSize,
  popover: PopoverSize,
  { gap = 8, margin = 8 }: { gap?: number; margin?: number } = {},
): Placement {
  const anchorBottom = anchor.top + anchor.height;
  const spaceAbove = anchor.top - margin;
  const spaceBelow = viewport.height - margin - anchorBottom;
  const fitsAbove = spaceAbove >= popover.height + gap;
  const fitsBelow = spaceBelow >= popover.height + gap;
  const placement =
    fitsAbove || (!fitsBelow && spaceAbove >= spaceBelow) ? "above" : "below";

  const unclampedTop =
    placement === "above"
      ? anchor.top - gap - popover.height
      : anchorBottom + gap;
  const maxTop = viewport.height - margin - popover.height;
  const top = maxTop < margin ? margin : Math.min(Math.max(unclampedTop, margin), maxTop);

  const unclampedLeft = anchor.left + anchor.width / 2 - popover.width / 2;
  const maxLeft = viewport.width - margin - popover.width;
  const left =
    maxLeft < margin ? margin : Math.min(Math.max(unclampedLeft, margin), maxLeft);

  return { top, left, placement };
}
