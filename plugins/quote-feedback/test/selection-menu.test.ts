// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { hideAddToChatInSelectionPopover } from "../lib/selection-menu";

afterEach(() => {
  document.body.replaceChildren();
});

// Mirrors BB 0.44's popover: one flex cell per entry; every cell but the
// first carries its own leading divider span.
const popover = `
  <div role="dialog" class="z-50 flex w-auto items-center gap-0.5">
    <div class="flex items-center">
      <button class="inline-flex">Add to chat</button>
    </div>
    <div class="flex items-center">
      <span class="mx-0.5 h-4 w-px bg-border"></span>
      <button class="inline-flex">Quote</button>
    </div>
    <div class="flex items-center">
      <span class="mx-0.5 h-4 w-px bg-border"></span>
      <button class="inline-flex">Read aloud</button>
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

it("hides the whole Add to chat cell and the orphaned leading divider", () => {
  document.body.innerHTML = popover;
  hideAddToChatInSelectionPopover();

  const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
  const cells = [...dialog.children] as HTMLElement[];
  expect(cells[0].hidden).toBe(true);
  expect(cells[0].style.display).toBe("none");

  const feedbackCell = cells[1];
  const divider = feedbackCell.querySelector("span") as HTMLElement;
  const feedback = feedbackCell.querySelector("button") as HTMLElement;
  expect(feedbackCell.hidden).toBe(false);
  expect(divider.style.display).toBe("none");
  expect(feedback.style.display).toBe("");

  // Later cells keep their dividers — only the first visible one is orphaned.
  const readAloudDivider = cells[2].querySelector("span") as HTMLElement;
  expect(readAloudDivider.style.display).toBe("");
});

it("keeps Add to chat in the per-message hover action bar", () => {
  document.body.innerHTML = actionBar;
  hideAddToChatInSelectionPopover();

  const button = document.querySelector("button") as HTMLElement;
  expect(button.hidden).toBe(false);
  expect(button.style.display).toBe("");
});

it("is idempotent and leaves unrelated dialogs alone", () => {
  document.body.innerHTML =
    popover + `<div role="dialog"><div><span></span><button>Save</button></div></div>`;
  hideAddToChatInSelectionPopover();
  hideAddToChatInSelectionPopover();

  const save = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Save",
  ) as HTMLElement;
  expect(save.style.display).toBe("");
  expect((save.parentElement as HTMLElement).hidden).toBe(false);
});
