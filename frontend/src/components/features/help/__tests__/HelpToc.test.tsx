import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpToc } from "../HelpToc";

function Guide() {
    return (
        <>
            <h1 id="help-heading" tabIndex={-1}>Справка</h1>
            <HelpToc />
            <h2 id="section-start" tabIndex={-1}>Начало работы</h2>
            <h3 id="vacancy-card" tabIndex={-1}>Карточка вакансии</h3>
            <button>Открыть вакансию</button>
            <h2 id="section-contact" tabIndex={-1}>Обратная связь</h2>
        </>
    );
}

let positions: Record<string, number>;

beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.history.replaceState(null, "", "/help");
    positions = { "section-start": 0, "vacancy-card": 3000, "section-contact": 6000 };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        return { top: positions[this.id] ?? 0 } as DOMRect;
    });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
});

it("focuses a deeply linked heading and marks its exact subsection", async () => {
    window.history.replaceState(null, "", "/help#vacancy-card");
    positions = { "section-start": -3000, "vacancy-card": 112, "section-contact": 3000 };
    render(<Guide />);

    await waitFor(() => expect(document.getElementById("vacancy-card")).toHaveFocus());
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    expect(screen.getByRole("link", { name: "Карточка вакансии" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Начало работы с сайтом" })).not.toHaveAttribute("aria-current");
});

it("updates the current section after a large scroll without moving focus", async () => {
    render(<Guide />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
    const action = screen.getByRole("button", { name: "Открыть вакансию" });
    action.focus();
    positions = { "section-start": -6000, "vacancy-card": -3000, "section-contact": 112 };
    fireEvent.scroll(window);

    await waitFor(() => expect(screen.getByRole("link", { name: "Обратная связь" })).toHaveAttribute("aria-current", "location"));
    expect(action).toHaveFocus();
});

it("restores the destination on hash and history changes", async () => {
    render(<Guide />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
    positions = { "section-start": -6000, "vacancy-card": -3000, "section-contact": 112 };
    window.history.pushState(null, "", "/help#section-contact");
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() => expect(document.getElementById("section-contact")).toHaveFocus());

    positions = { "section-start": -3000, "vacancy-card": 112, "section-contact": 3000 };
    window.history.replaceState(null, "", "/help#vacancy-card");
    fireEvent.popState(window);
    await waitFor(() => expect(document.getElementById("vacancy-card")).toHaveFocus());
    expect(screen.getByRole("link", { name: "Карточка вакансии" })).toHaveAttribute("aria-current", "location");
});

it("focuses the heading when the same contents link is used again", async () => {
    window.history.replaceState(null, "", "/help#vacancy-card");
    render(<Guide />);
    await waitFor(() => expect(document.getElementById("vacancy-card")).toHaveFocus());
    screen.getByRole("button", { name: "Открыть вакансию" }).focus();
    await userEvent.click(screen.getByRole("link", { name: "Карточка вакансии" }));
    expect(document.getElementById("vacancy-card")).toHaveFocus();
});

describe("mobile contents", () => {
    it("exposes its expanded state and controls the list", () => {
        render(<Guide />);
        const toggle = screen.getByRole("button", { name: "Оглавление" });
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeInTheDocument();
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
});
