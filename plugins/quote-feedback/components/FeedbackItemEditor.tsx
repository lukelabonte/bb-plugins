import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FeedbackInput } from "../contract";

export function FeedbackItemEditor({
  quote,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  quote: string;
  initial?: FeedbackInput;
  busy: boolean;
  onSave: (value: FeedbackInput) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial?.body ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let queued: number | undefined;
    const focusFeedback = () => {
      textareaRef.current?.focus({ preventScroll: true });
    };
    const queueFocusCheck = () => {
      window.clearTimeout(queued);
      queued = window.setTimeout(() => {
        const form = formRef.current;
        const active = document.activeElement;
        if (form && (!active || !form.contains(active))) focusFeedback();
      }, 0);
    };

    // BB can restore composer focus after its native iOS selection menu
    // closes. Guard only that startup window; controls inside this form
    // remain focusable afterwards.
    document.addEventListener("focusin", queueFocusCheck);
    document.addEventListener("focusout", queueFocusCheck);
    const initialFocus = window.setTimeout(focusFeedback, 0);
    const stopGuard = window.setTimeout(() => {
      document.removeEventListener("focusin", queueFocusCheck);
      document.removeEventListener("focusout", queueFocusCheck);
    }, 1500);
    return () => {
      document.removeEventListener("focusin", queueFocusCheck);
      document.removeEventListener("focusout", queueFocusCheck);
      window.clearTimeout(initialFocus);
      window.clearTimeout(queued);
      window.clearTimeout(stopGuard);
    };
  }, []);

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ body });
      }}
    >
      <blockquote className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-sm">
        {quote}
      </blockquote>
      <label className="block text-sm">
        Comment
        <textarea
          ref={textareaRef}
          autoFocus
          aria-label="Feedback text"
          className="mt-1 w-full rounded border border-border bg-background p-2"
          rows={4}
          value={body}
          maxLength={10000}
          disabled={busy}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Return saves a comment; Shift+Return inserts a new line.
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            ) {
              return;
            }
            event.preventDefault();
            if (!busy && body.trim()) event.currentTarget.form?.requestSubmit();
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !body.trim()}>
          Save
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
