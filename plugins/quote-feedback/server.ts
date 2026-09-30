import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { draftSchema, rpcContract, type FeedbackDraft } from "./contract";

/**
 * Legacy drafts stored each item with a `kind` ("comment" | "remove") and a
 * top-level `overallFeedback`. Every quote is a comment now and typed
 * composer text rides along at send time instead: the fields are dropped, a
 * removal's reason text (already stored in `body`) becomes the comment, and
 * body-less removals — which cannot satisfy the comment schema — are
 * dropped.
 */
function migrateLegacyDraft(stored: unknown): unknown {
  if (!stored || typeof stored !== "object") return stored;
  const items = (stored as { items?: unknown }).items;
  if (!Array.isArray(items)) return stored;
  const { overallFeedback: _overallFeedback, ...rest } = stored as {
    overallFeedback?: unknown;
  } & Record<string, unknown>;
  return {
    ...rest,
    items: items
      .filter(
        (item): item is Record<string, unknown> =>
          !!item &&
          typeof item === "object" &&
          typeof (item as { body?: unknown }).body === "string" &&
          !!(item as { body: string }).body.trim(),
      )
      .map(({ kind: _kind, ...itemRest }) => itemRest),
  };
}

export default function plugin(bb: BbPluginApi) {
  const locks = new Map<string, Promise<unknown>>();
  const key = (threadId: string) => `draft:${threadId}`;
  const empty = (threadId: string): FeedbackDraft => ({
    threadId,
    items: [],
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
    clearDraft: ({ threadId }) => serial(threadId, () => write(empty(threadId))),
  });

  bb.events.on("thread.deleted", ({ thread }) =>
    serial(thread.id, () => bb.storage.kv.delete(key(thread.id))),
  );
}
