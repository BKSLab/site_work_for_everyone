# Frontend Review — site_work_for_everyone

Дата обзора: 2026-04-19
Путь проекта: `D:\BKS.Lab\python\my_projects\site_work_for_everyone\frontend`

## 1. Executive summary

Фронтенд производит хорошее впечатление для продуктового MVP и уже выглядит как осмысленная система, а не набор страниц. Видно несколько сильных инженерных решений:

- современный стек: `Next.js 16`, `React 19`, `TanStack Query`, `Zustand`, `react-hook-form`, `zod`
- нормальное разделение по слоям: `app/`, `components/`, `hooks/`, `lib/`, `stores/`, `types/`
- свой proxy-слой для API, а не прямые вызовы внешнего бэкенда из браузера
- базовые меры безопасности: CSP, CSRF-проверка, rate limiting, httpOnly cookies, path sanitization
- явный фокус на доступность: `SkipLink`, aria-атрибуты, `FocusScope`, live region, доступные формы и модалки
- отдельный контентный слой для блога на markdown без лишней CMS-сложности

При этом проект уже упирается в следующий уровень зрелости: часть UI-логики стала достаточно сложной, появились lint-ошибки на React 19 rules, а тестовое покрытие пока узкое и почти не касается ключевых пользовательских сценариев.

Итоговая оценка:

- Архитектура: хорошая
- Продуктовая готовность: хорошая для MVP / beta
- Поддерживаемость: выше средней
- Технический риск: умеренный
- Главная зона роста: стабилизация сложных client-side flow и усиление тестов

## 2. Что устроено хорошо

### 2.1. Каркас приложения

`src/app/layout.tsx:15` и `src/app/layout.tsx:23` задают аккуратный корневой layout:

- глобальные metadata
- подключение `QueryProvider` и `AuthProvider`
- единый `Header` / `Footer`
- `SkipLink` и `aria-live` регион

Это хороший базовый каркас для доступного приложения.

### 2.2. Разделение ответственности

Структура по папкам читается легко:

- `src/app` — маршруты и страницы
- `src/components/features` — UI по доменам
- `src/components/ui` — переиспользуемые primitives
- `src/lib/api` — клиентские API-обёртки
- `src/app/api` — server-side proxy routes
- `src/hooks` — query/mutation hooks и пользовательские сценарии
- `src/stores` — клиентское состояние
- `src/lib/schemas` — валидация

Это хороший баланс между feature-based и layered organization.

### 2.3. API proxy и security posture

Самая сильная часть проекта — proxy-слой.

Файлы:

- `src/app/api/auth/[...path]/route.ts:280`
- `src/app/api/auth/[...path]/route.ts:371`
- `src/app/api/v1/[...path]/route.ts:10`
- `src/app/api/v1/[...path]/route.ts:131`
- `src/app/api/v1/[...path]/route.ts:139`
- `src/lib/utils/csrf.ts:1`
- `src/lib/utils/proxy.ts:1`
- `next.config.ts:8`

Что здесь хорошо:

- токены не торчат в браузерном storage, используются cookie с `httpOnly`
- есть серверный proxy вместо раскрытия внешнего API клиенту
- есть `validateOrigin()` для POST-запросов
- есть `sanitizeProxyPath()` против path traversal
- есть rate limiters для auth и search
- есть request id и structured logging
- есть CSP и набор security headers в `next.config.ts`

Для проекта такого масштаба это уже зрелый подход.

### 2.4. Data fetching

`src/providers/QueryProvider.tsx:6` и `src/hooks/useVacancies.ts:14` показывают внятную стратегию загрузки данных:

- `TanStack Query` для запросов
- `staleTime`
- `keepPreviousData` через `placeholderData`
- отключён шумный `refetchOnWindowFocus`

Для списка вакансий это адекватное решение: UI не дёргается, пагинация ощущается стабильнее.

### 2.5. UX и accessibility

Позитивно, что доступность не добавлена формально, а реально встроена в интерфейсы:

- `src/components/ui/Modal.tsx:15` использует `react-aria-components`
- `src/components/layout/Header.tsx:203` использует `FocusScope` для мобильного меню
- формы активно используют `aria-invalid`, `aria-describedby`, `role="alert"`
- в layout есть `SkipLink` и live region

Это хорошая база, особенно для сервиса, который декларирует доступность как одну из основ продукта.

### 2.6. Блог

Блог сделан просто и разумно:

- `src/lib/blog/posts.ts:58`
- `src/lib/blog/posts.ts:68`
- `src/app/blog/page.tsx:19`
- `src/app/blog/[slug]/page.tsx:11`
- `src/app/blog/[slug]/page.tsx:15`
- `src/app/blog/[slug]/page.tsx:118`

Плюсы:

- markdown как источник контента
- `generateStaticParams` и `generateMetadata`
- `remark` pipeline
- санитизация HTML через `DOMPurify`
- минимальная стоимость поддержки

Для текущего объёма контента решение удачное.

## 3. Основные проблемы и риски

### 3.1. Текущий `lint` не зелёный

Это сейчас главный объективный сигнал.

Команда `npm run lint` завершилась с ошибками. Ключевые проблемы:

1. `src/app/auth/login/page.tsx:38`
   - чтение `handlingLoginRef.current` во время render
   - вызов `router.replace()` прямо в render
   - по новым React rules это считается неправильным паттерном

2. `src/components/features/search/RegionCombobox.tsx:32`
   - `setInputValue("")` вызывается синхронно внутри `useEffect`
   - rule `react-hooks/set-state-in-effect` считает это каскадным ререндером

3. `src/components/features/vacancies/VacancyFilters.tsx:40`
   - синхронная серия `setKeyword`, `setSource`, `setPageSize` внутри `useEffect`
   - та же проблема с render/effect model

4. `src/app/favorites/page.tsx:31`
   - остался `console.log`, причём явно помеченный как debug

Это не косметика. Это значит, что часть клиентских flow уже конфликтует с ожидаемой моделью React 19 и требует приведения к более устойчивому состоянию.

### 3.2. Слишком сложная клиентская логика в `AssistantFlow`

Файл `src/components/features/assistant/AssistantFlow.tsx` очень большой и уже несёт слишком много обязанностей. По коду видно:

- собственный степпер
- загрузка избранного
- работа с `searchParams`
- ветвление по шагам
- branch logic для `basic` / `individual`
- генерация результата
- копирование в буфер
- ручной dropdown/listbox
- санитизация HTML результата

Ключевые сигналы:

- `src/components/features/assistant/AssistantFlow.tsx:22`
- `src/components/features/assistant/AssistantFlow.tsx:105`
- `src/components/features/assistant/AssistantFlow.tsx:372`
- `src/components/features/assistant/AssistantFlow.tsx:825`

Проблема не в том, что файл длинный сам по себе. Проблема в высокой концентрации состояний, переходов и побочных эффектов в одном компоненте. Это увеличивает риск:

- случайных регрессий
- сложной отладки
- сложных зависимостей в `useEffect`
- трудных unit/integration тестов

Этот модуль уже просится на декомпозицию по шагам и по domain logic.

### 3.3. Auth flow местами слишком хрупкий

Файлы:

- `src/hooks/useAuth.ts:7`
- `src/stores/auth.ts:13`
- `src/app/auth/login/page.tsx:38`
- `src/proxy.ts:1`

Что видно:

- гидрация auth идёт через `useAuth()` на клиенте
- middleware/proxy пропускает пользователя по наличию токена, а не по валидности
- страница логина делает redirect в render
- часть логики авторизации распределена между proxy, store, hook, login page и auth route

Это работает, но архитектурно остаётся довольно хрупким. Есть риск появления edge-case поведения:

- устаревший cookie есть, но сессия фактически невалидна
- protected route пропускается в proxy, а затем client-side auth делает reset
- пользователь может видеть промежуточные состояния или ненужные редиректы

Это не аварийный баг, но зона, где стоит упростить модель и явнее разделить server auth gate и client hydration.

### 3.4. Локальное UI-state иногда дублирует derived state

Примеры:

- `src/components/features/search/RegionCombobox.tsx:24`
- `src/components/features/vacancies/VacancyFilters.tsx:24`

В обоих случаях есть локальное состояние, которое синхронизируется с props через `useEffect`. Отсюда и lint-ошибки.

Это типичный симптом: часть состояния можно либо вычислять напрямую, либо инициализировать иначе, либо оформлять как controlled component с более явной моделью. Сейчас это работает, но уже начинает создавать лишнюю сложность.

### 3.5. Тестовое покрытие слишком узкое относительно ценности продукта

Текущие тесты есть, но они покрывают в основном utility/schema слой:

- `src/lib/utils/__tests__/redirect.test.ts`
- `src/lib/utils/__tests__/csrf.test.ts`
- `src/lib/utils/__tests__/rate-limit.test.ts`
- `src/lib/schemas/__tests__/auth.test.ts`

Это хороший старт, но почти не покрыто то, что наиболее рискованно для продукта:

- login / register / verify-email flow
- proxy auth route behavior
- favorites flow
- search form и filters
- assistant flow
- route-level integration поведения

Именно там сейчас накапливается реальная сложность.

### 3.6. Блогу не хватает валидации контента

Файл: `src/lib/blog/posts.ts:58`

Сейчас frontmatter читается мягко:

- почти все поля с `??` fallback
- сортировка основана на `localeCompare` по дате
- нет runtime-проверки `tagColor`, `date`, `readingTime`

Для трёх файлов это приемлемо. Но если блог будет расти, нужен хотя бы schema validation через `zod`, иначе контентная ошибка будет тихо ломать UI или сортировку.

### 3.7. Есть следы временной отладки в production code

Файл `src/app/favorites/page.tsx:31` содержит явный debug-лог с комментарием `DEBUG BUG-001`. Это небольшой, но показательный сигнал. Когда такие фрагменты остаются в коде, они ухудшают читаемость и часто прячут временные workaround-решения дольше, чем нужно.

## 4. Что особенно понравилось

Несколько решений реально хороши:

- proxy-маршруты как boundary между фронтендом и backend API
- `request-id` и structured logging на серверной стороне
- внимание к CSP/CSRF/rate limiting уже на этапе MVP
- использование `react-aria-components`, а не самодельных полу-доступных диалогов
- вынесение reusable UI-слоя в `components/ui`
- аккуратная работа с markdown-блогом и SEO
- наличие `pending favorite` сценария после логина — это продуктово сильная деталь

Последний пункт особенно интересный: пользовательский сценарий "добавить в избранное, потом залогиниться, затем автоматически завершить намерение" — это хороший продуктовый штрих.

## 5. Состояние качества по инструментам

### 5.1. Lint

`npm run lint`:

- статус: не пройден
- результат: `4 errors`, `22 warnings`

Наиболее значимые ошибки:

- `src/app/auth/login/page.tsx:38`
- `src/components/features/search/RegionCombobox.tsx:32`
- `src/components/features/vacancies/VacancyFilters.tsx:40`
- `src/app/favorites/page.tsx:31`

Часть warnings идёт от `eslint-plugin-security` и выглядит как generic object injection false positive для индексного доступа. Их нужно разобрать отдельно и не смешивать с реальными React-pattern issues.

### 5.2. Tests

`npm test` в текущем окружении не удалось полноценно запустить:

- ошибка: `spawn EPERM`
- источник: запуск `esbuild` внутри sandbox

То есть на момент обзора нет подтверждения, что тесты падают по коду. Есть только ограничение окружения исполнения.

## 6. Приоритеты на улучшение

### P1. Привести проект в зелёный `lint`

Сначала стоит устранить реальные ошибки React rules:

1. перенести redirect из render в effect/action на `src/app/auth/login/page.tsx:38`
2. убрать synchronous setState-in-effect в `RegionCombobox`
3. убрать synchronous setState-in-effect в `VacancyFilters`
4. удалить debug `console.log` из `favorites/page.tsx`

Это даст быструю и полезную стабилизацию.

### P2. Разбить `AssistantFlow`

Рекомендация:

- вынести state machine / step transitions в отдельный hook
- вынести шаги в отдельные компоненты
- отделить `VacancySelect` и result rendering
- сократить объём главного компонента до orchestration-слоя

Это самая ценная архитектурная инвестиция в текущей кодовой базе.

### P3. Усилить тесты на продуктовые сценарии

Минимальный пакет:

1. integration tests для login page
2. tests для `useFavoriteToggle`
3. tests для search form + validation + redirect to vacancies
4. tests для auth proxy route и refresh path
5. smoke/integration tests для assistant flow

### P4. Упростить auth model

Стоит решить, какая модель главная:

- server-gated auth
- или client hydration + optimistic route access

Сейчас используется смешанная схема. Она рабочая, но не идеально прозрачная.

### P5. Добавить schema validation для blog content

`zod` уже есть в проекте. Логично использовать его и для `content/blog/*.md`.

## 7. Архитектурный вывод

Проект уже вышел из стадии "быстро собрать интерфейс" и находится в точке, где архитектура в целом удачная, но отдельные модули начали перерастать исходные допущения.

Если ничего не менять, проект, скорее всего, продолжит работать, но стоимость изменений будет расти:

- сложнее станет трогать auth flow
- сложнее станет трогать assistant flow
- React lint rules будут всё чаще ловить архитектурные шероховатости

Если сделать 2-3 точечных шага сейчас — зелёный lint, декомпозиция assistant flow, усиление integration tests — фронтенд станет заметно устойчивее без большого рефактора.

## 8. Короткий вердикт

Сильный MVP-фронтенд с хорошей инженерной базой, особенно по proxy/security/accessibility. Главный риск не в фундаменте, а в росте сложности client-side сценариев. Ближайший правильный шаг — не переписывать всё, а аккуратно стабилизировать текущие сложные зоны и закрыть их тестами.
