function Bone({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded bg-white/10 ${className ?? ""}`} />;
}

export function VacancyDetailSkeleton() {
    return (
        <div className="flex flex-col gap-6 rounded-lg border border-white/20 bg-surface p-6 md:p-8">
            {/* Title */}
            <Bone className="h-7 w-3/4" />

            {/* Divider */}
            <hr className="border-t-2 border-accent/30" />

            {/* Info rows */}
            <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-3">
                <Bone className="h-4 w-16" />
                <Bone className="h-4 w-24" />
                <Bone className="h-4 w-20" />
                <Bone className="h-4 w-32" />
                <Bone className="h-4 w-20" />
                <Bone className="h-4 w-40" />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
                <Bone className="h-4 w-full" />
                <Bone className="h-4 w-full" />
                <Bone className="h-4 w-4/5" />
                <Bone className="h-4 w-full" />
                <Bone className="h-4 w-2/3" />
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
                <Bone className="h-9 w-28" />
                <Bone className="h-9 w-36" />
                <Bone className="h-9 w-40" />
            </div>
        </div>
    );
}
