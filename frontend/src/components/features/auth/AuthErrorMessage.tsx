import { getAuthErrorMessage } from "@/lib/constants/auth-errors";

interface AuthErrorMessageProps {
    error: string | null;
}

export function AuthErrorMessage({ error }: AuthErrorMessageProps) {
    if (!error) return null;

    const message = getAuthErrorMessage(error);

    return (
        <div
            role="alert"
            className="rounded border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400"
        >
            {message}
        </div>
    );
}
