import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { FeedbackItem, rpcContract } from "../contract";
import { quoteEditorStore } from "../lib/editor-store";
import { quoteHighlights } from "../lib/highlights";
import { quoteHoverStore } from "../lib/hover-store";
import {
  dismissQuoteHover,
  QUOTE_HOVER_POPOVER_ATTRIBUTE,
} from "../lib/hover-tracking";
import { placePopover } from "../lib/popover-placement";
import { Button } from "@/components/ui/button";

/**
 * Popover shown while hovering a quote highlight in the transcript: the
 * comment plus edit (opens the anchored editor in edit mode) and delete
 * (immediate, matching the quote list's per-item ×). Anchored at the
 * passage's live rect; the content-script tracking layer closes it on
 * scroll, so the position is computed once per hover. The root stays
 * mounted but visibility-hidden until measured, so every fresh open places
 * against the element's real size. Fails closed (renders nothing) when the
 * passage no longer resolves.
 */
export function QuoteHoverPopover({
  threadId,
  items,
  onDeleted,
}: {
  threadId: string | undefined;
  items: FeedbackItem[];
  onDeleted: () => void;
}) {
  const hoveredId = useSyncExternalStore(
    quoteHoverStore.subscribe,
    quoteHoverStore.getSnapshot,
    quoteHoverStore.getSnapshot,
  );
  const rpc = useRpc<typeof rpcContract>();
  const rootRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<{
    id: string;
    style: CSSProperties;
  } | null>(null);

  const item = hoveredId
    ? (items.find((entry) => entry.id === hoveredId) ?? null)
    : null;

  useLayoutEffect(() => {
    if (!item) {
      setPlaced(null);
      return;
    }
    const anchor = quoteHighlights.passageRect(item.id);
    const element = rootRef.current;
    if (!anchor || !element) {
      setPlaced(null);
      return;
    }
    // getBoundingClientRect is layout-viewport-relative; convert the anchor
    // into visual-viewport space (shrunk by the software keyboard), place,
    // then convert back for fixed positioning.
    const visual = window.visualViewport;
    const offsetTop = visual?.offsetTop ?? 0;
    const offsetLeft = visual?.offsetLeft ?? 0;
    const viewport = visual
      ? { width: visual.width, height: visual.height }
      : { width: window.innerWidth, height: window.innerHeight };
    const placement = placePopover(
      {
        top: anchor.top - offsetTop,
        left: anchor.left - offsetLeft,
        width: anchor.width,
        height: anchor.height,
      },
      viewport,
      { width: element.offsetWidth, height: element.offsetHeight },
    );
    setPlaced({
      id: item.id,
      style: {
        top: placement.top + offsetTop,
        left: placement.left + offsetLeft,
      },
    });
  }, [item]);

  if (!item || !threadId) return null;

  const remove = () => {
    if (busy) return;
    setBusy(true);
    void rpc
      .call("removeItem", { threadId, itemId: item.id })
      .then(() => {
        dismissQuoteHover();
        onDeleted();
      })
      .catch((error: unknown) =>
        toast.error("Could not update quote", {
          description: error instanceof Error ? error.message : String(error),
        }),
      )
      .finally(() => setBusy(false));
  };

  const style: CSSProperties =
    placed?.id === item.id ? placed.style : { visibility: "hidden" };

  return (
    <div
      ref={rootRef}
      {...{ [QUOTE_HOVER_POPOVER_ATTRIBUTE]: true }}
      role="dialog"
      aria-label="Quote actions"
      style={style}
      className="fixed z-40 w-72 rounded-lg border border-border bg-background p-3 text-sm shadow-xl"
    >
      <blockquote className="mb-1 line-clamp-2 border-l-2 border-border pl-2 text-xs text-muted-foreground">
        {item.quote}
      </blockquote>
      <p className="mb-2 line-clamp-4 whitespace-pre-wrap break-words text-foreground">
        {item.body}
      </p>
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            dismissQuoteHover();
            quoteEditorStore.open({ mode: "edit", threadId, item });
          }}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Delete quote"
          disabled={busy}
          onClick={remove}
        >
          ×
        </Button>
      </div>
    </div>
  );
}
