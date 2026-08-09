import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VeraScopeNotice } from "../VeraScopeNotice";

describe("VeraScopeNotice", () => {
    it("explains the limits and purpose of Vera's consultation", () => {
        render(<VeraScopeNotice />);

        const notice = screen.getByRole("complementary", {
            name: "Важно о консультациях Ассистента Веры",
        });

        expect(notice).toHaveTextContent(
            "Ассистент Вера не заменяет юриста",
        );
        expect(notice).toHaveTextContent("какие у меня права");
        expect(notice).toHaveTextContent(
            "что работодатель обязан сделать",
        );
        expect(notice).toHaveTextContent("куда обратиться");
    });
});
