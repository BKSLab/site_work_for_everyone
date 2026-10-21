import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { useAuthStore } from "@/stores/auth";
import { AssistantFlow } from "../AssistantFlow";

const mocks = vi.hoisted(() => ({
    favorites: { data: { items: [{ vacancy_id: "one", vacancy_name: "Разработчик", employer_name: "Компания", vacancy_source: "hh.ru" }] }, isLoading: false, isError: false, refetch: vi.fn() },
    basic: vi.fn(), questionnaire: vi.fn(), submit: vi.fn(), copy: vi.fn(),
}));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ query: mocks.favorites }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("vacancy_id=one") }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("@/lib/utils/clipboard", () => ({ copyToClipboard: mocks.copy }));
vi.mock("@/lib/api/assistant", () => ({ assistantApi: {
    getCoverLetter: mocks.basic, getResumeTips: mocks.basic,
    getCoverLetterQuestionnaire: mocks.questionnaire, getResumeTipsQuestionnaire: mocks.questionnaire,
    getCoverLetterByQuestionnaire: mocks.submit, getResumeTipsByQuestionnaire: mocks.submit,
} }));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

async function goToMode(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Продолжить →" }));
    await user.click(screen.getByRole("button", { name: "Сопроводительное письмо" }));
}

describe("AssistantFlow accessibility", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().setUser({ email: "user@example.test", first_name: "Имя", last_name: "Фамилия" });
        mocks.favorites.isError = false;
        mocks.favorites.data.items = [{ vacancy_id: "one", vacancy_name: "Разработчик", employer_name: "Компания", vacancy_source: "hh.ru" }];
        mocks.basic.mockResolvedValue({ result: "<p>Готовый текст</p>" });
        mocks.questionnaire.mockResolvedValue({ questions: [
            { id: "experience", text: "Какой у вас опыт работы?", required: true },
            { id: "wish", text: "Что вы хотели бы добавить?", required: false },
        ] });
        mocks.submit.mockResolvedValue({ result: "<p>Личный результат</p>" });
        mocks.copy.mockResolvedValue(true);
    });

    it("shows a retryable favorites error instead of an empty list", async () => {
        mocks.favorites.isError = true;
        render(<AssistantFlow />);
        expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить избранные вакансии");
        expect(screen.queryByText(/В избранном пока нет/)).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
        expect(mocks.favorites.refetch).toHaveBeenCalledTimes(1);
    });

    it("leaves the vacancy popup with one Tab in either direction, while Escape returns to its button", async () => {
        const user = userEvent.setup();
        render(<><button>До мастера</button><AssistantFlow /></>);
        const trigger = screen.getByRole("button", { name: /Разработчик · Компания/ });
        await user.click(trigger);
        expect(screen.getByRole("listbox")).toHaveFocus();
        await user.tab();
        expect(screen.getByRole("button", { name: "Продолжить →" })).toHaveFocus();
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        await user.click(trigger);
        await user.tab({ shift: true });
        expect(screen.getByRole("button", { name: "До мастера" })).toHaveFocus();
        await user.click(trigger);
        await user.keyboard("{Escape}");
        expect(trigger).toHaveFocus();
    });

    it.each(["Базовый Быстро", "Индивидуальный Точнее"])("keeps the %s initiator focused and retryable after a failed request", async (name) => {
        const user = userEvent.setup();
        const request = deferred<{ result: string }>();
        mocks.basic.mockReturnValue(request.promise);
        mocks.questionnaire.mockReturnValue(request.promise);
        render(<AssistantFlow />);
        await goToMode(user);
        expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
        const button = screen.getByRole("button", { name });
        await user.click(button);
        expect(button).toHaveAttribute("aria-disabled", "true");
        expect(button).toHaveFocus();
        await user.click(button);
        expect(name.startsWith("Базовый") ? mocks.basic : mocks.questionnaire).toHaveBeenCalledTimes(1);
        await act(async () => request.reject(new Error("offline")));
        expect(button).toHaveFocus();
        expect(button).toHaveAttribute("aria-disabled", "false");
        expect(screen.getByRole("alert")).toHaveTextContent("Произошла ошибка");
    });

    it("keeps focus in the vacancy list while hovering and confirms the active option with Enter", async () => {
        const user = userEvent.setup();
        mocks.favorites.data.items.push(
            { vacancy_id: "two", vacancy_name: "Аналитик", employer_name: "Компания", vacancy_source: "hh.ru" },
            { vacancy_id: "three", vacancy_name: "Дизайнер", employer_name: "Компания", vacancy_source: "hh.ru" },
        );
        render(<AssistantFlow />);
        await user.click(screen.getByRole("button", { name: /Разработчик · Компания/ }));
        const list = screen.getByRole("listbox");
        const option = screen.getByRole("option", { name: "Дизайнер · Компания" });
        fireEvent.mouseMove(option);
        expect(list).toHaveFocus();
        expect(list).toHaveAttribute("aria-activedescendant", option.id);
        expect(option).toHaveAttribute("aria-selected", "false");
        await user.keyboard("{Enter}");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Дизайнер · Компания" })).toHaveFocus();
    });

    it.each(["Сопроводительное письмо", "Рекомендации по резюме"])("retains questionnaire answers when returning from the %s result", async (feature) => {
        const user = userEvent.setup();
        render(<AssistantFlow />);
        await user.click(screen.getByRole("button", { name: "Продолжить →" }));
        await user.click(screen.getByRole("button", { name: feature }));
        await user.click(screen.getByRole("button", { name: "Индивидуальный Точнее" }));
        await user.type(await screen.findByRole("textbox", { name: "Вопрос 1 Какой у вас опыт работы?" }), "Два года");
        await user.type(screen.getByRole("textbox", { name: "Вопрос 2 Что вы хотели бы добавить?" }), "Удалённая работа");
        await user.click(screen.getByRole("button", { name: "Получить результат →" }));
        expect(await screen.findByRole("heading", { name: feature })).toHaveFocus();
        await user.click(screen.getByRole("button", { name: "← Назад" }));
        expect(screen.getByRole("textbox", { name: "Вопрос 1 Какой у вас опыт работы?" })).toHaveValue("Два года");
        expect(screen.getByRole("textbox", { name: "Вопрос 2 Что вы хотели бы добавить?" })).toHaveValue("Удалённая работа");
    });

    it("labels questions with their text, focuses the first invalid answer and preserves entered answers after failure", async () => {
        const user = userEvent.setup();
        render(<AssistantFlow />);
        await goToMode(user);
        await user.click(screen.getByRole("button", { name: "Индивидуальный Точнее" }));
        const required = await screen.findByRole("textbox", { name: "Вопрос 1 Какой у вас опыт работы?" });
        const optional = screen.getByRole("textbox", { name: "Вопрос 2 Что вы хотели бы добавить?" });
        expect(required).toBeRequired();
        await user.type(optional, "Сохранить этот ответ");
        await user.click(screen.getByRole("button", { name: "Получить результат →" }));
        await waitFor(() => expect(required).toHaveFocus());
        expect(required).toHaveAttribute("aria-invalid", "true");
        expect(required).toHaveAccessibleDescription("Ответьте на этот вопрос.");
        await user.type(required, "Два года");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        const request = deferred<{ result: string }>();
        mocks.submit.mockReturnValue(request.promise);
        const submit = screen.getByRole("button", { name: "Получить результат →" });
        await user.click(submit);
        expect(submit).toHaveFocus();
        await act(async () => request.reject(new Error("offline")));
        expect(submit).toHaveFocus();
        expect(optional).toHaveValue("Сохранить этот ответ");
        expect(required).toHaveValue("Два года");
    });

    it("does not move focus after a late successful request when the user has moved elsewhere", async () => {
        const user = userEvent.setup();
        const request = deferred<{ result: string }>();
        mocks.basic.mockReturnValue(request.promise);
        render(<><AssistantFlow /><button>За пределами мастера</button></>);
        await goToMode(user);
        await user.click(screen.getByRole("button", { name: "Базовый Быстро" }));
        const outside = screen.getByRole("button", { name: "За пределами мастера" });
        await user.click(outside);
        await act(async () => request.resolve({ result: "<p>Ответ</p>" }));
        expect(outside).toHaveFocus();
    });

    it.each(["basic", "individual"])("focuses the new heading when the user moved to another mode button during %s loading", async (mode) => {
        const user = userEvent.setup();
        const request = deferred<{ result: string } | { questions: { id: string; text: string; required: boolean }[] }>();
        mocks.basic.mockReturnValue(request.promise);
        mocks.questionnaire.mockReturnValue(request.promise);
        render(<AssistantFlow />);
        await goToMode(user);
        const basic = screen.getByRole("button", { name: "Базовый Быстро" });
        const individual = screen.getByRole("button", { name: "Индивидуальный Точнее" });
        await user.click(mode === "basic" ? basic : individual);
        await user.tab({ shift: mode === "individual" });
        expect(mode === "basic" ? individual : basic).toHaveFocus();
        await act(async () => request.resolve(mode === "basic"
            ? { result: "<p>Ответ</p>" }
            : { questions: [{ id: "experience", text: "Ваш опыт?", required: true }] }));
        expect(screen.getByRole("heading", { name: mode === "basic" ? "Сопроводительное письмо" : "Персональная анкета" })).toHaveFocus();
    });

    it("focuses the result heading when an answer textarea is focused as generation finishes", async () => {
        const user = userEvent.setup();
        render(<AssistantFlow />);
        await goToMode(user);
        await user.click(screen.getByRole("button", { name: "Индивидуальный Точнее" }));
        await user.type(await screen.findByRole("textbox", { name: "Вопрос 1 Какой у вас опыт работы?" }), "Два года");
        const request = deferred<{ result: string }>();
        mocks.submit.mockReturnValue(request.promise);
        await user.click(screen.getByRole("button", { name: "Получить результат →" }));
        await user.tab({ shift: true });
        await user.tab({ shift: true });
        expect(screen.getByRole("textbox", { name: "Вопрос 2 Что вы хотели бы добавить?" })).toHaveFocus();
        await act(async () => request.resolve({ result: "<p>Личный результат</p>" }));
        expect(screen.getByRole("heading", { name: "Сопроводительное письмо" })).toHaveFocus();
    });

    it("retains the result action and the result itself when loading its questionnaire fails", async () => {
        const user = userEvent.setup();
        render(<AssistantFlow />);
        await goToMode(user);
        await user.click(screen.getByRole("button", { name: "Базовый Быстро" }));
        const action = await screen.findByRole("button", { name: "Заполнить анкету →" });
        const request = deferred<{ questions: [] }>();
        mocks.questionnaire.mockReturnValue(request.promise);
        await user.click(action);
        expect(action).toHaveFocus();
        expect(action).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByText("Готовый текст")).toBeInTheDocument();
        await act(async () => request.reject(new Error("offline")));
        expect(action).toHaveFocus();
        expect(screen.getByRole("alert")).toHaveTextContent("Произошла ошибка");
        expect(screen.getByText("Готовый текст")).toBeInTheDocument();
    });

    it("reports actual copy failure and keeps the copy action available", async () => {
        const user = userEvent.setup();
        render(<AssistantFlow />);
        await goToMode(user);
        await user.click(screen.getByRole("button", { name: "Базовый Быстро" }));
        const copy = await screen.findByRole("button", { name: "Скопировать" });
        mocks.copy.mockResolvedValueOnce(false);
        await user.click(copy);
        expect(screen.getByRole("status")).toHaveTextContent("Не удалось скопировать");
        expect(copy).toHaveFocus();
        await user.click(copy);
        expect(screen.getByRole("status")).toHaveTextContent("Скопировано.");
        expect(mocks.copy).toHaveBeenLastCalledWith("Готовый текст");
    });
});
