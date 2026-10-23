"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Button as AriaButton, Dialog, DialogTrigger, Popover } from "react-aria-components";
import { buildHelpSearchIndex, searchHelp, type HelpSearchResult } from "./help-search";

function findResults(query: string) {
    return { query: query.trim(), results: searchHelp(buildHelpSearchIndex(document), query) };
}

export function HelpSearch() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [search, setSearch] = useState<{ query: string; results: HelpSearchResult[] }>({ query: "", results: [] });
    const inputRef = useRef<HTMLInputElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const destinationRef = useRef<string | null>(null);
    const trimmed = query.trim();
    const ready = trimmed === search.query;

    useEffect(() => {
        if (!open) return;
        timerRef.current = setTimeout(() => setSearch(findResults(query)), 200);
        return () => clearTimeout(timerRef.current);
    }, [query, open]);

    useEffect(() => {
        if (open || !destinationRef.current) return;
        const id = destinationRef.current;
        destinationRef.current = null;
        // Focus the destination after the popover has restored its trigger focus.
        let frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
                const target = document.getElementById(id);
                target?.scrollIntoView({ block: "start", behavior: "instant" });
                target?.focus({ preventScroll: true });
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [open]);

    function clear() {
        clearTimeout(timerRef.current);
        setQuery("");
        setSearch({ query: "", results: [] });
        inputRef.current?.focus();
    }

    return (
        <DialogTrigger isOpen={open} onOpenChange={setOpen}>
            <AriaButton aria-label="Поиск по справке"
                className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border text-accent hover:bg-surface sm:w-auto sm:px-3 sm:text-sm">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" />
                </svg>
                <span className="hidden sm:inline">Поиск по справке</span>
            </AriaButton>
            <Popover placement="bottom end" offset={8}
                className="vera-chat-scrollbar z-50 max-h-[min(32rem,calc(100dvh-2rem))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl">
                <Dialog aria-label="Поиск по справке" className="outline-none">
                    <form role="search" aria-label="Поиск по справке" onSubmit={(event) => {
                        event.preventDefault();
                        clearTimeout(timerRef.current);
                        setSearch(findResults(query));
                    }}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <label htmlFor="help-search" className="text-base font-semibold text-foreground">Поиск по справке</label>
                            <AriaButton onPress={() => setOpen(false)} aria-label="Закрыть поиск"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground">
                                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="m6 6 12 12M18 6 6 18" />
                                </svg>
                            </AriaButton>
                        </div>
                        <div className="relative">
                            <input
                                ref={inputRef}
                                id="help-search"
                                type="search"
                                autoFocus
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                maxLength={180}
                                autoComplete="off"
                                aria-describedby="help-search-hint"
                                placeholder="Например, «забыл пароль»"
                                className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-surface px-3 py-2.5 pr-12 text-base text-foreground placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
                            />
                            {query && (
                                <button type="button" onClick={clear} aria-label="Очистить поиск"
                                    className="absolute inset-y-0 right-0 m-0.5 flex w-11 items-center justify-center rounded-md text-accent hover:bg-surface-hover">
                                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="m6 6 12 12M18 6 6 18" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        <p id="help-search-hint" className="mt-2 text-sm leading-relaxed text-muted">
                            Введите тему или вопрос. Выберите раздел в результатах, чтобы перейти к инструкции.
                        </p>
                    </form>
                    <p role="status" aria-atomic="true" className="mt-2 text-sm text-muted">
                        {ready && trimmed && (trimmed.length < 2 ? "Введите не менее двух символов." :
                            search.results.length ? `Найдено разделов: ${search.results.length}.` : "Ничего не найдено.")}
                    </p>
                    {ready && trimmed.length >= 2 && search.results.length > 0 && (
                        <section aria-labelledby="help-search-results-heading" className="mt-4 border-t border-border pt-4">
                            <h2 id="help-search-results-heading" className="sr-only">Результаты поиска по справке</h2>
                            <ul className="space-y-4">
                                {search.results.map((result) => (
                                    <li key={result.id} className="min-w-0">
                                        <a href={`#${result.id}`} className="rounded-sm font-semibold text-accent underline underline-offset-2 hover:text-accent-hover"
                                            onClick={(event) => {
                                                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                                                event.preventDefault();
                                                destinationRef.current = result.id;
                                                setOpen(false);
                                                if (window.location.hash !== `#${result.id}`) window.location.hash = result.id;
                                            }}>
                                            {result.title}
                                        </a>
                                        <p className="mt-1 text-base leading-relaxed break-words text-muted">
                                            {result.highlights.map((hit, index) => (
                                                <Fragment key={hit.start}>
                                                    {result.excerpt.slice(result.highlights[index - 1]?.end ?? 0, hit.start)}
                                                    <mark className="rounded-sm bg-accent/15 text-foreground">{result.excerpt.slice(hit.start, hit.end)}</mark>
                                                </Fragment>
                                            ))}
                                            {result.excerpt.slice(result.highlights.at(-1)?.end ?? 0)}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    {ready && trimmed.length >= 2 && search.results.length === 0 && (
                        <p className="mt-2 text-sm leading-relaxed text-muted">
                            Попробуйте другое слово, например «пароль», «резюме» или «обратная связь».
                        </p>
                    )}
                </Dialog>
            </Popover>
        </DialogTrigger>
    );
}
