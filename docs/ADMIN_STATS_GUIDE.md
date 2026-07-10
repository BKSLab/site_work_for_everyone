# Страница статистики в sqladmin — руководство по реализации

Описание того, как реализована страница `/admin/stats` в сервисе авторизации.
Используй этот документ как основу для страниц статистики в других сервисах.

---

## Что использовали

- **sqladmin 0.20.1** — `BaseView` + декоратор `@expose`
- **SQLAlchemy async** — прямые запросы через `AsyncSession`
- **Jinja2** — шаблон расширяет встроенный `sqladmin/layout.html`
- **CSS** — только CSS-переменные из `admin-theme.css`, никаких внешних зависимостей

---

## Структура файлов

```
backend/
├── src/admin/
│   ├── __init__.py       # create_admin — здесь передаём engine в StatsView
│   └── views.py          # StatsView(BaseView) — логика запросов
└── templates/sqladmin/
    └── stats.html        # шаблон страницы
```

---

## Шаг 1. Класс StatsView в views.py

```python
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqladmin import BaseView, expose
from starlette.requests import Request
from starlette.responses import Response

from src.db.models.your_model import YourModel  # замени на свою модель


class StatsView(BaseView):
    name = "Статистика"
    icon = "fa-solid fa-chart-bar"
    engine = None  # передаётся снаружи через StatsView.engine = engine

    @expose("/stats", methods=["GET"])
    async def stats_page(self, request: Request) -> Response:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=6)

        async with AsyncSession(self.__class__.engine) as session:
            total = (await session.execute(
                select(func.count()).select_from(YourModel)
            )).scalar_one()

            new_today = (await session.execute(
                select(func.count()).select_from(YourModel)
                .where(YourModel.created_at >= today_start)
            )).scalar_one()

            new_week = (await session.execute(
                select(func.count()).select_from(YourModel)
                .where(YourModel.created_at >= week_start)
            )).scalar_one()

            # добавляй любые другие агрегации по необходимости

        stats = {
            "total": total,
            "new_today": new_today,
            "new_week": new_week,
        }
        return await self.templates.TemplateResponse(
            request,
            "sqladmin/stats.html",
            {
                "title": "Статистика",
                "subtitle": "Сводка по ...",
                "stats": stats,
            },
        )
```

### Важные нюансы

- `engine = None` — class variable. `add_base_view` не передаёт engine автоматически (в отличие от `ModelView`), поэтому передаём вручную через `StatsView.engine = engine` перед вызовом `add_base_view`.
- `self.__class__.engine` — обращение через класс, т.к. `self` — экземпляр, а `engine` — class variable.
- Все запросы — параллельно через один `AsyncSession` в одном блоке `async with`.

---

## Шаг 2. Регистрация в create_admin (__init__.py)

```python
from .views import StatsView  # и остальные views

def create_admin(app, engine) -> Admin:
    admin = Admin(...)

    # сначала все ModelView
    admin.add_view(YourModelAdmin)

    # затем BaseView — с передачей engine до регистрации
    StatsView.engine = engine
    admin.add_base_view(StatsView)

    return admin
```

**Порядок важен:** `StatsView.engine = engine` должен быть до `add_base_view`.

---

## Шаг 3. Шаблон templates/sqladmin/stats.html

Шаблон расширяет `sqladmin/layout.html` и заполняет блок `content`.
Layout даёт боковое меню, заголовок страницы (`title`, `subtitle`) и обёртку `.row.row-deck.row-cards`.

```html
{% extends "sqladmin/layout.html" %}

{% block content %}

{# Карточка-заголовок — всего + акцентный градиент #}
<div class="col-12">
  <div class="card" style="
    background: radial-gradient(circle at top left, rgba(245,184,0,0.07), transparent 50%), var(--surface);
    border: 1px solid rgba(255,255,255,0.12);
  ">
    <div class="card-body" style="padding: 2rem;">
      <p style="font-size:11px; font-weight:600; text-transform:uppercase;
                letter-spacing:0.1em; color:var(--muted); margin-bottom:0.5rem;">
        Всего
      </p>
      <p style="font-size:3rem; font-weight:800; color:var(--accent); line-height:1; margin-bottom:0;">
        {{ stats.total }}
      </p>
      <hr style="border-top: 2px solid var(--accent); margin-top:1.25rem; margin-bottom:0;">
    </div>
  </div>
</div>

{# Карточки 50/50 #}
<div class="col-12 col-sm-6">
  <div class="card">
    <div class="card-body" style="padding: 1.5rem;">
      <!-- цветная точка-индикатор -->
      <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.75rem;">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%;
                     background: var(--accent); flex-shrink:0;"></span>
        <p style="font-size:11px; font-weight:600; text-transform:uppercase;
                  letter-spacing:0.1em; color:var(--muted); margin:0;">
          Метрика
        </p>
      </div>
      <p style="font-size:2rem; font-weight:700; color:var(--accent); margin:0;">
        {{ stats.new_today }}
      </p>
      <!-- опционально: процент -->
      {% if stats.total > 0 %}
      <p style="font-size:12px; color:var(--muted); margin-top:0.25rem; margin-bottom:0;">
        {{ "%.0f"|format(stats.new_today / stats.total * 100) }}% от общего числа
      </p>
      {% endif %}
    </div>
  </div>
</div>

{% endblock %}
```

---

## Цвета точек-индикаторов

| Смысл | Цвет |
|-------|------|
| Главный акцент / позитив | `var(--accent)` — золото `#F5B800` |
| Успех / подтверждено | `#4ADE80` — зелёный |
| Ошибка / отклонено | `#F87171` — красный |
| Нейтральный / неактивно | `var(--muted)` — серый `#999999` |
| Приглушённый акцент | `var(--accent)` + `opacity: 0.5` |

---

## Сетка карточек

Используется Bootstrap-сетка Tabler (уже подключена в sqladmin):

| Ширина | Класс |
|--------|-------|
| На всю строку | `col-12` |
| Половина (от sm) | `col-12 col-sm-6` |
| Треть (от md) | `col-12 col-md-4` |

Все карточки помещаются в `{% block content %}` — layout оборачивает их в `.row.row-deck.row-cards` автоматически.

---

## Что НЕ делать

- **Не использовать** `self._admin_ref` — в `BaseView` он не устанавливается автоматически (баг/особенность sqladmin 0.20.x).
- **Не создавать** новый engine — передавать тот же, что используется в `create_admin`.
- **Не писать** inline-Tailwind — в шаблонах sqladmin нет Tailwind, только Bootstrap/Tabler + наши CSS-переменные из `admin-theme.css`.
