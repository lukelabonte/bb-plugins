import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  useBbContext,
  useRealtime,
  useRpc,
  type ExperimentalAppOverlayProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { FeedbackItem, rpcContract } from "../contract";
import { quoteEditorStore } from "../lib/editor-store";
import { quoteHighlights } from "../lib/highlights";
import { placePopover } from "../lib/popover-placement";
import { QuoteHoverPopover } from "./QuoteHoverPopover";
import { QuoteItemEditor } from "./QuoteItemEditor";
import { Button } from "@/components/ui/button";

/** Keeps the floating editor above the software keyboard on compact viewports. */
function useVisibleMobileViewport(open: boolean): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();

  useEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }
    const viewport = window.visualViewport;
    const mobile = window.matchMedia?.("(max-width: 639px)");
    const update = () => {
      if (!viewport || !mobile?.matches) {
        setStyle(undefined);
        return;
      }
      setStyle({
        top: `calc(${viewport.offsetTop}px + max(0.75rem, env(safe-area-inset-top)))`,
        bottom: "auto",
        maxHeight: `max(11.25rem, calc(${viewport.height}px - max(1rem, env(safe-area-inset-top)) - 0.5rem))`,
      });
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    mobile?.addEventListener("change", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      mobile?.removeEventListener("change", update);
    };
  }, [open]);

  return style;
}

export function QuoteOverlay(_props: ExperimentalAppOverlayProps) {
  const request = useSyncExternalStore(
    quoteEditorStore.subscribe,
    quoteEditorStore.getSnapshot,
    quoteEditorStore.getSnapshot,
  );
  const rpc = useRpc<typeof rpcContract>();
  const { threadId: visibleThreadId } = useBbContext();
  const visibleThreadRef = useRef(visibleThreadId);
  visibleThreadRef.current = visibleThreadId;
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const viewportStyle = useVisibleMobileViewport(request !== null);

  // The overlay is app-wide, so it owns restoring passage highlights for
  // whichever thread is visible, independent of the composer pill.
  const [highlightDraft, setHighlightDraft] = useState<{
    threadId: string;
    items: FeedbackItem[];
  } | null>(null);
  const loadHighlightDraft = useCallback(async () => {
    if (!visibleThreadId) return;
    const draft = await rpc.call("getDraft", { threadId: visibleThreadId });
    if (visibleThreadRef.current === visibleThreadId) {
      quoteHighlights.setDraft(draft);
      setHighlightDraft({ threadId: draft.threadId, items: draft.items });
    }
  }, [rpc, visibleThreadId]);

  useEffect(() => {
    if (!visibleThreadId) return;
    void loadHighlightDraft().catch(() => {
      if (visibleThreadRef.current === visibleThreadId) {
        quoteHighlights.deactivateThread(visibleThreadId);
      }
    });
    return () => quoteHighlights.deactivateThread(visibleThreadId);
  }, [loadHighlightDraft, visibleThreadId]);
  useRealtime("draft-changed", () => {
    void loadHighlightDraft().catch(() => {});
  });

  // Anchored placement: the editor tracks the live passage rect (selection
  // range for create, resolved quote range for edit) and flips above/below
  // at viewport edges. No rect → fail open to the fixed position classes.
  const sectionRef = useRef<HTMLElement>(null);
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties | null>(null);
  const anchorId =
    request?.mode === "create"
      ? request.selection.invocationId
      : request?.mode === "edit"
        ? request.item.id
        : null;

  useLayoutEffect(() => {
    if (!anchorId) {
      setAnchorStyle(null);
      return;
    }
    const reposition = () => {
      const rect = quoteHighlights.passageRect(anchorId);
      if (!rect) {
        setAnchorStyle(null);
        return;
      }
      // Fixed coordinates live in the layout viewport; convert the anchor
      // into visual-viewport space (shrunk by the software keyboard),
      // place, then convert back.
      const visual = window.visualViewport;
      const offsetTop = visual?.offsetTop ?? 0;
      const offsetLeft = visual?.offsetLeft ?? 0;
      const viewport = visual
        ? { width: visual.width, height: visual.height }
        : { width: window.innerWidth, height: window.innerHeight };
      const width = Math.min(448, viewport.width - 16);
      const placement = placePopover(
        {
          top: rect.top - offsetTop,
          left: rect.left - offsetLeft,
          width: rect.width,
          height: rect.height,
        },
        viewport,
        {
          width,
          height: sectionRef.current?.offsetHeight ?? 320,
        },
      );
      setAnchorStyle({
        top: placement.top + offsetTop,
        left: placement.left + offsetLeft,
        right: "auto",
        bottom: "auto",
        width,
      });
    };
    reposition();
    window.addEventListener("scroll", reposition, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, { capture: true });
      window.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [anchorId]);

  const close = () => {
    if (busy) return;
    if (request?.mode === "create") {
      quoteHighlights.cancelSelection(request.selection.invocationId);
    }
    quoteEditorStore.close();
  };

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request, busy]);

  return (
    <>
      {highlightDraft && highlightDraft.threadId === visibleThreadId ? (
        <QuoteHoverPopover
          threadId={visibleThreadId}
          items={highlightDraft.items}
          onDeleted={() => void loadHighlightDraft().catch(() => {})}
        />
      ) : null}
      {!request ? null : (
        <section
          ref={sectionRef}
          data-quote-feedback-ui
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          style={anchorStyle ?? viewportStyle}
          className="fixed left-3 right-3 top-[max(0.5rem,env(safe-area-inset-top))] z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-xl sm:bottom-[max(5rem,env(safe-area-inset-bottom))] sm:left-auto sm:right-4 sm:top-auto sm:max-h-[min(34rem,calc(100vh-6rem))] sm:w-full sm:max-w-md"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-base font-semibold">
              {request.mode === "create" ? "Add quote" : "Edit quote"}
            </h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Close quote editor"
              disabled={busy}
              onClick={close}
            >
              ×
            </Button>
          </div>
          <QuoteItemEditor
            key={
              request.mode === "create"
                ? request.selection.invocationId
                : request.item.id
            }
            quote={
              request.mode === "create"
                ? request.selection.selectedText
                : request.item.quote
            }
            initial={request.mode === "edit" ? request.item : undefined}
            busy={busy}
            onCancel={close}
            onSave={(input) => {
              if (busy) return;
              setBusy(true);
              const operation =
                request.mode === "create"
                  ? rpc.call("addItem", {
                      threadId: request.selection.message.threadId,
                      ...request.selection,
                      feedback: input,
                    })
                  : rpc.call("updateItem", {
                      threadId: request.threadId,
                      itemId: request.item.id,
                      patch: input,
                    });
              void operation
                .then((draft) => {
                  quoteHighlights.setDraft(draft);
                  quoteEditorStore.close();
                  toast.success(
                    request.mode === "create"
                      ? "Quote added."
                      : "Quote updated.",
                  );
                })
                .catch((error: unknown) =>
                  toast.error("Could not save quote", {
                    description:
                      error instanceof Error ? error.message : String(error),
                  }),
                )
                .finally(() => setBusy(false));
            }}
          />
        </section>
      )}
    </>
  );
}
