"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Spinner } from "@/components/ui/Spinner";
import { useVeraChat } from "@/hooks/useVeraChat";
import { ChatMessage } from "./ChatMessage";

export function ChatWindow() {
    const { messages, sendMessage, status, error } = useVeraChat();
    const [input, setInput] = useState("");
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const isBusy = status === "waiting" || status === "streaming";

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const text = input.trim();
        if (!text || isBusy) return;
        setInput("");
        void sendMessage(text);
    }

    return (
        <div className="flex h-[70vh] flex-col gap-4 rounded-2xl border border-white/15 bg-white/[0.04] p-4 backdrop-blur-md">
            <div
                ref={listRef}
                role="log"
                aria-live="polite"
                aria-label="История переписки с Верой"
                className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1"
            >
                {messages.length === 0 && (
                    <p className="text-sm text-muted">
                        Задайте вопрос о правах, льготах или трудоустройстве — Вера ответит
                        на основе базы знаний.
                    </p>
                )}
                {messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                ))}
                {status === "waiting" && (
                    <Spinner className="self-start" />
                )}
            </div>

            {error && <ErrorMessage title="Вера временно недоступна" message={error} />}

            <form onSubmit={handleSubmit} className="flex gap-2">
                <label htmlFor="vera-chat-input" className="sr-only">
                    Сообщение для Веры
                </label>
                <input
                    id="vera-chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isBusy}
                    placeholder="Например: какая квота на трудоустройство инвалидов?"
                    className="flex-1 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
                <Button type="submit" variant="primary" disabled={isBusy || !input.trim()}>
                    Отправить
                </Button>
            </form>
        </div>
    );
}
