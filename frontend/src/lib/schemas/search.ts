import { z } from "zod";

// Regex из текущего SearchForm.tsx — только русские буквы, пробелы и дефис
const LOCATION_REGEX = /^[а-яёА-ЯЁ\s-]+$/;

export const searchSchema = z.object({
    region_code: z
        .string()
        .min(1, "Выберите регион."),
    location: z
        .string()
        .min(1, "Введите название населённого пункта.")
        .regex(LOCATION_REGEX, "Название должно содержать только русские буквы."),
});

export type SearchFormData = z.infer<typeof searchSchema>;
