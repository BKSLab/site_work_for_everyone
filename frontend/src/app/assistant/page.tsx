"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { useAuthStore } from "@/stores/auth";

function CheckIcon() {
    return (
        <svg
            width="14"
            height="14"
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

export default function AssistantPage() {
    const user = useAuthStore((s) => s.user);
    const greeting = user?.first_name ? `Привет, ${user.first_name}!` : "Привет!";
    const h1Ref = useRef<HTMLHeadingElement>(null);
    useEffect(() => { h1Ref.current?.focus(); }, []);

    return (
        <Container className="py-12">
            <div className="flex flex-col gap-10">

                {/* ── Герой ──────────────────────────────────────────────── */}
                <div className="flex flex-col items-center gap-8 text-center sm:flex-row sm:items-start sm:gap-12 sm:text-left">
                    <span
                        aria-hidden="true"
                        className="flex shrink-0 items-center justify-center self-center rounded-full ring-2 ring-accent/35 shadow-[0_0_56px_rgba(245,184,0,0.25)] sm:self-start"
                    >
                        <Image
                            src="/logo_ai_assistant.png"
                            alt=""
                            width={220}
                            height={220}
                            className="rounded-full"
                            priority
                        />
                    </span>

                    <div className="flex flex-col gap-5">
                        <h1 ref={h1Ref} tabIndex={-1} className="text-3xl font-bold text-foreground sm:text-4xl focus:outline-none">
                            {greeting} <span className="text-accent">Я Вера</span> —<br className="hidden sm:block" /> ваш карьерный ассистент
                        </h1>
                        <p className="max-w-xl text-lg leading-relaxed text-muted">
                            Поиск работы — серьёзный шаг. Первое впечатление о кандидате
                            работодатель часто составляет ещё до собеседования, по резюме
                            и сопроводительному письму. Я помогу вам выглядеть уверенно
                            на бумаге: грамотно представить опыт и выделиться среди других.
                        </p>
                        <div>
                            <Link
                                href="/assistant/start"
                                className="inline-flex items-center gap-2 rounded-xl border border-accent/50 bg-accent/[0.08] px-6 py-3 text-sm font-semibold text-accent transition-all hover:border-accent hover:bg-accent/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                Начать работу с Верой
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Разделитель */}
                <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                {/* ── Чем могу помочь ────────────────────────────────────── */}
                <section aria-labelledby="features-heading">
                    <h2
                        id="features-heading"
                        className="mb-5 text-xs font-semibold uppercase tracking-widest text-accent/80"
                    >
                        Чем я могу помочь
                    </h2>
                    <div className="grid gap-5 sm:grid-cols-2">

                        {/* Сопроводительное письмо */}
                        <article className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]">
                            {/* Верхняя линия-highlight */}
                            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
                            {/* Угловое свечение */}
                            <div aria-hidden="true" className="absolute -top-10 -right-10 h-36 w-36 rounded-full bg-accent/[0.10] blur-3xl" />
                            <div className="relative flex flex-col gap-4 p-6">
                                {/* Иконка */}
                                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="2" y="4" width="20" height="16" rx="2" />
                                        <path d="M2 7l10 7 10-7" />
                                    </svg>
                                </span>
                                <h3 className="text-base font-bold text-foreground">
                                    Сопроводительное письмо
                                </h3>
                                <p className="text-sm leading-relaxed text-muted">
                                    Многие работодатели принимают решение о приглашении на собеседование
                                    именно по сопроводительному письму. Я составлю письмо, которое
                                    покажет вашу мотивацию, подчеркнёт сильные стороны и будет
                                    написано под требования конкретной вакансии, — а не по шаблону.
                                </p>
                                <ul className="flex flex-col gap-2 border-t border-white/8 pt-3" aria-label="Преимущества сопроводительного письма">
                                    {[
                                        "Учитывает требования вакансии",
                                        "Показывает вашу мотивацию",
                                        "Выделяет вас среди кандидатов",
                                    ].map((item) => (
                                        <li key={item} className="flex items-start gap-2 text-sm text-muted">
                                            <CheckIcon />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </article>

                        {/* Рекомендации по резюме */}
                        <article className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]">
                            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
                            <div aria-hidden="true" className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-accent/[0.08] blur-3xl" />
                            <div className="relative flex flex-col gap-4 p-6">
                                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                        <line x1="10" y1="9" x2="8" y2="9" />
                                    </svg>
                                </span>
                                <h3 className="text-base font-bold text-foreground">
                                    Рекомендации по резюме
                                </h3>
                                <p className="text-sm leading-relaxed text-muted">
                                    Универсальное резюме редко работает хорошо. Я подскажу, как
                                    адаптировать его под конкретную вакансию: что выдвинуть на
                                    первый план, какие формулировки использовать и на что обратить
                                    внимание рекрутера.
                                </p>
                                <ul className="flex flex-col gap-2 border-t border-white/8 pt-3" aria-label="Преимущества рекомендаций по резюме">
                                    {[
                                        "Адаптация под конкретную вакансию",
                                        "Акцент на нужных навыках и опыте",
                                        "Конкретные формулировки вместо общих фраз",
                                    ].map((item) => (
                                        <li key={item} className="flex items-start gap-2 text-sm text-muted">
                                            <CheckIcon />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </article>

                    </div>
                </section>

                {/* ── Как это работает ───────────────────────────────────── */}
                <section aria-labelledby="how-heading">
                    <h2
                        id="how-heading"
                        className="mb-5 text-xs font-semibold uppercase tracking-widest text-accent/80"
                    >
                        Как это работает
                    </h2>
                    <div className="grid gap-5 sm:grid-cols-2">

                        <article className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]">
                            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                            <div aria-hidden="true" className="absolute -top-8 -left-8 h-28 w-28 rounded-full bg-white/[0.04] blur-2xl" />
                            <div className="relative flex flex-col gap-3 p-6">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                        </svg>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                                            Быстро
                                        </span>
                                        <h3 className="text-sm font-bold text-foreground">Базовый режим</h3>
                                    </div>
                                </div>
                                <p className="text-sm leading-relaxed text-muted">
                                    Выберите вакансию — и я сразу подготовлю результат на основе её
                                    описания. Никаких дополнительных вопросов. Подходит, если нужно
                                    быстро откликнуться.
                                </p>
                            </div>
                        </article>

                        <article className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]">
                            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                            <div aria-hidden="true" className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/[0.04] blur-2xl" />
                            <div className="relative flex flex-col gap-3 p-6">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                            <circle cx="12" cy="7" r="4" />
                                        </svg>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                                            Точнее
                                        </span>
                                        <h3 className="text-sm font-bold text-foreground">Индивидуальный режим</h3>
                                    </div>
                                </div>
                                <p className="text-sm leading-relaxed text-muted">
                                    Я задам несколько вопросов о вашем опыте и мотивации, вы заполните
                                    короткую анкету — и на её основе подготовлю персональный результат,
                                    который точнее отражает именно вас.
                                </p>
                            </div>
                        </article>

                    </div>
                </section>

                {/* Разделитель */}
                <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                {/* ── Ссылка на статью ───────────────────────────────────── */}
                <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-accent/[0.05] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(245,184,0,0.08)]">
                    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
                    <div aria-hidden="true" className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-accent/[0.07] blur-3xl" />
                    <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-4">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/[0.10] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                </svg>
                            </span>
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-semibold text-foreground">
                                    Хотите узнать, как работает Вера?
                                </p>
                                <p className="text-sm leading-relaxed text-muted">
                                    Пошаговое руководство со скриншотами — от регистрации до получения готового письма.
                                </p>
                            </div>
                        </div>
                        <Link
                            href="/blog/ii-assistent-vera"
                            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-accent/50 bg-accent/[0.08] px-5 py-2.5 text-sm font-semibold text-accent transition-all hover:border-accent hover:bg-accent/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Читать руководство
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </Link>
                    </div>
                </div>

            </div>
        </Container>
    );
}
