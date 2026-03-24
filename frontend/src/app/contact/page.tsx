import type { Metadata } from "next";
import Image from "next/image";
import { FeedbackForm } from "@/components/features/feedback/FeedbackForm";

export const metadata: Metadata = {
    title: "Обратная связь",
    description: "Свяжитесь с автором проекта «Работа для всех» — Барабанщиковым Кириллом.",
};

export default function ContactPage() {
    return (
        <main id="main-content" className="mx-auto max-w-2xl px-4 py-12">

            {/* Приветствие автора */}
            <section aria-labelledby="author-heading" className="mb-10">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div className="shrink-0 rounded-xl border border-border bg-surface/60 p-1 backdrop-blur-sm">
                        <Image
                            src="/author.jpg"
                            alt="Барабанщиков Кирилл — автор проекта"
                            width={88}
                            height={88}
                            className="rounded-lg object-cover"
                            priority
                        />
                    </div>
                    <div>
                        <h1
                            id="author-heading"
                            className="mb-2 text-xl font-bold text-foreground"
                        >
                            Привет! Рад видеть тебя здесь
                        </h1>
                        <p className="text-sm text-muted leading-relaxed">
                            Меня зовут <strong className="text-foreground">Кирилл Барабанщиков</strong>, и я автор этого проекта.
                            Мне очень приятно, что ты воспользовался сайтом — для меня это уже много значит.
                            Но то, что ты решил написать мне напрямую — это по-настоящему важно и ценно.
                            Каждое сообщение я читаю лично. Спасибо, что не остался в стороне!
                        </p>
                    </div>
                </div>
            </section>

            {/* Форма обратной связи */}
            <FeedbackForm />

            {/* Социальные сети */}
            <section aria-labelledby="socials-heading" className="mt-10 border-t border-border pt-8">
                <h2
                    id="socials-heading"
                    className="mb-4 text-base font-semibold text-foreground"
                >
                    Или напишите напрямую
                </h2>
                <a
                    href="https://vk.com/id30907580"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground hover:border-accent/50 hover:bg-surface/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent transition-colors"
                    aria-label="Барабанщиков Кирилл ВКонтакте (открывается в новой вкладке)"
                >
                    <Image
                        src="/VK Text Logo Black&white.png"
                        alt="ВКонтакте"
                        width={72}
                        height={24}
                        className="h-6 w-auto"
                    />
                </a>
            </section>
        </main>
    );
}
