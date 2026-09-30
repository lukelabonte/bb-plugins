// bb-plugin-quote-feedback — a BB plugin frontend entry.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time (never bundled),
// so this file must be loaded by BB, not imported directly.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { FeedbackBanner } from "./components/FeedbackBanner";
import { FeedbackOverlay } from "./components/FeedbackOverlay";
import { feedbackEditorStore } from "./lib/editor-store";
import { feedbackHighlights } from "./lib/highlights";
import { hideAddToChatInSelectionPopover } from "./lib/selection-menu";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "feedback-highlights",
    mount({ generation }) {
      const disposeHighlights = feedbackHighlights.mount(generation);
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
        observer.disconnect();
      };
    },
  });

  app.slots.experimental_appOverlay({
    id: "feedback-editor",
    component: FeedbackOverlay,
  });

  app.composer.customize({
    id: "thread-feedback",
    scopes: ["thread"],
    banners: [{ id: "draft", chrome: "bare", component: FeedbackBanner }],
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
      feedbackHighlights.captureSelection(invocationId, threadId, selectedText);
      feedbackEditorStore.open({
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
