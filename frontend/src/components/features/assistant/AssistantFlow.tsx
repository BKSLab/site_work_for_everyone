"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import { useSearchParams } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { useFavorites } from "@/hooks/useFavorites";
import { assistantApi } from "@/lib/api/assistant";
import { ApiRequestError } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { cn } from "@/lib/utils/cn";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Button } from "@/components/ui/Button";
import { ServiceError } from "@/components/ui/ServiceError";
import { AssistantResultSkeleton } from "./AssistantResultSkeleton";
import { AssistantQuestionnaireSkeleton } from "./AssistantQuestionnaireSkeleton";
import type { Vacancy } from "@/types/vacancy";
import type { Question, QuestionAnswer } from "@/types/assistant";
import styles from "./AssistantFlow.module.css";

type Feature = "cover_letter" | "resume_tips";
type Mode = "basic" | "individual";
type StepId = "vacancy" | "feature" | "mode" | "questionnaire" | "result";
const EMPTY_FAVORITES: Vacancy[] = [];

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
            "Ассистент Вера подготовит письмо, которое привлечёт внимание работодателя к вашей кандидатуре",
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
            "Ассистент Вера подскажет, как адаптировать резюме и на что сделать акцент для этой вакансии",
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
            "Ассистент Вера подготовит результат сразу, используя только данные вакансии. Никаких дополнительных вопросов.",
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
            "Ассистент Вера задаст несколько вопросов о вас и подготовит персонализированный результат под конкретную вакансию.",
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
        <nav aria-label="Шаги мастера" className={styles.stepper}>
            <div aria-hidden="true" className={styles.progressCaption}>
                <span>{LABEL[currentStep]}</span>
                <span>Шаг {currentIdx + 1} из {steps.length}</span>
            </div>
            <ol className={styles.steps} style={{ "--step-count": steps.length } as React.CSSProperties}>
                {steps.map((step, i) => {
                    const isCompleted = i < currentIdx;
                    const isCurrent   = i === currentIdx;
                    return (
                        <li key={step} className={styles.step}
                            aria-current={isCurrent ? "step" : undefined}
                            data-state={isCurrent ? "current" : isCompleted ? "completed" : "upcoming"}>
                            <span className="sr-only">
                                {`Шаг ${i + 1} из ${steps.length}: ${LABEL[step]}${isCompleted ? " (выполнен)" : isCurrent ? " (текущий)" : ""}`}
                            </span>
                            <span aria-hidden="true" className={styles.stepNumber}>
                                {isCompleted ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : i + 1}
                            </span>
                            <span aria-hidden="true" className={styles.stepLabel}>{LABEL[step]}</span>
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
        <div className={styles.selectedVacancy}>
            <SourceBadge source={vacancy.vacancy_source} />
            <div className="min-w-0 flex-1">
                <p className={styles.selectedTitle}>{vacancy.vacancy_name}</p>
                {vacancy.employer_name && (
                    <p className={styles.selectedEmployer}>{vacancy.employer_name}</p>
                )}
            </div>
        </div>
    );
}

// ─── Обёртка шага ────────────────────────────────────────────────────────────

function StepCard({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
    return (
        <div className={styles.card}>
            <div aria-hidden="true" className={styles.cardAccent} />
            <div className={styles.cardBody}>
                {children}
                {onBack && (
                    <Button onClick={onBack} className={cn(styles.action, styles.backAction)}>
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
    const [focusedIdx, setFocusedIdx] = useState(-1);
    const listboxId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const listboxRef = useRef<HTMLUListElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const selected = options.find((v) => v.vacancy_id === value);
    const activeIndex = isOpen && focusedIdx >= 0 && focusedIdx < options.length ? focusedIdx : -1;

    // Закрытие по клику вне
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setFocusedIdx(-1);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Переносим фокус на listbox при открытии
    useEffect(() => {
        if (isOpen) listboxRef.current?.focus();
    }, [isOpen]);

    useEffect(() => {
        const list = listboxRef.current;
        const option = list?.children[activeIndex] as HTMLElement | undefined;
        if (!list || !option) return;
        const bounds = list.getBoundingClientRect();
        const optionBounds = option.getBoundingClientRect();
        if (optionBounds.top < bounds.top) list.scrollTop -= bounds.top - optionBounds.top;
        else if (optionBounds.bottom > bounds.bottom) list.scrollTop += optionBounds.bottom - bounds.bottom;
    }, [activeIndex, options.length]);

    function openList() {
        const idx = options.findIndex((v) => v.vacancy_id === value);
        setFocusedIdx(idx >= 0 ? idx : options.length ? 0 : -1);
        setIsOpen(true);
    }

    function closeList() {
        setIsOpen(false);
        setFocusedIdx(-1);
        buttonRef.current?.focus();
    }

    function selectOption(idx: number) {
        if (!options[idx]) return;
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
                setFocusedIdx(Math.min(activeIndex + 1, options.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setFocusedIdx(options.length ? Math.max(activeIndex - 1, 0) : -1);
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                if (activeIndex >= 0) selectOption(activeIndex);
                break;
            case "Escape":
                e.preventDefault();
                closeList();
                break;
            // Native Tab moves outside this widget. Closing in onBlur keeps the
            // focused listbox present until the browser has chosen its target.
            case "Tab":
                break;
        }
    }

    const optionId = (idx: number) => `${listboxId}-option-${idx}`;

    return (
        <div ref={containerRef} className="relative" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsOpen(false);
                setFocusedIdx(-1);
            }
        }}>
            <button
                ref={buttonRef}
                type="button"
                tabIndex={isOpen ? -1 : 0}
                onClick={() => (isOpen ? closeList() : openList())}
                onKeyDown={handleButtonKeyDown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
                className={styles.selectTrigger}
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
                    id={listboxId}
                    role="listbox"
                    tabIndex={-1}
                    aria-label="Вакансии из избранного"
                    aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                    onKeyDown={handleListKeyDown}
                    className={styles.vacancyList}
                >
                    {options.map((v, idx) => (
                        <li
                            key={v.vacancy_id}
                            id={optionId(idx)}
                            role="option"
                            aria-selected={v.vacancy_id === value}
                            data-active={idx === activeIndex ? "true" : undefined}
                            onMouseMove={() => setFocusedIdx(idx)}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                selectOption(idx);
                            }}
                            className={styles.vacancyOption}
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
    const stepRef = useRef<HTMLDivElement>(null);
    const loadingRef = useRef(false);
    const focusNextStep = useRef(true);
    const previousStep = useRef<StepId>("vacancy");

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
    const [copyStatus, setCopyStatus] = useState("");

    function restart() {
        if (loadingRef.current) return;
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
        setCopyStatus("");
    }

    async function handleCopy() {
        if (loadingRef.current) return;
        const div = document.createElement("div");
        div.innerHTML = resultHtml;
        const plainText = (div.textContent || div.innerText || "").trim();

        setCopyStatus("");
        const succeeded = await copyToClipboard(plainText);
        setCopyStatus(succeeded ? "Скопировано." : "Не удалось скопировать. Выделите текст результата и скопируйте его вручную.");
    }

    async function handleModeSelect(selectedMode: Mode) {
        if (!selectedVacancy || !feature || loadingRef.current) return;

        loadingRef.current = true;
        // A retry from the result must keep its "Заполнить анкету" button mounted.
        if (step !== "result") setMode(selectedMode);
        setIsLoading(true);
        setError(null);
        setCopyStatus("");

        try {
            if (selectedMode === "basic") {
                const data =
                    feature === "cover_letter"
                        ? await assistantApi.getCoverLetter(selectedVacancy.vacancy_id, user!.email)
                        : await assistantApi.getResumeTips(selectedVacancy.vacancy_id, user!.email);
                setResultHtml(data.result);
                setMode(selectedMode);
                focusNextStep.current = stepRef.current?.contains(document.activeElement) === true;
                setStep("result");
            } else {
                const data =
                    feature === "cover_letter"
                        ? await assistantApi.getCoverLetterQuestionnaire(selectedVacancy.vacancy_id, user!.email)
                        : await assistantApi.getResumeTipsQuestionnaire(selectedVacancy.vacancy_id, user!.email);
                setQuestions(data.questions);
                setMode(selectedMode);
                setAnswers(data.questions.map((q) => ({ id: q.id, text: q.text, answer: "" })));
                focusNextStep.current = stepRef.current?.contains(document.activeElement) === true;
                setStep("questionnaire");
            }
        } catch (err) {
            const detail =
                err instanceof ApiRequestError
                    ? err.detail
                    : "Произошла ошибка. Попробуйте снова.";
            setError(detail);
        } finally {
            loadingRef.current = false;
            setIsLoading(false);
        }
    }

    async function handleSubmitAnswers() {
        if (!selectedVacancy || !feature || loadingRef.current) return;

        setSubmitted(true);
        const unanswered = questions.filter(
            (q) => q.required && !answers.find((a) => a.id === q.id)?.answer.trim()
        );
        if (unanswered.length > 0) {
            setError(`Заполните обязательные поля: ${unanswered.map((q) => `вопрос ${questions.indexOf(q) + 1}`).join(", ")}`);
            const initiator = document.activeElement;
            requestAnimationFrame(() => {
                if (document.activeElement === initiator) document.getElementById(`answer-${unanswered[0].id}`)?.focus();
            });
            return;
        }

        loadingRef.current = true;
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
            focusNextStep.current = stepRef.current?.contains(document.activeElement) === true;
            setStep("result");
        } catch (err) {
            const detail =
                err instanceof ApiRequestError
                    ? err.detail
                    : "Произошла ошибка. Попробуйте снова.";
            setError(detail);
        } finally {
            loadingRef.current = false;
            setIsLoading(false);
        }
    }

    useEffect(() => {
        if (previousStep.current === step) return;
        previousStep.current = step;
        if (focusNextStep.current) stepHeadingRef.current?.focus();
        focusNextStep.current = true;
    }, [step]);

    // Вычисляем favorites и регистрируем useEffect до любых ранних return'ов —
    // React требует одинакового порядка вызовов хуков на каждом рендере.
    const favorites = favQuery.data?.items ?? EMPTY_FAVORITES;

    // Если пришли из избранного с vacancy_id — предзаполняем вакансию (без пропуска шага)
    useEffect(() => {
        if (!vacancyIdParam || favQuery.isLoading || favorites.length === 0) return;
        if (selectedVacancy || step !== "vacancy") return;
        const found = favorites.find((v) => v.vacancy_id === vacancyIdParam);
        if (found) setSelectedVacancy(found);
    }, [vacancyIdParam, favQuery.isLoading, favorites, selectedVacancy, step]);

    if (isAuthLoading) {
        return <p role="status" aria-live="polite" className={cn(styles.flow, "text-sm text-muted")}>Загрузка…</p>;
    }

    if (!user) {
        return (
            <div className={cn(styles.flow, styles.card)}>
                <div aria-hidden="true" className={styles.cardAccent} />
                <div className={styles.authContent}>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/30 bg-accent/[0.08] shadow-[0_0_24px_rgba(245,184,0,0.15)]">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </div>
                    <div className="flex flex-col gap-2">
                        <p className="text-base font-semibold text-foreground">
                            Войдите, чтобы начать работу с Ассистентом Верой
                        </p>
                        <p className="max-w-sm text-sm leading-relaxed text-muted">
                            Ассистент работает с вашими избранными вакансиями. После входа вы сможете
                            получить сопроводительное письмо или рекомендации по резюме под конкретную вакансию.
                        </p>
                    </div>
                    <div className={styles.actions}>
                        <Link
                            href="/auth/login?redirect=/assistant/start"
                            className={styles.action}
                        >
                            Войти
                        </Link>
                        <Link
                            href="/auth/register"
                            className={cn(styles.action, styles.secondaryAction)}
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
            <div ref={stepRef} className={styles.flow}>
                <Stepper currentStep="vacancy" mode={mode} />
                <StepCard>
                    <div>
                        <h2 ref={stepHeadingRef} tabIndex={-1} className={styles.heading}>Выберите вакансию</h2>
                        <p className={styles.description}>Ассистент работает с вакансиями из вашего избранного</p>
                    </div>

                    {favQuery.isLoading && (
                        <div className="flex flex-col gap-3" role="status">
                            <p className="text-sm text-muted">Загружаем избранные вакансии…</p>
                            {[0, 1, 2].map((i) => (
                                <div key={i} aria-hidden="true" className="animate-pulse motion-reduce:animate-none flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <div className="h-5 w-10 rounded bg-white/10" />
                                    <div className="flex flex-1 flex-col gap-1.5">
                                        <div className="h-3.5 w-3/5 rounded bg-white/10" />
                                        <div className="h-3 w-2/5 rounded bg-white/10" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {favQuery.isError && !favQuery.isLoading && (
                        <ServiceError title="Не удалось загрузить избранные вакансии" onRetry={() => { void favQuery.refetch(); }} />
                    )}

                    {!favQuery.isLoading && !favQuery.isError && favorites.length === 0 && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <p className="text-sm text-muted">
                                В избранном пока нет вакансий. Найдите подходящие и добавьте их.
                            </p>
                            <Link
                                href="/"
                                className={styles.action}
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

                            {selectedVacancy && <SelectedVacancyBar vacancy={selectedVacancy} />}

                            <Button onClick={() => setStep("feature")} disabled={!selectedVacancy} className={cn(styles.action, styles.backAction)}>
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
            <div ref={stepRef} className={styles.flow}>
                <Stepper currentStep="feature" mode={mode} />
                {selectedVacancy && <SelectedVacancyBar vacancy={selectedVacancy} />}
                <StepCard onBack={() => setStep("vacancy")}>
                    <div>
                        <h2 ref={stepHeadingRef} tabIndex={-1} id="feature-group-label" className={styles.heading}>Что подготовить?</h2>
                        <p className={styles.description}>Выберите задачу для Ассистента Веры</p>
                    </div>
                    <div
                        role="group"
                        aria-labelledby="feature-group-label"
                        className={styles.choices}
                    >
                        {FEATURES.map((f) => {
                            const isSelected = feature === f.id;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => { setFeature(f.id); setStep("mode"); }}
                                    aria-labelledby={`feature-title-${f.id}`}
                                    aria-describedby={`feature-desc-${f.id}`}
                                    className={styles.choice}
                                    data-selected={isSelected ? "true" : undefined}
                                >
                                    <span aria-hidden="true" className={styles.choiceIcon}>{f.icon}</span>
                                    <div className="flex flex-col gap-1">
                                        <span id={`feature-title-${f.id}`} className={styles.choiceTitle}>{f.title}</span>
                                        <span id={`feature-desc-${f.id}`} className={styles.choiceDescription}>{f.description}</span>
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
            <div ref={stepRef} className={styles.flow}>
                <Stepper currentStep="mode" mode={mode} />
                {selectedVacancy && <SelectedVacancyBar vacancy={selectedVacancy} />}
                <StepCard onBack={isLoading ? undefined : () => { setError(null); setFeature(null); setStep("feature"); }}>
                    <div>
                        <h2 ref={stepHeadingRef} tabIndex={-1} className={styles.heading}>Выберите режим</h2>
                        <p className={styles.description}>Базовый — быстро, индивидуальный — точнее</p>
                    </div>

                    <div
                        className={styles.choices}
                    >
                        {MODES.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                aria-disabled={isLoading}
                                onClick={() => handleModeSelect(m.id)}
                                aria-labelledby={`mode-title-${m.id} mode-badge-${m.id}`}
                                aria-describedby={`mode-desc-${m.id}`}
                                className={styles.choice}
                            >
                                <div className={styles.modeHeading}>
                                    <span aria-hidden="true" className={styles.choiceIcon}>{m.icon}</span>
                                    <span id={`mode-badge-${m.id}`} className={styles.modeBadge}>
                                        {m.badge}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span id={`mode-title-${m.id}`} className={styles.choiceTitle}>{m.title}</span>
                                    <span id={`mode-desc-${m.id}`} className={styles.choiceDescription}>{m.description}</span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {isLoading && (
                        <div className="py-2">
                            {mode === "individual"
                                ? <AssistantQuestionnaireSkeleton />
                                : <AssistantResultSkeleton />
                            }
                        </div>
                    )}

                    {error && (
                        <ServiceError title={error} />
                    )}
                </StepCard>
            </div>
        );
    }

    // ── Шаг 4: Анкета ────────────────────────────────────────────────────────
    if (step === "questionnaire") {
        return (
            <div ref={stepRef} className={styles.flow}>
                <Stepper currentStep="questionnaire" mode={mode} />
                {selectedVacancy && <SelectedVacancyBar vacancy={selectedVacancy} />}
                <StepCard>
                    <div>
                        <h2 ref={stepHeadingRef} tabIndex={-1} className={styles.heading}>Персональная анкета</h2>
                        <p className={styles.description}>
                            Ответьте на вопросы — Ассистент Вера учтёт их при генерации
                        </p>
                    </div>

                    <div className={styles.questions}>
                        {questions.map((q, i) => (
                            <div key={q.id} className={styles.question}>
                                <div className={styles.questionHeader}>
                                    <label
                                        htmlFor={`answer-${q.id}`}
                                        id={`question-label-${q.id}`}
                                        className={styles.questionLabel}
                                    >
                                        Вопрос {i + 1}
                                    </label>
                                    <span aria-hidden="true" className={styles.questionRequirement}>
                                        {q.required ? "Обязательный" : "Необязательный"}
                                    </span>
                                </div>
                                <p id={`question-text-${q.id}`} className={styles.questionText}>{q.text}</p>
                                <textarea
                                    id={`answer-${q.id}`}
                                    aria-labelledby={`question-label-${q.id} question-text-${q.id}`}
                                    value={answers.find((a) => a.id === q.id)?.answer ?? ""}
                                    onChange={(e) => {
                                        setError(null);
                                        setAnswers((prev) =>
                                            prev.map((a) =>
                                                a.id === q.id ? { ...a, answer: e.target.value } : a,
                                            ),
                                        );
                                    }}
                                    rows={3}
                                    required={q.required}
                                    aria-required={q.required}
                                    aria-invalid={submitted && q.required && !answers.find((a) => a.id === q.id)?.answer.trim() ? true : undefined}
                                    aria-describedby={submitted && q.required && !answers.find((a) => a.id === q.id)?.answer.trim() ? `answer-error-${q.id}` : undefined}
                                    placeholder={q.required ? "Обязательное поле…" : "Ваш ответ…"}
                                    className={styles.answer}
                                />
                                {submitted && q.required && !answers.find((a) => a.id === q.id)?.answer.trim() && (
                                    <p id={`answer-error-${q.id}`} className={styles.fieldError}>Ответьте на этот вопрос.</p>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Свёрнутые детали вакансии */}
                    {selectedVacancy && (
                        <details className={styles.details}>
                            <summary className={styles.detailsSummary}>
                                <span className={styles.detailsTitle}>Вакансия: {selectedVacancy.vacancy_name}</span>
                                <svg
                                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    aria-hidden="true"
                                    className={styles.detailsArrow}
                                >
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </summary>
                            <div className={styles.detailsBody}>
                                <dl className={styles.vacancyDetails}>
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
                                            <dt className={styles.detailLabel}>{label}</dt>
                                            <dd className={styles.detailValue}>{value}</dd>
                                        </React.Fragment>
                                    ))}
                                </dl>
                                {selectedVacancy.requirements && (
                                    <div className="mt-4">
                                        <p className="mb-1 text-sm font-semibold text-foreground">Требования</p>
                                        <p className={styles.vacancyText}>{selectedVacancy.requirements}</p>
                                    </div>
                                )}
                                {selectedVacancy.description && (
                                    <div className="mt-4">
                                        <p className="mb-1 text-sm font-semibold text-foreground">Описание</p>
                                        <p className={styles.vacancyText}>{selectedVacancy.description}</p>
                                    </div>
                                )}
                            </div>
                        </details>
                    )}

                    {error && (
                        <p role="alert" className={styles.fieldError}>{error}</p>
                    )}

                    <div className={styles.actions}>
                        <Button className={styles.action} aria-disabled={isLoading} onClick={() => { if (loadingRef.current) return; setError(null); setStep("mode"); }}>
                            ← Назад
                        </Button>
                        <Button className={styles.action} aria-disabled={isLoading} onClick={handleSubmitAnswers}>
                            Получить результат →
                        </Button>
                    </div>
                    {isLoading && <AssistantResultSkeleton />}
                </StepCard>
            </div>
        );
    }

    // ── Шаг 5: Результат ─────────────────────────────────────────────────────
    if (step === "result") {
        const featureLabel =
            feature === "cover_letter" ? "Сопроводительное письмо" : "Рекомендации по резюме";

        return (
            <div ref={stepRef} className={styles.flow}>
                <Stepper currentStep="result" mode={mode} />
                {selectedVacancy && <SelectedVacancyBar vacancy={selectedVacancy} />}
                <StepCard>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 ref={stepHeadingRef} tabIndex={-1} className={styles.heading}>{featureLabel}</h2>
                            <p className={styles.description}>
                                {selectedVacancy?.vacancy_name}
                                {mode === "basic" ? " · Базовый режим" : " · Индивидуальный режим"}
                            </p>
                        </div>
                    </div>

                    {/* Результат — HTML от бэкенда (контент от нашего LLM, не пользователя) */}
                    <div
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resultHtml) }}
                        className={styles.resultBody}
                    />

                    {/* Свёрнутые детали вакансии */}
                    {selectedVacancy && (
                        <details className={styles.details}>
                            <summary className={styles.detailsSummary}>
                                <span className={styles.detailsTitle}>Вакансия: {selectedVacancy.vacancy_name}</span>
                                <svg
                                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    aria-hidden="true"
                                    className={styles.detailsArrow}
                                >
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </summary>
                            <div className={styles.detailsBody}>
                                <dl className={styles.vacancyDetails}>
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
                                            <dt className={styles.detailLabel}>{label}</dt>
                                            <dd className={styles.detailValue}>{value}</dd>
                                        </React.Fragment>
                                    ))}
                                </dl>
                                {selectedVacancy.requirements && (
                                    <div className="mt-4">
                                        <p className="mb-1 text-sm font-semibold text-foreground">Требования</p>
                                        <p className={styles.vacancyText}>{selectedVacancy.requirements}</p>
                                    </div>
                                )}
                                {selectedVacancy.description && (
                                    <div className="mt-4">
                                        <p className="mb-1 text-sm font-semibold text-foreground">Описание</p>
                                        <p className={styles.vacancyText}>{selectedVacancy.description}</p>
                                    </div>
                                )}
                            </div>
                        </details>
                    )}

                    <div
                        aria-hidden="true"
                        className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
                    />

                    {error && <p role="alert" className={styles.fieldError}>{error}</p>}
                    <p role="status" aria-atomic="true" className="text-sm text-muted">{copyStatus}</p>

                    <div className={styles.actions}>
                        <Button className={styles.action} aria-disabled={isLoading} onClick={() => { if (loadingRef.current) return; setStep(mode === "individual" ? "questionnaire" : "mode"); }}>
                            ← Назад
                        </Button>
                        <Button className={styles.action} aria-disabled={isLoading} onClick={handleCopy}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mr-1.5 inline">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Скопировать
                        </Button>
                        {mode === "basic" && (
                            <Button className={styles.action} aria-disabled={isLoading} onClick={() => handleModeSelect("individual")}>
                                Заполнить анкету →
                            </Button>
                        )}
                        <Button className={styles.action} aria-disabled={isLoading} onClick={() => { if (loadingRef.current) return; setStep("feature"); setCopyStatus(""); }}>
                            Другая задача
                        </Button>
                        <Button className={styles.action} aria-disabled={isLoading} onClick={restart}>
                            Начать заново
                        </Button>
                    </div>
                    {isLoading && <AssistantQuestionnaireSkeleton />}
                </StepCard>
            </div>
        );
    }

    return null;
}
