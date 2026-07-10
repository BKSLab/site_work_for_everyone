"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { useAuthStore } from "@/stores/auth";
import { ChatWindow } from "@/components/features/vera/ChatWindow";

const CAPABILITIES = [
    "Квоты и льготы",
    "Защита от увольнения",
    "Оформление сотрудника с инвалидностью",
    "Субсидии работодателю",
];

export default function AssistantChatPage() {
    const user = useAuthStore((s) => s.user);
    const greeting = user?.first_name ? `Привет, ${user.first_name}!` : "Привет!";
    const h1Ref = useRef<HTMLHeadingElement>(null);
    useEffect(() => { h1Ref.current?.focus(); }, []);

    return (
        <Container className="py-12">
            <div className="flex flex-col gap-8">

                {/* ── Кто такая Вера — на случай прямого перехода на страницу ── */}
                <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left">
                    <span
                        aria-hidden="true"
                        className="flex shrink-0 items-center justify-center self-center rounded-full ring-2 ring-accent/35 shadow-[0_0_40px_rgba(245,184,0,0.25)] sm:self-start"
                    >
                        <Image
                            src="/logo_ai_assistant.png"
                            alt=""
                            width={96}
                            height={96}
                            className="rounded-full"
                            priority
                        />
                    </span>

                    <div className="flex flex-col gap-3">
                        <h1 ref={h1Ref} tabIndex={-1} className="text-3xl font-bold text-foreground focus:outline-none">
                            {greeting} <span className="text-accent">Я Вера</span>
                        </h1>
                        <p className="max-w-xl text-muted">
                            Я — ИИ-консультант по правам людей с инвалидностью в сфере
                            труда. Отвечаю на вопросы соискателей, работников
                            и работодателей на основе Трудового кодекса, ФЗ-181
                            и авторских разборов — без регистрации.
                        </p>
                        <ul className="flex flex-wrap justify-center gap-2 sm:justify-start" aria-label="Темы, по которым можно спросить Веру">
                            {CAPABILITIES.map((item) => (
                                <li
                                    key={item}
                                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-muted"
                                >
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <ChatWindow />
            </div>
        </Container>
    );
}
