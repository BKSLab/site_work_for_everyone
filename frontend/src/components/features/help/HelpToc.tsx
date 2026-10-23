"use client";

import { useEffect, useState } from "react";
import { HELP_SECTIONS, HELP_TARGETS } from "./help-sections";

export function HelpToc() {
    const [activeId, setActiveId] = useState(HELP_TARGETS[0].id);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        const headings = HELP_TARGETS.map(({ id }) => document.getElementById(id))
            .filter((heading): heading is HTMLElement => heading !== null);
        let scrollFrame = 0;
        let focusFrame = 0;

        function sync() {
            // Scroll events also cover instant jumps past the observer's viewport band.
            const line = Math.min(window.innerHeight * 0.3, 180);
            let next = headings[0]?.id;
            for (const heading of headings) {
                if (heading.getBoundingClientRect().top > line) break;
                next = heading.id;
            }
            if (next) setActiveId(next);
        }

        function onScroll() {
            cancelAnimationFrame(scrollFrame);
            scrollFrame = requestAnimationFrame(sync);
        }

        function focusDestination() {
            cancelAnimationFrame(focusFrame);
            focusFrame = requestAnimationFrame(() => {
                let id = "help-heading";
                try {
                    if (window.location.hash) id = decodeURIComponent(window.location.hash.slice(1));
                } catch {
                    // Malformed fragments should not prevent the guide from opening.
                }
                const target = document.getElementById(id);
                if (target && (id === "contents" || id === "help-heading" || headings.includes(target))) {
                    // Next's route scroll can race with focus on the destination heading.
                    // Own both operations so every fragment works on the first visit too.
                    if (window.location.hash) target.scrollIntoView({ block: "start", behavior: "instant" });
                    target.focus({ preventScroll: true });
                }
                sync();
            });
        }

        focusDestination();
        window.addEventListener("hashchange", focusDestination);
        window.addEventListener("popstate", focusDestination);
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            cancelAnimationFrame(scrollFrame);
            cancelAnimationFrame(focusFrame);
            window.removeEventListener("hashchange", focusDestination);
            window.removeEventListener("popstate", focusDestination);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, []);

    function link(id: string, label: string) {
        const active = id === activeId;
        return (
            <a
                href={`#${id}`}
                aria-current={active ? "location" : undefined}
                onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    setActiveId(id);
                    // The fragment may be unchanged, so hashchange is not guaranteed.
                    document.getElementById(id)?.focus({ preventScroll: true });
                }}
                className={`block rounded-sm border-l-2 py-1 pl-3 motion-safe:transition-colors motion-safe:duration-150 ${
                    active
                        ? "border-accent font-semibold text-foreground"
                        : "border-transparent text-accent underline underline-offset-2 hover:text-accent-hover"
                }`}
            >
                {label}
            </a>
        );
    }

    return (
        <nav
            aria-label="Оглавление справки"
            id="contents"
            tabIndex={-1}
            className="mb-8 scroll-mt-28 rounded-lg focus:outline-none lg:sticky lg:top-28 lg:mb-0 lg:self-start"
        >
            <h2 className="mb-3 text-sm font-semibold text-muted">
                <span className="hidden uppercase tracking-wide lg:inline">Оглавление</span>
                <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls="help-toc-list"
                    onClick={() => setExpanded(!expanded)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-accent lg:hidden"
                >
                    Оглавление
                    <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                </button>
            </h2>
            <ul
                id="help-toc-list"
                className={`vera-chat-scrollbar ${expanded ? "block" : "hidden"} space-y-1 text-sm lg:block lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:pr-3`}
            >
                {HELP_SECTIONS.map(({ id, label, children }) => (
                    <li key={id}>
                        {link(id, label)}
                        {children && (
                            <ul className="ml-3 mt-1 space-y-1">
                                {children.map((child) => (
                                    <li key={child.id}>{link(child.id, child.label)}</li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ul>
        </nav>
    );
}
