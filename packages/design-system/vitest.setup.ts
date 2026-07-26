import "@testing-library/jest-dom/vitest";

// jsdom does not implement HTMLDialogElement.showModal()/close() (see
// https://github.com/jsdom/jsdom/issues/3294). Real browsers do; this
// polyfill only exists so component tests can exercise <dialog>-based
// components (Dialog.tsx) under jsdom.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
