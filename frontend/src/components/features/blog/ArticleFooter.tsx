import Image from "next/image";
import Link from "next/link";
import { ShareButton } from "./ShareButton";
import styles from "./ArticleFooter.module.css";

interface ArticleFooterProps {
    title: string;
    excerpt: string;
}

export function ArticleFooter({ title, excerpt }: ArticleFooterProps) {
    return (
        <div className={styles.footer}>
            <section aria-labelledby="article-next-steps-heading" className={styles.nextSteps}>
                <header className={styles.intro}>
                    <p className={styles.eyebrow}>Работа для всех</p>
                    <h2 id="article-next-steps-heading" className={styles.title}>
                        Поможем сделать следующий шаг
                    </h2>
                    <p className={styles.description}>
                        Найдите подходящую работу или получите поддержку в трудовых вопросах.
                    </p>
                </header>

                <div className={styles.options}>
                    <div className={styles.option}>
                        <div className={styles.optionHeading}>
                            <Image src="/logo.png" alt="" width={48} height={48} className={styles.emblem} />
                            <h3 className={styles.optionTitle}>Поиск вакансий</h3>
                        </div>
                        <p className={styles.description}>
                            Вакансии с hh.ru и Работы России в едином доступном поиске.
                        </p>
                        <Link href="/" className={styles.cta}>
                            Найти вакансии
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </Link>
                    </div>

                    <div className={styles.option}>
                        <div className={styles.optionHeading}>
                            <Image src="/logo_ai_assistant.png" alt="" width={48} height={48} className={styles.emblem} />
                            <h3 className={styles.optionTitle}>Консультация с Верой</h3>
                        </div>
                        <p className={styles.description}>
                            Вера поможет разобраться в трудовых правах, льготах и трудоустройстве.
                        </p>
                        <Link href="/assistant/chat" className={styles.cta}>
                            Спросить Веру
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </Link>
                    </div>
                </div>
            </section>

            <div className={styles.sharePanel}>
                <p className={styles.description}>
                    Полезная статья? Поделитесь с теми, кому она пригодится.
                </p>
                <div className={styles.utilityActions}>
                    <ShareButton title={title} text={excerpt} className={styles.utilityButton} />
                    <Link href="/blog" className={styles.utilityButton}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M19 12H5M12 5l-7 7 7 7" />
                        </svg>
                        Все статьи
                    </Link>
                </div>
            </div>
        </div>
    );
}
