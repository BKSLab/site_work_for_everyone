import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { HelpScreenshot } from "../HelpScreenshot";

afterEach(cleanup);

it("opens with the keyboard, zooms to the source width, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<HelpScreenshot src="/help/home/01-hero-search.png" alt="Форма поиска" caption="Поиск вакансий." width={1108} height={888} />);
    const trigger = screen.getByRole("button", { name: "Увеличить снимок: Поиск вакансий." });
    trigger.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: "Снимок экрана" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    const zoom = screen.getByRole("button", { name: "Исходный размер" });
    expect(zoom).toHaveAttribute("aria-pressed", "false");
    await user.click(zoom);
    expect(screen.getByRole("button", { name: "Вписать в окно" })).toHaveAttribute("aria-pressed", "true");
    const image = screen.getByRole("region", { name: "Просмотр снимка экрана" }).querySelector("img");
    expect(image).toHaveStyle({ width: "1108px", maxWidth: "none" });

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("button", { name: "Исходный размер" })).toHaveAttribute("aria-pressed", "false");
});
