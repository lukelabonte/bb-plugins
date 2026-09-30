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
import { QUOTE_HOVER_POPOVER_ATTRIBUTE } from "../lib/hover-tracking";
import { placePopover } from "../lib/popover-placement";
import { Button } from "@/components/ui/button";

/**
 * Popover shown while hovering a quote highlight in the transcript: the
 * comment plus edit (opens the anchored editor in edit mode) and delete
 * (immediate, matching the quote list's per-item ×). Anchored at the
 * passage's live rect; the content-script tracking layer closes it on
 * scroll, so the position is computed once per hover. Fails closed (renders
 * nothing) when the passage no longer resolves.
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
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const item = hoveredId
    ? (items.find((entry) => entry.id === hoveredId) ?? null)
    : null;

  useLayoutEffect(() => {
    if (!item) {
      setStyle(null);
      return;
    }
    const anchor = quoteHighlights.passageRect(item.id);
    if (!anchor) {
      setStyle(null);
      return;
    }
    const element = rootRef.current;
    const placement = placePopover(
      anchor,
      { width: window.innerWidth, height: window.innerHeight },
      {
        width: element?.offsetWidth ?? 288,
        height: element?.offsetHeight ?? 140,
      },
    );
    setStyle({ top: placement.top, left: placement.left });
  }, [item]);

  if (!item || !threadId || !style) return null;

  const remove = () =>
    void rpc
      .call("removeItem", { threadId, itemId: item.id })
      .then((draft) => {
        quoteHighlights.setDraft(draft);
        quoteHoverStore.set(null);
        onDeleted();
      })
      .catch((error: unknown) =>
        toast.error("Could not update quote", {
          description: error instanceof Error ? error.message : String(error),
        }),
      );

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
          onClick={() => {
            quoteHoverStore.set(null);
            quoteEditorStore.open({ mode: "edit", threadId, item });
          }}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Delete quote"
          onClick={remove}
        >
          ×
        </Button>
      </div>
    </div>
  );
}
