# Чек-лист: деплой стека «Вера» на прод + подключение сайта

> Контекст: `docs/VERA_AGENT_INTEGRATION_PLAN.md` (интеграция сайта уже реализована — backend/frontend/nginx). Этот чек-лист — про то, что нужно поднять на реальном сервере, чтобы интеграция заработала не только локально.

Пять компонентов, каждый — свой репозиторий, деплоятся независимо через собственный `docker compose up -d --build`:

- Redis (Redis Stack) — внутри `vera_agent_service/docker-compose.yml`
- RabbitMQ — внутри `vera_agent_service/docker-compose.yml`
- `vera_agent_service` (Agent Service)
- `vera_mcp_service` (MCP Tools Server)
- `vera_rag_service` (RAG Service + Qdrant + Postgres)

Порядок деплоя важен: RAG → MCP → Agent (каждый следующий зависит от адреса предыдущего).

---

## 1. Сервер и сеть

- [ ] Выбран/подготовлен сервер (тот же, где сайт, или отдельный — адресация везде через IP:port, разницы нет)
- [ ] Docker + Docker Compose установлены
- [ ] **Firewall**: порты RabbitMQ (`5672`, `15672`), Redis (`6379`), MCP (`9000`), Agent Service (`8010`), Phoenix (`6006`) открыты **только** на доверенные IP (свой/офисный, или через VPN) — не публично. Ни один из трёх README не претендует на прод-уровень защиты этих портов (дефолтные пароли, нет TLS перед MCP/Agent)
- [ ] Публично наружу (через nginx сайта) нужен только один путь: `/vera/sse/*` → Agent Service `8010` — остальные порты наружу не нужны вообще

## 2. `vera_rag_service` — деплоится первым

- [ ] `cp .env.example .env`, заполнить: `POSTGRES_PASSWORD`, `SECRET_KEY`, `ADMIN_LOGIN`/`ADMIN_PASSWORD`, `API_KEY` (реальные значения, не плейсхолдеры)
- [ ] `YANDEX_LLM_MODEL` — конкретная версионированная модель, не `/rc`-канал (см. README, чеклист прод)
- [ ] Известный блокер: провижининг БД (`InvalidCatalogNameError: database "vera_rag_service" does not exist`) — почитать `RAG_SERVICE_PLAN.md` раздел 7, воспроизвести и починить до этого пункта, иначе `alembic upgrade head` не пройдёт
- [ ] `docker compose up -d --build`
- [ ] Проверка: `curl http://<host>:8000/api/v1/health` → `{"status":"ok","database":"ok"}`
- [ ] Настроить периодические снапшоты Qdrant (см. README, чеклист прод) — без этого потеря контейнера = потеря всего проиндексированного корпуса
- [ ] Загрузка реального корпуса документов (ТК РФ, ФЗ-181, авторские статьи) через `/admin` — отдельная задача Expert'а, не блокирует остальной деплой, но без неё `kb_search` не найдёт ответов

## 3. `vera_mcp_service` — деплоится вторым

- [ ] `cp .env.example .env`, заполнить `RAG_SERVICE_URL=http://<host_rag>:8000`, `RAG_SERVICE_API_KEY` (совпадает с `API_KEY` из шага 2)
- [ ] `docker compose up -d --build`
- [ ] Проверка: `curl http://<host>:9000/health` → `{"status":"ok","rag_service":"ok"}` (если `"unreachable"` — проверить `RAG_SERVICE_URL`/`API_KEY`)

## 4. `vera_agent_service` (+ Redis, RabbitMQ) — деплоится третьим

- [ ] `cp .env.example .env`, заполнить:
  - `RABBITMQ_USER`/`RABBITMQ_PASSWORD` — **сменить с дефолтных** `guest`/`changeme`
  - `LLM_API_KEY`/`LLM_API_URL`/`LLM_MODEL` — реальный провайдер, не плейсхолдер
  - `MCP_SERVER_URL=http://<host_mcp>:9000/mcp`
- [ ] `docker compose up -d --build` (поднимает `rabbitmq`, `redis`, `phoenix`, `agent_service` одним файлом)
- [ ] Проверка: `curl http://<host>:8010/health` → `rabbitmq`/`redis` — `ok`, `mcp` — информационное поле
- [ ] RabbitMQ management UI (`http://<host>:15672`) доступен только с доверенного IP — сверить с firewall из п.1

## 5. Подключение сайта (`site_work_for_everyone`)

- [ ] `backend/.env`: `RABBITMQ_URL=amqp://<user>:<пароль>@<host_agent>:5672/` (реальные креды из шага 4, не дефолтные)
- [ ] Корневой `.env`: `AGENT_SSE_UPSTREAM=<host_agent>:8010`
- [ ] Если backend сайта запущен в своём docker-контейнере (не venv) — проверить, что `<host_agent>` резолвится из контейнера (реальный IP/домен, не `localhost` — см. комментарий в `backend/.env` про этот нюанс)
- [ ] Передеплоить `nginx_frontend` (шаблон уже готов, `docker compose up -d --build nginx_frontend`) — проверить `docker exec frontend_nginx cat /etc/nginx/conf.d/default.conf`, что `${AGENT_SSE_UPSTREAM}` подставился реальным значением

## 6. Сквозная проверка (раздел 6 плана интеграции)

- [ ] `curl -X POST https://work-for-everyone.ru/api/vera/chat -H "Content-Type: application/json" -d '{"session_id":"prod-test-1","message":"привет"}'` → `202`
- [ ] `curl -N https://work-for-everyone.ru/vera/sse/prod-test-1` → приходят `token`/`done` события (даже если `kb_search` ещё недоступен — агент честно ответит текстом об этом, это ожидаемо до заполнения базы знаний)
- [ ] То же самое через реальный браузер на `/assistant/chat`, `/assistant`, `/`, `/vacancies` — везде, где добавлены баннеры/точки входа
- [ ] Анонимный запрос (`user_id: null`) и авторизованный (`user_id: <email>`) — оба проходят

## 7. Известные блокеры (не в скоупе интеграции с сайтом, отдельные задачи)

- [ ] Провижининг БД `vera_rag_service` (П.2) — без этого `kb_search` не даст содержательных ответов
- [ ] Реальный корпус документов от Expert — без него база знаний пуста даже при рабочей БД
- [ ] Реальные LLM-креды в `vera_agent_service` — без них агент не сможет генерировать ответы вообще
