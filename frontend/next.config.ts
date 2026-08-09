import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
    enabled: process.env.ANALYZE === "true",
});

// Серверный upstream только для локального `next dev` без Nginx.
// Не имеет NEXT_PUBLIC_ префикса и не попадает в браузерный bundle.
const agentSseOrigin = (process.env.AGENT_SSE_ORIGIN ?? "http://127.0.0.1:8010").replace(
    /\/$/,
    ""
);

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
            "script-src 'self' 'unsafe-inline' https://mc.yandex.ru",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://mc.yandex.ru",
            "font-src 'self'",
            "connect-src 'self' https://mc.yandex.ru wss://mc.yandex.ru",
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
    // В проде /vera/sse/* перехватывает nginx до Next.js (см.
    // nginx/templates/default.conf.template, location /vera/sse/) — этот
    // rewrite там никогда не срабатывает. Нужен только для `next dev` без
    // nginx перед ним: имитирует то же самое проксирование напрямую на
    // vera_agent_service.
    async rewrites() {
        return [
            {
                source: "/vera/sse/:requestId",
                destination: `${agentSseOrigin}/sse/:requestId`,
            },
        ];
    },
};

export default withBundleAnalyzer(nextConfig);
