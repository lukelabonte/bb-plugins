import { useCallback, useEffect, useRef, useState } from "react";
import {
  useComposer,
  useComposerView,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { FeedbackDraft, FeedbackItem, rpcContract } from "../contract";
import { quoteEditorStore } from "../lib/editor-store";
import { formatRevisionRequest } from "../lib/format-revision-request";
import { quoteHighlights } from "../lib/highlights";
import { shouldInterceptSubmit } from "../lib/submit-interception";
import { Button } from "@/components/ui/button";

export function QuotePill() {
  const view = useComposerView();
  if (view.scope.kind !== "thread") return null;
  return (
    <ThreadQuotePill key={view.scope.threadId} threadId={view.scope.threadId} />
  );
}

function ThreadQuotePill({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const view = useComposerView();
  const [draft, setDraft] = useState<FeedbackDraft>();
  // Open-state machine over hover: pointer entry opens, leaving closes,
  // click while open dismisses (and it stays dismissed while the pointer
  // remains over the pill), click again re-opens. Leaving always resets to
  // closed, so the next hover opens afresh.
  const [listState, setListState] = useState<"closed" | "open" | "dismissed">(
    "closed",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const mounted = useRef(true);
  const flashTimer = useRef<number | undefined>(undefined);
  // The visual gap between pill and list is outside both boxes; closing is
  // delayed so the pointer can cross it without the list unmounting.
  const hoverTimer = useRef<number | undefined>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const enterHover = () => {
    window.clearTimeout(hoverTimer.current);
    setListState((state) => (state === "dismissed" ? state : "open"));
  };
  const leaveHover = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setListState("closed"), 200);
  };
  const toggleList = () =>
    setListState((state) => (state === "open" ? "dismissed" : "open"));

  const accept = useCallback((next: FeedbackDraft) => {
    if (!mounted.current) return;
    quoteHighlights.setDraft(next);
    setDraft(next);
  }, []);

  const load = useCallback(async () => {
    try {
      accept(await rpc.call("getDraft", { threadId }));
      setError("");
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [accept, rpc, threadId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      window.clearTimeout(flashTimer.current);
      window.clearTimeout(hoverTimer.current);
    };
  }, [load]);
  useRealtime("draft-changed", () => {
    if (!active.current) void load();
  });

  const run = async (operation: () => Promise<void>) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      toast.error("Could not update quote", { description: message });
    } finally {
      active.current = false;
      setBusy(false);
    }
  };

  // Single send path (ADR-0002): while quotes are staged, capture-phase
  // listeners intercept the composer's plain Enter or send-button click and
  // submit `formatted quotes + typed text` through the composer's own
  // pipeline, so the on-screen provider/model/permission/attachments travel.
  // The draft clears only after the host accepts the submission; a refusal
  // restores the user's typed text and keeps every staged quote. Nothing
  // staged → the listeners pass every event through untouched.
  const submitStaged = useRef<() => void>(() => {});
  submitStaged.current = () => {
    const items = draft?.items ?? [];
    if (active.current || items.length === 0) return;
    active.current = true;
    setBusy(true);
    const typedText = view.draft.text;
    void (async () => {
      try {
        composer.setText(formatRevisionRequest(items, typedText));
        await composer.experimental_submit({ experimental_data: null });
        accept(await rpc.call("clearDraft", { threadId }));
        setListState("closed");
        toast.success("Quotes sent.");
      } catch (cause) {
        composer.setText(typedText);
        const message = cause instanceof Error ? cause.message : String(cause);
        toast.error("Could not send quotes", { description: message });
      } finally {
        active.current = false;
        setBusy(false);
      }
    })();
  };

  useEffect(() => {
    const pluginUi = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest("[data-quote-feedback-ui]") !== null;
    // The pill banner renders inside the composer area; the region is the
    // lowest ancestor that also contains the composer input. No region →
    // fail open to stock behavior.
    const composerRegion = () => {
      let node = wrapperRef.current?.parentElement ?? null;
      while (node) {
        if (node.querySelector("textarea, [contenteditable='true']")) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !shouldInterceptSubmit(
          {
            kind: "keydown",
            key: event.key,
            shiftKey: event.shiftKey,
            isComposing: event.isComposing,
          },
          draft?.items.length ?? 0,
        )
      ) {
        return;
      }
      const target = event.target;
      const isComposerInput =
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (!isComposerInput || pluginUi(target)) return;
      const region = composerRegion();
      if (!region?.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      submitStaged.current();
    };
    const onClick = (event: MouseEvent) => {
      if (
        !shouldInterceptSubmit(
          { kind: "send-button-click" },
          draft?.items.length ?? 0,
        )
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element) || pluginUi(target)) return;
      const button = target.closest(
        "button[type='submit'], button[aria-label*='send' i]",
      );
      const region = composerRegion();
      if (!button || !region?.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      submitStaged.current();
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [draft?.items.length]);

  const remove = (item: FeedbackItem) =>
    void run(async () => {
      accept(await rpc.call("removeItem", { threadId, itemId: item.id }));
    });

  const flash = (item: FeedbackItem) => {
    if (!quoteHighlights.revealItem(item.id)) return;
    quoteHighlights.setEmphasis(item.id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      if (quoteHighlights.getEmphasis() === item.id) {
        quoteHighlights.setEmphasis(null);
      }
    }, 900);
  };

  if (!draft) {
    return error ? (
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-card p-3 text-sm"
      >
        <span className="text-destructive">Could not load quotes.</span>{" "}
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    ) : null;
  }

  if (draft.items.length === 0) return null;

  const open = listState === "open";

  return (
    <div
      ref={wrapperRef}
      data-quote-feedback-ui
      className="relative inline-block"
      onMouseEnter={enterHover}
      onMouseLeave={leaveHover}
    >
      <button
        type="button"
        aria-expanded={open}
        className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
        onClick={toggleList}
      >
        Chat quotes {draft.items.length}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Staged quotes"
          className="absolute bottom-full left-0 z-40 mb-2 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-2 shadow-xl"
        >
          <ol className="max-h-64 space-y-2 overflow-y-auto">
            {draft.items.map((item, index) => (
              <li
                key={item.id}
                className="flex min-w-0 cursor-pointer items-start gap-2 rounded-md p-1.5 text-xs hover:bg-accent"
                onMouseEnter={() => quoteHighlights.setEmphasis(item.id)}
                onMouseLeave={() => {
                  if (quoteHighlights.getEmphasis() === item.id) {
                    quoteHighlights.setEmphasis(null);
                  }
                }}
                onClick={() => flash(item)}
              >
                <span className="shrink-0 pt-0.5 text-muted-foreground">
                  {index + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-foreground">
                    “{item.quote}”
                  </p>
                  <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
                    {`Comment: ${item.body}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    quoteEditorStore.open({ mode: "edit", threadId, item });
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove quote ${index + 1}`}
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(item);
                  }}
                >
                  ×
                </Button>
              </li>
            ))}
          </ol>

          {error ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
