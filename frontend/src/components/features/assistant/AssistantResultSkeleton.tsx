function Bone({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded bg-white/10 ${className ?? ""}`} />;
}

export function AssistantResultSkeleton() {
    return (
        <div className="flex flex-col gap-5" role="status" aria-label="Генерируем результат" aria-live="polite">
            {/* Заголовок + подзаголовок */}
            <div className="flex flex-col gap-2">
                <Bone className="h-6 w-2/5" />
                <Bone className="h-3.5 w-1/3" />
            </div>

            {/* Блок результата */}
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
                {/* Секция 1 */}
                <Bone className="h-4 w-1/2" />
                <div className="flex flex-col gap-2">
                    <Bone className="h-3.5 w-full" />
                    <Bone className="h-3.5 w-full" />
                    <Bone className="h-3.5 w-4/5" />
                    <Bone className="h-3.5 w-full" />
                    <Bone className="h-3.5 w-3/4" />
                </div>

                {/* Секция 2 */}
                <Bone className="mt-1 h-4 w-2/5" />
                <div className="flex flex-col gap-2">
                    <Bone className="h-3.5 w-full" />
                    <Bone className="h-3.5 w-full" />
                    <Bone className="h-3.5 w-5/6" />
                </div>

                {/* Список */}
                <Bone className="mt-1 h-4 w-1/3" />
                <div className="flex flex-col gap-2 pl-4">
                    <Bone className="h-3.5 w-4/5" />
                    <Bone className="h-3.5 w-3/4" />
                    <Bone className="h-3.5 w-5/6" />
                </div>
            </div>

            {/* Разделитель */}
            <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Кнопки */}
            <div className="flex flex-wrap gap-3">
                <Bone className="h-9 w-28" />
                <Bone className="h-9 w-32" />
                <Bone className="h-9 w-36" />
            </div>
        </div>
    );
}
