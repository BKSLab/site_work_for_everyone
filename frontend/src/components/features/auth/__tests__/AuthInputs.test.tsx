import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { OtpCodeInput } from "../OtpCodeInput";
import { PasswordInput } from "../PasswordInput";

describe("auth input instructions", () => {
    it("accepts an entire alphanumeric code by paste and describes its format", async () => {
        function CodeField() {
            const [code, setCode] = useState("");
            return <OtpCodeInput id="test-code" value={code} onChange={setCode} error="Введите код подтверждения." />;
        }
        const user = userEvent.setup();
        render(<CodeField />);
        const input = screen.getByRole("textbox");
        expect(input).toHaveAttribute("inputmode", "text");
        expect(input).toHaveAttribute("autocomplete", "one-time-code");
        expect(input).toHaveAttribute("autocapitalize", "none");
        expect(input).toHaveAttribute("spellcheck", "false");
        expect(input).toHaveAccessibleDescription("6 символов: цифры и латинские буквы. Введите код подтверждения.");
        await user.click(input);
        await user.paste("a1b2c3");
        expect(input).toHaveValue("a1b2c3");
    });

    it("combines new-password limits with an error without adding creation rules to login", () => {
        render(<>
            <PasswordInput id="new-password" label="Новый пароль" value="short" onChange={() => {}} autoComplete="new-password" error="Слишком короткий пароль." />
            <PasswordInput id="login-password" label="Пароль" value="" onChange={() => {}} />
        </>);
        expect(screen.getByLabelText(/^Новый пароль/)).toHaveAccessibleDescription("От 8 до 255 символов. Слишком короткий пароль.");
        expect(screen.getByLabelText(/^Пароль/)).not.toHaveAttribute("aria-describedby");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});
