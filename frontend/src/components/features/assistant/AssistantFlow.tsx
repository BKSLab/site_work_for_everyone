"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { useFavorites } from "@/hooks/useFavorites";
import { assistantApi } from "@/lib/api/assistant";
import { ApiRequestError } from "@/lib/api/client";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ServiceError } from "@/components/ui/ServiceError";
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
            "ИИ подготовит письмо, которое привлечёт внимание работодателя к вашей кандидатуре",
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
            "ИИ подскажет как адаптировать резюме и на что сделать акцент для этой вакансии",
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
            "ИИ подготовит результат сразу, используя только данные вакансии. Никаких дополнительных вопросов.",
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
            "ИИ задаст несколько вопросов о вас и подготовит персонализированный результат под конкретную вакансию.",
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
                {steps.map((step, i) => {
                    const isCompleted = i < currentIdx;
                    const isCurrent = i === currentIdx;
                    return (
                        <li key={step} className="flex items-center">
                            <div className="flex flex-col items-center gap-1.5">
                                <span
                                    aria-current={isCurrent ? "step" : undefined}
                                    className={[
                                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all",
                                        isCompleted
                                            ? "bg-accent text-background"
                                            : isCurrent
                                              ? "border-2 border-accent text-accent shadow-[0_0_12px_rgba(245,184,0,0.25)]"
                                              : "border border-white/20 text-muted",
                                    ].join(" ")}
                                >
                                    {isCompleted ? (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    ) : (
                                        i + 1
                                    )}
                                </span>
                                <span
                                    className={[
                                        "hidden text-[10px] font-medium uppercase tracking-wider sm:block",
                                        isCurrent ? "text-accent" : isCompleted ? "text-foreground" : "text-muted",
                                    ].join(" ")}
                                >
                                    {LABEL[step]}
                                </span>
                            </div>
                            {i < steps.length - 1 && (
                                <div
                                    aria-hidden="true"
                                    className={[
                                        "mx-2 mb-5 h-px w-8 transition-colors sm:w-14",
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

// ─── Обёртка шага ────────────────────────────────────────────────────────────

function StepCard({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] bg-[radial-gradient(ellipse_at_top_left,rgba(245,184,0,0.06),transparent_60%)] backdrop-blur-sm">
            <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
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

// ─── Основной компонент ───────────────────────────────────────────────────────

export function AssistantFlow() {
    const user = useAuthStore((s) => s.user);
    const isAuthLoading = useAuthStore((s) => s.isLoading);
    const { query: favQuery } = useFavorites(user?.email ?? "", 1, 100);
    const searchParams = useSearchParams();
    const vacancyIdParam = searchParams.get("vacancy_id");

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
        // Извлекаем plain-текст из HTML для буфера обмена
        const div = document.createElement("div");
        div.innerHTML = resultHtml;
        const plainText = div.textContent || div.innerText || "";
        navigator.clipboard.writeText(plainText.trim()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
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
                            href="/auth/login?redirect=/assistant"
                            className="rounded-xl border border-accent/50 bg-accent/[0.08] px-5 py-2.5 text-sm font-semibold text-accent transition-all hover:border-accent hover:bg-accent/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Войти
                        </Link>
                        <Link
                            href="/auth/register"
                            className="rounded-xl border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:border-white/25 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Зарегистрироваться
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const favorites = favQuery.data?.items ?? [];

    // Если пришли из избранного с vacancy_id — предзаполняем вакансию (без пропуска шага)
    useEffect(() => {
        if (!vacancyIdParam || favQuery.isLoading || favorites.length === 0) return;
        if (selectedVacancy || step !== "vacancy") return;
        const found = favorites.find((v) => v.vacancy_id === vacancyIdParam);
        if (found) setSelectedVacancy(found);
    }, [vacancyIdParam, favQuery.isLoading, favorites, selectedVacancy, step]);

    // ── Шаг 1: Вакансия ──────────────────────────────────────────────────────
    if (step === "vacancy") {
        return (
            <div className="flex flex-col gap-8">
                <Stepper currentStep="vacancy" mode={mode} />
                <StepCard>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Выберите вакансию</h2>
                        <p className="mt-1 text-sm text-muted">Ассистент работает с вакансиями из вашего избранного</p>
                    </div>

                    {favQuery.isLoading && (
                        <p role="status" className="text-sm text-muted">Загружаем избранные вакансии…</p>
                    )}

                    {!favQuery.isLoading && favorites.length === 0 && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <p className="text-sm text-muted">
                                В избранном пока нет вакансий. Найдите подходящие и добавьте их.
                            </p>
                            <Link
                                href="/"
                                className="rounded border border-accent/50 bg-white/10 px-4 py-2 text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                Перейти к поиску
                            </Link>
                        </div>
                    )}

                    {favorites.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="relative">
                                <select
                                    aria-label="Вакансия из избранного"
                                    value={selectedVacancy?.vacancy_id ?? ""}
                                    onChange={(e) => {
                                        const found = favorites.find((v) => v.vacancy_id === e.target.value);
                                        setSelectedVacancy(found ?? null);
                                    }}
                                    className="w-full appearance-none rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 pr-10 text-sm text-foreground backdrop-blur-sm transition-colors focus-visible:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
                                >
                                    <option value="" className="bg-surface">— Выберите вакансию —</option>
                                    {favorites.map((v) => (
                                        <option key={v.vacancy_id} value={v.vacancy_id} className="bg-surface">
                                            {v.vacancy_name}{v.employer_name ? ` · ${v.employer_name}` : ""}
                                        </option>
                                    ))}
                                </select>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted">
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </div>

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
                <StepCard onBack={() => setStep("vacancy")}>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Что подготовить?</h2>
                        <p className="mt-1 text-sm text-muted">Выберите задачу для ИИ-ассистента</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {FEATURES.map((f) => {
                            const isSelected = feature === f.id;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => { setFeature(f.id); setStep("mode"); }}
                                    aria-pressed={isSelected}
                                    className={[
                                        "flex flex-col gap-3 rounded-xl border p-5 text-left transition-all duration-150",
                                        isSelected
                                            ? "border-accent/50 bg-accent/[0.08] shadow-[0_0_16px_rgba(245,184,0,0.1)]"
                                            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
                                    ].join(" ")}
                                >
                                    <span className={isSelected ? "text-accent" : "text-muted"}>{f.icon}</span>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-semibold text-foreground">{f.title}</span>
                                        <span className="text-xs leading-relaxed text-muted">{f.description}</span>
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
                <StepCard onBack={isLoading ? undefined : () => { setError(null); setStep("feature"); }}>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Выберите режим</h2>
                        <p className="mt-1 text-sm text-muted">Базовый — быстро, индивидуальный — точнее</p>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center gap-3 py-4" role="status" aria-live="polite">
                            <Spinner />
                            <p className="text-sm text-muted">
                                {mode === "individual" ? "Формируем анкету…" : "Генерируем результат…"}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {MODES.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => handleModeSelect(m.id)}
                                        className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left transition-all duration-150 hover:border-white/20 hover:bg-white/[0.06]"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted">{m.icon}</span>
                                            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted">
                                                {m.badge}
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm font-semibold text-foreground">{m.title}</span>
                                            <span className="text-xs leading-relaxed text-muted">{m.description}</span>
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
                <StepCard onBack={isLoading ? undefined : () => { setError(null); setStep("mode"); }}>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Персональная анкета</h2>
                        <p className="mt-1 text-sm text-muted">
                            Ответьте на вопросы — ассистент учтёт их при генерации
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

                    {error && (
                        <p role="alert" className="text-sm text-red-400">{error}</p>
                    )}

                    {isLoading ? (
                        <div className="flex items-center gap-3" role="status" aria-live="polite">
                            <Spinner />
                            <p className="text-sm text-muted">Генерируем результат…</p>
                        </div>
                    ) : (
                        <Button onClick={handleSubmitAnswers} className="self-start">
                            Получить результат →
                        </Button>
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
                <StepCard onBack={() => setStep(mode === "individual" ? "questionnaire" : "mode")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-foreground">{featureLabel}</h2>
                            <p className="mt-1 text-sm text-muted">
                                {selectedVacancy?.vacancy_name}
                                {mode === "basic" ? " · Базовый режим" : " · Индивидуальный режим"}
                            </p>
                        </div>
                    </div>

                    {/* Результат — HTML от бэкенда (контент от нашего LLM, не пользователя) */}
                    <div
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: resultHtml }}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm leading-relaxed text-foreground [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
                    />

                    <div
                        aria-hidden="true"
                        className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
                    />

                    <div className="flex flex-wrap gap-3">
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
                        <Button onClick={() => { setStep("feature"); setCopied(false); }}>
                            Другая задача
                        </Button>
                        <Button onClick={restart}>
                            Начать заново
                        </Button>
                    </div>
                </StepCard>
            </div>
        );
    }

    return null;
}
