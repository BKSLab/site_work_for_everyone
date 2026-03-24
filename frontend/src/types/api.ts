/** Standard FastAPI error */
export interface ApiError {
    detail: string;
}

/** FastAPI validation error (422) */
export interface ValidationError {
    detail: Array<{
        loc: (string | number)[];
        msg: string;
        type: string;
    }>;
}

/** Successful action response */
export interface MessageResponse {
    message: string;
}
