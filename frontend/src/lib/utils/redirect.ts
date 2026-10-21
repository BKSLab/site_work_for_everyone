/**
 * Валидирует redirect URL — разрешает только безопасные относительные пути.
 * Предотвращает Open Redirect атаку.
 *
 * Безопасный URL:
 * - Начинается с "/" (относительный путь)
 * - НЕ начинается с "//" (protocol-relative URL → внешний сайт)
 * - НЕ содержит "://" (абсолютный URL → внешний сайт)
 * - НЕ содержит обратную косую черту или управляющие символы
 *
 * @param url - значение параметра redirect из URL
 * @returns безопасный URL или "/" если значение небезопасно
 */
export function getSafeRedirect(url: string | null): string {
    if (!url) return "/";
    if (!url.startsWith("/")) return "/";
    if (url.startsWith("//")) return "/";
    if (url.includes("://")) return "/";
    if (url.includes("\\")) return "/";
    // Browsers strip control characters before resolving navigation URLs.
    if (Array.from(url).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return "/";
    return url;
}
