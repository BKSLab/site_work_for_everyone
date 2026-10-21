import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth";
import type { AuthUser } from "@/types/auth";
import { useVeraDraft } from "../useVeraDraft";

function setOwner(email: string | null) {
    act(() =>
        useAuthStore.setState({
            user: email ? ({ email } as AuthUser) : null,
            isLoading: false,
        }),
    );
}

describe("Vera's next question draft", () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        useAuthStore.setState({ user: null, isLoading: false });
    });
    afterEach(() => vi.restoreAllMocks());

    it("restores unsent B on remount independently of submitted A", () => {
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify({ message: "Question A" }),
        );
        const first = renderHook(() => useVeraDraft("session-1", false));
        act(() => first.result.current.setInput("Question A"));
        act(() => first.result.current.setInput(""));
        act(() => first.result.current.setInput("Question B"));
        first.unmount();

        const restored = renderHook(() => useVeraDraft("session-1", false));
        expect(restored.result.current.input).toBe("Question B");
        expect(window.sessionStorage.getItem("vera_pending_request")).toContain(
            "Question A",
        );
    });

    it("waits for authentication and history initialization before restoring", () => {
        window.sessionStorage.setItem(
            "vera_composer_draft",
            JSON.stringify({
                scope: JSON.stringify(["a@example.test", "session-1"]),
                text: "Private question",
            }),
        );
        useAuthStore.setState({ isLoading: true });
        const { result, rerender } = renderHook(
            ({ loading }) => useVeraDraft("session-1", loading),
            {
                initialProps: { loading: true },
            },
        );
        expect(result.current.isDraftReady).toBe(false);
        expect(result.current.input).toBe("");
        setOwner("a@example.test");
        expect(result.current.input).toBe("");
        rerender({ loading: false });
        expect(result.current.input).toBe("Private question");
    });

    it.each(["b@example.test", null])(
        "clears an authenticated draft on owner change to %s",
        (nextOwner) => {
            setOwner("a@example.test");
            const { result } = renderHook(() =>
                useVeraDraft("session-1", false),
            );
            act(() => result.current.setInput("Private question"));
            setOwner(nextOwner);
            expect(result.current.input).toBe("");
            expect(result.current.isDraftReady).toBe(true);
            expect(
                window.sessionStorage.getItem("vera_composer_draft"),
            ).toBeNull();
        },
    );

    it("does not carry anonymous input into an authenticated scope", () => {
        const { result } = renderHook(() => useVeraDraft("session-1", false));
        act(() => result.current.setInput("Anonymous question"));
        setOwner("a@example.test");
        expect(result.current.input).toBe("");
        expect(window.sessionStorage.getItem("vera_composer_draft")).toBeNull();
    });

    it("does not restore another dialog's draft or accept its delayed rejection", () => {
        const { result, rerender } = renderHook(
            ({ session }) => useVeraDraft(session, false),
            {
                initialProps: { session: "session-1" },
            },
        );
        act(() => result.current.setInput("Old dialog"));
        const oldSetter = result.current.setInput;
        rerender({ session: "session-2" });
        expect(result.current.input).toBe("");
        act(() => result.current.setInput("New dialog"));
        act(() => oldSetter((current) => current || "Rejected old question"));
        expect(result.current.input).toBe("New dialog");
    });

    it("keeps new input when a sent question is definitely rejected", () => {
        const { result } = renderHook(() => useVeraDraft("session-1", false));
        act(() => result.current.setInput("Question B"));
        act(() =>
            result.current.setInput((current) => current || "Question A"),
        );
        expect(result.current.input).toBe("Question B");
    });

    it("keeps the composer usable and reports denied storage", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("denied");
        });
        const { result } = renderHook(() => useVeraDraft("session-1", false));
        act(() => result.current.setInput("Question B"));
        expect(result.current.input).toBe("Question B");
        expect(result.current.draftStorageError).toBe(true);
        expect(result.current.isDraftReady).toBe(true);
    });

    it("ignores malformed stored data", () => {
        window.sessionStorage.setItem("vera_composer_draft", "{invalid");
        const { result } = renderHook(() => useVeraDraft("session-1", false));
        expect(result.current.input).toBe("");
        expect(result.current.isDraftReady).toBe(true);
    });
});
