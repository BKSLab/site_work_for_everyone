# Дашборд управления проектом — архитектурный план

> Статус: согласовано, готово к реализации. Дата: 2026-06-18.
> Это план **нового, отдельного проекта** `project_dashboard`. Он не модифицирует код `site_work_for_everyone` — только переиспользует его дизайн-систему и архитектурные конвенции как образец.

---

## Содержание

1. [Зачем это нужно](#1-зачем-это-нужно)
2. [Принятые решения](#2-принятые-решения)
3. [Расположение и структура репозитория](#3-расположение-и-структура-репозитория)
4. [Дизайн-система: что переносим 1:1](#4-дизайн-система-что-переносим-11)
5. [Модель данных](#5-модель-данных)
6. [Backend: структура и API](#6-backend-структура-и-api)
7. [Frontend: структура и экраны](#7-frontend-структура-и-экраны)
8. [WBS ↔ канбан: как это работает на практике](#8-wbs--канбан-как-это-работает-на-практике)
9. [Сидирование начальных данных](#9-сидирование-начальных-данных)
10. [Пошаговый план реализации](#10-пошаговый-план-реализации)
11. [Критерии готовности и проверка](#11-критерии-готовности-и-проверка)
12. [Сознательно не делаем в v1](#12-сознательно-не-делаем-в-v1)

---

## 1. Зачем это нужно

Вся проектная документация по «Агенту Вере» (паспорт проекта, описание, дорожная карта, ИСР, матрица стейкхолдеров, технический план) и рабочая документация платформы (`BUGS.md`, `DESIGN_GUIDE.md`, `ADMIN_STATS_GUIDE.md`, `FRONTEND_AUDIT_REPORT.md` и др.) сейчас существует как статичные файлы в корне репозитория. Из этого вытекают три проблемы:

1. **Документы нельзя редактировать интерактивно** — любое изменение требует открыть файл в IDE, отредактировать markdown/HTML руками, закоммитить.
2. **Нет интерактивного канбана** — ИСР (`AGENT_VERA_WBS.txt`, `AGENT_VERA_WBS.html`) фиксирует задачи и роли, но не отражает текущий статус выполнения, нет возможности подвигать задачу между стадиями, оставить комментарий, проставить срок.
3. **ИСР существует только как текст/HTML-таблица** — нет дерева, по которому можно кликать, сворачивать/разворачивать, видеть % выполнения по фазам.

Решение — отдельный веб-дашборд: просмотр + редактирование документации, канбан-доска задач и дерево ИСР, связанное с канбаном.

---

## 2. Принятые решения

| Вопрос | Решение | Почему |
|---|---|---|
| Где живёт новый проект | Отдельный репозиторий/каталог, не подкаталог `site_work_for_everyone` | Чтобы не мешать продуктовому коду «Работы для всех»; разный жизненный цикл, разный деплой |
| Frontend-фреймворк | **Vite + React SPA**, не Next.js | Внутренний/отчётный инструмент без необходимости в SSR и SEO — Vite даёт более простой и быстрый стек |
| Авторизация | **Не нужна** | Дашборд публичный, используется как открытая отчётность по ходу проекта |
| Связь WBS ↔ канбан | **ИСР — источник задач.** Каждый листовой пункт ИСР (например `1.1.1`) — это и есть карточка канбана (1:1 связь через FK). Промежуточные узлы (`1.1`, фазы) — узлы группировки в дереве с rollup-статусом | Не плодим две независимые системы учёта задач; дерево ИСР становится "живой" визуализацией прогресса |
| Backend | FastAPI + PostgreSQL + Alembic, по конвенциям `backend/` основного проекта | Единый стиль кода у разработчика, меньше когнитивной нагрузки при переключении между проектами |
| Дизайн | Точно тот же визуальный язык, что в `frontend/` (тёмная тема, золотой акцент, токены) | Чтобы инструменты разработчика ощущались как единая экосистема |
| UI-библиотека | **Нет** — своя дизайн-система (CSS-токены + `react-aria-components` + инлайн SVG), не MUI и не shadcn/ui | Любая готовая библиотека визуально конфликтует с уже сложившимся стилем основного проекта, который мы клонируем |
| Управление состоянием | Server state — **TanStack Query** (с optimistic updates), client state (открытые панели, выбранная задача, фильтры) — **Zustand** | Тот же паттерн, что уже используется в `frontend/` (`stores/auth.ts` + TanStack Query); не изобретаем новый подход |
| История изменений задачи | **Да, в v1** — таблица `TaskActivity`, лог смены стадии/срока | Дашборд — это публичная отчётность по ходу проекта; история статусов — часть этой отчётности, не опциональная фича |

---

## 3. Расположение и структура репозитория

```
D:\BKS.Lab\python\my_projects\project_dashboard\        ← новый, отдельный проект (сосед site_work_for_everyone)
├── backend/
│   ├── main.py
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── scripts/
│   │   └── seed_initial_data.py
│   └── src/
│       ├── core/
│       ├── db/
│       ├── repositories/
│       ├── services/
│       ├── schemas/
│       ├── dependencies/
│       └── api/
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── src/
│       ├── app.css
│       ├── lib/
│       ├── components/
│       ├── routes/
│       └── main.tsx
├── docker-compose.yml        # backend + postgres + frontend (опционально, по образцу корневого compose)
└── README.md
```

---

## 4. Дизайн-система: что переносим 1:1

Источник истины: `frontend/src/app/globals.css` и `frontend/src/components/ui/*` текущего проекта, плюс `DESIGN_GUIDE.md`.

### 4.1. CSS-токены (Tailwind v4, `@theme inline`, без `tailwind.config.*`)

```css
@import "tailwindcss";

:root {
  --background: #0A0A0A;
  --foreground: #F0F0F0;
  --accent: #F5B800;
  --accent-hover: #E0A800;
  --accent-foreground: #0A0A0A;
  --surface: #1A1A1A;
  --surface-hover: #252525;
  --border: #2D2D2D;
  --muted: #999999;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-foreground: var(--accent-foreground);
  --color-surface: var(--surface);
  --color-surface-hover: var(--surface-hover);
  --color-border: var(--border);
  --color-muted: var(--muted);
}

body { background: var(--background); color: var(--foreground); }

@keyframes braille-dot {
  0%, 100% { transform: scale(0.35); background-color: var(--border); box-shadow: none; }
  50% {
    transform: scale(1);
    background-color: var(--accent);
    box-shadow: 0 0 8px var(--accent), 0 0 16px color-mix(in srgb, var(--accent) 40%, transparent);
  }
}
```

Этот файл копируется в `frontend/src/app.css` нового проекта **без изменений**.

### 4.2. UI-примитивы — переносятся как есть

Из `frontend/src/components/ui/`: `Button.tsx`, `Modal.tsx` (на `react-aria-components`), `Badge.tsx`, `Spinner.tsx`, `ErrorMessage.tsx`, `EmptyState.tsx`, `Pagination.tsx`, `SkipLink.tsx`, `FocusHeading.tsx`. Все они — чистый React, не зависят от Next.js, переносятся файл-в-файл.

`ServiceError.tsx` и `SourceBadge.tsx` используют `next/link`/`next/image` — дашборду они не нужны напрямую, не переносим.

### 4.3. Markdown pipeline — переносится как есть

Из `frontend/src/lib/blog/posts.ts`:

```
markdown-текст
  → remark()              // парсинг в AST
  → remark-gfm            // таблицы, чек-листы, strikethrough
  → remark-rehype({ allowDangerousHtml: true })
  → rehype-slug            // id для заголовков
  → rehype-stringify({ allowDangerousHtml: true })
  → DOMPurify.sanitize()   // санитизация перед dangerouslySetInnerHTML
```

В новом проекте используется **браузерный** `dompurify` (не `isomorphic-dompurify`), так как рендеринг полностью клиентский (Vite SPA, нет server components). Версии пакетов — как в `frontend/package.json`: `remark@15`, `remark-gfm@4`, `remark-rehype@11`, `rehype-slug@6`, `rehype-stringify@10`.

Этот pipeline используется в двух местах: просмотр документа и live-превью при редактировании.

### 4.4. Прочее

- Иконки — инлайн SVG, без иконочной библиотеки (как в исходном проекте).
- `clsx` + `tailwind-merge` → хелпер `cn()` переносится как есть.
- Шрифт — Geist (через `@fontsource/geist-sans` или прямой `<link>` на Google Fonts, поскольку `next/font` недоступен в Vite).

---

## 5. Модель данных

### 5.1. `Document`

| Поле | Тип | Описание |
|---|---|---|
| `id` | `int`, PK | |
| `slug` | `str`, unique | URL-идентификатор (`design-guide`, `bugs`, `readme`) |
| `title` | `str` | Заголовок для списка документов |
| `content_md` | `text` | Markdown-содержимое, редактируемое |
| `created_at` / `updated_at` | `datetime(tz)` | Таймстемпы (миксин, как в `db/models/users.py` исходного проекта) |

### 5.2. `WbsItem` (ИСР)

| Поле | Тип | Описание |
|---|---|---|
| `id` | `int`, PK | |
| `parent_id` | `int`, FK на себя, nullable | `NULL` — фаза верхнего уровня |
| `code` | `str` | `"1"`, `"1.1"`, `"1.1.1"` — как в `AGENT_VERA_WBS.txt` |
| `phase_name` | `str`, nullable | Заполнено только у узлов верхнего уровня: «Инициация», «Проектирование» и т.д. |
| `title` | `str` | Название задачи/подзадачи |
| `role` | `enum`, nullable | `PM \| BE \| FE \| UXR \| UXD \| EXPERT \| QA \| BA \| MKT` |
| `order_index` | `int` | Порядок среди братских узлов |
| `is_leaf` | `bool` | `true` → у узла есть связанная `KanbanTask` |

Глубина дерева — максимум 3 уровня (фаза → задача → подзадача), как в текущем ИСР.

### 5.3. `KanbanStage`

| Поле | Тип | Описание |
|---|---|---|
| `id` | `int`, PK | |
| `name` | `str` | «Backlog», «To Do», «In Progress», «Review», «Done» (сид по умолчанию, редактируется) |
| `order_index` | `int` | Порядок колонок на доске |
| `color` | `str` | HEX, для полоски/бейджа колонки (в стиле ролевых цветов из `AGENT_VERA_ROADMAP.html`) |

### 5.4. `KanbanTask`

| Поле | Тип | Описание |
|---|---|---|
| `id` | `int`, PK | |
| `wbs_item_id` | `int`, FK, nullable, **unique** | 1:1 с листовым `WbsItem`; `NULL` — задача создана вручную, не из ИСР |
| `stage_id` | `int`, FK | Текущая стадия |
| `title` | `str` | По умолчанию = `wbs_item.title` |
| `description_md` | `text`, nullable | Markdown-описание |
| `due_date` | `date`, nullable | Срок |
| `position` | `float` | Сортировка внутри стадии (drag&drop переставляет, можно дробные значения для вставки между карточками) |
| `created_at` / `updated_at` | `datetime(tz)` | |

### 5.5. `TaskComment`

| Поле | Тип | Описание |
|---|---|---|
| `id` | `int`, PK | |
| `task_id` | `int`, FK | |
| `author_name` | `str`, nullable | Свободный текст (нет авторизации/аккаунтов — просто подпись, опционально) |
| `body_md` | `text` | |
| `created_at` | `datetime(tz)` | |

### 5.6. `TaskActivity` (история изменений)

| Поле | Тип | Описание |
|---|---|---|
| `id` | `int`, PK | |
| `task_id` | `int`, FK | |
| `event_type` | `enum` | `STAGE_CHANGED \| DUE_DATE_CHANGED \| DESCRIPTION_CHANGED \| COMMENT_ADDED` |
| `from_value` | `str`, nullable | Текстовое представление старого значения (например, название стадии) |
| `to_value` | `str`, nullable | Текстовое представление нового значения |
| `created_at` | `datetime(tz)` | |

Запись создаётся в сервисном слое (`services/kanban.py`) при каждом изменении задачи — не пользователем напрямую, а как побочный эффект `move_task` / `update_task` / `add_comment`. Отдаётся через `GET /api/kanban/tasks/{id}/activity`, рендерится в `TaskDrawer` под комментариями в хронологическом порядке.

### 5.7. `DocumentLink` (связь документа с задачей или узлом ИСР)

| Поле | Тип | Описание |
|---|---|---|
| `id` | `int`, PK | |
| `document_id` | `int`, FK | |
| `kanban_task_id` | `int`, FK, nullable | Заполнено, если связь — с конкретной задачей |
| `wbs_item_id` | `int`, FK, nullable | Заполнено, если связь — с узлом ИСР |

Ограничение на уровне сервиса: ровно одно из `kanban_task_id` / `wbs_item_id` должно быть заполнено. Эта таблица — единственное, что мы берём из идеи "документация связана с WBS и с задачами": не полноценный граф связей (как в Miro), а простой список ссылок, отображаемый в `TaskDrawer` («Связанные документы: ...») и на странице документа («Используется в: ...»).

### 5.8. Вычисляемая агрегация (не хранится)

При запросе `GET /api/wbs/tree` для каждого нелистового узла backend вычисляет:
```
done_count / total_count   среди задач всех потомков-листьев
```
и отдаёт как `progress: { done: int, total: int }` в ответе — это не отдельная таблица, а агрегирующий `GROUP BY` в репозитории `wbs.py` (join `WbsItem` → `KanbanTask` → `KanbanStage`, фильтр `stage.name == "Done"` или явный признак "финальная стадия" `KanbanStage.is_done_stage: bool`).

> Уточнение по сравнению с черновым вариантом плана: чтобы не хардкодить понятие «Done» по имени строки, в `KanbanStage` добавляется булево поле `is_done_stage` — отмечает, какая стадия считается завершающей для расчёта прогресса. По умолчанию `true` только у одной сид-стадии («Done»).

---

## 6. Backend: структура и API

Конвенции — точная копия слоёв из `backend/src/` основного проекта: `api → services → repositories → db`, плюс `schemas` (Pydantic) и `dependencies` (DI-фабрики).

```
backend/src/
├── core/
│   └── settings.py        # pydantic-settings: DBSettings (postgres_*), AppSettings (cors_origins, debug)
├── db/
│   ├── session.py         # create_async_engine + async_sessionmaker (как db/session.py исходного проекта)
│   ├── models/
│   │   ├── base.py        # DeclarativeBase + TimestampMixin
│   │   ├── documents.py
│   │   ├── wbs.py
│   │   └── kanban.py
│   └── alembic/
│       ├── env.py         # async-миграции, target_metadata = Base.metadata
│       └── versions/
├── repositories/
│   ├── documents.py       # DocumentsRepository: get_all, get_by_slug, update
│   ├── wbs.py              # WbsRepository: get_tree (с join на kanban_task/kanban_stage)
│   ├── kanban.py           # KanbanRepository: stages CRUD, tasks CRUD, move_task, comments CRUD, activity log insert
│   └── document_links.py   # DocumentLinksRepository: create/delete/get_by_document/get_by_task/get_by_wbs_item
├── services/
│   ├── documents.py
│   ├── wbs.py               # собирает дерево из плоского списка в сервисном слое
│   ├── kanban.py             # бизнес-правила (move_task → пересчёт position + запись TaskActivity, update_task → diff полей → TaskActivity)
│   └── document_links.py    # валидация "ровно одно из kanban_task_id/wbs_item_id"
├── schemas/
│   ├── documents.py        # DocumentSchema, DocumentUpdateSchema
│   ├── wbs.py                # WbsNodeSchema (рекурсивная, с progress и nullable task)
│   ├── kanban.py              # StageSchema, TaskSchema, TaskMoveSchema, CommentSchema, ActivitySchema
│   └── document_links.py      # DocumentLinkSchema, DocumentLinkCreateSchema
├── dependencies/
│   ├── db_session.py        # DbSessionDep (Annotated), как в исходном проекте
│   ├── repositories.py      # *RepositoryDep фабрики
│   └── services.py          # *ServiceDep фабрики
└── api/
    ├── documents.py
    ├── wbs.py
    ├── kanban.py
    └── document_links.py
```

### 6.1. `main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.documents import router as documents_router
from src.api.wbs import router as wbs_router
from src.api.kanban import router as kanban_router
from src.core.settings import get_settings

app = FastAPI()
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.app.cors_origins,   # напр. ["http://localhost:5173"]
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents_router, prefix="/api/documents", tags=["documents"])
app.include_router(wbs_router, prefix="/api/wbs", tags=["wbs"])
app.include_router(kanban_router, prefix="/api/kanban", tags=["kanban"])
```

CORS middleware — единственное реально новое по сравнению с основным backend: там его нет, потому что Next.js проксирует запросы на сервере (same-origin для браузера). Здесь Vite SPA обращается к API с другого origin напрямую.

### 6.2. Эндпоинты

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/documents` | Список документов (id, slug, title, updated_at) |
| `GET` | `/api/documents/{slug}` | Полный документ с `content_md` |
| `PATCH` | `/api/documents/{slug}` | Обновить `content_md` / `title` |
| `GET` | `/api/wbs/tree` | Дерево ИСР с `progress` и `task` на листьях |
| `GET` | `/api/kanban/stages` | Список стадий |
| `POST` | `/api/kanban/stages` | Создать стадию |
| `PATCH` | `/api/kanban/stages/{id}` | Переименовать / поменять порядок / `is_done_stage` |
| `DELETE` | `/api/kanban/stages/{id}` | Удалить (если нет задач в ней) |
| `GET` | `/api/kanban/tasks?stage_id=` | Список задач (опц. фильтр по стадии) |
| `POST` | `/api/kanban/tasks` | Создать задачу вручную (`wbs_item_id = null`) |
| `PATCH` | `/api/kanban/tasks/{id}` | Обновить title/description/due_date |
| `PATCH` | `/api/kanban/tasks/{id}/move` | `{ stage_id, position }` — для drag&drop |
| `DELETE` | `/api/kanban/tasks/{id}` | Удалить задачу (если `wbs_item_id is null`, иначе 409 — листовая задача из ИСР не удаляется, только перемещается) |
| `GET` | `/api/kanban/tasks/{id}/comments` | Список комментариев |
| `POST` | `/api/kanban/tasks/{id}/comments` | Добавить комментарий |
| `DELETE` | `/api/kanban/comments/{id}` | Удалить комментарий |
| `GET` | `/api/kanban/tasks/{id}/activity` | История изменений задачи (`TaskActivity`), хронологически |
| `GET` | `/api/documents/{slug}/links` | Связанные задачи/узлы ИСР для документа |
| `GET` | `/api/kanban/tasks/{id}/links` | Связанные документы для задачи |
| `POST` | `/api/document-links` | Создать связь `{ document_id, kanban_task_id? , wbs_item_id? }` |
| `DELETE` | `/api/document-links/{id}` | Удалить связь |

### 6.3. Пример схемы дерева ИСР (`WbsNodeSchema`)

```json
{
  "id": 12,
  "code": "1.1",
  "title": "Формирование функциональных и нефункциональных требований...",
  "role": "PM",
  "progress": { "done": 5, "total": 8 },
  "task": null,
  "children": [
    {
      "id": 13,
      "code": "1.1.1",
      "title": "Назначение и проведение рабочих встреч со стейкхолдерами",
      "role": "PM",
      "progress": null,
      "task": { "id": 41, "stage_id": 2, "stage_name": "In Progress", "due_date": null },
      "children": []
    }
  ]
}
```

---

## 7. Frontend: структура и экраны

```
frontend/src/
├── app.css                          # скопированные токены + keyframes
├── lib/
│   ├── api.ts                       # fetch-клиент (base URL из import.meta.env.VITE_API_URL)
│   ├── markdown.ts                  # remark/rehype/dompurify pipeline
│   └── cn.ts                        # clsx + tailwind-merge хелпер
├── components/
│   ├── ui/                          # Button, Modal, Badge, Spinner, ErrorMessage, EmptyState, Pagination, SkipLink, FocusHeading
│   ├── layout/
│   │   ├── Header.tsx               # sticky, blur, золотой акцент; пункты: Документы / ИСР / Канбан
│   │   └── Footer.tsx
│   ├── docs/
│   │   ├── DocumentList.tsx
│   │   └── MarkdownEditor.tsx       # split view: textarea + live-превью
│   ├── wbs/
│   │   └── WbsNode.tsx              # рекурсивный узел дерева, разворачивание, бейдж роли, прогресс-бар
│   └── kanban/
│       ├── Board.tsx                # DndContext (@dnd-kit), колонки
│       ├── Column.tsx
│       ├── TaskCard.tsx
│       └── TaskDrawer.tsx           # описание, due date, комментарии, история (TaskActivity), связанные документы
├── routes/
│   ├── HomePage.tsx                 # сводка: % готовности ИСР, кол-во документов, ближайшие сроки
│   ├── DocumentsPage.tsx
│   ├── DocumentDetailPage.tsx       # просмотр + кнопка "редактировать" → MarkdownEditor
│   ├── WbsPage.tsx
│   └── KanbanPage.tsx
├── stores/
│   └── ui.ts                        # Zustand: selectedTaskId, drawerOpen, kanbanFilters, wbsExpandedNodes
├── App.tsx                          # React Router: "/", "/docs", "/docs/:slug", "/wbs", "/kanban"
└── main.tsx
```

### 7.1. Ключевые новые зависимости (нет в исходном frontend)

| Пакет | Назначение |
|---|---|
| `react-router-dom` | Роутинг (вместо Next App Router) |
| `zustand` | Client state (выбранная задача, открытость панелей, фильтры, развёрнутые узлы дерева) — версия 5, та же библиотека, что уже используется в исходном `frontend/src/stores/auth.ts` |
| `@dnd-kit/core`, `@dnd-kit/sortable` | Drag&drop для канбана — активно поддерживается, доступен из коробки, в отличие от `react-beautiful-dnd` |
| `dompurify` (не `isomorphic-`) | Санитизация — чисто клиентский рендеринг |

Переносятся без изменений: `@tanstack/react-query`, `react-aria-components`, `clsx`, `tailwind-merge`, `remark`/`remark-gfm`/`remark-rehype`/`rehype-slug`/`rehype-stringify`.

**Server state vs client state.** Документы/задачи/ИСР/комментарии/история — это TanStack Query (с `invalidateQueries` после мутаций, как в `useFavorites.ts` исходного проекта). Какая задача открыта в `TaskDrawer`, какие узлы дерева развёрнуты, какие фильтры на канбане — это Zustand, не должно гонять лишние ре-рендеры через React Query кэш.

**Optimistic updates на drag&drop.** `PATCH /api/kanban/tasks/{id}/move` оборачивается в `useMutation` с `onMutate` (карточка сразу переезжает в новую колонку в локальном кэше React Query) и `onError` (откат + `ErrorMessage`). Без этого drag&drop будет визуально "запаздывать" на round-trip к серверу.

### 7.2. Layout — Master-Detail

Везде, где есть список + детали (канбан, ИСР), используется один и тот же паттерн: `Sidebar` (навигация Документы/ИСР/Канбан) → `Main Content` (доска/дерево/список документов) → `Details Panel` справа (`TaskDrawer` для канбана и ИСР-листьев; для документов — отдельная страница `/docs/:slug`, без боковой панели, так как там нужно больше пространства для текста).

### 7.3. Дерево ИСР — почему не Gantt/SVG

Глубина дерева — максимум 3 уровня, узлов — несколько десятков. Полноценная Gantt-визуализация (как `AGENT_VERA_ROADMAP.html`) для этого избыточна и плохо сочетается с интерактивностью (клик → переход к карточке канбана). Вместо этого — раскрывающийся вложенный список:

```
▾ Фаза 1. Инициация                                    [███████░░░] 7/10
  ▾ 1.1 Формирование требований к ассистенту [PM]        [████░░] 5/8
      1.1.1 Назначение и проведение рабочих встреч...   ● In Progress
      1.1.2 Подготовка опросников для сбора требований  ✓ Done
      ...
  ▸ 1.2 Изучение ТЗ, выбор архитектуры сервисов [Backend] [██████] 6/6
```

Бейдж роли использует ту же цветовую палитру, что определена в `AGENT_VERA_ROADMAP.html` (PM — золото, BE — оранжевый, FE — голубой, UX-R — фиолетовый, UX-D — розовый, Expert — зелёный, QA — красный, BA — синий, MKT — бирюзовый).

### 7.3. Канбан-доска

Стандартная доска: колонки = `KanbanStage` (сортировка по `order_index`), карточки = `KanbanTask`. Карточка показывает: заголовок, бейдж роли (если связана с WBS), due date (с подсветкой, если просрочена), счётчик комментариев. Клик на карточку → `TaskDrawer` (боковая панель): полное описание (markdown, редактируемое), due date picker, список комментариев с формой добавления, ссылка «Открыть в ИСР» (если `wbs_item_id` не null).

---

## 8. WBS ↔ канбан: как это работает на практике

1. При сидировании (раз, при первом запуске) для каждого листового пункта ИСР создаётся ровно одна `KanbanTask` в стадии «Backlog».
2. Пользователь двигает карточку по канбану — `PATCH /api/kanban/tasks/{id}/move`.
3. На странице `/wbs` для каждого родительского узла отображается прогресс — сколько из дочерних листовых задач находятся в стадии с `is_done_stage = true`.
4. Кликнув на листовой узел ИСР, пользователь видит текущую стадию и переходит в канбан с подсветкой нужной карточки (`?highlight=task_id`).
5. Ручные задачи (не из ИСР, `wbs_item_id = null`) создаются прямо в канбане — для разовых дел, не описанных в ИСР изначально (например, "починить баг X"). Они не отображаются в дереве ИСР.

---

## 9. Сидирование начальных данных

`backend/scripts/seed_initial_data.py` — одноразовый скрипт (запускается вручную после `alembic upgrade head`):

1. **Документы.** Читает выбранный набор `.md`-файлов из `site_work_for_everyone` (путь передаётся аргументом скрипта или константой) — кандидаты: `README.md`, `AGENT_VERA_ARCHITECTURE.md`, `DESIGN_GUIDE.md`, `BUGS.md`, `BLOG_CHEATSHEET.md`, `ADMIN_STATS_GUIDE.md`, `FRONTEND_AUDIT_REPORT.md`, `focus_management_best_practices_accessibility_guide.md`, `BUG-001_FAVORITES_FIX_REPORT.md`. Для каждого — создаёт `Document(slug=filename_without_ext, title=первый_H1, content_md=raw_content)`.
2. **ИСР.** Парсит структуру `AGENT_VERA_WBS.txt` (фазы → `N.N` → `N.N.N`) построчно по отступам и нумерации, создаёт дерево `WbsItem`. Для каждого узла без потомков (`is_leaf=true`) создаёт связанную `KanbanTask` со `stage_id` = id стадии «Backlog».
3. **Стадии.** Сидирует 5 стадий по умолчанию: Backlog, To Do, In Progress, Review, Done (`is_done_stage=true` только у Done).

> HTML-отчёты (`AGENT_VERA_PROJECT_PASSPORT.html`, `AGENT_VERA_ROADMAP.html`, `AGENT_VERA_STAKEHOLDER_MATRIX.html`, `AGENT_VERA_TECHNICAL_PLAN.html`, `vera_wbs.html`) **не сидируются как `Document`** в v1 — это самостоятельные печатные отчёты с инлайн-стилями, конвертация в markdown потеряла бы их вёрстку. Если понадобится редактировать и их — добавим позже либо как markdown-конверсию, либо как отдельный тип `Document.content_type = "html"` с рендерингом в `<iframe sandbox>`.

---

## 10. Пошаговый план реализации

1. Backend skeleton: `main.py`, `core/settings.py`, `db/session.py`, `db/models/base.py`, `alembic` (async-паттерн из исходного проекта).
2. Модели (`Document`, `WbsItem`, `KanbanStage`, `KanbanTask`, `TaskComment`) + первая Alembic-миграция.
3. Слои `repositories → services → schemas → api` для `documents`, затем `kanban`, затем `wbs` (wbs последним, так как зависит от kanban-задач для прогресса).
4. `seed_initial_data.py` — документы, стадии, дерево ИСР + связанные задачи.
5. Frontend skeleton: Vite + React + TS, `app.css`, перенос UI-примитивов и markdown pipeline.
6. Экран «Документы»: список → просмотр → редактирование (split view).
7. Экран «ИСР»: рекурсивное дерево, прогресс-бары, бейджи ролей.
8. Экран «Канбан»: колонки, drag&drop (`@dnd-kit`) с optimistic updates, `TaskDrawer` (описание/срок/комментарии/история/связанные документы), переход из ИСР с подсветкой карточки.
9. Связи документ↔задача/ИСР (`DocumentLink`) — добавляются как небольшая надстройка после п.6–8: бэкенд-слой `document_links.py` + блок «Связанные документы» в `TaskDrawer` и на странице документа.
10. Главная страница со сводкой (опционально, после остальных экранов).
11. `docker-compose.yml` для локального подъёма backend + postgres + frontend (опционально).

## 11. Критерии готовности и проверка

- `alembic upgrade head` поднимает схему без ошибок.
- `python scripts/seed_initial_data.py` идемпотентно создаёт документы, стадии и дерево ИСР с задачами (повторный запуск не дублирует записи — проверка по `slug`/`code`).
- `GET /api/wbs/tree` возвращает дерево, совпадающее по структуре с `AGENT_VERA_WBS.txt`, с корректными `progress` на родительских узлах.
- На `/wbs` дерево разворачивается/сворачивается, бейджи ролей соответствуют палитре `AGENT_VERA_ROADMAP.html`.
- На `/kanban` карточка перетаскивается между колонками **мгновенно** (optimistic update, без ожидания ответа сервера); при ошибке запроса — откат в исходную колонку и сообщение об ошибке. После перетаскивания и обновления `/wbs` прогресс родительского узла пересчитан.
- В `TaskDrawer` после смены стадии/срока/добавления комментария в блоке истории появляется новая запись `TaskActivity` без перезагрузки страницы.
- На `/docs/:slug` редактирование и сохранение (`PATCH`) переживает перезагрузку страницы; live-превью при редактировании визуально идентично рендерингу блога в исходном проекте (тот же markdown pipeline).
- Визуально дашборд неотличим по стилю (цвета, типографика, кнопки, фокус-стили) от `site_work_for_everyone/frontend` — никаких следов чужой UI-библиотеки (MUI/shadcn).

## 12. Сознательно не делаем в v1

Рассмотрели и осознанно отложили (в т.ч. по итогам сравнения с рекомендациями другого агента, ориентированными на Linear/Notion/Jira/Miro):

- **Авторизацию** — по явному решению, публичная отчётность.
- **Полноценный WYSIWYG-редактор (TipTap)** — textarea + live-превью достаточно для объёма документации; апгрейд — отдельная итерация, если markdown перестанет хватать.
- **react-complex-tree / drag&drop по дереву ИСР** — дерево всего 3 уровня и десятки узлов, кастомный рекурсивный компонент проще, легче стилизуется под наш дизайн и не тащит чужие UI-паттерны. Drag&drop оставляем только для канбана.
- **MUI / shadcn/ui** — конфликтует с решением визуально клонировать дизайн-систему `site_work_for_everyone` (свои CSS-токены, без готовых компонентных библиотек).
- **Виртуализацию списков (react-window/react-virtual)** — преждевременная оптимизация: десятки задач и узлов ИСР, не тысячи.
- **Miro-style граф связей и масштабируемое холст-представление ИСР** — избыточно для текущего масштаба; дерево с rollup-прогрессом покрывает потребность.
- **Полноценное вложенное дерево документов (Notion-style)** — пока ~9 плоских документов, иерархия не нужна; если документов станет много, можно добавить вложенность в `Document` (`parent_id`) позже по той же схеме, что и `WbsItem`.
- **Импорт HTML-отчётов** (паспорт, дорожная карта, матрица стейкхолдеров, технический план) как редактируемых документов — см. раздел 9.
- **Gantt/SVG-визуализацию ИСР** — вложенное дерево достаточно для текущей глубины и масштаба ИСР.

Что **взяли** из рекомендаций другого агента и уже отражено в плане выше: Master-Detail layout (раздел 7.2), разделение Server State (TanStack Query + optimistic updates) / Client State (Zustand) (раздел 7.1), история изменений задачи `TaskActivity` (раздел 5.6, теперь в v1, а не отложено), связи документ↔задача/ИСР `DocumentLink` (раздел 5.7) — в облегчённом виде, без полноценного графа связей.
