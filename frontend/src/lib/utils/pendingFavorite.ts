const KEY = "pending_favorite_vacancy_id";

export function setPendingFavorite(vacancyId: string): void {
    sessionStorage.setItem(KEY, vacancyId);
}

export function getPendingFavorite(): string | null {
    return sessionStorage.getItem(KEY);
}

export function clearPendingFavorite(): void {
    sessionStorage.removeItem(KEY);
}
