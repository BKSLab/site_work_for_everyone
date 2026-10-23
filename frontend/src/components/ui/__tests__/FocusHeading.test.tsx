import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FocusHeading } from "../FocusHeading";

afterEach(cleanup);

describe("FocusHeading", () => {
    it("moves focus to the heading without scrolling", () => {
        const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");

        render(<FocusHeading id="test-heading" className="text-3xl">Справка</FocusHeading>);

        const heading = screen.getByRole("heading", { level: 1, name: "Справка" });
        expect(document.activeElement).toBe(heading);
        expect(focusSpy).toHaveBeenCalledWith(
            expect.objectContaining({ preventScroll: true }),
        );

        focusSpy.mockRestore();
    });

    it("keeps the heading unfocusable via Tab", () => {
        render(<FocusHeading id="test-heading">Справка</FocusHeading>);

        const heading = screen.getByRole("heading", { level: 1 });
        expect(heading).toHaveAttribute("tabindex", "-1");
    });

    it("lets a page with deep links manage its own initial focus", () => {
        const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
        render(<FocusHeading focusOnMount={false}>Справка</FocusHeading>);
        expect(focusSpy).not.toHaveBeenCalled();
        focusSpy.mockRestore();
    });
});
