"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, btnClass } from "@/components/ui/Button";
import { SourceBadge, getSourceLabel } from "@/components/ui/SourceBadge";
import { useAuthStore } from "@/stores/auth";
import { favoritesApi } from "@/lib/api";
import { ApiRequestError } from "@/lib/api/client";
import type { VacancyDetail as VacancyDetailType } from "@/types/vacancy";

interface VacancyDetailProps {
    vacancy: VacancyDetailType;
    showAssistant?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
    actual: "Актуальная",
    archival: "В архиве",
    not_found: "Не найдена",
};

const InfoRow = ({
    label,
    value,
    accent = false,
}: {
    label: string;
    value?: string | null;
    accent?: boolean;
}) => {
    if (!value) return null;
    return (
        <>
            <dt className="text-sm text-muted">{label}</dt>
            <dd
                className={`text-sm font-semibold ${accent ? "text-accent" : "text-foreground"}`}
            >
                {value}
            </dd>
        </>
    );
};

export function VacancyDetail({ vacancy, showAssistant = false }: VacancyDetailProps) {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const [isFavoritePending, setIsFavoritePending] = useState(false);
    const [isFavorite, setIsFavorite] = useState(vacancy.is_favorite);
    const [favoriteError, setFavoriteError] = useState<string | null>(null);

    async function handleFavoriteClick() {
        if (!user) {
            router.push(`/auth/login?redirect=/vacancies/${vacancy.vacancy_id}`);
            return;
        }

        const previous = isFavorite;

        // Оптимистичное обновление — UI меняется сразу
        setIsFavorite(!isFavorite);
        setIsFavoritePending(true);
        setFavoriteError(null);

        try {
            if (previous) {
                await favoritesApi.remove({
                    user_id: user.email,
                    vacancy_id: vacancy.vacancy_id,
                });
            } else {
                await favoritesApi.add({
                    user_id: user.email,
                    vacancy_id: vacancy.vacancy_id,
                });
            }
        } catch (err) {
            setIsFavorite(previous);
            if (err instanceof ApiRequestError && err.status === 409) {
                setIsFavorite(true);
                setFavoriteError("Вакансия уже в избранном");
            } else {
                setFavoriteError("Не удалось обновить избранное");
            }
        } finally {
            setIsFavoritePending(false);
        }
    }

    return (
        <article
            aria-labelledby="vacancy-detail-title"
            className="flex flex-col gap-6 rounded-lg border border-white/20 bg-surface bg-[radial-gradient(circle_at_top_left,rgba(245,184,0,0.07),transparent_50%)] p-6"
        >
            {/* Заголовок */}
            <h1
                id="vacancy-detail-title"
                className="text-2xl font-bold text-foreground"
                tabIndex={-1}
            >
                {vacancy.vacancy_name}
            </h1>

            {/* Жёлтый разделитель */}
            <hr className="border-t-2 border-accent" />

            {/* Сводка */}
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
                <dt className="text-sm text-muted">Источник:</dt>
                <dd className="text-sm font-semibold text-foreground">
                    <SourceBadge source={vacancy.vacancy_source} />
                </dd>
                <InfoRow
                    label="Статус:"
                    value={STATUS_LABELS[vacancy.status] ?? vacancy.status}
                />
                <InfoRow
                    label="Заработная плата:"
                    value={vacancy.salary}
                    accent
                />
                <InfoRow label="Работодатель:" value={vacancy.employer_name} />
                <InfoRow label="Адрес:" value={vacancy.employer_location} />
                <InfoRow label="Телефон:" value={vacancy.employer_phone} />
                <InfoRow label="Email:" value={vacancy.employer_email} />
                <InfoRow
                    label="Контактное лицо:"
                    value={vacancy.contact_person}
                />
                <InfoRow label="Занятость:" value={vacancy.employment} />
                <InfoRow label="График работы:" value={vacancy.schedule} />
                <InfoRow label="Формат работы:" value={vacancy.work_format} />
                <InfoRow
                    label="Опыт работы:"
                    value={vacancy.experience_required}
                />
                <InfoRow
                    label="Социальная защита:"
                    value={vacancy.social_protected}
                />
            </dl>

            {/* Требования */}
            {vacancy.requirements && (
                <section aria-label="Требования к кандидату">
                    <h2 className="mb-2 text-base font-semibold text-foreground">
                        Требования
                    </h2>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                        {vacancy.requirements}
                    </p>
                </section>
            )}

            {/* Описание */}
            {vacancy.description && (
                <section aria-label="Описание вакансии">
                    <h2 className="mb-2 text-base font-semibold text-foreground">
                        Описание
                    </h2>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                        {vacancy.description}
                    </p>
                </section>
            )}

            {favoriteError && (
                <p role="alert" className="text-xs text-red-400">{favoriteError}</p>
            )}

            {/* Кнопки действий */}
            <div className="mt-auto flex flex-wrap gap-3 pt-2">
                <Button
                    onClick={handleFavoriteClick}
                    disabled={isFavoritePending}
                    aria-label={
                        isFavorite
                            ? `Удалить вакансию «${vacancy.vacancy_name}» из избранного`
                            : `Добавить вакансию «${vacancy.vacancy_name}» в избранное`
                    }
                >
                    {isFavorite ? "Удалить из избранного" : "В избранное"}
                </Button>

                {showAssistant && (
                    <Link
                        href={`/assistant?vacancy_id=${vacancy.vacancy_id}`}
                        className={btnClass()}
                        aria-label={`Открыть карьерного ассистента для вакансии: ${vacancy.vacancy_name}`}
                    >
                        Карьерный ассистент
                    </Link>
                )}

                {vacancy.vacancy_url && (
                    <a
                        href={vacancy.vacancy_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={btnClass()}
                    >
                        {`Открыть на ${getSourceLabel(vacancy.vacancy_source)}`}
                        <span className="sr-only">, откроется в новом окне</span>
                    </a>
                )}

                <Button
                    onClick={() => router.back()}
                    aria-label="Вернуться к списку вакансий"
                >
                    ← Назад к списку
                </Button>
            </div>
        </article>
    );
}
