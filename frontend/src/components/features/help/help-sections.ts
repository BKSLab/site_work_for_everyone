export const HELP_SECTIONS = [
    { id: "section-start", label: "Начало работы с сайтом" },
    { id: "section-accessibility", label: "Доступность сайта" },
    {
        id: "section-register", label: "Регистрация и вход",
        children: [{ id: "account-recovery", label: "Восстановление пароля" }],
    },
    {
        id: "section-vacancies", label: "Поиск вакансий",
        children: [
            { id: "vacancy-filters", label: "Фильтры и страницы" },
            { id: "vacancy-card", label: "Карточка вакансии" },
            { id: "favorites", label: "Избранное" },
        ],
    },
    {
        id: "section-vera", label: "Ассистент Вера",
        children: [
            { id: "vera-career", label: "Карьерный консультант" },
            { id: "vera-letter", label: "Сопроводительное письмо" },
            { id: "vera-resume", label: "Рекомендации по резюме" },
            { id: "vera-rights", label: "Консультация по правам" },
        ],
    },
    { id: "section-blog", label: "Блог" },
    { id: "section-sources", label: "Откуда берутся вакансии" },
    { id: "section-troubleshooting", label: "Если что-то не получилось" },
    { id: "section-contact", label: "Обратная связь" },
];

export const HELP_TARGETS = HELP_SECTIONS.flatMap((section) => [
    { id: section.id, label: section.label },
    ...(section.children ?? []),
]);
