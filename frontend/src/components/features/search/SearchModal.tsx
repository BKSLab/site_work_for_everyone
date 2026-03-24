"use client";

import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { ServiceError } from "@/components/ui/ServiceError";
import { SourceBadge } from "@/components/ui/SourceBadge";

interface SearchModalProps {
    isPending: boolean;
    isError: boolean;
    isSuccess: boolean;
    isOpen: boolean;
    onClose: () => void;
}

export function SearchModal({
    isPending,
    isError,
    isSuccess,
    isOpen,
    onClose,
}: SearchModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onClose}
            title={isError ? "Ошибка поиска" : "Поиск вакансий"}
        >
            {(isPending || isSuccess) && (
                <div className="flex flex-col items-center gap-6 text-center">

                    {/* Спиннеры в стеклянном контейнере */}
                    <div className="relative flex justify-center gap-5 rounded-2xl border border-white/10 bg-white/[0.04] px-8 py-6 backdrop-blur-sm">
                        {/* Фоновое свечение */}
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_center,rgba(245,184,0,0.09),transparent_70%)]"
                        />
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Spinner key={i} />
                        ))}
                    </div>

                    {/* Источники */}
                    <div
                        aria-hidden="true"
                        className="flex items-center gap-4"
                    >
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 backdrop-blur-sm">
                            <SourceBadge source="hh.ru" />
                        </div>
                        <span className="text-xs text-muted/50">+</span>
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 backdrop-blur-sm">
                            <SourceBadge source="trudvsem.ru" />
                        </div>
                    </div>

                    <p className="max-w-xs text-sm leading-relaxed text-muted">
                        Собираем вакансии из нескольких источников одновременно.
                        Это может занять больше минуты — пожалуйста, подождите.
                    </p>
                </div>
            )}

            {isError && (
                <div className="flex flex-col gap-4">
                    <ServiceError />
                    <Button variant="primary" onClick={onClose} className="w-full">
                        Закрыть
                    </Button>
                </div>
            )}
        </Modal>
    );
}
