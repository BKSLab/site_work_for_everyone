import { HELP_TARGETS } from "./help-sections";

export interface HelpSearchEntry {
    id: string;
    title: string;
    paragraphs: string[];
}

export interface HelpSearchResult {
    id: string;
    title: string;
    excerpt: string;
    highlights: { start: number; end: number }[];
}

const STOP_WORDS = new Set("а бы в во вы где для его ее и из или к как мне на нужно о об от по под при про с со у что чтобы это я если".split(" ").map(normalizeWord));
const ACCOUNT_PHRASES = [
    "создать учетную запись", "создание учетной записи", "создать новый аккаунт",
    "создать аккаунт", "создание аккаунта", "новый аккаунт",
];

function normalizeWord(value: string): string {
    const word = value.toLowerCase().replaceAll("ё", "е");
    if (/^(регистрац|зарегистр)/u.test(word)) return "регистрац";
    if (/^(забыл|забыт|восстанов|сброс)/u.test(word)) return "восстанов";
    if (/^(удал|убрат|убер|убир)/u.test(word)) return "удал";
    if (/^(войти|вход|авториз|логин)/u.test(word)) return "вход";
    if (/^(почт|email|емейл)/u.test(word)) return "почт";
    if (/^(резюм|cv$)/u.test(word)) return "резюм";
    if (/^пис(ьм|ем)/u.test(word)) return "письм";
    // Common Russian endings are sufficient for the small, fixed guide vocabulary.
    const stem = word.replace(/(иями|ями|ами|ого|ему|ому|ыми|ими|иях|ах|ях|ия|ию|ии|ий|ый|ой|ая|яя|ое|ее|ые|ие|ую|юю|ов|ев|ам|ям|ом|ем|а|я|ы|и|у|ю|е|о|ь)$/u, "");
    return stem.length >= 3 ? stem : word;
}

function words(text: string) {
    return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
        value: normalizeWord(match[0]), start: match.index, end: match.index + match[0].length,
    }));
}

function queryTerms(query: string): string[] {
    let text = ` ${query.toLowerCase().replaceAll("ё", "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
    for (const phrase of ACCOUNT_PHRASES) text = text.replaceAll(` ${phrase} `, " регистрация ");
    return [...new Set(words(text).filter((word) => !STOP_WORDS.has(word.value)).map((word) => word.value))];
}

function matches(word: string, term: string): boolean {
    return word === term || (term.length >= 3 && word.startsWith(term));
}

/** Read only the guide's prose: search results, navigation and image controls stay out. */
export function buildHelpSearchIndex(root: ParentNode): HelpSearchEntry[] {
    const article = root.querySelector('article[aria-labelledby="help-heading"]');
    if (!article) return [];
    const targets = new Set(HELP_TARGETS.map(({ id }) => id));
    const entries: HelpSearchEntry[] = [];
    let current: HelpSearchEntry | undefined;
    for (const element of article.querySelectorAll<HTMLElement>("h2[id], h3[id], p, li, dt, dd, figcaption")) {
        const text = element.textContent?.replace(/\s+/gu, " ").trim();
        if (!text) continue;
        if (element.matches("h2, h3")) {
            current = targets.has(element.id) ? { id: element.id, title: text, paragraphs: [] } : undefined;
            if (current) entries.push(current);
        } else if (current && text !== "К оглавлению" && !element.parentElement?.closest("li, dd")) {
            current.paragraphs.push(text);
        }
    }
    return entries;
}

export function searchHelp(entries: HelpSearchEntry[], query: string): HelpSearchResult[] {
    if (query.trim().length < 2) return [];
    const terms = queryTerms(query);
    if (!terms.length) return [];
    const ranked: (HelpSearchResult & { score: number })[] = [];
    for (const entry of entries) {
        const titleWords = words(entry.title);
        const paragraphs = entry.paragraphs.map((text) => ({ text, words: words(text) }));
        const titleTerms = terms.filter((term) => titleWords.some((word) => matches(word.value, term)));
        if (!terms.every((term) => titleTerms.includes(term) || paragraphs.some((p) => p.words.some((word) => matches(word.value, term))))) continue;

        let best = paragraphs[0];
        let bestCount = 0;
        for (const paragraph of paragraphs) {
            const count = terms.filter((term) => paragraph.words.some((word) => matches(word.value, term))).length;
            if (count > bestCount) { best = paragraph; bestCount = count; }
        }
        const text = best?.text ?? entry.title;
        const hits = words(text).filter((word) => terms.some((term) => matches(word.value, term)));
        let start = Math.max(0, (hits[0]?.start ?? 0) - 55);
        if (start > 0) start = text.lastIndexOf(" ", start) + 1;
        let end = Math.min(text.length, start + 190);
        if (end < text.length) end = Math.max(start + 1, text.lastIndexOf(" ", end));
        const prefix = start > 0 ? "…" : "";
        ranked.push({
            id: entry.id,
            title: entry.title,
            excerpt: prefix + text.slice(start, end) + (end < text.length ? "…" : ""),
            highlights: hits.filter((hit) => hit.start >= start && hit.end <= end).map((hit) => ({
                start: hit.start - start + prefix.length, end: hit.end - start + prefix.length,
            })),
            score: titleTerms.length * 20 + bestCount * 5 + (titleTerms.length === terms.length ? 10 : 0),
        });
    }
    return ranked.sort((a, b) => b.score - a.score).map((result) => ({
        id: result.id, title: result.title, excerpt: result.excerpt, highlights: result.highlights,
    }));
}
