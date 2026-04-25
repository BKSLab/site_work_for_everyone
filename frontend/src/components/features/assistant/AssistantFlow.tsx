"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import DOMPurify from "isomorphic-dompurify";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { useFavorites } from "@/hooks/useFavorites";
import { assistantApi } from "@/lib/api/assistant";
import { ApiRequestError } from "@/lib/api/client";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Button } from "@/components/ui/Button";
import { ServiceError } from "@/components/ui/ServiceError";
import { AssistantResultSkeleton } from "./AssistantResultSkeleton";
import { AssistantQuestionnaireSkeleton } from "./AssistantQuestionnaireSkeleton";
import type { Vacancy } from "@/types/vacancy";
import type { Question, QuestionAnswer } from "@/types/assistant";

type Feature = "cover_letter" | "resume_tips";
type Mode = "basic" | "individual";
type StepId = "vacancy" | "feature" | "mode" | "questionnaire" | "result";

// ─── Описания функций ────────────────────────────────────────────────────────

const FEATURES: {
    id: Feature;
    title: string;
    description: string;
    icon: React.ReactNode;
}[] = [
    {
        id: "cover_letter",
        title: "Сопроводительное письмо",
        description:
            "Вера подготовит письмо, которое привлечёт внимание работодателя к вашей кандидатуре",
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 7l10 7 10-7" />
            </svg>
        ),
    },
    {
        id: "resume_tips",
        title: "Рекомендации по резюме",
        description:
            "Вера подскажет как адаптировать резюме и на что сделать акцент для этой вакансии",
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
        ),
    },
];

const MODES: {
    id: Mode;
    title: string;
    badge: string;
    description: string;
    icon: React.ReactNode;
}[] = [
    {
        id: "basic",
        title: "Базовый",
        badge: "Быстро",
        description:
            "Вера подготовит результат сразу, используя только данные вакансии. Никаких дополнительных вопросов.",
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
        ),
    },
    {
        id: "individual",
        title: "Индивидуальный",
        badge: "Точнее",
        description:
            "Вера задаст несколько вопросов о вас и подготовит персонализированный результат под конкретную вакансию.",
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        ),
    },
];

// ─── Стeppер ─────────────────────────────────────────────────────────────────

const LABEL: Record<StepId, string> = {
    vacancy: "Вакансия",
    feature: "Задача",
    mode: "Режим",
    questionnaire: "Анкета",
    result: "Результат",
};

function Stepper({ currentStep, mode }: { currentStep: StepId; mode: Mode | null }) {
    const steps: StepId[] =
        mode === "basic"
            ? ["vacancy", "feature", "mode", "result"]
            : ["vacancy", "feature", "mode", "questionnaire", "result"];

    const currentIdx = steps.indexOf(currentStep);

    return (
        <nav aria-label="Шаги мастера">
            <ol className="flex items-center justify-center">

                {/* Аватар Веры */}
                <li className="flex items-center" aria-hidden="true">
                    <div className="flex flex-col items-center gap-2">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full ring-2 ring-accent/40 shadow-[0_0_20px_rgba(245,184,0,0.25)]">
                            <Image
                                src="/logo_ai_assistant.png"
                                alt=""
                                width={56}
                                height={56}
                                className="rounded-full"
                            />
                        </span>
                        <span className="hidden text-xs font-semibold uppercase tracking-wider text-accent sm:block">
                            Вера
                        </span>
                    </div>
                    {/* Линия от аватара к первому шагу */}
                    <div className="mx-3 mb-6 h-px w-10 bg-accent/40 sm:w-16" />
                </li>

                {steps.map((step, i) => {
                    const isCompleted = i < currentIdx;
                    const isCurrent   = i === currentIdx;
                    return (
                        <li key={step} className="flex items-center">
                            <div className="flex flex-col items-center gap-2">
                                <span
                                    aria-current={isCurrent ? "step" : undefined}
                                    className={[
                                        "flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold transition-all",
                                        isCompleted
                                            ? "bg-accent text-background"
                                            : isCurrent
                                              ? "border-2 border-accent text-accent shadow-[0_0_16px_rgba(245,184,0,0.3)]"
                                              : "border border-white/20 text-muted",
                                    ].join(" ")}
                                >
                                    <span className="sr-only">
                                        {`Шаг ${i + 1} из ${steps.length}: ${LABEL[step]}${isCompleted ? " (выполнен)" : isCurrent ? " (текущий)" : ""}`}
                                    </span>
                                    {isCompleted ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    ) : <span aria-hidden="true">{i + 1}</span>}
                                </span>
                                <span className={[
                                    "hidden text-xs font-medium uppercase tracking-wider sm:block",
                                    isCurrent ? "text-accent" : isCompleted ? "text-foreground" : "text-muted",
                                ].join(" ")}>
                                    {LABEL[step]}
                                </span>
                            </div>
                            {i < steps.length - 1 && (
                                <div
                                    aria-hidden="true"
                                    className={[
                                        "mx-3 mb-6 h-px w-10 transition-colors sm:w-16",
                                        isCompleted ? "bg-accent/40" : "bg-white/15",
                                    ].join(" ")}
                                />
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

// ─── Карточка выбранной вакансии ─────────────────────────────────────────────

function SelectedVacancyBar({ vacancy }: { vacancy: Vacancy }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-sm">
            <SourceBadge source={vacancy.vacancy_source} />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{vacancy.vacancy_name}</p>
                {vacancy.employer_name && (
                    <p className="truncate text-xs text-muted">{vacancy.employer_name}</p>
                )}
            </div>
        </div>
    );
}

// ─── Обёртка шага ────────────────────────────────────────────────────────────

function StepCard({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] bg-[radial-gradient(ellipse_at_top_left,rgba(245,184,0,0.06),transparent_60%)] backdrop-blur-sm">
            <div aria-hidden="true" className="h-px rounded-t-2xl bg-gradient-to-r from-transparent via-accent to-transparent" />
            <div className="flex flex-col gap-6 p-6">
                {children}
                {onBack && (
                    <Button onClick={onBack} className="self-start">
                        ← Назад
                    </Button>
                )}
            </div>
        </div>
    );
}

// ─── Кастомный дропдаун для выбора вакансии ──────────────────────────────────

function VacancySelect({
    options,
    value,
    onChange,
}: {
    options: Vacancy[];
    value: string;
    onChange: (id: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [focusedIdx, setFocusedIdx] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const listboxRef = useRef<HTMLUListElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const selected = options.find((v) => v.vacancy_id === value);

    // Закрытие по клику вне
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Переносим фокус на listbox при открытии
    useEffect(() => {
        if (isOpen) listboxRef.current?.focus();
    }, [isOpen]);

    function openList() {
        const idx = options.findIndex((v) => v.vacancy_id === value);
        setFocusedIdx(idx >= 0 ? idx : 0);
        setIsOpen(true);
    }

    function closeList() {
        setIsOpen(false);
        buttonRef.current?.focus();
    }

    function selectOption(idx: number) {
        onChange(options[idx].vacancy_id);
        closeList();
    }

    function handleButtonKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!isOpen) openList();
        }
        if (e.key === "Escape") closeList();
    }

    function handleListKeyDown(e: React.KeyboardEvent) {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setFocusedIdx((i) => Math.min(i + 1, options.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setFocusedIdx((i) => Math.max(i - 1, 0));
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                selectOption(focusedIdx);
                break;
            case "Escape":
            case "Tab":
                e.preventDefault();
                closeList();
                break;
        }
    }

    const optionId = (idx: number) => `vac-opt-${idx}`;

    return (
        <div ref={containerRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => (isOpen ? closeList() : openList())}
                onKeyDown={handleButtonKeyDown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? "vacancy-listbox" : undefined}
                className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm backdrop-blur-sm transition-colors hover:border-white/25 focus-visible:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
            >
                <span className={selected ? "text-foreground" : "text-muted"}>
                    {selected
                        ? `${selected.vacancy_name}${selected.employer_name ? ` · ${selected.employer_name}` : ""}`
                        : "— Выберите вакансию —"}
                </span>
                <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"
                    className={`ml-2 shrink-0 text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>

            {isOpen && (
                <ul
                    ref={listboxRef}
                    id="vacancy-listbox"
                    role="listbox"
                    tabIndex={-1}
                    aria-label="Вакансии из избранного"
                    aria-activedescendant={optionId(focusedIdx)}
                    onKeyDown={handleListKeyDown}
                    className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-white/15 bg-surface shadow-xl focus:outline-none"
                >
                    {options.map((v, idx) => (
                        <li
                            key={v.vacancy_id}
                            id={optionId(idx)}
                            role="option"
                            aria-selected={v.vacancy_id === value}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                selectOption(idx);
                            }}
                            className={`cursor-pointer px-4 py-3 text-sm transition-colors ${
                                idx === focusedIdx ? "bg-surface-hover" : "hover:bg-surface-hover"
                            } ${v.vacancy_id === value ? "text-accent" : "text-foreground"}`}
                        >
                            {/* Один текстовый узел — скринридер читает как единую строку */}
                            {v.employer_name ? `${v.vacancy_name} · ${v.employer_name}` : v.vacancy_name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export function AssistantFlow() {
    const user = useAuthStore((s) => s.user);
    const isAuthLoading = useAuthStore((s) => s.isLoading);
    const { query: favQuery } = useFavorites(user?.email ?? "", 1, 100);
    const searchParams = useSearchParams();
    const vacancyIdParam = searchParams.get("vacancy_id");

    const stepHeadingRef = useRef<HTMLHeadingElement>(null);

    const [step, setStep] = useState<StepId>("vacancy");
    const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null);
    const [feature, setFeature] = useState<Feature | null>(null);
    const [mode, setMode] = useState<Mode | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const [resultHtml, setResultHtml] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    function restart() {
        setStep("vacancy");
        setSelectedVacancy(null);
        setFeature(null);
        setMode(null);
        setQuestions([]);
        setAnswers([]);
        setSubmitted(false);
        setResultHtml("");
        setIsLoading(false);
        setError(null);
        setCopied(false);
    }

    function handleCopy() {
        const div = document.createElement("div");
        div.innerHTML = resultHtml;
        const plainText = (div.textContent || div.innerText || "").trim();

        const markCopied = () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };

        // navigator.clipboard доступен только в HTTPS / localhost
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(plainText).then(markCopied).catch(() => {
                copyViaExecCommand(plainText, markCopied);
            });
        } else {
            copyViaExecCommand(plainText, markCopied);
        }
    }

    function copyViaExecCommand(text: string, onSuccess: () => void) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand("copy");
            onSuccess();
        } finally {
            document.body.removeChild(textarea);
        }
    }

    async function handleModeSelect(selectedMode: Mode) {
        if (!selectedVacancy || !feature) return;

        setMode(selectedMode);
        setIsLoading(true);
        setError(null);

        try {
            if (selectedMode === "basic") {
                const data =
                    feature === "cover_letter"
                        ? await assistantApi.getCoverLetter(selectedVacancy.vacancy_id, user!.email)
                        : await assistantApi.getResumeTips(selectedVacancy.vacancy_id, user!.email);
                setResultHtml(data.result);
                setStep("result");
            } else {
                const data =
                    feature === "cover_letter"
                        ? await assistantApi.getCoverLetterQuestionnaire(selectedVacancy.vacancy_id, user!.email)
                        : await assistantApi.getResumeTipsQuestionnaire(selectedVacancy.vacancy_id, user!.email);
                setQuestions(data.questions);
                setAnswers(data.questions.map((q) => ({ id: q.id, text: q.text, answer: "" })));
                setStep("questionnaire");
            }
        } catch (err) {
            const detail =
                err instanceof ApiRequestError
                    ? err.detail
                    : "Произошла ошибка. Попробуйте снова.";
            setError(detail);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleSubmitAnswers() {
        if (!selectedVacancy || !feature) return;

        setSubmitted(true);
        const unanswered = questions.filter(
            (q) => q.required && !answers.find((a) => a.id === q.id)?.answer.trim()
        );
        if (unanswered.length > 0) {
            setError(`Заполните обязательные поля: ${unanswered.map((q) => `вопрос ${questions.indexOf(q) + 1}`).join(", ")}`);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const data =
                feature === "cover_letter"
                    ? await assistantApi.getCoverLetterByQuestionnaire(
                          selectedVacancy.vacancy_id,
                          user!.email,
                          answers,
                      )
                    : await assistantApi.getResumeTipsByQuestionnaire(
                          selectedVacancy.vacancy_id,
                          user!.email,
                          answers,
                      );
            setResultHtml(data.result);
            setStep("result");
        } catch (err) {
            const detail =
                err instanceof ApiRequestError
                    ? err.detail
                    : "Произошла ошибка. Попробуйте снова.";
            setError(detail);
        } finally {
            setIsLoading(false);
        }
    }

    function handleFeatureKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        const btns = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
        );
        const idx = btns.findIndex((b) => b === document.activeElement);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            const next = (idx + 1) % btns.length;
            btns[next].focus();
            setFeature(FEATURES[next].id);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            const prev = (idx - 1 + btns.length) % btns.length;
            btns[prev].focus();
            setFeature(FEATURES[prev].id);
        }
    }

    function handleModeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        const btns = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
        );
        const idx = btns.findIndex((b) => b === document.activeElement);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            btns[(idx + 1) % btns.length].focus();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            btns[(idx - 1 + btns.length) % btns.length].focus();
        }
    }

    useEffect(() => {
        stepHeadingRef.current?.focus();
    }, [step]);

    // Вычисляем favorites и регистрируем useEffect до любых ранних return'ов —
    // React требует одинакового порядка вызовов хуков на каждом рендере.
    const favorites = favQuery.data?.items ?? [];

    // Если пришли из избранного с vacancy_id — предзаполняем вакансию (без пропуска шага)
    useEffect(() => {
        if (!vacancyIdParam || favQuery.isLoading || favorites.length === 0) return;
        if (selectedVacancy || step !== "vacancy") return;
        const found = favorites.find((v) => v.vacancy_id === vacancyIdParam);
        if (found) setSelectedVacancy(found);
    }, [vacancyIdParam, favQuery.isLoading, favorites, selectedVacancy, step]);

    if (isAuthLoading) {
        return <p role="status" aria-live="polite" className="text-sm text-muted">Загрузка…</p>;
    }

    if (!user) {
        return (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
                <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
                <div className="flex flex-col items-center gap-6 px-6 py-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/30 bg-accent/[0.08] shadow-[0_0_24px_rgba(245,184,0,0.15)]">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </div>
                    <div className="flex flex-col gap-2">
                        <p className="text-base font-semibold text-foreground">
                            Войдите, чтобы начать работу с Верой
                        </p>
                        <p className="max-w-sm text-sm leading-relaxed text-muted">
                            Ассистент работает с вашими избранными вакансиями. После входа вы сможете
                            получить сопроводительное письмо или рекомендации по резюме под конкретную вакансию.
                        </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3">
                        <Link
                            href="/auth/login?redirect=/assistant/start"
                            className="rounded-xl border border-accent/50 bg-accent/[0.08] px-5 py-2.5 text-sm font-semibold text-accent transition-all hover:border-accent hover:bg-accent/[0.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Войти
                        </Link>
                        <Link
                            href="/auth/register"
                            className="rounded-xl border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:border-white/25 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Зарегистрироваться
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // ── Шаг 1: Вакансия ──────────────────────────────────────────────────────
    if (step === "vacancy") {
        return (
            <div className="flex flex-col gap-8">
                <Stepper currentStep="vacancy" mode={mode} />
                <StepCard>
                    <div>
                        <h2 ref={stepHeadingRef} tabIndex={-1} className="text-lg font-bold text-foreground focus:outline-none">Выберите вакансию</h2>
                        <p className="mt-1 text-sm text-muted">Ассистент работает с вакансиями из вашего избранного</p>
                    </div>

                    {favQuery.isLoading && (
                        <div className="flex flex-col gap-3" role="status" aria-label="Загружаем избранные вакансии" aria-live="polite">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="animate-pulse flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <div className="h-5 w-10 rounded bg-white/10" />
                                    <div className="flex flex-1 flex-col gap-1.5">
                                        <div className="h-3.5 w-3/5 rounded bg-white/10" />
                                        <div className="h-3 w-2/5 rounded bg-white/10" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!favQuery.isLoading && favorites.length === 0 && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <p className="text-sm text-muted">
                                В избранном пока нет вакансий. Найдите подходящие и добавьте их.
                            </p>
                            <Link
                                href="/"
                                className="rounded border border-accent/50 bg-white/10 px-4 py-2 text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                Перейти к поиску
                            </Link>
                        </div>
                    )}

                    {favorites.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <VacancySelect
                                options={favorites}
                                value={selectedVacancy?.vacancy_id ?? ""}
                                onChange={(id) => {
                                    const found = favorites.find((v) => v.vacancy_id === id);
                                    setSelectedVacancy(found ?? null);
                                }}
                            />

                            {selectedVacancy && (
                                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <SourceBadge source={selectedVacancy.vacancy_source} />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{selectedVacancy.vacancy_name}</p>
                                        {selectedVacancy.employer_name && (
                                            <p className="truncate text-xs text-muted">{selectedVacancy.employer_name}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            <Button onClick={() => setStep("feature")} disabled={!selectedVacancy} className="self-start">
                                Продолжить →
                            </Button>
                        </div>
                    )}
                </StepCard>
            </div>
        );
    }

    // ── Шаг 2: Задача ────────────────────────────────────────────────────────
    if (step === "feature") {
        return (
            <div className="flex flex-col gap-8">
                <Stepper currentStep="feature" mode={mode} />
                {selectedVacancy && <SelectedVacancyBar vacancy={selectedVacancy} />}
                <StepCard onBack={() => setStep("vacancy")}>
                    <div>
                        <h2 ref={stepHeadingRef} tabIndex={-1} id="feature-group-label" className="text-lg font-bold text-foreground focus:outline-none">Что подготовить?</h2>
                        <p className="mt-1 text-sm text-muted">Выберите задачу для карьерного ассистента Веры</p>
                    </div>
                    <div
                        role="radiogroup"
                        aria-labelledby="feature-group-label"
                        className="grid gap-3 sm:grid-cols-2"
                        onKeyDown={handleFeatureKeyDown}
                    >
                        {FEATURES.map((f, idx) => {
                            const isSelected = feature === f.id;
                            const isTabTarget = feature ? isSelected : idx === 0;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    tabIndex={isTabTarget ? 0 : -1}
                                    onClick={() => { setFeature(f.id); setStep("mode"); }}
                                    aria-labelledby={`feature-title-${f.id}`}
                                    aria-describedby={`feature-desc-${f.id}`}
                                    className={[
                                        "flex flex-col gap-3 rounded-xl border p-5 text-left transition-colors duration-150",
                                        "focus-visible:border-accent focus-visible:bg-accent/[0.12] focus-visible:shadow-[0_0_0_3px_rgba(245,184,0,0.3)]",
                                        isSelected
                                            ? "border-accent/50 bg-accent/[0.08] shadow-[0_0_16px_rgba(245,184,0,0.1)]"
                                            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
                                    ].join(" ")}
                                >
                                    <span aria-hidden="true" className={isSelected ? "text-accent" : "text-muted"}>{f.icon}</span>
                                    <div className="flex flex-col gap-1">
                                        <span id={`feature-title-${f.id}`} className="text-sm font-semibold text-foreground">{f.title}</span>
                                        <span id={`feature-desc-${f.id}`} className="text-xs leading-relaxed text-muted">{f.description}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </StepCard>
            </div>
        );
    }

    // ── Шаг 3: Режим ─────────────────────────────────────────────────────────
    if (step === "mode") {
        return (
            <div className="flex flex-col gap-8">
                <Stepper currentStep="mode" mode={mode} />
                {selectedVacancy && <SelectedVacancyBar vacancy={selectedVacancy} />}
                <StepCard onBack={isLoading ? undefined : () => { setError(null); setFeature(null); setStep("feature"); }}>
                    <div>
                        <h2 ref={stepHeadingRef} tabIndex={-1} className="text-lg font-bold text-foreground focus:outline-none">Выберите режим</h2>
                        <p className="mt-1 text-sm text-muted">Базовый — быстро, индивидуальный — точнее</p>
                    </div>

                    {isLoading ? (
                        <div className="py-2">
                            {mode === "individual"
                                ? <AssistantQuestionnaireSkeleton />
                                : <AssistantResultSkeleton />
                            }
                        </div>
                    ) : (
                        <>
                            <div
                                role="radiogroup"
                                aria-label="Режим генерации"
                                className="grid gap-3 sm:grid-cols-2"
                                onKeyDown={handleModeKeyDown}
                            >
                                {MODES.map((m, idx) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={mode === m.id}
                                        tabIndex={mode ? (mode === m.id ? 0 : -1) : (idx === 0 ? 0 : -1)}
                                        onClick={() => handleModeSelect(m.id)}
                                        aria-labelledby={`mode-title-${m.id} mode-badge-${m.id}`}
                                        aria-describedby={`mode-desc-${m.id}`}
                                        className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.06] focus-visible:border-accent focus-visible:bg-accent/[0.12] focus-visible:shadow-[0_0_0_3px_rgba(245,184,0,0.3)]"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span aria-hidden="true" className="text-muted">{m.icon}</span>
                                            <span id={`mode-badge-${m.id}`} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted">
                                                {m.badge}
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span id={`mode-title-${m.id}`} className="text-sm font-semibold text-foreground">{m.title}</span>
                                            <span id={`mode-desc-${m.id}`} className="text-xs leading-relaxed text-muted">{m.description}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {error && (
                                <ServiceError />
                            )}
                        </>
                    )}
                </StepCard>
            </div>
        );
    }

    // ── Шаг 4: Анкета ────────────────────────────────────────────────────────
    if (step === "questionnaire") {
        return (
            <div className="flex flex-col gap-8">
                <Stepper currentStep="questionnaire" mode={mode} />
                {selectedVacancy && <SelectedVacancyBar vacancy={selectedVacancy} />}
                <StepCard>
                    <div>
                        <h2 ref={stepHeadingRef} tabIndex={-1} className="text-lg font-bold text-foreground focus:outline-none">Персональная анкета</h2>
                        <p className="mt-1 text-sm text-muted">
                            Ответьте на вопросы — Вера учтёт их при генерации
                        </p>
                    </div>

                    <div className="flex flex-col gap-4">
                        {questions.map((q, i) => (
                            <div key={q.id} className="flex flex-col gap-2">
                                <label
                                    htmlFor={`answer-${q.id}`}
                                    className="text-xs font-medium uppercase tracking-[0.12em] text-muted"
                                >
                                    Вопрос {i + 1}
                                    {q.required && (
                                        <span className="ml-1 text-accent" aria-label="обязателен">*</span>
                                    )}
                                </label>
                                <p className="text-sm text-foreground">{q.text}</p>
                                <textarea
                                    id={`answer-${q.id}`}
                                    value={answers.find((a) => a.id === q.id)?.answer ?? ""}
                                    onChange={(e) => {
                                        setAnswers((prev) =>
                                            prev.map((a) =>
                                                a.id === q.id ? { ...a, answer: e.target.value } : a,
                                            ),
                                        );
                                    }}
                                    rows={3}
                                    required={q.required}
                                    aria-required={q.required}
                                    placeholder={q.required ? "Обязательное поле…" : "Ваш ответ…"}
                                    className={[
                                        "resize-none rounded-xl border bg-white/[0.06] px-4 py-3 text-sm text-foreground placeholder:text-muted/50 backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2",
                                        submitted && q.required && !answers.find((a) => a.id === q.id)?.answer.trim()
                                            ? "border-red-500/60 focus-visible:border-red-400/60 focus-visible:ring-red-400/20"
                                            : "border-white/15 focus-visible:border-accent/50 focus-visible:ring-accent/20",
                                    ].join(" ")}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Свёрнутые детали вакансии */}
                    {selectedVacancy && (
                        <details className="group rounded-xl border border-white/10 bg-white/[0.03]">
                            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-foreground hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                                <span className="truncate">Вакансия: {selectedVacancy.vacancy_name}</span>
                                <svg
                                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    aria-hidden="true"
                                    className="ml-2 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
                                >
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </summary>
                            <div className="border-t border-white/10 px-5 py-4">
                                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
                                    {[
                                        { label: "Источник:", value: selectedVacancy.vacancy_source },
                                        { label: "Заработная плата:", value: selectedVacancy.salary },
                                        { label: "Работодатель:", value: selectedVacancy.employer_name },
                                        { label: "Адрес:", value: selectedVacancy.employer_location },
                                        { label: "Телефон:", value: selectedVacancy.employer_phone },
                                        { label: "Email:", value: selectedVacancy.employer_email },
                                        { label: "Контактное лицо:", value: selectedVacancy.contact_person },
                                        { label: "Занятость:", value: selectedVacancy.employment },
                                        { label: "График:", value: selectedVacancy.schedule },
                                        { label: "Формат работы:", value: selectedVacancy.work_format },
                                        { label: "Опыт работы:", value: selectedVacancy.experience_required },
                                        { label: "Социальная защита:", value: selectedVacancy.social_protected },
                                    ].filter(r => r.value).map(({ label, value }) => (
                                        <React.Fragment key={label}>
                                            <dt className="text-sm text-muted">{label}</dt>
                                            <dd className="text-sm font-semibold text-foreground">{value}</dd>
                                        </React.Fragment>
                                    ))}
                                </dl>
                                {selectedVacancy.requirements && (
                                    <div className="mt-4">
                                        <p className="mb-1 text-sm font-semibold text-foreground">Требования</p>
                                        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{selectedVacancy.requirements}</p>
                                    </div>
                                )}
                                {selectedVacancy.description && (
                                    <div className="mt-4">
                                        <p className="mb-1 text-sm font-semibold text-foreground">Описание</p>
                                        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{selectedVacancy.description}</p>
                                    </div>
                                )}
                            </div>
                        </details>
                    )}

                    {error && (
                        <p role="alert" className="text-sm text-red-400">{error}</p>
                    )}

                    {isLoading ? (
                        <AssistantResultSkeleton />
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            <Button onClick={() => { setError(null); setStep("mode"); }}>
                                ← Назад
                            </Button>
                            <Button onClick={handleSubmitAnswers}>
                                Получить результат →
                            </Button>
                        </div>
                    )}
                </StepCard>
            </div>
        );
    }

    // ── Шаг 5: Результат ─────────────────────────────────────────────────────
    if (step === "result") {
        const featureLabel =
            feature === "cover_letter" ? "Сопроводительное письмо" : "Рекомендации по резюме";

        return (
            <div className="flex flex-col gap-8">
                <Stepper currentStep="result" mode={mode} />
                {selectedVacancy && <SelectedVacancyBar vacancy={selectedVacancy} />}
                <StepCard>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 ref={stepHeadingRef} tabIndex={-1} className="text-lg font-bold text-foreground focus:outline-none">{featureLabel}</h2>
                            <p className="mt-1 text-sm text-muted">
                                {selectedVacancy?.vacancy_name}
                                {mode === "basic" ? " · Базовый режим" : " · Индивидуальный режим"}
                            </p>
                        </div>
                    </div>

                    {/* Результат — HTML от бэкенда (контент от нашего LLM, не пользователя) */}
                    {isLoading ? (
                        <AssistantQuestionnaireSkeleton />
                    ) : (
                    <div
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resultHtml) }}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm leading-relaxed text-foreground [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
                    />
                    )}

                    {/* Свёрнутые детали вакансии */}
                    {!isLoading && selectedVacancy && (
                        <details className="group rounded-xl border border-white/10 bg-white/[0.03]">
                            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-foreground hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                                <span className="truncate">Вакансия: {selectedVacancy.vacancy_name}</span>
                                <svg
                                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    aria-hidden="true"
                                    className="ml-2 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
                                >
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </summary>
                            <div className="border-t border-white/10 px-5 py-4">
                                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
                                    {[
                                        { label: "Источник:", value: selectedVacancy.vacancy_source },
                                        { label: "Заработная плата:", value: selectedVacancy.salary },
                                        { label: "Работодатель:", value: selectedVacancy.employer_name },
                                        { label: "Адрес:", value: selectedVacancy.employer_location },
                                        { label: "Телефон:", value: selectedVacancy.employer_phone },
                                        { label: "Email:", value: selectedVacancy.employer_email },
                                        { label: "Контактное лицо:", value: selectedVacancy.contact_person },
                                        { label: "Занятость:", value: selectedVacancy.employment },
                                        { label: "График:", value: selectedVacancy.schedule },
                                        { label: "Формат работы:", value: selectedVacancy.work_format },
                                        { label: "Опыт работы:", value: selectedVacancy.experience_required },
                                        { label: "Социальная защита:", value: selectedVacancy.social_protected },
                                    ].filter(r => r.value).map(({ label, value }) => (
                                        <React.Fragment key={label}>
                                            <dt className="text-sm text-muted">{label}</dt>
                                            <dd className="text-sm font-semibold text-foreground">{value}</dd>
                                        </React.Fragment>
                                    ))}
                                </dl>
                                {selectedVacancy.requirements && (
                                    <div className="mt-4">
                                        <p className="mb-1 text-sm font-semibold text-foreground">Требования</p>
                                        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{selectedVacancy.requirements}</p>
                                    </div>
                                )}
                                {selectedVacancy.description && (
                                    <div className="mt-4">
                                        <p className="mb-1 text-sm font-semibold text-foreground">Описание</p>
                                        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{selectedVacancy.description}</p>
                                    </div>
                                )}
                            </div>
                        </details>
                    )}

                    {!isLoading && <div
                        aria-hidden="true"
                        className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
                    />}

                    {!isLoading && <div className="flex flex-wrap gap-3 sm:flex-nowrap">
                        <Button onClick={() => setStep(mode === "individual" ? "questionnaire" : "mode")}>
                            ← Назад
                        </Button>
                        <Button onClick={handleCopy}>
                            {copied ? (
                                <>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mr-1.5 inline">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Скопировано
                                </>
                            ) : (
                                <>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mr-1.5 inline">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                    Скопировать
                                </>
                            )}
                        </Button>
                        {mode === "basic" && (
                            <Button onClick={() => handleModeSelect("individual")}>
                                Заполнить анкету →
                            </Button>
                        )}
                        <Button onClick={() => { setStep("feature"); setCopied(false); }}>
                            Другая задача
                        </Button>
                        <Button onClick={restart}>
                            Начать заново
                        </Button>
                    </div>}
                </StepCard>
            </div>
        );
    }

    return null;
}
