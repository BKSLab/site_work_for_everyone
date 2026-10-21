import styles from "./AssistantLoading.module.css";

function Bone({ className }: { className?: string }) {
    return <div className={`${styles.bone} animate-pulse motion-reduce:animate-none ${className ?? ""}`} />;
}

export function AssistantResultSkeleton() {
    return (
        <div className={styles.skeleton}>
            <p role="status" className={styles.status}>Генерируем результат…</p>
            <div aria-hidden="true" className={styles.preview}>
                {/* Заголовок + подзаголовок */}
                <div className={styles.heading}>
                    <Bone className={styles.title} />
                    <Bone className={styles.subtitle} />
                </div>

                {/* Блок результата */}
                <div className={styles.result}>
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
                <div className={styles.divider} />

                {/* Кнопки */}
                <div className={styles.actions}>
                    <Bone className={styles.button} />
                    <Bone className={styles.button} />
                    <Bone className={styles.button} />
                </div>
            </div>
        </div>
    );
}
