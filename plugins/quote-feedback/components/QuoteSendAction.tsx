import { useComposerView } from "@get-bb/plugin-sdk/app";
import { useStagedQuotes } from "../lib/use-staged-quotes";
import { Button } from "@/components/ui/button";

/**
 * Composer-row send action for the quotes-only case: BB's own send button
 * is disabled on an empty composer (and disabled controls dispatch no click
 * events, so the capture-phase interception can never fire there). This
 * action renders only while quotes are staged AND the composer draft is
 * empty, and runs the exact same submission as an intercepted Enter.
 */
export function QuoteSendAction() {
  const view = useComposerView();
  if (view.scope.kind !== "thread") return null;
  return (
    <ThreadQuoteSendAction
      key={view.scope.threadId}
      threadId={view.scope.threadId}
    />
  );
}

function ThreadQuoteSendAction({ threadId }: { threadId: string }) {
  const view = useComposerView();
  const { draft, busy, submit } = useStagedQuotes(threadId);
  if (!draft || draft.items.length === 0) return null;
  // Composer non-empty: the standard button is enabled and the click
  // interception amends it — never duplicate that affordance.
  if (!view.draft.isEmpty) return null;
  return (
    <Button
      size="sm"
      data-quote-feedback-ui
      aria-label="Send quotes"
      disabled={busy}
      onClick={() => submit()}
    >
      {busy ? "Sending…" : "Send quotes"}
    </Button>
  );
}
