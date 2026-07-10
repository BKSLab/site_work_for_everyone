import { z } from "zod";

// Лимиты зеркалят бэкенд (VeraChatRequestSchema) и agent_service
// (MAX_MESSAGE_LENGTH в vera_agent_service/app/messaging/schemas.py).

export const veraChatSchema = z.object({
    session_id: z
        .string()
        .min(1, "session_id обязателен.")
        .max(100, "session_id слишком длинный."),
    message: z
        .string()
        .min(1, "Введите сообщение.")
        .max(4000, "Сообщение не должно превышать 4000 символов."),
});

export type VeraChatFormData = z.infer<typeof veraChatSchema>;
