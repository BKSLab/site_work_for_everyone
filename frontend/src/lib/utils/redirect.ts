/**
 * Валидирует redirect URL — разрешает только безопасные относительные пути.
 * Предотвращает Open Redirect атаку.
 *
 * Безопасный URL:
 * - Начинается с "/" (относительный путь)
 * - НЕ начинается с "//" (protocol-relative URL → внешний сайт)
 * - НЕ содержит "://" (абсолютный URL → внешний сайт)
 *
 * @param url - значение параметра redirect из URL
 * @returns безопасный URL или "/" если значение небезопасно
 */
export function getSafeRedirect(url: string | null): string {
    if (!url) return "/";
    if (!url.startsWith("/")) return "/";
    if (url.startsWith("//")) return "/";
    if (url.includes("://")) return "/";
    return url;
}
