# Несколько чатов с Верой: план реализации

> Статус: проектный план, код ещё не реализован.  
> Дата: 2026-08-10.  
> Затрагиваемые проекты: `site_work_for_everyone` и `vera_agent_service`.

---

## 1. Цель

Заменить текущую модель «один видимый диалог плюс временно показанный предшественник» на полноценный серверный каталог чатов:

- пользователь видит все свои сохранённые чаты после обновления страницы и на другом устройстве;
- кнопка **«+ Новый чат»** создаёт отдельный контекст;
- старый чат не исчезает, а остаётся в списке и может быть продолжен, пока его серверный контекст активен;
- чат можно удалить отдельным явным действием;
- удаление означает не скрытие строки в интерфейсе, а гарантированную очистку PostgreSQL, Redis и связанных данных по утверждённой retention-политике.

Это продолжение VERA-005 и VERA-029. Текущий дефект возникает потому, что предыдущие сессии сохраняются в PostgreSQL, но frontend держит их только в `previousSessionGroups` в памяти React. После reload остаётся только текущий `session_id` из `sessionStorage`, поэтому прежний чат визуально пропадает.

## 2. Принятые продуктовые решения

| Вопрос | Решение |
|---|---|
| Что считается чатом | Одна `ChatSession` — один пользовательский чат и одна граница контекста модели |
| Сколько чатов хранится | Все неудалённые чаты владельца в пределах retention |
| Сколько чатов одновременно продолжается | Несколько открытых чатов; выбранный определяется URL, а не глобальным client storage |
| Что делает «Новый чат» | Создаёт новую сессию и открывает её, не закрывая и не удаляя другие чаты |
| Где находится действие | В панели списка чатов, а не отдельной кнопкой внутри ленты сообщений |
| Что происходит со старым чатом | Он остаётся отдельной строкой каталога и доступен после reload; открытый чат можно продолжить |
| Можно ли продолжить завершённый чат | Не в истёкшем контексте. UI предлагает «Продолжить в новом чате», не передавая старую историю модели и честно обозначая границу |
| Что делает «Удалить» | Необратимо удаляет чат и связанные данные; это не синоним `close`/`closed_at` |
| Заголовок чата | Нормализованные первые 120 символов первого вопроса; fallback «Новый чат». LLM для названия в v1 не вызывается |
| Переименование | Не входит в v1, но схема не должна мешать добавить его позже |
| Анонимный режим | В v1 остаётся один текущий чат. Каталог и управление несколькими чатами доступны после входа |

PostgreSQL уже допускает несколько открытых сессий одного auth-владельца: уникален только `session_id`. Поэтому для настоящего multi-chat не нужна искусственная глобальная «текущая сессия». Текущий `startNewDialog` следует изменить с `close → create` на create-only; проверенный close/recovery flow остаётся для lifecycle-закрытия, но больше не используется как навигация.

### Когда чат становится read-only

Обычный открытый чат можно выбрать и продолжить. Redis-контекст живёт 24 часа неактивности, а PostgreSQL-история хранится дольше. После `closed_at` или потери Redis checkpoint чат становится read-only: попытка продолжения создаёт новую сессию и явно связывает её с предшественником, но старые сообщения не выдаются модели за сохранённую память.

### Чего в интерфейсе не будет

- кнопки «Очистить историю», которая на самом деле только меняет `session_id`;
- незаметного удаления данных при создании нового чата;
- старых сообщений, подмешанных в новую ленту только до первого reload;
- нескольких разных смыслов у одной кнопки «Новый диалог».

## 3. Целевой пользовательский сценарий

1. Пользователь открывает `/assistant/chat`.
2. Сайт получает серверный список чатов и открывает последний открытый либо последний доступный.
3. Выбранный чат отражается в URL: `/assistant/chat/{sessionId}`.
4. Нажатие «+ Новый чат» идемпотентно создаёт новую сессию, затем открывает новый URL и обновляет каталог. Другие открытые сессии не закрываются.
5. Старый чат остаётся в списке. Пока его контекст активен, пользователь может вернуться и продолжить его; для закрытого чата composer заменяется пояснением о завершённом контексте.
6. В меню строки доступно «Удалить». После подтверждения чат сразу блокируется и скрывается, а сервер завершает физическую очистку.
7. После удаления выбранного чата интерфейс открывает следующий доступный чат. Если список пуст, показывается empty state с кнопкой «Новый чат»; новая сессия не создаётся без действия пользователя.

## 4. Целевой интерфейс

### Desktop

```text
┌──────────────────────────────────────────────────────────────────────┐
│                           общий Header                               │
├──────────────────────┬───────────────────────────────────────────────┤
│ Чаты с Верой         │ Название выбранного чата                     │
│                      ├───────────────────────────────────────────────┤
│ ● Выбранный чат   ⋯  │                                               │
│   Поиск работы    ⋯  │          история выбранного чата              │
│   Резюме          ⋯  │                                               │
│                      ├───────────────────────────────────────────────┤
│ [Показать ещё]       │ composer ИЛИ уведомление «Чат завершён»       │
│                      │                                               │
│ [+ Новый чат]        │                                               │
└──────────────────────┴───────────────────────────────────────────────┘
```

- sidebar шириной около `17rem`, общий контейнер страницы — до `max-w-7xl`;
- выбранный пункт имеет текстовый маркер и `aria-current="page"`, а не отличается только цветом;
- меню `⋯` является соседней кнопкой ссылки, а не вложенным интерактивным элементом;
- «+ Новый чат» закреплён в нижней части панели.

### Mobile

```text
┌────────────────────────────────────┐
│ [☰ Чаты]  Название чата            │
├────────────────────────────────────┤
│                                    │
│              история               │
│                                    │
├────────────────────────────────────┤
│ composer / «Чат завершён»          │
└────────────────────────────────────┘

Drawer:
┌────────────────────────┐░░░░░░░░░░░
│ Чаты с Верой        [×]│░ overlay
│ список                 │░
│ [Показать ещё]          │░
│ [+ Новый чат]           │░
└────────────────────────┘░
```

Drawer строится на `react-aria-components`: focus trap, закрытие по Escape, возврат фокуса на кнопку открытия, корректные `aria-expanded` и `aria-controls`. Минимальная зона нажатия — 44×44 px.

### Удаление

Перед удалением открывается `alertdialog`:

> **Удалить чат «Поиск работы»?**  
> Сообщения и обратную связь нельзя будет восстановить.

Начальный фокус находится на безопасной кнопке «Отмена». Кнопка подтверждения имеет destructive-стиль. При ошибке dialog остаётся открыт и показывает причину; при `409` сообщает, что нужно дождаться завершения текущего ответа.

## 5. Навигация и frontend-архитектура

### Маршруты

- `/assistant/chat` — загружает каталог и делает `router.replace` на последний открытый/последний доступный чат либо показывает empty state;
- `/assistant/chat/[sessionId]` — открывает конкретный чат;
- Back/Forward переключают чаты и никогда не создают новую сессию;
- `403` и `404` показываются одинаково: «Чат недоступен или удалён», затем выбирается доступный чат.

`sessionId` должен быть формально ограничен UUID и не считается секретом. Авторизация всё равно проверяется на каждом запросе. В URL нельзя помещать owner token, email или заголовок чата. Путь `/assistant/chat/*` нужно исключить из сбора полного URL в аналитике и лишнего access-логирования.

### Разделение состояния

Не следует дальше расширять большой `useVeraChat.ts`. Предлагаемая граница:

- `useVeraSessions` — каталог, keyset pagination, create/delete mutations;
- `useVeraSessionHistory` — история выбранного завершённого чата;
- `useVeraChat` — только выбранная открытая lifecycle/SSE-сессия и отправка сообщений;
- TanStack Query хранит server state с ключами `['vera', 'sessions']` и `['vera', 'history', sessionId]`;
- после create/close/delete/TTL-rollover соответствующие queries инвалидируются;
- callbacks старого чата, SSE и history-запросы отменяются при смене URL или владельца и не могут обновить новую ленту.

После перехода на каталог удалить `previousSessionGroups`: завершённые чаты показываются отдельными маршрутами, а не временными группами внутри текущей ленты.

### Новые frontend-компоненты

- `frontend/src/components/features/vera/ChatWorkspace.tsx`;
- `frontend/src/components/features/vera/ChatSidebar.tsx`;
- `frontend/src/components/features/vera/ChatDrawer.tsx`;
- `frontend/src/components/features/vera/ChatList.tsx`;
- `frontend/src/components/features/vera/DeleteChatDialog.tsx`;
- `frontend/src/components/features/vera/ClosedChatNotice.tsx`;
- `frontend/src/hooks/useVeraSessions.ts`;
- `frontend/src/hooks/useVeraSessionHistory.ts`;
- `frontend/src/app/assistant/chat/layout.tsx`;
- `frontend/src/app/assistant/chat/[sessionId]/page.tsx`.

Используется существующая тёмная дизайн-система с золотым акцентом, `Button`, `Modal`, live-region и правила WCAG 2.2 AA из `docs/DESIGN_GUIDE.md`.

## 6. API-контракты

Путь запроса не меняется:

```text
Browser → Next.js BFF → site backend → Agent Service
```

Browser не получает прямой Agent URL/API key.

### Agent Service

#### Список

```http
GET /api/v1/chat/sessions?limit=30&cursor={opaque}&state=all
```

```json
{
  "items": [
    {
      "session_id": "uuid",
      "title": "Как адаптировать резюме…",
      "created_at": "2026-08-10T10:00:00Z",
      "last_activity_at": "2026-08-10T10:15:00Z",
      "closed_at": null,
      "status": "open",
      "predecessor_session_id": null
    }
  ],
  "next_cursor": "opaque-or-null"
}
```

Требования:

- сортировка `(last_activity_at DESC, id DESC)`;
- keyset pagination, default 30, максимум 50;
- owner-фильтр выполняется в SQL, а не после выборки в Python;
- deleting/deleted записи не возвращаются;
- list не обращается к Redis и не обновляет `last_activity_at`, иначе открытие sidebar искусственно продлевало бы контекст;
- ответ не содержит email, owner hash, полный вопрос или токены доступа.

`GET /sessions/current` остаётся compatibility endpoint и больше не определяет выбранный пункт каталога. Его read-path также не должен продлевать `last_activity_at`/Redis TTL. Выбор и простое чтение истории не являются активностью модели; порядок меняется только после фактического turn или создания чата.

#### Создание и закрытие

Переиспользуются уже реализованные идемпотентные команды:

```http
POST /api/v1/chat/sessions
POST /api/v1/chat/sessions/{sessionId}/close
```

`sessionId`, сгенерированный клиентом как UUID, остаётся idempotency key. Для явного «Нового чата» вызывается только create; `close` используется серверным lifecycle и явным завершением контекста, но не переключением между открытыми чатами. Журнал create сохраняется до durable success, чтобы timeout/reload повторял тот же UUID.

#### История

Переиспользуется существующий endpoint:

```http
GET /api/v1/chat/sessions/{sessionId}/history?cursor=...
```

Открытый чат читается и продолжается. Закрытый чат читается, но новые turns в него не записываются. Если pre-send resolve обнаружил истёкший или отсутствующий checkpoint, сервер закрывает предшественника, создаёт successor, а frontend открывает successor как новую строку каталога и показывает ссылку на прежний чат.

#### Удаление

```http
DELETE /api/v1/chat/sessions/{sessionId}
Idempotency-Key: {requestId}
```

Рекомендуемый контракт:

- `202 Accepted` — сессия немедленно скрыта и заблокирована, purge выполняется/повторяется;
- `204 No Content` — purge уже полностью завершён, включая повтор потерянного запроса;
- `409 chat_has_active_turn` — есть живая `processing`-реплика; пользователь должен дождаться ответа;
- чужой и несуществующий ID имеют одинаковый внешний результат и не раскрывают существование чужого чата.

Для асинхронного завершения:

```http
GET /api/v1/chat/session-deletions/{operationId}
```

```json
{
  "operation_id": "uuid",
  "session_id": "uuid",
  "status": "pending|completed|failed"
}
```

### site backend

Добавить прокси с текущей owner-проверкой и сохранением upstream-кодов:

- `GET /api/vera/sessions`;
- `DELETE /api/vera/session/{sessionId}`;
- `GET /api/vera/session-deletions/{operationId}` при асинхронном purge.

### Next.js BFF

Добавить:

- `frontend/src/app/api/vera/sessions/route.ts`;
- `frontend/src/app/api/vera/session/[sessionId]/route.ts` для `DELETE`;
- status route, если принят `202`-контракт.

Обязательны `cache: 'no-store'`, timeout, `X-Request-ID`, Zod-валидация, binding `session_id` к path, существующие owner headers/cookies, rate limit и origin/CSRF-проверка для mutation.

## 7. Модель данных и миграция

### `vera_chat_sessions`

Добавить:

- `title varchar(120) NULL`;
- `deletion_requested_at timestamptz NULL`;
- при необходимости `deletion_operation_id uuid NULL` для связи с purge receipt;
- `predecessor_session_id uuid NULL` с `ON DELETE SET NULL` — только для TTL-rollover/«Продолжить в новом чате», не для обычного «Нового чата»;
- индекс `(user_id, last_activity_at DESC, id DESC) WHERE deletion_requested_at IS NULL`.

Заголовок записывается при успешном commit первого user turn. Существующие записи backfill-ятся пакетно из самого раннего вопроса; если данных нет — UI показывает «Новый чат».

### Tombstone/deletion receipt

Добавить отдельную таблицу без содержимого диалога, например `vera_chat_session_deletions`:

- `session_id_hash char(64)` — primary key;
- `operation_id uuid` — unique;
- `status`, `requested_at`, `completed_at`, `last_error`, `attempts`;
- bounded `expires_at` для удаления receipt после установленного срока.

Tombstone нужен не для хранения истории, а чтобы позднее RabbitMQ-сообщение не воссоздало уже удалённую сессию. В receipt нельзя сохранять вопрос, ответ, email, owner token или sources.

### Существующие каскады

PostgreSQL уже имеет основу для удаления:

```text
ChatSession
├─ ChatTurn                 ON DELETE CASCADE
│  └─ MessageFeedback      ON DELETE CASCADE
└─ SessionFeedback          ON DELETE CASCADE
```

Миграция должна отдельно проверить backfill, новые индексы и upgrade от предыдущего Alembic head. Текущего `Base.metadata.create_all()` в интеграционных тестах недостаточно.

## 8. Безопасная state machine удаления

```text
VISIBLE
   │ DELETE + owner check + lock
   ▼
DELETING ── новый send/history/list запрещён
   │
   ├─ Redis checkpoints/writes
   ├─ SessionBus/SSE buffers и tickets
   ├─ PostgreSQL turns + feedback
   ├─ telemetry по принятой политике
   └─ ссылки predecessor/successor в service_metadata
   │
   ▼
DELETED + bounded tombstone
```

Алгоритм:

1. В PostgreSQL transaction взять стабильный advisory lock по `sessionId`, затем `SELECT ... FOR UPDATE`.
2. Проверить владельца и tombstone.
3. Если есть turn со статусом `processing` и живой lease — вернуть `409`, ничего не менять. Force-cancel не входит в v1.
4. Выставить `deletion_requested_at` и `closed_at`, commit. С этого момента list/history/feedback/resolve/start_turn не видят сессию.
5. Consumer проверяет deletion fence до графа. Уже доставленное queued-сообщение для deleting/deleted session получает ACK и не попадает в graph/DLQ.
6. Удалить Redis-контекст через публичный `AsyncRedisSaver.adelete_thread(sessionId)`, затем проверить отсутствие checkpoint/write хвостов. Не делать `SCAN` по внутренней схеме ключей.
7. Очистить SessionBus buffers/tickets по request IDs.
8. Выполнить утверждённую очистку telemetry.
9. В новой transaction снова взять тот же lock, записать tombstone и hard-delete `ChatSession`; связанные turns и feedback уйдут каскадом.
10. Повторный DELETE или reconciler продолжает операцию с последнего безопасного состояния.

Дополнительно `lock_or_create_for_turn`, create, resolve и consumer должны проверять tombstone. Иначе поздняя RabbitMQ-доставка сможет создать строку заново после hard delete.

RabbitMQ не умеет выборочно стереть одно уже queued сообщение. Поэтому deletion fence предотвращает его обработку, а TTL очереди и DLQ должны быть короче заявленного deletion SLA. Принудительное удаление во время LLM/tool-выполнения потребует отдельного межпроцессного cancellation protocol и не должно имитироваться простым `Task.cancel()` в web-процессе.

## 9. Anonymous и identity

### MVP

Полный каталог реализуется для авторизованных пользователей. Для anonymous:

- остаётся один текущий tab-chat;
- показывается подсказка «Войдите, чтобы сохранять и управлять чатами»;
- после входа текущая анонимная сессия присваивается пользователю существующим flow и появляется в серверном списке;
- при logout/смене аккаунта очищаются queries, локальные journals и callbacks предыдущего владельца.

Причина ограничения: сейчас anonymous owner token привязан к конкретному `sessionId`, а не к общему анонимному владельцу. Cookies нельзя безопасно перечислять как каталог, `/session/current` для anonymous возвращает `null`, а proof истекает через 24 часа.

### Полный anonymous multi-chat — отдельный этап

Если нужен parity, сначала вводится один стабильный подписанный HttpOnly `anonymous-principal`, в Agent хранится только его hash, а list фильтруется по этому hash. Per-session lifecycle proof остаётся отдельным. Нужны lazy claim текущего legacy-чата, ротация principal при login/logout и атомарный перенос выбранного чата в auth-владение.

Для auth owner следует использовать стабильный внутренний UUID пользователя, а не изменяемый email/JWT display field. Переход требует dual-read/backfill и отдельного security review.

## 10. Retention, telemetry и privacy

Закрытие и удаление — разные действия:

- `closed_at` завершает контекст, но сохраняет историю;
- `deletion_requested_at` немедленно запрещает доступ;
- hard delete физически очищает primary stores;
- tombstone хранит только технический факт удаления ограниченное время.

До реализации нужно утвердить сроки с владельцем privacy/legal. Стартовые технические предложения, не готовая юридическая политика:

| Данные | Предлагаемый срок |
|---|---:|
| Redis-контекст | 24 часа неактивности, как сейчас |
| История auth-чатов | 180 дней |
| История anonymous | 30 дней после появления stable principal |
| Telemetry metadata | 30 дней |
| Application logs | 14–30 дней |
| Deletion receipts/tombstones | 7 дней |
| Backup | до 30 дней с повторным применением deletion ledger при restore |

`TRACE_CONTENT_ENABLED=false` должен оставаться production default. Если Phoenix уже получил содержимое, нужен API/адаптер удаления по `session_id` либо документированный короткий retention; нельзя объявлять чат удалённым, оставляя его текст в trace. То же относится к access logs, DLQ и backup.

Обновить `frontend/src/app/privacy/page.tsx`: сроки хранения, разница между закрытием и удалением, обработка anonymous-чатов, telemetry, backup SLA и введённые пользователем персональные данные.

## 11. Конфигурация и `.env`

Для списка и UI новые секреты не нужны. Для retention/deletion понадобятся Agent-настройки с безопасными defaults и отражением в `.env.example`:

```dotenv
CHAT_HISTORY_RETENTION_DAYS=180
CHAT_DELETION_RECEIPT_TTL_DAYS=7
CHAT_DELETION_RECONCILE_INTERVAL_SECONDS=60
CHAT_DELETION_MAX_ATTEMPTS=20
ANONYMOUS_CHAT_RETENTION_DAYS=30
```

Возможны дополнительные server-only credentials для удаления из внешнего Phoenix/telemetry provider — только если выбранный deployment требует отдельный API token. Никакие deletion credentials и owner secrets не должны иметь префикс `NEXT_PUBLIC_`.

Опциональный rollout-флаг:

```dotenv
MULTI_CHAT_ENABLED=false
```

Его включают после последовательного деплоя Agent → site backend → frontend. Nginx-контракт менять не требуется; прямой публичный доступ к новым Agent list/delete endpoints запрещён.

## 12. Поэтапная реализация

### Этап 0. Зафиксировать контракты

- утвердить auth-only MVP;
- утвердить read-only только для закрытых/истёкших чатов;
- утвердить retention и deletion SLA;
- определить Phoenix/log/backup purge;
- формализовать `sessionId` как UUID;
- решить миграцию auth owner с email на стабильный user UUID.

### Этап 1. Agent: каталог

- миграция `title`, `deletion_requested_at`, индексов и receipt/tombstone;
- repository/service keyset-list;
- безопасное заполнение title первым вопросом;
- `GET /sessions` и схемы;
- list не трогает Redis/TTL;
- Alembic upgrade и real PostgreSQL tests.

### Этап 2. site backend и BFF: каталог

- прокси Agent list;
- Zod/Pydantic schema binding;
- `no-store`, owner isolation, rate limit, timeout;
- API/unit tests для malformed upstream, cursor и account switch.

### Этап 3. Frontend: несколько чатов

- динамический route и persistent layout;
- sidebar/drawer, pagination, loading/error/empty states;
- refactor `useVeraChat` и удаление `previousSessionGroups`;
- перенос «+ Новый чат» в каталог без автоматического закрытия предыдущего;
- продолжение открытых чатов и closed history в read-only;
- reload/deep-link/back-forward и accessibility tests.

После этого этапа исходная пользовательская проблема уже решена: старые чаты видны после обновления страницы.

### Этап 4. Agent: deletion engine

- deletion service, locks, state machine и reconciler;
- Redis `adelete_thread`, SessionBus purge;
- consumer fence/tombstone;
- hard delete cascade;
- telemetry adapter/retention hook;
- real PostgreSQL + Redis + Rabbit race tests.

### Этап 5. site backend/BFF/frontend: удаление

- DELETE/status proxy;
- confirmation dialog и per-row busy state;
- `409 processing`, timeout/lost response, reload recovery;
- очистка per-session cookie, EventSource и локальных journals;
- выбор следующего чата после удаления;
- privacy-page и operational metrics.

### Этап 6. Automatic retention и anonymous parity

- retention worker использует тот же purge service;
- alert на старую pending deletion;
- stable anonymous principal, catalog и login claim;
- удаление истёкших anonymous chats/cookies;
- backup deletion ledger verification.

Каждый этап оформляется отдельным Agent commit и отдельным site commit. Agent разворачивается первым, потому что новые site endpoints должны видеть уже доступный обратно совместимый контракт.

### Карта основных файлов

Agent Service:

- изменить `app/db/models/chat_session.py`, `app/repositories/chat_session.py`, `app/services/chat_session_lifecycle.py`, `app/services/chat_persistence.py`, `app/services/chat_history.py`;
- добавить `app/db/models/chat_session_deletion.py`, `app/services/chat_session_catalog.py`, `app/services/chat_session_deletion.py`;
- изменить/добавить endpoints и schemas в `app/api/v1/endpoints/` и `app/schemas/`;
- изменить `app/messaging/consumer.py`, `app/streaming/session_bus.py`, `app/dependencies/services.py`, `app/core/settings.py`, `app/main.py`;
- добавить Alembic revision и отдельные unit/API/real integration tests.

site backend:

- изменить `backend/src/api/vera.py`, `backend/src/services/vera_agent.py`, `backend/src/services/vera_session_access.py`, `backend/src/schemas/vera.py`;
- добавить contract tests списка, pagination, deletion/status и owner isolation.

frontend/BFF:

- изменить `frontend/src/app/assistant/chat/page.tsx`, `frontend/src/components/features/vera/ChatWindow.tsx`, `frontend/src/hooks/useVeraChat.ts`;
- изменить `frontend/src/lib/api/vera.ts`, `frontend/src/lib/schemas/vera.ts`, `frontend/src/components/ui/Button.tsx`;
- добавить перечисленные выше workspace/sidebar/drawer/list/dialog/hooks/dynamic route и BFF routes;
- обновить `frontend/src/app/privacy/page.tsx` и все Vera schema/API/hook/component tests.

Deployment/docs:

- обновить Agent `.env.example`, `docker-compose.yml` только для передачи новых non-secret settings, production checklist и privacy documentation;
- nginx не меняется, если текущий backend proxy уже пропускает новые site routes.

## 13. Тестовая матрица

### Agent unit/API

- owner isolation списка и удаления;
- стабильный keyset cursor, одинаковые timestamps, limit 1/30/50;
- list не вызывает Redis и не refresh-ит activity;
- title создаётся один раз, безопасно нормализуется и обрезается без повреждения Unicode;
- закрытый чат читается, но не принимает turn;
- DELETE: success, retry, lost response, missing/foreign, processing `409`;
- deleting/tombstoned session нельзя resolve/create/start;
- Redis failure оставляет resumable pending deletion.

### Real PostgreSQL/Redis/RabbitMQ

- создание A → создание B → обе строки открыты и доступны после нового DB session;
- полный FK cascade: `ChatSession`, `ChatTurn`, `MessageFeedback`, `SessionFeedback`;
- checkpoint существует → delete → `aget_tuple()` возвращает `None`, writes отсутствуют;
- два concurrent DELETE сходятся в один результат;
- create-vs-delete и start-vs-delete сериализованы;
- queued message после deletion получает ACK, не запускает graph, не создаёт session и не попадает в DLQ;
- Alembic upgrade с предыдущего head проверяет columns/index/backfill/tombstone.

### site backend/BFF

- auth/owner headers и cookies;
- cursor URL encoding;
- CSRF/origin и rate limit для DELETE;
- timeout и сохранение `202/204/403/404/409/502/503/504`;
- malformed или mismatched Agent response не проходит;
- никакого cache для списка/истории;
- смена user A → user B не возвращает A sessions.

### Frontend component/hook

- A → «Новый чат» B → A остаётся открытым в списке и создание B не вызывает close A;
- reload `/assistant/chat/A` загружает A с сервера;
- открытый A можно продолжить, closed A не показывает textarea;
- создание/удаление инвалидирует список без дублей;
- list pagination и stale response не смешивают владельцев;
- delete cancel/confirm/error/processing;
- удаление выбранного чата выбирает соседний или empty state;
- SSE/history позднего чата не мутирует новый;
- drawer: focus trap, Escape, restore focus;
- keyboard-only, screen-reader labels, 200% zoom, mobile 320 px;
- существующие VERA-005/029 lifecycle/recovery regressions остаются зелёными.

### E2E

После добавления Playwright:

1. создать A, отправить сообщение;
2. создать B;
3. открыть A, reload, продолжить A и убедиться, что сообщения не попали в B;
4. закрыть/экспирировать A и проверить read-only notice плюс «Продолжить в новом чате»;
5. удалить A, reload, убедиться, что A не возвращается;
6. проверить DB/Redis cleanup тестовым API/fixture;
7. user B не видит A;
8. anonymous → login claim показывает текущий чат в каталоге;
9. мобильный drawer и browser Back/Forward.

## 14. Наблюдаемость и эксплуатация

Добавить метрики без содержимого сообщений:

- `vera_chat_catalog_requests_total`;
- `vera_chat_create_total`;
- `vera_chat_delete_requested_total`;
- `vera_chat_delete_completed_total`;
- `vera_chat_delete_failed_total`;
- `vera_chat_delete_pending_age_seconds`;
- `vera_chat_delete_processing_conflict_total`.

Алерты:

- pending deletion старше SLA;
- рост deletion failures;
- consumer получил сообщение для tombstoned session;
- Redis cleanup оставил keys;
- retention worker не запускался ожидаемый интервал.

В логах допустимы request/operation ID и хеш session ID, но не title, вопрос, ответ, owner proof или email.

## 15. Критерии готовности

Функция считается готовой, когда одновременно выполнено следующее:

1. После создания нового чата старый виден после reload, открывается по прямой ссылке и остаётся продолжаемым, пока жив его контекст.
2. Список приходит с сервера, а не восстанавливается из `sessionStorage` или cookies.
3. Создание нового чата, lifecycle-закрытие и TTL-rollover сохраняют доказанную идемпотентность при timeout/reload.
4. Старый контекст не подмешивается в новый и не выдаётся за память модели.
5. Закрытие не удаляет данные; удаление не называется закрытием.
6. Удалённый чат исчезает из list/history/send сразу после deletion fence.
7. После завершения purge отсутствуют строки PostgreSQL, Redis checkpoints/writes и feedback; telemetry/backup соответствуют опубликованному SLA.
8. Поздняя RabbitMQ-доставка не воскрешает чат.
9. Чужой чат нельзя увидеть, открыть, удалить или проверить на существование.
10. Смена аккаунта и поздние callbacks не раскрывают историю предыдущего владельца.
11. UI проходит keyboard/screen-reader/mobile проверки и WCAG 2.2 AA.
12. Полные Agent, backend и frontend suites зелёные; есть real PostgreSQL/Redis/Rabbit integration coverage.

## 16. Не входит в v1

- переименование чатов;
- поиск по истории;
- папки, закрепление и сортировка вручную;
- массовое удаление;
- восстановление удалённого чата;
- экспорт истории;
- force-cancel выполняющегося LLM/tool-запроса;
- восстановление Redis-контекста из PostgreSQL;
- полноценный anonymous-каталог без stable anonymous principal.

## 17. Решения, которые нужно подтвердить до начала кода

1. История auth-чатов хранится 180 дней или другой срок?
2. Достаточен ли auth-only каталог в первой версии?
3. Как Phoenix удаляет trace по `session_id`, либо какой у него утверждён retention?
4. Какой срок хранения RabbitMQ DLQ и backup гарантирует deletion SLA?
5. Переходим ли сразу с email owner на стабильный user UUID?
6. Нужен ли публичный `202 + operation status`, или production purge гарантированно укладывается в синхронный timeout?

Без ответов на пункты о telemetry, DLQ и backup интерфейс можно реализовать, но действие нельзя честно называть полным удалением данных.
