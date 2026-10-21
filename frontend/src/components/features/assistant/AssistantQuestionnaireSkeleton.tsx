import styles from "./AssistantLoading.module.css";

function Bone({ className }: { className?: string }) {
    return <div className={`${styles.bone} animate-pulse motion-reduce:animate-none ${className ?? ""}`} />;
}

function QuestionSkeleton({ wide = false }: { wide?: boolean }) {
    return (
        <div className={styles.question}>
            <Bone className={styles.questionLabel} />
            <Bone className={`${styles.questionText} ${wide ? "w-2/3" : "w-1/2"}`} />
            <Bone className={styles.answer} />
        </div>
    );
}

export function AssistantQuestionnaireSkeleton() {
    return (
        <div className={styles.skeleton}>
            <p role="status" className={styles.status}>Формируем анкету…</p>
            <div aria-hidden="true" className={styles.preview}>
                {/* Заголовок */}
                <div className={styles.heading}>
                    <Bone className={styles.title} />
                    <Bone className={styles.subtitle} />
                </div>

                {/* Вопросы */}
                <div className={styles.questions}>
                    <QuestionSkeleton />
                    <QuestionSkeleton wide />
                    <QuestionSkeleton />
                    <QuestionSkeleton wide />
                </div>

                {/* Кнопка */}
                <Bone className={styles.button} />
            </div>
        </div>
    );
}
