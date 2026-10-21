# Работа для всех

Платформа поиска работы для людей с инвалидностью. Агрегирует вакансии с hh.ru и trudvsem.ru, предоставляет персонализированный поиск и ИИ-ассистента Веру — личного карьерного помощника, который пишет сопроводительные письма и даёт рекомендации по резюме под конкретную вакансию.

## Возможности

- **Поиск вакансий** — агрегация с hh.ru и trudvsem.ru, фильтрация по региону, ключевым словам и категории инвалидности
- **ИИ-ассистент Вера** — генерация сопроводительных писем и рекомендаций по резюме в двух режимах:
  - *Базовый* — результат на основе данных вакансии, без лишних вопросов
  - *Индивидуальный* — Вера задаёт персональную анкету и создаёт по-настоящему личный текст
- **Чат с Верой** — консультации по трудовым вопросам с потоковыми ответами
- **Избранные вакансии** — сохранение и управление подборкой
- **Блог** — статьи в Markdown с тегами, фильтрацией и пагинацией
- **Регистрация и авторизация** — JWT RS256, подтверждение email через OTP-код
- **Форма обратной связи** — с уведомлением на email
- **Адаптивный тёмный интерфейс** — клавиатурная навигация, доступные формы и управление фокусом

## Документация

- [PROJECT_MEMORY.md](PROJECT_MEMORY.md) — актуальные решения, контракты и ограничения, проверенные по коду.
- [AGENTS.md](AGENTS.md) — правила работы с проектом и команды проверок.
- [docs/BLOG_CHEATSHEET.md](docs/BLOG_CHEATSHEET.md) — подготовка публикаций.

В `docs/` также сохранён печатный пакет проектных материалов Веры; [указатель](PROJECT_MEMORY.md#материалы-в-docs) находится в памяти проекта. Эти документы описывают планы и требования, а не текущие API и результаты приёмки.

Версии зависимостей уточняются в `frontend/package.json` и `backend/requirements.txt`. Примеры настройки окружения: `.env.example`, `frontend/.env.example`, `backend/.env.example`.

## Стек

| Слой | Технологии |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TypeScript 5 |
| Состояние | Zustand 5, TanStack Query 5 |
| Backend | FastAPI 0.129, Hypercorn, SQLAlchemy 2.0 (async), Alembic |
| База данных | PostgreSQL 16 |
| Аутентификация | JWT (RS256), email OTP |
| Мониторинг | Sentry |
| Инфраструктура | Docker Compose, Nginx |

## Архитектура

```
Браузер
  └── Nginx (80 → HTTPS, 443)
        ├── /vera/sse/{request_id} → внешний Agent Service
        └── Next.js (порт 3000)
              └── API proxy (/api/auth/*, /api/v1/*, /api/vera/*)
                    ├── внешний API вакансий
                    └── FastAPI сайта (порт 8000)
                          ├── PostgreSQL (порт 5432 внутри сети)
                          └── внешний RabbitMQ → Agent Service

Nginx (порт 91) → FastAPI (прямой доступ к API)
```

## Быстрый старт

### Требования

- Docker
- Docker Compose

### Запуск

```bash
git clone <repo-url>
cd site_work_for_everyone

cp .env.example .env
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
# Заполнить адреса и секреты; VERA_SESSION_SIGNING_KEY одинаков у frontend/backend.

docker compose up --build
```

| Сервис | URL |
|---|---|
| Фронтенд | HTTPS на домене из шаблона Nginx; нужны DNS и сертификаты |
| Backend API | http://localhost:91 |
| Admin панель | http://localhost:91/admin |

Compose сайта не поднимает внешний API вакансий, Agent Service и RabbitMQ: их адреса и доступ должны быть настроены отдельно. Nginx ожидает сертификаты в подключённом volume; для первого запуска нужна подготовка TLS. Подробности текущей схемы — в [памяти проекта](PROJECT_MEMORY.md#настройка-и-эксплуатация).

### Локальная разработка (без Docker)

В отдельных терминалах из корня репозитория:

```bash
# Frontend
cd frontend
npm install
npm run dev        # http://localhost:3000
```

```bash
# Backend
cd backend
pip install -r requirements.txt
hypercorn main:app --reload
```

## Конфигурация

### Backend — `backend/.env`

```env
# База данных
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_HOST=db
POSTGRES_NAME=postgres

# Внешний API вакансий
ACCESS_TOKEN_HH=your-hh-token

# Email (SMTP)
FROM_EMAIL=your@email.ru
HOST_NAME=smtp.mail.ru
PORT=465
APPLICATION_KEY=your-smtp-app-key
FEEDBACK_EMAIL=feedback@email.ru

# JWT
BASE_ALGORITM=RS256
JWT_EXPIRE_SECONDS=3600
JWT_REFRESH_EXPIRE_DAYS=30

# Внутренний API ключ
API_WFE_KEY=wfe_your-key-here

# Admin панель
SECRET_KEY=your-secret-key
ADMIN_LOGIN=admin
ADMIN_PASSWORD=your-admin-password
```

### Frontend — `frontend/.env.local`

```env
# URL внешнего API (вакансии, регионы)
API_URL=http://your-api-server:90

# Ключ для доступа к API
API_KEY=wfe_your-api-key-here

# URL бэкенда аутентификации
# Локально: http://127.0.0.1:8000
# Docker:   http://backend:8000
AUTH_API_URL=http://backend:8000
```

## Структура проекта

```
site_work_for_everyone/
├── backend/                  # FastAPI приложение
│   ├── src/
│   │   ├── api/              # Роуты auth и vera
│   │   ├── core/             # Конфигурация, rate limiter
│   │   ├── db/               # Модели, сессии, миграции
│   │   ├── repositories/     # Слой доступа к данным
│   │   ├── services/         # Бизнес-логика, LLM-интеграция
│   │   ├── schemas/          # Pydantic схемы
│   │   └── utils/            # JWT, email OTP
│   ├── nginx/
│   ├── main.py               # Точка входа FastAPI
│   ├── Dockerfile
│   ├── entrypoint.sh
│   └── requirements.txt
├── frontend/                 # Next.js приложение
│   ├── content/
│   │   └── blog/             # Статьи блога (Markdown)
│   ├── src/
│   │   ├── app/              # App Router (страницы, API proxy)
│   │   ├── components/       # UI компоненты
│   │   ├── lib/              # API клиент, утилиты, blog/posts.ts
│   │   ├── stores/           # Zustand (auth)
│   │   ├── hooks/            # React хуки
│   │   └── types/            # TypeScript типы
│   └── Dockerfile
├── nginx/
│   └── templates/default.conf.template
├── docker-compose.yml
├── AGENTS.md
├── PROJECT_MEMORY.md
└── README.md
```

## Блог

Статьи хранятся как Markdown-файлы в `frontend/content/blog/<slug>.md`. Новая статья появляется автоматически — никаких изменений в коде не требуется.

Фронтматтер статьи:

```yaml
---
title: "Заголовок"
excerpt: "Краткое описание для карточки и мета-тегов"
date: "2026-01-01"
tag: "Технологии"
tagColor: "blue"          # yellow | blue | green | purple | red
coverImage: "/blog/slug/cover.jpg"
---
```

Изображения статьи кладутся в `frontend/public/blog/<slug>/`.

## Деплой

1. Настрой корневой `.env`, `backend/.env` и `frontend/.env.local` на сервере, внешние сервисы и сертификаты Nginx
2. `docker compose up -d --build`
3. При изменении Nginx проверь шаблон через `docker compose run --rm --no-deps nginx_frontend nginx -t`; для применения шаблона перезапусти контейнер, а при смене env пересоздай его

## Автор

Кирилл Барабанщиков — [GitHub](https://github.com/BKSLab) · [ВКонтакте](https://vk.com/id30907580) · [Дзен](https://dzen.ru/bks_daily)
