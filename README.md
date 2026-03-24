# Работа для всех

Платформа по подбору вакансий для людей с инвалидностью. Агрегирует предложения с hh.ru и trudvsem.ru, предоставляет персонализированный поиск и AI-ассистента.

## Стек

| Слой | Технологии |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TypeScript |
| Backend | FastAPI, Hypercorn, SQLAlchemy 2.0 (async), Alembic |
| База данных | PostgreSQL 16 |
| Аутентификация | JWT (RS256), email OTP |
| Инфраструктура | Docker Compose, Nginx |

## Архитектура

```
Браузер
  └── Nginx (порт 80)
        └── Next.js (порт 3000, внутренний)
              └── API proxy (/api/auth/*, /api/v1/*)
                    └── FastAPI (порт 8000, внутренний)
                          └── PostgreSQL (порт 5432, внутренний)

Nginx (порт 91) → FastAPI (порт 8000, внутренний)
```

## Быстрый старт

### Требования

- Docker
- Docker Compose

### Запуск

1. Клонируй репозиторий:

```bash
git clone <repo-url>
cd site_work_for_everyone
```

2. Создай файлы с переменными окружения:

```bash
cp frontend/.env.example frontend/.env.local
# backend/.env создать вручную по образцу ниже
```

3. Заполни переменные (см. раздел [Конфигурация](#конфигурация))

4. Запусти:

```bash
docker compose up --build
```

- Фронтенд: [http://localhost](http://localhost)
- Backend API: [http://localhost:91](http://localhost:91)
- Admin панель: [http://localhost:91/admin](http://localhost:91/admin)

## Конфигурация

### Backend — `backend/.env`

```env
# База данных
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_NAME=postgres

# API ключ для hh.ru
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

# URL бекенда аутентификации
# Локально: http://127.0.0.1:8000
# Docker:   http://backend:8000
AUTH_API_URL=http://backend:8000
```

## Структура проекта

```
site_work_for_everyone/
├── backend/              # FastAPI приложение
│   ├── src/
│   │   ├── api/          # Роуты (auth)
│   │   ├── core/         # Конфигурация, rate limiter
│   │   ├── db/           # Модели, сессии, миграции
│   │   ├── repositories/ # Слой доступа к данным
│   │   ├── services/     # Бизнес-логика
│   │   ├── schemas/      # Pydantic схемы
│   │   └── utils/        # JWT, email OTP
│   ├── nginx/
│   │   └── default.conf  # Конфиг nginx для бекенда
│   ├── Dockerfile
│   ├── entrypoint.sh     # Миграции + запуск сервера
│   └── requirements.txt
├── frontend/             # Next.js приложение
│   ├── src/
│   │   ├── app/          # App Router (страницы, API proxy)
│   │   ├── components/   # UI компоненты
│   │   ├── lib/          # API клиент, утилиты
│   │   ├── stores/       # Zustand стейт
│   │   └── hooks/        # React хуки
│   └── Dockerfile
├── nginx/
│   └── nginx.conf        # Конфиг nginx для фронтенда
├── docker-compose.yml
└── README.md
```

## Функциональность

- Поиск вакансий по региону, ключевым словам и категориям инвалидности
- AI-ассистент для подбора вакансий
- Регистрация и аутентификация с подтверждением email
- Избранные вакансии
- Блог
- Форма обратной связи
- Адаптивный тёмный интерфейс, WCAG 2.2 AA

## Деплой

При деплое на сервер:

1. Скопируй `backend/.env` и `frontend/.env.local` на сервер
2. Запуск идентичен локальному: `docker compose up -d --build`
3. SSL-сертификаты подключаются через Nginx после регистрации домена
