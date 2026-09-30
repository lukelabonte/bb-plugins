/**
 * Hovered-quote state shared between the content script's mousemove
 * hit-testing (writes) and the React hover popover (reads). Kept as a tiny
 * external store, same posture as the editor store.
 */

let current: string | null = null;
const listeners = new Set<() => void>();

export const quoteHoverStore = {
  getSnapshot: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(itemId: string | null) {
    if (current === itemId) return;
    current = itemId;
    for (const listener of listeners) listener();
  },
};
