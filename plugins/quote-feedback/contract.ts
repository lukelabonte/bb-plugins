import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w:.-]+$/);

// Message references are opaque SDK strings; real IDs can contain pipes.
export const messageId = z
  .string()
  .min(1)
  .max(2000)
  .regex(/^[^\x00-\x1f\x7f]+$/);

export const feedbackInput = z
  .strictObject({
    body: z.string().max(10000),
  })
  .refine((value) => !!value.body.trim(), "Quote requires a comment");
export type FeedbackInput = z.infer<typeof feedbackInput>;

export const messageSchema = z.strictObject({
  id: messageId,
  threadId: id,
  role: z.literal("assistant"),
  sourceSeqEnd: z.number().int().nonnegative(),
});

export const quoteSchema = z
  .string()
  .max(20000)
  .refine((value) => !!value.trim(), "Select a nonblank passage");

export const feedbackItemSchema = z
  .strictObject({
    id,
    messageId,
    sourceSeqEnd: z.number().int().nonnegative(),
    quote: quoteSchema,
    body: z.string().max(10000),
    createdAt: z.string(),
  })
  .refine((value) => !!value.body.trim(), "Quote requires a comment");
export type FeedbackItem = z.infer<typeof feedbackItemSchema>;

export const draftSchema = z
  .strictObject({
    threadId: id,
    items: z.array(feedbackItemSchema).max(100),
    updatedAt: z.string(),
  })
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 220000,
    "Draft exceeds 220,000 bytes",
  );
export type FeedbackDraft = z.infer<typeof draftSchema>;

export const selectionSchema = z.strictObject({
  invocationId: id,
  message: messageSchema,
  selectedText: quoteSchema,
});
export type Selection = z.infer<typeof selectionSchema>;

const thread = z.strictObject({ threadId: id });
const item = thread.extend({ itemId: id });

export const rpcContract = defineRpcContract({
  getDraft: { input: thread, output: draftSchema },
  addItem: {
    input: thread.extend({
      message: messageSchema,
      selectedText: quoteSchema,
      feedback: feedbackInput,
      invocationId: id,
    }),
    output: draftSchema,
  },
  updateItem: {
    input: item.extend({ patch: feedbackInput }),
    output: draftSchema,
  },
  removeItem: { input: item, output: draftSchema },
  clearDraft: { input: thread, output: draftSchema },
});
