import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HelpSearch } from "../HelpSearch";
import { HelpToc } from "../HelpToc";

function Guide() {
    return <>
        <h1 id="help-heading" tabIndex={-1}>Справка</h1>
        <HelpSearch /><HelpToc />
        <article aria-labelledby="help-heading">
            <h2 id="section-register" tabIndex={-1}>Регистрация и вход</h2><p>Откройте регистрацию.</p>
            <h3 id="account-recovery" tabIndex={-1}>Если забыли пароль</h3><p>Для сброса пароля запросите новый код.</p>
            <h2 id="favorites" tabIndex={-1}>Избранное</h2><p>Удалить вакансию можно кнопкой «Удалить из избранного».</p>
        </article>
    </>;
}

beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.history.replaceState(null, "", "/help");
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
});

it("searches guide prose, announces a count and keeps focus in the input", async () => {
    const user = userEvent.setup();
    render(<Guide />);
    await waitFor(() => expect(document.getElementById("help-heading")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Поиск по справке" }));
    const input = screen.getByRole("searchbox", { name: "Поиск по справке" });
    expect(input).toHaveFocus();
    await user.type(input, "как удалить вакансию");
    const region = await screen.findByRole("region", { name: "Результаты поиска по справке" });
    expect(within(region).getByRole("link", { name: "Избранное" })).toHaveAttribute("href", "#favorites");
    expect(within(region).getByText(/вакансию/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Найдено разделов: 1.");
    expect(input).toHaveFocus();
});

it("shows an empty result and lets the keyboard clear it with focus restored", async () => {
    const user = userEvent.setup();
    render(<Guide />);
    await waitFor(() => expect(document.getElementById("help-heading")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Поиск по справке" }));
    const input = screen.getByRole("searchbox");
    await user.type(input, "абракадабра");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Ничего не найдено."));
    expect(screen.queryByRole("region", { name: "Результаты поиска по справке" })).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("button", { name: "Очистить поиск" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("opens a result using Tab and Enter even when its fragment is already current", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/help#account-recovery");
    render(<Guide />);
    await waitFor(() => expect(document.getElementById("account-recovery")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Поиск по справке" }));
    const input = screen.getByRole("searchbox");
    await user.type(input, "забыл пароль");
    const region = await screen.findByRole("region", { name: "Результаты поиска по справке" });
    await user.tab();
    await user.tab();
    expect(within(region).getByRole("link", { name: "Если забыли пароль" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.getElementById("account-recovery")).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "Поиск по справке" })).not.toBeInTheDocument();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: "start", behavior: "instant" });
});

it("closes with Escape and restores focus to the compact search button", async () => {
    const user = userEvent.setup();
    render(<Guide />);
    await waitFor(() => expect(document.getElementById("help-heading")).toHaveFocus());
    const trigger = screen.getByRole("button", { name: "Поиск по справке" });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("searchbox")).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
});
