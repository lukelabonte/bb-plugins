import { useCallback, useEffect, useRef, useState } from "react";
import {
  useComposer,
  useComposerView,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { FeedbackDraft, rpcContract } from "../contract";
import { formatRevisionRequest } from "./format-revision-request";
import { quoteHighlights } from "./highlights";

/**
 * Staged-quote draft state plus the single send path, shared by the
 * composer pill and the composer send action. Submitting composes
 * `formatted quotes + typed text` and goes through the composer's own
 * pipeline (`experimental_submit`), so the on-screen provider/model/
 * permission/attachments travel. The draft clears only after the host
 * accepts the submission; a refusal restores the user's typed text and
 * keeps every staged quote.
 */
export function useStagedQuotes(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const view = useComposerView();
  const [draft, setDraft] = useState<FeedbackDraft>();
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const active = useRef(false);
  const mounted = useRef(true);

  const accept = useCallback((next: FeedbackDraft) => {
    if (!mounted.current) return;
    quoteHighlights.setDraft(next);
    setDraft(next);
  }, []);

  const reload = useCallback(async () => {
    try {
      accept(await rpc.call("getDraft", { threadId }));
      setLoadError("");
    } catch (cause) {
      if (!mounted.current) return;
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [accept, rpc, threadId]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);
  useRealtime("draft-changed", () => {
    if (!active.current) void reload();
  });

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setMutationError("");
    try {
      await operation();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setMutationError(message);
      toast.error("Could not update quote", { description: message });
    } finally {
      active.current = false;
      setBusy(false);
    }
  }, []);

  const submit = useCallback(() => {
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
        toast.success("Quotes sent.");
      } catch (cause) {
        composer.setText(typedText);
        const message =
          cause instanceof Error ? cause.message : String(cause);
        toast.error("Could not send quotes", { description: message });
      } finally {
        active.current = false;
        setBusy(false);
      }
    })();
  }, [accept, composer, draft?.items, rpc, threadId, view.draft.text]);

  return { draft, busy, loadError, mutationError, accept, reload, run, submit };
}
