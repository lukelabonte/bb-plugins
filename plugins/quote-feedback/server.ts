import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { draftSchema, rpcContract, type FeedbackDraft } from "./contract";
import { formatRevisionRequest } from "./lib/format-revision-request";

/**
 * Legacy drafts stored each item with a `kind` ("comment" | "remove"). Every
 * quote is a comment now: the field is dropped, a removal's reason text
 * (already stored in `body`) becomes the comment, and body-less removals —
 * which cannot satisfy the comment schema — are dropped.
 */
function migrateLegacyDraft(stored: unknown): unknown {
  if (!stored || typeof stored !== "object") return stored;
  const items = (stored as { items?: unknown }).items;
  if (!Array.isArray(items)) return stored;
  return {
    ...stored,
    items: items
      .filter(
        (item): item is Record<string, unknown> =>
          !!item &&
          typeof item === "object" &&
          typeof (item as { body?: unknown }).body === "string" &&
          !!(item as { body: string }).body.trim(),
      )
      .map(({ kind: _kind, ...rest }) => rest),
  };
}

export default function plugin(bb: BbPluginApi) {
  const locks = new Map<string, Promise<unknown>>();
  const key = (threadId: string) => `draft:${threadId}`;
  const empty = (threadId: string): FeedbackDraft => ({
    threadId,
    items: [],
    overallFeedback: "",
    updatedAt: new Date().toISOString(),
  });

  const read = async (threadId: string) => {
    const stored = await bb.storage.kv.get(key(threadId));
    const draft = draftSchema.parse(
      stored === null || stored === undefined
        ? empty(threadId)
        : migrateLegacyDraft(stored),
    );
    if (draft.threadId !== threadId)
      throw new Error("Stored draft thread mismatch");
    return draft;
  };

  // Serialize mutations per thread so concurrent edits and sends cannot
  // interleave into a lost update or a duplicate delivery.
  async function serial<T>(threadId: string, fn: () => Promise<T>): Promise<T> {
    const next = (locks.get(threadId) ?? Promise.resolve())
      .catch(() => {})
      .then(fn);
    locks.set(threadId, next);
    try {
      return await next;
    } finally {
      if (locks.get(threadId) === next) locks.delete(threadId);
    }
  }

  async function write(draft: FeedbackDraft) {
    draft.updatedAt = new Date().toISOString();
    draftSchema.parse(draft);
    await bb.storage.kv.set(key(draft.threadId), draft);
    bb.realtime.publish("draft-changed", { threadId: draft.threadId });
    return draft;
  }

  const mutate = (threadId: string, fn: (draft: FeedbackDraft) => void) =>
    serial(threadId, async () => {
      const draft = await read(threadId);
      fn(draft);
      return write(draft);
    });

  const indexOf = (draft: FeedbackDraft, itemId: string) => {
    const index = draft.items.findIndex((item) => item.id === itemId);
    if (index < 0)
      throw new Error("Quote no longer exists. Reload the draft.");
    return index;
  };

  bb.rpc.register(rpcContract, {
    getDraft: ({ threadId }) => serial(threadId, () => read(threadId)),
    addItem: ({ threadId, message, selectedText, feedback, invocationId }) =>
      mutate(threadId, (draft) => {
        if (message.threadId !== threadId)
          throw new Error("Selection belongs to another thread");
        // Retried invocations carry the same id; never stage a passage twice.
        if (draft.items.some((item) => item.id === invocationId)) return;
        draft.items.push({
          id: invocationId,
          messageId: message.id,
          sourceSeqEnd: message.sourceSeqEnd,
          quote: selectedText,
          ...feedback,
          createdAt: new Date().toISOString(),
        });
      }),
    updateItem: ({ threadId, itemId, patch }) =>
      mutate(threadId, (draft) => {
        Object.assign(draft.items[indexOf(draft, itemId)], patch);
      }),
    removeItem: ({ threadId, itemId }) =>
      mutate(threadId, (draft) => {
        draft.items.splice(indexOf(draft, itemId), 1);
      }),
    setOverallFeedback: ({ threadId, value }) =>
      mutate(threadId, (draft) => {
        draft.overallFeedback = value;
      }),
    clearDraft: ({ threadId }) => serial(threadId, () => write(empty(threadId))),
    sendDraft: ({ threadId }) =>
      serial(threadId, async () => {
        const draft = await read(threadId);
        if (!draft.items.length && !draft.overallFeedback.trim())
          throw new Error("Add a quote before sending");
        // The draft clears only after the delivery is accepted; a failed
        // send leaves every staged item in place.
        const result = await bb.sdk.threads.send({
          threadId,
          mode: "auto",
          input: [
            {
              type: "text",
              text: formatRevisionRequest(draft.items, draft.overallFeedback),
              mentions: [],
            },
          ],
        });
        const cleared = await write(empty(threadId));
        return { draft: cleared, delivery: result.delivery };
      }),
  });

  bb.events.on("thread.deleted", ({ thread }) =>
    serial(thread.id, () => bb.storage.kv.delete(key(thread.id))),
  );
}
