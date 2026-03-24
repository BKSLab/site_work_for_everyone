/**
 * Санитизация path для API прокси.
 * Удаляет '..' сегменты и нормализует путь.
 * Предотвращает path traversal атаки.
 */
export function sanitizeProxyPath(segments: string[]): string {
    return segments
        .filter((s) => s !== ".." && s !== "." && s.length > 0)
        .join("/");
}
