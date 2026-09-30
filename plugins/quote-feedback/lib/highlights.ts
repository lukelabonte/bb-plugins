import type { FeedbackDraft } from "../contract";

/**
 * Paints staged feedback onto the rendered assistant-message DOM with the CSS
 * Custom Highlight API. BB exposes no persistent selection anchors, so a
 * stored passage is restored only when it produces exactly one normalized
 * text match across the visible assistant-message roots; ambiguous passages
 * stay in the draft without a decoration.
 */

type CapturedSelection = {
  threadId: string;
  quote: string;
  range: Range;
  committed: boolean;
};

type HighlightState = "quote" | "pending";

const ASSISTANT_MARKDOWN_SELECTOR =
  '[data-message-column] > [data-sidebar-swipe-selectable="true"] [data-markdown-preview]';
const IGNORED_TEXT_SELECTOR =
  "button, input, textarea, script, style, [aria-hidden='true']";
const BLOCK_TAGS = new Set([
  "ADDRESS",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "P",
  "PRE",
  "TD",
  "TH",
]);

type Boundary = { node: Text; offset: number };
type IndexedCharacter = { value: string; start: Boundary; end: Boundary };

function textNodes(root: Element) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return node.textContent && !parent?.closest(IGNORED_TEXT_SELECTOR)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  return nodes;
}

function nearestBlock(node: Text, root: Element) {
  let current = node.parentElement;
  while (current && current !== root) {
    if (BLOCK_TAGS.has(current.tagName)) return current;
    current = current.parentElement;
  }
  return root;
}

function normalizedText(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function isRenderedRoot(root: Element) {
  let current: Element | null = root;
  while (current) {
    if (
      current.hasAttribute("hidden") ||
      current.hasAttribute("inert") ||
      current.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }
    const style = window.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.contentVisibility === "hidden"
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function selectionTextMatches(range: Range, quote: string) {
  const selected = range.toString();
  return (
    selected === quote ||
    normalizedText(selected) === normalizedText(quote) ||
    selected.replace(/\s/gu, "") === quote.replace(/\s/gu, "")
  );
}

/**
 * Flattens a rendered root into one normalized string where every character
 * remembers the DOM boundary it came from. Whitespace runs collapse to a
 * single space and a block boundary contributes one space, so a quote copied
 * from Markdown source matches its rendered form.
 */
function normalizedIndex(root: Element) {
  const nodes = textNodes(root);
  const characters: IndexedCharacter[] = [];
  let previous: Text | undefined;

  const append = (value: string, start: Boundary, end: Boundary) => {
    if (/\s/u.test(value)) {
      const last = characters.at(-1);
      if (last?.value === " ") {
        last.end = end;
      } else {
        characters.push({ value: " ", start, end });
      }
      return;
    }
    characters.push({ value, start, end });
  };

  for (const node of nodes) {
    if (previous && nearestBlock(previous, root) !== nearestBlock(node, root)) {
      append(
        " ",
        { node: previous, offset: previous.data.length },
        { node, offset: 0 },
      );
    }
    for (let offset = 0; offset < node.data.length; offset += 1) {
      append(
        node.data[offset],
        { node, offset },
        { node, offset: offset + 1 },
      );
    }
    previous = node;
  }

  return { characters, text: characters.map(({ value }) => value).join("") };
}

function rangeForOccurrence(
  characters: IndexedCharacter[],
  start: number,
  length: number,
) {
  const first = characters[start];
  const last = characters[start + length - 1];
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.start.node, first.start.offset);
  range.setEnd(last.end.node, last.end.offset);
  return range;
}

/** Finds one normalized visible assistant-text match and maps it back to a DOM range. */
export function findUniqueAssistantRange(quote: string): Range | null {
  const needle = normalizedText(quote);
  if (!needle) return null;
  let match: Range | null = null;
  for (const root of document.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR)) {
    if (!isRenderedRoot(root)) continue;
    const { characters, text } = normalizedIndex(root);
    let index = text.indexOf(needle);
    while (index >= 0) {
      if (match) return null;
      match = rangeForOccurrence(characters, index, needle.length);
      if (!match) return null;
      index = text.indexOf(needle, index + 1);
    }
  }
  return match;
}

function liveCapturedRange(captured: CapturedSelection) {
  return captured.range.startContainer.isConnected &&
    captured.range.endContainer.isConnected &&
    selectionTextMatches(captured.range, captured.quote)
    ? captured.range
    : null;
}

let activeDraft: Pick<FeedbackDraft, "threadId" | "items"> | null = null;
const captured = new Map<string, CapturedSelection>();
let registryNames: Record<HighlightState, string> | null = null;
let observer: MutationObserver | null = null;
let style: HTMLStyleElement | null = null;
let rebuildQueued = false;
let activeMount: symbol | null = null;

function clearRegistry() {
  if (!registryNames || !("highlights" in CSS)) return;
  for (const name of Object.values(registryNames)) CSS.highlights.delete(name);
}

function rebuild() {
  rebuildQueued = false;
  if (!registryNames || !("highlights" in CSS) || typeof Highlight === "undefined")
    return;

  const ranges: Record<HighlightState, Range[]> = {
    quote: [],
    pending: [],
  };
  const items = activeDraft?.items ?? [];
  const itemIds = new Set(items.map((item) => item.id));

  for (const item of items) {
    const exact = captured.get(item.id);
    const range = exact ? liveCapturedRange(exact) : null;
    const resolved = range ?? findUniqueAssistantRange(item.quote);
    if (resolved) {
      ranges.quote.push(resolved);
      if (!range && activeDraft) {
        captured.set(item.id, {
          threadId: activeDraft.threadId,
          quote: item.quote,
          range: resolved,
          committed: true,
        });
      }
    }
  }
  for (const [id, selection] of captured) {
    if (
      !selection.committed &&
      !itemIds.has(id) &&
      selection.threadId === activeDraft?.threadId
    ) {
      const range = liveCapturedRange(selection);
      if (range) ranges.pending.push(range);
    }
  }

  for (const state of ["quote", "pending"] as const) {
    const name = registryNames[state];
    if (ranges[state].length)
      CSS.highlights.set(name, new Highlight(...ranges[state]));
    else CSS.highlights.delete(name);
  }
}

function queueRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  queueMicrotask(rebuild);
}

export const feedbackHighlights = {
  mount(generation: number) {
    const token = Symbol(`quote-feedback-highlights-${generation}`);
    activeMount = token;
    registryNames = {
      quote: `quote-feedback-quote-${generation}`,
      pending: `quote-feedback-pending-${generation}`,
    };
    style = document.createElement("style");
    style.dataset.quoteFeedbackHighlights = String(generation);
    style.textContent = `
      ::highlight(${registryNames.quote}) {
        background-color: rgba(250, 204, 21, 0.30);
        text-decoration: underline rgba(202, 138, 4, 0.75);
      }
      ::highlight(${registryNames.pending}) {
        background-color: rgba(167, 139, 250, 0.28);
        text-decoration: underline rgba(124, 58, 237, 0.72);
      }
    `;
    document.head.appendChild(style);
    observer = new MutationObserver(queueRebuild);
    observer.observe(document.body, { childList: true, subtree: true });
    rebuild();

    return () => {
      if (activeMount !== token) return;
      observer?.disconnect();
      observer = null;
      clearRegistry();
      style?.remove();
      style = null;
      registryNames = null;
      activeMount = null;
      rebuildQueued = false;
      captured.clear();
    };
  },

  captureSelection(id: string, threadId: string, quote: string) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0).cloneRange();
    if (range.collapsed || !selectionTextMatches(range, quote)) return;
    captured.set(id, { threadId, quote, range, committed: false });
    rebuild();
  },

  cancelSelection(id: string) {
    const selection = captured.get(id);
    if (!selection || selection.committed) return;
    captured.delete(id);
    rebuild();
  },

  setDraft(draft: Pick<FeedbackDraft, "threadId" | "items">) {
    activeDraft = draft;
    const ids = new Set(draft.items.map((item) => item.id));
    for (const id of ids) {
      const selection = captured.get(id);
      if (selection) selection.committed = true;
    }
    for (const [id, selection] of captured) {
      if (selection.committed && !ids.has(id)) captured.delete(id);
    }
    rebuild();
  },

  deactivateThread(threadId: string) {
    if (activeDraft?.threadId !== threadId) return;
    activeDraft = null;
    rebuild();
  },
};
