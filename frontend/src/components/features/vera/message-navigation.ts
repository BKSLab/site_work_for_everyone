/** Session is part of the address because previous dialogs share the history. */
export function veraMessageStartId(sessionId: string, messageId: string) {
    return `vera-message-${encodeURIComponent(sessionId)}-${encodeURIComponent(messageId)}`;
}

export function veraHistoryStartId(sessionId: string) {
    return `vera-history-start-${encodeURIComponent(sessionId)}`;
}
