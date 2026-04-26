# Работа для всех

Платформа поиска работы для людей с инвалидностью. Агрегирует вакансии с hh.ru и trudvsem.ru, предоставляет персонализированный поиск и ИИ-ассистента Веру — личного карьерного помощника, который пишет сопроводительные письма и даёт рекомендации по резюме под конкретную вакансию.

## Возможности

- **Поиск вакансий** — агрегация с hh.ru и trudvsem.ru, фильтрация по региону, ключевым словам и категории инвалидности
- **ИИ-ассистент Вера** — генерация сопроводительных писем и рекомендаций по резюме в двух режимах:
  - *Базовый* — результат на основе данных вакансии, без лишних вопросов
  - *Индивидуальный* — Вера задаёт персональную анкету и создаёт по-настоящему личный текст
- **Избранные вакансии** — сохранение и управление подборкой
- **Блог** — статьи в Markdown с тегами, фильтрацией и пагинацией
- **Регистрация и авторизация** — JWT RS256, подтверждение email через OTP-код
- **Форма обратной связи** — с уведомлением на email
- **Адаптивный тёмный интерфейс** — WCAG 2.2 AA, поддержка скринридеров

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
  └── Nginx (порт 80)
        └── Next.js (порт 3000)
              └── API proxy (/api/auth/*, /api/v1/*)
                    └── FastAPI (порт 8000)
                          └── PostgreSQL (порт 5432)

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

cp frontend/.env.example frontend/.env.local
# backend/.env создать вручную (см. раздел Конфигурация)

docker compose up --build
```

| Сервис | URL |
|---|---|
| Фронтенд | http://localhost |
| Backend API | http://localhost:91 |
| Admin панель | http://localhost:91/admin |

### Локальная разработка (без Docker)

```bash
# Frontend
cd frontend
npm install
npm run dev        # http://localhost:3000

# Backend
cd backend
pip install -r requirements.txt
hypercorn src.main:app --reload
```

## Конфигурация

### Backend — `backend/.env`

```env
# База данных
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_HOST=db
POSTGRES_PORT=5432
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
ACCESS_TOKEN_EXPIRE_MINUTES=30

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
│   │   ├── api/              # Роуты (auth, assistant, feedback)
│   │   ├── core/             # Конфигурация, rate limiter
│   │   ├── db/               # Модели, сессии, миграции
│   │   ├── repositories/     # Слой доступа к данным
│   │   ├── services/         # Бизнес-логика, LLM-интеграция
│   │   ├── schemas/          # Pydantic схемы
│   │   └── utils/            # JWT, email OTP
│   ├── nginx/
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
│   └── nginx.conf
├── docker-compose.yml
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

1. Скопируй `backend/.env` и `frontend/.env.local` на сервер
2. `docker compose up -d --build`
3. SSL-сертификаты подключаются через Nginx после регистрации домена

## Автор

Кирилл Барабанщиков — [GitHub](https://github.com/BKSLab) · [ВКонтакте](https://vk.com/id30907580) · [Дзен](https://dzen.ru/bks_daily)
