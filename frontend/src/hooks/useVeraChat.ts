"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { veraApi } from "@/lib/api/vera";

const SESSION_STORAGE_KEY = "vera_session_id";

// 24ч — совпадает с REDIS_SESSION_TTL_SECONDS в vera_agent_service
// (LangGraph checkpointer теряет историю после этого TTL, значит и на
// клиенте разумно начинать видимо новый разговор).
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Если за это время не пришло ни одного SSE-события (ни token, ни done,
// ни error) — считаем, что agent_service/RabbitMQ недоступны с точки
// зрения сайта (см. docs/VERA_AGENT_INTEGRATION_PLAN.md, "Обработка
// деградации"). Значение с запасом: analyze_intent + call_kb_search
// (пока нет первого токена) может занимать заметное время.
const RESPONSE_TIMEOUT_MS = 100_000;

export interface VeraChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    /** true, пока ассистент ещё стримит токены в это сообщение */
    streaming?: boolean;
}

type ChatStatus = "idle" | "waiting" | "streaming" | "unavailable";

type SseEvent =
    | { type: "token"; content: string }
    | { type: "done" }
    | { type: "error"; detail?: string };

function readOrCreateSessionId(): string {
    if (typeof window === "undefined") return "";

    try {
        const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { id: string; createdAt: number };
            if (Date.now() - parsed.createdAt < SESSION_TTL_MS) {
                return parsed.id;
            }
        }
    } catch {
        // Повреждённые данные в sessionStorage — генерируем новую сессию.
    }

    const id = crypto.randomUUID();
    window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ id, createdAt: Date.now() })
    );
    return id;
}

export function useVeraChat() {
    const [sessionId] = useState(readOrCreateSessionId);
    const [messages, setMessages] = useState<VeraChatMessage[]>([]);
    const [status, setStatus] = useState<ChatStatus>("idle");
    const [error, setError] = useState<string | null>(null);

    const eventSourceRef = useRef<EventSource | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const closeStream = useCallback(() => {
        // Обязательное явное закрытие: EventSource по умолчанию сам
        // переподключается при разрыве соединения сервером, а сервер
        // (vera_agent_service) держит только один активный SSE-коннект на
        // сессию — молчаливый реконнект создал бы гонку за уже закрытую
        // на сервере подписку.
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    useEffect(() => closeStream, [closeStream]);

    const sendMessage = useCallback(
        async (text: string) => {
            setError(null);
            setStatus("waiting");

            const assistantMessageId = crypto.randomUUID();
            setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), role: "user", content: text },
                { id: assistantMessageId, role: "assistant", content: "", streaming: true },
            ]);

            // Открываем SSE до публикации сообщения в очередь — проще
            // рассуждать о порядке событий, хотя буфер позднего
            // подключения на стороне agent_service (session_bus.py,
            // LATE_CONNECT_BUFFER_SECONDS = 60s) страхует и обратный порядок.
            const eventSource = new EventSource(`/vera/sse/${sessionId}`);
            eventSourceRef.current = eventSource;

            timeoutRef.current = setTimeout(() => {
                closeStream();
                setStatus("unavailable");
                setError("Вера сейчас недоступна. Попробуйте позже.");
            }, RESPONSE_TIMEOUT_MS);

            eventSource.onmessage = (event) => {
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }

                const data = JSON.parse(event.data) as SseEvent;

                if (data.type === "token") {
                    setStatus("streaming");
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMessageId
                                ? { ...m, content: m.content + data.content }
                                : m
                        )
                    );
                    return;
                }

                if (data.type === "done") {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMessageId ? { ...m, streaming: false } : m
                        )
                    );
                    setStatus("idle");
                    closeStream();
                    return;
                }

                // data.type === "error"
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMessageId ? { ...m, streaming: false } : m
                    )
                );
                setStatus("idle");
                setError(data.detail || "Вера не смогла ответить. Попробуйте ещё раз.");
                closeStream();
            };

            eventSource.onerror = () => {
                closeStream();
                setStatus("unavailable");
                setError("Не удалось получить ответ Веры. Проверьте соединение.");
            };

            try {
                await veraApi.sendMessage({ session_id: sessionId, message: text });
            } catch (err) {
                closeStream();
                setStatus("idle");
                setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
                setError(
                    err instanceof Error ? err.message : "Не удалось отправить сообщение."
                );
            }
        },
        [sessionId, closeStream]
    );

    return { messages, sendMessage, status, error };
}
