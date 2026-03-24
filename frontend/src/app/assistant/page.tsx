"use client";

import { Suspense } from "react";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { AssistantFlow } from "@/components/features/assistant/AssistantFlow";
import { useAuthStore } from "@/stores/auth";

function CheckIcon() {
    return (
        <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-accent"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function VeraGreeting() {
    const user = useAuthStore((s) => s.user);

    const greeting = user?.first_name
        ? `Привет, ${user.first_name}!`
        : "Привет!";

    return (
        <div className="flex flex-col gap-7 rounded-2xl border border-white/10 bg-white/[0.04] bg-[radial-gradient(ellipse_at_top_right,rgba(245,184,0,0.07),transparent_55%)] p-6 backdrop-blur-sm sm:p-8">

            {/* Шапка: аватар + приветствие */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
                <span className="flex h-24 w-24 shrink-0 items-center justify-center self-center rounded-full ring-2 ring-accent/35 shadow-[0_0_28px_rgba(245,184,0,0.18)]">
                    <Image
                        src="/logo_ai_assistant.png"
                        alt="Вера — карьерный ассистент"
                        width={96}
                        height={96}
                        className="rounded-full"
                        priority
                    />
                </span>
                <div>
                    <p className="text-xl font-bold text-foreground">
                        {greeting} <span className="text-accent">Я Вера</span> — карьерный ассистент.
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                        Поиск работы — это серьёзный шаг, и первое впечатление на работодателя
                        часто формируется ещё до собеседования. Я помогу вам выглядеть уверенно
                        на бумаге: грамотно представить свой опыт и выделиться среди других
                        кандидатов.
                    </p>
                </div>
            </div>

            {/* Разделитель */}
            <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Чем могу помочь */}
            <div className="flex flex-col gap-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-accent/80">
                    Чем я могу помочь
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                    {/* Сопроводительное письмо */}
                    <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-4">
                        <p className="text-sm font-semibold text-foreground">
                            Сопроводительное письмо
                        </p>
                        <p className="text-xs leading-relaxed text-muted">
                            Многие работодатели принимают решение о приглашении на собеседование
                            именно по сопроводительному письму. Я составлю письмо, которое
                            покажет вашу мотивацию, подчеркнёт сильные стороны и будет
                            написано под требования конкретной вакансии — а не по шаблону.
                        </p>
                        <ul className="mt-1 flex flex-col gap-1">
                            {[
                                "Учитывает требования вакансии",
                                "Показывает вашу мотивацию",
                                "Выделяет вас среди кандидатов",
                            ].map((item) => (
                                <li key={item} className="flex items-start gap-2 text-xs text-muted">
                                    <CheckIcon />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Рекомендации по резюме */}
                    <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-4">
                        <p className="text-sm font-semibold text-foreground">
                            Рекомендации по резюме
                        </p>
                        <p className="text-xs leading-relaxed text-muted">
                            Универсальное резюме редко работает хорошо. Я подскажу, как
                            адаптировать его под конкретную вакансию: что выдвинуть на
                            первый план, какие формулировки использовать и на что обратить
                            внимание рекрутера.
                        </p>
                        <ul className="mt-1 flex flex-col gap-1">
                            {[
                                "Адаптация под конкретную вакансию",
                                "Акцент на нужных навыках и опыте",
                                "Конкретные формулировки вместо общих фраз",
                            ].map((item) => (
                                <li key={item} className="flex items-start gap-2 text-xs text-muted">
                                    <CheckIcon />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Разделитель */}
            <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Режимы работы */}
            <div className="flex flex-col gap-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-accent/80">
                    Как это работает
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-4">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                                Быстро
                            </span>
                            <p className="text-sm font-semibold text-foreground">Базовый режим</p>
                        </div>
                        <p className="text-xs leading-relaxed text-muted">
                            Выберите вакансию — и я сразу подготовлю результат на основе её
                            описания. Никаких дополнительных вопросов. Подходит, если нужно
                            быстро откликнуться.
                        </p>
                    </div>
                    <div className="flex flex-col gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-4">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                                Точнее
                            </span>
                            <p className="text-sm font-semibold text-foreground">Индивидуальный режим</p>
                        </div>
                        <p className="text-xs leading-relaxed text-muted">
                            Я задам несколько вопросов о вашем опыте и мотивации, вы заполните
                            короткую анкету — и на её основе подготовлю персональный результат,
                            который точнее отражает именно вас.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AssistantPage() {
    return (
        <Container className="py-12">
            <div className="mx-auto flex max-w-2xl flex-col gap-8">
                <VeraGreeting />
                <Suspense>
                    <AssistantFlow />
                </Suspense>
            </div>
        </Container>
    );
}
