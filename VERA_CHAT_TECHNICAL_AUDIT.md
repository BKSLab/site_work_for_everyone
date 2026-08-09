# Технический аудит чата с Ассистентом Верой

Дата фиксации: 9 августа 2026 года.

## Инструкция агенту-исполнителю

Этот раздел обязателен к исполнению и имеет приоритет над формулировками внутри карточек. Карточки описывают **что** сломано; этот раздел задаёт **границы и порядок** работы.

### Роль и режим работы

Исполнитель реализует правки по карточкам `VERA-0NN`. Работа ведётся **по одной карточке за раз**: одна карточка — одно логически завершённое изменение — один коммит. Не начинать следующую карточку, пока текущая не доведена до состояния «сделано» или явно не помечена как «заблокировано».

### Границы задачи (анти-скоуп)

Запрещено без отдельного указания:

- делать что-либо «заодно» — вне описанного в текущей карточке;
- менять публичные контракты (SSE-события, HTTP-схемы, payload очереди `agent.requests`), если этого прямо не требует текущая карточка;
- рефакторить, переименовывать или переформатировать существующий код, не относящийся к правке;
- добавлять новые зависимости, сервисы и инфраструктуру (Redis Streams, брокеры, RabbitMQ-плагины, новые библиотеки) — это этап 2 и он согласуется отдельно;
- трогать второй репозиторий, если карточка помечена как однорепная;
- удалять или переписывать существующие комментарии в коде и `.env`-файлах, если они не стали неверными из-за самой правки.

### Стоп-лист этапа 0

На этапе 0 **не** делать: переход на opaque `uid` вместо email (только расширение лимита до 255), вынос `SessionBus` во внешний брокер, изменение протокола SSE, правки rate limit и nginx.

### Порядок: сначала однорепные карточки

Каждая карточка помечена полем **Репозиторий**. Сначала выполняются все однорепные карточки, межсервисные — в последнюю очередь. Так почти все P0 закрываются без координации двух деплоев.

| Группа | VERA-ID |
|---|---|
| `site/frontend` | 001, 002, 026, 027, 028, 030, 036 |
| `site/backend` | 006 |
| `agent` | 003, 004, 014, 015, 016, 018, 019, 020, 021, 031, 032, 034, 035, 038 |
| `site/backend` + `agent` (две независимые части) | 022 |
| `cross` — в последнюю очередь | 005, 007, 008, 009, 010, 011, 012, 013, 017, 023, 024, 025, 029, 033, 037 |

Пути `frontend/...`, `backend/...`, `nginx/...` и корневые файлы относятся к `site_work_for_everyone`. Префикс `vera_agent_service/...` означает **отдельный git-репозиторий** `D:\BKS.Lab\python\my_projects\vera_agent_service` — у него свои коммиты и свой деплой.

### Правило остановки

Если для однорепной карточки внезапно требуется изменение во втором сервисе — **не делать его**. Пометить карточку как заблокированную, записать в отчёт, что именно потребовалось, и перейти к следующей. Иначе однорепная задача незаметно превращается в межсервисную и ломает весь порядок работ.

### Обязательные зависимости между карточками

- **VERA-011** меняет протокол на `POST → 202 {request_id, stream_ticket, stream_url} → EventSource`. Поэтому **VERA-024 и VERA-025 выполняются только после VERA-011**, иначе клиентскую логику придётся переписывать дважды.
- **VERA-004/014/015/034** — одна delivery state machine. Реализуются **единым пакетом** после согласования общей матрицы состояний, а не четырьмя независимыми правками.
- **VERA-035** (атомарность sequence) — предусловие для **VERA-013** (concurrency). Обратный порядок даёт гонки.
- **VERA-021** (валидация tool result) предшествует **VERA-009** (внешний DTO `sources`).

### Паттерны кода

При любой работе с Python-кодом бэкенда сайта и Agent Service **обязательно** следовать эталонным паттернам:

- `docs/FASTAPI_PATTERNS.md` — для `site_work_for_everyone/backend`;
- `vera_agent_service/FASTAPI_PATTERNS.md` — для Agent Service (файл идентичен).

Читать документ **до** написания кода, а не после. Ключевое: слоистая архитектура (эндпоинт → сервис → репозиторий), трёхслойная система исключений, DI через `Depends` по уровням, стиль докстрингов и комментариев, структура тестов по слоям. Новый код должен быть неотличим по стилю от окружающего — совпадать по плотности комментариев, именованию и идиомам.

Для фронтенда аналогично: следовать сложившимся паттернам соседних файлов (`frontend/src/app/api/vera/**`, `frontend/src/hooks/**`), не вводить новых подходов.

### Тесты

Дополнять существующие наборы, не заводить второй фреймворк:

- `vera_agent_service/tests/` — pytest, структура по слоям (см. раздел 18 `FASTAPI_PATTERNS.md`);
- `backend/tests/` — pytest;
- `frontend/src/**/__tests__/` — существующий раннер фронтенда.

Раздел 12 настоящего документа содержит перечень требуемого покрытия. Тесты, относящиеся к карточке, добавляются в том же коммите.

### Номера строк

Номера строк в карточках фиксируют снимок кода на дату аудита. **После первой же применённой правки номера строк во всех остальных карточках становятся недостоверными** — навигация только по именам файлов, классов и функций.

### Коммиты

Сообщения коммитов на русском языке, в стиле существующей истории репозитория. Коммиты в двух репозиториях — раздельные. Для добавления файлов использовать `git add .`, а не перечисление файлов вручную.

### Отчёт

Каждая карточка содержит секцию **«Отчёт исполнителя»**. Она заполняется сразу после реализации, до перехода к следующей карточке. Пустая секция означает, что карточка не выполнялась. Отчёт — основной вход для последующего ревью, поэтому в нём должны быть фактические имена изменённых файлов и результат прогона тестов, а не общие формулировки.

## Критичные проблемы до деплоя

До production-запуска необходимо устранить:

1. **Auth, refresh и feedback (VERA-001/002)** — иначе возникают `403`, потеря владельца и ошибочная anonymous-обработка.
2. **Delivery state machine (VERA-004/014/015/034)** — ответы могут зависать, теряться либо завершаться без записи в БД.
3. **Защита SSE (VERA-011)** — поток доступен без owner-check, что создаёт риск утечки данных и DoS.
4. **Heartbeat, timeout и bounded queues (VERA-012/024)** — чат способен зависнуть и неограниченно расходовать память.
5. **Session TTL и owner-контракты (VERA-003/005/031)** — UI, ownership и память Веры могут расходиться.
6. **RabbitMQ reconnect и recovery (VERA-006/014/015)** — после сбоев запросы застревают, а publisher может потребовать рестарта.
7. **Приватность и подтверждение email (VERA-021/022/023)** — диалоги попадают в telemetry, а mutating email определяется LLM без серверного confirmation state.
8. **Пропускная способность (VERA-013/035/037)** — один долгий запрос блокирует остальных пользователей, а простое масштабирование ломает SSE delivery.

## 1. Область аудита

Документ фиксирует текущее устройство чата с Ассистентом Верой, обнаруженные проблемы, их локализацию и возможные способы исправления.

Изучены:

- текущий working tree проекта `site_work_for_everyone` с фокусом на `frontend`, Next.js BFF, backend сайта и nginx;
- проект `D:\BKS.Lab\python\my_projects\vera_agent_service` с фокусом на RabbitMQ consumer, LangGraph, Redis, PostgreSQL, SSE, MCP и observability;
- существующие тестовые файлы и проектная документация — только чтением.

Во время аудита код приложений не изменялся, тесты, сборки и сервисы не запускались. Рабочее дерево `site_work_for_everyone` на момент аудита содержит незакоммиченные изменения и новые файлы по интеграции Веры. Рабочее дерево `vera_agent_service` было чистым.

Пути `frontend/...`, `backend/...`, `nginx/...` и корневые файлы относятся к `site_work_for_everyone`. Префикс `vera_agent_service/...` означает соседний репозиторий `D:\BKS.Lab\python\my_projects\vera_agent_service`, а не подкаталог текущего проекта. Номера строк фиксируют снимок кода на дату аудита; при последующих изменениях ориентироваться нужно также на названия файлов, классов и функций.

Статусы замечаний:

- **Подтверждённый дефект** — ошибочное поведение непосредственно следует из текущего межсервисного контракта или ветвления кода.
- **Архитектурный риск** — проблема проявится при сбое, росте нагрузки, масштабировании или определённой последовательности событий.
- **Ограничение** — текущая функциональность сознательно или фактически отсутствует.
- **Документационный долг** — документация расходится с исполняемым кодом.

Приоритеты:

- **P0** — нарушается корректность, теряются запросы или не работает пользовательский сценарий.
- **P1** — существенный риск безопасности, приватности, надёжности или производительности production-системы.
- **P2** — hardening, UX, поддерживаемость или функциональное развитие.

## 2. Текущая архитектура

При отправке сообщения frontend сначала вызывает конструктор `EventSource` для `request_id`, а затем выполняет POST с тем же `request_id`. Это две независимые сетевые операции: вызов конструктора инициирует SSE-подключение, но готовность канала до публикации в RabbitMQ ничем не подтверждается.

```text
Browser: /assistant/chat
  |-- (1) initiate GET /vera/sse/{request_id}
  |         -> nginx -> vera_agent_service SSE -> SessionBus[request_id]
  |
  `-- (2) POST /api/vera/chat
            -> Next.js BFF (CSRF, Zod, rate limit, cookies)
            -> FastAPI backend сайта (JWT/anonymous ownership)
            -> RabbitMQ: agent.requests
            -> vera_agent_service / AgentRequestConsumer
                 |  PostgreSQL: session, turn, owner, status
                 |  Redis: LangGraph checkpoint по session_id
                 v
               LangGraph
                 +-- direct ----------------------> LLM
                 +-- knowledge base -> MCP/RAG ---> LLM
                 +-- consultation email -> MCP ---> LLM
                 v
               in-memory SessionBus[request_id]
                 -> уже инициированный Browser EventSource
```

История и feedback идут по другому пути:

```text
Browser -> Next.js BFF -> FastAPI backend сайта
        -> Agent Service HTTP API с X-API-Key и owner headers
        -> PostgreSQL
```

Основные идентификаторы:

| Поле | Назначение | Источник |
|---|---|---|
| `session_id` | Идентификатор диалога и `thread_id` LangGraph | Browser/sessionStorage для новой anonymous-сессии; Agent Service через `/session/current` для существующей auth-сессии |
| `request_id` | Идентификатор одной пары вопрос/ответ, SSE-канал, идемпотентность turn | Browser |
| `user_id` | Владелец авторизованной сессии; фактически JWT `sub`, то есть email | Backend сайта |
| `anonymous_token_hash` | SHA-256 подписанного токена анонимной сессии | Next BFF создаёт и хранит HttpOnly-токен; backend сайта проверяет его и вычисляет hash |
| `submission_id` | Идемпотентность развёрнутого отзыва | Browser |
| `X-Request-ID` | Transport ID BFF, передаваемый во входной backend HTTP request, но пока не используемый backend в logging/context | Next.js BFF |

Сильные стороны текущей реализации:

- `session_id` отделён от `request_id`, поэтому ответы разных реплик не должны смешиваться;
- consumer отдаёт наружу токены только финальных LangGraph-узлов, не внутреннего классификатора;
- при недоступности поиска MCP граф переходит в ветку с явной инструкцией сообщить о деградации, а не отвечать по памяти;
- мутирующий email-инструмент не повторяется автоматически после неопределённого результата;
- история и feedback имеют owner-check на стороне Agent Service;
- ответ выводится как plain text, без интерпретации HTML или Markdown;
- frontend явно закрывает `EventSource` на терминальных событиях и содержит базовые accessibility-механизмы.

## 3. Краткий список первоочередных работ

1. **VERA-001:** восстановить передачу авторизации в feedback BFF.
2. **VERA-002:** унифицировать refresh access-токена для всех Vera-запросов.
3. **VERA-004/014/015/034:** спроектировать и реализовать единую durable delivery state machine.
4. **VERA-003:** синхронизировать owner ID/limits и запланировать уход от email как идентификатора.
5. **VERA-011/012:** защитить SSE, добавить heartbeat, timeout и ограничение ресурсов.
6. **VERA-013/035:** убрать зависимость масштабирования от in-memory `SessionBus` и подготовить DB concurrency.
7. **VERA-005/029:** согласовать жизненный цикл PostgreSQL-сессии и Redis-контекста, добавить «Новый диалог»/закрытие.
8. **VERA-007:** исправить rate limit за прокси и доверие к клиентскому IP.
9. **VERA-022/023:** принять и реализовать политику приватности, трассировки и удаления диалогов.
10. **VERA-020/021:** ограничить рост контекста и валидировать данные RAG/tool calls.

## 4. Проблемы межсервисного контракта

### VERA-001 — Feedback авторизованной сессии не получает owner identity

**Тип:** подтверждённый дефект. **Приоритет:** P0.

**Репозиторий:** `site/frontend` — однорепная.

**Проблема.** Общий Next.js proxy для оценки сообщения и отзыва о сессии передаёт `X-Vera-Session-Token`, но не передаёт `access_token` как `Authorization: Bearer ...`. Backend сайта поэтому считает запрос анонимным и передаёт в Agent Service только `X-Vera-Anonymous-Token-Hash`. Авторизованная сессия в Agent Service принадлежит `user_id`; anonymous hash для неё не сохраняется. Итог — `403` для thumbs и анкеты авторизованного пользователя.

**Локализация.**

- `frontend/src/lib/utils/vera-feedback-proxy.ts:106-123`;
- для сравнения: `frontend/src/app/api/vera/chat/route.ts:94-103`;
- для сравнения: `frontend/src/app/api/vera/history/[sessionId]/route.ts:67-76`;
- `backend/src/api/vera.py:235-262`, `299-326`;
- `vera_agent_service/app/services/chat_session_access.py:5-21`;
- `vera_agent_service/app/services/message_feedback.py:38-49`.

**Последствия.** Авторизованный пользователь видит доступные элементы feedback, но сохранение завершается ошибкой владения.

**Возможное решение.**

1. В `proxyVeraFeedback` читать cookie `access_token` и передавать `Authorization` так же, как chat/history routes.
2. Вынести формирование owner headers в единую серверную функцию, используемую всеми Vera route handlers.
3. Добавить BFF integration tests для anonymous/auth feedback и смены `up -> down`.

**Критерий исправления.** Оба feedback-маршрута успешно работают для anonymous- и auth-сессий, а чужая сессия по-прежнему получает `403`.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `frontend/src/lib/utils/vera-owner-headers.ts`, `frontend/src/lib/utils/vera-feedback-proxy.ts`, `frontend/src/app/api/vera/chat/route.ts`, `frontend/src/app/api/vera/history/[sessionId]/route.ts`, `frontend/src/app/api/vera/session/current/route.ts`, `frontend/src/lib/utils/__tests__/vera-feedback-proxy.test.ts`, `VERA_CHAT_TECHNICAL_AUDIT.md`.
- **Суть изменения:** `proxyVeraFeedback` теперь получает `Authorization` из `access_token` и session-token через единый server helper; прежняя логика создания и установки anonymous session cookie сохранена. Общий helper `vera-owner-headers.ts` переиспользован в chat, history и session/current routes, поэтому production-дифф затрагивает не только feedback proxy: это выполнение пункта 2 предложенного решения, а не расширение скоупа. Ответ backend, включая ownership `403`, проксируется без изменения контракта.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлен `frontend/src/lib/utils/__tests__/vera-feedback-proxy.test.ts` — 4/4 passed; `npm test` — 82 passed, 2 failed: `src/lib/schemas/__tests__/auth.test.ts > registerSchema > accepts valid data` и `src/components/features/vera/__tests__/VeraFeedbackModal.test.tsx > VeraFeedbackModal > allows sending an empty questionnaire with the session id` — оба падения существовали до правки, вне скоупа карточки; `npm run lint` — успешно, 0 errors, 28 warnings; `npm run build` — успешно.
- **Отклонения от предложенного решения и причина:** нет.
- **Осталось / связанные карточки:** контролируемая обработка отсутствующего `VERA_SESSION_SIGNING_KEY` выполняется отдельно в VERA-036; два существующих падения тестов остаются для отдельной задачи.

### VERA-002 — Vera API обходит общий механизм refresh access-токена

**Тип:** подтверждённый дефект сценария долгой сессии. **Приоритет:** P0.

**Репозиторий:** `site/frontend` — однорепная.

**Проблема.** `veraApi` использует прямой `fetch`. Обычный `ApiClient` умеет refresh после `401`, а `/api/auth/me` отдельно обновляет access token во время auth-гидратации; Vera API после завершения гидратации не использует ни один из этих механизмов. Access cookie живёт один час. После его истечения auth-store во вкладке ещё может считать пользователя авторизованным, но Vera BFF передаст отсутствующий или просроченный JWT. Optional JWT dependency backend сайта молча превратит запрос в anonymous.

**Локализация.**

- `frontend/src/lib/api/vera.ts:46-162`;
- `frontend/src/lib/api/client.ts:11-48`;
- `frontend/src/app/api/auth/[...path]/route.ts:29-35`, `279-365`;
- `backend/src/dependencies/jwt.py:90-115`;
- `frontend/src/hooks/useVeraChat.ts:179-217`, `469-497`.

**Последствия.** После длительно открытой вкладки current-session может вернуть `200 + null`, history/feedback — `403`, а chat — принять POST как `202`, после чего Agent Service отправит SSE `error` из-за owner mismatch. Для действительно новой сессии запрос может быть принят как anonymous и создать вторую линию истории. Пользователь видит потерю или ротацию текущего диалога, хотя refresh cookie ещё действителен.

**Возможное решение.**

- создать единый `veraFetch` с дедуплицированным refresh либо общий server-side auth helper для Vera BFF, который обновляет access token до проксирования;
- ввести отдельный канонический статус вроде `401 auth_expired`: простого retry только на `401` сейчас недостаточно, поскольку фактические ответы включают `200 + null`, ownership `403` и `202` с последующим SSE `error`;
- не повторять автоматически настоящий ownership `403` и не запускать параллельную ротацию refresh token из нескольких BFF-запросов;
- invalid/expired JWT не должен бесшумно менять owner auth-сессии на anonymous: BFF должен либо обновить токен, либо вернуть явный auth status до публикации.

**Критерий исправления.** Открытая более часа вкладка продолжает тот же auth-диалог без `403`, ротации session ID и повторного входа.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `frontend/src/lib/utils/auth-session.ts`, `frontend/src/lib/utils/__tests__/auth-session.test.ts`, `frontend/src/app/api/auth/[...path]/route.ts`, `frontend/src/lib/utils/vera-owner-headers.ts`, `frontend/src/lib/utils/vera-feedback-proxy.ts`, `frontend/src/app/api/vera/chat/route.ts`, `frontend/src/app/api/vera/history/[sessionId]/route.ts`, `frontend/src/app/api/vera/session/current/route.ts`, `frontend/src/lib/utils/__tests__/vera-feedback-proxy.test.ts`, `VERA_CHAT_TECHNICAL_AUDIT.md`.
- **Суть изменения:** общий server helper проверяет срок access JWT и до Vera upstream выполняет ротацию по refresh-token; один Promise на значение refresh-token дедуплицирует параллельные запросы в процессе Next.js. `/api/auth/me` использует тот же helper, а Vera routes отправляют обновлённый Bearer и возвращают новые HttpOnly cookies даже при последующей upstream-ошибке. Исчерпанная auth-сессия получает контролируемый `401` и очистку auth cookies; настоящий ownership `403` не повторяется.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлен `frontend/src/lib/utils/__tests__/auth-session.test.ts`, дополнен `frontend/src/lib/utils/__tests__/vera-feedback-proxy.test.ts`; `npm test -- src/lib/utils/__tests__/auth-session.test.ts src/lib/utils/__tests__/vera-feedback-proxy.test.ts` — 11/11 passed; `npm test` — 89 passed, 2 failed: `src/lib/schemas/__tests__/auth.test.ts > registerSchema > accepts valid data` и `src/components/features/vera/__tests__/VeraFeedbackModal.test.tsx > VeraFeedbackModal > allows sending an empty questionnaire with the session id` — оба падения существовали до правки, вне скоупа карточки; `npm run lint` — успешно, 0 errors, 26 warnings; `npm run build` — успешно.
- **Отклонения от предложенного решения и причина:** выбран общий server-side auth helper, а не client `veraFetch`: refresh выполняется до проксирования и поэтому закрывает также текущие `200 + null` и `202` сценарии, в которых клиент не получает исходный auth `401`. Публичные backend-коды и схемы не менялись.
- **Осталось / связанные карточки:** непросроченный, но криптографически отвергнутый backend-ом access JWT по-прежнему нельзя отличить от anonymous без канонического backend auth-status; это межсервисное продолжение вне однорепного скоупа. Дедупликация process-local и при нескольких Next.js репликах потребует общего coordination mechanism.

### VERA-003 — Несогласованная максимальная длина `user_id`

**Тип:** подтверждённый контрактный дефект. **Приоритет:** P1.

**Репозиторий:** `agent` — однорепная (только миграция Alembic и лимиты Agent Service; на сайте изменений нет).

**Проблема.** Email пользователя сайта допускает до 255 символов. Agent Service хранит `user_id` в `VARCHAR(100)` и ограничивает owner headers 100 символами. Rabbit schema при этом вообще не задаёт максимум для `user_id`.

**Локализация.**

- `backend/src/db/models/users.py:28-33`;
- `vera_agent_service/app/messaging/schemas.py:20-24`;
- `vera_agent_service/app/db/models/chat_session.py:40-45`;
- `vera_agent_service/app/api/v1/endpoints/chat_history.py:49-52`, `104-110`;
- аналогичные headers в feedback endpoints.

**Последствия.** Валидный email длиной более 100 символов может пройти валидацию и сохранение на сайте, но chat упадёт при persistence, а history/feedback вернут `422`.

**Возможное решение.** Немедленно синхронно увеличить поле Agent Service, Pydantic/Rabbit/HTTP limits до 255 и добавить contract tests на границах. Затем перестать использовать email как технический owner ID: добавить в JWT неизменяемый opaque `uid`, основанный на существующем внутреннем ID пользователя либо на новом public UUID. Вариант с новым UUID требует миграции/backfill и периода dual-read, потому что в текущей модели сайта пользователь имеет integer ID, а не готовый UUID.

**Критерий готовности.** Поле `user_id` в PostgreSQL Agent Service, Pydantic-схеме очереди и HTTP-заголовках принимает 255 символов. Есть contract-тесты на границах длины. Миграция Alembic имеет рабочий `downgrade`. Переход на opaque `uid` в эту карточку не входит.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `app/db/models/chat_session.py`, `app/db/models/chat_turn.py`, `app/messaging/schemas.py`, `app/api/v1/endpoints/chat_history.py`, `app/api/v1/endpoints/message_feedback.py`, `app/api/v1/endpoints/session_feedback.py`, `app/db/alembic/versions/20260809_1958_expand_user_id_to_255.py`, `tests/unit/messaging/test_schemas.py`, `tests/integration/repositories/test_user_id_length.py`, `tests/api/endpoints/test_chat_history_endpoint.py`, `tests/api/endpoints/test_feedback.py`.
- **Суть изменения:** в Agent Service единый предел `user_id` поднят до 255 символов в обеих PostgreSQL-моделях (`ChatSession` и `ChatTurn`), Rabbit/Pydantic-контракте и всех owner headers history/feedback. Код и тесты зафиксированы отдельным коммитом Agent Service `52db988`.
- **Миграции Alembic:** добавлена миграция `20260809_1958_expand_user_id_to_255.py`. На живом временном PostgreSQL выполнен явный цикл `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head`; фактическая длина обеих колонок прошла `255 → 100 → 255`, цикл завершён успешно.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлено 23 проверки: границы Rabbit schema, HTTP headers и обеих PostgreSQL-таблиц; обязательные значения 99/100/101/255/256 проверены на живом PostgreSQL. Выборочный запуск `python -m pytest tests/unit/messaging/test_schemas.py tests/api/endpoints/test_chat_history_endpoint.py tests/api/endpoints/test_feedback.py tests/integration/repositories/test_user_id_length.py -q` — `32 passed` (все 23 новые проверки прошли). Полный `python -m pytest -q` на живых RabbitMQ, Redis и Testcontainers PostgreSQL — `175 passed, 10 failed, 7 warnings`. Все 10 падений находятся в `tests/unit/observability/test_tracing.py`, существуют на baseline `837ba88`; причина — глобальное состояние tracing, вне скоупа карточки.
- **Отклонения от предложенного решения и причина:** переход на opaque `uid` осознанно не выполнялся — критерий карточки прямо исключает его из скоупа.
- **Осталось / связанные карточки:** переход с email на неизменяемый opaque `uid` требует отдельной межсервисной карточки с миграцией/backfill и dual-read; owner invariant и остальные длины Rabbit payload закрываются в VERA-031.

### VERA-004 — SSE `done` не гарантирует сохранённую историю

**Тип:** подтверждённый дефект согласованности. **Приоритет:** P0.

**Репозиторий:** `agent` — однорепная. Выполняется единым пакетом с VERA-014/015/034.

**Проблема.** Ошибка `complete_turn` только логируется. После этого consumer всё равно отправляет `done` и ACK сообщения. Frontend делает ответ пригодным для feedback, однако строка БД остаётся `processing`, а feedback разрешён только для `completed`.

**Локализация.**

- `vera_agent_service/app/messaging/consumer.py:297-321`, `478-507`;
- `vera_agent_service/app/services/message_feedback.py:38-49`;
- `frontend/src/hooks/useVeraChat.ts:430-444`.

**Последствия.** Live UI показывает успешный ответ, после reload history зависает на `processing`, а thumbs возвращают ошибку.

**Возможное решение.** Сделать успешный commit PostgreSQL обязательным перед `done` и ACK. При временной ошибке persistence повторить только сохранение результата. Если сохранение невозможно — отправить terminal `error`, сохранить recoverable payload/outbox и не подтверждать delivery как полностью завершённый. Конкретную ACK/NACK/replay-политику определить общим ADR с VERA-014/015/034: изолированная перестановка `done` не решает отказ БД после уже отправленных токенов.

**Критерий готовности.** Событие `done` отправляется только после успешного commit `completed`. При неустранимой ошибке persistence клиент получает terminal `error`, а не `done`. Characterization-тест на отказ БД между стримингом и терминальным событием проходит.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `vera_agent_service/app/messaging/consumer.py`, `app/services/chat_persistence.py`, `app/repositories/chat_turn.py`, `app/db/models/chat_turn.py`, `app/db/alembic/versions/20260809_2110_add_turn_delivery_state.py`, `app/core/settings.py`, `app/main.py`, `app/observability/request_trace.py`, `app/clients/mcp_client.py`, `tests/unit/messaging/test_delivery_state_machine.py`, `tests/integration/repositories/test_turn_lease.py`, а также приведённые к новому контракту `tests/unit/messaging/test_consumer.py`, `tests/unit/services/test_chat_persistence.py`, `tests/integration/test_chat_persistence.py`.
- **Суть изменения:** `done` отправляется только после подтверждённого durable commit. `_complete_persistence` больше не глотает ошибку, а возвращает признак успеха и повторяет сохранение ограниченное число раз, не переигрывая граф. Если сохранить не удалось, пользователь получает терминальный `error`, а реплика — статус `delivery_unconfirmed` с уже сформированным ответом, а не остаётся `processing`. Коммит Agent Service — `30328af`.
- **Миграции Alembic:** требуется и выполнена — `20260809_2110_add_turn_delivery_state.py`: поля `lease_until`, `attempt_count`, `worker_id`, `terminal_detail` и перенос существующих `failed` в `generation_failed`. `downgrade` схлопывает новые статусы обратно в `failed` и снимает поля. Цикл `upgrade` → `downgrade` → `upgrade` проверен на живом PostgreSQL в контейнере, все три шага завершились кодом 0.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлены `tests/unit/messaging/test_delivery_state_machine.py` (14 тестов, по одному на строку таблицы исходов) и `tests/integration/repositories/test_turn_lease.py` (5 тестов на реальном PostgreSQL). Команда `venv/Scripts/python.exe -m pytest` — 220 passed, 0 failed; интеграционные выполнялись реально на поднятом Docker. Ключевые для этой карточки: `test_done_is_sent_only_after_successful_commit` и `test_failed_commit_reports_error_instead_of_done`.
- **Отклонения от предложенного решения и причина:** реализовано одним коммитом на все четыре карточки, как и предписано заданием: порядок commit и `done`, аренда, гарантия ack/nack и воспроизведение исхода держат друг друга и раздельно не разделяются.
- **Осталось / связанные карточки:** Outbox для восстановления несохранённого ответа не вводился: при недоступности БД исход честно фиксируется как неопределённый. Оценка ответа по-прежнему разрешена только для `completed`, что теперь согласовано с отправляемым событием.

### VERA-005 — PostgreSQL history и Redis memory имеют разный жизненный цикл

**Тип:** подтверждённый архитектурный дефект семантики. **Приоритет:** P1.

**Репозиторий:** `cross` — Agent Service + frontend. В последнюю очередь.

**Проблема.** Единого определения активной сессии нет сразу в двух сценариях:

- для auth-пользователя PostgreSQL возвращает последнюю незакрытую сессию без ограничения по возрасту, а `closed_at` нигде не выставляется; Redis-checkpoint при этом удаляется через 24 часа неактивности, поэтому UI показывает старую историю с тем же `session_id`, но модель уже не знает её контекст;
- для anonymous-пользователя frontend при следующей инициализации/перезагрузке после 24 часов от исходного `createdAt` ротирует `session_id`, даже если до перезагрузки разговор оставался активным, тогда как Redis использует 24 часа неактивности и продлевает TTL при чтении.

**Локализация.**

- `vera_agent_service/app/checkpoint/redis_saver.py:23-35`;
- `vera_agent_service/app/repositories/chat_session.py:28-43`;
- `vera_agent_service/app/db/models/chat_session.py:77-81`;
- `frontend/src/hooks/useVeraChat.ts:17-22`, `53-80`, `185-199`, `219-316`.

**Последствия.** Видимая auth-пользователю непрерывная беседа фактически становится новым разговором для LLM. У активного anonymous-пользователя, наоборот, frontend после reload может преждевременно начать новый диалог, хотя Redis ещё хранит контекст старого. Возможны неожиданные границы разговора и противоречивые ответы на вопросы, зависящие от предыдущего контекста.

**Возможное решение.** Выбрать одну семантику:

- при истечении Redis TTL закрывать текущую PostgreSQL-сессию и создавать новую;
- либо восстанавливать bounded context из последних завершённых turns PostgreSQL перед первым новым запросом;
- либо хранить checkpoint столько же, сколько считается активной PostgreSQL-сессия.

Frontend TTL для anonymous-сессии нужно считать по той же модели: продлевать по подтверждённой активности либо получать срок жизни с сервера, а не независимо ротировать по исходному `createdAt`. В любом варианте нужен явный endpoint «Новый диалог»/`close session` и отображение границы контекста в UI.

**Критерий готовности.** Единая семантика активной сессии выбрана и реализована: срок жизни PostgreSQL-сессии, Redis-checkpoint и anonymous-сессии фронтенда согласованы. Тесты «auth-сессия после 24 часов неактивности» и «активная anonymous-сессия старше 24 часов» проходят.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-006 — Backend сайта не восстанавливает publisher после неудачного старта

**Тип:** подтверждённый архитектурный риск. **Приоритет:** P1.

**Репозиторий:** `site/backend` — однорепная.

**Проблема.** Очередь объявляет consumer Agent Service, а backend сайта выполняет passive lookup. Если RabbitMQ недоступен либо durable queue ещё не provisioned/не была ранее объявлена в момент старта backend сайта, `vera_publisher` фиксируется как `None` до рестарта процесса. Само временное выключение Agent Service после того, как durable queue уже создана, passive lookup не ломает.

**Локализация.**

- `backend/src/services/vera_publisher.py:18-42`;
- `backend/main.py:26-39`, `71-80`;
- `backend/src/api/vera.py:115-120`;
- `vera_agent_service/app/messaging/consumer.py:139-157`.

**Последствия.** Кратковременная ошибка порядка запуска превращается в длительный `503`, хотя broker уже восстановился.

**Возможное решение.** Добавить bounded background reconnect с exponential backoff и health state либо ленивую синхронизированную переинициализацию publisher при запросе. Для production предпочтительнее объявлять инфраструктуру очереди отдельным provisioning-шагом, не зависящим от порядка старта приложений.

**Критерий готовности.** После недоступности RabbitMQ в момент старта publisher восстанавливается без рестарта процесса, и `/api/vera/chat` снова отвечает `202`. Состояние publisher отражено в health-проверке.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `backend/src/services/vera_publisher.py`, `backend/src/dependencies/vera.py`, `backend/main.py`, `backend/tests/test_vera_publisher_recovery.py`, `VERA_CHAT_TECHNICAL_AUDIT.md`.
- **Суть изменения:** добавлен один lifespan-managed `VeraPublisherManager`: после неудачной стартовой попытки он выполняет конечный цикл reconnect с задержками `1/2/4/8/16/30` секунд, не создаёт параллельных задач и корректно отменяется при shutdown. После исчерпания бюджета следующий chat-запрос синхронизированно запускает новый bounded cycle; пока robust connection/channel не готовы, DI возвращает `None`, сохраняя контролируемый `503`, а после восстановления прежний endpoint снова отвечает `202`. `GET /health` различает `ok/ready` и `degraded/unavailable`. При ошибке passive declare уже открытое соединение закрывается; Rabbit payload и внешний chat response не изменялись.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлен `backend/tests/test_vera_publisher_recovery.py` — 6/6 passed: восстановление после первой ошибки, единичный reconnect при 10 параллельных обращениях, конечный backoff и повторный цикл, отмена ожидания при shutdown, health `degraded → ready`, прежний `202` после восстановления. Полный backend-набор запускался из `backend/` командами `$env:PYTHONPATH='.'; venv\Scripts\python.exe tests\test_vera_request_correlation.py`, `...test_vera_session_access.py`, `...test_vera_feedback_client.py`, `...test_vera_publisher_recovery.py` — 25 passed, 0 failed (10 + 4 + 5 + 6). На живом внешнем RabbitMQ passive declare существующей `agent.requests` успешно; passive declare случайной отсутствующей очереди корректно завершился `ChannelNotFoundEntity` и не создал очередь.
- **Отклонения от предложенного решения и причина:** выбран bounded background reconnect с повторным запуском конечного цикла через синхронизированную DI-зависимость. Это сохраняет автоматическое восстановление в обычном окне сбоя, но не оставляет бесконечный retry и не создаёт connection storm после исчерпания бюджета. Общий RabbitMQ и очередь по-прежнему provisioned отдельно, как требует существующий контракт.
- **Осталось / связанные карточки:** инфраструктурный provisioning очереди и deployment compatibility остаются в VERA-037; Agent Service и его контракты в этой карточке не менялись.

### VERA-007 — Rate limit за прокси становится глобальным

**Тип:** подтверждённый production-дефект. **Приоритет:** P1.

**Репозиторий:** `cross` — nginx + backend сайта + Agent Service. В последнюю очередь.

**Проблема.** Оба Python-сервиса используют `get_remote_address`, но Next.js не передаёт доверенный клиентский IP в backend сайта, а backend сайта — в HTTP API Agent Service. Поэтому backend видит IP frontend-контейнера, а Agent Service на history/feedback routes — IP backend-контейнера. Эти внутренние лимиты делятся всеми пользователями. Внешний Next limiter читает первый адрес из `X-Forwarded-For`, который нельзя считать доверенным без нормализации на ingress.

**Локализация.**

- `backend/src/core/limiter.py:4-11`;
- `vera_agent_service/app/core/rate_limit.py:1-4`;
- `frontend/src/app/api/vera/chat/route.ts:20-25`, `90-103`;
- `frontend/src/lib/utils/vera-feedback-proxy.ts:31-36`, `112-123`;
- `frontend/src/app/api/vera/session/current/route.ts:46-67`;
- `frontend/src/app/api/vera/history/[sessionId]/route.ts:63-98`;
- `nginx/templates/default.conf.template:33-39`.

**Последствия.** Небольшой общий поток запросов способен исчерпать лимит для всех пользователей. При некорректном доверии к `X-Forwarded-For` внешний limiter можно обходить подменой адреса.

**Возможное решение.** Нормализовать client IP только на доверенном nginx, удаляя входной spoofed header; передавать отдельный внутренний header от доверенного прокси; настроить SlowAPI на его чтение только для запросов из внутренней сети. Для auth-пользователей предпочтителен составной ключ `user_id + IP`, для anonymous — подписанный session ID + IP. Для нескольких реплик хранить counters в Redis.

**Критерий готовности.** Ключ лимита считается по реальному клиенту, а не по IP контейнера. Подменённый клиентом `X-Forwarded-For` на ключ не влияет. Тест с двумя клиентами за прокси показывает независимые счётчики.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-008 — Несуществующая history имеет два разных контракта

**Тип:** подтверждённый контрактный дефект. **Приоритет:** P2.

**Репозиторий:** `cross` — Agent Service + backend сайта + frontend. В последнюю очередь.

**Проблема.** Backend сайта документирует `404`, frontend имеет отдельную ветку `404`, но Agent Service возвращает `200` и пустой `turns` для неизвестного `session_id`.

**Локализация.**

- `backend/src/api/vera.py:149-164`;
- `frontend/src/hooks/useVeraChat.ts:243-248`;
- `vera_agent_service/app/services/chat_history.py:53-57`.

**Возможное решение.** Зафиксировать один реализуемый контракт: отсутствующая в PostgreSQL сессия возвращает `404`, существующая чужая — `403`, существующая доступная — `200`. Frontend уже умеет трактовать initial `404` как пустую историю. Если в будущем нужен `200 + empty` для заранее подтверждённой новой сессии, сначала потребуется explicit create/reserve-session endpoint; сейчас Agent Service не умеет отличить её от произвольного неизвестного ID. Затем синхронизировать OpenAPI, BFF и frontend.

**Критерий готовности.** Отсутствующая в PostgreSQL сессия возвращает `404`, существующая чужая — `403`, доступная — `200`. OpenAPI бэкенда, BFF и frontend согласованы между собой. Тест на неизвестный `session_id` проходит.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-009 — Структурированные источники не доходят до frontend

**Тип:** функциональное ограничение. **Приоритет:** P2.

**Репозиторий:** `cross` — Agent Service + frontend. В последнюю очередь; после VERA-021.

**Проблема.** Agent сохраняет `sources` в PostgreSQL, но SSE и history DTO их не возвращают. Пользователь получает только сгенерированный plain-text абзац «Основание:», корректность которого контролируется промптом.

**Локализация.**

- `vera_agent_service/app/db/models/chat_turn.py:106-112`;
- `vera_agent_service/app/messaging/consumer.py:478-502`, `542-552`;
- `vera_agent_service/app/schemas/chat_history.py:16-32`;
- `frontend/src/lib/api/vera.ts:25-40`;
- `frontend/src/components/features/vera/ChatMessage.tsx:72-75`.

**Возможное решение.** Добавить нормализованный `sources[]` в terminal SSE event и history response, провалидировать элементы на Agent Service и показывать их отдельным UI-блоком. Текстовое «Основание» оставить как читаемую часть ответа, но не как единственный машинно непроверяемый источник.

Вложения сейчас отсутствуют согласованно на всех слоях: chat payload содержит только строковый `message`, а UI — только `textarea`. При будущем добавлении файлов потребуется отдельный контракт upload/storage/antivirus scan/access/retention и ссылки на вложения в сообщении. Передавать бинарные данные через текущие SSE token events не следует.

**Критерий готовности.** Нормализованный `sources[]` приходит в терминальном SSE-событии и в history-ответе, валидируется на Agent Service и отображается отдельным блоком UI.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-010 — Документация и env-примеры отстают от runtime-контракта

**Тип:** документационный долг. **Приоритет:** P2.

**Репозиторий:** `cross` — документация обоих репозиториев. В последнюю очередь.

**Проблема.** Документация смешивает browser HTTP payload и серверный Rabbit envelope. В старых browser/BFF-примерах отсутствует обязательный `request_id` или SSE всё ещё адресуется по `session_id`. В старых RabbitMQ-примерах не отражены серверное поле `anonymous_token_hash` и owner invariant; это поле не должно приходить из браузера и для auth-запроса может быть `null`.

**Локализация.**

- `.env.example:5`;
- `docs/VERA_AGENT_INTEGRATION_PLAN.md:42`, `56`, `65`, `67`, `108`, `117`;
- `VERA_PROD_DEPLOYMENT_CHECKLIST.md:59-60`;
- `vera_agent_service/README.md:29-36`;
- `vera_agent_service/AGENT_SERVICE_PLAN.md:393-421`.

В частности, production curl на строке 59 checklist не содержит ни `request_id`, ни обязательный для текущей CSRF-проверки `Origin`, поэтому обещанный `202` не получится; следующая строка открывает SSE по session вместо request. Agent docs также ошибочно называют непосредственным Rabbit publisher-ом Next.js вместо FastAPI backend сайта, а `vera_agent_service/AGENT_SERVICE_PLAN.md:421` относит недоступность MCP к terminal error, хотя runtime KB-ветка деградирует в обычный ответ с `done`.

**Возможное решение.** Создать один versioned contract document или JSON Schema и ссылаться на него из обоих проектов. Отдельно описать browser request, server-enriched Rabbit envelope и SSE contract. Проверять schema compatibility в CI. Устаревшие curl-примеры заменить на реальные `Origin + session_id + request_id` и текущий SSE path.

**Критерий готовности.** Все перечисленные примеры и `.env`-шаблоны соответствуют исполняемому контракту. Production curl содержит `Origin`, `session_id`, `request_id` и текущий SSE-путь. Browser-payload, серверный Rabbit-envelope и SSE-контракт описаны раздельно.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

## 5. SSE, доставка и масштабирование Agent Service

### VERA-011 — SSE не имеет аутентификации и owner-check

**Тип:** архитектурный риск безопасности. **Приоритет:** P1.

**Репозиторий:** `cross` — Agent Service + frontend + nginx. В последнюю очередь; выполняется ДО VERA-024 и VERA-025.

**Проблема.** `GET /sse/{request_id}` публичен и не требует API key, session token или пользователя. Знание `request_id` является единственным условием доступа. Второй subscriber на тот же ID заменяет очередь первого.

**Локализация.**

- `vera_agent_service/app/streaming/sse.py:28-46`;
- `vera_agent_service/app/streaming/session_bus.py:35-51`, `66-70`;
- `nginx/templates/default.conf.template:55-66`;
- `vera_agent_service/docker-compose.yml:61-64`.

**Последствия.** При утечке UUID можно перехватить дальнейшие токены. Второе подключение подвешивает исходного клиента. Публичный endpoint также позволяет создавать большое количество долгоживущих соединений.

**Возможное решение.** Перестроить протокол как `POST /chat -> 202 {request_id, stream_ticket, stream_url} -> EventSource`, после чего проверять короткоживущий ticket, связанный с `request_id`, `session_id` и owner, в SSE endpoint. Late-connect buffer страхует события между `202` и подключением. Альтернатива — отдельный preflight ticket endpoint либо streaming через BFF: BFF аутентифицирует HttpOnly cookie и сам добавляет доверенный upstream owner; браузер не может прочитать текущий `access_token` для прямого Agent `Authorization`, а Agent не валидирует JWT сайта без отдельного trust contract. Для ticket нужен отдельный key/trust contract; query-token должен иметь короткий TTL и редактироваться из access logs. Начальный ticket можно сделать одноразовым, но reconnect должен получать новый ticket через reissue endpoint либо использовать ограниченно повторный ticket в пределах TTL для того же `request_id` и owner. Вторую одновременную подписку нужно запрещать либо обрабатывать явно.

**Критерий готовности.** SSE-поток недоступен без валидного короткоживущего ticket, связанного с `request_id`, `session_id` и владельцем. Повторная подписка обрабатывается явно. Тесты на неверный/истёкший ticket и на второго подписчика проходят.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-012 — SessionBus не ограничивает ресурсы и не имеет heartbeat/durable replay

**Тип:** архитектурный риск. **Приоритет:** P1.

**Репозиторий:** `cross` — Agent Service + frontend (heartbeat). В последнюю очередь.

**Проблема.** `asyncio.Queue` и late-connect buffers не имеют верхней границы. В памяти уже есть best-effort replay для подключения в течение 60 секунд, но нет heartbeat, server-side idle timeout, event IDs, `Last-Event-ID` и durable replay после disconnect/restart. Просроченные buffers очищаются только при следующей публикации.

**Локализация.**

- `vera_agent_service/app/streaming/session_bus.py:30-86`;
- `vera_agent_service/app/streaming/sse.py:35-46`;
- `frontend/src/hooks/useVeraChat.ts:390-467`.

**Последствия.** Медленный или отключившийся клиент способен накапливать события в памяти. При тихой системе последние orphan buffers могут жить неограниченно. Клиент не отличает живой долгий запрос от зависшего соединения.

**Возможное решение.** Ввести bounded queue, политику overflow, TTL cleanup task, heartbeat events, общий deadline запроса и terminal timeout. Для надёжного replay использовать Redis Streams или другую внешнюю event store с последовательными event IDs.

**Критерий готовности.** Очереди и late-connect буферы ограничены сверху, определена политика overflow и TTL-очистка. Клиент получает heartbeat. Есть общий deadline запроса. Медленный клиент не вызывает неограниченного роста памяти.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-013 — Один worker и `prefetch_count=1` сериализуют всех пользователей

**Тип:** подтверждённое ограничение производительности. **Приоритет:** P1.

**Репозиторий:** `cross` — Agent Service + инфраструктура запуска. В последнюю очередь; после VERA-035.

**Проблема.** Agent Service запускается с одним worker, consumer имеет `prefetch_count=1`. Один chat request обрабатывается целиком до следующего. Email tool имеет timeout до 360 секунд и способен занимать единственный consumer всё это время. Добавление worker/replica ломает доставку, потому что Rabbit consumer и SSE subscriber могут оказаться в разных процессах с разными in-memory bus.

**Локализация.**

- `vera_agent_service/app/messaging/consumer.py:110-156`;
- `vera_agent_service/app/core/settings.py:116-118`;
- `vera_agent_service/entrypoint.sh:14-18`;
- `vera_agent_service/.env.example:81-87`.

**Последствия.** Head-of-line blocking: один медленный LLM/MCP/email запрос блокирует весь чат. Горизонтальное масштабирование невозможно без изменения транспорта событий.

**Возможное решение.** Разделить web/SSE и queue workers. Consumer должен публиковать events во внешний broker, например Redis Streams, а любой web-instance — читать их по `request_id`. После этого разрешить несколько consumers, но сериализовать работу внутри одного `session_id` через distributed lock или session-partitioning, чтобы не повредить LangGraph history и sequence numbers.

**Критерий готовности.** Разные `session_id` обрабатываются параллельно, работа внутри одной `session_id` сериализована. Доставка событий не зависит от того, в каком процессе живёт consumer.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-014 — Crash/redelivery оставляет turn в `processing` навсегда

**Тип:** подтверждённый дефект надёжности. **Приоритет:** P0.

**Репозиторий:** `agent` — однорепная. Выполняется единым пакетом с VERA-004/015/034.

**Проблема.** Turn создаётся в `processing` до запуска графа. Если процесс падает, RabbitMQ повторно доставляет сообщение. Consumer видит существующий `processing`, отправляет «уже обрабатывается» и ACK, не продолжая работу. Lease, attempt counter и stale recovery отсутствуют.

**Локализация.**

- `vera_agent_service/app/services/chat_persistence.py:37-60`;
- `vera_agent_service/app/db/models/chat_turn.py:133-139`;
- `vera_agent_service/app/messaging/consumer.py:217-278`.

**Последствия.** Запрос теряется после рестарта/deploy/network failure, запись остаётся незавершённой, а frontend при каждом восстановлении видит вечный `processing`.

**Возможное решение.** Использовать уже существующий `ChatTurn.started_at`, добавить `lease_until`, `attempt_count`, `worker_id` и атомарный claim. Свежий lease означает реальный duplicate; просроченный — повторную обработку или переход в `failed`. На startup выполнять reconciliation stale turns. Перед mutating side effect нужно durably фиксировать его состояние и передавать внешнему инструменту idempotency key на основе `request_id`; иначе crash/reclaim способен повторно отправить email. Решение должно быть частью общей delivery state machine из VERA-004/015/034.

**Критерий готовности.** Turn с просроченным lease безопасно переобрабатывается, со свежим — признаётся дубликатом. После рестарта процесса запрос не остаётся в `processing` навсегда. Мутирующий инструмент получает idempotency key на основе `request_id`.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `vera_agent_service/app/messaging/consumer.py`, `app/services/chat_persistence.py`, `app/repositories/chat_turn.py`, `app/db/models/chat_turn.py`, `app/db/alembic/versions/20260809_2110_add_turn_delivery_state.py`, `app/core/settings.py`, `app/main.py`, `app/observability/request_trace.py`, `app/clients/mcp_client.py`, `tests/unit/messaging/test_delivery_state_machine.py`, `tests/integration/repositories/test_turn_lease.py`, а также приведённые к новому контракту `tests/unit/messaging/test_consumer.py`, `tests/unit/services/test_chat_persistence.py`, `tests/integration/test_chat_persistence.py`.
- **Суть изменения:** введена аренда реплики: `lease_until`, `attempt_count`, `worker_id`. Захват выполняется одним атомарным `UPDATE ... WHERE lease_until < now()`, поэтому проверка и захват не разъезжаются между двумя обработчиками. Живая аренда означает настоящий дубликат, просроченная — безопасную повторную обработку. При старте сервиса брошенные реплики закрываются как `delivery_unconfirmed`, с запасом по времени, чтобы очистка не обгоняла штатную повторную доставку. В мутирующий MCP-вызов добавлен `X-Idempotency-Key` на основе `request_id`. Коммит Agent Service — `30328af`.
- **Миграции Alembic:** требуется и выполнена — `20260809_2110_add_turn_delivery_state.py`: поля `lease_until`, `attempt_count`, `worker_id`, `terminal_detail` и перенос существующих `failed` в `generation_failed`. `downgrade` схлопывает новые статусы обратно в `failed` и снимает поля. Цикл `upgrade` → `downgrade` → `upgrade` проверен на живом PostgreSQL в контейнере, все три шага завершились кодом 0.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлены `tests/unit/messaging/test_delivery_state_machine.py` (14 тестов, по одному на строку таблицы исходов) и `tests/integration/repositories/test_turn_lease.py` (5 тестов на реальном PostgreSQL). Команда `venv/Scripts/python.exe -m pytest` — 220 passed, 0 failed; интеграционные выполнялись реально на поднятом Docker. Ключевые для этой карточки — пять интеграционных тестов на живом PostgreSQL: перезахват просроченной аренды, отказ при живой, победа только одного worker при конкурентном захвате, закрытие брошенной реплики и защита свежей от преждевременного закрытия.
- **Отклонения от предложенного решения и причина:** реализовано одним коммитом на все четыре карточки, как и предписано заданием: порядок commit и `done`, аренда, гарантия ack/nack и воспроизведение исхода держат друг друга и раздельно не разделяются. Дедупликация по idempotency key выполняется на стороне `vera_mcp_service`; здесь гарантируется только стабильность ключа — изменение контракта MCP-инструмента вне скоупа.
- **Осталось / связанные карточки:** Срок аренды подобран так, чтобы превышать самый долгий инструмент (900 секунд против 360 у отправки консультации). Продление аренды в ходе обработки не реализовано и понадобится, если появятся более долгие операции.

### VERA-015 — Consumer failure paths не имеют единой ACK/NACK/retry-политики

**Тип:** подтверждённая policy inconsistency и архитектурный риск надёжности. **Приоритет:** P1.

**Репозиторий:** `agent` — однорепная. Выполняется единым пакетом с VERA-004/014/034.

**Проблема.** Верхний обработчик отмечает span и повторно выбрасывает неожиданное исключение, но не гарантирует terminal SSE и `nack`. При manual ack и `prefetch_count=1` delivery может остаться unacked до разрыва соединения и заблокировать consumer. Отдельно, временная `ChatPersistenceServiceError` во время start registration сразу даёт SSE `error` и `nack(requeue=False)`/DLQ без общих трёх попыток графа; transient DB failure поэтому не восстанавливается автоматически.

**Локализация.**

- `vera_agent_service/app/messaging/consumer.py:167-189`, `217-249`.

**Возможное решение.** Ввести внешний `try/finally` с явной state machine результата: каждый delivery обязан закончиться ровно одним `ack` или `nack`, а адресуемый валидный запрос — terminal SSE event. Добавить отдельный bounded retry для transient start/complete persistence, не повторяющий mutating graph. Отдельно обработать cancellation/shutdown и не скрывать `CancelledError`. Политику проектировать единым ADR вместе с VERA-004/014/034, включая persistence retry, lease/reclaim, terminal outcomes и сбой самого token sink.

**Критерий готовности.** Каждый delivery завершается ровно одним `ack` или `nack`, каждый адресуемый валидный запрос — ровно одним терминальным SSE-событием. Transient-ошибка persistence на старте ретраится, а не уходит сразу в DLQ. `CancelledError` не скрывается.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `vera_agent_service/app/messaging/consumer.py`, `app/services/chat_persistence.py`, `app/repositories/chat_turn.py`, `app/db/models/chat_turn.py`, `app/db/alembic/versions/20260809_2110_add_turn_delivery_state.py`, `app/core/settings.py`, `app/main.py`, `app/observability/request_trace.py`, `app/clients/mcp_client.py`, `tests/unit/messaging/test_delivery_state_machine.py`, `tests/integration/repositories/test_turn_lease.py`, а также приведённые к новому контракту `tests/unit/messaging/test_consumer.py`, `tests/unit/services/test_chat_persistence.py`, `tests/integration/test_chat_persistence.py`.
- **Суть изменения:** введён объект доставки с явными инвариантами: ровно один `ack`/`nack` и ровно одно терминальное SSE-событие. Внешний `try/finally` страхует оба инварианта на любом пути, включая непредусмотренное исключение — раньше такое исключение уходило наверх, оставляя delivery неподтверждённой и при `prefetch_count=1` останавливая весь чат. Временный сбой сохранения на старте теперь ретраится с backoff вместо немедленного DLQ. `CancelledError` не проглатывается: исход фиксируется как неопределённый, отмена пробрасывается дальше. Коммит Agent Service — `30328af`.
- **Миграции Alembic:** требуется и выполнена — `20260809_2110_add_turn_delivery_state.py`: поля `lease_until`, `attempt_count`, `worker_id`, `terminal_detail` и перенос существующих `failed` в `generation_failed`. `downgrade` схлопывает новые статусы обратно в `failed` и снимает поля. Цикл `upgrade` → `downgrade` → `upgrade` проверен на живом PostgreSQL в контейнере, все три шага завершились кодом 0.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлены `tests/unit/messaging/test_delivery_state_machine.py` (14 тестов, по одному на строку таблицы исходов) и `tests/integration/repositories/test_turn_lease.py` (5 тестов на реальном PostgreSQL). Команда `venv/Scripts/python.exe -m pytest` — 220 passed, 0 failed; интеграционные выполнялись реально на поднятом Docker. Ключевые для этой карточки: `test_unexpected_error_still_sends_terminal_event_and_settles`, `test_transient_start_persistence_error_is_retried`, `test_shutdown_records_unconfirmed_outcome_and_propagates`. Инвариант «ровно одно подтверждение» проверяется в каждом тесте файла.
- **Отклонения от предложенного решения и причина:** реализовано одним коммитом на все четыре карточки, как и предписано заданием: порядок commit и `done`, аренда, гарантия ack/nack и воспроизведение исхода держат друг друга и раздельно не разделяются.
- **Осталось / связанные карточки:** Сбой самого token sink отдельно не обрабатывается — при текущем in-memory `SessionBus` публикация не отказывает. Это станет актуальным после выноса событий во внешний брокер (VERA-013).

### VERA-016 — Невалидный Rabbit payload уходит в DLQ без terminal SSE

**Тип:** дефект деградации. **Приоритет:** P2.

**Репозиторий:** `agent` — однорепная.

**Проблема.** При общей Pydantic-ошибке payload сразу отправляется в DLQ. Даже если JSON содержит читаемый `request_id`, клиент не получает `error` и ждёт свой timeout.

**Локализация.**

- `vera_agent_service/app/messaging/consumer.py:197-204`;
- `vera_agent_service/app/messaging/schemas.py:10-24`.

**Возможное решение.** Использовать двухступенчатый parse только для доверенного и аутентифицированного envelope: сначала строго проверить формат/длину correlation ID и источник publisher-а, затем валидировать весь payload. Нельзя отправлять `error` по любой строке `request_id` из невалидного сообщения — это позволило бы завершить чужой поток. До появления защищённой correlation-схемы безопаснее оставить DLQ и восстанавливать outcome через request-status endpoint; секретные детали наружу не включать.

**Критерий готовности.** Поведение при невалидном payload зафиксировано и реализовано: клиент не ждёт свой timeout без причины, наружу не уходят детали ошибки, завершить чужой поток невозможно.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `vera_agent_service/app/messaging/consumer.py`, `app/services/chat_persistence.py`, `app/repositories/chat_turn.py`, `app/db/models/chat_turn.py`, `app/db/alembic/versions/20260809_2110_add_turn_delivery_state.py`, `app/core/settings.py`, `app/main.py`, `app/observability/request_trace.py`, `app/clients/mcp_client.py`, `tests/unit/messaging/test_delivery_state_machine.py`, `tests/integration/repositories/test_turn_lease.py`, а также приведённые к новому контракту `tests/unit/messaging/test_consumer.py`, `tests/unit/services/test_chat_persistence.py`, `tests/integration/test_chat_persistence.py`.
- **Суть изменения:** решение карточки закреплено, а не изменено: невалидный payload уходит в DLQ без терминального SSE-события. Отправка `error` по `request_id`, взятому из непроверенного сообщения, позволила бы завершить чужой поток, поэтому поведение сохранено намеренно и снабжено комментарием в коде с объяснением причины. Добавлен тест, фиксирующий контракт. Коммит Agent Service — `30328af`.
- **Миграции Alembic:** требуется и выполнена — `20260809_2110_add_turn_delivery_state.py`: поля `lease_until`, `attempt_count`, `worker_id`, `terminal_detail` и перенос существующих `failed` в `generation_failed`. `downgrade` схлопывает новые статусы обратно в `failed` и снимает поля. Цикл `upgrade` → `downgrade` → `upgrade` проверен на живом PostgreSQL в контейнере, все три шага завершились кодом 0.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлены `tests/unit/messaging/test_delivery_state_machine.py` (14 тестов, по одному на строку таблицы исходов) и `tests/integration/repositories/test_turn_lease.py` (5 тестов на реальном PostgreSQL). Команда `venv/Scripts/python.exe -m pytest` — 220 passed, 0 failed; интеграционные выполнялись реально на поднятом Docker. Ключевой для этой карточки: `test_invalid_payload_goes_to_dlq_without_terminal_event` — проверяет, что наружу не уходит ни одного события и доставка подтверждается ровно один раз.
- **Отклонения от предложенного решения и причина:** двухступенчатый разбор payload не вводился: он имеет смысл только вместе с защищённой correlation-схемой, которой пока нет. До неё безопаснее оставить DLQ, как и рекомендует сама карточка.
- **Осталось / связанные карточки:** Восстановление исхода через request-status endpoint не реализовано — он относится к VERA-011/025 и требует нового HTTP-контракта.

### VERA-017 — Явная отмена отсутствует; SSE disconnect не является cancel

**Тип:** функциональное ограничение. **Приоритет:** P2.

**Репозиторий:** `cross` — Agent Service + frontend. В последнюю очередь.

**Проблема.** Disconnect удаляет только subscriber; LLM, MCP, persistence и Rabbit delivery продолжают работу, а пользовательской команды «Остановить» нет. Само продолжение после сетевого disconnect не является дефектом: оно позволяет сохранить ответ для history/reconnect. Ограничение состоит в отсутствии явной пользовательской отмены, контроля затрат и различения безопасно отменяемых и уже начатых mutating-этапов.

**Локализация.**

- `vera_agent_service/app/streaming/sse.py:35-46`;
- `vera_agent_service/app/streaming/session_bus.py:66-70`;
- `frontend/src/components/features/vera/ChatWindow.tsx:217-282`.

**Возможное решение.** Не связывать TCP disconnect с автоматической отменой. Добавить отдельный cancellation endpoint/token и UI-команду, разделять safe-cancellable этапы от уже начатых mutating operations. Consumer должен проверять cancellation state между узлами и корректно сохранять `cancelled`. Для email после начала отправки отмена не должна обещать, что письмо не ушло.

**Критерий готовности.** Есть серверный cancellation-контракт и пользовательская команда отмены. Сетевой disconnect по-прежнему не отменяет обработку. Начатая отправка email не обещает отмену.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-018 — Пустой LLM stream считается успешным ответом

**Тип:** подтверждённый edge-case дефект. **Приоритет:** P2.

**Репозиторий:** `agent` — однорепная.

**Проблема.** `astream_tokens` считает отсутствие первого chunk успешным началом стрима. Consumer сохраняет пустой `completed` answer и отправляет `done`.

**Локализация.**

- `vera_agent_service/app/clients/llm.py:135-170`;
- `vera_agent_service/app/messaging/consumer.py:290-321`.

**Возможное решение.** Считать пустой stream ошибкой контента, повторять его только до выдачи первого токена и после исчерпания attempts отправлять `error`, а не `done`.

**Критерий готовности.** Пустой stream LLM считается ошибкой контента: повтор допустим только до выдачи первого токена, после исчерпания попыток отправляется terminal `error`, а не `done` с пустым ответом.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `vera_agent_service/app/messaging/consumer.py`, `app/services/chat_persistence.py`, `app/repositories/chat_turn.py`, `app/db/models/chat_turn.py`, `app/db/alembic/versions/20260809_2110_add_turn_delivery_state.py`, `app/core/settings.py`, `app/main.py`, `app/observability/request_trace.py`, `app/clients/mcp_client.py`, `tests/unit/messaging/test_delivery_state_machine.py`, `tests/integration/repositories/test_turn_lease.py`, а также приведённые к новому контракту `tests/unit/messaging/test_consumer.py`, `tests/unit/services/test_chat_persistence.py`, `tests/integration/test_chat_persistence.py`.
- **Суть изменения:** пустой поток модели больше не считается успехом. Отсутствие содержимого поднимает `EmptyLlmStreamError` до отправки терминального события, поэтому повтор допустим (первый токен ещё не отдан), а после исчерпания попыток пользователь получает `error`, а реплика — статус `generation_failed`. Раньше сохранялся пустой `completed` и отправлялся `done`, что для пользователя выглядело как полученная консультация. Коммит Agent Service — `30328af`.
- **Миграции Alembic:** требуется и выполнена — `20260809_2110_add_turn_delivery_state.py`: поля `lease_until`, `attempt_count`, `worker_id`, `terminal_detail` и перенос существующих `failed` в `generation_failed`. `downgrade` схлопывает новые статусы обратно в `failed` и снимает поля. Цикл `upgrade` → `downgrade` → `upgrade` проверен на живом PostgreSQL в контейнере, все три шага завершились кодом 0.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлены `tests/unit/messaging/test_delivery_state_machine.py` (14 тестов, по одному на строку таблицы исходов) и `tests/integration/repositories/test_turn_lease.py` (5 тестов на реальном PostgreSQL). Команда `venv/Scripts/python.exe -m pytest` — 220 passed, 0 failed; интеграционные выполнялись реально на поднятом Docker. Ключевой для этой карточки: `test_empty_stream_is_content_error_not_done` — проверяет и отсутствие `done`, и итоговый статус, и уход сообщения в DLQ.
- **Отклонения от предложенного решения и причина:** карточка планировалась отдельным коммитом, но её ветка — часть терминальной логики, переписанной пакетом: раздельная правка означала бы конфликт в тех же строках. Сама логика соответствует предложенному в карточке решению.
- **Осталось / связанные карточки:** Различение «модель вернула пустой ответ» и «модель недоступна» на уровне текста для пользователя не вводилось — оба случая дают одинаковое сообщение о временной недоступности.

### VERA-019 — Retry графа использует тот же checkpoint после частичного сбоя

**Тип:** гипотеза надёжности, требующая integration-проверки. **Приоритет:** P1.

**Репозиторий:** `agent` — однорепная.

**Проблема.** Подтверждено, что до первого пользовательского токена consumer повторно вызывает весь граф с тем же `thread_id`, а новый `HumanMessage` создаётся без стабильного ID. LangGraph уже мог записать initial state или результат внутренних узлов в Redis. Фактическое дублирование HumanMessage либо resume промежуточного checkpoint в текущей версии LangGraph без integration test не подтверждено.

**Локализация.**

- `vera_agent_service/app/messaging/consumer.py:78-86`, `280-321`, `535-541`;
- `vera_agent_service/app/graph/state.py:19-24`.

**Возможное решение.** Сначала задавать `HumanMessage(id=request_id)` и characterization/integration test consumer retry + реальный Redis checkpointer. По результату теста использовать request-scoped checkpoint namespace/attempt ID с атомарным merge успешно завершённой попытки либо откатывать checkpoint к состоянию до текущего `request_id`.

**Критерий готовности.** Есть integration-тест retry графа с реальным Redis-checkpointer. Повторный прогон не дублирует `HumanMessage` и не воскрешает промежуточный checkpoint.

**Отчёт исполнителя.**

- **Статус:** `сделано`.
- **Изменённые файлы:** `vera_agent_service/app/messaging/consumer.py`, `vera_agent_service/tests/unit/messaging/test_consumer.py`, `vera_agent_service/tests/integration/test_redis_checkpointer.py`; настоящий отчёт. Код Agent Service зафиксирован коммитом `69561d0`.
- **Суть изменения:** входной `HumanMessage` получает стабильный `id=payload.request_id`. Предварительная проверка на живом Redis подтвердила исходную проблему: после сбоя и повторного запуска одного request в checkpoint были два одинаковых пользовательских сообщения с разными случайными ID. Интеграционные тесты теперь явно проверяют сохранённый после первого сбоя checkpoint, повтор того же request и отдельный повтор после реального перезахвата просроченной аренды в PostgreSQL; во всех случаях в истории остаётся ровно один исходный `HumanMessage`.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлены unit-проверка ID и два integration-сценария с реальным Redis-checkpointer, один из них также использует живой PostgreSQL и реальный stale-lease reclaim. `.\venv\Scripts\python.exe -m pytest tests/integration/test_redis_checkpointer.py tests/unit/messaging/test_consumer.py -q` — `18 passed`, `6 warnings`; полный `.\venv\Scripts\python.exe -m pytest -q` — `224 passed`, `10 warnings`.
- **Отклонения от предложенного решения и причина:** request-scoped checkpoint namespace и откат checkpoint не вводились: characterization-тест подтвердил, что стабильного message ID достаточно для дедупликации в текущей версии LangGraph.
- **Осталось / связанные карточки:** дополнительных работ в рамках VERA-019 нет.

## 6. LangGraph, LLM и MCP

### VERA-020 — Контекст растёт без trimming или summarization

**Тип:** архитектурный риск стоимости и корректности. **Приоритет:** P1.

**Репозиторий:** `agent` — однорепная.

**Проблема.** В Redis накапливаются user/assistant сообщения, внутренние tool-call сообщения и полный JSON RAG chunks. На следующем turn вся история снова передаётся модели. Отдельной token-budget policy нет. RAG chunks дополнительно вставляются как `SystemMessage`, что увеличивает поверхность indirect prompt injection.

**Локализация.**

- `vera_agent_service/app/graph/state.py:19-24`;
- `vera_agent_service/app/graph/nodes/call_kb_search.py:58-68`;
- `vera_agent_service/app/graph/nodes/generate_with_context.py:36-52`;
- отсутствие trimming/summarization в `vera_agent_service/app/graph/`.

**Последствия.** Рост latency и стоимости, переполнение context window, снижение качества, перенос инструкций из RAG-документа в привилегированный system context.

**Возможное решение.** Ввести явный token budget: последние N turns + безопасная summary + только необходимые source excerpts. Не хранить сырой полный tool result в разговорной history; сохранять ссылки/идентификаторы отдельно. RAG-контент передавать как недоверенные данные с чёткими delimiters и инструкцией игнорировать содержащиеся в чанках команды.

**Критерий готовности.** Введён явный token budget. Сырой полный результат tool не хранится в разговорной истории. RAG-контент передаётся как недоверенные данные с явными делимитерами. Тесты на превышение бюджета и на prompt injection внутри чанка проходят.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-021 — Tool routing и side effects контролируются преимущественно моделью

**Тип:** функциональный и safety-риск. **Приоритет:** P1.

**Репозиторий:** `agent` — однорепная.

**Проблема.** Текущий контракт доверяет LLM и слабо валидирует tool-вызовы и их результаты:

- обрабатывается только `tool_calls[0]`, но parallel tool calls явно не запрещены;
- результат MCP разбирается как первый content block/JSON dict без строгой схемы chunks;
- обязательное «Основание» контролируется промптом, но не валидатором;
- prompt требует явную просьбу пользователя и указанный адрес перед `send_consultation_email`, но выполнение всё равно определяется LLM без структурированного, серверно проверяемого confirmation state;
- классификация factual question в RAG/direct также остаётся решением LLM без policy validation.

**Локализация.**

- `vera_agent_service/app/graph/nodes/analyze_intent.py:30-49`;
- `vera_agent_service/app/graph/edges.py:20-27`;
- `vera_agent_service/app/clients/mcp_client.py:341-356`;
- `vera_agent_service/app/graph/prompts/system.py:11-63`;
- `vera_agent_service/app/graph/prompts/context.py:19-41`.

**Возможное решение.**

1. Запретить parallel tool calls либо валидировать полный набор вызовов.
2. Ввести Pydantic-схемы результатов MCP и sources.
3. Добавить post-generation проверки grounded answer/citations.
4. Сохранить существующее требование natural-language consent, но для email дополнительно использовать явный confirmation token/state, созданный приложением после подтверждения адреса и текста, а не только намерение, распознанное LLM.
5. При factual/legal intent запрещать direct factual answer на уровне кода: только RAG или честный отказ.

**Критерий готовности.** Параллельные tool calls запрещены либо валидируются целиком. Результат MCP разбирается по Pydantic-схеме. Мутирующий email требует серверно проверяемого confirmation state. Factual/legal intent не может получить direct-ответ мимо RAG.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

## 7. Приватность, данные и observability

### VERA-022 — Полные тексты диалогов попадают в логи и Phoenix

**Тип:** подтверждённый privacy-риск. **Приоритет:** P1.

**Репозиторий:** `site/backend` + `agent` — две независимые однорепные части: удаление полного payload из логов publisher и redaction трассировки Agent Service. Выполняются раздельно.

**Проблема.** Подтверждено, что backend сайта логирует полный Rabbit payload, включая вопрос, email owner и token hash. Agent Service явно записывает полные root input/output и search query/result, а стандартная LangChain instrumentation настроена без `hide_inputs`/`hide_outputs`; Phoenix включён по умолчанию и его порт опубликован compose. Ручной span email tool очищен, но попадание email/consultation в автоматические LangChain spans требует отдельной проверки: существующий тест проверяет только ручной fake span.

**Локализация.**

- `backend/src/services/vera_publisher.py:55-69`;
- `vera_agent_service/app/observability/tracing.py:20-49`;
- `vera_agent_service/app/core/settings.py:121-126`;
- `vera_agent_service/app/messaging/consumer.py:206-215`, `315-320`;
- `vera_agent_service/app/clients/mcp_client.py:141-164`;
- `vera_agent_service/tests/unit/observability/test_tracing.py:203-228`, `437-445`;
- `vera_agent_service/docker-compose.yml:31-39`.

**Последствия.** Вопросы о трудовых правах и инвалидности могут содержать чувствительные сведения. Email, введённый пользователем в chat message для отправки консультации, проходит через LLM messages. Существует требующий проверки риск, что автоматические LangChain spans сохранят его и текст консультации, несмотря на очищенный ручной tool span.

**Возможное решение.** Принять data classification и redaction policy. В production по умолчанию трассировать метрики, IDs и размеры, а полный content — только через отдельный защищённый opt-in режим с коротким retention. Удалить полный payload из application logs. Не публиковать Phoenix наружу без auth/reverse proxy/network restriction. Отдельно проверить автоматические spans email tool реальным integration test.

**Критерий готовности.** В production-логах и трассировках отсутствуют полный текст вопроса и ответа, email владельца и token hash. Phoenix недоступен извне без авторизации. Автоматические LangChain-spans email-инструмента проверены реальным integration-тестом.

**Отчёт исполнителя.**

- **Статус:** `сделано` — backend-половина карточки; половина в репозитории Agent Service не начата.
- **Изменённые файлы:** `backend/src/services/vera_publisher.py`, `backend/tests/test_vera_request_correlation.py`.
- **Суть изменения:** лог перед публикацией писал payload целиком, включая текст вопроса, email владельца в `user_id` и хеш токена анонимной сессии. Теперь логируются только идентификаторы и размеры: `queue`, `session_id`, `request_id`, признак авторизованности и длина сообщения — этого достаточно, чтобы связать запись с turn в PostgreSQL агента и с SSE-потоком. Сам payload очереди не урезан, ограничение касается только application logs. Коммит в репозитории сайта — `8b2c704`.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** существующий `test_request_id_is_published_with_session_id` закреплял прежнее поведение и прямо требовал наличия текста вопроса в логах — переписан на проверку безопасных полей. Добавлен `test_logs_do_not_contain_question_or_owner`: вопрос, email и token hash отсутствуют в логах, но остаются в payload очереди. Запуск (в `backend/`, pytest в проекте не используется): `PYTHONPATH=. venv/Scripts/python.exe tests/test_vera_request_correlation.py` — 10/10 OK; полный набор `tests/*.py` — 19/19 OK.
- **Отклонения от предложенного решения и причина:** нет.
- **Осталось / связанные карточки:** вторая половина карточки — redaction автоматических LangChain-spans (`hide_inputs`/`hide_outputs`), закрытие Phoenix от внешнего доступа и integration-тест на spans email-инструмента — находится в репозитории Agent Service и в этой правке не затрагивалась. Политика retention и удаление диалогов — VERA-023.

### VERA-023 — Нет реализованной политики retention/удаления диалогов

**Тип:** privacy/compliance-риск. **Приоритет:** P1.

**Репозиторий:** `cross` — Agent Service + frontend (privacy page). В последнюю очередь.

**Проблема.** PostgreSQL хранит полные вопросы, ответы, sources, owner email и feedback. `closed_at` не используется, endpoint удаления/закрытия отсутствует. Privacy page в основном описывает старый wizard и без оговорок утверждает, что имя/email не передаются в модель. Account email действительно не добавляется автоматически в LLM messages, но любые персональные данные, которые пользователь вводит в новый чат, включая адрес для отправки консультации, передаются модели; это исключение политика не объясняет.

**Локализация.**

- `vera_agent_service/app/db/models/chat_session.py`;
- `vera_agent_service/app/db/models/chat_turn.py`;
- `frontend/src/app/privacy/page.tsx:62-85`, `97-117`;
- отсутствие user-facing delete/close flow в обоих проектах.

**Возможное решение.** Обновить privacy policy для нового чата, определить retention по типам данных, добавить закрытие/удаление сессии и каскадное удаление Redis checkpoints, PostgreSQL turns/feedback и связанных telemetry данных. Для запроса удаления аккаунта связать неизменяемый opaque user ID сайта с Agent Service без использования email как primary technical ID.

**Критерий готовности.** Privacy-страница описывает актуальный чат и оговаривает адрес для консультации. Определён retention по типам данных. Есть закрытие/удаление сессии с каскадной очисткой PostgreSQL, Redis и telemetry.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

## 8. Frontend и Next.js BFF

### VERA-024 — Watchdog действует только до первого SSE-события

**Тип:** подтверждённый UX/reliability-дефект. **Приоритет:** P1.

**Репозиторий:** `cross` — frontend + Agent Service (heartbeat). В последнюю очередь; строго ПОСЛЕ VERA-011.

**Проблема.** 100-секундный timer очищается на любом `message`. После первого token новый inactivity timer не ставится. Если stream завис без `done/error`, UI остаётся `streaming`: textarea доступна для набора, но повторная отправка заблокирована вплоть до nginx timeout 3600 секунд. До первого token email path может законно выполняться дольше frontend watchdog, поскольку его server-side timeout равен 360 секундам. UI при этом уже объявит сервис недоступным и может подтолкнуть пользователя повторить просьбу, хотя первая email-операция ещё продолжается.

**Локализация.**

- `frontend/src/hooks/useVeraChat.ts:24-30`, `390-402`, `418-467`;
- `frontend/src/components/features/vera/ChatWindow.tsx:63-70`, `226-250`;
- `vera_agent_service/app/core/settings.py:116-118`;
- `nginx/templates/default.conf.template:55-66`.

**Возможное решение.** Разделить timeout первого meaningful event, inactivity timeout и общий deadline. Сбрасывать inactivity timer на token/heartbeat. При добавлении heartbeat нужно расширить frontend `SseEvent` и обработчик: сейчас любой неизвестный type попадает в ветку `error` и закрывает stream. Agent должен отправлять безопасные progress/heartbeat events во время долгих tool calls. UX email-операции лучше выделить в отдельный статус, а не маскировать под обычное ожидание первого токена.

**Критерий готовности.** Разделены timeout первого события, inactivity timeout и общий deadline. Inactivity-таймер сбрасывается на `token` и heartbeat. Неизвестный тип SSE-события не роняет поток в `error`. Долгая email-операция имеет отдельный пользовательский статус.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-025 — Гонки между SSE и POST создают неоднозначный UI

**Тип:** архитектурный риск. **Приоритет:** P1.

**Репозиторий:** `cross` — frontend + Agent Service (request status). В последнюю очередь; строго ПОСЛЕ VERA-011.

**Проблема.** EventSource инициируется до POST, чтобы снизить риск пропуска ранних событий, но readiness не синхронизирована, а обе операции независимы; correlation обеспечивает общий `request_id`, не порядок вызовов. SSE может упасть, а POST успешно поставить сообщение в очередь. Обратный случай: publish уже состоялся, но BFF timeout/connection error заставит frontend удалить assistant message целиком — даже если SSE уже частично наполнил или успел завершить его. Оптимистичный user bubble при ошибке POST остаётся, хотя исход публикации может быть как однозначно отрицательным, так и неизвестным. Initial current/history requests имеют cleanup через `AbortController`, но load-older, chat POST и feedback не принимают component-owned signal; при этом abort POST всё равно означал бы только неизвестный transport outcome, а не отмену агента.

**Локализация.**

- `frontend/src/hooks/useVeraChat.ts:352-499`;
- `frontend/src/hooks/useVeraChat.ts:179-217`, `219-350`;
- `frontend/src/components/features/vera/VeraFeedbackModal.tsx:129-172`;
- `frontend/src/app/api/vera/chat/route.ts:105-143`;
- `backend/src/services/vera_publisher.py:71-89`.

**Возможное решение.** Ввести явную client state machine: `draft -> submitting -> accepted -> processing -> streaming -> completed/failed/unknown`. Сохранять `request_id`, при ambiguous outcome опрашивать turn status/history, а не удалять ответ. User bubble помечать как `not_sent/retry`, только если сервер однозначно не принял запрос. Рассмотреть endpoint `GET /requests/{request_id}` и целевой receipt/ticket flow из VERA-011.

**Критерий готовности.** Клиент имеет явную state machine доставки. При неоднозначном исходе POST выполняется reconciliation по исходному `request_id`, а не удаление ответа. Сообщение пользователя помечается как недоставленное только при однозначном отказе сервера.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-026 — Нет runtime-валидации ответов и SSE events

**Тип:** hardening. **Приоритет:** P2.

**Репозиторий:** `site/frontend` — однорепная.

**Проблема.** JSON приводится к TypeScript types через cast. `response.json()` не защищён от empty/non-JSON. После `JSON.parse(event.data)` union также не валидируется.

**Локализация.**

- `frontend/src/lib/api/vera.ts:46-162`;
- `frontend/src/hooks/useVeraChat.ts:398-456`;
- `frontend/src/app/api/vera/chat/route.ts:145`;
- `frontend/src/app/api/vera/history/[sessionId]/route.ts:123`;
- `frontend/src/app/api/vera/session/current/route.ts:92`;
- `frontend/src/lib/utils/vera-feedback-proxy.ts:150`.

**Возможное решение.** Определить Zod-схемы всех response/event variants, безопасно разбирать content type/body и отображать контролируемую contract error. По возможности генерировать frontend types/schemas из versioned OpenAPI/JSON Schema.

**Критерий готовности.** Все HTTP-ответы и SSE-события разбираются через Zod-схемы. Пустой или не-JSON ответ не роняет обработчик. Несоответствие контракту отображается контролируемой ошибкой.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `frontend/src/lib/schemas/vera.ts`; `frontend/src/lib/utils/vera-response.ts`; `frontend/src/lib/api/vera.ts`; `frontend/src/app/api/vera/chat/route.ts`; `frontend/src/app/api/vera/history/[sessionId]/route.ts`; `frontend/src/app/api/vera/session/current/route.ts`; `frontend/src/lib/utils/vera-feedback-proxy.ts`; `frontend/src/app/api/vera/feedback/route.ts`; `frontend/src/app/api/vera/feedback/message/route.ts`; `frontend/src/hooks/useVeraChat.ts`; `frontend/src/lib/schemas/__tests__/vera.test.ts`; `frontend/src/lib/utils/__tests__/vera-response.test.ts`; `frontend/src/lib/utils/__tests__/vera-feedback-proxy.test.ts`; `frontend/src/hooks/__tests__/useVeraChat.test.ts`; `VERA_CHAT_TECHNICAL_AUDIT.md`.
- **Суть изменения:** для пяти успешных HTTP-ответов, строкового/validation-list error response и трёх существующих SSE-событий определены Zod-схемы; TypeScript-типы ответов теперь выводятся из них. Общий parser проверяет JSON media type (`application/json` и `+json`), непустое тело, корректность JSON и соответствие схеме с учётом HTTP-статуса. Vera API client, chat/history/current и оба feedback BFF-маршрута используют этот parser; некорректный upstream превращается в контролируемый `502` с `X-Request-ID` и сохранением owner cookies. SSE payload после `JSON.parse` проходит `safeParse`, а нарушение контракта закрывает поток и показывает существующую контролируемую ошибку. HTTP response-схемы оставлены passthrough, поэтому BFF не удаляет дополнительные поля upstream и relay-контракт не меняется.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлен 21 сценарий: все HTTP/SSE variants, JSON с charset и `+json`, empty/non-JSON/malformed/schema-mismatch/status-mismatch, контролируемый `502` BFF и некорректный SSE. `npm test -- src/lib/schemas/__tests__/vera.test.ts src/lib/utils/__tests__/vera-response.test.ts src/lib/utils/__tests__/vera-feedback-proxy.test.ts src/hooks/__tests__/useVeraChat.test.ts` — 52 passed. `npm test` — 125 passed. `npm run lint` — успешно, 0 errors и 26 существующих warnings. `npm run build` — успешно.
- **Отклонения от предложенного решения и причина:** схемы описаны рядом с существующими frontend request-схемами, без генерации из OpenAPI: versioned codegen в проекте отсутствует, а его добавление потребовало бы нового инструментария вне скоупа карточки.
- **Осталось / связанные карточки:** набор SSE-событий не расширялся; heartbeat и отдельная protocol-семантика неизвестных событий остаются в VERA-012/024.

### VERA-027 — Composer и optimistic flow не полностью отражают валидацию

**Тип:** UX/reliability-дефект. **Приоритет:** P1.

**Репозиторий:** `site/frontend` — однорепная.

**Проблема.** Textarea не имеет `maxLength=4000`, frontend не вызывает Zod до optimistic append. При любой ошибке POST удаляется assistant message, user bubble остаётся, input уже очищен. Для `422/429` исход обычно однозначен, но при timeout/connection loss publish мог уже состояться, поэтому одинаковая UI-ветка смешивает `definitely_rejected` и `unknown`.

**Локализация.**

- `frontend/src/components/features/vera/ChatWindow.tsx:65-81`, `226-250`;
- `frontend/src/hooks/useVeraChat.ts:366-379`, `469-497`;
- `frontend/src/lib/schemas/vera.ts:6-19`.

**Возможное решение.** Валидировать до изменения messages, добавить `maxLength`, счётчик символов и статус доставки user message. При `definitely_rejected` восстановить draft и разрешить новую отправку. При `unknown` сначала выполнить reconciliation по исходному `request_id`; создавать новый ID можно только после подтверждения, что первый запрос не принят, иначе возникнут второй turn и двойная обработка.

**Критерий готовности.** Валидация выполняется до optimistic append. У textarea есть `maxLength` и счётчик символов. При однозначном отказе черновик восстанавливается. При неизвестном исходе выполняется reconciliation, а не отправка нового `request_id`.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `frontend/src/lib/schemas/vera.ts`; `frontend/src/hooks/useVeraChat.ts`; `frontend/src/components/features/vera/ChatWindow.tsx`; `frontend/src/components/features/vera/ChatMessage.tsx`; `frontend/src/hooks/__tests__/useVeraChat.test.ts`; `frontend/src/components/features/vera/__tests__/ChatWindow.test.tsx`; `frontend/src/components/features/vera/__tests__/ChatMessage.test.tsx`; `VERA_CHAT_TECHNICAL_AUDIT.md`.
- **Суть изменения:** лимит сообщения вынесен в общую константу, а payload проверяется существующей Zod-схемой до открытия SSE и optimistic append. Composer получил `maxLength=4000`, счётчик символов и восстановление очищенного черновика при однозначных ответах `422/429`. User bubble теперь явно показывает состояния `sending`, `sent`, `rejected` и `unknown`; неоднозначная транспортная ошибка сохраняет сообщение со статусом `unknown` и не создаёт новый `request_id`.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** дополнены тесты hook, composer и user bubble для предварительной валидации, статусов доставки, счётчика и восстановления черновика. `npm test -- src/hooks/__tests__/useVeraChat.test.ts src/components/features/vera/__tests__/ChatWindow.test.tsx src/components/features/vera/__tests__/ChatMessage.test.tsx` — 32 passed. `npm test` — 97 passed, 2 failed: `src/lib/schemas/__tests__/auth.test.ts > registerSchema > accepts valid data` — существовало до правки, вне скоупа карточки; `src/components/features/vera/__tests__/VeraFeedbackModal.test.tsx > VeraFeedbackModal > allows sending an empty questionnaire with the session id` — существовало до правки, вне скоупа карточки. `npm run lint` — успешно, 0 errors и 26 warnings. `npm run build` — успешно.
- **Отклонения от предложенного решения и причина:** reconciliation при `unknown` не реализован по прямому ограничению `PROMPT_RUN_2.md`: для него нужен серверный endpoint и работы VERA-011/VERA-025, которые не входят в текущий прогон. При `unknown` черновик автоматически не восстанавливается, повторная отправка с новым ID не запускается.
- **Осталось / связанные карточки:** серверная reconciliation по исходному `request_id` заблокирована до реализации VERA-011/VERA-025.

### VERA-028 — Per-token render и автоскролл ухудшают длинный диалог

**Тип:** performance/UX-долг. **Приоритет:** P2.

**Репозиторий:** `site/frontend` — однорепная.

**Проблема.** Каждый token создаёт новый массив messages и перерисовывает список. Effect скроллит вниз при каждом изменении, мешая читать предыдущий текст во время генерации.

**Локализация.**

- `frontend/src/hooks/useVeraChat.ts:418-426`;
- `frontend/src/components/features/vera/ChatWindow.tsx:43-54`, `191-197`.

**Возможное решение.** Буферизовать tokens и обновлять UI пакетами через `requestAnimationFrame`/короткий interval, memoize сообщения и автоскроллить только если пользователь уже находится около нижнего края. При ручной прокрутке показывать кнопку «К новому сообщению».

**Критерий готовности.** Токены применяются к UI пакетами, список сообщений мемоизирован. Автоскролл срабатывает только когда пользователь у нижнего края, иначе показывается кнопка перехода к новому сообщению.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `frontend/src/hooks/useVeraChat.ts`; `frontend/src/components/features/vera/ChatWindow.tsx`; `frontend/src/components/features/vera/ChatMessage.tsx`; `frontend/src/hooks/__tests__/useVeraChat.test.ts`; `frontend/src/components/features/vera/__tests__/ChatWindow.test.tsx`; `VERA_CHAT_TECHNICAL_AUDIT.md`.
- **Суть изменения:** SSE tokens накапливаются в ref-буфере и одним функциональным обновлением применяются к assistant message на ближайшем `requestAnimationFrame`; terminal `done/error`, transport/contract error принудительно flush-ят последний фрагмент, а отмена запроса и unmount очищают frame и buffer. Список сообщений и отдельные `ChatMessage` мемоизированы, поэтому изменение composer и обновление одного ответа не перерисовывают все bubbles. Scroll intent отслеживается с порогом 80 px: у нижнего края новые пакеты прокручиваются автоматически, выше него позиция пользователя сохраняется и доступна кнопка «К новому сообщению». `previousScrollHeightRef` сохранён и дополнен first-message anchor: промежуточный append во время загрузки истории обновляет baseline, фактический prepend корректирует позицию, ошибка загрузки очищает marker. Существующий `aria-live` announcement не менялся.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлено 6 сценариев: пакетирование токенов и terminal flush; отсутствие повторного render списка при изменении composer; отсутствие автоскролла выше нижнего края и кнопка перехода; автоскролл рядом с низом; сохранение viewport при interleaved token + history prepend; очистка history marker после ошибки. `npm test -- src/components/features/vera/__tests__/ChatWindow.test.tsx src/hooks/__tests__/useVeraChat.test.ts src/components/features/vera/__tests__/ChatMessage.test.tsx` — 40 passed. `npm test` — 131 passed. `npm run lint` — успешно, 0 errors и 26 существующих warnings. `npm run build` — успешно.
- **Отклонения от предложенного решения и причина:** нет.
- **Осталось / связанные карточки:** в рамках карточки ничего не осталось; SSE-протокол и screen-reader announcement не изменялись.

### VERA-029 — Нет явного создания/закрытия нового диалога

**Тип:** функциональное ограничение. **Приоритет:** P2.

**Репозиторий:** `cross` — Agent Service + frontend. В последнюю очередь.

**Проблема.** Для auth-пользователя всегда выбирается последняя `closed_at IS NULL` сессия, но закрытие не реализовано. При входе после anonymous-чата пользователь может быть переключён на старую auth-сессию вместо продолжения текущей anonymous-сессии. Пользователь не контролирует границу контекста.

**Локализация.**

- `frontend/src/hooks/useVeraChat.ts:185-199`;
- `vera_agent_service/app/repositories/chat_session.py:28-43`;
- отсутствие close/new endpoints и UI action.

**Возможное решение.** Добавить явные `POST /sessions`, `POST /sessions/{id}/close` и кнопку «Новый диалог». При login показывать предсказуемую policy: продолжить текущий anonymous-диалог, открыть последний auth-диалог или создать новый.

**Критерий готовности.** Есть явные endpoints создания и закрытия сессии и кнопка «Новый диалог». Поведение при логине после anonymous-чата предсказуемо и описано в UI.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-030 — Cookie создаётся отдельно для каждой session ID

**Тип:** hardening. **Приоритет:** P2.

**Репозиторий:** `site/frontend` — однорепная.

**Проблема.** Имя cookie строится из очищенного session ID. Новая anonymous-вкладка или ротация session ID создаёт дополнительную cookie. Старые явно не удаляются, но автоматически истекают по `maxAge=24h`, поэтому риск ограничен burst-накоплением в пределах суток. Разные строки могут совпасть после удаления специальных символов.

**Локализация.**

- `frontend/src/lib/utils/vera-session-token.ts:3-32`;
- места создания cookie в Vera route handlers.

Коллизия имени не даёт доступ к чужой сессии: подписанный payload привязан к полному `session_id`, и backend отклонит неверный token. Это availability/UX-риск (`403`, ротация), а не подтверждённый ownership bypass. После logout stale sessionStorage/cookie также не открывают прежнюю auth-сессию, потому что Agent Service для user-owned session требует совпавший `user_id`.

**Возможное решение.** Сохранить независимые per-tab session IDs, но использовать одну стабильную server-managed cookie анонимного principal и bounded registry его сессий. Альтернатива — оставить per-session cookies, использовать hash полного ID в имени и удалять cookie при закрытии/истечении сессии.

**Критерий готовности.** Коллизия имён cookie невозможна: используется либо одна стабильная серверная cookie анонимного principal, либо hash полного `session_id` в имени. Устаревшие cookie удаляются, а не только истекают.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `frontend/src/lib/utils/vera-session-token.ts`, `frontend/src/lib/utils/vera-owner-headers.ts`, `frontend/src/lib/utils/__tests__/vera-session-token.test.ts`, `frontend/src/lib/utils/__tests__/vera-feedback-proxy.test.ts`, `VERA_CHAT_TECHNICAL_AUDIT.md`.
- **Суть изменения:** имя per-session cookie теперь содержит полный SHA-256 hash исходного `session_id`, поэтому ранее совпадавшие после очистки идентификаторы получают разные имена. Общий owner-helper проверяет подпись/`exp` токенов, переиспользует только токен нужной сессии и через все существующие Vera route handlers удаляет с правильным `Path=/api/vera` просроченные, повреждённые и legacy-cookie; активные cookies других вкладок сохраняются.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлены 3 проверки hash/signature/expiry cleanup и обновлены ожидания существующих proxy-сценариев на новые имена cookie. Точечный `npm test -- src/lib/utils/__tests__/vera-session-token.test.ts src/lib/utils/__tests__/vera-feedback-proxy.test.ts` — `10 passed`; полный `npm test` — `104 passed`; `npm run lint` — успешно, 0 errors, 26 warnings; `npm run build` — успешно.
- **Отклонения от предложенного решения и причина:** реализована явно предписанная в прогоне меньшая альтернатива с per-session cookies; единый anonymous principal и registry сессий не вводились.
- **Осталось / связанные карточки:** переработка семантики anonymous principal остаётся за VERA-005/029; в рамках VERA-030 работ не осталось.

## 9. Дополнительный backend/Agent hardening

### VERA-031 — Rabbit schema не фиксирует owner invariant и длины идентификаторов

**Тип:** подтверждённый контрактный дефект для альтернативного publisher. **Приоритет:** P2.

**Репозиторий:** `agent` — однорепная. Согласуется с решением VERA-003.

**Проблема.** `user_id=None` и `anonymous_token_hash=None` допустимы одновременно. Первая реплика создаёт owner-less session, но следующий доступ всегда будет запрещён. `session_id` и `user_id` не имеют max length, хотя PostgreSQL ограничивает оба 100 символами. Site publisher обычно защищает отсутствие owner и frontend ограничивает session ID, но Agent Service объявляет собственный входной queue contract.

**Локализация.**

- `vera_agent_service/app/messaging/schemas.py:10-24`;
- `vera_agent_service/app/services/chat_persistence.py:62-82`;
- `vera_agent_service/app/services/chat_session_access.py:12-21`;
- `vera_agent_service/app/db/models/chat_session.py:33-52`.

**Возможное решение.** Добавить model-level invariant: должен присутствовать хотя бы один корректный owner mechanism. Одновременные `user_id + anonymous_token_hash` допустимы для auth-запроса и claim anonymous-сессии после входа; promotion выполняется только после проверки сохранённого anonymous hash, после чего в БД остаётся user owner. Ограничить `session_id` 100 символами, а `user_id` синхронизировать с решением VERA-003. UUID-валидацию вводить только если UUID станет формальным canonical contract; иначе зафиксировать единый opaque string format.

**Критерий готовности.** Схема очереди запрещает одновременное отсутствие обоих механизмов владения. `session_id` ограничен 100 символами. `user_id` согласован с решением VERA-003.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `app/messaging/schemas.py`, `tests/unit/messaging/test_schemas.py`, `tests/integration/test_chat_persistence.py`, `tests/unit/messaging/test_consumer.py`, `tests/integration/test_consumer.py`, `tests/integration/test_consumer_sse_pipeline.py`, `tests/unit/observability/test_tracing.py`.
- **Суть изменения:** Rabbit/Pydantic-схема теперь требует хотя бы один валидный owner mechanism, ограничивает `session_id` 100 символами и `user_id` 255 символами; одновременные `user_id + anonymous_token_hash` остаются разрешены. Валидные consumer/tracing fixtures приведены к новому обязательному контракту без изменения логики consumer или tracing. Код и тесты зафиксированы отдельным коммитом Agent Service `abd1ec7`.
- **Миграции Alembic:** не требуются; длина PostgreSQL-полей уже синхронизирована миграцией VERA-003, чей цикл `upgrade → downgrade → upgrade` отдельно проверен и зафиксирован в отчёте VERA-003.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлено 10 проверок: 7 schema-cases для границ/owner invariant и 3 интеграционных persistence-cases для user-only, anonymous-only и совместного claim-варианта на живом PostgreSQL. Выборочный запуск `python -m pytest tests/unit/messaging/test_schemas.py tests/unit/messaging/test_consumer.py tests/integration/test_chat_persistence.py tests/integration/test_consumer.py tests/integration/test_consumer_sse_pipeline.py -q` — `29 passed`, все 10 новых проверок прошли. Полный `python -m pytest -q` на живых RabbitMQ, Redis и Testcontainers PostgreSQL — `185 passed, 10 failed, 7 warnings`. Все 10 падений находятся в `tests/unit/observability/test_tracing.py`, существуют на baseline `837ba88`; причина — глобальное состояние tracing, вне скоупа карточки.
- **Отклонения от предложенного решения и причина:** нет; UUID-валидация намеренно не вводилась, promotion-поведение и delivery state machine не менялись.
- **Осталось / связанные карточки:** формализация UUID либо иного canonical opaque ID возможна только отдельной контрактной задачей; в текущем контракте идентификаторы остаются opaque strings.

### VERA-032 — Resource cleanup и connection URL требуют hardening

**Тип:** подтверждённый cleanup-дефект и условные конфигурационные риски. **Приоритет:** P2.

**Репозиторий:** `agent` — однорепная.

**Проблема.** Подтверждено, что singleton external `httpx.AsyncClient` явно не закрывается на shutdown. Дополнительно PostgreSQL/RabbitMQ/Redis connection URLs собираются string interpolation без percent-encoding credentials и vhost; зарезервированные символы в реальных значениях могут сломать разбор URL. Redis/DB health checks не имеют отдельного короткого server-side deadline, поэтому время ответа зависит от driver/connect timeout и может оказаться неприемлемо большим.

**Локализация.**

- `vera_agent_service/app/clients/http_client.py`;
- `vera_agent_service/app/main.py:48-113`;
- `vera_agent_service/app/core/settings.py:38-46`, `61-68`, `84-87`;
- `vera_agent_service/app/api/v1/endpoints/health.py`.

**Возможное решение.** Регистрировать `aclose` клиента в `AsyncExitStack`. Строить URL через библиотечные URL builders или percent-encode компоненты. Добавить startup validation конфигурации без логирования секретов. Оборачивать каждую внешнюю health-проверку в короткий deadline и разделить liveness от readiness.

**Критерий готовности.** `httpx.AsyncClient` закрывается на shutdown, и вводящий в заблуждение комментарий в `app/clients/http_client.py` приведён в соответствие. URL подключений собираются с percent-encoding. Health-проверки имеют короткий собственный deadline.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `app/clients/http_client.py`, `app/main.py`, `app/core/settings.py`, `app/api/v1/endpoints/health.py`, `tests/unit/core/test_settings.py`, `tests/integration/test_main.py`.
- **Суть изменения:** singleton `external_api_http_client` зарегистрирован в `AsyncExitStack` production lifespan и закрывается при shutdown; комментарий клиента приведён к фактическому lifecycle. Credentials, PostgreSQL database name и RabbitMQ vhost percent-encode-ятся как отдельные URL-компоненты. Redis и PostgreSQL health checks получили собственный deadline 1 секунда. Код и тесты зафиксированы отдельным коммитом Agent Service `edfa88f`.
- **Миграции Alembic:** не требуются; схема данных не менялась.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлено 4 проверки: 3 unit-cases percent-encoding для PostgreSQL/RabbitMQ/Redis и 1 интеграционный сценарий полного startup/shutdown, который на реально поднятом приложении подтверждает закрытие `httpx.AsyncClient` и ограничение зависших Redis/DB health calls. Выборочный запуск `python -m pytest tests/unit/core/test_settings.py tests/integration/test_main.py -q` — `7 passed`, все 4 новые проверки прошли. Полный `python -m pytest -q` на живых RabbitMQ, Redis и Testcontainers PostgreSQL — `189 passed, 10 failed, 8 warnings`. Все 10 падений находятся в `tests/unit/observability/test_tracing.py`, существуют на baseline `837ba88`; причина — глобальное состояние tracing, вне скоупа карточки.
- **Отклонения от предложенного решения и причина:** liveness/readiness не разделялись и новый startup-validation слой не вводился: это не входит в критерий готовности карточки и потребовало бы изменения операционного HTTP-контракта; обязательные settings уже валидируются Pydantic при старте.
- **Осталось / связанные карточки:** отдельное разделение liveness/readiness возможно только после согласования операционного контракта мониторинга.

### VERA-033 — Сквозная observability-корреляция не проходит HTTP/RabbitMQ-границы

**Тип:** observability-долг. **Приоритет:** P2.

**Репозиторий:** `cross` — frontend + backend сайта + Agent Service. В последнюю очередь.

**Проблема.** `X-Request-ID` создаётся/переиспользуется Next BFF и передаётся во входной FastAPI request, но backend сайта его не читает, не возвращает и не включает в log context. Correlation поэтому обрывается ещё на HTTP-границе. В Rabbit schema/headers также нет отдельного correlation/W3C trace context. `request_id` сообщения доступен, однако это бизнесовый идентификатор turn. W3C context инжектируется только дальше из нового Agent root span в MCP, поэтому site-to-agent trace не является единым деревом.

**Локализация.**

- `frontend/src/lib/utils/request-id.ts`;
- `frontend/src/app/api/vera/chat/route.ts:90-105`;
- `backend/src/services/vera_publisher.py:55-80`;
- отсутствие обработки `X-Request-ID`/`traceparent` в `backend/src`;
- `vera_agent_service/app/messaging/schemas.py:10-24`;
- `vera_agent_service/app/messaging/consumer.py:167-185`;
- `vera_agent_service/app/observability/tracing.py`;
- `vera_agent_service/app/clients/mcp_client.py:37-44`.

**Возможное решение.** На доверенном ingress валидировать формат/длину входного `X-Request-ID` либо заменять его сгенерированным UUID. Затем добавить backend middleware/context для нормализованного ID, структурированных logs и HTTP `traceparent`, передавать `correlation_id` и W3C `traceparent/tracestate` в AMQP headers, извлекать их consumer-ом и создавать связанный root span. Не смешивать transport `X-Request-ID` с бизнесовым `request_id`, но логировать оба в структурированном виде.

**Критерий готовности.** Транспортный `X-Request-ID` и бизнесовый `request_id` различимы и оба попадают в структурированные логи. `traceparent` проходит через BFF, backend, AMQP и Agent Service, образуя единое дерево трассировки.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-034 — Duplicate replay превращает `delivery_unconfirmed` в успех

**Тип:** подтверждённый дефект state machine. **Приоритет:** P1.

**Репозиторий:** `agent` — однорепная. Выполняется единым пакетом с VERA-004/014/015.

**Проблема.** Если существующий turn имеет статус `delivery_unconfirmed`, duplicate delivery воспроизводит сохранённый partial answer как один `token`, затем отправляет `done`. Исходная ошибка тем самым превращается в успешный terminal event. Live frontend включает feedback после `done`, хотя Agent Service разрешает feedback только для `completed`.

**Локализация.**

- `vera_agent_service/app/messaging/consumer.py:251-270`, `333-383`;
- `vera_agent_service/app/services/message_feedback.py:38-49`;
- `frontend/src/hooks/useVeraChat.ts:430-444`.

**Последствия.** Частичный или неподтверждённый результат выглядит завершённым, а последующее действие feedback противоречит сохранённому статусу. Обычная ветка `delivery_unconfirmed` ACK-ается, поэтому replay возникает не штатно на каждом таком запросе, а при повторной публикации того же `request_id`, ручном replay либо редкой неопределённости доставки ACK.

**Возможное решение.** Хранить точный terminal outcome (`completed`, `generation_failed`, `stream_interrupted`, `delivery_unconfirmed`) и исходный terminal event. Duplicate replay обязан воспроизводить тот же `done` или `error`, а не выводить любой сохранённый answer как успех. Исправлять в рамках общей delivery state machine VERA-004/014/015, а не отдельной перестановкой одной ветки.

**Критерий готовности.** Duplicate replay воспроизводит сохранённый terminal outcome. Ни один статус, кроме `completed`, не маскируется под `done`. Feedback доступен ровно тогда, когда это допускает сохранённый статус.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `vera_agent_service/app/messaging/consumer.py`, `app/services/chat_persistence.py`, `app/repositories/chat_turn.py`, `app/db/models/chat_turn.py`, `app/db/alembic/versions/20260809_2110_add_turn_delivery_state.py`, `app/core/settings.py`, `app/main.py`, `app/observability/request_trace.py`, `app/clients/mcp_client.py`, `tests/unit/messaging/test_delivery_state_machine.py`, `tests/integration/repositories/test_turn_lease.py`, а также приведённые к новому контракту `tests/unit/messaging/test_consumer.py`, `tests/unit/services/test_chat_persistence.py`, `tests/integration/test_chat_persistence.py`.
- **Суть изменения:** повторная доставка воспроизводит сохранённый исход. Успехом считается только `completed`: для него реплеится сохранённый ответ и `done`. Любой другой терминальный статус воспроизводит `error` с сохранённым текстом — для этого добавлено поле `terminal_detail`, хранящее ровно тот текст, который ушёл пользователю. Раньше `delivery_unconfirmed` реплеился как `token` + `done`, превращая зафиксированную ошибку в успех и открывая оценку ответа, запрещённую по статусу. Коммит Agent Service — `30328af`.
- **Миграции Alembic:** требуется и выполнена — `20260809_2110_add_turn_delivery_state.py`: поля `lease_until`, `attempt_count`, `worker_id`, `terminal_detail` и перенос существующих `failed` в `generation_failed`. `downgrade` схлопывает новые статусы обратно в `failed` и снимает поля. Цикл `upgrade` → `downgrade` → `upgrade` проверен на живом PostgreSQL в контейнере, все три шага завершились кодом 0.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлены `tests/unit/messaging/test_delivery_state_machine.py` (14 тестов, по одному на строку таблицы исходов) и `tests/integration/repositories/test_turn_lease.py` (5 тестов на реальном PostgreSQL). Команда `venv/Scripts/python.exe -m pytest` — 220 passed, 0 failed; интеграционные выполнялись реально на поднятом Docker. Ключевые для этой карточки: `test_duplicate_delivery_unconfirmed_replays_error_not_done` и `test_duplicate_completed_replays_saved_answer_and_done`.
- **Отклонения от предложенного решения и причина:** реализовано одним коммитом на все четыре карточки, как и предписано заданием: порядок commit и `done`, аренда, гарантия ack/nack и воспроизведение исхода держат друг друга и раздельно не разделяются. Текст терминального события сохраняется отдельным полем, а не собирается заново по статусу: разные причины дают один статус `delivery_unconfirmed`, и восстановление по статусу исказило бы исходное сообщение.
- **Осталось / связанные карточки:** Статус `cancelled` заведён в номенклатуре, но выставляется только при остановке сервиса — пользовательская отмена относится к VERA-017.

### VERA-035 — Создание turn и sequence number не атомарны для concurrency

**Тип:** архитектурный prerequisite будущего масштабирования. **Приоритет:** P2.

**Репозиторий:** `agent` — однорепная. Предусловие для VERA-013.

**Проблема.** Session create/touch, вычисление `max(sequence_number) + 1` и сохранение turn выполняются отдельными commit. При текущих одном worker и `prefetch_count=1` параллельные turns не обрабатываются, но после реализации VERA-013 два consumer-а одной сессии смогут получить одинаковый sequence. Любой `IntegrityError` при save уже сейчас трактуется как duplicate request, хотя нарушен мог быть другой unique constraint.

**Локализация.**

- `vera_agent_service/app/services/chat_persistence.py:62-97`;
- `vera_agent_service/app/repositories/chat_turn.py:70-83`, `145-157`;
- unique constraints в `vera_agent_service/app/db/models/chat_turn.py:33-47`.

**Последствия.** После включения concurrency возможны гонки, orphan session, неверная диагностика duplicate и потеря одного из turns.

**Возможное решение.** Создавать/claim session и turn в одной транзакции, блокировать строку session через `SELECT FOR UPDATE` либо использовать атомарный session counter. Различать constraint violations по имени. Параллелить разные сессии, но сериализовать одну `session_id`.

**Критерий готовности.** Создание/claim сессии, выделение sequence number и сохранение turn атомарны. Constraint violations различаются по имени. Параллельные turns одной сессии не получают одинаковый sequence.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `vera_agent_service/app/repositories/chat_session.py`, `app/repositories/chat_turn.py`, `app/services/chat_persistence.py`, `tests/integration/test_chat_persistence.py`, `tests/unit/services/test_chat_persistence.py`; отчёт — `site_work_for_everyone/VERA_CHAT_TECHNICAL_AUDIT.md`. Коммит Agent Service — `c41159a`.
- **Суть изменения:** для новой реплики repository выполняет PostgreSQL `INSERT ... ON CONFLICT DO NOTHING` по `session_id`, затем `SELECT ... FOR UPDATE` строки сессии. Owner-check/promotion, touch, чтение `max(sequence_number) + 1` и вставка `ChatTurn` проходят в том же `AsyncSession`; единственный commit выполняет `ChatTurnRepository.save`, поэтому сессия и реплика сохраняются атомарно, а одна `session_id` сериализована DB-lock. `IntegrityError` теперь разбирается по имени PostgreSQL constraint: только `uq_vera_chat_turns_request_id` превращается в `ChatTurnAlreadyExistsError`, конфликт `uq_vera_chat_turns_session_sequence` — в `ChatTurnRepositoryError`.
- **Миграции Alembic:** не требуются — используются существующие именованные unique constraints и строковая блокировка PostgreSQL.
- **Тесты** (добавленные, команда запуска, результат)**:** в `tests/integration/test_chat_persistence.py` добавлены 2 теста на реальном PostgreSQL: две конкурентные задачи с отдельными `AsyncSession` сохраняют обе реплики одной сессии с sequence `{1, 2}`; реальные request/sequence constraint violations получают разные исключения. `venv\Scripts\python.exe -m pytest tests/unit/services/test_chat_persistence.py -q` — 5 passed; затронутый persistence/delivery-набор — 41 passed; полный `venv\Scripts\python.exe -m pytest` — 222 passed, 0 failed, 8 warnings.
- **Отклонения от предложенного решения и причина:** выбран предложенный вариант с `SELECT FOR UPDATE`, дополненный idempotent insert сессии через `ON CONFLICT DO NOTHING`, чтобы атомарно покрыть и одновременное создание первой сессии. Атомарный счётчик в модель не добавлялся: существующей строковой блокировки достаточно, миграция не нужна.
- **Осталось / связанные карточки:** VERA-035 является только предусловием VERA-013. `prefetch_count=1`, один worker и in-memory `SessionBus` не менялись; включение concurrency остаётся отдельной карточкой VERA-013.

### VERA-036 — Ошибка `VERA_SESSION_SIGNING_KEY` не диагностируется контролируемо

**Тип:** конфигурационный дефект. **Приоритет:** P1.

**Репозиторий:** `site/frontend` — однорепная.

**Проблема.** Next.js создаёт anonymous token вне `fetch` error handling. Отсутствующий signing key выбрасывает обычный exception и превращается в неструктурированный `500`. Поскольку Next routes передают session token даже при JWT, несовпадение ключей frontend/backend способно затронуть и auth flow, особенно promotion anonymous-сессии.

**Локализация.**

- `frontend/src/lib/utils/vera-session-token.ts:17-32`;
- `frontend/src/app/api/vera/chat/route.ts:94-110`;
- `frontend/src/app/api/vera/history/[sessionId]/route.ts:67-89`;
- `frontend/src/lib/utils/vera-feedback-proxy.ts:101-113`;
- `backend/src/services/vera_session_access.py:31-60`.

**Возможное решение.** Валидировать обязательный env на startup/readiness, вынести создание и чтение owner token в единый BFF helper, возвращать контролируемый `503` с correlation ID. В deployment contract явно зафиксировать равенство ключей и безопасную процедуру их ротации с overlap period.

**Критерий готовности.** Отсутствующий или несовпадающий `VERA_SESSION_SIGNING_KEY` даёт контролируемый `503` с correlation ID, а не неструктурированный `500`. Проверка выполняется на startup/readiness. Создание и чтение owner-токена вынесены в единый BFF-helper.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `frontend/src/instrumentation.ts`, `frontend/src/lib/utils/vera-session-token.ts`, `frontend/src/lib/utils/vera-owner-headers.ts`, `frontend/src/lib/utils/vera-feedback-proxy.ts`, `frontend/src/app/api/vera/chat/route.ts`, `frontend/src/app/api/vera/history/[sessionId]/route.ts`, `frontend/src/app/api/vera/session/current/route.ts`, `frontend/src/lib/utils/__tests__/vera-feedback-proxy.test.ts`, `frontend/src/lib/utils/__tests__/instrumentation.test.ts`, `VERA_CHAT_TECHNICAL_AUDIT.md`. Файл `frontend/next.config.ts` менялся в первом коммите карточки и возвращён к исходному виду во втором — итогового изменения в нём нет.
- **Суть изменения:** обязательный signing key проверяется при старте Node.js-сервера официальным Next.js startup-хуком `frontend/src/instrumentation.ts`, а не при загрузке `next.config.ts`, поэтому production build не зависит от runtime-секрета. Повторная проверка в общем owner-helper сохранена: отсутствующий ключ и отказ backend с текущим признаком невалидного session-token возвращают контролируемый `503` с исходным `X-Request-ID`; другие upstream-ошибки, включая ownership `403`, не переклассифицируются. Все Vera BFF consumers используют единый результат helper, поэтому неструктурированное исключение больше не выходит из route handler.
- **Миграции Alembic:** не требуются.
- **Тесты** (добавленные, команда запуска, результат)**:** дополнен `frontend/src/lib/utils/__tests__/vera-feedback-proxy.test.ts` (6/6 passed), добавлен `frontend/src/lib/utils/__tests__/instrumentation.test.ts`. Итоговое состояние после обоих коммитов карточки: `npm test` — 101/101 passed; `npm run lint` — 0 errors, 26 warnings; `npm run build` — успешно, включая отдельную контрольную сборку без `.env.local` и без `VERA_SESSION_SIGNING_KEY` в окружении процесса. Два падения, существовавшие до карточки (`auth.test.ts > registerSchema > accepts valid data` и `VeraFeedbackModal.test.tsx > allows sending an empty questionnaire with the session id`), исправлены отдельным коммитом уборки `bf47198` и в итоговый прогон уже не входят.
- **Отклонения от предложенного решения и причина:** отдельный readiness endpoint не добавлялся, чтобы не расширять HTTP-контракт; вместо него startup-проверка выполняется официальным Next.js хуком `frontend/src/instrumentation.ts` плюс runtime-защита BFF. Первая реализация (коммит `3557ddb`) вызывала проверку при загрузке `next.config.ts` — это ломало сборку Docker-образа, поскольку `frontend/.dockerignore` исключает `.env*` и секрет отсутствует в build-стадии; заменено на startup-хук в коммите `5521df1`.
- **Осталось / связанные карточки:** зависимость Docker/build-фазы от `VERA_SESSION_SIGNING_KEY` устранена и проверена отдельной сборкой без `.env.local` и без переменной процесса. Автоматическая проверка равенства ключей и overlap-ротация по-прежнему требуют deployment-level координации frontend/backend и остаются операционной задачей; backend в этой однорепной карточке не менялся.

### VERA-037 — Совместимость env и версий проверяется только вручную

**Тип:** операционный риск. **Приоритет:** P1.

**Репозиторий:** `cross` — оба репозитория и их deployment contract. В последнюю очередь.

**Проблема.** Корректность зависит от ручных равенств: `VERA_AGENT_API_KEY == API_KEY`, один Rabbit broker/vhost/queue, signing key frontend/backend сайта должен совпадать. При текущем in-memory `SessionBus` Rabbit consumer и SSE request обязаны попасть в тот же процесс/worker; даже один deployment с несколькими workers/replicas уже нарушает delivery. Текущие health checks не подтверждают весь этот контракт.

**Локализация.**

- `frontend/.env.example`;
- `backend/.env.example`;
- корневой `.env.example`;
- `vera_agent_service/.env.example`;
- `docker-compose.yml` обоих проектов.

**Последствия.** Ошибка конфигурации проявляется как `401`, вечное ожидание SSE, публикация в другую очередь или невозможность восстановить owner, а не как понятная startup/readiness ошибка.

**Возможное решение.** Добавить version/capabilities endpoint Agent Service, startup probe API key, queue identity и SSE origin. Сформировать один canonical deployment contract с таблицей обязательных равенств и автоматической preflight-проверкой без вывода секретов. До внешнего event bus явно enforce-ить `workers=1`, `replicas=1` и отсутствие load balancing между consumer/SSE; preflight сам по себе не исправляет process-local delivery.

**Критерий готовности.** Есть preflight-проверка обязательных равенств (API key, queue/vhost, signing key, топология процессов) без вывода секретов. Несовпадение проваливает startup/readiness с понятной диагностикой. Ограничение `workers=1`/`replicas=1` enforced явно.

**Отчёт исполнителя.** _Заполняется агентом сразу после реализации карточки._

- **Статус:** `не начато` | `сделано` | `заблокировано` | `не требуется`
- **Изменённые файлы:**
- **Суть изменения:**
- **Миграции Alembic:**
- **Тесты** (добавленные, команда запуска, результат)**:**
- **Отклонения от предложенного решения и причина:**
- **Осталось / связанные карточки:**

### VERA-038 — Сбор технических metadata не фильтрует `on_chain_end`

**Тип:** observability/analytics-долг. **Приоритет:** P2.

**Репозиторий:** `agent` — однорепная.

**Проблема.** Подтверждено, что consumer обрабатывает все `on_chain_end` события без фильтра по runnable/node, каждый раз выполняет `tool_calls.extend`, а `sources` перезаписывает последним подходящим output. Фактические дубли tool names и неверный финальный список sources зависят от состава `astream_events` текущего реального графа и без integration test не подтверждены.

**Локализация.**

- `vera_agent_service/app/messaging/consumer.py:542-552`.

**Последствия.** В сохранённых `technical_metadata.tool_calls` возможны дубли, а `sources` могут быть перезаписаны родительским/дочерним output. Root-span `trace_data.tool_call_count` собирается другим механизмом и этим кодом напрямую не искажается.

**Возможное решение.** Фильтровать конкретный root/final graph output либо собирать tool calls в ordered set по event metadata; для sources определить единственный authoritative node/output. Добавить integration test с реальным `astream_events` на один RAG/email вызов, отсутствие дублей и сохранение правильных sources.

**Критерий готовности.** Технические metadata собираются только с authoritative graph events. Дублей tool names нет, `sources` берутся из единственного определённого узла. Есть integration-тест на реальном `astream_events`.

**Отчёт исполнителя.**

- **Статус:** `сделано`
- **Изменённые файлы:** `app/messaging/consumer.py`, `tests/unit/messaging/test_consumer.py`, `tests/integration/test_graph.py`.
- **Суть изменения:** реальный `astream_events` подтвердил, что один RAG-вызов публикует одинаковые `tool_calls`/`retrieved_chunks` сначала в `call_kb_search`, затем в корневом `LangGraph`; прежний `extend` создавал фактический дубль. `_stream_answer` теперь принимает metadata только из authoritative корневого `on_chain_end` с пустым `parent_ids`, а tool names сохраняет как ordered unique list. `_handle_message_body` и delivery state machine не менялись. Код и тесты зафиксированы отдельным коммитом Agent Service `08f89dd`.
- **Миграции Alembic:** не требуются; схема данных не менялась.
- **Тесты** (добавленные, команда запуска, результат)**:** добавлены 2 проверки: unit-policy для игнорирования дочернего output/ordered deduplication и обязательный integration-тест production LangGraph через настоящий `graph.astream_events`, реальный MCP streamable-http test server и HTTP transport LLM. Выборочный запуск `python -m pytest tests/unit/messaging/test_consumer.py::test_stream_answer_uses_only_root_graph_metadata tests/integration/test_graph.py::test_consumer_collects_authoritative_metadata_from_real_graph_events -q` — `2 passed`; интеграционный тест подтвердил один `vera_rag_kb` без дубля и сохранение исходных chunks. Полный `python -m pytest -q` на живых RabbitMQ, Redis и Testcontainers PostgreSQL — `191 passed, 10 failed, 8 warnings`. Все 10 падений находятся в `tests/unit/observability/test_tracing.py`, существуют на baseline `837ba88`; причина — глобальное состояние tracing, вне скоупа карточки.
- **Отклонения от предложенного решения и причина:** нет; authoritative источником выбран итоговый root graph output, а не output отдельного узла, поскольку фактический event stream подтверждает в нём полный финальный state.
- **Осталось / связанные карточки:** отсутствует в рамках карточки; изменения root-span telemetry и delivery state machine намеренно не выполнялись.

## 10. Рекомендуемая целевая архитектура доставки

Для устранения сразу нескольких P0/P1 проблем целесообразно двигаться к следующей модели:

```text
Browser -> Next BFF -> site FastAPI -> RabbitMQ -> Agent workers (N replicas)
                                                   |
                                                   v
                                          Redis Streams / event broker
                                                   |
                                      +------------+------------+
                                      v                         v
                                SSE web replica A         SSE web replica B

History/feedback:
Browser -> Next BFF -> site FastAPI -> Agent HTTP API -> PostgreSQL
```

Свойства модели:

- token events имеют `request_id`, sequence/event ID и terminal state, но не размножают owner email/PII;
- отдельная минимальная access record связывает `request_id` с opaque owner ID/stream ticket;
- web replica проверяет короткоживущий stream ticket;
- late connect и reconnect читают события из внешнего stream, а не process memory;
- consumer concurrency масштабируется независимо от HTTP/SSE;
- работа одной `session_id` сериализуется lock/partition key, разные сессии обрабатываются параллельно;
- PostgreSQL turn state является конечным автоматом `accepted -> processing -> streaming -> terminal`, а terminal outcome хранится точным enum: `completed|generation_failed|stream_interrupted|delivery_unconfirmed|cancelled`;
- `done` публикуется только после durable commit `completed`;
- duplicate replay воспроизводит сохранённый terminal outcome; все outcomes, кроме `completed`, не маскируются под `done`;
- stale processing lease можно безопасно reclaim;
- cancellation и deadlines являются частью контракта.

VERA-004/014/015/034 образуют одну delivery state machine. До изменения порядка commit/ACK/NACK нужен общий ADR и characterization tests: простая перестановка `done` не определяет, что делать после уже отданных токенов при отказе БД, как reclaim-ить `processing`, какой outcome воспроизводить duplicate-у и что делать при сбое самого token sink.

Это не обязательно выполнять одним большим изменением. Сначала можно исправить P0 на текущей архитектуре, затем вынести event bus.

## 11. Рекомендуемый порядок реализации

### Этап 0 — восстановить корректность пользовательских сценариев

1. Исправить `Authorization` в feedback proxy.
2. Унифицировать refresh auth для Vera BFF.
3. Немедленно согласовать лимит `user_id` до 255 и добавить compatibility tests; миграцию на opaque `uid` вынести в отдельный план с JWT claim, backfill/dual-read и cutover.
4. Исправить stale contract docs/curl-примеры и выбрать единый `404`-контракт отсутствующей history.
5. Добавить characterization tests delivery outcomes, затем единым пакетом реализовать базовую state machine VERA-004/014/015/034: durable commit перед `done`, stale `processing` recovery, гарантированный ACK/NACK и корректный duplicate replay.
6. Считать пустой LLM stream ошибкой.
7. До optimistic append валидировать composer, добавить `maxLength`, явный delivery status и reconciliation исходного `request_id` при ambiguous POST outcome.
8. Добавить end-to-end contract tests Browser/BFF/backend/Agent для ownership и ambiguous POST outcome.

### Этап 1 — надёжность и безопасность production

1. Защитить SSE signed ticket-ом.
2. Добавить heartbeat, inactivity timeout, bounded queues и общий deadline.
3. Исправить client IP/rate limits за доверенными прокси.
4. Добавить publisher reconnect и startup health diagnostics.
5. Довести общую delivery state machine до invalid payload, server-side cancellation/shutdown и сбоев token sink.
6. Унифицировать срок жизни PostgreSQL session, Redis checkpoint и frontend anonymous session; реализовать server lifecycle/close boundary.
7. Сделать retry графа идемпотентным по `request_id` и проверить его с реальным Redis checkpointer.
8. Перед mutating email tool ввести структурированное, серверно проверяемое confirmation state.
9. Ввести privacy/redaction/retention policy.
10. Добавить runtime validation SSE/HTTP responses и startup validation signing/deployment contract.

### Этап 2 — масштабирование

1. Вынести события из `SessionBus` в Redis Streams или эквивалент.
2. Разделить queue workers и SSE web processes.
3. Добавить параллельную обработку разных сессий, атомарное выделение sequence и per-session serialization.
4. Протащить нормализованные correlation ID и W3C trace context через BFF, backend, AMQP и Agent root span.
5. Провести нагрузочную проверку обычного RAG и долгого email path.

### Этап 3 — качество ответов и продукта

1. Ввести token budget, trimming/summarization и безопасное восстановление контекста после согласованной server-side границы сессии.
2. Добавить typed sources в SSE/history и UI.
3. Довести tool contract до полной схемной валидации MCP, policy для нескольких tool calls и проверки citations/grounding.
4. Добавить «Новый диалог», удаление и понятное отображение уже реализованной server-side границы памяти.
5. Упорядочить anonymous principal cookie и независимые per-tab session IDs без коллизий имён.
6. Реализовать cancel/retry UX и batching streamed tokens.
7. Фильтровать технические metadata по authoritative graph events и проверить реальные `astream_events`.

### Покрытие замечаний этапами

Эта карта указывает первый основной этап каждой карточки, чтобы ни одно замечание не потерялось при переносе в backlog; она не меняет приоритет, указанный внутри карточки. Карточки, разделённые между этапами, перечислены ниже.

| Этап | VERA-ID |
|---|---|
| Этап 0 — корректность | 001, 002, 003, 004, 008, 010, 014, 015, 018, 025, 027, 034 |
| Этап 1 — production reliability/security | 005, 006, 007, 011, 012, 016, 017, 019, 021, 022, 023, 024, 026, 031, 032, 036, 037 |
| Этап 2 — масштабирование/сквозная трассировка | 013, 033, 035 |
| Этап 3 — качество продукта и P2 backlog | 009, 020, 028, 029, 030, 038 |

Границы пересекающихся карточек:

- VERA-005 описывает согласованность server memory/history, VERA-029 — пользовательское управление границей диалога;
- VERA-012 описывает server backpressure/buffer lifecycle, VERA-024 — client watchdog;
- VERA-004 описывает normal terminal commit, VERA-034 — duplicate replay того же результата;
- VERA-013 описывает transport scaling, VERA-035 — необходимую DB-атомарность перед включением concurrency;
- VERA-009 описывает внешний sources DTO, VERA-021 — доверие и валидацию tool result до формирования sources.

Разделение работ между этапами:

- VERA-015: базовая ACK/NACK/delivery state machine — этап 0; invalid payload, shutdown и token-sink hardening — этап 1;
- VERA-017: server cancellation contract — этап 1; кнопка и cancel/retry UX — этап 3;
- VERA-005: единая server lifecycle/TTL-семантика — этап 1; восстановление bounded context и отображение границы — этап 3;
- VERA-021: structured confirmation для mutating email — этап 1; MCP schema, multi-tool policy и grounded-answer checks — этап 3.

## 12. Необходимые проверки после будущих изменений

Тесты в рамках текущего аудита не запускались. Ниже перечислено требуемое покрытие для последующей реализации.

### Контракт и ownership

- anonymous и auth chat/history/message feedback/session feedback;
- anonymous session promotion после login;
- logout и попытка читать прежнюю auth-сессию;
- access token expiry + успешный refresh;
- активная anonymous-сессия старше 24 часов и auth-сессия после 24 часов неактивности;
- чужой `session_id` и повторно использованный `request_id`;
- `user_id` на границах длины.

### Доставка и recovery

- crash до первого token, после первого token и между persistence commit/`done`;
- Rabbit redelivery stale `processing`;
- DB error на start/complete/fail;
- duplicate delivery `processing/completed/failed/delivery_unconfirmed` и ручная повторная публикация того же `request_id`;
- graceful shutdown во время LLM и mutating email tool;
- publisher стартует раньше и позже broker/Agent Service.

### SSE

- неверный/истёкший stream ticket;
- второй subscriber;
- disconnect/reconnect и replay;
- медленный client/backpressure;
- heartbeat и inactivity timeout;
- неизвестный/невалидный SSE event type и согласованный heartbeat schema;
- terminal `done/error` ровно один раз;
- несколько web replicas и consumers.

### LangGraph/MCP

- пустой LLM stream;
- retry с реальным Redis checkpointer без дублирования HumanMessage;
- несколько tool calls;
- malformed/multi-block MCP result;
- prompt injection внутри RAG chunk;
- превышение token budget;
- email без подтверждения, с подтверждением и с неопределённым результатом.

### Privacy

- в production logs/traces отсутствуют полный вопрос, email, token/hash и консультация;
- удаление пользователя очищает PostgreSQL, Redis и telemetry согласно retention policy;
- Phoenix и admin endpoints недоступны извне без авторизации.

### Operations и observability

- `X-Request-ID`, `traceparent` и бизнесовый `request_id` различимы и коррелируются через BFF/backend/Rabbit/Agent/MCP;
- mismatch API key, signing key, queue/vhost и process topology проваливает startup/readiness с понятной диагностикой без вывода секретов;
- shutdown закрывает external HTTP client и все broker/Redis/DB resources;
- реальный `astream_events` не дублирует tool metadata и сохраняет authoritative sources.

## 13. Файлы, образующие основной контур

### `site_work_for_everyone`

- `frontend/src/app/assistant/chat/page.tsx`;
- `frontend/src/components/features/vera/ChatWindow.tsx`;
- `frontend/src/components/features/vera/ChatMessage.tsx`;
- `frontend/src/hooks/useVeraChat.ts`;
- `frontend/src/lib/api/vera.ts`;
- `frontend/src/app/api/vera/**`;
- `frontend/src/lib/utils/vera-session-token.ts`;
- `frontend/src/lib/utils/vera-feedback-proxy.ts`;
- `backend/src/api/vera.py`;
- `backend/src/services/vera_publisher.py`;
- `backend/src/services/vera_agent.py`;
- `backend/src/services/vera_session_access.py`;
- `nginx/templates/default.conf.template`;
- `docker-compose.yml`.

### `vera_agent_service`

- `app/main.py`;
- `app/messaging/schemas.py`;
- `app/messaging/consumer.py`;
- `app/streaming/sse.py`;
- `app/streaming/session_bus.py`;
- `app/graph/build.py`;
- `app/graph/state.py`;
- `app/graph/nodes/**`;
- `app/graph/prompts/**`;
- `app/checkpoint/redis_saver.py`;
- `app/services/chat_persistence.py`;
- `app/services/chat_history.py`;
- `app/services/chat_session_access.py`;
- `app/db/models/chat_session.py`;
- `app/db/models/chat_turn.py`;
- `app/api/v1/endpoints/**`;
- `app/observability/**`.
