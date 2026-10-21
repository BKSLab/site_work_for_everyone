import type { Metadata } from "next";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { FeedbackForm } from "@/components/features/feedback/FeedbackForm";
import { FocusHeading } from "@/components/ui/FocusHeading";
import { SectionHeading } from "@/components/ui/SectionHeading";
import styles from "./ContactPage.module.css";

export const metadata: Metadata = {
    title: "Обратная связь",
    description: "Свяжитесь с автором проекта «Работа для всех» — Барабанщиковым Кириллом.",
    alternates: { canonical: "/contact" },
};

interface ContactChannel {
    href: string;
    name: string;
    detail: string;
    external?: boolean;
    logo?: { src: string; width: number; height: number; invert?: boolean };
}

const CONTACT_CHANNELS: ContactChannel[] = [
    {
        href: "tel:+79124646606",
        name: "Телефон",
        detail: "+7 (912) 464-66-06",
    },
    {
        href: "https://vk.com/id30907580",
        name: "ВКонтакте",
        detail: "Написать напрямую",
        external: true,
        logo: { src: "/vk-logo.png", width: 72, height: 12 },
    },
    {
        href: "https://dzen.ru/bks_daily",
        name: "Дзен",
        detail: "Мой блог",
        external: true,
        logo: { src: "/dzen-white.png", width: 72, height: 17 },
    },
    {
        href: "https://github.com/BKSLab",
        name: "GitHub",
        detail: "Мой профиль",
        external: true,
        logo: { src: "/github-logo.png", width: 72, height: 16, invert: true },
    },
];

export default function ContactPage() {
    return (
        <Container className="py-12">
            <div className={styles.page}>
                <section aria-labelledby="contact-heading" className={styles.hero}>
                    <div className={styles.intro}>
                        <FocusHeading id="contact-heading" className={styles.title}>
                            Обратная связь
                        </FocusHeading>
                        <p className={styles.greeting}>Привет! Рад видеть тебя здесь</p>
                        <p className={styles.description}>
                            Меня зовут{" "}
                            <strong className={styles.authorName}>Кирилл Барабанщиков</strong>
                            {" "}— и я автор этого проекта. Мне очень приятно, что ты
                            воспользовался сайтом — для меня это уже много значит. Но то,
                            что ты решил написать мне напрямую — это по-настоящему важно
                            и ценно. Каждое сообщение я читаю лично. Спасибо, что не
                            остался в стороне!
                        </p>
                    </div>
                    <div className={styles.authorVisual} aria-hidden="true">
                        <svg className={styles.orbits} viewBox="0 0 240 220" fill="none">
                            <ellipse cx="120" cy="110" rx="114" ry="70" transform="rotate(-24 120 110)" stroke="rgba(245,184,0,0.3)" />
                            <ellipse cx="120" cy="110" rx="98" ry="83" transform="rotate(24 120 110)" stroke="rgba(245,184,0,0.1)" />
                        </svg>
                        <span className={styles.portraitFrame}>
                            <Image src="/author-contact.png" alt="" width={176} height={176} className={styles.portrait} priority />
                        </span>
                    </div>
                </section>

                <div className={styles.body}>
                    <FeedbackForm />
                    <section aria-labelledby="socials-heading" className={styles.contacts}>
                        <SectionHeading
                            id="socials-heading"
                            icon={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
                                    <path d="M8 9h8M8 13h5" />
                                </svg>
                            }
                        >
                            Контакты
                        </SectionHeading>
                        <ul role="list" className={styles.channelList}>
                            {CONTACT_CHANNELS.map((channel) => (
                                <li key={channel.href}>
                                    <a
                                        href={channel.href}
                                        target={channel.external ? "_blank" : undefined}
                                        rel={channel.external ? "noopener noreferrer" : undefined}
                                        className={styles.channel}
                                    >
                                        <span className={styles.channelIcon} aria-hidden="true">
                                            {channel.logo ? (
                                                <Image
                                                    src={channel.logo.src}
                                                    alt=""
                                                    width={channel.logo.width}
                                                    height={channel.logo.height}
                                                    className={channel.logo.invert ? styles.githubLogo : undefined}
                                                />
                                            ) : (
                                                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 5.46 5.46l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                                                </svg>
                                            )}
                                        </span>
                                        <span className={styles.channelText}>
                                            <span className={styles.channelName}>{channel.name}</span>
                                            <span className={styles.channelDetail}>{channel.detail}</span>
                                            {channel.external && <span className="sr-only"> (открывается в новой вкладке)</span>}
                                        </span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>
        </Container>
    );
}
