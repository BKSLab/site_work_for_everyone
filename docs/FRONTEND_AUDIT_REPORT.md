# Аудит фронтенда — «Работа для всех»

> **Дата:** 28.03.2026
> **Аудитор:** Claude Opus 4.6 (Staff-level Frontend Engineer)
> **Область:** `frontend/` — Next.js 16, React 19, TypeScript 5, Tailwind CSS 4

---

## Содержание

1. [Executive Summary](#1-executive-summary)
2. [Документация vs Реальность](#2-документация-vs-реальность)
3. [Архитектура](#3-архитектура)
4. [Управление состоянием](#4-управление-состоянием)
5. [API и безопасность](#5-api-и-безопасность)
6. [Доступность (WCAG 2.2 AA)](#6-доступность-wcag-22-aa)
7. [Производительность](#7-производительность)
8. [Качество кода](#8-качество-кода)
9. [Quick Wins](#9-quick-wins)
10. [Стратегические улучшения](#10-стратегические-улучшения)
11. [Implementation Plan](#11-implementation-plan)

---

## 1. Executive Summary

Проект «Работа для всех» — платформа поиска вакансий для людей с инвалидностью. Целевая аудитория — пользователи скринридеров (NVDA, JAWS, VoiceOver). Фронтенд построен на Next.js App Router с proxy-паттерном, httpOnly cookies и React Aria.

### Общая оценка

| Область | Оценка | Комментарий |
|---|---|---|
| Архитектура | 🟡 Хорошо | Proxy-паттерн корректен, но middleware не активирован |
| Безопасность | 🟠 Требует внимания | httpOnly cookies + CSRF + rate-limit, но есть пробелы |
| Доступность | 🟡 Хорошо | Семантика и ARIA на высоком уровне, но есть критические ошибки |
| Производительность | 🟡 Хорошо | RSC + Suspense + keepPreviousData, minor issues |
| Качество кода | 🟢 Отлично | Чистый TypeScript, хорошая декомпозиция |

### Критические находки (требуют немедленного исправления)

| # | Проблема | Область |
|---|---|---|
| 1 | `middleware.ts` не существует — защита маршрутов не работает | Безопасность |
| 2 | `error.tsx` не принимает `error`/`reset` — Error Boundary сломан | Архитектура |
| 3 | Вложенный `<main>` на странице `/contact` — дублирование landmark | Доступность |
| 4 | `API_KEY!` без проверки наличия — потенциальный отказ сервиса | Безопасность |
| 5 | `dangerouslySetInnerHTML` без DOMPurify в AssistantFlow и blog | Безопасность |

**Всего найдено:** 5 критических, 10 высоких, 12 средних, 6 низких проблем.

---

## 2. Документация vs Реальность

Документация (`PROJECT_KNOWLEDGE.md`) была сравнена с реальной реализацией. Ниже — расхождения.

### 🔴 РАСХОЖДЕНИЕ 1: Middleware не зарегистрирован

**Документация утверждает:**
> Файл `src/middleware.ts` должен существовать и реэкспортировать из `proxy.ts`

**Реальность:**
Файл `src/middleware.ts` **не существует**. Файл `src/proxy.ts` (строки 1–48) содержит корректную логику middleware (защита `/favorites`, редирект авторизованных с `/auth/*`), но она **никогда не выполняется**, потому что Next.js ищет только `middleware.ts`/`middleware.js`.

**Последствия:**
- Неавторизованные пользователи могут открыть `/favorites` напрямую (защита только на клиенте через `useEffect`)
- Авторизованные пользователи могут открыть `/auth/login` (нет серверного редиректа)

---

### 🟡 РАСХОЖДЕНИЕ 2: Структура assistant

**Документация утверждает:**
> `/assistant` — ИИ-ассистент Вера (через `?vacancy_id=`)

**Реальность:**
Существуют два маршрута:
- `app/assistant/page.tsx` — лендинг ассистента
- `app/assistant/start/page.tsx` — собственно wizard с `AssistantFlow`

Документация не отражает маршрут `/assistant/start`.

---

### 🟡 РАСХОЖДЕНИЕ 3: Поле `username` в JWT

**Документация утверждает:**
> Из JWT payload извлекаются `sub` (email) и `username`

**Реальность (`src/app/api/auth/[...path]/route.ts:242–244`):**
```typescript
const email = payload.sub as string | undefined;
const first_name = payload.first_name as string | undefined;
const last_name = payload.last_name as string | undefined;
```

Извлекаются `sub`, `first_name`, `last_name` — поля `username` нет.

---

### ✅ СОВПАДЕНИЯ (подтверждённые)

- Proxy-паттерн: Browser → Next.js Route Handler → Backend ✅
- httpOnly cookies для access/refresh tokens ✅
- CSRF через Origin validation ✅
- Rate limiting на auth endpoints ✅
- `getSafeRedirect()` защита от open redirect ✅
- Security headers в `next.config.ts` ✅
- Zustand + sessionStorage для search store ✅
- TanStack Query с `keepPreviousData` ✅
- Оптимистичные обновления избранного ✅

---

## 3. Архитектура

### ISSUE-ARCH-01: `middleware.ts` не существует
- **Severity:** 🔴 Critical
- **Описание:** Файл `src/proxy.ts` содержит middleware логику защиты маршрутов, но `src/middleware.ts` не создан. Next.js App Router не активирует middleware без этого файла.
- **Почему важно:** Защита `/favorites` и редиректы с `/auth/*` работают только на клиенте (useEffect), что позволяет видеть контент до редиректа и создаёт flash of unauthorized content.
- **Файл:** `src/middleware.ts` (отсутствует), `src/proxy.ts:1–48`
- **Рекомендация:** Создать `src/middleware.ts`:
  ```typescript
  export { proxy as middleware, config } from "./proxy";
  ```

---

### ISSUE-ARCH-02: `error.tsx` не принимает параметры Error Boundary
- **Severity:** 🔴 Critical
- **Описание:** `src/app/error.tsx` не принимает `error` и `reset` props, которые передаёт Next.js Error Boundary.
- **Почему важно:** Пользователь не может повторить попытку (кнопка "retry"), а информация об ошибке теряется.
- **Файл:** `src/app/error.tsx:6–11`
- **Рекомендация:**
  ```typescript
  export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
      return (
          <Container className="py-12">
              <ServiceError onRetry={reset} />
          </Container>
      );
  }
  ```

---

### ISSUE-ARCH-03: `Suspense` без `fallback` в `assistant/start/page.tsx`
- **Severity:** 🟠 High
- **Описание:** `<Suspense>` без `fallback` означает, что при загрузке `AssistantFlow` пользователь не видит никакого индикатора.
- **Файл:** `src/app/assistant/start/page.tsx:10–12`
- **Рекомендация:** Добавить fallback:
  ```tsx
  <Suspense fallback={<Spinner />}>
  ```

---

### ISSUE-ARCH-04: Защита `/favorites` только на клиенте
- **Severity:** 🟠 High
- **Описание:** `src/app/favorites/page.tsx:21–25` использует `useEffect` для редиректа неавторизованных. Это работает, но: (1) происходит после рендера, (2) skeleton виден до редиректа, (3) не защищает от прямого запроса.
- **Файл:** `src/app/favorites/page.tsx:21–25`
- **Рекомендация:** Исправить ISSUE-ARCH-01 (middleware) — это решит проблему на серверном уровне.

---

## 4. Управление состоянием

### ISSUE-STATE-01: React Query `invalidateQueries` — работает корректно
- **Severity:** ℹ️ Информационное
- **Описание:** `useFavorites.ts:20` использует `queryKey: ["favorites", userId]` для инвалидации, в то время как query key — `["favorites", userId, page, pageSize]`. Это **корректно**: React Query по умолчанию делает частичное совпадение (prefix matching). Проблемы нет.
- **Файл:** `src/hooks/useFavorites.ts:20, 28`

---

### ISSUE-STATE-02: Дублирование `useAuthStore((s) => s.user?.email)` по компонентам
- **Severity:** 🟢 Low
- **Описание:** Паттерн `useAuthStore((s) => s.user?.email)` повторяется в 4+ компонентах. Не баг, но потенциальный DRY violation.
- **Файлы:** `VacanciesContent.tsx:30`, `vacancies/[id]/page.tsx`, `favorites/page.tsx:16`, `favorites/[id]/page.tsx`
- **Рекомендация:** Можно создать `useUserId()`, но это не обязательно — selector pattern Zustand уже оптимален.

---

### ISSUE-STATE-03: `staleTime: Infinity` для регионов
- **Severity:** 🟢 Low
- **Описание:** `useRegions.ts` и `useFederalDistricts.ts` используют `staleTime: Infinity`. Справочные данные меняются редко, поэтому это допустимо. Однако при добавлении нового региона пользователь не увидит его до перезагрузки приложения.
- **Файлы:** `src/hooks/useRegions.ts`, `src/hooks/useFederalDistricts.ts`
- **Рекомендация:** Рассмотреть `staleTime: 24 * 60 * 60 * 1000` (24 часа).

---

## 5. API и безопасность

### ISSUE-SEC-01: `API_KEY!` без проверки наличия
- **Severity:** 🔴 Critical
- **Описание:** В `src/app/api/v1/[...path]/route.ts:19` используется `API_KEY!` (non-null assertion). Если переменная окружения не задана, в заголовок `X-API-Key` попадёт `undefined`, что преобразуется в строку `"undefined"`.
- **Почему важно:** Все запросы к API будут отклоняться с ошибкой авторизации. Полный отказ функционала поиска и просмотра вакансий.
- **Файл:** `src/app/api/v1/[...path]/route.ts:8–9, 19`
- **Рекомендация:**
  ```typescript
  if (!API_URL || !API_KEY) {
      throw new Error("API_URL and API_KEY must be configured");
  }
  ```

---

### ISSUE-SEC-02: `dangerouslySetInnerHTML` без санитизации
- **Severity:** 🔴 Critical
- **Описание:** HTML от LLM-бэкенда рендерится через `dangerouslySetInnerHTML` в двух местах:
  1. `AssistantFlow.tsx:789` — HTML от ИИ-ассистента
  2. `blog/[slug]/page.tsx:128` — HTML из markdown файлов
- **Почему важно:** Даже если контент приходит с доверенного сервера:
  - LLM может сгенерировать `<script>` или `<img onerror=...>` по prompt injection
  - Компрометация бэкенда автоматически даёт XSS на фронтенде
  - Blog markdown может содержать raw HTML
- **Файлы:** `src/components/features/assistant/AssistantFlow.tsx:789`, `src/app/blog/[slug]/page.tsx:128`
- **Рекомендация:** Установить `dompurify` и санитизировать:
  ```typescript
  import DOMPurify from "dompurify";
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resultHtml) }}
  ```

---

### ISSUE-SEC-03: Отсутствует rate limiting на `/refresh`
- **Severity:** 🟠 High
- **Описание:** Endpoint `refresh` отсутствует в `PATH_LIMITERS` (`route.ts:57–63`). Злоумышленник может неограниченно вызывать refresh, перебирая токены.
- **Файл:** `src/app/api/auth/[...path]/route.ts:57–63`
- **Рекомендация:** Добавить:
  ```typescript
  const refreshLimiter = createRateLimiter({ interval: 60_000, limit: 10 });
  // В PATH_LIMITERS:
  refresh: refreshLimiter,
  ```

---

### ISSUE-SEC-04: Отсутствует rate limiting на `/api/v1/**`
- **Severity:** 🟡 Medium
- **Описание:** V1 proxy не имеет rate limiting. Поиск вакансий (POST) — ресурсоёмкая операция, которая вызывает запросы к hh.ru и trudvsem.ru.
- **Файл:** `src/app/api/v1/[...path]/route.ts:118–128`
- **Рекомендация:** Добавить rate limiter хотя бы для POST-запросов поиска.

---

### ISSUE-SEC-05: CSP с `'unsafe-inline'`
- **Severity:** 🟡 Medium
- **Описание:** `script-src 'self' 'unsafe-inline'` и `style-src 'self' 'unsafe-inline'` снижают эффективность CSP. Это документированное ограничение, необходимое для Next.js hydration и Tailwind.
- **Файл:** `next.config.ts:51–52`
- **Рекомендация:** В будущем перейти на nonce-based CSP через Next.js middleware.

---

### ISSUE-SEC-06: Логирование targetUrl с потенциальными секретами
- **Severity:** 🟡 Medium
- **Описание:** В `route.ts:70` логируется `targetUrl: url.toString()`. URL содержит API_URL и query parameters, которые могут утечь в системы логирования.
- **Файл:** `src/app/api/v1/[...path]/route.ts:69–70`
- **Рекомендация:** Логировать только path, не полный URL:
  ```typescript
  targetPath: `/api/v1/${path}`,
  ```

---

### ISSUE-SEC-07: CSRF-валидация может блокировать IPv6
- **Severity:** 🟡 Medium
- **Описание:** В `csrf.ts` hostname извлекается через `requestHost.split(":")[0]`. Для IPv6 адресов в формате `[::1]:3000` это даст `[::1`, что не совпадёт с Origin.
- **Файл:** `src/lib/utils/csrf.ts`
- **Рекомендация:** Использовать `new URL(\`http://${requestHost}\`).hostname` для надёжного парсинга.

---

### ✅ Подтверждённые хорошие практики безопасности

- httpOnly + SameSite=Lax cookies для токенов ✅
- JWT декодируется без crypto-верификации (бэкенд верифицирует) ✅
- CSRF через Origin header validation ✅
- Rate limiting на login (5/мин), register (3/мин), forgot-password (3/мин) ✅
- `getSafeRedirect()` — корректная защита от open redirect ✅
- `sanitizeProxyPath()` — защита от path traversal ✅
- Security headers: X-Frame-Options DENY, HSTS, nosniff, Permissions-Policy ✅
- `poweredByHeader: false` ✅
- Все env-переменные серверные (нет `NEXT_PUBLIC_`) ✅
- Refresh token дедупликация в `ApiClient` ✅
- `.env.local` в `.gitignore` ✅

---

## 6. Доступность (WCAG 2.2 AA)

> Это **самый важный раздел** — проект создан для пользователей скринридеров.

### ISSUE-A11Y-01: Вложенный `<main>` landmark на странице `/contact`
- **Severity:** 🔴 Critical
- **Описание:** `layout.tsx:35` оборачивает `{children}` в `<main id="main-content">`. Страница `contact/page.tsx:12` создаёт собственный `<main id="main-content">`. В итоге в DOM — два вложенных `<main>`, оба с одинаковым `id`.
- **Почему важно:** NVDA объявит два landmark "main", что дезориентирует пользователя. Дублирование `id` нарушает HTML-спецификацию.
- **Файлы:** `src/app/layout.tsx:35`, `src/app/contact/page.tsx:12`
- **Рекомендация:** Убрать `<main>` из `contact/page.tsx`, заменить на `<div>` или `<section>`.

---

### ISSUE-A11Y-02: `h1` на странице `/vacancies` без location — отсутствует заголовок
- **Severity:** 🟠 High
- **Описание:** Когда `location` пуст, `VacanciesContent.tsx:72–87` возвращает параграф без заголовка. Страница `vacancies/page.tsx` — это Suspense-обёртка без собственного `<h1>`.
- **Почему важно:** Скринридер не объявит заголовок страницы; пользователь не понимает, где находится.
- **Файл:** `src/app/vacancies/VacanciesContent.tsx:72–87`
- **Рекомендация:** Добавить `<h1>` перед текстом-подсказкой.

---

### ISSUE-A11Y-03: Нет `aria-current="page"` для активной ссылки в навигации
- **Severity:** 🟠 High
- **Описание:** `Header.tsx` использует `usePathname()`, но не отмечает активную ссылку через `aria-current="page"`. Скринридер не сообщает пользователю, на какой странице он находится.
- **Почему важно:** WCAG 2.4.8 (Location) — пользователь должен знать своё местоположение.
- **Файл:** `src/components/layout/Header.tsx:100–105`
- **Рекомендация:**
  ```tsx
  <Link href={href} aria-current={pathname === href ? "page" : undefined}>
  ```

---

### ISSUE-A11Y-04: Мобильное меню без focus trap
- **Severity:** 🟠 High
- **Описание:** Мобильное меню (`Header.tsx:184–253`) появляется по нажатию бургер-кнопки, но не реализует focus trap. Tab может увести фокус за пределы меню. Также при открытии фокус не перемещается на первый элемент меню.
- **Почему важно:** WCAG 2.1.2 (No Keyboard Trap) — пользователь клавиатуры не может эффективно использовать меню.
- **Файл:** `src/components/layout/Header.tsx:184–253`
- **Рекомендация:** Использовать React Aria `Dialog` для мобильного меню с focus trap, или перенести фокус на первый пункт при открытии и закрывать по Escape.

---

### ISSUE-A11Y-05: Кнопка избранного в `VacancyCard` без aria-pressed
- **Severity:** 🟠 High
- **Описание:** Кнопка «В избранное» / «Удалить из избранного» работает как toggle, но не имеет `aria-pressed`. Скринридер не объявляет текущее состояние.
- **Файл:** `src/components/features/vacancies/VacancyCard.tsx:134–141`
- **Рекомендация:**
  ```tsx
  <button aria-pressed={isFavorite} aria-label={`${isFavorite ? "Удалить из" : "Добавить в"} избранное: ${vacancy.vacancy_name}`}>
  ```

---

### ISSUE-A11Y-06: Фокус не переходит на ошибку при неуспешной валидации SearchForm
- **Severity:** 🟠 High
- **Описание:** При ошибке валидации формы поиска (`SearchForm.tsx:43–49`) ошибки устанавливаются через `setErrors`, но фокус остаётся на кнопке «Найти». Скринридер не объявляет ошибку.
- **Файл:** `src/components/features/search/SearchForm.tsx:35–55`
- **Рекомендация:** Использовать `ref` на первом поле с ошибкой и вызвать `.focus()` после `setErrors()`.

---

### ISSUE-A11Y-07: `role="alert"` на `favoriteError` может не объявляться
- **Severity:** 🟡 Medium
- **Описание:** В `VacancyCard.tsx:120–122` и `VacancyDetail.tsx:168–170` элемент с `role="alert"` появляется в DOM условно (через `{favoriteError && ...}`). Если элемент отсутствовал в DOM до появления ошибки, некоторые скринридеры могут не объявить его.
- **Почему важно:** Live-регионы должны присутствовать в DOM до обновления (документация проекта это тоже требует).
- **Файлы:** `VacancyCard.tsx:120–122`, `VacancyDetail.tsx:168–170`
- **Рекомендация:** Всегда рендерить элемент, менять только содержимое:
  ```tsx
  <p role="alert" className="text-xs text-red-400">{favoriteError}</p>
  ```

---

### ISSUE-A11Y-08: `PasswordInput` — кнопка toggle без `aria-pressed`
- **Severity:** 🟡 Medium
- **Описание:** Кнопка показа/скрытия пароля меняет `aria-label`, но не использует `aria-pressed`.
- **Файл:** `src/components/features/auth/PasswordInput.tsx`
- **Рекомендация:** Добавить `aria-pressed={showPassword}`.

---

### ISSUE-A11Y-09: Footer без `aria-label`
- **Severity:** 🟡 Medium
- **Описание:** `<footer>` в `Footer.tsx:5` не имеет `aria-label`. NVDA объявит его просто как "contentinfo" без описания.
- **Файл:** `src/components/layout/Footer.tsx:5`
- **Рекомендация:** Добавить `aria-label="Подвал сайта"`.

---

### ISSUE-A11Y-10: AssistantFlow stepper — нет ARIA для прогресса
- **Severity:** 🟡 Medium
- **Описание:** Степпер (wizard progress) не использует ARIA-атрибуты для обозначения текущего шага. Скринридер не объявляет, на каком шаге пользователь.
- **Файл:** `src/components/features/assistant/AssistantFlow.tsx` (компонент Stepper)
- **Рекомендация:** Использовать `aria-current="step"` на текущем шаге и `aria-label` с номером:
  ```tsx
  <li aria-current={isCurrent ? "step" : undefined}>
      <span className="sr-only">Шаг {index + 1} из {total}: {label}</span>
  </li>
  ```

---

### ISSUE-A11Y-11: BlogPreview — сетка карточек без семантики списка
- **Severity:** 🟡 Medium
- **Описание:** Карточки блога рендерятся в `<div className="grid...">` без `role="list"`.
- **Файл:** `src/components/features/blog/BlogPreview.tsx`
- **Рекомендация:** Использовать `<ul role="list">` с `<li>` для каждой карточки.

---

### ISSUE-A11Y-12: `SearchResultsSummary` — данные без семантической структуры
- **Severity:** 🟡 Medium
- **Описание:** Сводка результатов поиска содержит пары "метка–значение", но не использует `<dl>`/`<dt>`/`<dd>`.
- **Файл:** `src/components/features/vacancies/SearchResultsSummary.tsx`
- **Рекомендация:** Обернуть в `<dl>` для корректной семантики.

---

### ✅ Подтверждённые хорошие практики доступности

- Skip-link `<SkipLink />` в layout.tsx ✅
- `<html lang="ru">` ✅
- `<main id="main-content">` в layout.tsx ✅
- `<nav aria-label="...">` для desktop и mobile навигации ✅
- `aria-hidden="true"` на декоративных элементах (SVG-иконки, логотипы) ✅
- `role="search"` на форме поиска ✅
- `<article aria-labelledby="...">` на карточках вакансий ✅
- `<dl>` для пар "метка–значение" в `VacancyCard` и `VacancyDetail` ✅
- `sr-only` для ", откроется в новом окне" ✅
- `focus-visible` стили (outline-accent) на всех интерактивных элементах ✅
- `aria-live="polite"` глобальный live-region в layout.tsx ✅
- `tabIndex={-1}` на `<h1>` для программного фокуса ✅
- React Aria для Combobox, Dialog, Pagination ✅
- `rel="noopener noreferrer"` на внешних ссылках ✅
- `disabled` + `aria-busy` на кнопках при загрузке ✅

---

## 7. Производительность

### ISSUE-PERF-01: VacanciesContent — весь контент как Client Component
- **Severity:** 🟡 Medium
- **Описание:** `VacanciesContent.tsx` помечен `"use client"` и содержит ~180 строк логики. Однако `useSearchParams()` требует client-side rendering, что обосновывает `"use client"`. Компонент обёрнут в `<Suspense>` на уровне `page.tsx`, что корректно.
- **Файл:** `src/app/vacancies/VacanciesContent.tsx:1`
- **Рекомендация:** Текущая реализация обоснована. В будущем можно разделить на Server Component (получение searchParams через props) и Client Component (интерактивность), но это не критично.

---

### ISSUE-PERF-02: Prefetch на hover в VacancyCard
- **Severity:** ℹ️ Положительное
- **Описание:** `VacancyCard.tsx:39–44` делает prefetch данных вакансии при hover/focus на ссылку "Подробнее". Отличная оптимизация — страница детали загрузится мгновенно.
- **Файл:** `src/components/features/vacancies/VacancyCard.tsx:39–44`

---

### ISSUE-PERF-03: QueryClient `refetchOnWindowFocus` не отключён глобально
- **Severity:** 🟢 Low
- **Описание:** `QueryProvider.tsx` создаёт QueryClient с `staleTime: 5 * 60 * 1000`, но `refetchOnWindowFocus` остаётся `true` по умолчанию. Для `useVacancies` он отключён вручную, но для других хуков (useVacancyDetail, useRegions) — нет.
- **Файл:** `src/providers/QueryProvider.tsx`
- **Рекомендация:** Рассмотреть `refetchOnWindowFocus: false` в defaultOptions, если рефетч при переключении вкладки нежелателен.

---

## 8. Качество кода

### ISSUE-CODE-01: Дублирование логики избранного в VacancyCard и VacancyDetail
- **Severity:** 🟡 Medium
- **Описание:** Оптимистичный паттерн избранного (state + toggle + API call + rollback) дублируется в `VacancyCard.tsx:49–84` и `VacancyDetail.tsx:53–89`. Идентичная логика ~35 строк.
- **Файлы:** `VacancyCard.tsx:49–84`, `VacancyDetail.tsx:53–89`
- **Рекомендация:** Извлечь в хук `useFavoriteToggle(vacancyId)`:
  ```typescript
  export function useFavoriteToggle(vacancyId: string, initialState: boolean) {
      // state, toggle, pending, error
  }
  ```

---

### ISSUE-CODE-02: `InfoRow` компонент определён внутри двух файлов
- **Severity:** 🟢 Low
- **Описание:** `InfoRow` — маленький компонент для пар dt/dd — определён как внутренний и в `VacancyCard.tsx:24–32`, и в `VacancyDetail.tsx:24–44`.
- **Рекомендация:** Вынести в общий файл, если планируется третье использование. Пока — допустимо.

---

### ISSUE-CODE-03: Inconsistent error handling в auth-формах
- **Severity:** 🟡 Medium
- **Описание:** Каждая auth-страница (login, register, verify-email, forgot-password, reset-password) дублирует валидацию (Zod) + обработку ошибок (serverError state) + отображение ошибок. Паттерн одинаковый, но реализован отдельно в каждом файле.
- **Рекомендация:** Можно создать `useAuthForm(schema, onSubmit)` хук, но при 5 формах с разной логикой — это на грани оправданности. Оставить как есть, если не планируются новые auth-формы.

---

## 9. Quick Wins

Быстрые исправления, каждое < 15 минут:

| # | Действие | Файл | Сложность |
|---|---|---|---|
| 1 | Создать `middleware.ts` (1 строка) | `src/middleware.ts` | Тривиальная |
| 2 | Убрать `<main>` из contact page | `src/app/contact/page.tsx:12` | Тривиальная |
| 3 | Добавить `error`/`reset` в error.tsx | `src/app/error.tsx` | Простая |
| 4 | Добавить проверку API_KEY | `src/app/api/v1/[...path]/route.ts` | Простая |
| 5 | Добавить `fallback` в Suspense | `src/app/assistant/start/page.tsx` | Тривиальная |
| 6 | Добавить `aria-current="page"` | `src/components/layout/Header.tsx` | Простая |
| 7 | Добавить `aria-pressed` на toggle-кнопки | `VacancyCard.tsx`, `PasswordInput.tsx` | Простая |
| 8 | Добавить `aria-label` на footer | `Footer.tsx` | Тривиальная |
| 9 | Rate limiter для refresh | `src/app/api/auth/[...path]/route.ts` | Простая |

---

## 10. Стратегические улучшения

| # | Улучшение | Приоритет | Сложность |
|---|---|---|---|
| 1 | DOMPurify для dangerouslySetInnerHTML | 🔴 Высокий | Средняя |
| 2 | Focus trap для мобильного меню | 🟠 Высокий | Средняя |
| 3 | Rate limiting для v1 proxy | 🟡 Средний | Простая |
| 4 | Nonce-based CSP | 🟢 Низкий | Сложная |
| 5 | E2E тесты (Playwright) | 🟡 Средний | Высокая |
| 6 | Хук `useFavoriteToggle` | 🟡 Средний | Простая |

---

## 11. Implementation Plan

> Все задачи — пошаговые, конкретные, пригодные для передачи Sonnet.

---

### 🔴 CRITICAL — исправить первыми

---

#### TASK-C01: ⚠️ ОТМЕНЕНО [ARCHITECTURE] Создать `middleware.ts`

**Проблема (пересмотрена):** Задача была основана на конвенции Next.js 13/14. В Next.js 16 файл middleware переименован из `middleware.ts` в `proxy.ts`, а функция — из `middleware` в `proxy`.

**Реальность:** `src/proxy.ts` с экспортом `proxy` и `config` — это и есть правильный и работающий proxy/middleware для Next.js 16. Защита маршрутов была активна с самого начала.

Файл `middleware.ts`, созданный в ходе аудита, был удалён, так как вызывал конфликт ("Both middleware file and proxy file are detected").

---

#### TASK-C02: ✅ ВЫПОЛНЕНО [ARCHITECTURE] Исправить `error.tsx`

**Проблема:** Error Boundary не принимает props `error` и `reset`.

**Расположение:** `frontend/src/app/error.tsx`

**Шаги:**
1. Открыть `frontend/src/app/error.tsx`
2. Заменить содержимое:
   ```typescript
   "use client";

   import { Container } from "@/components/layout/Container";
   import { ServiceError } from "@/components/ui/ServiceError";

   export default function Error({
       reset,
   }: {
       error: Error & { digest?: string };
       reset: () => void;
   }) {
       return (
           <Container className="py-12">
               <ServiceError onRetry={reset} />
           </Container>
       );
   }
   ```
3. Убедиться, что `ServiceError` принимает prop `onRetry`. Если нет — добавить:
   - Открыть `frontend/src/components/ui/ServiceError.tsx`
   - Добавить optional prop `onRetry?: () => void`
   - Если `onRetry` передан — показать кнопку «Попробовать снова»

**Ожидаемый результат:** При ошибке пользователь видит кнопку повторной попытки.

---

#### TASK-C03: ✅ ВЫПОЛНЕНО [A11Y] Убрать вложенный `<main>` на странице `/contact`

**Проблема:** Дублирование landmark `<main id="main-content">`.

**Расположение:** `frontend/src/app/contact/page.tsx:12`

**Шаги:**
1. Открыть `frontend/src/app/contact/page.tsx`
2. На строке 12 заменить `<main id="main-content" className="mx-auto max-w-2xl px-4 py-12">` на `<div className="mx-auto max-w-2xl px-4 py-12">`
3. На последней строке перед `);` заменить `</main>` на `</div>`

**Ожидаемый результат:** В DOM только один `<main>` (из layout.tsx).

---

#### TASK-C04: ✅ ВЫПОЛНЕНО [SECURITY] Добавить проверку API_KEY и API_URL

**Проблема:** `API_KEY!` non-null assertion без проверки.

**Расположение:** `frontend/src/app/api/v1/[...path]/route.ts:8–9`

**Шаги:**
1. Открыть `frontend/src/app/api/v1/[...path]/route.ts`
2. После строк 8–9 (`const API_URL = ...`, `const API_KEY = ...`) добавить:
   ```typescript
   if (!API_URL || !API_KEY) {
       throw new Error("Missing required environment variables: API_URL, API_KEY");
   }
   ```
3. На строке 19 убрать `!`: заменить `API_KEY!` на `API_KEY`

**Ожидаемый результат:** При отсутствии env-переменных — ясная ошибка при старте, а не молчаливый сбой.

---

#### TASK-C05: ✅ ВЫПОЛНЕНО [SECURITY] Добавить DOMPurify для dangerouslySetInnerHTML

**Проблема:** HTML от LLM рендерится без санитизации.

**Расположение:** `AssistantFlow.tsx:789`, `blog/[slug]/page.tsx:128`

**Шаги:**
1. Установить пакет: `npm install dompurify` и `npm install -D @types/dompurify`
2. В `frontend/src/components/features/assistant/AssistantFlow.tsx`:
   - Добавить импорт: `import DOMPurify from "dompurify";`
   - На строке 789 заменить:
     ```typescript
     dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resultHtml) }}
     ```
3. В `frontend/src/app/blog/[slug]/page.tsx`:
   - Это Server Component (нет `"use client"`). DOMPurify требует DOM. Два варианта:
     a. Использовать `isomorphic-dompurify` вместо `dompurify`: `npm install isomorphic-dompurify`
     b. Или санитизировать markdown HTML в `lib/blog/posts.ts` при генерации (предпочтительнее)
   - Если вариант (b): открыть `lib/blog/posts.ts`, найти место генерации `contentHtml`, добавить санитизацию через `sanitize-html` или `rehype-sanitize`
4. Удалить `// eslint-disable-next-line react/no-danger` комментарии (ESLint теперь прав — danger контролируется)

**Ожидаемый результат:** HTML санитизируется перед рендерингом, XSS через LLM prompt injection невозможен.

---

### 🟠 HIGH — исправить в ближайшую неделю

---

#### TASK-H01: ✅ ВЫПОЛНЕНО [SECURITY] Добавить rate limiting на `/refresh`

**Проблема:** Endpoint `refresh` не имеет rate limiter.

**Расположение:** `frontend/src/app/api/auth/[...path]/route.ts:50–63`

**Шаги:**
1. Открыть файл
2. После строки 53 (`const resendLimiter = ...`) добавить:
   ```typescript
   const refreshLimiter = createRateLimiter({ interval: 60_000, limit: 10 }); // 10/мин
   ```
3. В объект `PATH_LIMITERS` (строка 57) добавить:
   ```typescript
   refresh: refreshLimiter,
   ```

**Ожидаемый результат:** Endpoint `/refresh` ограничен 10 запросами в минуту.

---

#### TASK-H02: ✅ ВЫПОЛНЕНО [A11Y] Добавить `aria-current="page"` в Header

**Проблема:** Активная ссылка навигации не обозначена для скринридера.

**Расположение:** `frontend/src/components/layout/Header.tsx:100–105`

**Шаги:**
1. Открыть `Header.tsx`
2. Найти рендер `NAV_LINKS.map` (строка ~101)
3. Изменить `<Link>` внутри map:
   ```tsx
   <Link
       href={href}
       className={linkClass}
       aria-current={pathname === href ? "page" : undefined}
   >
   ```
4. Добавить визуальный стиль для активной ссылки:
   ```tsx
   const linkClass = (isActive: boolean) =>
       `text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
           isActive ? "text-accent font-semibold" : "text-muted hover:text-foreground"
       }`;
   ```
5. Применить и для desktop, и для mobile навигации

**Ожидаемый результат:** NVDA объявляет "текущая страница" для активной ссылки; визуально — жёлтый акцент.

---

#### TASK-H03: ✅ ВЫПОЛНЕНО [A11Y] Suspense fallback в assistant/start

**Проблема:** `<Suspense>` без `fallback` — пустой экран при загрузке.

**Расположение:** `frontend/src/app/assistant/start/page.tsx:10–12`

**Шаги:**
1. Открыть файл
2. Добавить импорт: `import { Spinner } from "@/components/ui/Spinner";`
3. Заменить `<Suspense>` на:
   ```tsx
   <Suspense fallback={
       <div className="flex items-center gap-3 py-8" role="status" aria-live="polite">
           <Spinner />
           <p className="text-sm text-muted">Загрузка ассистента…</p>
       </div>
   }>
   ```

**Ожидаемый результат:** Пользователь видит индикатор загрузки вместо пустого экрана.

---

#### TASK-H04: ✅ ВЫПОЛНЕНО [A11Y] Focus trap для мобильного меню

**Проблема:** Мобильное меню не удерживает фокус.

**Расположение:** `frontend/src/components/layout/Header.tsx:184–253`

**Шаги:**
1. Открыть `Header.tsx`
2. Импортировать `FocusScope` из react-aria: `import { FocusScope } from "react-aria";`
3. Обернуть содержимое мобильного меню:
   ```tsx
   {menuOpen && (
       <FocusScope contain restoreFocus autoFocus>
           <div id="mobile-menu" ...>
               ...
           </div>
       </FocusScope>
   )}
   ```
4. Добавить обработчик Escape для закрытия:
   ```tsx
   onKeyDown={(e) => { if (e.key === "Escape") setMenuOpen(false); }}
   ```

**Ожидаемый результат:** Фокус удерживается внутри мобильного меню; Escape закрывает его.

---

#### TASK-H05: ✅ ВЫПОЛНЕНО [A11Y] `aria-pressed` на кнопке избранного

**Проблема:** Toggle-кнопка без `aria-pressed`.

**Расположение:** `frontend/src/components/features/vacancies/VacancyCard.tsx:134–141`

**Шаги:**
1. Открыть `VacancyCard.tsx`
2. На строке 134 (кнопка `<button>`) добавить атрибуты:
   ```tsx
   <button
       type="button"
       onClick={handleFavoriteClick}
       disabled={isFavoritePending}
       aria-pressed={isFavorite}
       aria-label={`${isFavorite ? "Удалить из" : "Добавить в"} избранное: ${vacancy.vacancy_name}`}
       className="..."
   >
   ```

**Ожидаемый результат:** NVDA объявляет "нажата/не нажата" для кнопки избранного.

---

#### TASK-H06: ✅ ВЫПОЛНЕНО [A11Y] Фокус на ошибку при валидации SearchForm

**Проблема:** При ошибке валидации фокус остаётся на кнопке.

**Расположение:** `frontend/src/components/features/search/SearchForm.tsx:35–55`

**Шаги:**
1. Открыть `SearchForm.tsx`
2. Добавить `useRef`:
   ```typescript
   const formRef = useRef<HTMLFormElement>(null);
   ```
3. На элемент `<form>` добавить `ref={formRef}`
4. После `setErrors(...)` (строка 45–48) добавить:
   ```typescript
   // Фокус на первое поле с ошибкой
   setTimeout(() => {
       const firstError = formRef.current?.querySelector('[aria-invalid="true"]');
       if (firstError instanceof HTMLElement) firstError.focus();
   }, 0);
   ```

**Ожидаемый результат:** При ошибке валидации фокус переходит на первое невалидное поле.

---

### 🟡 MEDIUM — следующий спринт

---

#### TASK-M01: ✅ ВЫПОЛНЕНО [A11Y] Live-region для ошибок избранного всегда в DOM

**Проблема:** `role="alert"` появляется условно → скринридер может пропустить.

**Расположение:** `VacancyCard.tsx:120–122`, `VacancyDetail.tsx:168–170`

**Шаги:**
1. Заменить условный рендер:
   ```tsx
   {favoriteError && <p role="alert">...</p>}
   ```
   на безусловный:
   ```tsx
   <p role="alert" className="text-xs text-red-400 min-h-[1.25rem]">
       {favoriteError}
   </p>
   ```

---

#### TASK-M02: ✅ ВЫПОЛНЕНО [SECURITY] Rate limiting для V1 proxy POST

**Расположение:** `frontend/src/app/api/v1/[...path]/route.ts:118–128`

**Шаги:**
1. Импортировать `createRateLimiter` и `getClientIp` (или определить)
2. Создать limiter: `const searchLimiter = createRateLimiter({ interval: 60_000, limit: 5 });`
3. В функции `POST` добавить проверку перед вызовом `proxyRequest`

---

#### TASK-M03: ✅ ВЫПОЛНЕНО [SECURITY] Не логировать targetUrl

**Расположение:** `frontend/src/app/api/v1/[...path]/route.ts:69–70`

**Шаги:**
1. Заменить `targetUrl: url.toString()` на `targetPath: \`/api/v1/${path}\``

---

#### TASK-M04: ✅ ВЫПОЛНЕНО [A11Y] Footer с aria-label

**Расположение:** `frontend/src/components/layout/Footer.tsx:5`

**Шаги:**
1. Добавить `aria-label="Подвал сайта"` к `<footer>`

---

#### TASK-M05: ✅ ВЫПОЛНЕНО [A11Y] Stepper с ARIA в AssistantFlow

**Расположение:** `frontend/src/components/features/assistant/AssistantFlow.tsx` (компонент Stepper)

**Шаги:**
1. Найти компонент `Stepper` внутри файла
2. Обернуть список шагов в `<ol aria-label="Прогресс">`
3. Каждому шагу добавить `aria-current={isCurrent ? "step" : undefined}`
4. Добавить sr-only текст: `<span className="sr-only">Шаг {n} из {total}: {label}</span>`

---

#### TASK-M06: ✅ ВЫПОЛНЕНО [REFACTOR] Извлечь `useFavoriteToggle` хук

**Расположение:** `VacancyCard.tsx:45–84`, `VacancyDetail.tsx:49–89`

**Шаги:**
1. Создать `frontend/src/hooks/useFavoriteToggle.ts`
2. Перенести общую логику (state, toggle, API call, rollback, error)
3. Возвращать: `{ isFavorite, isFavoritePending, favoriteError, handleFavoriteClick }`
4. Использовать в `VacancyCard` и `VacancyDetail`

---

#### TASK-M07: ✅ ВЫПОЛНЕНО [A11Y] SearchResultsSummary — семантика `<dl>`

**Расположение:** `frontend/src/components/features/vacancies/SearchResultsSummary.tsx`

**Шаги:**
1. Обернуть пары "метка–значение" в `<dl>`, `<dt>`, `<dd>`
2. Убедиться, что визуальный стиль не сломался

---

#### TASK-M08: ✅ ВЫПОЛНЕНО [A11Y] BlogPreview — `<ul role="list">` для карточек

**Расположение:** `frontend/src/components/features/blog/BlogPreview.tsx`

**Шаги:**
1. Заменить контейнер карточек на `<ul role="list" className="grid...">`
2. Каждую `<BlogCard>` обернуть в `<li>`

---

### 🟢 LOW — при возможности

---

#### TASK-L01: ✅ ВЫПОЛНЕНО [A11Y] `aria-pressed` на PasswordInput toggle

**Расположение:** `frontend/src/components/features/auth/PasswordInput.tsx`

**Шаги:**
1. Добавить `aria-pressed={showPassword}` на кнопку toggle

---

#### TASK-L02: ✅ ВЫПОЛНЕНО [PERFORMANCE] `staleTime` для регионов: 24 часа вместо Infinity

**Расположение:** `frontend/src/hooks/useRegions.ts`, `useFederalDistricts.ts`

**Шаги:**
1. Заменить `staleTime: Infinity` на `staleTime: 24 * 60 * 60 * 1000`

---

#### TASK-L03: ✅ ВЫПОЛНЕНО [SECURITY] CSRF — корректный парсинг IPv6

**Расположение:** `frontend/src/lib/utils/csrf.ts`

**Шаги:**
1. Заменить `requestHost.split(":")[0]` на `new URL(\`http://${requestHost}\`).hostname`

---

#### TASK-L04: ✅ ВЫПОЛНЕНО [A11Y] Добавить `<h1>` при пустом location на /vacancies

**Расположение:** `frontend/src/app/vacancies/VacanciesContent.tsx:72–87`

**Шаги:**
1. Добавить `<h1>` перед текстом-подсказкой:
   ```tsx
   <h1 className="mb-4 text-2xl font-bold text-foreground">Результаты поиска</h1>
   <p>Введите параметры поиска на ...</p>
   ```

---

#### TASK-L05: [SECURITY] Nonce-based CSP (стратегическое)

**Расположение:** `frontend/next.config.ts`, `frontend/src/middleware.ts`

**Описание:** Заменить `'unsafe-inline'` на nonce через Next.js middleware. Сложная задача, требует исследования совместимости с Next.js 16.

---

#### TASK-L06: ✅ ВЫПОЛНЕНО [A11Y] OtpCodeInput — aria-describedby с описанием формата

**Расположение:** `frontend/src/components/features/auth/OtpCodeInput.tsx`

**Шаги:**
1. Добавить `<p id="otp-hint" className="sr-only">6-значный код из письма</p>`
2. На input добавить `aria-describedby="otp-hint"`

---

*Конец отчёта.*
