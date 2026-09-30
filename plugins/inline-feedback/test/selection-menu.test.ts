// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { hideAddToChatInSelectionPopover } from "../lib/selection-menu";

afterEach(() => {
  document.body.replaceChildren();
});

const popover = (label: string) => `
  <div role="dialog" class="z-50 flex w-auto">
    <div class="flex items-center">
      <button class="inline-flex cursor-pointer items-center">${label}</button>
    </div>
  </div>`;

const actionBar = `
  <div class="group/message w-full text-sm">
    <div class="relative w-full h-5">
      <div class="absolute top-0 flex">
        <button class="inline-flex size-5 cursor-pointer">Add to chat</button>
      </div>
    </div>
  </div>`;

it("hides Add to chat in the selection popover but keeps sibling entries", () => {
  document.body.innerHTML = popover("Add to chat") + popover("Feedback");
  // jsdom lacks portal structure here; wrap both in one dialog like BB does.
  hideAddToChatInSelectionPopover();

  const buttons = [...document.querySelectorAll("button")];
  const addToChat = buttons.find((b) => b.textContent === "Add to chat");
  const feedback = buttons.find((b) => b.textContent === "Feedback");
  expect(addToChat?.style.display).toBe("none");
  expect(feedback?.style.display).toBe("");
});

it("keeps Add to chat in the per-message hover action bar", () => {
  document.body.innerHTML = actionBar;
  hideAddToChatInSelectionPopover();

  const button = document.querySelector("button");
  expect(button?.style.display).toBe("");
});

it("ignores unrelated buttons and is idempotent on re-run", () => {
  document.body.innerHTML =
    popover("Add to chat") + `<div role="dialog"><button>Save</button></div>`;
  hideAddToChatInSelectionPopover();
  hideAddToChatInSelectionPopover();

  const save = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Save",
  );
  expect(save?.style.display).toBe("");
});
