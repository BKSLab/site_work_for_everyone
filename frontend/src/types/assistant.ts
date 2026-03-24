export interface Question {
    id: number;
    text: string;
    required: boolean;
}

export interface QuestionnaireResponse {
    questions_count: number;
    questions: Question[];
}

export interface QuestionAnswer {
    id: number;
    text: string;
    answer: string;
}

export interface AssistantTextResponse {
    result: string;
}
