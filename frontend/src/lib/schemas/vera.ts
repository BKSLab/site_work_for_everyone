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

export const veraChatSessionResolveSchema = z.object({
    session_id: z.string().min(1).max(100),
    replacement_session_id: z.string().min(1).max(100),
});

export type VeraChatSessionResolveFormData = z.infer<
    typeof veraChatSessionResolveSchema
>;

export const veraChatSessionCreateSchema = z.object({
    session_id: z.string().min(1).max(100),
});

export type VeraChatSessionCreateFormData = z.infer<
    typeof veraChatSessionCreateSchema
>;

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
    publish_state: z.literal("not_published").optional(),
}).passthrough();

export type VeraErrorResponse = z.infer<typeof veraErrorResponseSchema>;

export const veraChatSessionLifecycleResponseSchema = z.object({
    session_id: z.string().min(1).max(100),
    previous_session_id: z.string().min(1).max(100).nullable(),
    boundary: z.enum(["created", "retained", "expired"]),
    session_ttl_seconds: z.number().int().positive(),
}).passthrough();

export type VeraChatSessionLifecycleResponse = z.infer<
    typeof veraChatSessionLifecycleResponseSchema
>;

export const veraChatSessionResolveResponseSchema =
    veraChatSessionLifecycleResponseSchema;

export type VeraChatSessionResolveResponse = z.infer<
    typeof veraChatSessionResolveResponseSchema
>;

export const veraChatSessionCreateResponseSchema = z.object({
    session_id: z.string().min(1).max(100),
    session_ttl_seconds: z.number().int().positive(),
}).passthrough();

export type VeraChatSessionCreateResponse = z.infer<
    typeof veraChatSessionCreateResponseSchema
>;

export const veraChatSessionCloseResponseSchema = z.object({
    session_id: z.string().min(1).max(100),
    closed_at: veraDateTimeSchema,
}).passthrough();

export type VeraChatSessionCloseResponse = z.infer<
    typeof veraChatSessionCloseResponseSchema
>;

export const veraChatResponseSchema = veraChatSessionLifecycleResponseSchema.extend({
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
    // Ответ построен на данных базы знаний. Поле необязательное: ответ
    // сервиса без него не должен ломать разбор истории, а отсутствие
    // признака читается как «база знаний не использовалась». Не `.default()`
    // — он расходит input- и output-типы схемы, а обобщённый
    // `readVeraResponse` работает с одним типом.
    used_knowledge_base: z.boolean().optional(),
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
    z.object({
        type: z.literal("done"),
        used_knowledge_base: z.boolean().optional(),
    }),
    z.object({ type: z.literal("error"), detail: z.string().optional() }),
]);

export type VeraSseEvent = z.infer<typeof veraSseEventSchema>;
