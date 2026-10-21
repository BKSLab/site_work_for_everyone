import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { Container } from "@/components/layout/Container";
import { AssistantFlow } from "@/components/features/assistant/AssistantFlow";
import { Spinner } from "@/components/ui/Spinner";
import styles from "./AssistantStart.module.css";

export const metadata: Metadata = {
    title: "Помощь с откликом на вакансию",
};

export default function AssistantStartPage() {
    return (
        <Container className={styles.page}>
            <header className={styles.intro}>
                <Image
                    src="/logo_ai_assistant.png"
                    alt=""
                    width={64}
                    height={64}
                    className={styles.avatar}
                />
                <div className={styles.copy}>
                    <p className={styles.eyebrow}>Ассистент Вера</p>
                    <h1 className={styles.title}>Помощь с откликом на вакансию</h1>
                    <p className={styles.description}>
                        Вера поможет составить сопроводительное письмо или улучшить резюме под выбранную вакансию.
                    </p>
                </div>
            </header>
            <Suspense fallback={
                <div className={styles.loadingPanel}>
                    <Spinner />
                    <p className={styles.loadingText}>Загрузка ассистента…</p>
                </div>
            }>
                <AssistantFlow />
            </Suspense>
        </Container>
    );
}
