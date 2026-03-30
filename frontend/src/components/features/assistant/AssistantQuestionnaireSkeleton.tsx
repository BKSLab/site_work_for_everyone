function Bone({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded bg-white/10 ${className ?? ""}`} />;
}

function QuestionSkeleton({ wide = false }: { wide?: boolean }) {
    return (
        <div className="flex flex-col gap-2">
            <Bone className={`h-3.5 ${wide ? "w-2/3" : "w-1/2"}`} />
            <Bone className="h-10 w-full" />
        </div>
    );
}

export function AssistantQuestionnaireSkeleton() {
    return (
        <div className="flex flex-col gap-5" role="status" aria-label="Формируем анкету" aria-live="polite">
            {/* Заголовок */}
            <div className="flex flex-col gap-2">
                <Bone className="h-6 w-2/5" />
                <Bone className="h-3.5 w-3/5" />
            </div>

            {/* Вопросы */}
            <div className="flex flex-col gap-4">
                <QuestionSkeleton />
                <QuestionSkeleton wide />
                <QuestionSkeleton />
                <QuestionSkeleton wide />
            </div>

            {/* Кнопка */}
            <Bone className="h-9 w-36" />
        </div>
    );
}
