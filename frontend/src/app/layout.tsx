import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { SkipLink } from "@/components/ui/SkipLink";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { YandexMetrika } from "@/components/analytics/YandexMetrika";

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
        images: [{ url: "/logo.png", alt: "Работа для всех", width: 2000, height: 2000 }],
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
                        <YandexMetrika />
                        <SkipLink />
                        <Header />
                        <main id="main-content" className="min-h-screen">
                            {children}
                        </main>
                        <Footer />
                        <div aria-live="polite" id="live-region" className="sr-only" />
                    </AuthProvider>
                </QueryProvider>
                <Script
                    id="yandex-metrika"
                    strategy="afterInteractive"
                    dangerouslySetInnerHTML={{
                        __html: `
                            (function(m,e,t,r,i,k,a){
                                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                                m[i].l=1*new Date();
                                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
                            })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=108776390', 'ym');
                            ym(108776390, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer:document.referrer, url:location.href, accurateTrackBounce:true, trackLinks:true});
                        `,
                    }}
                />
                <noscript>
                    <div>
                        <img src="https://mc.yandex.ru/watch/108776390" style={{position:"absolute", left:"-9999px"}} alt="" />
                    </div>
                </noscript>
            </body>
        </html>
    );
}
