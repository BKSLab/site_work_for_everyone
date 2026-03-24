export class ApiRequestError extends Error {
    constructor(
        public status: number,
        public detail: string,
    ) {
        super(detail);
        this.name = "ApiRequestError";
    }
}

// Дедупликация: один refresh на все параллельные 401
let refreshPromise: Promise<boolean> | null = null;

async function attemptTokenRefresh(): Promise<boolean> {
    try {
        const response = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });
        return response.ok;
    } catch {
        return false;
    }
}

class ApiClient {
    private baseUrl = "/api/v1";

    private async fetchWithRetry(
        url: string,
        options: RequestInit
    ): Promise<Response> {
        const response = await fetch(url, options);

        if (response.status === 401) {
            if (!refreshPromise) {
                refreshPromise = attemptTokenRefresh().finally(() => {
                    refreshPromise = null;
                });
            }

            const refreshed = await refreshPromise;
            if (refreshed) {
                return fetch(url, options); // Повтор оригинального запроса
            }
        }

        return response;
    }

    async get<T>(path: string, params?: Record<string, string>): Promise<T> {
        const url = new URL(`${this.baseUrl}${path}`, window.location.origin);
        if (params) {
            Object.entries(params).forEach(([key, value]) =>
                url.searchParams.set(key, value)
            );
        }

        const response = await this.fetchWithRetry(url.toString(), {});
        if (!response.ok) {
            const error = await response.json();
            throw new ApiRequestError(
                response.status,
                error.detail ?? "Unknown error"
            );
        }
        return response.json();
    }

    async post<T>(path: string, body?: unknown): Promise<T> {
        const options: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
        };

        const response = await this.fetchWithRetry(
            `${this.baseUrl}${path}`,
            options
        );

        if (response.status === 204) {
            return undefined as T;
        }

        if (!response.ok) {
            const error = await response.json();
            throw new ApiRequestError(
                response.status,
                error.detail ?? "Unknown error"
            );
        }
        return response.json();
    }
}

export const api = new ApiClient();
