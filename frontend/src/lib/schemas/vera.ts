import { z } from "zod";

// Лимиты зеркалят бэкенд (VeraChatRequestSchema) и agent_service
// (MAX_MESSAGE_LENGTH в vera_agent_service/app/messaging/schemas.py).

export const VERA_MESSAGE_MAX_LENGTH = 4000;

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
        .max(
            VERA_MESSAGE_MAX_LENGTH,
            "Сообщение не должно превышать 4000 символов.",
        ),
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

const veraDateTimeSchema = z.string().datetime({ offset: true });

const veraValidationErrorItemSchema = z.object({
    loc: z.array(z.union([z.string(), z.number()])),
    msg: z.string(),
    type: z.string(),
}).passthrough();

export const veraErrorResponseSchema = z.object({
    detail: z.union([z.string(), z.array(veraValidationErrorItemSchema)]),
}).passthrough();

export type VeraErrorResponse = z.infer<typeof veraErrorResponseSchema>;

export const veraChatResponseSchema = z.object({
    request_id: z.string().min(1).max(100),
    stream_ticket: z.string().min(1),
    stream_url: z.string().regex(/^\/vera\/sse\/[^?#]+$/),
}).passthrough();

export type VeraChatResponse = z.infer<typeof veraChatResponseSchema>;

export const veraChatHistoryTurnSchema = z.object({
    request_id: z.string().min(1).max(100),
    sequence_number: z.number().int(),
    question: z.string(),
    answer: z.string().nullable(),
    status: z.string().min(1),
    feedback_value: z.enum(["up", "down"]).nullable(),
    created_at: veraDateTimeSchema,
    completed_at: veraDateTimeSchema.nullable(),
}).passthrough();

export type VeraChatHistoryTurn = z.infer<
    typeof veraChatHistoryTurnSchema
>;

export const veraChatHistoryResponseSchema = z.object({
    session_id: z.string().min(1).max(100),
    turns: z.array(veraChatHistoryTurnSchema),
    next_before_sequence: z.number().int().nullable(),
}).passthrough();

export type VeraChatHistoryResponse = z.infer<
    typeof veraChatHistoryResponseSchema
>;

export const veraCurrentChatSessionResponseSchema = z.object({
    session_id: z.string().min(1).max(100).nullable(),
}).passthrough();

export type VeraCurrentChatSessionResponse = z.infer<
    typeof veraCurrentChatSessionResponseSchema
>;

export const veraMessageFeedbackResponseSchema =
    veraMessageFeedbackSchema.extend({
        id: z.string().min(1),
        review_status: z.string().min(1),
        created_at: veraDateTimeSchema,
        updated_at: veraDateTimeSchema,
    }).passthrough();

export type VeraMessageFeedbackResponse = z.infer<
    typeof veraMessageFeedbackResponseSchema
>;

export const veraFeedbackResponseSchema = z.object({
    id: z.string().min(1),
    session_id: z.string().min(1).max(100),
    submission_id: z.string().min(1).max(100),
    review_status: z.string().min(1),
    created_at: veraDateTimeSchema,
}).passthrough();

export type VeraFeedbackResponse = z.infer<
    typeof veraFeedbackResponseSchema
>;

export const veraSseEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("token"), content: z.string() }),
    z.object({ type: z.literal("heartbeat"), ts: z.number().int() }),
    z.object({ type: z.literal("done") }),
    z.object({ type: z.literal("error"), detail: z.string().optional() }),
]);

export type VeraSseEvent = z.infer<typeof veraSseEventSchema>;
