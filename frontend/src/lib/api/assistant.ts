import { api } from "./client";
import type { QuestionnaireResponse, AssistantTextResponse, QuestionAnswer } from "@/types/assistant";

export const assistantApi = {
    getCoverLetter: (vacancyId: string, userId: string) =>
        api.post<AssistantTextResponse>(`/assistant/cover-letter/${vacancyId}?user_id=${encodeURIComponent(userId)}`),

    getResumeTips: (vacancyId: string, userId: string) =>
        api.post<AssistantTextResponse>(`/assistant/resume-tips/${vacancyId}?user_id=${encodeURIComponent(userId)}`),

    getCoverLetterQuestionnaire: (vacancyId: string, userId: string) =>
        api.post<QuestionnaireResponse>(`/assistant/cover-letter/questionnaire/${vacancyId}?user_id=${encodeURIComponent(userId)}`),

    getResumeTipsQuestionnaire: (vacancyId: string, userId: string) =>
        api.post<QuestionnaireResponse>(`/assistant/resume-tips/questionnaire/${vacancyId}?user_id=${encodeURIComponent(userId)}`),

    getCoverLetterByQuestionnaire: (vacancyId: string, userId: string, answers: QuestionAnswer[]) =>
        api.post<AssistantTextResponse>(`/assistant/cover-letter/by-questionnaire/${vacancyId}?user_id=${encodeURIComponent(userId)}`, { answers }),

    getResumeTipsByQuestionnaire: (vacancyId: string, userId: string, answers: QuestionAnswer[]) =>
        api.post<AssistantTextResponse>(`/assistant/resume-tips/by-questionnaire/${vacancyId}?user_id=${encodeURIComponent(userId)}`, { answers }),
};
