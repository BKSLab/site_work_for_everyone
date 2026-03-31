"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { FocusScope } from "react-aria";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { useLogout } from "@/hooks/useLogout";

function LoginLink() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const params = searchParams.toString();
    const currentUrl = pathname + (params ? `?${params}` : "");
    const isAuthPage = pathname.startsWith("/auth");
    const href = isAuthPage
        ? "/auth/login"
        : `/auth/login?redirect=${encodeURIComponent(currentUrl)}`;

    return (
        <Link
            href={href}
            className="rounded border border-accent/50 bg-white/10 px-3 py-1.5 text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
            Войти
        </Link>
    );
}

const PROTECTED_PATHS = ["/favorites"];

const NAV_LINKS = [
    { href: "/", label: "Поиск" },
    { href: "/favorites", label: "Избранное" },
    { href: "/blog", label: "Блог" },
];

export function Header() {
    const router = useRouter();
    const pathname = usePathname();
    const { user, isAuthenticated, isLoading } = useAuthStore();
    const logoutMutation = useLogout();
    const [menuOpen, setMenuOpen] = useState(false);

    function handleLogout() {
        logoutMutation.mutate(undefined, {
            onSuccess: () => {
                const isProtected = PROTECTED_PATHS.some((p) =>
                    pathname.startsWith(p)
                );
                if (isProtected) router.push("/");
            },
        });
        setMenuOpen(false);
    }

    function closeMenu() {
        setMenuOpen(false);
    }

    const linkClass = (isActive: boolean) =>
        `text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            isActive ? "text-accent font-semibold" : "text-muted hover:text-foreground"
        }`;

    return (
        <>
        {menuOpen && (
            <div
                aria-hidden="true"
                className="fixed inset-0 z-30 md:hidden"
                onClick={closeMenu}
            />
        )}
        <header className="sticky top-0 z-40 border-b border-white/10 bg-background/60 backdrop-blur-md backdrop-saturate-150">
            {/* ── Строка шапки ─────────────────────────────────────────────── */}
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">

                {/* Логотип */}
                <Link
                    href="/"
                    onClick={closeMenu}
                    className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-3 py-2 backdrop-blur-md transition-all duration-200 hover:border-accent/35 hover:shadow-[0_0_22px_rgba(245,184,0,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label="Работа для всех — главная страница"
                >
                    <span className="flex shrink-0 items-center justify-center rounded-full ring-1 ring-accent/45 shadow-[0_0_16px_rgba(245,184,0,0.28)]">
                        <Image
                            src="/logo.jpg"
                            alt=""
                            aria-hidden="true"
                            width={32}
                            height={32}
                            className="rounded-full"
                        />
                    </span>
                    <span className="text-sm font-bold text-accent drop-shadow-[0_0_8px_rgba(245,184,0,0.4)]">
                        Работа для всех
                    </span>
                    <span
                        aria-hidden="true"
                        className="hidden select-none text-[0.6rem] tracking-widest text-accent/80 sm:inline"
                    >
                        ⠗⠁⠃⠕⠞⠁⠀⠙⠇⠫⠀⠺⠎⠑⠓
                    </span>
                </Link>

                {/* Десктопная навигация */}
                <nav aria-label="Основная навигация" className="hidden md:block">
                    <ul className="flex items-center gap-6">
                        {NAV_LINKS.map(({ href, label }) => (
                            <li key={href}>
                                <Link
                                    href={href}
                                    className={linkClass(pathname === href)}
                                    aria-current={pathname === href ? "page" : undefined}
                                >
                                    {label}
                                </Link>
                            </li>
                        ))}
                        <li>
                            <Link
                                href="/assistant"
                                className={`flex items-center gap-2 ${linkClass(pathname.startsWith("/assistant"))}`}
                                aria-label="Ассистент Вера"
                                aria-current={pathname.startsWith("/assistant") ? "page" : undefined}
                            >
                                <span className="flex shrink-0 items-center justify-center rounded-full ring-1 ring-white/25 shadow-[0_0_8px_rgba(245,184,0,0.15)]">
                                    <Image
                                        src="/logo_ai_assistant.png"
                                        alt=""
                                        aria-hidden="true"
                                        width={24}
                                        height={24}
                                        className="rounded-full"
                                    />
                                </span>
                                <span>Ассистент Вера</span>
                            </Link>
                        </li>
                        {!isLoading && (
                            <li>
                                {isAuthenticated ? (
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-foreground">{user?.first_name}</span>
                                        <button
                                            onClick={handleLogout}
                                            disabled={logoutMutation.isPending}
                                            className="rounded bg-surface-hover px-3 py-1.5 text-sm font-medium text-foreground hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Выйти
                                        </button>
                                    </div>
                                ) : (
                                    <Suspense
                                        fallback={
                                            <Link
                                                href="/auth/login"
                                                className="rounded border border-accent/50 bg-white/10 px-3 py-1.5 text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                            >
                                                Войти
                                            </Link>
                                        }
                                    >
                                        <LoginLink />
                                    </Suspense>
                                )}
                            </li>
                        )}
                    </ul>
                </nav>

                {/* Бургер-кнопка (мобильная) */}
                <button
                    type="button"
                    aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
                    aria-expanded={menuOpen}
                    aria-controls="mobile-menu"
                    onClick={() => setMenuOpen((v) => !v)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-muted transition-colors hover:border-white/25 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:hidden"
                >
                    {menuOpen ? (
                        /* X */
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    ) : (
                        /* Бургер */
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                    )}
                </button>
            </div>

            {/* ── Мобильное меню ───────────────────────────────────────────── */}
            {menuOpen && (
                <FocusScope contain restoreFocus autoFocus>
                <div
                    id="mobile-menu"
                    className="border-t border-white/10 bg-background/95 backdrop-blur-md md:hidden"
                    onKeyDown={(e) => { if (e.key === "Escape") setMenuOpen(false); }}
                >
                    <nav aria-label="Мобильная навигация">
                        <ul className="flex flex-col divide-y divide-white/8">
                            {NAV_LINKS.map(({ href, label }) => (
                                <li key={href}>
                                    <Link
                                        href={href}
                                        onClick={closeMenu}
                                        className={`block px-5 py-3.5 text-sm transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${pathname === href ? "text-accent font-semibold" : "text-muted hover:text-foreground"}`}
                                        aria-current={pathname === href ? "page" : undefined}
                                    >
                                        {label}
                                    </Link>
                                </li>
                            ))}
                            <li>
                                <Link
                                    href="/assistant"
                                    onClick={closeMenu}
                                    className={`flex items-center gap-2.5 px-5 py-3.5 text-sm transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${pathname.startsWith("/assistant") ? "text-accent font-semibold" : "text-muted hover:text-foreground"}`}
                                    aria-current={pathname.startsWith("/assistant") ? "page" : undefined}
                                >
                                    <span className="flex shrink-0 items-center justify-center rounded-full ring-1 ring-white/25">
                                        <Image
                                            src="/logo_ai_assistant.png"
                                            alt=""
                                            aria-hidden="true"
                                            width={22}
                                            height={22}
                                            className="rounded-full"
                                        />
                                    </span>
                                    Ассистент Вера
                                </Link>
                            </li>
                            {!isLoading && (
                                <li className="px-5 py-3.5">
                                    {isAuthenticated ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-foreground">{user?.first_name}</span>
                                            <button
                                                onClick={handleLogout}
                                                disabled={logoutMutation.isPending}
                                                className="rounded bg-surface-hover px-3 py-1.5 text-sm font-medium text-foreground hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Выйти
                                            </button>
                                        </div>
                                    ) : (
                                        <Suspense
                                            fallback={
                                                <Link
                                                    href="/auth/login"
                                                    className="inline-block rounded border border-accent/50 bg-white/10 px-3 py-1.5 text-sm font-semibold text-accent hover:border-accent hover:bg-white/20"
                                                >
                                                    Войти
                                                </Link>
                                            }
                                        >
                                            <LoginLink />
                                        </Suspense>
                                    )}
                                </li>
                            )}
                        </ul>
                    </nav>
                </div>
                </FocusScope>
            )}
        </header>
        </>
    );
}
