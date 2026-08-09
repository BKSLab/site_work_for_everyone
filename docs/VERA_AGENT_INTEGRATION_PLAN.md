# План интеграции site_work_for_everyone с агентом «Вера»

> Статус: план. Дата: 2026-07-10.

## Содержание

1. [Контекст](#контекст)
2. [Архитектурные решения](#архитектурные-решения)
3. [Backend — новые/изменённые файлы](#backend-site_work_for_everyonebackend--новыеизменённые-файлы)
4. [Frontend — новые файлы](#frontend-site_work_for_everyonefrontend--новые-файлы)
5. [Инфраструктура (nginx + docker-compose)](#инфраструктура-nginx--docker-compose)
6. [Обработка деградации](#обработка-деградации)
7. [Порядок реализации и проверка](#порядок-реализации-и-проверка)
8. [Не в скоупе](#не-в-скоупе)

---

## Контекст

Три сервиса стека «Вера» (`vera_agent_service`, `vera_mcp_service`, `vera_rag_service`) реализованы на уровне итерации 1 (единственный тул `kb_search`, консультация по правам без авторизации) и проверены собственными тестами — но полностью изолированы от основного сайта `site_work_for_everyone`. Сейчас на сайте нет ни очереди сообщений, ни SSE-прокси, ни чат-интерфейса — есть только существующий wizard (`/assistant`, сопроводительные письма/резюме), который должен остаться нетронутым.

Цель плана — соединить сайт с уже готовым стеком: пользователь пишет вопрос в новом чат-интерфейсе → сообщение публикуется в очередь `agent.requests` → агент обрабатывает и стримит ответ через SSE обратно в браузер. Адресация между всеми сервисами — через host:port в `.env`, без общей docker-сети (осознанный выбор: сервис переезжает на другой хост сменой одной переменной, а не топологией docker-сети).

Подтверждённые контракты (из кода, не только доков):

- Очередь `agent.requests`, payload `{"session_id": str, "request_id": str, "user_id": str | None, "message": str}` (`vera_agent_service/app/messaging/schemas.py`), максимум 4000 символов, **без истории** (`session_id` — история в Redis, `request_id` — доставка ответа одного сообщения).
- Очередь объявлена consumer'ом с `durable=True` и `arguments={'x-dead-letter-exchange': ...}` (`vera_agent_service/app/messaging/consumer.py:104-111`) — второй declare с другими аргументами уронит канал.
- `GET /sse/{request_id}` (`vera_agent_service/app/streaming/sse.py`): события `token`/`done`/`error` конкретного сообщения, поток завершается сам; буфер позднего подключения 60с (`session_bus.py`).
- Порты dev: RabbitMQ `5672`/`15672`, Redis `6379`, Agent Service `8010→8000`.

---

## Архитектурные решения

| Вопрос | Решение | Почему |
|---|---|---|
| RabbitMQ publisher | В `backend` (FastAPI), не в Next.js | Backend — долгоживущий процесс, может держать persistent `aio_pika.connect_robust`; Next.js route handlers короткоживущие, открывать AMQP-коннект на каждый запрос — лишняя латентность |
| `user_id` | Верифицированный JWT на `backend` (новая optional-auth зависимость), не декодирование в Node | `decodeJwtPayload` в Next.js не проверяет подпись; между Next.js и backend нет проверки внутреннего ключа — доверять непроверенному `user_id` от клиента небезопасно (влияет на доступные тулы в итерации 2) |
| Доставка SSE | nginx проксирует `/vera/sse/{request_id}` напрямую на agent_service, минуя Next.js/backend | В репозитории уже есть паттерн per-location таймаутов в nginx; лишний хоп через Node держал бы процесс подключённым на всё время генерации |
| Публикация сообщения | Браузер → Next.js `/api/vera/chat` → backend `/api/vera/chat` → RabbitMQ | Next.js-прокси уже верифицирует Origin/rate-limit/cookie — переиспользуем как есть |
| Новый UI | `frontend/src/app/assistant/chat/page.tsx`, отдельно от wizard'а | Wizard (`/assistant`, `/assistant/start`) — другая фича, не трогаем |
| `session_id` | Генерируется в браузере (`crypto.randomUUID()`), `sessionStorage`, TTL 24ч (совпадает с Redis checkpointer) | Закрытие вкладки = конец разговора, согласуется с отсутствием персистентности истории в UI |
| Адресация до agent_service | host:port через env var, nginx-шаблон с `envsubst` | Требование пользователя — без общей docker-сети |

---

## Backend (site_work_for_everyone/backend) — новые/изменённые файлы

Стиль RabbitMQ-интеграции — по паттерну `bx_client_service_manager/src/infrastructure/broker/` (тот же приём, что уже используется в других проектах), но в минимальном варианте: без пула каналов и без RPC/`reply_to` (не нужны — Vera отвечает через SSE, не через ответное сообщение в очереди), и без полноценного `declare_queue` (очередь `agent.requests` уже объявлена и принадлежит `vera_agent_service` со своим `x-dead-letter-exchange` — второй declare с другими аргументами уронит канал, поэтому только `passive=True`).

- `backend/src/core/settings.py` — добавить `VeraSettings(SettingsBase)`: **один** `rabbitmq_url: str` (полный AMQP URL, `amqp://user:pass@host:port/vhost` — по образцу `RABBITMQ_URL` в `bx_client_service_manager/.env`, не раздельные host/port/user/password) + `rabbitmq_queue: str`, включить в `Settings` (по образцу `DBSettings`/`EmailSettings`).
- `backend/requirements.txt` — добавить `aio-pika==9.6.2` (та же версия, что в `vera_agent_service` и `bx_client_service_manager`).
- `backend/.env` / `.env.example` — `RABBITMQ_URL`, `RABBITMQ_QUEUE=agent.requests`.
- `backend/src/dependencies/jwt.py` — добавить `get_optional_user_payload`/`OptionalUserPayloadDep`: как `get_current_user_payload`, но `credentials is None` или невалидный/просроченный/заблокированный токен → `None`, не `HTTPException`.
- `backend/src/schemas/vera.py` (новый) — `VeraChatRequestSchema`: `session_id` и `request_id` (1–100 симв.), `message` (1–4000 симв., синхронно с лимитом agent_service).
- `backend/src/services/vera_publisher.py` (новый) — по образцу `queue_publisher.py`/`manager.py` из `bx_client_service_manager`, но упрощённо: один `aio_pika.connect_robust(rabbitmq_url)` + один канал (без пула), метод `publish_agent_request(session_id, request_id, user_id, message)` — сериализует в JSON, `channel.default_exchange.publish(..., delivery_mode=PERSISTENT)`, `routing_key=queue_name`. Перед первой публикацией — `channel.declare_queue(queue_name, passive=True)`, только проверка существования; если очереди нет (agent_service ещё не разворачивался) — исключение ловится, сервис переходит в деградированный режим (см. ниже), не роняя весь backend.
- `backend/src/dependencies/vera.py` (или добавить в `services.py`) — `VeraPublisherServiceDep`, читает готовый инстанс из `app.state.vera_publisher` (создан в lifespan), не создаёт новый коннект на каждый запрос.
- `backend/src/api/vera.py` (новый) — `POST /vera/chat` (итоговый путь `/api/vera/chat` через `include_router(prefix='/api')`, по образцу `auth.py`): `@limiter.limit("20/minute")` (переиспользовать `backend/src/core/limiter.py`), `user_id = payload.get("sub") if payload else None`, если publisher недоступен → `503`, иначе публикует и возвращает `202 {"status": "queued"}`.
- `backend/main.py` — в `lifespan`: `aio_pika.connect_robust(settings.vera.rabbitmq_url, client_properties={"connection_name": "wfe-backend"})` (именованное соединение — видно в RabbitMQ management UI, как в `bx_client_service_manager`) → `app.state.vera_publisher` (или `None` при ошибке подключения, без падения всего приложения), закрытие на shutdown; `app.include_router(vera_router, prefix='/api')`.

---

## Frontend (site_work_for_everyone/frontend) — новые файлы

- `frontend/src/lib/schemas/vera.ts` (новый) — Zod-схема `veraChatSchema` (`session_id`, `message` ≤4000).
- `frontend/src/app/api/vera/chat/route.ts` (новый, отдельный от `/api/v1/[...path]` и `/api/auth/[...path]`) — по образцу `frontend/src/app/api/auth/[...path]/route.ts`: `validateOrigin` (`lib/utils/csrf.ts`), новый `createRateLimiter({interval: 60_000, limit: 20})` (`lib/utils/rate-limit.ts`), пробрасывает `access_token` cookie как `Authorization: Bearer` на `${AUTH_API_URL}/api/vera/chat` (переиспользуется существующая `AUTH_API_URL`, указывающая на `backend` этого репозитория — не `API_URL`, который для внешнего API вакансий), короткий таймаут (~15s), `getRequestId`/`logger` как есть.
- `frontend/src/hooks/useVeraChat.ts` (новый) — генерация/чтение `session_id` из `sessionStorage` (TTL 24ч), открытие `EventSource('/vera/sse/' + sessionId)` **до** отправки POST, накопление токенов, обязательный `eventSource.close()` по `done`/`error` (иначе браузер молча переподключится к уже закрытой на сервере сессии), таймаут ~90-120с без единого события → сообщение о недоступности + закрытие.
- `frontend/src/components/features/vera/ChatWindow.tsx`, `ChatMessage.tsx` (новые) — переиспользовать `frontend/src/components/ui/Button.tsx`, `Spinner.tsx`, `ErrorMessage.tsx`, `ServiceError.tsx` (уже существуют, подтверждено).
- `frontend/src/app/assistant/chat/page.tsx` (новый) — использует `useVeraChat`, `useAuthStore` (как уже делает `assistant/page.tsx`) для персонализации приветствия.

---

## Инфраструктура (nginx + docker-compose)

- Переименовать `nginx/nginx.conf` → `nginx/templates/default.conf.template` (встроенный механизм образа `nginx:alpine` — автоматический `envsubst` для файлов в `/etc/nginx/templates/`).
- В `docker-compose.yml` (корень): заменить volume-маппинг на `./nginx/templates/default.conf.template:/etc/nginx/templates/default.conf.template:ro`; добавить `environment: - AGENT_SSE_UPSTREAM=${AGENT_SSE_UPSTREAM}` сервису `nginx_frontend`.
- Новый корневой `.env`/`.env.example` (сейчас отсутствует) — `AGENT_SSE_UPSTREAM=host:port` (прод — реальный адрес agent_service; локально — `host.docker.internal:8010`).
- Добавить в шаблон новый location:

  ```nginx
  location /vera/sse/ {
      proxy_pass http://${AGENT_SSE_UPSTREAM}/sse/;
      proxy_http_version 1.1;
      proxy_set_header Connection '';
      proxy_buffering off;
      proxy_cache off;
      chunked_transfer_encoding off;
      proxy_read_timeout 3600s;
  }
  ```

---

## Обработка деградации

- RabbitMQ недоступен при старте backend / declare не нашёл очередь → `app.state.vera_publisher = None` → `POST /api/vera/chat` возвращает `503` до попытки публикации, остальной backend (auth и т.д.) работает независимо.
- agent_service падает уже после публикации сообщения — с точки зрения сайта неотличимо от «долго думает»; клиентский таймер в `useVeraChat.ts` (90-120с без единого SSE-события) показывает «Вера временно недоступна» и закрывает `EventSource`.
- Деградацию MCP/RAG внутри агента отдельно не обрабатываем — это уже сделано в `vera_agent_service` (честный ответ «поиск недоступен»).

---

## Порядок реализации и проверка

1. **Backend: настройки/зависимости** — `VeraSettings`, `aio-pika` в requirements, `get_optional_user_payload`.
   Проверка: `get_settings().vera` печатается без исключений после заполнения `.env`.

2. **Backend: publisher + роутер** — `vera_publisher.py`, `schemas/vera.py`, `api/vera.py`, lifespan в `main.py`.
   Проверка: поднять `vera_agent_service` (`docker compose up -d --build` в его репо — реальные RabbitMQ/Redis/agent на хосте), `curl -X POST http://localhost:91/api/vera/chat -d '{"session_id":"test-1","message":"привет"}'` → `202`; сообщение видно в RabbitMQ management UI (`:15672`); `curl --no-buffer http://localhost:8010/sse/test-1` отдаёт `token`/`done`.

3. **Frontend: Next.js route** — `api/vera/chat/route.ts`, `lib/schemas/vera.ts`.
   Проверка: `curl` с `Origin` заголовком → `202`; без/с чужим `Origin` → `403`; >20 запросов/мин → `429`.

4. **Frontend: UI чата** — `useVeraChat.ts`, компоненты, страница `/assistant/chat`.
   Проверка в браузере: сообщение отправляется, токены приходят потоково, после `done` `EventSource` закрыт (DevTools → Network).

5. **nginx: шаблонизация + location** — `templates/default.conf.template`, `docker-compose.yml`, корневой `.env`.
   Проверка: `docker exec frontend_nginx cat /etc/nginx/conf.d/default.conf` — `${AGENT_SSE_UPSTREAM}` подставлен реальным значением; `curl -N` на `/vera/sse/test-1` держит соединение и отдаёт события так же, как прямой curl к `:8010`.

6. **End-to-end** — полный стек (сайт + все три Vera-сервиса) через nginx: анонимный запрос (`user_id=None` — временно залогировать в `vera.py` для проверки), затем авторизованный (`user_id=<email>`).

7. **Регрессия wizard'а** — `/assistant`, `/assistant/start`, `/api/v1/*` продолжают работать без изменений (файлы не тронуты).

---

## Не в скоупе

- Тулы итерации 2 (`get_user_favorites`, `search_vacancies`, `find_similar_vacancies`).
- Внутренние блокеры `vera_rag_service`/`vera_mcp_service` (провижининг БД, LLM-креды) — ответственность тех репозиториев.
- Визуальный дизайн чат-интерфейса (только структура интеграции).
