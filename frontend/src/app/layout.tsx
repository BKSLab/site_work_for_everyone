import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { SkipLink } from "@/components/ui/SkipLink";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
    title: {
        template: "%s — Работа для всех",
        default: "Работа для всех",
    },
    description: "Сервис поиска вакансий для людей с инвалидностью",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ru">
            <body className="font-sans antialiased">
                <QueryProvider>
                    <AuthProvider>
                        <SkipLink />
                        <Header />
                        <main id="main-content" className="min-h-screen">
                            {children}
                        </main>
                        <Footer />
                        <div aria-live="polite" id="live-region" className="sr-only" />
                    </AuthProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
