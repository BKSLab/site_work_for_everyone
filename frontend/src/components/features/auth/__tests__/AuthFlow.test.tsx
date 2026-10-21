import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth";
import { setPendingFavorite, getPendingFavorite } from "@/lib/utils/pendingFavorite";

const { navigation, api, favoriteAdd } = vi.hoisted(() => ({
    navigation: { params: new URLSearchParams(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
    api: {
        login: vi.fn(), register: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(),
        verifyEmail: vi.fn(), resendVerificationCode: vi.fn(), me: vi.fn(),
    },
    favoriteAdd: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => navigation,
    useSearchParams: () => navigation.params,
}));
vi.mock("@/lib/api/auth", () => ({ authApi: api }));
vi.mock("@/lib/api", () => ({ favoritesApi: { add: favoriteAdd } }));

import LoginPage from "@/app/auth/login/page";
import RegisterPage from "@/app/auth/register/page";
import ForgotPasswordPage from "@/app/auth/forgot-password/page";
import ResetPasswordPage from "@/app/auth/reset-password/page";
import VerifyEmailPage from "@/app/auth/verify-email/page";

const userData = { email: "person@example.com", first_name: "Test", last_name: "User" };

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function show(ui: ReactNode, query = "") {
    navigation.params = new URLSearchParams(query);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function fill(id: string, value: string) {
    fireEvent.change(document.getElementById(id)!, { target: { value } });
}

function submit() {
    fireEvent.submit(document.querySelector("form")!);
}

beforeEach(() => {
    vi.clearAllMocks();
    Object.values(api).forEach((method) => method.mockReset());
    useAuthStore.getState().reset();
    sessionStorage.clear();
    api.login.mockResolvedValue({ user: userData });
    api.verifyEmail.mockResolvedValue({ user: userData });
    api.register.mockResolvedValue({ msg: "OK" });
    api.forgotPassword.mockResolvedValue({ msg: "OK" });
    api.resetPassword.mockResolvedValue({ msg: "OK" });
    api.resendVerificationCode.mockResolvedValue({ msg: "OK" });
    favoriteAdd.mockResolvedValue(undefined);
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("correcting auth forms", () => {
    it("focuses the first invalid login field after its description is rendered and preserves correct input", () => {
        show(<LoginPage />);
        submit();
        const email = document.getElementById("login-email");
        expect(email).toHaveFocus();
        expect(email).toHaveAccessibleDescription("Введите email.");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();

        fill("login-email", userData.email);
        submit();
        expect(document.getElementById("login-password")).toHaveFocus();
        expect(email).toHaveValue(userData.email);
        expect(api.login).not.toHaveBeenCalled();
    });

    it("follows registration's visual field order including required consent", () => {
        show(<RegisterPage />);
        submit();
        expect(document.getElementById("register-first-name")).toHaveFocus();
        fill("register-first-name", "Test");
        submit();
        expect(document.getElementById("register-last-name")).toHaveFocus();
        fill("register-last-name", "User");
        fill("register-email", userData.email);
        fill("register-password", "password123");
        submit();
        expect(document.getElementById("register-consent")).toHaveFocus();
        expect(document.getElementById("register-email")).toHaveValue(userData.email);
        expect(api.register).not.toHaveBeenCalled();
    });

    it("lets the user correct a recovery email", () => {
        show(<ForgotPasswordPage />, "email=bad");
        submit();
        expect(document.getElementById("forgot-email")).toHaveFocus();
        expect(document.getElementById("forgot-email")).toHaveAccessibleDescription("Введите корректный email адрес.");
    });

    it.each([
        { Page: VerifyEmailPage, prefix: "verify", email: "bad" },
        { Page: VerifyEmailPage, prefix: "verify", email: "" },
        { Page: ResetPasswordPage, prefix: "reset", email: "bad" },
        { Page: ResetPasswordPage, prefix: "reset", email: "" },
    ])("shows and corrects $prefix email context '$email' without discarding other fields", async ({ Page, prefix, email }) => {
        show(<Page />, `email=${email}`);
        const field = document.getElementById(`${prefix}-email`)!;
        expect(field).toHaveAttribute("aria-invalid", "true");
        expect(field).toHaveAccessibleDescription(email ? "Некорректный email." : "Email обязателен.");
        expect(field).not.toHaveAttribute("readonly");
        fill(`${prefix}-code`, "a1b2c3");
        if (prefix === "reset") fill("reset-new-password", "password123");
        submit();
        expect(field).toHaveFocus();
        expect(document.getElementById(`${prefix}-code`)).toHaveValue("a1b2c3");
        expect(navigation.replace).not.toHaveBeenCalled();
        fill(`${prefix}-email`, userData.email);
        submit();
        await waitFor(() => expect(prefix === "reset" ? api.resetPassword : api.verifyEmail).toHaveBeenCalledOnce());
    });

    it("focuses reset code before the new password and retains a valid email", () => {
        show(<ResetPasswordPage />, `email=${userData.email}`);
        submit();
        expect(document.getElementById("reset-code")).toHaveFocus();
        fill("reset-code", "a1b2c3");
        submit();
        expect(document.getElementById("reset-new-password")).toHaveFocus();
        expect(document.getElementById("reset-email")).toHaveValue(userData.email);
    });
});

describe("pending and error handling", () => {
    it.each([
        { Page: LoginPage, key: "login", method: api.login, fields: { "login-email": userData.email, "login-password": "password123" } },
        { Page: RegisterPage, key: "register", method: api.register, fields: { "register-first-name": "Test", "register-last-name": "User", "register-email": userData.email, "register-password": "password123" } },
        { Page: ForgotPasswordPage, key: "forgotPassword", method: api.forgotPassword, fields: { "forgot-email": userData.email } },
        { Page: VerifyEmailPage, key: "verifyEmail", method: api.verifyEmail, fields: { "verify-code": "a1b2c3" } },
        { Page: ResetPasswordPage, key: "resetPassword", method: api.resetPassword, fields: { "reset-code": "a1b2c3", "reset-new-password": "password123" } },
    ])("guards repeated $key submit, reports pending outside busy and permits retry after failure", async ({ Page, key, method, fields }) => {
        const request = deferred<never>();
        method.mockReturnValueOnce(request.promise);
        show(<Page />, `email=${userData.email}`);
        for (const [id, value] of Object.entries(fields)) fill(id, value!);
        if (key === "register") fireEvent.click(document.getElementById("register-consent")!);
        act(() => { submit(); submit(); });
        await waitFor(() => expect(method).toHaveBeenCalledOnce());
        const button = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        await waitFor(() => expect(button).toBeDisabled());
        const status = screen.getAllByRole("status").find((node) => node.textContent === "Отправляем…")!;
        expect(status).toBeDefined();
        expect(status.closest('[aria-busy="true"]')).toBeNull();
        await act(async () => request.reject(new TypeError("offline")));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Произошла ошибка. Попробуйте позже."));
        expect(button).toBeEnabled();
        submit();
        await waitFor(() => expect(method).toHaveBeenCalledTimes(2));
    });

    it.each([
        { error: new ApiRequestError(401, "Invalid credentials."), message: "Неверный email или пароль." },
        { error: new ApiRequestError(403, "The user is inactive. Access is denied."), message: "Аккаунт неактивен. Доступ запрещён." },
        { error: new ApiRequestError(403, "Email not verified or account inactive."), message: "Email не подтверждён или аккаунт неактивен." },
        { error: new TypeError("offline"), message: "Произошла ошибка. Попробуйте позже." },
    ])("keeps a failed login with $message on a correctable screen", async ({ error, message }) => {
        api.login.mockRejectedValue(error);
        show(<LoginPage />, `email=${userData.email}`);
        fill("login-password", "password123");
        submit();
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
        expect(navigation.push).not.toHaveBeenCalled();
        expect(document.getElementById("login-email")).toHaveValue(userData.email);
    });

    it("sends only explicit unverified 403 to verification while retaining context", async () => {
        api.login.mockRejectedValue(new ApiRequestError(403, "The email address has not been verified. Please confirm your email to proceed."));
        show(<LoginPage />, `email=${userData.email}&redirect=%2Fassistant%2Fstart`);
        fill("login-password", "password123");
        submit();
        await waitFor(() => expect(navigation.push).toHaveBeenCalledOnce());
        const target = new URL(navigation.push.mock.calls[0][0], "https://example.test");
        expect(target.pathname).toBe("/auth/verify-email");
        expect(target.searchParams.get("email")).toBe(userData.email);
        expect(target.searchParams.get("redirect")).toBe("/assistant/start");
    });

    it.each([new TypeError("offline"), new SyntaxError("invalid JSON"), new ApiRequestError(429, "Too Many Requests")])("reports any resend failure, removes stale errors and permits retry: %s", async (error) => {
        api.resendVerificationCode.mockRejectedValueOnce(error);
        const request = deferred<{ msg: string }>();
        api.resendVerificationCode.mockReturnValueOnce(request.promise);
        show(<VerifyEmailPage />, `email=${userData.email}`);
        const resend = screen.getByRole("button", { name: "Отправить повторно" });
        fireEvent.click(resend);
        await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
        expect(resend).toBeEnabled();
        act(() => { fireEvent.click(resend); fireEvent.click(resend); });
        await waitFor(() => expect(api.resendVerificationCode).toHaveBeenCalledTimes(2));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByText("Отправляем код…")).toHaveAttribute("role", "status");
        await act(async () => request.resolve({ msg: "OK" }));
        await waitFor(() => expect(resend).toBeDisabled());
        expect(screen.getByText(/Код отправлен на/)).toHaveTextContent(userData.email);
    });

    it("keeps the resend name stable, guards cooldown and announces readiness once", async () => {
        vi.useFakeTimers();
        show(<VerifyEmailPage />, `email=${userData.email}`);
        const resend = screen.getByRole("button", { name: "Отправить повторно" });
        await act(async () => { fireEvent.click(resend); fireEvent.click(resend); await vi.advanceTimersByTimeAsync(1); });
        expect(api.resendVerificationCode).toHaveBeenCalledOnce();
        expect(resend).toBeDisabled();
        expect(screen.getByText("Повторная отправка через 60 сек.")).not.toHaveAttribute("aria-live");
        const status = screen.getByText(/Код отправлен на/);
        const mutations: string[] = [];
        const observer = new MutationObserver(() => mutations.push(status.textContent ?? ""));
        observer.observe(status, { childList: true, characterData: true, subtree: true });
        await act(async () => { fireEvent.click(resend); await vi.advanceTimersByTimeAsync(59_000); });
        expect(api.resendVerificationCode).toHaveBeenCalledOnce();
        expect(resend).toHaveAccessibleName("Отправить повторно");
        expect(resend).toBeDisabled();
        expect(mutations).toEqual([]);
        await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
        expect(resend).toBeEnabled();
        expect(status).toHaveTextContent("Можно отправить код повторно.");
        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
        observer.disconnect();
        expect(mutations.filter((text) => text === "Можно отправить код повторно.")).toHaveLength(1);
        await act(async () => { fireEvent.click(resend); await vi.advanceTimersByTimeAsync(1); });
        expect(api.resendVerificationCode).toHaveBeenCalledTimes(2);
    });

    it("validates resend's editable email and prevents verification while its request is pending", async () => {
        const request = deferred<{ msg: string }>();
        api.resendVerificationCode.mockReturnValueOnce(request.promise);
        show(<VerifyEmailPage />, "email=bad");
        const resend = screen.getByRole("button", { name: "Отправить повторно" });
        fireEvent.click(resend);
        expect(document.getElementById("verify-email")).toHaveFocus();
        expect(api.resendVerificationCode).not.toHaveBeenCalled();
        fill("verify-email", userData.email);
        fill("verify-code", "a1b2c3");
        act(() => { fireEvent.click(resend); submit(); });
        await waitFor(() => expect(api.resendVerificationCode).toHaveBeenCalledWith({ email: userData.email }));
        expect(api.verifyEmail).not.toHaveBeenCalled();
        await act(async () => request.resolve({ msg: "OK" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Подтвердить" })).toBeEnabled());
        submit();
        await waitFor(() => expect(api.verifyEmail).toHaveBeenCalledOnce());
    });
});

describe("auth completion and retained context", () => {
    it("keeps an external focus when password reset completes after the user left the form", async () => {
        const request = deferred<{ msg: string }>();
        api.resetPassword.mockReturnValueOnce(request.promise);
        show(<><button type="button">Навигация сайта</button><ResetPasswordPage /></>, `email=${userData.email}`);
        fill("reset-code", "a1b2c3");
        fill("reset-new-password", "password123");
        submit();
        await waitFor(() => expect(api.resetPassword).toHaveBeenCalledOnce());
        const outside = screen.getByRole("button", { name: "Навигация сайта" });
        outside.focus();
        await act(async () => request.resolve({ msg: "OK" }));
        await screen.findByRole("link", { name: "Перейти к входу" });
        expect(outside).toHaveFocus();
    });

    it("links to the account whose password was changed even if email was edited while pending", async () => {
        const request = deferred<{ msg: string }>();
        api.resetPassword.mockReturnValueOnce(request.promise);
        show(<ResetPasswordPage />, `email=${userData.email}`);
        fill("reset-code", "a1b2c3");
        fill("reset-new-password", "password123");
        submit();
        await waitFor(() => expect(api.resetPassword).toHaveBeenCalledOnce());
        fill("reset-email", "another@example.com");
        await act(async () => request.resolve({ msg: "OK" }));
        const link = await screen.findByRole("link", { name: "Перейти к входу" });
        expect(new URL(link.getAttribute("href")!, "https://example.test").searchParams.get("email")).toBe(userData.email);
    });

    it("retains editable email and the original destination through recovery, reset and login", async () => {
        let view = show(<LoginPage />, "email=old%40example.com&redirect=%2Fassistant%2Fstart%3Fstep%3D2");
        fill("login-email", userData.email);
        const forgotUrl = new URL(screen.getByRole("link", { name: "Забыли пароль?" }).getAttribute("href")!, "https://example.test");
        expect(forgotUrl.searchParams.get("email")).toBe(userData.email);
        view.unmount();

        view = show(<ForgotPasswordPage />, forgotUrl.search);
        expect(document.getElementById("forgot-email")).toHaveValue(userData.email);
        fill("forgot-email", "changed@example.com");
        submit();
        await waitFor(() => expect(navigation.push).toHaveBeenCalledOnce());
        const resetUrl = new URL(navigation.push.mock.calls[0][0], "https://example.test");
        expect(resetUrl.searchParams.get("email")).toBe("changed@example.com");
        expect(resetUrl.searchParams.get("redirect")).toBe("/assistant/start?step=2");
        view.unmount();
        navigation.push.mockClear();

        view = show(<ResetPasswordPage />, resetUrl.search);
        fill("reset-code", "a1b2c3");
        fill("reset-new-password", "password123");
        submit();
        const result = await screen.findByText("Пароль успешно изменён. Теперь вы можете войти с новым паролем.");
        expect(result).toHaveFocus();
        expect(result).not.toHaveAttribute("aria-live");
        vi.useFakeTimers();
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        expect(navigation.push).not.toHaveBeenCalled();
        expect(result).toBeInTheDocument();
        vi.useRealTimers();
        const loginUrl = new URL(screen.getByRole("link", { name: "Перейти к входу" }).getAttribute("href")!, "https://example.test");
        view.unmount();

        show(<LoginPage />, loginUrl.search);
        expect(document.getElementById("login-email")).toHaveValue("changed@example.com");
        fill("login-password", "password123");
        submit();
        await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/assistant/start?step=2"));
    });

    it.each([
        { Page: LoginPage, field: "login-password", value: "password123" },
        { Page: VerifyEmailPage, field: "verify-code", value: "a1b2c3" },
    ])("restores the pending favorite before navigating from $field", async ({ Page, field, value }) => {
        const request = deferred<void>();
        favoriteAdd.mockReturnValueOnce(request.promise);
        setPendingFavorite("vacancy-42");
        show(<Page />, `email=${userData.email}&redirect=%2Ffavorites`);
        fill(field, value);
        submit();
        await waitFor(() => expect(favoriteAdd).toHaveBeenCalledWith({ user_id: userData.email, vacancy_id: "vacancy-42" }));
        expect(getPendingFavorite()).toBeNull();
        expect(navigation.refresh).toHaveBeenCalledOnce();
        expect(navigation.push).not.toHaveBeenCalled();
        await act(async () => request.resolve());
        await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/favorites"));
    });
});
