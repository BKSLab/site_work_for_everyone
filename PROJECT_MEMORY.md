# Память проекта «Работа для всех»

Проверено по исходникам 21 октября 2026 года. Здесь собраны устойчивые сведения для дальнейшей работы; актуальный код и конфигурация имеют приоритет. Состояние production и соседних репозиториев этой проверкой не подтверждалось.

## Назначение и устройство

Поиск вакансий с hh.ru и Работы России, избранное, блог, помощь с резюме/сопроводительным письмом и консультации Веры по трудовым вопросам.

| Контур | Источник истины |
|---|---|
| Frontend: Next.js 16, React 19, TypeScript, Tailwind 4, React Aria, TanStack Query, Zustand, Zod | [frontend/package.json](frontend/package.json) |
| Backend: FastAPI, async SQLAlchemy, Alembic, Hypercorn; Python 3.12 в образе | [backend/requirements.txt](backend/requirements.txt), [backend/Dockerfile](backend/Dockerfile) |
| Точка входа backend и lifecycle зависимостей | [backend/main.py](backend/main.py) |
| Контейнеры, БД PostgreSQL 16, порты и volumes | [docker-compose.yml](docker-compose.yml) |
| HTTP и SSE, TLS | [nginx/templates/default.conf.template](nginx/templates/default.conf.template) |

Маршруты ассистента различаются: `/assistant` — обзор, `/assistant/start` — мастер отклика, `/assistant/chat` — чат. Мастер может получить `vacancy_id` в query и работает с избранной вакансией. В нём две задачи и два режима: базовый и индивидуальный с анкетой.

Браузер обращается к `/api/auth/*`, `/api/v1/*`, `/api/vera/*` того же origin. Next Route Handlers направляют запросы в backend сайта или внешний API вакансий. SSE `/vera/sse/{request_id}` Nginx направляет прямо в Agent Service. В локальном `next dev` этот путь воспроизводит rewrite из [frontend/next.config.ts](frontend/next.config.ts).

## Авторизация и безопасность

- Auth-маршруты проксирует [frontend/src/app/api/auth/[...path]/route.ts](frontend/src/app/api/auth/[...path]/route.ts); auth cookies и refresh обслуживает [auth-session.ts](frontend/src/lib/utils/auth-session.ts).
- Access/refresh tokens хранятся в HttpOnly cookies. Флаг Secure управляется `COOKIE_SECURE`; наличие HTTPS в окружении нельзя предполагать по имени режима запуска.
- Текущий пользователь содержит `email`, `first_name`, `last_name`. Ответы auth с текстовым сообщением используют `msg`. Типы: [frontend/src/types/auth.ts](frontend/src/types/auth.ts).
- [frontend/src/proxy.ts](frontend/src/proxy.ts) делает предварительные перенаправления `/favorites` и `/auth/*`. Проверка наличия cookie не заменяет серверную авторизацию.
- Ключи API не передаются браузеру. При работе с Верой owner и refresh согласует [vera-owner-headers.ts](frontend/src/lib/utils/vera-owner-headers.ts); проверка владельца backend — [vera_session_access.py](backend/src/services/vera_session_access.py).
- HTML результата мастера проходит `DOMPurify.sanitize` в [AssistantFlow.tsx](frontend/src/components/features/assistant/AssistantFlow.tsx). Чат выводит ответ как текст в [ChatMessage.tsx](frontend/src/components/features/vera/ChatMessage.tsx); это разные способы отображения.

## Клиентское состояние и избранное

- [AuthProvider.tsx](frontend/src/providers/AuthProvider.tsx) запускает гидратацию через `/api/auth/me`. Серверные данные хранятся в TanStack Query; auth-состояние — в Zustand. После входа [страница логина](frontend/src/app/auth/login/page.tsx) обновляет пользователя, выполняет `router.refresh()`, обрабатывает отложенное избранное и переходит по безопасному redirect.
- [useFavorites.ts](frontend/src/hooks/useFavorites.ts) использует ключ `["favorites", userId, page, pageSize]`, отключает запрос при пустом `userId` и обновляет выборку после мутации. `removeMutation.onSuccess` возвращает Promise инвалидирования: завершение операции учитывает обновление списка.
- [Страница избранного](frontend/src/app/favorites/page.tsx) хранит страницу в query `page`, нормализует её после удаления последней записи и восстанавливает фокус карточки с привязкой к владельцу. Перезагрузка детали → Back должна сохранять страницу списка. Историю старого бага нельзя использовать вместо проверки этого сценария.
- [pendingFavorite.ts](frontend/src/lib/utils/pendingFavorite.ts) хранит ID отложенного добавления в `sessionStorage`; [auth-flow.ts](frontend/src/lib/utils/auth-flow.ts) переносит email и безопасный redirect между этапами авторизации.

## Backend и админка

Настройки находятся в [backend/src/core/settings.py](backend/src/core/settings.py), доступ — через кешированный `get_settings()`. Зависимости собираются в [db_session.py](backend/src/dependencies/db_session.py), [repositories.py](backend/src/dependencies/repositories.py), [services.py](backend/src/dependencies/services.py); API получает готовые `*Dep` aliases.

`DBSettings` формирует DSN из `POSTGRES_HOST`, пользователя, пароля и имени БД. Отдельного поля `POSTGRES_PORT` в этой модели нет; нестандартный порт указывается вместе с host. Параметры срока JWT — `JWT_EXPIRE_SECONDS` и `JWT_REFRESH_EXPIRE_DAYS`.

Админка `/admin` собирается в [backend/src/admin/__init__.py](backend/src/admin/__init__.py); вход использует `ADMIN_LOGIN`, `ADMIN_PASSWORD` и серверную сессию. `/admin/stats` — `StatsView` в [views.py](backend/src/admin/views.py): engine назначается до регистрации view, запросы выполняются последовательно в собственной короткой `AsyncSession`. Дневные и недельные границы считаются в UTC. Шаблон — [stats.html](backend/templates/sqladmin/stats.html), тема — [admin-theme.css](backend/static/admin-theme.css), оболочка — [base.html](backend/templates/sqladmin/base.html).

## Вера: доставка и восстановление

Схемы: [backend/src/schemas/vera.py](backend/src/schemas/vera.py) и [frontend/src/lib/schemas/vera.ts](frontend/src/lib/schemas/vera.ts). Основная клиентская логика: [useVeraChat.ts](frontend/src/hooks/useVeraChat.ts). Backend-маршруты: [backend/src/api/vera.py](backend/src/api/vera.py).

1. Браузер отправляет `POST /api/vera/chat` с `session_id`, `request_id`, `message`. BFF добавляет `replacement_session_id=request_id` и серверные owner-заголовки.
2. Backend определяет effective session через Agent, выпускает stream ticket и публикует сообщение в RabbitMQ. Owner определяется проверенным JWT либо anonymous proof; `user_id` из тела браузера не является источником прав.
3. Успешная квитанция `202` содержит `request_id`, `stream_ticket`, `stream_url`, `session_id`, `previous_session_id`, `boundary`, `session_ttl_seconds`.
4. После квитанции клиент открывает `stream_url` с query `ticket`. Адресация потока — по `request_id`, а не по диалогу.

Сообщение ограничено 4000 символами, идентификаторы — 100. Rabbit envelope содержит `session_id`, `request_id`, `user_id`, `anonymous_token_hash`, `message`; publisher — [vera_publisher.py](backend/src/services/vera_publisher.py). Он поддерживает восстановление соединения; очередь проверяется через passive declare и должна быть подготовлена инфраструктурой.

Ticket связан с запросом, сессией и одним владельцем; срок — 60 секунд. Реализация — [vera_stream_ticket.py](backend/src/services/vera_stream_ticket.py). Nginx отключает access log для SSE, чтобы билет не попадал в стандартный лог URL. Эти билеты и owner credentials нельзя переносить в клиентскую конфигурацию или логи.

SSE знает `token`, `heartbeat`, `done`, `error`; неизвестные типы игнорируются. HTTP/SSE проверяются Zod. В hook сейчас заданы 30 секунд до первого события, 45 секунд бездействия и общий предел 450 секунд; изменения таймаутов нужно сверять с восстановлением.

Видимое ожидание ответа имеет отдельные пороги 6 и 20 секунд: «Анализирую сообщение» → «Разбираюсь в вопросе» → «Готовлю ответ — нужно ещё немного времени». У «Объяснить проще» свой начальный текст. Это UX-стадии, не transport timeouts: heartbeat не переключает их и не считается первым токеном. После восстановления стадия рассчитывается от исходного времени запроса; первый token останавливает подсказки. Короткие объявления выводятся отдельно; черновик следующего вопроса сохраняется.

`publish_state=not_published` подтверждает отказ до публикации. Ошибка без этого признака может означать уже принятый запрос: выполняется reconciliation через history с исходным `request_id`, автоматический новый POST недопустим. Ошибка может содержать уже принятую lifecycle-границу; BFF сохраняет соответствующие owner cookies и на таком ответе. Pending journals и lifecycle receipts нужны для восстановления, а не только для визуального состояния.

Есть current/create/resolve/close. `boundary` принимает `created`, `retained`, `expired`; срок контекста определяет сервер. Срок anonymous owner-proof cookie 24 часа не является локальным TTL диалога. Закрытие текущего диалога не означает удаления его истории. Код cookie и подписи: [vera-session-token.ts](frontend/src/lib/utils/vera-session-token.ts).

История проходит через Agent → backend Pydantic → frontend Zod. Новое поле нужно провести через все слои: backend пересериализует ответ и потеряет неописанное поле. Например, `used_knowledge_base` управляет доступностью «Объяснить проще».

## Обратная связь Вере

Не путать с формой обратной связи сайта. Браузерные запросы проходят общие owner-проверки [vera-feedback-proxy.ts](frontend/src/lib/utils/vera-feedback-proxy.ts), затем [VeraAgentClient](backend/src/services/vera_agent.py).

| Действие | Браузер → BFF | Backend → Agent |
|---|---|---|
| Оценка завершённого ответа | `PUT /api/vera/feedback/message` | `PUT /api/v1/feedback/message` |
| Анкета по диалогу | `POST /api/vera/feedback` | `POST /api/v1/feedback/session` |

Оценка использует существующие `session_id`, `request_id` и `value=up|down`. Анкета использует `session_id`, стабильный `submission_id` и необязательные `audience=seeker|employer|other`, `usefulness`/`trust` от 1 до 5, `comment` до 4000 символов, `contact_email`. Актуальные поля и ограничения находятся в общих схемах, а не в копии примера curl.

При повторе одной отправки сохраняется `submission_id`; новая редакция отзыва не должна подменять тело уже выполняющегося запроса. Pending-окно можно закрыть, не отменяя серверную операцию. Поздний ответ не должен открывать окно или перехватывать фокус; смена owner/session сбрасывает соответствующее UI-состояние. Реализация — [VeraFeedbackModal.tsx](frontend/src/components/features/vera/VeraFeedbackModal.tsx).

## Интерфейс и доступность

- Текущие токены: фон `#0A0A0A`, основной текст `#F0F0F0`, вторичный `#999999`, золото `#F5B800`, граница поля `--input-border: #777777`. Общее правило focus находится в [globals.css](frontend/src/app/globals.css).
- Для интерактивных элементов применяется золотой outline 2 px, offset 2 px. У `h1`–`h6` с `tabindex=-1` рамка скрыта намеренно, программный focus сохранён. Статические карточки и подписи не получают Tab-позиции.
- Активная опция региона/вакансии имеет золотую рамку внутри строки и мягкий фон. Управление active descendant, прокрутка только списка и выход Tab/Shift+Tab должны сохраняться. Примеры — [RegionCombobox.tsx](frontend/src/components/features/search/RegionCombobox.tsx), `AssistantFlow.tsx`.
- Ссылка «Ассистент Вера» в шапке — приглушённая плашка с градиентом; название является единым текстом одного цвета и начертания. Компоненты — [Header.tsx](frontend/src/components/layout/Header.tsx), [SiteChrome.module.css](frontend/src/components/layout/SiteChrome.module.css).
- Карточки блога выравниваются по высоте без обрезки заголовков. В статье ширина текста на широком экране — 768 px; рекомендации с тем же тегом находятся справа от 1100 px, ниже — под статьёй. Сама статья исключается из рекомендаций. Подвал объединяет поиск, консультацию Веры, «Поделиться» и «Все статьи».
- Ассистент Вера в роли карьерного консультанта (`AssistantFlow.tsx`) имеет ширину до 52 rem. Поля и кнопки используют общий focus; ответы сохраняются при возврате из результата. Загрузка располагается после элементов управления, чтобы активная кнопка оставалась видимой. Сообщение общей валидации очищается при редактировании; ошибки незаполненных полей остаются связанными с полями.
- В чате доступны начало ответа и возврат к вводу; jump не должен прокручивать весь документ. Короткие статусы объявляются отдельно от текста потока. Черновик следующего сообщения хранится в `sessionStorage` с owner/session scope: [useVeraDraft.ts](frontend/src/components/features/vera/useVeraDraft.ts).
- Не переотправлять форму при копировании: [clipboard.ts](frontend/src/lib/utils/clipboard.ts) возвращает фактический результат и восстанавливает focus после fallback.
- [Справка `/help`](frontend/src/app/help/page.tsx) объясняет пользовательские сценарии и доступность. Все семь возможностей в орбитах главной ведут на её конкретные подразделы, откуда доступны переходы к действию. Якоря и иерархия оглавления — [help-sections.ts](frontend/src/components/features/help/help-sections.ts); [HelpToc.tsx](frontend/src/components/features/help/HelpToc.tsx) управляет фокусом при переходе по фрагменту, поэтому H1 этой страницы использует `focusOnMount={false}`. Скриншоты открываются в диалоге с исходным размером и возвратом фокуса: [HelpScreenshot.tsx](frontend/src/components/features/help/HelpScreenshot.tsx).
- [Поиск по справке](frontend/src/components/features/help/HelpSearch.tsx) работает в браузере по текущим заголовкам и тексту `article`, без отдельного API и копии контента. [help-search.ts](frontend/src/components/features/help/help-search.ts) сопоставляет распространённые формы слов и формулировки, возвращает фрагменты и точные якоря подразделов. Результаты — обычные ссылки; автоматическое обновление выдачи не переносит фокус из поля.

## Настройка и эксплуатация

Имена параметров и примеры: [.env.example](.env.example), [frontend/.env.example](frontend/.env.example), [backend/.env.example](backend/.env.example). Значения рабочих `.env` в память не копируются.

- Root `.env`: `AGENT_SSE_UPSTREAM`, адрес `host:port` для Nginx.
- Frontend: `API_URL`, `API_KEY`, `AUTH_API_URL`, `AGENT_SSE_ORIGIN` для локального rewrite, `VERA_SESSION_SIGNING_KEY`.
- Backend: параметры БД/SMTP/auth, `RABBITMQ_URL`, `RABBITMQ_QUEUE`, `VERA_AGENT_API_URL`, `VERA_AGENT_API_KEY`, `VERA_SESSION_SIGNING_KEY`.
- `VERA_SESSION_SIGNING_KEY` должен совпадать у frontend и backend сайта. Внешний Agent API key и stream ticket — отдельные сущности.
- Compose этого репозитория не поднимает Agent/MCP/RAG и RabbitMQ. Backend использует внешний брокер; адрес `host.docker.internal` в Linux-контейнере поддерживается через `extra_hosts`.
- PostgreSQL опубликован на порту 5434 хоста; backend доступен через Nginx на 91; frontend Nginx — 80/443. Фактическую схему всегда сверять с Compose.
- [backend/entrypoint.sh](backend/entrypoint.sh) сначала выполняет `alembic upgrade head`, затем `hypercorn main:app --bind 0.0.0.0:8000 --workers 1`.

Nginx получает конфиг из template через `envsubst` при старте контейнера. Изменение bind-mounted шаблона само по себе не обновляет уже сгенерированный конфиг. Проверка шаблона: `docker compose run --rm --no-deps nginx_frontend nginx -t`; применение после разрешённого изменения требует перезапуска/пересоздания соответствующего контейнера. Изменение переменных окружения требует пересоздания, а не обычного restart.

В TLS-конфиге сохранены TLS 1.2/1.3 и оба семейства `ECDHE-ECDSA-*`/`ECDHE-RSA-*`: тип сертификата должен иметь совместимый набор шифров. Access log различает схему и протокол; ошибка TLS handshake возникает до HTTP и не обязана попадать в access log. Текущий срок сертификата, preload-статус и доступность production проверяются отдельно, не выводятся из конфигурации.

## Подтверждённые ограничения и проверки

- `backend/src/services/vera_publisher.py` сейчас логирует полный Rabbit payload на INFO, включая вопрос и owner-поля. Считать защиту таких данных в логах завершённой нельзя. Исправление не входило в очистку документации.
- Политика удаления/retention и интерфейс каталога нескольких диалогов этим кодом не определены: нельзя обещать их по старым планам. Реализация других сервисов в этом checkout не проверялась.
- Проверка доступности 21.10.2026 была ограничена Chromium и компонентными тестами с тестовыми API-ответами. NVDA/JAWS/VoiceOver/TalkBack, Safari/Firefox и живой Agent не подтверждены. Чтение длинных потоковых ответов реальным AT и списки Safari остаются задачами ручной проверки; не добавлять обходы без воспроизведения.
- Последняя проверенная версия приложения перед очисткой документации — `ff9f702`: 36 файлов / 452 теста Vitest, TypeScript и штатная production-сборка прошли. Это запись о конкретном запуске, а не гарантия для будущих изменений.

## Материалы в docs

- [BLOG_CHEATSHEET.md](docs/BLOG_CHEATSHEET.md) — рабочая инструкция по публикациям; контент — `frontend/content/blog/`, изображения — `frontend/public/blog/`. Поля и сортировка реализованы в [posts.ts](frontend/src/lib/blog/posts.ts). Подвал статьи добавляется компонентом `ArticleFooter`, дублировать его в Markdown не нужно.
- Проектный HTML-пакет Веры: [описание](docs/AGENT_VERA_PROJECT_DESCRIPTION.html), [паспорт](docs/AGENT_VERA_PROJECT_PASSPORT.html), [критерии приёмки](docs/AGENT_VERA_ACCEPTANCE_CRITERIA.html), [дорожная карта](docs/AGENT_VERA_ROADMAP.html), [матрица сторон](docs/AGENT_VERA_STAKEHOLDER_MATRIX.html), [технический план](docs/AGENT_VERA_TECHNICAL_PLAN.html), [WBS](docs/AGENT_VERA_WBS.html). Это печатные проектные материалы; указанные планы и целевые метрики не являются результатами проверки приложения. Актуальные технические контракты описываются по исходникам выше.
- Личные документы автора в `docs/` не относятся к runtime или инструкциям агента; их содержание в память проекта не переносится.

Правила работы и проверки — в [AGENTS.md](AGENTS.md).
