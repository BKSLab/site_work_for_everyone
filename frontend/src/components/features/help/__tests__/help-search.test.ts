import { afterEach, describe, expect, it } from "vitest";
import { buildHelpSearchIndex, searchHelp, type HelpSearchEntry } from "../help-search";

const entries: HelpSearchEntry[] = [
    { id: "section-start", title: "Начало работы", paragraphs: ["Прочитайте инструкцию по регистрации и поиску вакансий."] },
    { id: "section-register", title: "Регистрация и вход", paragraphs: ["Откройте регистрацию, чтобы создать аккаунт."] },
    { id: "account-recovery", title: "Если забыли пароль", paragraphs: ["Для сброса пароля запросите новый код и введите новый пароль."] },
    { id: "favorites", title: "Избранное", paragraphs: ["Кнопка «Удалить из избранного» убирает вакансию из вашего списка."] },
    { id: "vera-resume", title: "Рекомендации по резюме", paragraphs: ["Вера учтёт ваши ответы при подготовке рекомендаций по резюме."] },
];

afterEach(() => { document.body.innerHTML = ""; });

describe("help search", () => {
    it.each(["регистрация", "зарегистрироваться", "создать аккаунт", "как создать учётную запись"])("recognizes account query: %s", (query) => {
        expect(searchHelp(entries, query)[0]?.id).toBe("section-register");
    });

    it.each(["забыл пароль", "сброс пароля", "ВОССТАНОВИТЬ ПАРОЛЬ"])("finds password recovery: %s", (query) => {
        expect(searchHelp(entries, query)[0]?.id).toBe("account-recovery");
    });

    it("matches instructions and inflections even when the heading has no search words", () => {
        const results = searchHelp(entries, "как удалить вакансию");
        expect(results.map((result) => result.id)).toEqual(["favorites"]);
        expect(results[0].excerpt).toContain("убирает вакансию");
        expect(results[0].highlights.map((hit) => results[0].excerpt.slice(hit.start, hit.end))).toContain("вакансию");
        expect(searchHelp(entries, "убрать вакансии")[0]?.id).toBe("favorites");
    });

    it("treats ё and е alike, supports CV and requires every meaningful query term", () => {
        expect(searchHelp(entries, "учтет ответы")[0]?.id).toBe("vera-resume");
        expect(searchHelp(entries, "CV")[0]?.id).toBe("vera-resume");
        expect(searchHelp(entries, "пароль вакансии")).toEqual([]);
        expect(searchHelp(entries, "несуществующий запрос")).toEqual([]);
        expect(searchHelp(entries, "как и где")).toEqual([]);
        expect(searchHelp(entries, " ")).toEqual([]);
    });

    it("takes an excerpt around a late match and preserves highlight positions", () => {
        const results = searchHelp([{ id: "favorites", title: "Избранное", paragraphs: ["Вводная информация. ".repeat(30) + "Сохранённую вакансию можно удалить из избранного."] }], "удалить");
        expect(results[0].excerpt.length).toBeLessThanOrEqual(192);
        expect(results[0].excerpt).toMatch(/^…/);
        const hit = results[0].highlights.find((range) => results[0].excerpt.slice(range.start, range.end) === "удалить");
        expect(hit).toBeDefined();
    });
});

it("indexes exact subsections from article prose without including navigation or results", () => {
    document.body.innerHTML = `
        <nav>Посторонняя ссылка</nav><section>Результаты поиска</section>
        <article aria-labelledby="help-heading">
            <h2 id="section-register">Регистрация и вход</h2><p>Создайте аккаунт.</p>
            <h3 id="account-recovery">Если забыли пароль</h3>
            <ol><li><p>Запросите код.</p></li></ol><p><a href="#contents">К оглавлению</a></p>
            <figure><button>Увеличить</button><figcaption>Форма восстановления.</figcaption></figure>
            <h2 id="favorites">Избранное</h2><p>Сохранённые вакансии.</p>
            <h3 id="vera-career">Карьерный консультант</h3><p>Выберите задачу.</p>
            <h4 id="vera-letter">Сопроводительное письмо</h4><p>Подготовьте письмо под вакансию.</p>
            <h4 id="vera-resume">Рекомендации по резюме</h4><p>Улучшите резюме под вакансию.</p>
        </article>`;
    const index = buildHelpSearchIndex(document);
    expect(index).toHaveLength(6);
    expect(index.find((entry) => entry.id === "section-register")?.paragraphs).toEqual(["Создайте аккаунт."]);
    expect(index.find((entry) => entry.id === "account-recovery")?.paragraphs).toEqual(["Запросите код.", "Форма восстановления."]);
    expect(index.find((entry) => entry.id === "vera-career")?.paragraphs).toEqual(["Выберите задачу."]);
    expect(searchHelp(index, "сопроводительное письмо")[0]?.id).toBe("vera-letter");
    expect(searchHelp(index, "резюме")[0]?.id).toBe("vera-resume");
    expect(JSON.stringify(index)).not.toMatch(/Посторонняя|Результаты поиска|К оглавлению|Увеличить/);
});
