import { useCallback, useEffect, useRef, useState } from "react";
import {
  useComposer,
  useComposerView,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { FeedbackDraft, FeedbackItem, rpcContract } from "../contract";
import { feedbackEditorStore } from "../lib/editor-store";
import { feedbackHighlights } from "../lib/highlights";
import { Button } from "@/components/ui/button";

export function FeedbackBanner() {
  const view = useComposerView();
  if (view.scope.kind !== "thread") return null;
  return (
    <ThreadFeedbackBanner
      key={view.scope.threadId}
      threadId={view.scope.threadId}
    />
  );
}

function ThreadFeedbackBanner({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const view = useComposerView();
  const composerText = view.draft.text;
  const [draft, setDraft] = useState<FeedbackDraft>();
  const [expanded, setExpanded] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const mounted = useRef(true);

  const accept = useCallback((next: FeedbackDraft) => {
    if (!mounted.current) return;
    feedbackHighlights.setDraft(next);
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
      toast.error("Could not update feedback", { description: message });
    } finally {
      active.current = false;
      setBusy(false);
    }
  };

  // The thread's message box is the overall-feedback field: whatever is
  // typed there joins the batch when feedback is sent, then clears.
  const send = () =>
    void run(async () => {
      if (composerText.trim()) {
        await rpc.call("setOverallFeedback", { threadId, value: composerText });
      }
      const result = await rpc.call("sendDraft", { threadId });
      accept(result.draft);
      if (composerText.trim()) composer.clear();
      setExpanded(false);
      toast.success(`Feedback submitted (${result.delivery}).`);
    });

  const remove = (item: FeedbackItem) =>
    void run(async () => {
      accept(await rpc.call("removeItem", { threadId, itemId: item.id }));
    });

  if (!draft) {
    return error ? (
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-card p-3 text-sm"
      >
        <span className="text-destructive">Could not load feedback.</span>{" "}
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    ) : null;
  }

  const hasFeedback =
    draft.items.length > 0 ||
    !!draft.overallFeedback.trim() ||
    !!composerText.trim();
  if (draft.items.length === 0 && !draft.overallFeedback.trim()) return null;

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <button
          type="button"
          className="min-w-0 text-left font-medium text-foreground"
          aria-expanded={expanded}
          onClick={() => {
            setConfirmingClear(false);
            setExpanded((value) => !value);
          }}
        >
          Feedback
          {draft.items.length ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {draft.items.length} {draft.items.length === 1 ? "item" : "items"}
            </span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {!expanded ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmingClear(false);
                setExpanded(true);
              }}
            >
              Review
            </Button>
          ) : null}
          {hasFeedback ? (
            <Button size="sm" disabled={busy} onClick={send}>
              {busy ? "Working…" : "Send feedback"}
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-2 space-y-3 border-t border-border pt-2">
          {draft.items.length ? (
            <ol className="max-h-48 space-y-2 overflow-y-auto">
              {draft.items.map((item, index) => (
                <li
                  key={item.id}
                  className="flex min-w-0 items-start gap-2 text-xs"
                >
                  <span className="shrink-0 text-muted-foreground">
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">“{item.quote}”</p>
                    <p className="truncate text-muted-foreground">
                      {item.kind === "comment"
                        ? `Comment: ${item.body}`
                        : item.body
                          ? `Remove · ${item.body}`
                          : "Remove"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      feedbackEditorStore.open({ mode: "edit", threadId, item })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove feedback ${index + 1}`}
                    disabled={busy}
                    onClick={() => remove(item)}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select assistant text and choose Feedback, or add an overall note
              in the message box below.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Type overall feedback in the message box below — it is included
            when you send feedback. Enter there still sends a normal message.
          </p>
          {composerText.trim() ? (
            <p className="truncate text-xs text-foreground">
              <span className="font-medium">Overall feedback:</span>{" "}
              {composerText}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmingClear(false);
                setExpanded(false);
              }}
            >
              Collapse
            </Button>
            {hasFeedback && !confirmingClear ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmingClear(true)}
              >
                Clear
              </Button>
            ) : null}
            {hasFeedback && confirmingClear ? (
              <div
                role="group"
                aria-label="Confirm clearing all feedback"
                className="flex items-center gap-1"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmingClear(false)}
                >
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      accept(await rpc.call("clearDraft", { threadId }));
                      setConfirmingClear(false);
                    })
                  }
                >
                  Clear all
                </Button>
              </div>
            ) : null}
            {hasFeedback ? (
              <Button size="sm" disabled={busy} onClick={send}>
                {busy ? "Working…" : "Send feedback"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
