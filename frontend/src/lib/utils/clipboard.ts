/** Copy using the available browser API without leaving focus on a temporary field. */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // The fallback also works when clipboard permissions are denied.
        }
    }

    // Capture the current focus after awaiting permissions, so a late rejection
    // does not return someone to a control they have already left.
    const previousFocus = document.activeElement;
    const field = document.createElement("textarea");
    field.value = text;
    field.tabIndex = -1;
    field.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.appendChild(field);
    try {
        field.focus({ preventScroll: true });
        field.select();
        return typeof document.execCommand === "function" && document.execCommand("copy");
    } catch {
        return false;
    } finally {
        const restoreFocus = document.activeElement === field;
        field.remove();
        if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected) {
            previousFocus.focus({ preventScroll: true });
        }
    }
}
