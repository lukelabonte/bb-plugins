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
import { quoteHighlights } from "../lib/highlights";
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
  const composerText = view.draft.text;
  const [draft, setDraft] = useState<FeedbackDraft>();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const mounted = useRef(true);
  const flashTimer = useRef<number | undefined>(undefined);

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

  // The thread's message box is the overall-feedback field: whatever is
  // typed there joins the batch when feedback is sent, then clears.
  // Transitional home until the send-path slice lands.
  const send = () =>
    void run(async () => {
      if (composerText.trim()) {
        await rpc.call("setOverallFeedback", { threadId, value: composerText });
      }
      const result = await rpc.call("sendDraft", { threadId });
      accept(result.draft);
      if (composerText.trim()) composer.clear();
      setPinned(false);
      toast.success(`Quotes submitted (${result.delivery}).`);
    });

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

  const open = hovered || pinned;
  const hasFeedback =
    draft.items.length > 0 ||
    !!draft.overallFeedback.trim() ||
    !!composerText.trim();

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
        onClick={() => setPinned((value) => !value)}
      >
        Chat quotes {draft.items.length}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Staged quotes"
          className="absolute bottom-full left-0 z-40 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-2 shadow-xl"
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
                <span className="shrink-0 text-muted-foreground">
                  {index + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">“{item.quote}”</p>
                  <p className="truncate text-muted-foreground">
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

          <div className="mt-2 flex justify-end border-t border-border pt-2">
            {hasFeedback ? (
              <Button size="sm" disabled={busy} onClick={send}>
                {busy ? "Working…" : "Send quotes"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
