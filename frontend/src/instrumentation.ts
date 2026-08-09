export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const { assertVeraSessionSigningKey } = await import(
        "./lib/utils/vera-session-token"
    );
    assertVeraSessionSigningKey();
}
