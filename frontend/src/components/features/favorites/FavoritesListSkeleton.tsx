function Bone({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded bg-white/10 ${className ?? ""}`} />;
}

function FavoritesCardSkeleton() {
    return (
        <li>
            <div className="flex flex-col gap-4 rounded-lg border border-white/20 bg-surface p-6">
                {/* Title */}
                <Bone className="h-7 w-2/3" />

                {/* Divider */}
                <hr className="border-t-2 border-accent/30" />

                {/* Meta */}
                <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
                    <Bone className="h-4 w-16" />
                    <Bone className="h-4 w-20" />
                    <Bone className="h-4 w-24" />
                    <Bone className="h-4 w-36" />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                    <Bone className="h-4 w-full" />
                    <Bone className="h-4 w-full" />
                    <Bone className="h-4 w-3/4" />
                </div>

                {/* Buttons */}
                <div className="flex flex-wrap gap-3 pt-2">
                    <Bone className="h-9 w-28" />
                    <Bone className="h-9 w-44" />
                    <Bone className="h-9 w-40" />
                </div>
            </div>
        </li>
    );
}

export function FavoritesListSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div className="flex flex-col gap-6" aria-busy="true" aria-label="Загрузка избранных вакансий">
            <Bone className="h-5 w-40" />
            <ul role="list" className="flex flex-col gap-4">
                {Array.from({ length: count }).map((_, i) => (
                    <FavoritesCardSkeleton key={i} />
                ))}
            </ul>
        </div>
    );
}
