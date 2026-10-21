import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "../clipboard";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
});

function focusButton() {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    return button;
}

function legacyClipboard(implementation: () => boolean) {
    const copy = vi.fn(implementation);
    Object.defineProperty(document, "execCommand", { configurable: true, value: copy });
    return copy;
}

describe("copyToClipboard", () => {
    it("uses the clipboard API without changing focus", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", { clipboard: { writeText } });
        const button = focusButton();
        expect(await copyToClipboard("Ссылка")).toBe(true);
        expect(writeText).toHaveBeenCalledWith("Ссылка");
        expect(document.activeElement).toBe(button);
        expect(document.querySelector("textarea")).toBeNull();
    });

    it("reports a rejected legacy copy and restores focus", async () => {
        vi.stubGlobal("navigator", {});
        const copy = legacyClipboard(() => false);
        const button = focusButton();
        expect(await copyToClipboard("Ссылка")).toBe(false);
        expect(copy).toHaveBeenCalledWith("copy");
        expect(document.activeElement).toBe(button);
        expect(document.querySelector("textarea")).toBeNull();
    });

    it("cleans up and restores focus if execCommand throws", async () => {
        vi.stubGlobal("navigator", {});
        legacyClipboard(() => { throw new Error("denied"); });
        const button = focusButton();
        expect(await copyToClipboard("Ссылка")).toBe(false);
        expect(document.activeElement).toBe(button);
        expect(document.querySelector("textarea")).toBeNull();
    });

    it("keeps the user's newer focus after a late clipboard rejection", async () => {
        let reject!: (reason: Error) => void;
        vi.stubGlobal("navigator", { clipboard: { writeText: () => new Promise((_, fail) => { reject = fail; }) } });
        legacyClipboard(() => true);
        focusButton();
        const pending = copyToClipboard("Ссылка");
        const newerButton = focusButton();
        reject(new Error("denied"));
        expect(await pending).toBe(true);
        expect(document.activeElement).toBe(newerButton);
    });
});
