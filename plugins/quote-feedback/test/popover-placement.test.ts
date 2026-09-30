import { describe, expect, it } from "vitest";
import { placePopover } from "../lib/popover-placement";

const viewport = { width: 1000, height: 800 };
const popover = { width: 400, height: 200 };

describe("placePopover", () => {
  it("places the popover above the passage when there is room", () => {
    const result = placePopover(
      { top: 400, left: 300, width: 200, height: 40 },
      viewport,
      popover,
    );
    expect(result.placement).toBe("above");
    expect(result.top).toBe(400 - 8 - 200);
    // Centered on the passage: 300 + 100 - 200 = 200.
    expect(result.left).toBe(200);
  });

  it("flips below the passage when there is no room above", () => {
    const result = placePopover(
      { top: 100, left: 300, width: 200, height: 40 },
      viewport,
      popover,
    );
    expect(result.placement).toBe("below");
    expect(result.top).toBe(100 + 40 + 8);
  });

  it("flips back above once the passage has room above again", () => {
    const nearTop = placePopover(
      { top: 150, left: 300, width: 200, height: 40 },
      viewport,
      popover,
    );
    const scrolledDown = placePopover(
      { top: 400, left: 300, width: 200, height: 40 },
      viewport,
      popover,
    );
    expect(nearTop.placement).toBe("below");
    expect(scrolledDown.placement).toBe("above");
  });

  it("picks the roomier side when the popover fits neither above nor below", () => {
    const cramped = { width: 1000, height: 300 };
    const nearTop = placePopover(
      { top: 20, left: 300, width: 200, height: 40 },
      cramped,
      popover,
    );
    expect(nearTop.placement).toBe("below");
    const nearBottom = placePopover(
      { top: 240, left: 300, width: 200, height: 40 },
      cramped,
      popover,
    );
    expect(nearBottom.placement).toBe("above");
  });

  it("clamps horizontally when the passage sits near the right viewport edge", () => {
    const result = placePopover(
      { top: 400, left: 900, width: 90, height: 40 },
      viewport,
      popover,
    );
    expect(result.left).toBe(1000 - 8 - 400);
  });

  it("clamps horizontally when the passage sits near the left viewport edge", () => {
    const result = placePopover(
      { top: 400, left: 10, width: 90, height: 40 },
      viewport,
      popover,
    );
    expect(result.left).toBe(8);
  });

  it("anchors a zero-sized passage rect as a point", () => {
    const result = placePopover(
      { top: 400, left: 500, width: 0, height: 0 },
      viewport,
      popover,
    );
    expect(result.placement).toBe("above");
    expect(result.top).toBe(400 - 8 - 200);
    expect(result.left).toBe(500 - 200);
  });

  it("keeps a popover larger than the viewport inside the viewport margin", () => {
    const result = placePopover(
      { top: 400, left: 300, width: 200, height: 40 },
      { width: 300, height: 150 },
      popover,
    );
    expect(result.left).toBe(8);
    expect(result.top).toBe(8);
  });
});
