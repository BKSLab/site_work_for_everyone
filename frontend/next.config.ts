import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
    enabled: process.env.ANALYZE === "true",
});

const securityHeaders = [
    {
        // Защита от clickjacking — запрет встраивания сайта в iframe
        key: "X-Frame-Options",
        value: "DENY",
    },
    {
        // Запрет MIME-sniffing — браузер не будет "угадывать" тип контента
        key: "X-Content-Type-Options",
        value: "nosniff",
    },
    {
        // Контроль Referer header — не утекают параметры URL при переходе на внешние сайты
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
    },
    {
        // Запрет доступа к неиспользуемым API браузера (камера, микрофон, геолокация)
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
    {
        // HSTS — принудительный HTTPS. Активен только при наличии TLS.
        // max-age=2 года. includeSubDomains — все поддомены тоже по HTTPS.
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
    },
    {
        // Content-Security-Policy
        // - default-src 'self' — по умолчанию всё загружается только с нашего домена
        // - script-src 'self' 'unsafe-inline' — Next.js использует inline-скрипты для гидратации
        //   (в будущем можно заменить на nonce, но это требует custom server или middleware)
        // - style-src 'self' 'unsafe-inline' — Tailwind CSS генерирует inline-стили
        // - img-src 'self' data: — изображения с нашего домена + data: URI (для inline SVG)
        // - font-src 'self' — шрифты только свои (next/font/google скачивает при сборке)
        // - connect-src 'self' — fetch/XHR только к нашему домену (прокси)
        // - object-src 'none' — полный запрет Flash/Java applets
        // - base-uri 'self' — запрет подмены <base href>
        // - frame-ancestors 'none' — аналог X-Frame-Options для CSP
        // - form-action 'self' — формы могут отправляться только на наш домен
        key: "Content-Security-Policy",
        value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'",
        ].join("; "),
    },
];

const nextConfig: NextConfig = {
    output: "standalone",
    reactStrictMode: true,
    // Скрыть заголовок X-Powered-By: Next.js — не раскрывать технологию
    poweredByHeader: false,
    // Security headers для всех маршрутов
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: securityHeaders,
            },
        ];
    },
};

export default withBundleAnalyzer(nextConfig);
