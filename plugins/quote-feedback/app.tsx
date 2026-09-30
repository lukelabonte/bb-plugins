// bb-plugin-quote-feedback — a BB plugin frontend entry.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time (never bundled),
// so this file must be loaded by BB, not imported directly.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { QuoteOverlay } from "./components/QuoteOverlay";
import { QuotePill } from "./components/QuotePill";
import { QuoteSendAction } from "./components/QuoteSendAction";
import { quoteEditorStore } from "./lib/editor-store";
import { quoteHighlights } from "./lib/highlights";
import { mountQuoteHoverTracking } from "./lib/hover-tracking";
import { hideAddToChatInSelectionPopover } from "./lib/selection-menu";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "quote-highlights",
    mount({ generation }) {
      const disposeHighlights = quoteHighlights.mount(generation);
      const disposeHoverTracking = mountQuoteHoverTracking();
      // The popover mounts fresh on every selection, so the hide re-runs on
      // DOM change. Debounced to one microtask per mutation batch.
      let queued = false;
      const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          hideAddToChatInSelectionPopover();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      hideAddToChatInSelectionPopover();
      return () => {
        disposeHighlights();
        disposeHoverTracking();
        observer.disconnect();
      };
    },
  });

  app.slots.experimental_appOverlay({
    id: "quote-editor",
    component: QuoteOverlay,
  });

  app.composer.customize({
    id: "thread-quotes",
    scopes: ["thread"],
    banners: [{ id: "draft", chrome: "bare", component: QuotePill }],
    actions: [{ id: "send-quotes", component: QuoteSendAction }],
  });

  app.slots.messageAction({
    id: "add-quote",
    title: "Quote",
    icon: "MessageSquare",
    run({ threadId, message, selectedText }) {
      if (
        message.role !== "assistant" ||
        message.threadId !== threadId ||
        !selectedText?.trim()
      ) {
        toast.info("Select text in an assistant message to quote.");
        return;
      }
      if (selectedText.length > 20000) {
        toast.error("Select at most 20,000 characters.");
        return;
      }
      const invocationId = crypto.randomUUID();
      quoteHighlights.captureSelection(invocationId, threadId, selectedText);
      quoteEditorStore.open({
        mode: "create",
        selection: {
          invocationId,
          message: {
            id: message.id,
            threadId,
            role: "assistant",
            sourceSeqEnd: message.sourceSeqEnd,
          },
          selectedText,
        },
      });
    },
  });
});
