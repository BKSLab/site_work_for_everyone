import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { FocusHeading } from "@/components/ui/FocusHeading";

export const metadata: Metadata = {
    title: "Политика конфиденциальности",
    alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
    return (
        <Container className="py-12">
            <article className="mx-auto max-w-2xl" aria-labelledby="privacy-heading">
                <FocusHeading
                    id="privacy-heading"
                    className="mb-8 text-3xl font-bold text-foreground"
                >
                    Политика конфиденциальности
                </FocusHeading>

                <div className="flex flex-col gap-8 text-sm leading-relaxed text-muted">

                    <section aria-labelledby="section-general">
                        <h2 id="section-general" className="mb-3 text-base font-semibold text-foreground">
                            1. Общие положения
                        </h2>
                        <p>
                            Настоящая политика описывает, какие персональные данные собирает сервис
                            «Работа для всех» (далее — Сервис), как они используются и защищаются.
                            Используя Сервис, вы соглашаетесь с условиями настоящей политики.
                        </p>
                    </section>

                    <section aria-labelledby="section-data">
                        <h2 id="section-data" className="mb-3 text-base font-semibold text-foreground">
                            2. Какие данные мы собираем
                        </h2>
                        <p className="mb-2">При регистрации мы собираем:</p>
                        <ul className="flex flex-col gap-1 pl-4">
                            <li className="list-disc">имя и фамилию;</li>
                            <li className="list-disc">адрес электронной почты;</li>
                            <li className="list-disc">пароль в зашифрованном виде (хэш).</li>
                        </ul>
                        <p className="mt-3">
                            При использовании функции «Избранное» мы сохраняем идентификаторы
                            вакансий, которые вы добавили в список.
                        </p>
                    </section>

                    <section aria-labelledby="section-purpose">
                        <h2 id="section-purpose" className="mb-3 text-base font-semibold text-foreground">
                            3. Цели обработки данных
                        </h2>
                        <ul className="flex flex-col gap-1 pl-4">
                            <li className="list-disc">идентификация пользователя в Сервисе;</li>
                            <li className="list-disc">обеспечение работы функции «Избранное»;</li>
                            <li className="list-disc">направление кода подтверждения на email при регистрации и сбросе пароля.</li>
                        </ul>
                    </section>

                    <section aria-labelledby="section-llm">
                        <h2 id="section-llm" className="mb-3 text-base font-semibold text-foreground">
                            4. ИИ-ассистент и персональные данные
                        </h2>
                        <p className="mb-3">
                            При использовании ИИ-ассистента Веры ваши персональные данные
                            (имя, email) <strong className="text-foreground">не передаются</strong> в языковую модель.
                        </p>
                        <p className="mb-2">В зависимости от режима работы ассистент получает:</p>
                        <ul className="flex flex-col gap-1 pl-4">
                            <li className="list-disc">
                                <strong className="text-foreground">Быстрый режим</strong> — только публичные данные
                                выбранной вакансии: название, описание, работодателя, требования, формат работы.
                            </li>
                            <li className="list-disc">
                                <strong className="text-foreground">Персональный режим</strong> — данные вакансии
                                и ваши ответы на вопросы анкеты (опыт, навыки, пожелания).
                                Анкета не содержит имени, email или других идентифицирующих данных —
                                только профессиональная информация, которую вы вводите самостоятельно.
                            </li>
                        </ul>
                    </section>

                    <section aria-labelledby="section-third-party">
                        <h2 id="section-third-party" className="mb-3 text-base font-semibold text-foreground">
                            5. Передача данных третьим лицам
                        </h2>
                        <p>
                            Мы не продаём и не передаём ваши персональные данные третьим лицам
                            в коммерческих целях. Данные хранятся на защищённых серверах
                            и не используются для рекламы или профилирования.
                        </p>
                    </section>

                    <section aria-labelledby="section-storage">
                        <h2 id="section-storage" className="mb-3 text-base font-semibold text-foreground">
                            6. Хранение и защита данных
                        </h2>
                        <p>
                            Пароли хранятся исключительно в виде хэша — восстановить исходный пароль
                            технически невозможно. Авторизация осуществляется через защищённые
                            httpOnly cookies — токены недоступны для JavaScript на стороне браузера.
                        </p>
                    </section>

                    <section aria-labelledby="section-rights">
                        <h2 id="section-rights" className="mb-3 text-base font-semibold text-foreground">
                            7. Ваши права
                        </h2>
                        <p className="mb-2">Вы вправе:</p>
                        <ul className="flex flex-col gap-1 pl-4">
                            <li className="list-disc">запросить удаление своего аккаунта и всех связанных данных;</li>
                            <li className="list-disc">задать вопрос об обработке ваших данных.</li>
                        </ul>
                        <p className="mt-3">
                            Для этого воспользуйтесь формой на{" "}
                            <a
                                href="/contact"
                                className="text-accent hover:text-accent-hover underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                странице контактов
                            </a>
                            .
                        </p>
                    </section>

                    <section aria-labelledby="section-cookies">
                        <h2 id="section-cookies" className="mb-3 text-base font-semibold text-foreground">
                            8. Файлы cookie
                        </h2>
                        <p>
                            Сервис использует только технические cookie, необходимые для работы
                            авторизации. Аналитические или рекламные cookie не применяются.
                        </p>
                    </section>

                    <section aria-labelledby="section-contact">
                        <h2 id="section-contact" className="mb-3 text-base font-semibold text-foreground">
                            9. Контакты
                        </h2>
                        <p>
                            По вопросам обработки персональных данных обращайтесь через{" "}
                            <a
                                href="/contact"
                                className="text-accent hover:text-accent-hover underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                форму обратной связи
                            </a>
                            .
                        </p>
                    </section>

                    <p className="border-t border-white/10 pt-6 text-xs text-muted/70">
                        Последнее обновление: апрель 2026 г.
                    </p>
                </div>
            </article>
        </Container>
    );
}
