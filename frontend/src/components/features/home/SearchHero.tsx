import Image from "next/image";
import { FocusHeading } from "@/components/ui/FocusHeading";
import { SearchForm } from "@/components/features/search/SearchForm";
import styles from "./SearchHero.module.css";

export function SearchHero() {
    return (
        <section aria-labelledby="search-heading" className={styles.hero}>
            <div className={styles.intro}>
                <div className={styles.copy}>
                    <FocusHeading id="search-heading" className={styles.title}>
                        Поиск вакансий{" "}
                        <span className={styles.context}>для людей с инвалидностью</span>
                    </FocusHeading>
                    <p className={styles.description}>
                        Находите вакансии в едином доступном интерфейсе.
                    </p>
                    <ul role="list" aria-label="Источники вакансий" className={styles.sources}>
                        <li>
                            <Image src="/hh.ru.png" alt="" width={20} height={20} />
                            hh.ru
                        </li>
                        <li>
                            <Image src="/trudvsem.ru.png" alt="" width={20} height={20} />
                            Работа России
                        </li>
                    </ul>
                </div>

                <div className={styles.visual} aria-hidden="true">
                    <svg className={styles.orbits} viewBox="0 0 240 220" fill="none">
                        <ellipse cx="120" cy="110" rx="113" ry="65" transform="rotate(-24 120 110)" stroke="rgba(245,184,0,0.28)" />
                        <ellipse cx="120" cy="110" rx="97" ry="79" transform="rotate(28 120 110)" stroke="rgba(245,184,0,0.10)" />
                        <circle cx="35" cy="71" r="2" fill="rgba(245,184,0,0.65)" />
                        <circle cx="204" cy="149" r="1.5" fill="rgba(245,184,0,0.4)" />
                    </svg>
                    <span className={styles.emblem}>
                        <Image src="/logo.png" alt="" width={152} height={152} priority />
                    </span>
                </div>
            </div>

            <div className={styles.searchPanel}>
                <div className={styles.panelHeading}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
                        <circle cx="12" cy="10" r="2.5" />
                    </svg>
                    <p>Где ищем работу?</p>
                    <span aria-hidden="true" />
                </div>
                <SearchForm />
            </div>
        </section>
    );
}
