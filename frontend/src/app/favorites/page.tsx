"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { FavoritesList } from "@/components/features/favorites/FavoritesList";
import { useAuthStore } from "@/stores/auth";
import { useFavorites } from "@/hooks/useFavorites";
import { ServiceError } from "@/components/ui/ServiceError";
import { FavoritesListSkeleton } from "@/components/features/favorites/FavoritesListSkeleton";

const PAGE_SIZE = 10;

function FavoritesContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const user = useAuthStore((s) => s.user);
    const isLoading = useAuthStore((s) => s.isLoading);
    const requestedPage = Number(searchParams.get("page") ?? "1");
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [removeError, setRemoveError] = useState("");
    const h1Ref = useRef<HTMLHeadingElement>(null);
    const initialFocusHandled = useRef(false);
    const pendingRemovalFocus = useRef<{ ids: string[]; edge: "first" | "last"; trigger: Element | null } | null>(null);

    useEffect(() => {
        if (!isLoading && !user) {
            const destination = `/favorites${searchParams.size ? `?${searchParams.toString()}` : ""}`;
            router.replace(`/auth/login?redirect=${encodeURIComponent(destination)}`);
        }
    }, [isLoading, user, router, searchParams]);

    useEffect(() => {
        if (initialFocusHandled.current || isLoading || !user) return;
        initialFocusHandled.current = true;
        if (sessionStorage.getItem(`favoriteReturnFocus:${user.email}`)) return;
        if (document.activeElement !== document.body && document.activeElement?.tagName !== "MAIN") return;
        h1Ref.current?.focus();
    }, [isLoading, user]);

    const userId = user?.email ?? "";
    const returnFocusKey = `favoriteReturnFocus:${userId}`;
    const { query, removeMutation } = useFavorites(userId, page, PAGE_SIZE);

    useEffect(() => {
        if (!query.data || query.isFetching || query.isError) return;
        const maxPage = Math.max(1, Math.ceil(query.data.total / PAGE_SIZE));
        if (page > maxPage) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("page", String(maxPage));
            const frame = requestAnimationFrame(() => router.replace(`/favorites?${params.toString()}`, { scroll: false }));
            return () => cancelAnimationFrame(frame);
        }
        const removalFocus = pendingRemovalFocus.current;
        if (removalFocus) {
            const frame = requestAnimationFrame(() => {
                const active = document.activeElement;
                if (active === document.body || active === removalFocus.trigger || active?.tagName === "MAIN") {
                    const nearby = removalFocus.ids.map((id) => document.getElementById(`detail-link-${id}`)).find(Boolean);
                    const items = query.data!.items;
                    const edgeItem = items[removalFocus.edge === "last" ? items.length - 1 : 0];
                    const target = nearby ?? (edgeItem && document.getElementById(`detail-link-${edgeItem.vacancy_id}`))
                        ?? document.getElementById("favorites-empty-heading") ?? h1Ref.current;
                    target?.focus();
                }
                pendingRemovalFocus.current = null;
            });
            return () => cancelAnimationFrame(frame);
        }
        const savedId = sessionStorage.getItem(returnFocusKey);
        if (!savedId) return;
        const frame = requestAnimationFrame(() => {
            const firstItem = query.data!.items[0];
            const target = document.getElementById(`detail-link-${savedId}`)
                ?? (firstItem && document.getElementById(`detail-link-${firstItem.vacancy_id}`))
                ?? document.getElementById("favorites-empty-heading") ?? h1Ref.current;
            const active = document.activeElement;
            if (!target || (active !== document.body && active !== h1Ref.current && active?.tagName !== "MAIN")) return;
            target.focus();
            if (document.activeElement === target) sessionStorage.removeItem(returnFocusKey);
        });
        return () => cancelAnimationFrame(frame);
    }, [query.data, query.isFetching, query.isError, page, removingId, returnFocusKey, router, searchParams]);


    function handleRemove(vacancyId: string) {
        if (removeMutation.isPending || removingId) return;
        const items = query.data?.items ?? [];
        const index = items.findIndex((item) => item.vacancy_id === vacancyId);
        const vacancy = items[index];
        const trigger = document.activeElement;
        const ids = [...items.slice(index + 1), ...items.slice(0, index).reverse()].map((item) => item.vacancy_id);
        setRemoveError("");
        setRemovingId(vacancyId);
        removeMutation.mutate(vacancyId, {
            onSuccess: () => {
                pendingRemovalFocus.current = { ids, edge: index === 0 && page === 1 ? "first" : "last", trigger };
                setRemovingId(null);
            },
            onError: () => {
                setRemovingId(null);
                setRemoveError(`Не удалось удалить «${vacancy?.vacancy_name ?? "вакансию"}» из избранного. Попробуйте ещё раз.`);
            },
        });
    }

    function handlePageChange(newPage: number) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", String(newPage));
        router.push(`/favorites?${params.toString()}`, { scroll: false });
        h1Ref.current?.focus();
    }

    return (
        <Container className="py-12">
            <h1
                ref={h1Ref}
                tabIndex={-1}
                className="mb-8 scroll-mt-28 text-3xl font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
                Избранные вакансии
            </h1>

            <p role="alert" className="mb-4 text-sm text-red-400">{removeError}</p>

            {(isLoading || !user || query.isLoading) && <FavoritesListSkeleton />}

            {query.isError && !query.isLoading && (
                <ServiceError onRetry={() => { void query.refetch(); }} />
            )}

            {user && query.data && (
                <FavoritesList
                    items={query.data.items}
                    total={query.data.total}
                    pageSize={PAGE_SIZE}
                    currentPage={page}
                    onPageChange={handlePageChange}
                    onRemove={handleRemove}
                    removingId={removingId}
                />
            )}
        </Container>
    );
}

export default function FavoritesPage() {
    return (
        <Suspense fallback={<Container className="py-12"><FavoritesListSkeleton /></Container>}>
            <FavoritesContent />
        </Suspense>
    );
}
