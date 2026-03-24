import { z } from "zod";

// Ограничения зеркалят бэкенд (UserRegisterSchema):
// username: min_length=4, max_length=255
// password: min_length=8, max_length=255

export const loginSchema = z.object({
    email: z
        .string()
        .min(1, "Введите email.")
        .email("Введите корректный email адрес.")
        .max(255, "Email слишком длинный."),
    password: z
        .string()
        .min(1, "Введите пароль.")
        .min(8, "Пароль должен содержать минимум 8 символов.")
        .max(255, "Пароль не должен превышать 255 символов."),
});

export const registerSchema = z.object({
    first_name: z
        .string()
        .min(1, "Введите имя.")
        .max(100, "Имя не должно превышать 100 символов."),
    last_name: z
        .string()
        .min(1, "Введите фамилию.")
        .max(100, "Фамилия не должна превышать 100 символов."),
    email: z
        .string()
        .min(1, "Введите email.")
        .email("Введите корректный email адрес.")
        .max(255, "Email слишком длинный."),
    password: z
        .string()
        .min(1, "Введите пароль.")
        .min(8, "Пароль должен содержать минимум 8 символов.")
        .max(255, "Пароль не должен превышать 255 символов."),
});

export const verifyEmailSchema = z.object({
    email: z
        .string()
        .min(1, "Email обязателен.")
        .email("Некорректный email."),
    code: z
        .string()
        .min(1, "Введите код подтверждения."),
});

export const forgotPasswordSchema = z.object({
    email: z
        .string()
        .min(1, "Введите email.")
        .email("Введите корректный email адрес."),
});

export const resetPasswordSchema = z.object({
    email: z
        .string()
        .min(1, "Email обязателен.")
        .email("Некорректный email."),
    code: z
        .string()
        .min(1, "Введите код подтверждения."),
    new_password: z
        .string()
        .min(1, "Введите новый пароль.")
        .min(8, "Пароль должен содержать минимум 8 символов.")
        .max(255, "Пароль не должен превышать 255 символов."),
});

export const resendCodeSchema = z.object({
    email: z
        .string()
        .min(1, "Email обязателен.")
        .email("Некорректный email."),
});

export const feedbackSchema = z.object({
    message: z
        .string()
        .min(10, "Сообщение должно содержать минимум 10 символов.")
        .max(2000, "Сообщение не должно превышать 2000 символов."),
    reply_email: z
        .string()
        .email("Введите корректный email адрес.")
        .max(255, "Email слишком длинный.")
        .or(z.literal(""))
        .optional(),
    page: z.string().optional(),
});

export type FeedbackFormData = z.infer<typeof feedbackSchema>;

// Типы, выведенные из схем (могут заменить ручные типы в types/auth.ts)
export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type VerifyEmailFormData = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
