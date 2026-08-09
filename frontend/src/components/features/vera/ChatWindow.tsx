"use client";

import Image from "next/image";
import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { useVeraChat } from "@/hooks/useVeraChat";
import { ChatMessage } from "./ChatMessage";
import { VeraFeedbackModal } from "./VeraFeedbackModal";

const SUGGESTED_QUESTIONS = [
    "Какие квоты действуют при трудоустройстве?",
    "Могут ли уволить сотрудника с инвалидностью?",
    "Какие льготы положены работнику?",
    "Что такое соглашение о трудоустройстве инвалидов?",
];

export function ChatWindow() {
    const {
        sessionId,
        messages,
        sendMessage,
        status,
        error,
        announcement,
        isHistoryLoading,
        historyError,
        hasOlderHistory,
        isOlderHistoryLoading,
        loadOlderHistory,
    } = useVeraChat();
    const [input, setInput] = useState("");
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const previousScrollHeightRef = useRef<number | null>(null);

    useEffect(() => {
        if (listRef.current && previousScrollHeightRef.current !== null) {
            listRef.current.scrollTop +=
                listRef.current.scrollHeight - previousScrollHeightRef.current;
            previousScrollHeightRef.current = null;
            return;
        }
        listRef.current?.scrollTo({
            top: listRef.current.scrollHeight,
            behavior: "auto",
        });
    }, [messages]);

    function handleLoadOlderHistory() {
        if (listRef.current) {
            previousScrollHeightRef.current = listRef.current.scrollHeight;
        }
        void loadOlderHistory();
    }

    const isBusy = status === "waiting" || status === "streaming";

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const text = input.trim();
        if (!text || isBusy || isHistoryLoading || !sessionId) return;
        setInput("");
        void sendMessage(text);
    }

    function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
        ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
        }
    }

    function selectSuggestedQuestion(question: string) {
        setInput(question);
        inputRef.current?.focus();
    }

    return (
        <div className="flex w-full min-w-0 max-w-full flex-col gap-4">
            <section
                aria-label="Чат с Ассистентом Верой"
                className="flex h-[calc(100dvh-7rem)] min-h-[34rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.3)]"
            >
                <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
                    <span
                        aria-hidden="true"
                        className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-accent/45"
                    >
                        <Image
                            src="/logo_ai_assistant.png"
                            alt=""
                            width={44}
                            height={44}
                            priority
                            className="h-full w-full object-cover"
                        />
                    </span>
                    <div className="min-w-0">
                        <h1 className="text-base font-bold text-foreground">
                            Ассистент Вера
                        </h1>
                        <p className="truncate text-xs text-muted sm:text-sm">
                            Консультант по трудовым правам
                        </p>
                    </div>
                </header>

                <div
                    id="vera-chat-status"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="sr-only"
                >
                    {announcement}
                </div>

                <div
                    ref={listRef}
                    role="region"
                    aria-label="История переписки с Ассистентом Верой"
                    aria-busy={isBusy || isHistoryLoading}
                    className="vera-chat-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6"
                >
                    {hasOlderHistory && (
                        <div className="flex justify-center">
                            <Button
                                type="button"
                                variant="secondary"
                                disabled={isOlderHistoryLoading}
                                onClick={handleLoadOlderHistory}
                            >
                                {isOlderHistoryLoading
                                    ? "Загружаю…"
                                    : "Показать предыдущие"}
                            </Button>
                        </div>
                    )}
                    {isHistoryLoading && messages.length === 0 && (
                        <div className="m-auto flex items-center gap-2 text-sm text-muted">
                            <span
                                aria-hidden="true"
                                className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
                            />
                            <span>Восстанавливаю историю диалога…</span>
                        </div>
                    )}
                    {!isHistoryLoading && messages.length === 0 && (
                        <div className="m-auto flex w-full max-w-2xl flex-col items-center gap-5 py-6 text-center">
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                                    Чем я могу помочь?
                                </h2>
                                <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
                                    Спросите о правах, льготах или
                                    трудоустройстве. Ассистент Вера ответит на
                                    основе базы знаний.
                                </p>
                            </div>
                            <div
                                role="group"
                                aria-label="Примеры вопросов"
                                className="grid w-full gap-2 sm:grid-cols-2"
                            >
                                {SUGGESTED_QUESTIONS.map((question) => (
                                    <button
                                        key={question}
                                        type="button"
                                        onClick={() =>
                                            selectSuggestedQuestion(question)
                                        }
                                        className="min-h-11 rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-left text-sm leading-snug text-muted transition-colors hover:border-accent/50 hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                    >
                                        {question}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {messages.map((message) => (
                        <ChatMessage
                            key={message.id}
                            message={message}
                            sessionId={sessionId}
                        />
                    ))}
                </div>

                {(error || historyError) && (
                    <div className="space-y-2 border-t border-border px-3 py-2 sm:px-4">
                        {error && (
                            <ErrorMessage
                                title="Ассистент Вера временно недоступен"
                                message={error}
                            />
                        )}
                        {historyError && (
                            <ErrorMessage
                                title="Не удалось восстановить историю"
                                message={historyError}
                            />
                        )}
                    </div>
                )}

                <form
                    aria-label="Отправка сообщения Ассистенту Вере"
                    onSubmit={handleSubmit}
                    className="min-w-0 shrink-0 border-t border-border bg-background/45 p-3 sm:p-4"
                >
                    <label htmlFor="vera-chat-input" className="sr-only">
                        Сообщение для Ассистента Веры
                    </label>
                    <div className="flex min-w-0 items-end gap-2 rounded-2xl border border-border bg-surface-hover/45 p-2 pl-4 focus-within:border-accent/60 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                        <textarea
                            ref={inputRef}
                            id="vera-chat-input"
                            value={input}
                            onChange={(event) =>
                                setInput(event.target.value)
                            }
                            onKeyDown={handleInputKeyDown}
                            disabled={isHistoryLoading}
                            rows={1}
                            aria-describedby="vera-chat-input-hint"
                            placeholder="Напишите вопрос Ассистенту Вере…"
                            className="max-h-36 min-h-7 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 [field-sizing:content]"
                        />
                        <Button
                            type="submit"
                            variant="primary"
                            aria-label="Отправить"
                            title="Отправить"
                            disabled={
                                isBusy ||
                                isHistoryLoading ||
                                !sessionId ||
                                !input.trim()
                            }
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl p-0"
                        >
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="m22 2-7 20-4-9-9-4Z" />
                                <path d="M22 2 11 13" />
                            </svg>
                        </Button>
                    </div>
                    <p
                        id="vera-chat-input-hint"
                        className="break-words px-2 pt-2 text-xs leading-relaxed text-muted"
                    >
                        <span className="block">
                            Enter — отправить, Shift+Enter — новая строка.
                            Ассистент Вера может ошибаться — проверяйте важную
                            информацию.
                        </span>
                        <span className="mt-0.5 block">
                            Консультацию можно отправить на почту — попросите
                            об этом в сообщении и укажите адрес.
                        </span>
                    </p>
                </form>
            </section>

            <div className="flex justify-end">
                <VeraFeedbackModal sessionId={sessionId} />
            </div>
        </div>
    );
}
