# Работа для всех — Техническая документация фронтенда

> Единый источник знаний о проекте. Отражает **актуальное** состояние кодовой базы.

---

## Содержание

1. [Обзор проекта](#1-обзор-проекта)
2. [Стек технологий](#2-стек-технологий)
3. [Архитектурные решения](#3-архитектурные-решения)
4. [Структура проекта](#4-структура-проекта)
5. [Маршруты и страницы](#5-маршруты-и-страницы)
6. [Дизайн-система](#6-дизайн-система)
7. [Аутентификация](#7-аутентификация)
8. [API интеграция](#8-api-интеграция)
9. [ИИ-ассистент Вера](#9-ии-ассистент-вера)
10. [Управление состоянием](#10-управление-состоянием)
11. [Доступность (WCAG 2.2 AA)](#11-доступность-wcag-22-aa)
12. [Безопасность](#12-безопасность)
13. [Переменные окружения](#13-переменные-окружения)
14. [Запуск и сборка](#14-запуск-и-сборка)
15. [Запланированные доработки](#15-запланированные-доработки)
16. [Приложение: Типы TypeScript](#16-приложение-типы-typescript)
17. [Приложение: Справочник эндпоинтов API](#17-приложение-справочник-эндпоинтов-api)
18. [Стратегический план: Агент Вера (Итерация 2)](#18-стратегический-план-агент-вера-итерация-2)
19. [Концепция: Собственная платформа вакансий (Итерация 3+)](#19-концепция-собственная-платформа-вакансий-итерация-3)

---

## 1. Обзор проекта

**"Работа для всех"** — платформа поиска вакансий с приоритетом доступности для людей
с ограниченными возможностями здоровья. Агрегирует вакансии из двух источников:
**hh.ru** и **Работа России (trudvsem.ru)**.

**Целевая аудитория:** люди, использующие скринридеры (NVDA, JAWS, VoiceOver),
экранные лупы, клавиатурную навигацию.

**Ключевые принципы:**
- Доступность — не опция, а требование
- Безопасность по умолчанию (httpOnly cookies, API-ключи только на сервере)
- Минимальный клиентский JavaScript (React Server Components где возможно)

---

## 2. Стек технологий

| Инструмент | Версия | Назначение |
|---|---|---|
| **Next.js** | 16.x | App Router, SSR, API-routes, middleware |
| **React** | 19.x | UI |
| **TypeScript** | 5.x | Типобезопасность, зеркало Pydantic-схем |
| **Tailwind CSS** | 4.x | Утилитарные стили, PostCSS |
| **React Aria Components** | 1.15.x | Headless accessible UI (Select, Dialog, Combobox) |
| **TanStack Query** | 5.x | Серверное состояние, кеш, пагинация |
| **Zustand** | 5.x | Минимальный глобальный стейт |
| **react-hook-form** | 7.x | Формы |
| **Zod** | 3.x | Валидация схем |
| **clsx + tailwind-merge** | — | Условные CSS-классы |
| **Vitest + RTL** | 3.x / 16.x | Тестирование |

---

## 3. Архитектурные решения

### Proxy Pattern (обязательно)

Браузер никогда не общается с бэкендами напрямую:

```
Браузер → Next.js Route Handler → FastAPI бэкенд
```

- **`/api/auth/[...path]`** — проксирует запросы к `AUTH_API_URL`.
  Перехватывает токены, кладёт в `httpOnly` cookies. Никогда не отдаёт
  `access_token` или `refresh_token` в тело ответа клиенту.
- **`/api/v1/[...path]`** — проксирует запросы к `API_URL`.
  Подставляет `X-API-Key` из серверной переменной окружения.
  Передаёт `Authorization: Bearer` из cookies пользователя.

**Почему:** API-ключи и JWT никогда не попадают в браузерный JS, недоступны
через `localStorage`/`document.cookie` из скриптов (httpOnly).

### Хранение токенов

| Токен | Хранилище | MaxAge |
|---|---|---|
| `access_token` | `httpOnly` cookie | 1 час (3600 с) |
| `refresh_token` | `httpOnly` cookie | 30 дней |

**JWT декодируется на прокси-уровне** (без криптоверификации — бэкенд уже верифицировал).
Из payload извлекаются `sub` (email) и `username`, которые возвращаются клиенту
как `{ user: { email, username } }`.

### Авто-обновление токена

При получении `401` API-клиент автоматически вызывает `POST /api/auth/refresh`,
получает новый `access_token` и повторяет исходный запрос.

### Состояние: иерархия

1. **React Server Components** — по умолчанию для статичного контента
2. **TanStack Query** — серверное состояние (вакансии, регионы, избранное)
3. **Zustand** — только минимальный глобальный клиентский стейт
4. **react-hook-form** — состояние форм
5. **useState** — локальный UI-стейт компонентов

### Middleware

Файл: `src/proxy.ts` — содержит middleware логику и экспортирует `proxy` и `config`.

**Важно:** Next.js требует файл `src/middleware.ts` с экспортом `middleware`.
Если middleware не работает — убедиться, что `src/middleware.ts` существует и экспортирует из `proxy.ts`:
```typescript
export { proxy as middleware, config } from "./proxy";
```

---

## 4. Структура проекта

```
frontend/src/
├── app/
│   ├── layout.tsx                    # Корневой макет, провайдеры, шапка/подвал
│   ├── page.tsx                      # Главная: форма поиска
│   ├── error.tsx                     # Глобальный error boundary
│   ├── not-found.tsx                 # 404
│   ├── loading.tsx                   # Глобальный fallback загрузки
│   ├── globals.css                   # CSS-переменные темы, базовые стили
│   ├── vacancies/
│   │   ├── page.tsx                  # Обёртка с Suspense
│   │   ├── VacanciesContent.tsx      # Client component: результаты поиска
│   │   └── [id]/page.tsx             # Детальная страница вакансии
│   ├── favorites/
│   │   ├── page.tsx                  # Избранное (защищённый маршрут)
│   │   └── [id]/page.tsx             # Детальная страница из избранного
│   ├── blog/
│   │   ├── page.tsx                  # Список статей блога
│   │   └── [slug]/page.tsx           # Статья блога (markdown)
│   ├── contact/
│   │   └── page.tsx                  # Форма обратной связи
│   ├── assistant/
│   │   └── page.tsx                  # ИИ-ассистент Вера (требует ?vacancy_id=)
│   ├── auth/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── verify-email/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   └── api/
│       ├── auth/[...path]/route.ts   # Auth прокси (httpOnly cookies)
│       └── v1/[...path]/route.ts     # Vacancies прокси (X-API-Key)
│
├── components/
│   ├── ui/                           # Базовая дизайн-система
│   │   ├── Button.tsx                # Кнопка с variant: primary | secondary
│   │   ├── SourceBadge.tsx           # Бейдж источника вакансии (hh.ru / Работа России)
│   │   ├── Modal.tsx                 # Модальное окно (React Aria)
│   │   ├── Pagination.tsx            # Пагинация (React Aria)
│   │   ├── Spinner.tsx               # Анимация загрузки (Брайль-точки)
│   │   ├── EmptyState.tsx            # Состояние пустого списка
│   │   ├── ErrorMessage.tsx          # Отображение ошибки поля
│   │   ├── ServiceError.tsx          # Ошибка сервиса (уровень страницы)
│   │   └── SkipLink.tsx              # "Перейти к содержимому"
│   ├── layout/
│   │   ├── Header.tsx                # Навигация, кнопка Войти/Выйти
│   │   ├── Footer.tsx
│   │   └── Container.tsx             # max-w-5xl обёртка
│   └── features/
│       ├── auth/                     # Компоненты auth-форм
│       │   ├── AuthFormLayout.tsx
│       │   ├── PasswordInput.tsx     # Инпут с показом/скрытием пароля
│       │   ├── OtpCodeInput.tsx      # Поле ввода OTP-кода
│       │   ├── AuthErrorMessage.tsx  # Серверные ошибки
│       │   ├── SubmitButton.tsx      # Кнопка отправки с состоянием загрузки
│       │   └── index.ts              # Barrel-export
│       ├── search/
│       │   ├── SearchForm.tsx        # Форма поиска (регион + город)
│       │   ├── SearchModal.tsx       # Модальное окно процесса поиска
│       │   ├── RegionCombobox.tsx    # Combobox выбора региона (React Aria)
│       │   ├── RegionSelect.tsx
│       │   └── LocationInput.tsx     # Поле ввода города
│       ├── vacancies/
│       │   ├── VacancyCard.tsx       # Карточка в списке результатов
│       │   ├── VacancyDetail.tsx     # Детальная карточка вакансии
│       │   ├── VacancyList.tsx       # Список карточек + пагинация
│       │   ├── VacancyFilters.tsx    # Фильтры по источнику и ключевому слову
│       │   └── SearchResultsSummary.tsx # Блок сводки по поиску
│       ├── favorites/
│       │   └── FavoritesList.tsx     # Список избранного
│       ├── blog/
│       │   ├── BlogCard.tsx          # Карточка статьи в списке
│       │   └── BlogPreview.tsx       # Превью статьи
│       ├── feedback/
│       │   └── FeedbackForm.tsx      # Форма обратной связи
│       ├── home/
│       │   └── FeatureCards.tsx      # Блок фич на главной странице
│       └── assistant/
│           └── AssistantFlow.tsx     # Мастер ИИ-ассистента (многошаговый)
│
├── hooks/
│   ├── useAuth.ts                    # Гидратация auth-стейта при монтировании
│   ├── useLogin.ts
│   ├── useRegister.ts
│   ├── useVerifyEmail.ts
│   ├── useResendCode.ts
│   ├── useLogout.ts
│   ├── useForgotPassword.ts
│   ├── useResetPassword.ts
│   ├── useVacancies.ts               # Список вакансий (TanStack Query, keepPreviousData)
│   ├── useVacancyDetail.ts           # Детали вакансии
│   ├── useVacancySearch.ts           # Мутация поиска (POST /search)
│   ├── useFavorites.ts               # Список + add/remove избранного
│   ├── useFavoriteVacancyDetail.ts   # Детали вакансии со страницы избранного
│   ├── useRegions.ts                 # Регионы по коду округа
│   └── useFederalDistricts.ts        # Федеральные округа
│
├── lib/
│   ├── api/
│   │   ├── client.ts                 # Базовый ApiClient, авто-рефреш 401
│   │   ├── auth.ts                   # authApi (register, login, verify...)
│   │   ├── vacancies.ts              # vacanciesApi (search, getList, getById)
│   │   ├── regions.ts                # regionsApi
│   │   ├── favorites.ts              # favoritesApi (getList, add, remove)
│   │   ├── assistant.ts              # assistantApi (6 эндпоинтов ИИ)
│   │   └── index.ts                  # Barrel-export
│   ├── constants/
│   │   └── auth-errors.ts            # Маппинг EN→RU ошибок бэкенда
│   ├── schemas/
│   │   ├── auth.ts                   # Zod-схемы форм аутентификации
│   │   ├── search.ts                 # Zod-схема формы поиска
│   │   └── __tests__/auth.test.ts    # Тесты Zod-схем
│   └── utils/
│       ├── cn.ts                     # clsx + twMerge
│       ├── redirect.ts               # getSafeRedirect() — защита от open redirect
│       ├── csrf.ts                   # CSRF-валидация Origin
│       ├── proxy.ts                  # Утилиты для route handlers
│       ├── rate-limit.ts             # In-memory rate limiter
│       ├── logger.ts                 # Структурированный JSON-логгер
│       ├── request-id.ts             # X-Request-ID
│       ├── validation.ts             # zodFieldErrors()
│       └── __tests__/               # Тесты утилит (redirect, csrf, rate-limit)
│
├── stores/
│   ├── auth.ts                       # Zustand: user, isAuthenticated, isLoading
│   └── search.ts                     # Zustand + sessionStorage persist: summary
│
├── types/
│   ├── vacancy.ts                    # Vacancy (единая), VacancyOut/VacancyDetail (aliases)
│   ├── assistant.ts                  # Question, QuestionnaireResponse, QuestionAnswer...
│   ├── auth.ts                       # AuthUser, LoginRequest, RegisterRequest...
│   ├── favorites.ts                  # FavoriteVacanciesList, VacancyAddFavorite
│   ├── region.ts                     # Region, FederalDistrict
│   ├── api.ts                        # MessageResponse
│   └── index.ts                      # Barrel-export
│
├── providers/
│   ├── QueryProvider.tsx             # TanStack Query Provider
│   └── AuthProvider.tsx              # Вызывает useAuth при монтировании
│
├── proxy.ts                          # Middleware логика (защищённые и auth маршруты)
└── test/setup.ts                     # Vitest + jsdom setup
```

---

## 5. Маршруты и страницы

| Маршрут | Компонент | Доступ | Описание |
|---|---|---|---|
| `/` | `app/page.tsx` | Все | Форма поиска вакансий |
| `/vacancies` | `VacanciesContent.tsx` | Все | Результаты поиска с пагинацией |
| `/vacancies/[id]` | `app/vacancies/[id]/page.tsx` | Все | Детальная страница вакансии |
| `/favorites` | `app/favorites/page.tsx` | Только авторизованные | Избранные вакансии |
| `/favorites/[id]` | `app/favorites/[id]/page.tsx` | Только авторизованные | Детальная страница из избранного |
| `/blog` | `app/blog/page.tsx` | Все | Список статей блога |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx` | Все | Статья блога |
| `/contact` | `app/contact/page.tsx` | Все | Форма обратной связи |
| `/assistant` | `app/assistant/page.tsx` | Все | ИИ-ассистент Вера (через `?vacancy_id=`) |
| `/auth/login` | `app/auth/login/page.tsx` | Только гости | Вход |
| `/auth/register` | `app/auth/register/page.tsx` | Только гости | Регистрация |
| `/auth/verify-email` | `app/auth/verify-email/page.tsx` | Только гости | Подтверждение email |
| `/auth/forgot-password` | `app/auth/forgot-password/page.tsx` | Только гости | Запрос сброса пароля |
| `/auth/reset-password` | `app/auth/reset-password/page.tsx` | Только гости | Новый пароль |

### Middleware (`src/middleware.ts`)

```typescript
const PROTECTED_PATHS = ["/favorites"];      // → редирект на /auth/login?redirect=...
const AUTH_PATHS = ["/auth/login", ...];     // → редирект на / если уже авторизован
```

Middleware проверяет наличие cookie `access_token`. Matcher: `/favorites/:path*`, `/auth/:path*`.

### Поиск вакансий — сценарий

1. Пользователь выбирает регион и вводит город на `/`
2. `SearchForm` показывает `SearchModal` с анимацией загрузки
3. Вызывается `POST /api/v1/vacancies/search` — сводные данные сохраняются в `useSearchStore`
4. При успехе — редирект на `/vacancies?location=...&region_code=...`
5. Модальное окно остаётся открытым (спиннер) до завершения перехода — без мерцания
6. На `/vacancies` `useVacancies` загружает список через `GET /api/v1/vacancies/list`
7. `SearchResultsSummary` читает сводку из `useSearchStore` (sessionStorage — переживает F5)

---

## 6. Дизайн-система

### Цветовая схема (тёмная тема)

| Переменная | Значение | Использование |
|---|---|---|
| `--color-background` | `#0A0A0A` | Фон страницы |
| `--color-surface` | `~#111` | Фон карточек |
| `--color-accent` | `#F5B800` | Жёлтый акцент, кнопки primary |
| `--color-foreground` | `#F5F5F5` | Основной текст |
| `--color-muted` | `~#888` | Вторичный текст, лейблы |
| `--color-border` | `~#333` | Границы |

### Глянцевый стиль карточек

Все карточки (вакансии, избранное) используют:

```css
rounded-lg border border-white/20 bg-surface
bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_35%)]
p-6
```

Эффект: полупрозрачная рамка "стекла" + радиальный блик в верхнем левом углу.

### Структура карточки вакансии

```
<article aria-labelledby="...">
  <h2> Название вакансии
  <hr className="border-t-2 border-accent">     ← жёлтый разделитель
  <dl>
    <dt>Источник:</dt>  <dd>hh.ru</dd>
    <dt>Зарплата:</dt>  <dd>...</dd>
    <dt>Работодатель:</dt> <dd>...</dd>
  </dl>
  <p> Описание (300 символов с обрезкой)
  <div> Кнопки: Подробнее | В избранное | Открыть на ...
</article>
```

### Компонент `Button` (`components/ui/Button.tsx`)

Единый стиль кнопок для всего приложения:

```typescript
// Для <button> элементов:
<Button variant="secondary">Войти</Button>
<Button variant="primary">Сохранить</Button>

// Для <a> и <Link> элементов:
import { btnClass } from "@/components/ui/Button";
<Link href="..." className={btnClass()}>Подробнее</Link>
<a href="..." className={btnClass("primary")}>...</a>
```

| Вариант | Вид |
|---|---|
| `secondary` (по умолчанию) | Прозрачный, жёлтая рамка, жёлтый текст |
| `primary` | Сплошной жёлтый фон, тёмный текст |

### Spinner (анимация загрузки)

Пять точек Брайля — анимация символизирует ожидание при длительных запросах
(поиск по hh.ru + Работа России занимает > 1 минуты).

### Email-шаблоны (OTP)

Файл: `backend/src/utils/send_otp_code/message_template.py`

Оба шаблона (`VERIFICATION_MESSAGE`, `PASSWORD_RESET_MESSAGE`) выполнены в фирменном стиле:
- Тёмный фон `#0A0A0A`, карточка `#111111`
- Жёлтая полоска сверху + жёлтый блок с OTP-кодом в monospace
- Декоративный текст в шрифте Брайля
- `VERIFICATION_MESSAGE`: блок с промо ИИ-ассистента Веры
- `PASSWORD_RESET_MESSAGE`: блок безопасности с красным акцентом
- Table-based layout (совместимость с email-клиентами, без flex/grid)

---

## 7. Аутентификация

### Эндпоинты auth-бэкенда

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/auth/register` | Регистрация → `{ msg: string }` |
| `POST` | `/api/auth/login` | Вход → cookies + `{ user }` |
| `POST` | `/api/auth/verify-email` | Подтверждение email → cookies + `{ user }` |
| `POST` | `/api/auth/resend-code` | Повтор кода → `{ msg: string }` |
| `POST` | `/api/auth/logout` | Выход (Bearer из cookie) |
| `POST` | `/api/auth/refresh` | Обновление токена (refresh из cookie) |
| `POST` | `/api/auth/forgot-password` | Запрос сброса → `{ msg: string }` |
| `POST` | `/api/auth/reset-password` | Новый пароль → `{ msg: string }` |
| `GET` | `/api/auth/me` | Проверка сессии (только фронтенд-прокси) |

**Важно:** бэкенд использует поле `msg` (не `message`) в ответах типа `MsgSchema`.
Фронтенд это учитывает в типе `AuthMsgResponse`.

### JWT payload

```
sub → email пользователя
username → имя пользователя
```

Декодируется на прокси без криптоверификации (бэкенд уже верифицировал при выдаче).

### Auth store (`stores/auth.ts`)

```typescript
interface AuthState {
    user: AuthUser | null;       // { email, username }
    isAuthenticated: boolean;
    isLoading: boolean;          // true пока идёт проверка сессии
    setUser: (user) => void;
    setLoading: (loading) => void;
    reset: () => void;
}
```

При монтировании `AuthProvider` → `useAuth` → `GET /api/auth/me` → заполняет store.

### Маппинг ошибок (`lib/constants/auth-errors.ts`)

Бэкенд возвращает ошибки на английском. Функция `getAuthErrorMessage(detail)`
переводит их на русский. Поддерживает точное и частичное совпадение строк.

Примеры:
- `"Invalid email or password."` → `"Неверный email или пароль."`
- `"The verification code has expired."` → `"Срок действия кода подтверждения истёк."`
- `"Invalid, expired, or blocked refresh token."` → `"Сессия истекла. Войдите заново."`

### Redirect после логина

`Header.tsx` — компонент `LoginLink` читает текущий URL (pathname + query) и
формирует ссылку `/auth/login?redirect={currentUrl}`.

После успешного входа: `router.push(getSafeRedirect(searchParams.get("redirect")))`.

`getSafeRedirect()` защищает от open redirect: принимает только пути начинающиеся
с `/` и не содержащие `://`.

### Redirect после выхода

`handleLogout` в `Header.tsx`:
- Если текущий путь в `PROTECTED_PATHS` (`/favorites`) → `router.push("/")`
- Иначе → остаётся на текущей странице (компоненты перерисовываются через Zustand)

---

## 8. API интеграция

### Клиент (`lib/api/client.ts`)

```typescript
class ApiClient {
    async get<T>(path, params?) → T
    async post<T>(path, body?) → T
}
```

На `401` автоматически вызывает `POST /api/auth/refresh` и повторяет запрос.

### Прокси вакансий (`app/api/v1/[...path]/route.ts`)

- Подставляет `X-API-Key: ${process.env.API_KEY}`
- Читает `access_token` из cookie, добавляет `Authorization: Bearer ...`
- Поддерживает `GET` и `POST`
- Корректно обрабатывает `204 No Content`

### Единая схема вакансии (`VacancySchema`)

API возвращает **одинаковую схему** во всех эндпоинтах: список, детали, избранное.
На фронтенде — единый интерфейс `Vacancy`, `VacancyOut` и `VacancyDetail` — type aliases.

Поле `vacancy_source` принимает два значения: `"hh.ru"` или `"trudvsem.ru"`.
`SourceBadge` компонент отображает `"trudvsem.ru"` как «Работа России».

### Вакансии API (`lib/api/vacancies.ts`)

```typescript
// Поиск (инициализация загрузки данных с внешних источников)
vacanciesApi.search({ region_code, location })        // POST /vacancies/search

// Список с пагинацией и опциональными фильтрами
vacanciesApi.getList({
    location,
    page,
    page_size,
    user_id?,     // email из auth store → заполняет is_favorite
    keyword?,     // поиск по названию и описанию
    source?,      // "hh.ru" | "trudvsem.ru"
})                                                    // GET /vacancies/list

// Детали одной вакансии
vacanciesApi.getById(vacancyId, userId?)              // GET /vacancies/{id}
```

`user_id` передаётся как email из `useAuthStore`. Если не передан — `is_favorite` всегда `false`.

### Избранное (`lib/api/favorites.ts`)

```typescript
favoritesApi.getList(userId, page, pageSize)  // GET /favorites/list
favoritesApi.add({ user_id, vacancy_id })      // POST /favorites/add-vacancy → 201
favoritesApi.remove({ user_id, vacancy_id })   // POST /favorites/delete-vacancy → 204
```

`user_id` — email пользователя (строка из `user.email` в auth store).

Хук `useFavorites` имеет `refetchOnMount: "always"` — всегда запрашивает свежие данные.

### Статусы вакансий

| Значение бэкенда | Отображение |
|---|---|
| `actual` | Актуальная |
| `archival` | В архиве |
| `not_found` | Не найдена |

Маппинг реализован в `VacancyDetail.tsx` через `STATUS_LABELS`.

### Оптимистичные обновления избранного

`VacancyCard` и `VacancyDetail` реализуют оптимистичный паттерн:

```typescript
const previous = isFavorite;
setIsFavorite(!isFavorite);    // мгновенное обновление UI
setIsFavoritePending(true);
try {
    await favoritesApi.add/remove(...);
} catch {
    setIsFavorite(previous);   // откат при ошибке
    setFavoriteError("Не удалось обновить избранное");
} finally {
    setIsFavoritePending(false);
}
```

Ошибка отображается в `<p role="alert">` прямо на карточке.

### Пагинация без "исчезновения" списка

`useVacancies` использует `placeholderData: keepPreviousData`:
- При смене страницы список не исчезает — показывается предыдущий результат с `opacity-50`
- Полный спиннер только при первой загрузке (`isFetching && !data`)

### Per-item loading в избранном

`FavoritesList` получает `removingId: string | null` вместо `isRemoving: boolean`.
Кнопка «Удалить» блокируется и показывает «Удаление…» только для конкретной карточки.

---

## 9. ИИ-ассистент Вера

### Описание

**Вера** — ИИ-ассистент, персонаж платформы. Доступна со страниц вакансий через кнопку
«ИИ-ассистент» или напрямую по URL `/assistant?vacancy_id=...`.

### Возможности

- **Сопроводительное письмо** — шаблон по данным вакансии или персонализированное
- **Рекомендации по резюме** — советы или персонализированные через анкету

### Два режима работы

| Режим | Описание |
|---|---|
| **Базовый** | Сгенерировать немедленно, без вопросов, только по данным вакансии |
| **Персонализированный** | Ответить на 5–7 вопросов → получить результат под конкретного соискателя |

### Компонент `AssistantFlow.tsx`

Многошаговый мастер (wizard):

```
Шаг 1: Выбор функции (сопроводительное письмо / рекомендации по резюме)
Шаг 2: Выбор режима (базовый / персонализированный)
Шаг 3: Анкета (только для персонализированного режима — вопросы от API)
Шаг 4: Результат (HTML из LLM, рендерится через dangerouslySetInnerHTML)
```

**Важно:** `dangerouslySetInnerHTML` используется только для рендеринга HTML-ответов
от LLM-бэкенда. Контент приходит с доверенного сервера, не от пользователя.

### API ассистента (`lib/api/assistant.ts`)

```typescript
assistantApi.getCoverLetter(vacancyId)                              // POST /assistant/cover-letter/{id}
assistantApi.getResumeTips(vacancyId)                               // POST /assistant/resume-tips/{id}
assistantApi.getCoverLetterQuestionnaire(vacancyId)                 // POST /assistant/cover-letter/questionnaire/{id}
assistantApi.getResumeTipsQuestionnaire(vacancyId)                  // POST /assistant/resume-tips/questionnaire/{id}
assistantApi.getCoverLetterByQuestionnaire(vacancyId, answers)      // POST /assistant/cover-letter/by-questionnaire/{id}
assistantApi.getResumeTipsByQuestionnaire(vacancyId, answers)       // POST /assistant/resume-tips/by-questionnaire/{id}
```

Все эндпоинты возвращают `{ result: string }` — HTML-контент.
Анкетные эндпоинты шага 1 возвращают `{ questions_count, questions[] }`.
Ответы на анкету: массив `{ id, text, answer }` — `text` дублирует вопрос для контекста LLM.

---

## 10. Управление состоянием

### Auth Store (`stores/auth.ts`)

Zustand, in-memory. Заполняется при монтировании `AuthProvider` через `GET /api/auth/me`.
Сбрасывается при выходе (`reset()`).

### Search Store (`stores/search.ts`)

Zustand + **`persist` middleware с `sessionStorage`**.

```typescript
{
    summary: VacanciesInfo | null,
    setSummary: (summary) => void,
    clearSummary: () => void,
}
```

**Почему sessionStorage, а не in-memory:** данные сводки (регион, количество вакансий)
переживают `F5` и постраничную навигацию. Очищаются при закрытии вкладки.

**Почему нет проблем с гидратацией:** `VacanciesContent` обёрнут в `<Suspense>` →
рендерится только на клиенте, SSR/client конфликта нет.

### TanStack Query

Конфигурация хуков:

| Хук | `refetchOnWindowFocus` | `refetchOnMount` | `placeholderData` |
|---|---|---|---|
| `useVacancies` | `false` | default | `keepPreviousData` |
| `useVacancyDetail` | default | default | — |
| `useFavorites` | default | `"always"` | — |
| `useRegions`, `useFederalDistricts` | default | default | — |

`useVacancies` — `refetchOnWindowFocus: false` + `keepPreviousData` чтобы результаты
поиска не перезагружались при переключении вкладок и не мигали при пагинации.

`useFavorites` — `refetchOnMount: "always"`, чтобы при каждом переходе на
страницу избранного данные были свежими.

---

## 11. Доступность (WCAG 2.2 AA)

### Обязательные требования

Проект создан для людей с ограниченными возможностями. Каждое требование доступности
**обязательно**, а не опционально.

### Семантика и структура

- Один `<h1>` на страницу, без пропуска уровней заголовков
- Landmark-регионы: `<header>`, `<main id="main-content">`, `<footer>`, `<nav aria-label="...">`
- Skip-link: первый фокусируемый элемент, ведёт в `<main>`
- Все списки через `<ul role="list">` / `<ol>`
- Данные через `<dl>` / `<dt>` / `<dd>` (не таблицы для key-value)
- Статусы и ошибки: `role="alert"` или `role="status"`

### ARIA live-регионы

```html
<!-- Динамические обновления -->
<p aria-live="polite">Сохранено вакансий: 5</p>

<!-- Ошибки (прерывающие) -->
<p role="alert">Не удалось загрузить список.</p>
```

Live-регионы должны **присутствовать в DOM до обновления** — иначе скринридер
пропустит объявление.

### Клавиатурная навигация

- Все интерактивные элементы доступны через Tab
- `focus-visible` стили (жёлтый outline `outline-accent`)
- Dialog с focus trap (React Aria)
- Escape закрывает модальные окна

### Формы

- Все поля имеют видимые `<label>` (не только placeholder)
- `aria-required="true"` на обязательных полях
- `aria-invalid` + `aria-describedby` при ошибке
- `autocomplete` на полях личных данных

### Контраст и визуальная доступность

- Минимум 4.5:1 для текста (WCAG AA)
- Информация не передаётся только цветом (есть текстовые метки)
- Поддержка масштабирования до 200% без потери функциональности
- `prefers-reduced-motion` учитывается в анимациях

### Компоненты React Aria

`RegionCombobox`, `SearchModal` (Dialog), `Pagination` — используют `react-aria-components`,
которые обеспечивают WCAG-совместимость по умолчанию.

---

## 12. Безопасность

### Принципы

- JWT и токены: **только `httpOnly` cookies**, никогда `localStorage` / `sessionStorage` / `IndexedDB`
- API-ключи: **только серверная переменная окружения**, никогда `NEXT_PUBLIC_` префикс
- Браузер никогда не общается с API напрямую — только через Next.js Route Handlers
- Входные данные валидируются Zod на клиенте, серверная валидация — на бэкенде

### Security Headers (`next.config.ts`)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Cache-Control: no-store (для API-ответов)
Content-Security-Policy: ...
```

CSP разрешает `'unsafe-inline'` для скриптов и стилей — необходимо для
Next.js hydration и Tailwind CSS. Nonce-based CSP запланирован на будущее.

### Open Redirect защита

`getSafeRedirect(url)` в `lib/utils/redirect.ts`:
- `null` → `/`
- Не начинается с `/` → `/`
- Начинается с `//` → `/`
- Содержит `://` → `/`
- Иначе → url как есть

### CSRF

`lib/utils/csrf.ts` — проверка `Origin` заголовка в route handlers.

### Rate Limiting

`lib/utils/rate-limit.ts` — in-memory, применяется к auth endpoints:
- Login: 5 попыток/минуту
- Register: 3 попытки/минуту

### XSS / dangerouslySetInnerHTML

Не используется нигде, кроме `AssistantFlow.tsx` — рендеринг HTML от LLM-бэкенда.
Исключение обосновано: контент генерируется доверенным сервером, не пользователем.
При добавлении новых компонентов с HTML от пользователя — обязательно `DOMPurify`.

### Логирование

`lib/utils/logger.ts` — структурированный JSON-логгер.
`lib/utils/request-id.ts` — `X-Request-ID` для корреляции запросов.

### Зависимости

```bash
npm run audit:check    # npm audit --audit-level=moderate
npm run lint:security  # ESLint с плагином безопасности
```

---

## 13. Переменные окружения

```bash
# .env.local (только серверные, NEXT_PUBLIC_ не используются)
API_URL=http://your-api-server:90  # Внешний бэкенд вакансий (уже задеплоен)
AUTH_API_URL=http://backend:8000   # Auth бэкенд (Docker: имя сервиса; локально: http://127.0.0.1:8000)
API_KEY=wfe_...                    # X-API-Key для основного бэкенда
```

Все переменные — серверные. Ни одна не передаётся в браузер через `NEXT_PUBLIC_`.

---

## 14. Запуск и сборка

```bash
npm run dev           # Разработка
npm run build         # Продакшен-сборка (standalone output)
npm run start         # Запуск продакшен-сборки
npm run lint          # ESLint
npm run lint:security # ESLint + security plugin
npm run test          # Vitest (one-shot)
npm run test:watch    # Vitest (watch mode)
npm run analyze       # ANALYZE=true next build (bundle analyzer)
npm run audit:check   # npm audit
```

`output: "standalone"` в `next.config.ts` — для Docker multi-stage build.

---

## 15. Запланированные доработки

### Высокий приоритет

- **Обработка ошибки 409** при добавлении в избранное — показывать понятное
  сообщение вместо generic «Не удалось обновить избранное».

### Средний приоритет (UI улучшения)

- **Активная ссылка в хедере** — `aria-current="page"` + класс `text-accent` + нижняя жёлтая линия.
  Файл: `Header.tsx`. Использовать `usePathname()` (уже импортирован).

- **Hover-эффект на карточках** — `hover:-translate-y-0.5 hover:border-white/30 transition-transform`.
  Файлы: `VacancyCard.tsx`, `FavoritesList.tsx`.

- **Счётчик избранного в хедере** — жёлтый badge с количеством, только если авторизован и `total > 0`.
  Файл: `Header.tsx`. Данные из `useFavorites` (total уже в ответе).

- **Toast-уведомления** — новый компонент `src/components/ui/Toast.tsx`.
  Позиция: `fixed bottom-4 right-4`. Сообщения: добавлено/удалено/ошибка. Автоскрытие 3с.
  Один `<ToastProvider>` в `layout.tsx`.

- **Skeleton-загрузка** — `VacancyCardSkeleton.tsx` с `animate-pulse`. Показывать 5 скелетов
  пока `isLoading`. Заменяет текст «Загрузка…» в `VacancyList`.

- **Адаптив хедера** — hamburger-меню на мобильных (`< sm`), выдвижной Dialog (React Aria).

- **Кнопка «Наверх»** — `ScrollToTop.tsx`, появляется при скролле > 400px,
  `fixed bottom-6 right-6`, `aria-label="Наверх"`.

- **Анимация появления карточек** — `@keyframes card-in` в `globals.css`,
  `animationDelay: i * 60ms`. Только при первой загрузке.

### Низкий приоритет

- **Сортировка вакансий** — требует изменений бэкенда: добавить числовые поля `salary_from`/`salary_to`,
  параметр `sort` в `/vacancies/list`. На фронтенде: select-дропдаун в `VacancyFilters.tsx`.

- **CSP nonce** — вместо `'unsafe-inline'` для inline-скриптов

- **E2E тесты** (Playwright) — сценарии поиска, авторизации, избранного, ассистента

---

## 16. Приложение: Типы TypeScript

### `Vacancy` (единая схема для всех эндпоинтов)

`VacancyOut` и `VacancyDetail` — type aliases для `Vacancy`.

```typescript
interface Vacancy {
    vacancy_id: string;
    vacancy_name: string;
    location: string;
    vacancy_url: string;
    vacancy_source: string;        // "hh.ru" | "trudvsem.ru"
    status: string;                // "actual" | "archival" | "not_found"
    description: string;
    salary: string;
    employer_name: string;
    employer_location: string;
    employer_phone: string;
    employer_code: string;
    employer_email: string;
    contact_person: string;
    employment: string;
    schedule: string;
    work_format: string;
    experience_required: string;
    requirements: string;
    category: string;
    social_protected: string;
    is_favorite: boolean;
}

export type VacancyOut = Vacancy;
export type VacancyDetail = Vacancy;
```

### `VacanciesInfo` (сводка поиска)

```typescript
interface VacanciesInfo {
    all_vacancies_count: number;
    vacancies_count_tv: number;    // Работа России
    vacancies_count_hh: number;    // hh.ru
    error_request_hh: boolean;
    error_request_tv: boolean;
    error_details_hh: string;
    error_details_tv: string;
    location: string;
    region_name: string;
}
```

### `AuthUser`

```typescript
interface AuthUser {
    email: string;
    username: string;
}
```

### `Region`

```typescript
interface Region {
    name: string;
    region_code: string;           // единое поле (было code_tv + code_hh)
    federal_district_code: string;
}
```

### Типы ассистента (`types/assistant.ts`)

```typescript
interface Question {
    id: number;
    text: string;
    required: boolean;
}

interface QuestionnaireResponse {
    questions_count: number;
    questions: Question[];
}

interface QuestionAnswer {
    id: number;
    text: string;      // текст вопроса (дублируется для контекста LLM)
    answer: string;    // ответ пользователя (может быть пустым для необязательных)
}

interface AssistantTextResponse {
    result: string;    // HTML-контент
}
```

---

## 17. Приложение: Справочник эндпоинтов API

Base URL: `http://<host>/api/v1` — через Next.js прокси `/api/v1/[...path]`

| Метод | URL | Описание |
|---|---|---|
| `GET` | `/federal-districts/list` | Список федеральных округов |
| `GET` | `/regions/list` | Список всех регионов |
| `GET` | `/regions/by-federal-districts?federal_district_code=` | Регионы по округу |
| `POST` | `/vacancies/search` | Запустить поиск по внешним источникам |
| `GET` | `/vacancies/list?location=&page=&page_size=&user_id=&keyword=&source=` | Список вакансий |
| `GET` | `/vacancies/{vacancy_id}?user_id=` | Детали вакансии |
| `POST` | `/favorites/add-vacancy` | Добавить в избранное → 201 |
| `POST` | `/favorites/delete-vacancy` | Удалить из избранного → 204 |
| `GET` | `/favorites/list?user_id=&page=&page_size=` | Избранные вакансии |
| `POST` | `/assistant/cover-letter/{vacancy_id}` | Базовый шаблон письма |
| `POST` | `/assistant/resume-tips/{vacancy_id}` | Базовые советы по резюме |
| `POST` | `/assistant/cover-letter/questionnaire/{vacancy_id}` | Анкета для письма (шаг 1) |
| `POST` | `/assistant/resume-tips/questionnaire/{vacancy_id}` | Анкета для резюме (шаг 1) |
| `POST` | `/assistant/cover-letter/by-questionnaire/{vacancy_id}` | Персональное письмо (шаг 2) |
| `POST` | `/assistant/resume-tips/by-questionnaire/{vacancy_id}` | Персональные советы (шаг 2) |

Все эндпоинты требуют `X-Api-Key` (подставляется прокси из `process.env.API_KEY`).

Коды ошибок: `400` валидация, `401` неверный ключ, `403` просрочен,
`404` не найдено, `409` конфликт, `422` ошибка типов Pydantic, `500` сервер.

Формат ошибки: `{ "detail": "Описание" }`

---

## 18. Стратегический план: Агент Вера (Итерация 2)

> Это план следующей итерации. Текущий wizard на `/assistant` **остаётся** и доводится до ума в рамках итерации 1.

### Концепция

Вера превращается в полноценного агента с инструментами (tool use). Точка входа — кнопка "Вера" в центре орбиты на главной странице (уже ведёт на `/assistant`). Wizard переезжает на `/assistant/tools` или остаётся как дополнительный режим рядом с чатом.

### Роутинг

| Маршрут | Итерация 1 | Итерация 2 |
|---|---|---|
| `/assistant` | Wizard (письмо, резюме) | Агент-чат |
| `/assistant/tools` | — | Wizard (перенесён) |

Кнопки "Карьерный ассистент" из избранного уже передают `?vacancy_id=X` — агент подхватит как начальный контекст диалога, менять не нужно.

### Инструменты агента

**Доступны всем (включая неавторизованных):**
- `kb_search(query)` — RAG по базе знаний: квотирование рабочих мест, права инвалидов, юридические аспекты трудоустройства в России

**Только для авторизованных пользователей:**
- `get_user_favorites(user_id)` — получить избранные вакансии
- `find_similar_vacancies(vacancy_id)` — поиск похожих по векторному сходству (pgvector)
- `search_vacancies(location, query)` — поиск вакансий через агента с нормализацией локации

### Нормализация локации (Dadata)

Пользователь пишет город в свободной форме → агент вызывает Dadata API → получает `region_code` и нормализованный топоним → передаёт в поиск вакансий. Устраняет необходимость в форме с выбором региона.

### Векторный поиск похожих вакансий

Векторизовать `vacancy_name + description` при сохранении в БД. Хранилище — `pgvector` (расширение PostgreSQL, отдельная инфраструктура не нужна). При запросе — cosine similarity по эмбеддингу вакансии или запроса пользователя.

### Конверсионная логика

Неавторизованный пользователь получает доступ к `kb_search` → агент органично предлагает войти для доступа к персональным инструментам (избранное, поиск). Естественная точка регистрации.

### Фронтенд агента

- Chat UI: история сообщений (скролл) + инпут внизу
- Streaming через SSE — ответы агента длинные, ждать нельзя
- Индикаторы вызова инструментов: "ищу вакансии…", "проверяю избранное…"
- `useReducer` для управления состоянием чата (сложнее wizard-а)

---

## 19. Концепция: Собственная платформа вакансий (Итерация 3+)

> Уровень: концепция. Архитектурные решения не приняты. Фиксируется как стратегическое направление.

### Идея

Трансформация агрегатора в специализированную платформу занятости для людей с инвалидностью. В отличие от hh.ru и Работы России — максимальная адаптация под нужды целевой аудитории на всех уровнях: интерфейс, формы, AI-ассистент, матчинг.

### Новые роли пользователей

| Роль | Описание |
|---|---|
| `job_seeker` | Соискатель (текущая роль, расширяется) |
| `employer` | Работодатель — размещение вакансий, поиск кандидатов |
| `admin` | Администратор — верификация работодателей, модерация |

### Интерфейс работодателя (`/employer/*`)

- Регистрация и верификация организации
- Личный кабинет: управление вакансиями, просмотр откликов
- Форма размещения вакансии — специализированная: поля под квотирование, условия для инвалидов, категории льгот
- AI-подборка кандидатов из базы резюме

### Интерфейс соискателя (`/profile/*`)

- Расширение текущего личного кабинета
- Размещение резюме — форма адаптирована для пользователей с разными видами инвалидности
- История откликов, статусы
- AI-подборка вакансий под профиль

### Доступность форм (ключевое требование)

Формы вакансии и резюме — образцовая доступность:
- `fieldset` / `legend` для групп полей
- Описания ошибок через `aria-describedby`
- Автосохранение черновиков
- Многошаговые формы с прогресс-индикатором

### Интеграция с поиском

Собственные вакансии становятся третьим источником в агрегаторе. Архитектура поиска не меняется — добавляется `source=platform`.

### AI-матчинг

- Соискателю → подборка вакансий по профилю резюме (векторный поиск, агент)
- Работодателю → подборка кандидатов по описанию вакансии
- Реализуется через агента Веру (инструменты из итерации 2 расширяются)

### Бэкенд (предварительно)

Текущий auth-бэкенд рассматривается как основа будущего платформенного бэкенда — расширение ролевой модели, профилей пользователей, хранения резюме и вакансий. Архитектурное решение не принято, требует отдельного проектирования.
