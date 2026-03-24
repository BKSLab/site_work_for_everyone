import type { ZodError } from "zod";

/**
 * Извлекает ошибки полей из ZodError в плоский объект.
 * Берёт только первую ошибку для каждого поля.
 *
 * Пример:
 * zodFieldErrors(error) → { email: "Введите email.", password: "Минимум 8 символов." }
 */
export function zodFieldErrors(error: ZodError): Record<string, string> {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !fieldErrors[field]) {
            fieldErrors[field] = issue.message;
        }
    }
    return fieldErrors;
}
