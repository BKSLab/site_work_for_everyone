import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { SkipLink } from "@/components/ui/SkipLink";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
    metadataBase: new URL("https://work-for-everyone.ru"),
    title: {
        template: "%s — Работа для всех",
        default: "Работа для всех",
    },
    description: "Сервис поиска вакансий для людей с инвалидностью",
    openGraph: {
        siteName: "Работа для всех",
        locale: "ru_RU",
        type: "website",
        images: [{ url: "/logo.jpg", alt: "Работа для всех" }],
    },
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
