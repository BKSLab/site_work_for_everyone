import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VacancyDetailSkeleton } from "../VacancyDetailSkeleton";
import { FavoritesListSkeleton } from "../../favorites/FavoritesListSkeleton";
import { AssistantQuestionnaireSkeleton } from "../../assistant/AssistantQuestionnaireSkeleton";
import { AssistantResultSkeleton } from "../../assistant/AssistantResultSkeleton";

describe("loading skeleton announcements", () => {
    it.each([
        [VacancyDetailSkeleton, "Загружаем вакансию…"],
        [FavoritesListSkeleton, "Загружаем избранное…"],
        [AssistantQuestionnaireSkeleton, "Формируем анкету…"],
        [AssistantResultSkeleton, "Генерируем результат…"],
    ] as const)("provides one visible status outside the decorative skeleton: %s", (Skeleton, message) => {
        render(<Skeleton />);
        expect(screen.getAllByRole("status")).toHaveLength(1);
        const status = screen.getByRole("status");
        expect(status).toBeVisible();
        expect(status).toHaveTextContent(message);
        expect(status.closest('[aria-busy="true"], [aria-hidden="true"]')).toBeNull();
        expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });
});
