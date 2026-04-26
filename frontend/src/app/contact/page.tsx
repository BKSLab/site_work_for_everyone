import type { Metadata } from "next";
import Image from "next/image";
import { FeedbackForm } from "@/components/features/feedback/FeedbackForm";
import { FocusHeading } from "@/components/ui/FocusHeading";

export const metadata: Metadata = {
    title: "Обратная связь",
    description: "Свяжитесь с автором проекта «Работа для всех» — Барабанщиковым Кириллом.",
    alternates: { canonical: "/contact" },
};

export default function ContactPage() {
    return (
        <div className="mx-auto max-w-2xl px-4 py-12">
            <div className="flex flex-col gap-10">

                {/* ── Автор ──────────────────────────────────────────────── */}
                <section
                    aria-labelledby="author-heading"
                    className="flex flex-col items-center gap-8 text-center sm:flex-row sm:items-center sm:gap-10 sm:text-left"
                >
                    <span
                        aria-hidden="true"
                        className="block shrink-0 w-[150px] h-[150px] rounded-full ring-2 ring-accent/35 shadow-[0_0_56px_rgba(245,184,0,0.2)] overflow-hidden"
                    >
                        <Image
                            src="/author-contact.png"
                            alt=""
                            width={150}
                            height={150}
                            className="w-full h-full object-cover"
                            priority
                        />
                    </span>
                    <div className="flex flex-col gap-3">
                        <FocusHeading
                            id="author-heading"
                            className="text-2xl font-bold text-foreground sm:text-3xl"
                        >
                            Привет! Рад видеть тебя здесь
                        </FocusHeading>
                        <p className="text-base leading-relaxed text-foreground/80">
                            Меня зовут{" "}
                            <strong className="text-accent">Кирилл Барабанщиков</strong>
                            {" "}— и я автор этого проекта. Мне очень приятно, что ты
                            воспользовался сайтом — для меня это уже много значит. Но то,
                            что ты решил написать мне напрямую — это по-настоящему важно
                            и ценно. Каждое сообщение я читаю лично. Спасибо, что не
                            остался в стороне!
                        </p>
                    </div>
                </section>

                {/* Разделитель */}
                <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                {/* ── Форма обратной связи ───────────────────────────────── */}
                <FeedbackForm />

                {/* Разделитель */}
                <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                {/* ── Контакты напрямую ──────────────────────────────────── */}
                <section aria-labelledby="socials-heading">
                    <h2
                        id="socials-heading"
                        className="mb-5 text-xs font-semibold uppercase tracking-widest text-accent/80"
                    >
                        Найдёте меня здесь
                    </h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                        {/* Телефон */}
                        <a
                            href="tel:+79124646606"
                            className="relative overflow-hidden flex items-center gap-4 rounded-2xl border border-accent/25 bg-white/[0.04] px-5 py-4 backdrop-blur-md transition-all hover:border-accent/50 hover:bg-accent/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-label="Позвонить Кириллу Барабанщикову"
                        >
                            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 5.46 5.46l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                            </span>
                            <div>
                                <p className="text-xs text-muted mb-0.5">Телефон</p>
                                <p className="text-sm font-semibold text-foreground">+7 (912) 464-66-06</p>
                            </div>
                        </a>

                        {/* ВКонтакте */}
                        <a
                            href="https://vk.com/id30907580"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative overflow-hidden flex items-center gap-4 rounded-2xl border border-accent/25 bg-white/[0.04] px-5 py-4 backdrop-blur-md transition-all hover:border-accent/50 hover:bg-accent/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-label="Барабанщиков Кирилл ВКонтакте (открывается в новой вкладке)"
                        >
                            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                            <span className="flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
                                <Image src="/vk-logo.png" alt="" width={72} height={12} className="h-4 w-auto" />
                            </span>
                            <div>
                                <p className="text-xs text-muted mb-0.5">ВКонтакте</p>
                                <p className="text-sm font-semibold text-foreground">Написать напрямую</p>
                            </div>
                        </a>

                        {/* Дзен */}
                        <a
                            href="https://dzen.ru/bks_daily"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative overflow-hidden flex items-center gap-4 rounded-2xl border border-accent/25 bg-white/[0.04] px-5 py-4 backdrop-blur-md transition-all hover:border-accent/50 hover:bg-accent/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-label="Блог на Дзене (открывается в новой вкладке)"
                        >
                            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                            <span className="flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
                                <Image src="/dzen-white.png" alt="" width={72} height={17} className="h-4 w-auto" />
                            </span>
                            <div>
                                <p className="text-xs text-muted mb-0.5">Дзен</p>
                                <p className="text-sm font-semibold text-foreground">Мой блог</p>
                            </div>
                        </a>

                        {/* GitHub */}
                        <a
                            href="https://github.com/BKSLab"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative overflow-hidden flex items-center gap-4 rounded-2xl border border-accent/25 bg-white/[0.04] px-5 py-4 backdrop-blur-md transition-all hover:border-accent/50 hover:bg-accent/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-label="Профиль на GitHub (открывается в новой вкладке)"
                        >
                            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                            <span className="flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
                                <Image src="/github-logo.png" alt="" width={72} height={16} className="h-4 w-auto invert" />
                            </span>
                            <div>
                                <p className="text-xs text-muted mb-0.5">GitHub</p>
                                <p className="text-sm font-semibold text-foreground">Мой профиль</p>
                            </div>
                        </a>

                    </div>
                </section>

            </div>
        </div>
    );
}
