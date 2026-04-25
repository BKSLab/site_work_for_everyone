"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { FavoritesList } from "@/components/features/favorites/FavoritesList";
import { useAuthStore } from "@/stores/auth";
import { useFavorites } from "@/hooks/useFavorites";
import { ServiceError } from "@/components/ui/ServiceError";
import { FavoritesListSkeleton } from "@/components/features/favorites/FavoritesListSkeleton";

const PAGE_SIZE = 10;

export default function FavoritesPage() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const isLoading = useAuthStore((s) => s.isLoading);
    const [page, setPage] = useState(1);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const h1Ref = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        if (!isLoading && !user) {
            router.replace("/auth/login?redirect=/favorites");
        }
    }, [isLoading, user, router]);

    useEffect(() => {
        h1Ref.current?.focus();
    }, [page]);

    const userId = user?.email ?? "";
    const { query, removeMutation } = useFavorites(userId, page, PAGE_SIZE);

    useEffect(() => {
        if (!query.data) return;
        const savedId = sessionStorage.getItem('returnFocusVacancyId');
        if (!savedId) return;
        sessionStorage.removeItem('returnFocusVacancyId');
        requestAnimationFrame(() => {
            document.getElementById(`detail-link-${savedId}`)?.focus();
        });
    }, [query.data]);


    function handleRemove(vacancyId: string) {
        setRemovingId(vacancyId);
        removeMutation.mutate(vacancyId, {
            onSettled: () => {
                setRemovingId(null);
                h1Ref.current?.focus();
            },
        });
    }

    if (isLoading || !user) {
        return (
            <Container className="py-12">
                <div className="mb-8 h-9 w-64 animate-pulse rounded bg-white/10" aria-hidden="true" />
                <FavoritesListSkeleton />
            </Container>
        );
    }

    return (
        <Container className="py-12">
            <h1
                ref={h1Ref}
                tabIndex={-1}
                className="mb-8 text-3xl font-bold text-foreground focus:outline-none"
            >
                Избранные вакансии
            </h1>

            {query.isLoading && <FavoritesListSkeleton />}

            {query.isError && !query.isLoading && (
                <ServiceError />
            )}

            {query.data && (
                <FavoritesList
                    items={query.data.items}
                    total={query.data.total}
                    pageSize={PAGE_SIZE}
                    currentPage={page}
                    onPageChange={setPage}
                    onRemove={handleRemove}
                    removingId={removingId}
                />
            )}
        </Container>
    );
}
