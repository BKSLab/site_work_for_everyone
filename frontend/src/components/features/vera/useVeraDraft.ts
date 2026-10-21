"use client";

import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { useAuthStore } from "@/stores/auth";
import { VERA_MESSAGE_MAX_LENGTH } from "@/lib/schemas/vera";

/* eslint-disable react-hooks/set-state-in-effect -- Synchronize external tab storage only after authenticated ownership and the chat session are initialized. */

const STORAGE_KEY = "vera_composer_draft";

interface Draft {
    scope: string;
    text: string;
}

/** This is the next, unsent question, separate from vera_pending_request. */
export function useVeraDraft(sessionId: string, isHistoryLoading: boolean) {
    const isAuthLoading = useAuthStore((state) => state.isLoading);
    const owner = useAuthStore((state) => state.user?.email ?? null);
    const scope =
        !isAuthLoading && sessionId ? JSON.stringify([owner, sessionId]) : null;
    const [draft, setDraft] = useState<Draft | null>(null);
    const [storageError, setStorageError] = useState(false);

    useEffect(() => {
        if (!scope || isHistoryLoading) return;
        let text = "";
        try {
            const raw = window.sessionStorage.getItem(STORAGE_KEY);
            let stored: unknown = null;
            try {
                stored = raw ? JSON.parse(raw) : null;
            } catch {
                // A malformed draft is discarded just like a mismatched scope.
            }
            if (
                stored &&
                typeof stored === "object" &&
                "scope" in stored &&
                stored.scope === scope &&
                "text" in stored &&
                typeof stored.text === "string" &&
                stored.text.length <= VERA_MESSAGE_MAX_LENGTH
            ) {
                text = stored.text;
            } else if (raw) {
                window.sessionStorage.removeItem(STORAGE_KEY);
            }
        } catch {
            setStorageError(true);
        }
        setDraft((current) =>
            current?.scope === scope ? current : { scope, text },
        );
    }, [isHistoryLoading, scope]);

    // Do not display or carry an authenticated draft across logout/account
    // changes, including the render before session initialization finishes.
    useEffect(() => {
        if (isAuthLoading || !draft) return;
        const [draftOwner] = JSON.parse(draft.scope) as [string | null, string];
        if (draftOwner === owner) return;
        setDraft((current) => (current?.scope === scope ? current : null));
        try {
            window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {
            setStorageError(true);
        }
    }, [draft, isAuthLoading, owner, scope]);

    const setInput = useCallback(
        (value: SetStateAction<string>) => {
            if (!scope) return;
            setDraft((current) => {
                if (current?.scope !== scope) return current;
                const previous = current.text;
                return {
                    scope,
                    text: typeof value === "function" ? value(previous) : value,
                };
            });
        },
        [scope],
    );

    useEffect(() => {
        if (!draft || draft.scope !== scope) return;
        try {
            if (draft.text) {
                window.sessionStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(draft),
                );
            } else {
                window.sessionStorage.removeItem(STORAGE_KEY);
            }
        } catch {
            setStorageError(true);
        }
    }, [draft, scope]);

    return {
        input: draft?.scope === scope ? draft.text : "",
        setInput,
        isDraftReady: scope !== null && draft?.scope === scope,
        draftStorageError: storageError,
    };
}
