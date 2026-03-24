/**
 * Минимальный структурированный логгер для серверных компонентов.
 * Выводит JSON в stdout — совместим с Docker, Cloud Logging и т.д.
 *
 * ПРАВИЛА:
 * - Никогда не логировать секреты (API-ключи, токены, пароли)
 * - Никогда не логировать полное тело запроса (может содержать PII)
 * - Логировать: path, method, status, duration, requestId
 */

interface LogEntry {
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
    requestId?: string;
    path?: string;
    method?: string;
    status?: number;
    durationMs?: number;
    [key: string]: unknown;
}

function log(entry: LogEntry): void {
    // В production — JSON в stdout (для Docker / log aggregator)
    // В development — тоже JSON (единообразие)
    const output = JSON.stringify(entry);

    if (entry.level === "error") {
        console.error(output);
    } else if (entry.level === "warn") {
        console.warn(output);
    } else {
        // eslint-disable-next-line no-console
        console.log(output);
    }
}

export const logger = {
    info(message: string, meta?: Partial<LogEntry>) {
        log({ timestamp: new Date().toISOString(), level: "info", message, ...meta });
    },
    warn(message: string, meta?: Partial<LogEntry>) {
        log({ timestamp: new Date().toISOString(), level: "warn", message, ...meta });
    },
    error(message: string, meta?: Partial<LogEntry>) {
        log({ timestamp: new Date().toISOString(), level: "error", message, ...meta });
    },
};
