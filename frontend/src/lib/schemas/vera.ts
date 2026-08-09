import { z } from "zod";

// Лимиты зеркалят бэкенд (VeraChatRequestSchema) и agent_service
// (MAX_MESSAGE_LENGTH в vera_agent_service/app/messaging/schemas.py).

export const veraChatSchema = z.object({
    session_id: z
        .string()
        .min(1, "session_id обязателен.")
        .max(100, "session_id слишком длинный."),
    request_id: z
        .string()
        .min(1, "request_id обязателен.")
        .max(100, "request_id слишком длинный."),
    message: z
        .string()
        .min(1, "Введите сообщение.")
        .max(4000, "Сообщение не должно превышать 4000 символов."),
});

export type VeraChatFormData = z.infer<typeof veraChatSchema>;

export const veraMessageFeedbackSchema = z.object({
    session_id: z.string().min(1).max(100),
    request_id: z.string().min(1).max(100),
    value: z.enum(["up", "down"]),
});

export type VeraMessageFeedbackFormData = z.infer<
    typeof veraMessageFeedbackSchema
>;

export const veraFeedbackSchema = z.object({
    session_id: z
        .string()
        .min(1, "Идентификатор сессии обязателен.")
        .max(100, "Идентификатор сессии слишком длинный."),
    submission_id: z
        .string()
        .min(1, "Идентификатор отправки обязателен.")
        .max(100, "Идентификатор отправки слишком длинный."),
    audience: z.enum(["seeker", "employer", "other"]).optional(),
    usefulness: z.number().int().min(1).max(5).optional(),
    trust: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(4000, "Комментарий слишком длинный.").optional(),
    contact_email: z
        .string()
        .email("Введите корректный адрес электронной почты.")
        .optional(),
});

export type VeraFeedbackFormData = z.infer<typeof veraFeedbackSchema>;
