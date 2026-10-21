import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Region } from "@/types/region";
import { RegionCombobox } from "../RegionCombobox";

const state = vi.hoisted(() => ({ regions: [] as Region[] }));
vi.mock("@/hooks/useRegions", () => ({ useRegions: () => ({ data: state.regions, isLoading: false }) }));

describe("RegionCombobox keyboard state", () => {
    beforeEach(() => {
        state.regions = Array.from({ length: 25 }, (_, index) => ({
            name: `Регион ${index + 1}`, region_code: String(index + 1), federal_district_code: "1",
        }));
    });

    it("removes active descendants on Escape, blur and an empty filter", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<><RegionCombobox regionCode="" onRegionChange={onChange} /><button>Дальше</button></>);
        const input = screen.getByRole("combobox");
        await user.click(input);
        await user.keyboard("{ArrowDown}{ArrowDown}");
        expect(document.getElementById(input.getAttribute("aria-activedescendant")!)).toHaveRole("option");
        await user.keyboard("{Escape}{Enter}");
        expect(input).not.toHaveAttribute("aria-activedescendant");
        expect(onChange).not.toHaveBeenCalled();
        await user.keyboard("{ArrowDown}");
        await user.tab();
        expect(screen.getByRole("button", { name: "Дальше" })).toHaveFocus();
        expect(input).not.toHaveAttribute("aria-activedescendant");
        await user.click(input);
        await user.type(input, "нет совпадений");
        await user.keyboard("{ArrowDown}{Enter}");
        expect(input).not.toHaveAttribute("aria-activedescendant");
        expect(input).not.toHaveAttribute("aria-controls");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("scrolls the popup to the active option without moving DOM focus", async () => {
        const user = userEvent.setup();
        const { rerender } = render(<RegionCombobox regionCode="" onRegionChange={vi.fn()} />);
        const input = screen.getByRole("combobox");
        await user.click(input);
        await user.keyboard("{ArrowDown}");
        const list = screen.getByRole("listbox");
        vi.spyOn(list, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 100 } as DOMRect);
        vi.spyOn(screen.getAllByRole("option")[19], "getBoundingClientRect").mockReturnValue({ top: 380, bottom: 400 } as DOMRect);
        await user.keyboard("{ArrowDown}".repeat(19));
        expect(list.scrollTop).toBe(300);
        expect(input).toHaveFocus();
        expect(document.getElementById(input.getAttribute("aria-activedescendant")!)).toHaveTextContent("Регион 20");
        state.regions = state.regions.slice(0, 2);
        rerender(<RegionCombobox regionCode="" onRegionChange={vi.fn()} />);
        expect(input).not.toHaveAttribute("aria-activedescendant");
        fireEvent.keyDown(input, { key: "Enter" });
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        await user.keyboard("{ArrowDown}");
        expect(document.getElementById(input.getAttribute("aria-activedescendant")!)).toHaveTextContent("Регион 1");
    });

    it("moves the active option with the mouse and confirms it with Enter", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<RegionCombobox regionCode="" onRegionChange={onChange} />);
        const input = screen.getByRole("combobox");
        await user.click(input);
        await user.keyboard("{ArrowDown}{ArrowDown}");
        const option = screen.getByRole("option", { name: "Регион 3" });
        fireEvent.mouseMove(option);
        expect(document.getElementById(input.getAttribute("aria-activedescendant")!)).toBe(option);
        expect(input).toHaveFocus();
        expect(onChange).not.toHaveBeenCalled();
        await user.keyboard("{Enter}");
        expect(onChange).toHaveBeenCalledWith("3", "Регион 3");
        expect(input).toHaveValue("Регион 3");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
});
