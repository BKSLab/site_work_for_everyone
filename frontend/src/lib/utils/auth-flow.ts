import { resendCodeSchema } from "@/lib/schemas/auth";
import { getSafeRedirect } from "./redirect";

type AuthPath = "/auth/login" | "/auth/register" | "/auth/forgot-password" | "/auth/reset-password" | "/auth/verify-email";

export function authFlowUrl(path: AuthPath, email: string, redirect: string): string {
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    const safeRedirect = getSafeRedirect(redirect);
    if (safeRedirect !== "/") params.set("redirect", safeRedirect);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
}

export function emailContextError(email: string): string {
    const result = resendCodeSchema.safeParse({ email });
    return result.success ? "" : result.error.issues[0].message;
}
