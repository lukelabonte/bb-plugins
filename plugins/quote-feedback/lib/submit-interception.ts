/**
 * Pure composer-submit interception decision. The capture-phase DOM layer
 * classifies an event into a shape and asks this module whether the plugin
 * takes over the submit. Interception is active only while at least one
 * quote is staged; everything else — Shift+Enter, IME composition, other
 * keys, unrecognized shapes — falls through to stock BB behavior.
 */

export type SubmitEventShape =
  | {
      kind: "keydown";
      key: string;
      shiftKey: boolean;
      isComposing: boolean;
    }
  | { kind: "send-button-click" };

export function shouldInterceptSubmit(
  event: SubmitEventShape,
  stagedCount: number,
): boolean {
  if (stagedCount < 1) return false;
  switch (event.kind) {
    case "keydown":
      return (
        event.key === "Enter" && !event.shiftKey && !event.isComposing
      );
    case "send-button-click":
      return true;
    default:
      return false;
  }
}
