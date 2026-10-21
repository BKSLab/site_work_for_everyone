import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { ShareButton } from "../ShareButton";

vi.mock("@/lib/utils/clipboard", () => ({ copyToClipboard: vi.fn() }));
beforeEach(() => {
    vi.mocked(copyToClipboard).mockReset();
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ShareButton", () => {
    it("applies a custom class to the control while keeping the live status separate", () => {
        render(<ShareButton title="Статья" text="Описание" className="article-utility" />);
        expect(screen.getByRole("button", { name: "Поделиться" })).toHaveClass("article-utility");
        expect(screen.getByRole("status")).not.toHaveClass("article-utility");
    });

    it("announces success while keeping focus on the share control", async () => {
        vi.mocked(copyToClipboard).mockResolvedValue(true);
        render(<ShareButton title="Статья" text="Описание" />);
        const button = screen.getByRole("button", { name: "Поделиться" });
        button.focus();
        fireEvent.click(button);
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Ссылка скопирована"));
        expect(document.activeElement).toBe(button);
    });

    it("explains a copy failure instead of announcing success", async () => {
        vi.mocked(copyToClipboard).mockResolvedValue(false);
        render(<ShareButton title="Статья" text="Описание" />);
        fireEvent.click(screen.getByRole("button", { name: "Поделиться" }));
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Не удалось скопировать"));
        expect(screen.getByRole("button", { name: "Поделиться" })).toBeInTheDocument();
    });

    it("does not copy or announce an error when the native dialog is cancelled", async () => {
        Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")) });
        render(<ShareButton title="Статья" text="Описание" />);
        fireEvent.click(screen.getByRole("button", { name: "Поделиться" }));
        await waitFor(() => expect(navigator.share).toHaveBeenCalled());
        expect(copyToClipboard).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
});
