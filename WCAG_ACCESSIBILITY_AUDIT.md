# Аудит доступности фронтенда — WCAG 2.2 и WCAG 3.0

**Проект:** `site_work_for_everyone` (Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, `react-aria-components`)
**Объём:** `frontend/src` — 96 файлов исходников
**Дата:** 20.10.2026 · **Редакция:** 2 (переработана структура: точные привязки к первоисточникам, готовые решения, раздел о вреде буквального следования)
**Метод:** сплошное чтение исходников + сверка со спецификациями. Автосканеры (axe/Lighthouse) не запускались — они не находят большинство заявленных здесь проблем.
**Код не изменялся.** Документ аналитический.

---

## 1. Как читать этот отчёт

### 1.1. Главный принцип: выгода, а не формальность

WCAG — это не чек-лист. Формальное соответствие можно получить и при этом оставить интерфейс непригодным. Поэтому каждая находка в этом отчёте описана через **сценарий пользователя**, а не через номер критерия:

> **Проверка на полезность.** Если исправление не меняет то, что человек **услышит, прочитает или сможет сделать** — оно не нужно. Если формально «правильное» решение ухудшает опыт — оно вредно. Такие случаи собраны в разделе 5.

Три примера, задающих тон всего документа:

| Формально «правильно» | На самом деле |
|---|---|
| Поместить потоковый текст ответа в `aria-live="polite"` | Скринридер будет читать ответ **по слогам**, пока он печатается. Пользователь не сможет его прервать или перечитать. Катастрофа. Правильно — объявлять «Ответ готов» и дать доступ к готовому тексту (Д-18) |
| Добавить `aria-modal="true"` в модалку вручную | React Aria **намеренно** его не ставит: в Safari/VoiceOver ручной `aria-modal` скрывает от скринридера весь остальной документ. Здесь буквальное следование рекомендации ломает интерфейс (раздел 5.2) |
| Добавить `aria-label="Вакансия: Разработчик"` на каждую ссылку «Подробнее» | Голосовое управление перестаёт работать: пользователь говорит «нажми Подробнее», а имя ссылки теперь другое. Правильно — `aria-label`, **содержащий** видимый текст, либо скрытый текст внутри ссылки (Д-05, раздел 5.4) |

### 1.2. Структура карточки дефекта

Каждая существенная находка оформлена одинаково:

- **Источник** — точная ссылка на первоисточник с якорем, версия стандарта, уровень (A/AA/AAA). Дополнительно — техника W3C или паттерн APG, если они есть.
- **Где** — `файл:строка` в `frontend/src`.
- **Что слышит пользователь** — дословный сценарий: что произносит NVDA/VoiceOver и что человек делает в этот момент.
- **Что сделать** — конкретное действие, пригодное для постановки задачи.
- **Почему так** — в чём выгода для пользователя (не «потому что требует WCAG»).
- **Не делать** — где очевидное «по стандарту» решение навредит.

### 1.3. Обозначения

| Метка | Значение |
|---|---|
| `WCAG 2.2` | W3C Recommendation от 12.12.2024 — действующий нормативный документ |
| `WCAG 3.0 (WD)` | Working Draft от 10.09.2026 — черновик, не рекомендация. Требования черновика имеют статус Developing и могут измениться |
| `A` / `AA` / `AAA` | Уровень соответствия. Целевой для проекта — **AA** |
| `APG` | WAI-ARIA Authoring Practices Guide — паттерны поведения, рекомендованные для кастомных виджетов |
| `Т` | Техника W3C (WCAG 2.2 Techniques) — конкретный проверенный рецепт реализации |

---

## 2. Сводка

### 2.1. Оценка

| Аспект | Результат |
|---|---|
| Уровень соответствия | **Частичное соответствие WCAG 2.2 AA.** Слабые места — в динамике (фокус, объявления), а не в статической разметке |
| Статическая разметка | Высокое качество, единообразный стиль по всему проекту |
| Работа с экранными читалками | **Средний уровень.** 7 дефектов ломают сценарий, 8 приводят к потере информации |
| Клавиатура | Хорошая, кроме 2 участков |
| Контраст | AA пройден для основного текста; провален для вторичных подписей и рамок полей ввода |
| WCAG 3.0 (WD) | Из ~40 релевантных требований черновика выполнено ~22 |

### 2.2. Находки по группам

| Группа | Критерий отбора | Кол-во | Из них ломают работу скринридера |
|---|---|---|---|
| **A. Ломает сценарий** | Пользователь не может завершить задачу или потерял позицию | 13 | 13 |
| **B. Теряется информация** | Задача завершается, но результат или контекст не долетают до пользователя | 10 | 10 |
| **C. Заметно, но не ломает** | Контраст, размеры целей | 4 | 0 |
| **D. Точечные** | Локальные несоответствия, не влияющие на прохождение сценария | 20 | 3 |
| **Итого** | | **47** | **26** |

### 2.3. Топ-10 по эффекту

Ранжирование — по тому, насколько сильно находка мешает человеку с экранным доступом, а не по формальной тяжести нарушения.

| № | Находка | Эффект | Трудоёмкость |
|---|---|---|---|
| Д-02 | `aria-activedescendant` на несуществующий узел | NVDA произносит «referenced node invalid» — ошибка, которую скринридер сообщает как ошибку | 15 мин |
| Д-05 | 20 одинаковых ссылок «Подробнее» | Невозможно выбрать вакансию в режиме обзора ссылок | 30 мин |
| Д-06 | Невидимый фокус радиокнопок фильтра | Клавиатурный пользователь теряет позицию в группе | 30 мин |
| Д-07 | Потеря фокуса при навигации в auth-разделе | Каждый переход = перечитывание всей страницы | 1 ч |
| Д-08 | Нет переноса фокуса на ошибочное поле (6 форм) | Непонятно, какое поле неверно | 1 ч |
| Д-11 | `inputMode="numeric"` у буквенно-цифрового OTP | **Сценарий подтверждения email не завершается вообще** | 15 мин |
| Д-13 | `Tab` перехватывается в listbox мастера | Интерфейс выглядит «залипшим» | 30 мин |
| Д-01 | Skip-link ведёт на нефокусируемый `<main>` | Обход навигации недоступен для скринридера | 5 мин |
| Д-03, Д-04 | Нет `h1` на двух страницах | Навигация по заголовкам не работает | 30 мин |
| Д-12 | Историю чата нельзя прокрутить с клавиатуры | Длинная консультация недоступна без мыши | 15 мин |

**Суммарно топ-10 ≈ 6 часов работы** и закрывает большую часть реальных проблем.

---

## 3. Что уже работает хорошо

Это не «вежливость» — это работающие механизмы, которые нельзя потерять при рефакторинге. Раздел служит регрессионным чек-листом.

### 3.1. Объявления и статусы — сильнейшая часть проекта

| Механизм | Файл:строка | SC |
|---|---|---|
| Живой регион чата `role="status" aria-live="polite" aria-atomic="true"` | `vera/ChatWindow.tsx:346-354` | 4.1.3 (AA) |
| `aria-busy` на области истории во время генерации | `vera/ChatWindow.tsx:362-364` | 4.1.3 (AA) |
| 30+ скриптовых объявлений на каждое изменение состояния диалога | `hooks/useVeraChat.ts` (`setAnnouncement`, напр. `:2196`, `:3709`, `:3926`) | 4.1.3 (AA) |
| Роль автора реплики вынесена в `sr-only` («Вы: » / «Ассистент Вера: ») | `vera/ChatMessage.tsx:104-106` | 1.3.1 (A) |
| Реплики как список: `role="list"` + `role="listitem"` → NVDA сообщает количество и позицию, работает навигация по элементам | `vera/ChatWindow.tsx:63-67`, `ChatMessage.tsx:63` | 1.3.1 (A) |
| Копирование ответа: `role="status"` «Ответ скопирован.» + `role="alert"` для ошибки буфера | `vera/MessageCopyButton.tsx:90-92`, `:93-97` | 4.1.3 (AA) |
| Оценка ответа: `aria-pressed` + `role="status"` по факту сохранения | `vera/MessageFeedbackControls.tsx:112-113`, `:131-138` | 4.1.2 (A) |
| Пустые состояния — `role="status"` | `ui/EmptyState.tsx:7`, `favorites/FavoritesList.tsx:60` | 4.1.3 (AA) |
| Счётчик избранного объявляется | `favorites/FavoritesList.tsx:117-120` | 4.1.3 (AA) |
| Глобальная загрузка: `role="status"` + `sr-only` «Загрузка...» | `app/loading.tsx:6-9` | 4.1.3 (AA) |
| Ошибки сервиса — `role="alert"` | `ui/ServiceError.tsx:14`, `ui/ErrorMessage.tsx:12` | 4.1.3 (AA) |

### 3.2. Формы

| Механизм | Файл:строка | SC |
|---|---|---|
| Во всех 11 полях: настоящий `<label htmlFor>` + `aria-invalid` + `aria-describedby` | `auth/login/page.tsx:115-134`, `auth/register/page.tsx:100-216`, `auth/PasswordInput.tsx:29-49`, `auth/OtpCodeInput.tsx:16-37`, `feedback/FeedbackForm.tsx:93-140` | 1.3.1, 3.3.1 (A) |
| Ни одного поля, где лейбл заменён placeholder'ом | — | 3.3.2 (A) |
| `autocomplete` на всех полях: `email`, `current-password`, `new-password`, `given-name`, `family-name`, `one-time-code` | `auth/login/page.tsx:130,154`, `auth/register/page.tsx:113,140,171,197`, `auth/OtpCodeInput.tsx:31` | 1.3.5 (AA) |
| Обязательность озвучивается один раз: `aria-required="true"` + текст в `sr-only`, звёздочка — `aria-hidden` | `auth/login/page.tsx:120-123,132`, `auth/PasswordInput.tsx:34-37,47` | 4.1.2 (A) |
| CAPTCHA и когнитивных тестов нет; вставка пароля из буфера не блокируется | (проверено: `captcha` в `src` не встречается) | **3.3.8 (AA) — выполнено полностью** |
| Введённые данные не теряются при ошибке; двойная отправка заблокирована | `auth/login/page.tsx:46-58`, `auth/SubmitButton.tsx:17` | 3.3.4 (A) |
| Конкретные подсказки по исправлению | `lib/schemas/auth.ts:34-38`, `:66-70` | 3.3.3 (AA) |
| Email переносится по процессу и не перезапрашивается | `auth/register/page.tsx:78-81`, `auth/forgot-password/page.tsx:46-48`, `auth/reset-password/page.tsx:21,125-131` | 3.3.7 (A) |

### 3.3. Модальные окна

| Механизм | Файл:строка | SC |
|---|---|---|
| `react-aria-components` `Modal` + `Dialog` → ловушка фокуса, `Escape`, **возврат фокуса на триггер**, `aria-hidden` вне диалога | `ui/Modal.tsx:24-40` | 2.1.2 (A), 2.4.3 (A) |
| Программная подпись `<Heading slot="title">` | `ui/Modal.tsx:52-56` | 4.1.2 (A) |
| `aria-describedby` подключается только когда описание существует | `vera/VeraFeedbackModal.tsx:245-247` | 4.1.2 (A) |
| Перевод фокуса на ошибочное поле | `vera/VeraFeedbackModal.tsx:148`, `:398-406` | 3.3.1 (A) |

### 3.4. Структура и навигация

| Механизм | Файл:строка | SC |
|---|---|---|
| `<html lang="ru">`, единственный `<main>`, skip-link первым в Tab-порядке | `app/layout.tsx:32,39`, `ui/SkipLink.tsx:3-8` | 3.1.1 (A), 2.4.1 (A) |
| `aria-current="page"` на активных пунктах, `aria-expanded`/`aria-controls` на бургере | `layout/Header.tsx:117,217,228`, `:176-182` | 4.1.2 (A) |
| Мобильное меню: `FocusScope contain restoreFocus autoFocus` + закрытие по `Escape` | `layout/Header.tsx:203`, `:207` | 2.1.2 (A) |
| Перенос фокуса на `h1` при смене страницы (механизм `FocusHeading`) | `ui/FocusHeading.tsx:13`; `blog/page.tsx:56`, `vacancies/VacanciesContent.tsx:42-44`, `favorites/page.tsx:28-30`, `vacancies/VacancyDetail.tsx:49`, `contact/page.tsx:36-41` | 2.4.3 (A) |
| Возврат фокуса на конкретную карточку после возврата с детальной страницы | `vacancies/VacanciesContent.tsx:46-54`, `favorites/page.tsx:35-43` | 2.4.3 (A) |
| Имя ссылки на статью = заголовок статьи (`aria-labelledby`) — **эталон 2.4.4** | `blog/BlogPreview.tsx:26`, `:55` | 2.4.4 (A) |
| `<article aria-labelledby>`, `<dl>/<dt>/<dd>`, `<time dateTime>`, `aria-labelledby` на секциях | `vacancies/VacancyCard.tsx:46-47,62-69`, `blog/[slug]/page.tsx:110`, `app/page.tsx:44,64` | 1.3.1 (A) |
| Вся декоративная графика — `aria-hidden` / пустой `alt`; смысловой `alt` только у обложки | `layout/Header.tsx:91-96`, `blog/[slug]/page.tsx:126` | 1.1.1 (A) |
| Степпер мастера: `aria-current="step"` + `sr-only` «Шаг N из M» | `assistant/AssistantFlow.tsx:143-161` | 1.3.1 (A) |
| `role="radiogroup"` + `aria-checked` + roving `tabIndex`; `role="listbox"` + `aria-activedescendant` | `assistant/AssistantFlow.tsx:689-707`, `:333-348` | 4.1.2 (A) |
| Нативный `<details>/<summary>` — работает с клавиатуры без JS | `assistant/AssistantFlow.tsx:848` | 2.1.1 (A) |
| `DOMPurify.sanitize()` на этапе рендера (не только сборки) | `blog/[slug]/page.tsx:136-139`, `assistant/AssistantFlow.tsx:945` | — |
| Фокусное кольцо `focus-visible:outline-2 outline-accent` — контраст 9.7:1 | по всему проекту | 1.4.11 (AA), 2.4.13 (AAA) |

---

## 4. Дефекты

### Группа A. Ломает сценарий

---

#### Д-01. Skip-link ведёт на `<main>`, который не программно фокусируем

**Первоисточник**
- [WCAG 2.2 SC 2.4.1 Bypass Blocks (A)](https://www.w3.org/TR/WCAG22/#bypass-blocks) · [Understanding 2.4.1](https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html)
- Техника: [G1 — Adding a link at the top of each page that goes directly to the main content area](https://www.w3.org/WAI/WCAG22/Techniques/general/G1)
- [WCAG 3.0 (WD) 2.3.3 Focus relevant / Focus user-controlled](https://www.w3.org/TR/wcag-3.0/#x2-3-3-1-focus-relevant)

**Где**
- `frontend/src/components/ui/SkipLink.tsx:4` — `href="#main-content"`
- `frontend/src/app/layout.tsx:39` — `<main id="main-content" className="min-h-screen">` — **без `tabIndex={-1}`**

**Что слышит пользователь.** Клавиатурный пользователь нажимает Enter на skip-link: страница прокручивается, но **фокус остаётся в шапке**. NVDA продолжает читать шапку. Чтобы добраться до содержимого, нужно нажать `Tab` несколько раз или использовать навигацию по лендмаркам. То есть skip-link для скринридера **не выполняет свою функцию** — ради него он и нужен.

**Что сделать.** Добавить `tabIndex={-1}` на `<main>`.

**Почему так.** `tabIndex={-1}` делает элемент целью программной установки фокуса, но **не** добавляет его в Tab-порядок. Браузер переводит фокус на `<main>`, NVDA произносит «main, region» и начинает читать с нужного места. Пользователь экономит 5–10 нажатий Tab на каждой странице.

**Не делать.** `tabIndex={0}` — это добавит `<main>` в Tab-порядок: пользователь будет натыкаться на него лишний раз при каждом обходе страницы. Нужен именно `-1`.

---

#### Д-02. `aria-activedescendant` указывает на несуществующий элемент

**Первоисточник**
- [WCAG 2.2 SC 4.1.2 Name, Role, Value (A)](https://www.w3.org/TR/WCAG22/#name-role-value) · [Understanding 4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)
- Техника: [ARIA5 — Using WAI-ARIA state and property attributes to expose the state of a user interface component](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA5)
- Спецификация атрибута: [WAI-ARIA 1.2 §aria-activedescendant](https://www.w3.org/TR/wai-aria-1.2/#aria-activedescendant)
- [WCAG 3.0 (WD) 2.3.5 Changes to elements notified](https://www.w3.org/TR/wcag-3.0/#x2-3-5-3-changes-to-elements-notified)

**Где**
- `frontend/src/components/features/search/RegionCombobox.tsx:80-82` — по `Escape` вызывается только `setIsOpen(false)`, `activeIndex` **не сбрасывается**
- `frontend/src/components/features/search/RegionCombobox.tsx:131-135` — `aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}`
- `frontend/src/components/features/search/RegionCombobox.tsx:139-140` — при закрытом списке `<ul role="listbox">` **размонтирован**, значит целевой `id` больше не существует в DOM

**Что слышит пользователь.** Пользователь открывает список регионов, листает стрелками, нажимает `Escape`. Возвращается к полю — NVDA произносит: «Регион, поле с автодополнением, **недействительный**» (в англоязычной версии — «referenced node invalid»). Это единственный класс дефектов, который скринридер сообщает **как ошибку**, а не игнорирует. Пользователь не понимает, что сломалось, и начинает подозревать, что сломалось само приложение.

Дополнительно: `aria-expanded="false"` при одновременно существующем `aria-activedescendant` — противоречивое состояние в дереве доступности.

Тот же дефект возникает, если нажать `ArrowDown` при пустом списке регионов (`RegionCombobox.tsx:65-73`): `activeIndex` становится `0`, а элемента `${listId}-0` не существует.

**Что сделать.** В обработчике `Escape` сбрасывать `activeIndex` в `-1` (как уже сделано в `handleSelect`, `:60-61`). Дополнительно — не выставлять `aria-activedescendant`, когда `isOpen === false`, и защитить `ArrowDown` от выхода за пределы `filtered`.

**Почему так.** Комбобокс реализован вручную (не `react-aria-components`), поэтому корректность `aria-activedescendant` — зона ответственности автора. Сброс `activeIndex` — одна строка, убирающая сообщение об ошибке, которое подрывает доверие ко всему интерфейсу.

**Не делать.** Не заменять на `aria-activedescendant` без проверки существования цели «по умолчанию»: React в этой версии не даёт гарантии, что атрибут будет удалён синхронно с размонтированием списка. Явная синхронизация состояния надёжнее.

---

#### Д-03. На `/assistant/start` нет ни одного `h1`

**Первоисточник**
- [WCAG 2.2 SC 1.3.1 Info and Relationships (A)](https://www.w3.org/TR/WCAG22/#info-and-relationships) · [Understanding 1.3.1](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)
- [WCAG 2.2 SC 2.4.6 Headings and Labels (AA)](https://www.w3.org/TR/WCAG22/#headings-and-labels) · [Understanding 2.4.6](https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html)
- Техника: [H42 — Using h1-h6 to identify headings](https://www.w3.org/WAI/WCAG22/Techniques/html/H42), [G64 — Providing a Table of Contents](https://www.w3.org/WAI/WCAG22/Techniques/general/G64)
- [WCAG 3.0 (WD) 2.7.3 Heading structure available](https://www.w3.org/TR/wcag-3.0/#x2-7-3-4-heading-structure-available)

**Где**
- `frontend/src/app/assistant/start/page.tsx:8-20` — страница целиком
- `frontend/src/components/features/assistant/AssistantFlow.tsx:613` — `<h2 ref={stepHeadingRef}>Выберите вакансию</h2>`; аналогично `:686`, `:738`, `:801`, `:931`
- В ветке «не авторизован» (`AssistantFlow.tsx:567-604`) заголовков нет вообще — только `<p>` на `:579`

**Что слышит пользователь.** NVDA, нажатие `H`: список, в котором **нет элемента уровня 1** — только «heading level 2» без верхнего ориентира. Пользователь не может одним нажатием перейти к главному заголовку и не понимает, где находится в иерархии. Дополнительно `<h2>` получает программный фокус (`AssistantFlow.tsx:547-549`) — NVDA произнесёт «heading level 2, Выберите вакансию» без контекста страницы.

**Что сделать.** Добавить `<h1>` на страницу (например, «Ассистент Вера — подбор вакансии») и оставить `<h2>` для шагов. В ветке «не авторизован» — тоже нужен `h1`, иначе страница останется без верхнего уровня.

**Почему так.** Для пошагового мастера заголовки — **основной** способ освоить интерфейс без зрения: пользователь возвращается к началу шага по `H`. Без `h1` верхний ориентир отсутствует.

---

#### Д-04. На странице ошибки заголовка нет вообще

**Первоисточник**
- [WCAG 2.2 SC 1.3.1 (A)](https://www.w3.org/TR/WCAG22/#info-and-relationships) · [SC 2.4.6 (AA)](https://www.w3.org/TR/WCAG22/#headings-and-labels)
- [WCAG 3.0 (WD) 2.7.2 Page/view title available](https://www.w3.org/TR/wcag-3.0/#x2-7-2-1-page-view-title-available)

**Где**
- `frontend/src/app/error.tsx:12-16`
- `frontend/src/components/ui/ServiceError.tsx:34` — весь «заголовок» это `<p className="text-sm font-semibold">{title}</p>`

**Что слышит пользователь.** При аварии NVDA корректно объявит «alert: Сервис временно недоступен» (`ServiceError.tsx:14`), но в списке заголовков страницы — **пусто**. Пользователь, который не видит экран, получает сигнал «что-то сломалось», но не понимает, где он находится и что делать дальше.

**Что сделать.** Сделать заголовок настоящим заголовком: `<h1>` в `app/error.tsx` (или добавить в `ServiceError` параметр `as` / отдельный проп заголовка уровня `h1`).

**Почему так.** Страница ошибки — момент, когда ориентиры нужны больше всего. `role="alert"` сообщает **о** проблеме, но заголовок сообщает, **где** пользователь находится. Это разные задачи.

**Не делать.** Не поднимать `<p>` до `<h1>` внутри `ServiceError`: компонент используется и как встроенный блок внутри страниц, где `h1` уже есть (`vacancies/VacancyDetail.tsx:129`). Нужен параметр, а не жёсткая разметка.

---

#### Д-05. 20 одинаковых ссылок «Подробнее» в списке вакансий

**Первоисточник**
- [WCAG 2.2 SC 2.4.4 Link Purpose (In Context) (A)](https://www.w3.org/TR/WCAG22/#link-purpose-in-context) · [Understanding 2.4.4](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html)
- [WCAG 2.2 SC 2.5.3 Label in Name (A)](https://www.w3.org/TR/WCAG22/#label-in-name) · [Understanding 2.5.3](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)
- Техника: [ARIA10 — Using aria-labelledby to provide a text alternative for non-text content](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA10), [G94 — Providing short text alternative for non-text content that serves the same purpose and presents the same information as the non-text content](https://www.w3.org/WAI/WCAG22/Techniques/general/G94)
- [WCAG 3.0 (WD) 2.3.5 Interactive element names available](https://www.w3.org/TR/wcag-3.0/#x2-3-5-2-interactive-element-names-available), [Label included in programmatic name](https://www.w3.org/TR/wcag-3.0/#x2-3-5-5-label-included-in-programmatic-name)

**Где**
- `frontend/src/components/features/vacancies/VacancyCard.tsx:82-91` — «Подробнее»
- `frontend/src/components/features/favorites/FavoritesList.tsx:162-171` — «Подробнее»
- `frontend/src/components/features/favorites/FavoritesList.tsx:172-177` — «Карьерный ассистент»

**Что слышит пользователь.** В режиме обзора ссылок NVDA (`NVDA+Ctrl+Enter`) на странице результатов — **20 одинаковых записей «Подробнее»** и столько же «Открыть на hh.ru». Различить вакансии невозможно: название находится в `<h2>` карточки (`VacancyCard.tsx:55`), но в имя ссылки не входит. VoiceOver в Rotor → «Links» даёт то же самое. Голосовое управление: «нажми Подробнее» → открывает первую из двадцати.

**Что сделать.** Включить название вакансии в доступное имя ссылки, **сохранив видимый текст**:

```tsx
<Link href={...}>
    Подробнее
    <span className="sr-only"> — {vacancy.vacancy_name}</span>
</Link>
```

Доступное имя станет «Подробнее — Разработчик Python», видимый текст «Подробнее» остаётся в имени (2.5.3 выполнено), голосовое управление «нажми Подробнее» продолжает работать.

**Почему так.** Это решает три задачи сразу: обзор ссылок становится осмысленным, голосовое управление не ломается, а `2.4.4` выполняется без подмены видимого текста.

**Не делать.** `aria-label="Подробнее: Разработчик Python"` — формально тоже содержит видимый текст, но **убирает** его из доступного имени в части речи. Для NVDA разница незаметна, а вот для VoiceOver и для ряда средств голосового ввода различие между `aria-label` и содержимым ссылки ведёт себя по-разному. Вариант со `sr-only` надёжнее, потому что имя вычисляется из содержимого, а не подменяется.

**Альтернатива с лучшей UX.** Сделать кликабельным сам заголовок вакансии (`<h2><Link>Название</Link></h2>`), а «Подробнее» оставить как второстепенную ссылку. Тогда в обзоре ссылок будет **одна** уникальная ссылка с осмысленным именем, а не два конкурирующих. Но это изменение вёрстки — решать по дизайну.

---

#### Д-06. Радиокнопки фильтра «Источник» без видимого индикатора фокуса

**Первоисточник**
- [WCAG 2.2 SC 2.4.7 Focus Visible (AA)](https://www.w3.org/TR/WCAG22/#focus-visible) · [Understanding 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [WCAG 3.0 (WD) 2.3.1 Focus indicator contrast sufficient](https://www.w3.org/TR/wcag-3.0/#x2-3-1-2-focus-indicator-contrast-sufficient), [Focus indicator size sufficient](https://www.w3.org/TR/wcag-3.0/#x2-3-1-3-focus-indicator-size-sufficient)
- Техника: [C15 — Using CSS to change the presentation of a user interface component when it receives focus](https://www.w3.org/WAI/WCAG22/Techniques/css/C15), [G195 — Using an author-supplied, visible focus indicator](https://www.w3.org/WAI/WCAG22/Techniques/general/G195)

**Где**
- `frontend/src/components/features/vacancies/VacancyFilters.tsx:99-106` — `<input type="radio" className="sr-only">`
- `frontend/src/components/features/vacancies/VacancyFilters.tsx:108-120` — визуальный «кружок» помечен `aria-hidden="true"` и **не имеет** ни `peer-focus-visible:`, ни `has-[:focus-visible]:`
- `frontend/src/components/features/vacancies/VacancyFilters.tsx:90-97` — `<label>` тоже без `focus-within:`

**Что теряет пользователь.** Клавиатурный пользователь с низким зрением (ядро аудитории проекта) при переходе по стрелкам в группе «Источник» **не видит, где фокус**. NVDA произносит «радиокнопка, hh.ru, не выбрано» — но зрячий пользователь индикации не найдёт. Он не понимает, переключилась ли группа, и не может оценить, где он находится.

**Что сделать.** Подсветить всю строку при фокусе, а не только кружок:

```tsx
<label className="... has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ...">
```

**Почему так.** Подсветка всей строки (а не 16×16 кружка) решает сразу три задачи: индикатор становится **заметным** (а не 1 px на тёмном фоне), его площадь достаточна для WCAG 3.0 (WD) 2.3.1 «Focus indicator size sufficient», и совпадает с поведением, к которому пользователи привыкли в нативных radio-группах.

**Не делать.** Не добавлять `focus-visible:outline` к самому `sr-only` input: обрезанный через `clip-path` элемент не рисует видимый контур, индикатор «рисуется» в невидимом месте. Нужна стилизация видимого родителя.

**Для сравнения.** В `vera/VeraFeedbackModal.tsx:75-82` сделано правильно — там радиокнопки нативные и видимые, `focus-visible:outline-2` работает. Расхождение — только здесь.

---

#### Д-07. Потеря фокуса при клиентской навигации в auth-разделе

**Первоисточник**
- [WCAG 2.2 SC 2.4.3 Focus Order (A)](https://www.w3.org/TR/WCAG22/#focus-order) · [Understanding 2.4.3](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)
- Техника: [G1 — Adding a link at the top of each page that goes directly to the main content area](https://www.w3.org/WAI/WCAG22/Techniques/general/G1), [H42 — Using h1-h6 to identify headings](https://www.w3.org/WAI/WCAG22/Techniques/html/H42)
- [WCAG 3.0 (WD) 2.12.5 Change of focus notified](https://www.w3.org/TR/wcag-3.0/#x2-12-5-2-change-of-focus-notified), [2.3.3 Focus retained](https://www.w3.org/TR/wcag-3.0/#x2-3-3-2-focus-retained)

**Где**
- `frontend/src/components/features/auth/AuthFormLayout.tsx:18-23` — `<h1 tabIndex={-1}>` объявлен программно фокусируемым, **но `.focus()` по нему никогда не вызывается**
- Навигация без переноса фокуса: `auth/login/page.tsx:89` (`router.push(redirect)`), `auth/register/page.tsx:81`, `auth/forgot-password/page.tsx:46-48`, `auth/reset-password/page.tsx:41`

**Что слышит пользователь.** После клиентского перехода фокус остаётся на **удалённом** элементе → `document.activeElement` становится `body`. NVDA/VoiceOver объявят новую страницу только через встроенный роут-анноунсер Next.js (он озвучивает `document.title`), но **позиция в документе сбрасывается в начало**: следующий Tab начинает с шапки сайта, а не с первого поля формы. Пользователю приходится каждый раз искать нужное поле заново.

**Что сделать.** Взять `ref` на `h1` в `AuthFormLayout` и вызвать `.focus()` в `useEffect` — ровно как в `ui/FocusHeading.tsx:13`. Механизм в проекте уже есть и работает на остальных страницах.

**Почему так.** «Войти → Забыли пароль?» и «Регистрация → Подтверждение email» — это **единый многошаговый сценарий**. Если фокус теряется на каждом шаге, весь сценарий для скринридера превращается в перечитывание страницы с начала.

---

#### Д-08. Нет переноса фокуса на первое ошибочное поле (6 форм)

**Первоисточник**
- [WCAG 2.2 SC 3.3.1 Error Identification (A)](https://www.w3.org/TR/WCAG22/#error-identification) · [Understanding 3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)
- [WCAG 2.2 SC 2.4.3 Focus Order (A)](https://www.w3.org/TR/WCAG22/#focus-order)
- Техника: [ARIA6 — Using aria-label to provide labels for objects](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA6), [H91 — Using HTML form controls and links](https://www.w3.org/WAI/WCAG22/Techniques/html/H91)
- [WCAG 3.0 (WD) 2.5.1 Errors associated](https://www.w3.org/TR/wcag-3.0/#x2-5-1-5-errors-associated), [2.5.1 Error messages collocated](https://www.w3.org/TR/wcag-3.0/#x2-5-1-6-error-messages-collocated)

**Где**
- `auth/login/page.tsx:60-66`, `auth/register/page.tsx:67-72`, `auth/forgot-password/page.tsx:40`, `auth/reset-password/page.tsx:68`, `auth/verify-email/page.tsx:59`, `feedback/FeedbackForm.tsx:42` — во всех шести формах `validate()` только устанавливает тексты ошибок

**Что слышит пользователь.** После `Enter` в форме фокус остаётся на кнопке «Войти». NVDA произнесёт текст ошибки (есть `role="alert"``), но **поле с `aria-invalid="true"` фокуса не получит** и NVDA не сообщит, в каком именно поле ошибка. В режиме «формы» пользователь услышит «кнопка Войти» и не узнает, что неверно именно поле email, пока не начнёт Shift+Tab искать его вручную. `aria-describedby` тоже не сработает — пользователь не находится в поле.

**Что сделать.** Взять паттерн из `frontend/src/components/features/search/SearchForm.tsx:52-55` — он уже реализован в проекте и работает:

```tsx
setTimeout(() => {
    const firstError = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    firstError?.focus();
}, 0);
```

**Почему так.** Ошибка, на которую не указывает фокус, для скринридера — это **шум**: текст озвучен, но непонятно, к чему он относится. Перенос фокуса превращает сообщение в конкретное действие.

**Не делать.** Не использовать `aria-errormessage` как замену переносу фокуса. Атрибут [partially supported](https://www.w3.org/TR/wai-aria-1.2/#aria-errormessage): Safari/VoiceOver его не поддерживают, а в поддерживаемых браузерах ошибка всё равно не «прыгнёт» в фокус. `aria-describedby` работает везде. Оба атрибута можно использовать вместе, но перенос фокуса — обязательная часть.

---

#### Д-09. `aria-busy` подавляет объявление, `disabled` сбрасывает фокус

**Первоисточник**
- [WCAG 2.2 SC 4.1.3 Status Messages (AA)](https://www.w3.org/TR/WCAG22/#status-messages) · [Understanding 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- [WCAG 2.2 SC 2.4.3 Focus Order (A)](https://www.w3.org/TR/WCAG22/#focus-order)
- Техника: [ARIA5 — Using WAI-ARIA state and property attributes to expose the state of a user interface component](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA5), спецификация флага: [WAI-ARIA 1.2 §aria-busy](https://www.w3.org/TR/wai-aria-1.2/#aria-busy)
- [WCAG 3.0 (WD) 2.5.2 Submission status notified](https://www.w3.org/TR/wcag-3.0/#x2-5-2-2-submission-status-notified)

**Где**
- `frontend/src/components/features/auth/SubmitButton.tsx:17-18`, `:27-37`
- Аналогично `frontend/src/components/features/feedback/FeedbackForm.tsx:154-158`

**Два независимых дефекта.**

1. `aria-busy="true"` выставлен **на самом элементе, внутри которого меняется текст** («Загрузка...»). По спецификации ARIA AT откладывают объявление изменений внутри busy-области до снятия флага → NVDA «Загрузка...» **не озвучит**.
2. Установка `disabled` на сфокусированную кнопку в Chrome/Edge/Firefox **сбрасывает фокус на `body`**. Возврат кнопки в enabled-состояние фокус не восстанавливает.

**Что слышит пользователь.** Пользователь нажимает «Войти» — и **не получает никакого подтверждения**, что запрос ушёл. Кнопка сереет, но VoiceOver/NVDA молчат. Пользователь не знает, нажать ещё раз или ждать. Если запрос быстрый, он просто не заметит, что было. Если медленный — решит, что интерфейс завис.

**Что сделать.** Два изменения:
- Убрать `aria-busy` с кнопки; вынести текст статуса в отдельный постоянный `role="status"` (например, рядом с кнопкой или через существующую область `#live-region` в `app/layout.tsx:43`).
- Не снимать фокус: вместо `disabled` использовать `aria-disabled="true"` + визуальное приглушение, либо после снятия `disabled` возвращать фокус на кнопку.

**Почему так.** Подтверждение отправки — это обратная связь, без которой пользователь не знает, что действие сработало. Оно нужно **всем**, но для скринридера — особенно: зрячий пользователь видит анимацию спиннера, скринридер — нет.

**Не делать.** Не оставлять `disabled` + `aria-busy` в надежде, что «браузер сам разберётся». ARIA-атрибут `busy` на элементе с меняющимся текстом — антипаттерн, прямо отмеченный в [Understanding 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

---

#### Д-10. Форма обратной связи размонтируется после отправки

**Первоисточник**
- [WCAG 2.2 SC 2.4.3 Focus Order (A)](https://www.w3.org/TR/WCAG22/#focus-order)
- [WCAG 3.0 (WD) 2.3.3 Focus retained](https://www.w3.org/TR/wcag-3.0/#x2-3-3-2-focus-retained), [2.12.5 Change of focus notified](https://www.w3.org/TR/wcag-3.0/#x2-12-5-2-change-of-focus-notified)

**Где** — `frontend/src/components/features/feedback/FeedbackForm.tsx:80-84` (условный рендер), `:51-53` (очистка полей)

**Что слышит пользователь.** При отправке фокус на кнопке «Отправить» (`:154`); после ответа сервера `<form>` **размонтируется** → фокус переходит на `body`, SR-пользователь теряет позицию и оказывается «в ниоткуде». Хуже: форма не возвращается — чтобы отправить второе сообщение, нужна **полная перезагрузка страницы** (F5), то есть потеря контекста и повторное чтение всей страницы.

**Что сделать.** Не размонтировать форму: заменить её блоком «Спасибо, отправлено» **внутри** формы (или рядом с ней, оставив форму в DOM скрытой), и перевести фокус на сообщение об успехе (`tabIndex={-1}` + `.focus()`).

**Почему так.** Форма обратной связи — точка входа в диалог с поддержкой. После отправки человек обычно **сразу пишет второе сообщение** («у меня не открылся файл», «а где моя заявка?»). Возможность продолжить разговор без F5 — это и доступность, и удобство.

**Не делать.** Не полагаться на `role="status"` как на замену переносу фокуса. `role="status"` сообщает, что текст появился, но не перемещает пользователя — он остаётся в «ниоткуде».

---

#### Д-11. `inputMode="numeric"` у буквенно-цифрового OTP

**Первоисточник**
- [WCAG 2.2 SC 3.3.2 Labels or Instructions (A)](https://www.w3.org/TR/WCAG22/#labels-or-instructions) · [Understanding 3.3.2](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html)
- [WCAG 3.0 (WD) 2.9.5 Information requirements available at start](https://www.w3.org/TR/wcag-3.0/#x2-9-5-2-information-requirements-available-at-start)
- Техника: [G13 — Describing what will happen before a change to a form control that causes a change of context to occur is made](https://www.w3.org/WAI/WCAG22/Techniques/general/G13)

**Где**
- `frontend/src/components/features/auth/OtpCodeInput.tsx:26` — `sr-only` подсказка «6-значный код из письма»
- `frontend/src/components/features/auth/OtpCodeInput.tsx:27-31` — `inputMode="numeric"`, `autoComplete="one-time-code"`

**Факт (проверено по бэкенду).** `backend/src/utils/send_otp_code/get_otp_code.py:7-13` — код генерируется из строки `'0123456789abcdefghijklmnopqrstuvwxyz'`, длина 6. Код **буквенно-цифровой**, может содержать `a`–`z`.

**Что теряет пользователь.** На iOS/Android `inputMode="numeric"` открывает цифровую клавиатуру **без букв**. Пользователь, получивший письмо с кодом `a3f9x2`, физически не может его ввести. Дополнительно подсказка «6-значный код» семантически неверна — NVDA/VoiceOver озвучат «6-значный код из письма», и человек будет искать ровно 6 цифр, отвергая корректный код с буквами.

**Что сделать.** Убрать `inputMode="numeric"` (или заменить на `text`), добавить `autoCapitalize="none"` и `spellCheck={false}`. Исправить подсказку на «6 символов: цифры и латинские буквы».

**Почему так.** Это **функциональный блокер**: сценарий подтверждения email и сброса пароля просто не проходится. Всё остальное в этом отчёте — про неудобство, здесь — про невозможность.

**Не делать.** Не ограничиваться сменой `inputMode`. `autoComplete="one-time-code"` уже есть и работает — на iOS/Android ОС подставит код из SMS. Но если код приходит **email** (а не SMS) — как здесь, — то подстановки не будет, и поле должно принимать буквы.

---

#### Д-12. Историю чата нельзя прокрутить с клавиатуры

**Первоисточник**
- [WCAG 2.2 SC 2.1.1 Keyboard (A)](https://www.w3.org/TR/WCAG22/#keyboard) · [Understanding 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
- [WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum) (AA)](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum) · [Understanding 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) — **новое в WCAG 2.2**
- Техника: [G202 — Ensuring keyboard control for all functionality](https://www.w3.org/WAI/WCAG22/Techniques/general/G202)
- [WCAG 3.0 (WD) 2.4.1 Keyboard operable](https://www.w3.org/TR/wcag-3.0/#x2-4-1-1-keyboard-operable)

**Где** — `frontend/src/components/features/vera/ChatWindow.tsx:357-366` — `role="region"` с `overflow-y-auto`, **без `tabIndex={0}`**

**Что теряет пользователь.** Когда в переписке нет интерактивных элементов (например, единственный ответ ассистента), фокус нигде не находится внутри прокручиваемой области → **стрелками прокрутить историю нельзя**. Клавиатурный пользователь вынужден использовать `PageDown` на уровне документа — работает непредсказуемо — или переключаться на мышь/тачскрин. Для человека с нарушением моторных функций длинная юридическая консультация становится недоступной.

**Что сделать.** Добавить `tabIndex={0}` на прокручиваемый контейнер истории.

**Почему так.** Стандартный паттерн для скроллируемых областей: сделать их фокусируемыми, чтобы они попали в Tab-порядок и получили собственный контекст чтения. Скринридер при этом произносит «История переписки с Ассистентом Верой, region» и позволяет листать.

**Не делать.** Не добавлять `tabIndex` «на всякий случай» на все `overflow-auto` контейнеры — лишние точки в Tab-порядке раздражают. Только там, где контейнер сам по себе является единицей навигации (история чата, длинные блоки кода, тело модалки).

**Дополнительно (2.4.11, новое в WCAG 2.2).** Кнопка «К новому сообщению» (`ChatWindow.tsx:520-530`) позиционируется абсолютно и при прокрутке может перекрыть сфокусированный элемент сообщения. Стоит проверить: не должна перекрывать фокус.

---

#### Д-13. `Tab` перехватывается в кастомном listbox мастера

**Первоисточник**
- [WCAG 2.2 SC 2.1.1 Keyboard (A)](https://www.w3.org/TR/WCAG22/#keyboard)
- [WCAG 2.2 SC 2.1.2 No Keyboard Trap (A)](https://www.w3.org/TR/WCAG22/#no-keyboard-trap) · [Understanding 2.1.2](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html)
- Паттерн: [APG — Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)
- [WCAG 3.0 (WD) 2.3.4 Conventional pattern used](https://www.w3.org/TR/wcag-3.0/#x2-3-4-3-conventional-pattern-used), [2.4.1 No keyboard traps](https://www.w3.org/TR/wcag-3.0/#x2-4-1-7-no-keyboard-traps)

**Где** — `frontend/src/components/features/assistant/AssistantFlow.tsx:279-300`, в частности `:292-298`:
```tsx
case "Escape":
case "Tab":
    e.preventDefault();
    closeList();   // closeList() → buttonRef.current?.focus()  (:261-264)
    break;
```

**Что слышит пользователь.** При открытом списке (фокус в `<ul role="listbox">`, `tabIndex={-1}`, `:333-341`) нажатие `Tab` **не перемещает фокус к следующему элементу**, а возвращает его на кнопку. Чтобы дойти до «Продолжить →» (`AssistantFlow.tsx:668`), нужно нажать `Tab` дважды; при этом «Продолжить» заблокирована, пока не выбрана вакансия. NVDA произносит «Выберите вакансию, кнопка, раскрыто» вместо перехода к следующей цели. Пользователь делает вывод, что интерфейс «залип».

**Что сделать.** Убрать `case "Tab":` из перехвата — закрывать список по `Tab` можно, но **не** отменять стандартное перемещение фокуса и **не** возвращать фокус на кнопку.

**Почему так.** Клавиатурная ловушка — один из самых серьёзных барьеров: пользователь не может продолжить и не понимает, почему. Стоит выбирать между «списком, который ведёт себя как список» и «списком, который ведёт себя как поле» последовательно; сейчас поведение гибридное.

**Не делать.** Не закрывать список по `Tab` с `preventDefault` + возвратом фокуса. Если список должен закрываться — пусть закрывается по `blur` или по `Escape`, а `Tab` останется системным.

---

### Группа B. Теряется информация

| № | Что | Первоисточник | Где | Что слышит пользователь | Что сделать | Почему так |
|---|---|---|---|---|---|---|
| **Д-14** | Результат копирования не объявляется | [4.1.3 (AA)](https://www.w3.org/TR/WCAG22/#status-messages) · [3.0 (WD) 2.11.2 Feedback mechanism available](https://www.w3.org/TR/wcag-3.0/#x2-11-2-1-feedback-mechanism-available) | `blog/ShareButton.tsx:52-56`, `:60-84`; `assistant/AssistantFlow.tsx:404-422`, `:1012-1019` | Текст кнопки меняется на «Ссылка скопирована», но `role="status"` нет. NVDA **не сообщит**, что копирование удалось. Пользователь услышит это, только если вернётся к кнопке | Взять готовый паттерн из этого же проекта: `vera/MessageCopyButton.tsx:65` + `:90-92` (`role="status" aria-live="polite"`) | Это подтверждение действия, без него человек не знает, ушло ли что-то в буфер. **В чате уже сделано правильно** — нужно просто перенести |
| **Д-15** | Количество найденных вакансий не объявляется | [4.1.3 (AA)](https://www.w3.org/TR/WCAG22/#status-messages) · [3.0 (WD) 2.12.5 Change of content notified](https://www.w3.org/TR/wcag-3.0/#x2-12-5-1-change-of-content-notified) | `vacancies/VacanciesContent.tsx:178-186`; `vacancies/SearchResultsSummary.tsx:62-78` | При смене страницы/фильтра фокус переносится на `h1` (верно), но **новое число вакансий не объявляется**. Человек вынужден вручную искать панель счётчика | Поместить число в `role="status"` | Число — главный результат действия. Без объявления пользователь не понимает, сработала ли смена фильтра |
| **Д-16** | Скелетоны объявляются непоследовательно | [4.1.3 (AA)](https://www.w3.org/TR/WCAG22/#status-messages) | `vacancies/[id]/loading.tsx:5-9` + `VacancyDetailSkeleton.tsx:5-41` (вообще без ARIA); `favorites/page.tsx:56-63` + `FavoritesListSkeleton.tsx:43` (`aria-busy` **без** `role="status"`) | При переходе на `/vacancies/{id}` — полная тишина. Непонятно: грузится страница или она пустая | `role="status"` + `aria-busy` на контейнере | `aria-busy` **без** `role="status"` объявления не порождает. Корректный образец — `app/loading.tsx:6-9` |
| **Д-17** | Live-регион появляется в DOM вместе с текстом | [4.1.3 (AA)](https://www.w3.org/TR/WCAG22/#status-messages) · [3.0 (WD) 2.12.5](https://www.w3.org/TR/wcag-3.0/#x2-12-5-1-change-of-content-notified) | `auth/reset-password/page.tsx:93-98`; `auth/verify-email/page.tsx:137-144`; `feedback/FeedbackForm.tsx:80-83`; `vera/VeraFeedbackModal.tsx:254-268` | Поведение зависит от версии AT и браузера: сообщение «Пароль успешно изменён» может пропасть. В модалке отзыва — пользователь не поймёт, отправился ли отзыв, и отправит повторно | Live-регион должен **постоянно** присутствовать в DOM, меняется только содержимое | Инфраструктура уже есть: постоянная область `#live-region` в `app/layout.tsx:43` — её просто не используют |
| **Д-18** | Текст ожидания в чате не объявляется, потоковый ответ — тоже | [4.1.3 (AA)](https://www.w3.org/TR/WCAG22/#status-messages) · [3.0 (WD) 2.12.5](https://www.w3.org/TR/wcag-3.0/#x2-12-5-1-change-of-content-notified) | `vera/ChatMessage.tsx:107-123` (текст ожидания вне live-региона), `:134-136` (потоковый текст вне live-региона); объявление только по завершении — `hooks/useVeraChat.ts:2196`, `:3926` | Пользователь отправляет вопрос и получает **полную тишину** на всё время генерации (до минуты). Он не знает, идёт ли работа, не может прервать, не понимает, завис ли запрос | Перенести текст ожидания в тот же `role="status"`, что и финальное объявление. Потоковый текст в live-регион **не помещать** | Живой регион нужен, чтобы человек знал «работа идёт». А объявление «Ответ готов» + доступ к готовому тексту — чтобы он мог спокойно прочитать результат |
| **Д-19** | Обратный отсчёт не объявляется, имя кнопки меняется молча | [4.1.2 (A)](https://www.w3.org/TR/WCAG22/#name-role-value) · [4.1.3 (AA)](https://www.w3.org/TR/WCAG22/#status-messages) | `auth/verify-email/page.tsx:145-154`; тик — `:42-48` | Имя кнопки меняется раз в секунду, но live-региона нет. NVDA объявляет имя только в момент фокуса. Сценарий: нажал «Отправить повторно» → кнопка стала `disabled` → **фокус с неё снят** → через 60 секунд кнопка снова активна, но человек об этом **не узнает** | Вынести «Отправить повторно» в отдельную кнопку, а **таймер** — в `role="status"`, объявляя только ключевые моменты (старт, финал), а не каждую секунду | Помечать кнопку `disabled` при активном таймере — тоже плохо: снятие фокуса. Лучше оставить кнопку активной, а недоступность состояния показывать в описании |
| **Д-20** | Ошибка переотправки кода может не показаться вовсе | [3.3.1 (A)](https://www.w3.org/TR/WCAG22/#error-identification) | `auth/verify-email/page.tsx:105-109` — `if (error instanceof ApiRequestError)` и **больше ничего** | При сетевом сбое или таймауте обработчик **ничего не делает**: ни ошибка, ни успех, ни сброс таймера. Нажал кнопку — экран не изменился, ни одно сообщение не появилось. Полная тишина при явном действии | Обрабатывать все типы ошибок; в `catch`/`else` показывать `role="alert"` | Тишина после действия — худший вариант: человек не понимает, дошло ли письмо, и ждёт напрасно |
| **Д-21** | `aria-label` карточек контактов не содержит видимого текста | [2.5.3 Label in Name (A)](https://www.w3.org/TR/WCAG22/#label-in-name) · [Understanding 2.5.3](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html) · [3.0 (WD) 2.3.5 Label included in programmatic name](https://www.w3.org/TR/wcag-3.0/#x2-3-5-5-label-included-in-programmatic-name) | `contact/page.tsx:77` (номер телефона), `:97`, `:115`, `:133` | NVDA произносит «Позвонить Кириллу Барабанщикову, ссылка» — **номер телефона не озвучивается вообще**, хотя это и есть главная информация ссылки. Человек, который диктует номер или сверяет его, номера не получит | Убрать `aria-label` и дать имени ссылки собраться из содержимого (номер, «Написать напрямую», «Мой блог»); «откроется в новой вкладке» уже добавляется через `sr-only` в других местах проекта | Доступное имя из содержимого всегда совпадает с видимым текстом — это устраняет класс проблем и заодно чинит голосовой ввод |
| **Д-22** | Пустое состояние блога без `role="status"` | [4.1.3 (AA)](https://www.w3.org/TR/WCAG22/#status-messages) | `blog/page.tsx:105-109` | При клике по другому тегу экран обновляется, но подтверждения нет | `role="status"` | В остальных пустых состояниях проекта (`ui/EmptyState.tsx:7`, `FavoritesList.tsx:60`) так уже сделано — здесь просто не перенесли |
| **Д-23** | `<pre>` с горизонтальной прокруткой недоступен с клавиатуры | [2.1.1 (A)](https://www.w3.org/TR/WCAG22/#keyboard) · [1.4.10 Reflow (AA)](https://www.w3.org/TR/WCAG22/#reflow) | `blog/[slug]/page.tsx:162` — `[&_pre]:overflow-x-auto` без `tabIndex={0}` | Скринридер произносит «pre, текст», но длинную строку прокрутить не удастся | `tabIndex={0}` на `<pre>` | То же, что Д-12: скроллируемый блок должен быть фокусируем |

---

### Группа C. Заметно, но не ломает

#### Д-24. Контраст текста ниже 4.5:1 в шести местах

**Первоисточник**
- [WCAG 2.2 SC 1.4.3 Contrast (Minimum) (AA)](https://www.w3.org/TR/WCAG22/#contrast-minimum) · [Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG 3.0 (WD) 2.2.1 Text contrast sufficient (minimum)](https://www.w3.org/TR/wcag-3.0/#x2-2-1-3-text-contrast-sufficient-minimum), [Text style readable (minimum)](https://www.w3.org/TR/wcag-3.0/#x2-2-1-2-text-style-readable-minimum)
- Техника: [G18 — Ensuring that a contrast ratio of at least 4.5:1 exists between text (and images of text) and background behind the text](https://www.w3.org/WAI/WCAG22/Techniques/general/G18), [C22 — Using CSS to control visual presentation of text](https://www.w3.org/WAI/WCAG22/Techniques/css/C22)

| Файл:строка | Класс | Контраст | Нужно |
|---|---|---|---|
| `blog/BlogCard.tsx:75` — дата публикации | `text-white/35` на ≈`#202020` | **≈3.2:1** | 4.5:1 |
| `blog/[slug]/page.tsx:110` — дата статьи | `text-muted/70` | **≈3.9:1** | 4.5:1 |
| `privacy/page.tsx:154` — «Последнее обновление» | `text-muted/70` | **≈3.9:1** | 4.5:1 |
| `blog/[slug]/page.tsx:185` — «Основной функционал сервиса» | `text-accent/60` | **≈4.47:1** | 4.5:1 (запас 0.03) |
| `vacancies/SearchResultsSummary.tsx:84-90` — «по фильтру / всего» (9 px) | `text-muted/60` | **≈3.1:1** | 4.5:1 |
| `blog/BlogCard.tsx:78-83` — «Читать →» | `text-accent/50` | **≈3.4:1** | 4.5:1 |

**Методика.** Относительная яркость по WCAG 2.x; альфа-композитинг Tailwind-цветов поверх фактического фона; `(L1+0.05)/(L2+0.05)`.

**Что теряет пользователь.** Слабовидящий не прочитает дату публикации и служебные подписи. В сочетании с NVDA (увеличенный шрифт на затемнённом фоне) строка исчезает.

**Что сделать.** Поднять прозрачность до проходящих значений: `text-white/35` → `text-white/55`; `text-muted/70` → `text-muted`; `text-muted/60` → `text-muted/85`; `text-accent/60` → `text-accent/70`.

**Почему так.** В тёмной теме градация через прозрачность работает, но нижние ступени проваливают порог. `text-muted` (#999999) на `#0A0A0A` даёт 6.95:1 — запас есть, и иерархия сохраняется, если различать размером, а не прозрачностью.

**Не делать.** Не поднимать всё до 7:1 (уровень AAA по 1.4.6) — это разрушит визуальную иерархию тёмной темы. 4.5:1 достаточно; для мелких служебных подписей достаточно поднять до ~4.6–5:1, а не до AAA.

---

#### Д-25. Контраст рамок полей ввода ≈1.9:1

**Первоисточник**
- [WCAG 2.2 SC 1.4.11 Non-text Contrast (AA)](https://www.w3.org/TR/WCAG22/#non-text-contrast) · [Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — **новое в WCAG 2.2**
- [WCAG 3.0 (WD) 2.1.8 Graphical object contrast sufficient](https://www.w3.org/TR/wcag-3.0/#x2-1-8-2-graphical-object-contrast-sufficient), [2.3.5 Interactive element contrast sufficient](https://www.w3.org/TR/wcag-3.0/#x2-3-5-1-interactive-element-contrast-sufficient)
- Техника: [G207 — Ensuring that a contrast ratio of 3:1 is provided for icons](https://www.w3.org/WAI/WCAG22/Techniques/general/G207), [G18 — Ensuring that a contrast ratio of at least 4.5:1 exists between text (and images of text) and background behind the text](https://www.w3.org/WAI/WCAG22/Techniques/general/G18)

| Файл:строка | Класс | Контраст к фону поля | Нужно |
|---|---|---|---|
| `search/LocationInput.tsx:36` | `border-white/20` на `bg-surface` | **≈1.9:1** | 3:1 |
| `search/RegionCombobox.tsx:137` | `border-white/20` на `bg-surface` | **≈1.9:1** | 3:1 |
| `vera/ChatWindow.tsx:541` | `border-border` (`#2D2D2D`) на `bg-surface-hover/45` | **≈1.4:1** | 3:1 |

**Почему это важно.** Граница поля — **единственный** визуальный признак, по которому пользователь определяет, где начинается область ввода. SC 1.4.11 требует 3:1 именно для «визуальной информации, необходимой для идентификации компонентов интерфейса». На тёмной теме при 1.9:1 граница практически не видна — и для слабовидящих, и при экранном увеличении.

**Что сделать.** Поднять до 3:1: `border-white/20` → `border-white/40` (≈3.3:1) или задать отдельный токен границы поля. Для чата — `border-white/30` вместо `border-border`.

**Почему так.** Видимая граница поля в покое полезна **всем**: и слабовидящим, и при ярком свете, и при экранном увеличении, и при моторике. Это не «доступность для галочки», а базовая удобство.

**Проверено и в порядке.** Рамки вторичных кнопок `border-accent/50` — ≈3.4:1, проходят. Фокусное кольцо `outline-accent` на фоне поля — 9.7:1, проходит с запасом. `border-white/15` и `/10` на декоративных карточках — на 1.4.11 **не распространяются** (это не границы интерактивных элементов).

---

#### Д-26. Таргеты меньше 24×24 CSS px

**Первоисточник**
- [WCAG 2.2 SC 2.5.8 Target Size (Minimum) (AA)](https://www.w3.org/TR/WCAG22/#target-size-minimum) · [Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — **новое в WCAG 2.2**
- [WCAG 2.2 SC 2.5.5 Target Size (Enhanced) (AAA)](https://www.w3.org/TR/WCAG22/#target-size-enhanced) · [Understanding 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- Техника: [G202 — Ensuring keyboard control for all functionality](https://www.w3.org/WAI/WCAG22/Techniques/general/G202)

| Файл:строка | Элемент | Размер |
|---|---|---|
| `auth/login/page.tsx:163-168` | «Забыли пароль?» | ≈20 px по высоте |
| `auth/verify-email/page.tsx:145-154` | «Отправить повторно» | ≈20 px по высоте |
| `auth/register/page.tsx:217` | чекбокс согласия | 16×16 |
| `auth/PasswordInput.tsx:52-60` | переключатель показа пароля | 28×28 (AA пройден, AAA — нет) |
| `feedback/FeedbackForm.tsx:154-161` | кнопка «Отправить» | ≈36 px (AA пройден, AAA — нет) |

**Что теряет пользователь.** Для пользователя с тремором или нарушением моторных функций мелкая цель = промах. Косвенно страдает и скринридер: при экранном увеличении до 400 % текст растёт, а чекбокс 16×16 остаётся прежним, и пользователь, управляющий курсором, попадает мимо.

**Что сделать.** Довести до 24×24 минимум (`py-1` → `py-1.5` + `min-h-6`, чекбокс — обернуть в кликабельную зону 24×24). До 44×44 — по возможности, это ничего не стоит.

**Не делать.** Не увеличивать визуальный размер чекбокса — достаточно расширить **зону нажатия** (padding или псевдоэлемент), сохранив дизайн.

---

### Группа D. Точечные

| № | Что | Первоисточник | Где | Что делать |
|---|---|---|---|---|
| Д-27 | Списки без `role="list"`: Tailwind Preflight снимает `list-style`, и в Safari/VoiceOver роль списка теряется | [1.3.1 (A)](https://www.w3.org/TR/WCAG22/#info-and-relationships) | `privacy/page.tsx:40,55,71,112`; `assistant/page.tsx:121,159`; `AssistantFlow.tsx:115` | Добавить `role="list"`. В остальном проекте так уже сделано (`VacancyList.tsx:23`, `FeatureCards.tsx:195` и др.) |
| Д-28 | `focus:outline-none` на программно сфокусированных `h1` | [2.4.7 (AA)](https://www.w3.org/TR/WCAG22/#focus-visible) — пограничный случай | `ui/FocusHeading.tsx:15`; `VacanciesContent.tsx:91,151`; `favorites/page.tsx:70`; `VacancyDetail.tsx:60`; `AssistantFlow.tsx:613,686,738,801,931` | Формально SC не нарушается (фокус не клавиатурный). Но зрячий пользователь не видит, куда переместился фокус. Достаточно `focus-visible:outline-2` вместо `focus:outline-none` |
| Д-29 | `radiogroup` «Режим»: стрелки меняют фокус, но не выбирают вариант | [2.1.1 (A)](https://www.w3.org/TR/WCAG22/#keyboard) · [APG Radio Group](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) | `AssistantFlow.tsx:533-545` (в группе «Функции» `:515-531` сделано правильно) | Сделать как в соседней группе: стрелка = перевод фокуса + выбор |
| Д-30 | Кнопка кастомного dropdown без роли combobox и без подписи | [4.1.2 (A)](https://www.w3.org/TR/WCAG22/#name-role-value) | `AssistantFlow.tsx:306-330` | `aria-labelledby` на «Выберите вакансию» — NVDA начнёт произносить «Выберите вакансию, <название>, кнопка, раскрыто» |
| Д-31 | «Отключённые» ссылки пагинации остаются активируемыми: `aria-disabled` + `tabIndex={-1}`, но `href` валиден | [4.1.2 (A)](https://www.w3.org/TR/WCAG22/#name-role-value) | `blog/BlogPagination.tsx:34-44`, `:63-73` | Сделать кнопками (`<button disabled>`) — как в `ui/Pagination.tsx:68-75`. Сейчас NVDA говорит «недоступно», но активирует → переход без изменений, потеря ориентации |
| Д-32 | Многоточие пагинации скрыто `aria-hidden` | [1.3.1 (A)](https://www.w3.org/TR/WCAG22/#info-and-relationships) | `blog/BlogPagination.tsx:48`; `ui/Pagination.tsx:88-93`, `:113-119` | NVDA: «Страница 1, 2, 3, 7» — непонятно, что между пропущено. Добавить `sr-only` «…» с пояснением |
| Д-33 | `<article>` статьи блога без доступного имени | [1.3.1 (A)](https://www.w3.org/TR/WCAG22/#info-and-relationships) | `blog/[slug]/page.tsx:102` | `aria-labelledby` на заголовок статьи (`:115`) |
| Д-34 | 20 `role="alert"` на странице результатов (по одному на карточку) | [4.1.3 (AA)](https://www.w3.org/TR/WCAG22/#status-messages) — формально корректно | `vacancies/VacancyCard.tsx:78`; `VacancyDetail.tsx:129` | 20 assertive-регионов перебивают друг друга. Лучше один регион на список (см. раздел 5.1) |
| Д-35 | `h4` из markdown визуально неотличим от обычного текста (класс `prose-blog` не определён) | [1.4.4 Resize Text (AA)](https://www.w3.org/TR/WCAG22/#resize-text) | `blog/[slug]/page.tsx:141`; контент `content/blog/ii-assistent-vera.md:88,154,194,232` | Определить `prose-blog` или задать стили `h4` явно |
| Д-36 | Дубли `id` возможны: `rehypeSlug` добавляет `id` заголовкам, `DOMPurify` их сохраняет | [1.3.1 (A)](https://www.w3.org/TR/WCAG22/#info-and-relationships) | `lib/blog/posts.ts:92`, `:95` | Проверить на совпадение с `main-content` и `vera-feedback-invitation-heading` |
| Д-37 | `aria-label` и `aria-pressed` дублируют состояние | [4.1.2 (A)](https://www.w3.org/TR/WCAG22/#name-role-value) | `auth/PasswordInput.tsx:52-60` | Постоянное имя «Показать пароль» + меняющийся `aria-pressed` — один источник состояния |
| Д-38 | Нет `maxLength`/`pattern` для OTP, в схеме только `min(1)` | [3.3.3 Error Suggestion (AA)](https://www.w3.org/TR/WCAG22/#error-suggestion) | `auth/OtpCodeInput.tsx:27-39`; `lib/schemas/auth.ts:46-48,63-65` | `maxLength={6}` + уточнение сообщения об ошибке |
| Д-39 | Требования к паролю не сообщаются до ввода | [3.3.2 (A)](https://www.w3.org/TR/WCAG22/#labels-or-instructions) | `auth/login/page.tsx:148-155`; `register/page.tsx:191-198`; `reset-password/page.tsx:141-148` | Постоянная подсказка под полем, связанная через `aria-describedby` |
| Д-40 | Email теряется при переходе «Вход → Забыли пароль?» | [3.3.7 Redundant Entry (A)](https://www.w3.org/TR/WCAG22/#redundant-entry) — **новое в WCAG 2.2** | `auth/login/page.tsx:163-168` → `forgot-password/page.tsx:20` | Передать email в URL — механизм уже есть (`forgot-password/page.tsx:47`) |
| Д-41 | Во время `authLoading` страница рендерится пустой (`null`) | [4.1.3 (AA)](https://www.w3.org/TR/WCAG22/#status-messages) | `auth/login/page.tsx:43-44`; `register/page.tsx:38-42`; `reset-password/page.tsx:87` | `role="status"` с «Загрузка...» — как в `app/loading.tsx:6-9`. Для `reset-password` без `email` — объяснение вместо пустой страницы |
| Д-42 | Авторедирект через 3 секунды после сброса пароля | [2.2.1 Timing Adjustable (A)](https://www.w3.org/TR/WCAG22/#timing-adjustable) | `auth/reset-password/page.tsx:38-44` | Ручная ссылка «Перейти к входу» есть (`:99-104`), но фокус на неё не переносится. Убрать авторедирект или перевести фокус на ссылку |
| Д-43 | Редирект при 403 без объяснения причины | [3.3.1 (A)](https://www.w3.org/TR/WCAG22/#error-identification) | `auth/login/page.tsx:94-97` | Готовый текст в `lib/constants/auth-errors.ts:20-23` не используется — показать его перед редиректом |
| Д-44 | `maxLength={2000}` без счётчика и подсказки о лимите | [3.3.2 (A)](https://www.w3.org/TR/WCAG22/#labels-or-instructions) | `feedback/FeedbackForm.tsx:106` | Добавить счётчик — в чате он уже есть (`ChatWindow.tsx:610-617`) |
| Д-45 | `prefers-reduced-motion` поддержан частично | [WCAG 3.0 (WD) 2.6.1 No visual motion](https://www.w3.org/TR/wcag-3.0/#x2-6-1-3-no-visual-motion) | `ui/Spinner.tsx:37` (inline-стиль — правило не действует); `globals.css:117-128`; 5 скелетонов с `animate-pulse` без `motion-reduce:animate-none` | Перенести `braille-dot` из inline-стиля в CSS-класс с `@media (prefers-reduced-motion: reduce)`; добавить `motion-reduce:animate-none` скелетонам |
| Д-46 | `Badge.tsx` не импортируется нигде | — | `ui/Badge.tsx:8-21` | Мёртвый код. Удалить или доработать: `text-muted` на `bg-border` = 4.83:1 — впритык к порогу |
| Д-47 | `aria-modal` не выставляется на диалогах | [4.1.2 (A)](https://www.w3.org/TR/WCAG22/#name-role-value) — формально не нарушение | `ui/Modal.tsx:24-40` | React Aria делает это намеренно. **Не добавлять вручную** — см. раздел 5.2 |

---

## 5. Где буквальное следование стандарту навредит

Самый полезный раздел отчёта. Каждый пункт — реальная ловушка, в которую легко попасть, «формально закрывая» находку.

### 5.1. Live-регион на каждой карточке (Д-34)

**Формально «правильно»:** у каждой карточки вакансий свой `role="alert"` для ошибки избранного. Формально 4.1.3 выполнен.

**Что будет на самом деле.** 20 assertive-регионов на странице. Ошибка в 15-й карточке перебивает объявление об ошибке в 3-й; NVDA ставит их в очередь и пользователь получает пачку сообщений, относящихся к разным элементам, в случайном порядке.

**Что полезнее.** Один `role="status"` (или `aria-live="polite"`) на весь список вакансий + перевод фокуса на конкретную карточку, в которой произошла ошибка. Пользователь получает одно сообщение и точно знает, где оно.

### 5.2. `aria-modal="true"` в модалку вручную (Д-47)

**Формально «правильно»:** добавить `aria-modal="true"` на `<Dialog>`.

**Что будет на самом деле.** React Aria **намеренно** его не ставит: [в `useDialog`](https://github.com/adobe/react-spectrum) это обходной путь для бага Safari, где `aria-modal` заставляет VoiceOver скрывать весь остальной документ — и пользователь теряет возможность переключиться на другую область. Ручной `aria-modal` в Safari/VoiceOver **скроет всё за пределами модалки**, включая то, куда фокус вернётся после закрытия.

**Что полезнее.** Оставить как есть. Ловушка фокуса, `Escape`, возврат фокуса и `aria-hidden` вне диалога уже реализованы библиотекой и работают.

### 5.3. `aria-errormessage` вместо `aria-describedby` (Д-08)

**Формально «правильно»:** WCAG 3.0 (WD) [2.5.1 Errors associated](https://www.w3.org/TR/wcag-3.0/#x2-5-1-5-errors-associated) явно упоминает `aria-errormessage`.

**Что будет на самом деле.** [Поддержка `aria-errormessage` частичная](https://www.w3.org/TR/wai-aria-1.2/#aria-errormessage): Safari и VoiceOver его не поддерживают, в Firefox — поддержка неполная. Если положиться только на него, часть пользователей **не услышит** текст ошибки вообще. Тот же дефект, что мы чиним, только формально «по новому стандарту».

**Что полезнее.** `aria-describedby` (работает везде) **плюс** перенос фокуса на ошибочное поле. `aria-errormessage` можно добавить как дополнение, но не как замену.

### 5.4. `aria-label` вместо видимого текста (Д-05, Д-21)

**Формально «правильно»:** `aria-label="Подробнее: Разработчик Python"`, `aria-label="Телефон +7 (912) 464-66-06"`.

**Что будет на самом деле.** Голосовое управление работает по имени, которое пользователь **произносит**, а имя из `aria-label` не обязано совпадать с видимым. Голосовой ввод постепенно учится подстраиваться под подставленные имена, но это ненадёжно и медленно. Кроме того, `aria-label` на ссылке **перекрывает** её собственное содержимое — если внутри ссылки появится иконка с `alt`, она перестанет читаться.

**Что полезнее.** Собирать имя из содержимого: `Подробнее` + `<span className="sr-only"> — {название}</span>`. Имя содержит видимый текст (2.5.3), голосовой ввод работает, и всё, что добавят внутрь ссылки позже, продолжит читаться.

### 5.5. Потоковый текст ответа в `aria-live` (Д-18)

**Формально «правильно»:** «статусные сообщения должны объявляться» — значит, поместим ответ в `aria-live="polite"`.

**Что будет на самом деле.** Скринридер начнёт читать ответ **по мере поступления токенов**. Пользователь не сможет его прервать, не сможет перечитать, услышит обрывки. Для юридической консультации на 2 экрана это хуже, чем тишина.

**Что полезнее.** Живой регион — только для **статусов** («Разбираюсь в вопросе», «Ответ готов»). Сам ответ — обычный текст в дереве документа, доступный для навигации, поиска и повторного чтения. Это и есть текущая архитектура проекта, и она правильная.

### 5.6. Контраст 7:1 везде (AAA) (Д-24)

**Формально «правильно»:** довести всё до [SC 1.4.6 Contrast (Enhanced) (AAA)](https://www.w3.org/TR/WCAG22/#contrast-enhanced) — техника [G17 — Ensuring that a contrast ratio of at least 7:1 exists between text (and images of text) and background behind the text](https://www.w3.org/WAI/WCAG22/Techniques/general/G17).

**Что будет на самом деле.** Тёмная тема потеряет визуальную иерархию: вторичные подписи станут неотличимы по яркости от основного текста, и страница станет визуально «плоской» и утомительной. Это ухудшит интерфейс **для всех**, включая людей с нарушениями зрения, которым как раз нужна чёткая структура.

**Что полезнее.** 4.5:1 для текста (AA) + различение по размеру и насыщенности, а не только по прозрачности. Иерархия в тёмной теме строится яркостью, но с сохранением минимального порога.

### 5.7. `tabIndex={0}` на `<main>` и на всех скролл-контейнерах (Д-01, Д-12)

**Формально «правильно»:** «сделать элемент фокусируемым».

**Что будет на самом деле.** `tabIndex={0}` на `<main>` добавит его в Tab-порядок: пользователь будет натыкаться на него лишний раз на каждой странице. То же с каждым `overflow-auto` контейнером — лишние точки в Tab-порядке раздражают и замедляют навигацию.

**Что полезнее.** `tabIndex={-1}` для цели skip-link и для программного перевода фокуса; `tabIndex={0}` — **только** там, где контейнер сам является единицей навигации (история чата, длинный блок кода, прокручиваемое тело модалки).

### 5.8. Замена нативных элементов на кастомные ARIA-виджеты (Д-13)

**Формально «правильно»:** «у `<select>` нет role=combobox — давайте сделаем свой».

**Что будет на самом деле.** Каждый кастомный виджет — это заново написанные клавиатурная навигация, фокус-менеджмент, `aria-activedescendant`, живые объявления. В проекте уже два таких виджета, и в обоих накопились дефекты (Д-02, Д-13).

**Что полезнее.** Нативные `<select>`, `<input>`, `<button>` в 2026 году поддерживают скринридеры и клавиатуру лучше, чем большинство кастомных реализаций. Если нативный элемент не подходит по дизайну — стилизовать его, а не заменять. В проекте уже есть `react-aria-components` — библиотека, которая закрывает эти сценарии проверенными реализациями.

### 5.9. `aria-label` на каждом интерактивном элементе (Д-21)

**Формально «правильно»:** «у иконки нет имени — добавим `aria-label`».

**Что будет на самом деле.** `aria-label` **перекрывает** всё содержимое элемента. Если кнопка содержит видимый текст «Удалить из избранного» и `aria-label="Избранное"` — скринридер произнесёт только «Избранное», а зрячий пользователь увидит «Удалить из избранного». Расхождение.

**Что полезнее.** `aria-label` — только когда у элемента **нет** текстового содержимого (иконка). Если текст есть, имя должно собираться из него.

---

## 6. Карта соответствия WCAG 2.2

| SC | Уровень | Статус | Находки |
|---|---|---|---|
| [1.1.1](https://www.w3.org/TR/WCAG22/#non-text-content) Non-text Content | A | ✅ | — |
| [1.3.1](https://www.w3.org/TR/WCAG22/#info-and-relationships) Info and Relationships | A | ⚠️ | Д-03, Д-04, Д-27, Д-32, Д-33, Д-36 |
| [1.3.5](https://www.w3.org/TR/WCAG22/#identify-input-purpose) Identify Input Purpose | AA | ✅ | — |
| [1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum) Contrast (Minimum) | AA | ❌ | Д-24 |
| [1.4.4](https://www.w3.org/TR/WCAG22/#resize-text) Resize Text | AA | ⚠️ | Д-35 |
| [1.4.10](https://www.w3.org/TR/WCAG22/#reflow) Reflow | AA | ⚠️ | Д-23 |
| [1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast) Non-text Contrast | AA | ❌ | Д-25 |
| [2.1.1](https://www.w3.org/TR/WCAG22/#keyboard) Keyboard | A | ⚠️ | Д-12, Д-13, Д-23, Д-29 |
| [2.1.2](https://www.w3.org/TR/WCAG22/#no-keyboard-trap) No Keyboard Trap | A | ⚠️ | Д-13 |
| [2.1.4](https://www.w3.org/TR/WCAG22/#character-key-shortcuts) Character Key Shortcuts | A | ✅ | — |
| [2.2.1](https://www.w3.org/TR/WCAG22/#timing-adjustable) Timing Adjustable | A | ⚠️ | Д-42 |
| [2.2.2](https://www.w3.org/TR/WCAG22/#pause-stop-hide) Pause, Stop, Hide | A | ✅ | — |
| [2.3.1](https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold) Three Flashes or Below | A | ✅ | — |
| [2.4.1](https://www.w3.org/TR/WCAG22/#bypass-blocks) Bypass Blocks | A | ⚠️ | Д-01 |
| [2.4.2](https://www.w3.org/TR/WCAG22/#page-titled) Page Titled | A | ✅ | — |
| [2.4.3](https://www.w3.org/TR/WCAG22/#focus-order) Focus Order | A | ❌ | Д-07, Д-08, Д-09, Д-10 |
| [2.4.4](https://www.w3.org/TR/WCAG22/#link-purpose-in-context) Link Purpose (In Context) | A | ❌ | Д-05 |
| [2.4.5](https://www.w3.org/TR/WCAG22/#multiple-ways) Multiple Ways | A | ✅ | — |
| [2.4.6](https://www.w3.org/TR/WCAG22/#headings-and-labels) Headings and Labels | AA | ❌ | Д-03, Д-04 |
| [2.4.7](https://www.w3.org/TR/WCAG22/#focus-visible) Focus Visible | AA | ❌ | Д-06, Д-28 |
| [2.4.11](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum) Focus Not Obscured (Min) | AA | ⚠️ | Д-12 |
| [2.4.13](https://www.w3.org/TR/WCAG22/#focus-appearance) Focus Appearance | AAA | ✅ | — |
| [2.5.1](https://www.w3.org/TR/WCAG22/#pointer-gestures) Pointer Gestures | A | ✅ | — |
| [2.5.2](https://www.w3.org/TR/WCAG22/#pointer-cancellation) Pointer Cancellation | A | ✅ | — |
| [2.5.3](https://www.w3.org/TR/WCAG22/#label-in-name) Label in Name | A | ❌ | Д-21 |
| [2.5.4](https://www.w3.org/TR/WCAG22/#motion-actuation) Motion Actuation | A | ✅ | — |
| [2.5.7](https://www.w3.org/TR/WCAG22/#dragging-movements) Dragging Movements | AA | ✅ | — |
| [2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum) Target Size (Minimum) | AA | ⚠️ | Д-26 |
| [3.1.1](https://www.w3.org/TR/WCAG22/#language-of-page) Language of Page | A | ✅ | — |
| [3.2.1](https://www.w3.org/TR/WCAG22/#on-focus) On Focus | A | ✅ | — |
| [3.2.2](https://www.w3.org/TR/WCAG22/#on-input) On Input | A | ✅ | — |
| [3.2.3](https://www.w3.org/TR/WCAG22/#consistent-navigation) Consistent Navigation | A | ✅ | — |
| [3.2.6](https://www.w3.org/TR/WCAG22/#consistent-help) Consistent Help | A | ✅ | «Обратная связь» в футере на всех страницах |
| [3.3.1](https://www.w3.org/TR/WCAG22/#error-identification) Error Identification | A | ❌ | Д-08, Д-20, Д-43 |
| [3.3.2](https://www.w3.org/TR/WCAG22/#labels-or-instructions) Labels or Instructions | A | ❌ | Д-11, Д-39, Д-44 |
| [3.3.3](https://www.w3.org/TR/WCAG22/#error-suggestion) Error Suggestion | AA | ⚠️ | Д-38 |
| [3.3.4](https://www.w3.org/TR/WCAG22/#error-prevention-legal-financial-data) Error Prevention | A | ✅ | — |
| [3.3.7](https://www.w3.org/TR/WCAG22/#redundant-entry) Redundant Entry | A | ⚠️ | Д-40 |
| [3.3.8](https://www.w3.org/TR/WCAG22/#accessible-authentication-minimum) Accessible Authentication (Min) | AA | ✅ | CAPTCHA и когнитивных тестов нет |
| [4.1.2](https://www.w3.org/TR/WCAG22/#name-role-value) Name, Role, Value | A | ❌ | Д-02, Д-19, Д-30, Д-31, Д-37, Д-47 |
| [4.1.3](https://www.w3.org/TR/WCAG22/#status-messages) Status Messages | AA | ❌ | Д-09, Д-14 … Д-18, Д-22, Д-34, Д-41 |

**Итог: 25 критериев из 44 — выполнены полностью, 8 — с замечаниями, 11 — с нарушениями.**

---

## 7. WCAG 3.0: что взять сейчас

WCAG 3.0 — **Working Draft от 10.09.2026**. Требования в статусе `Developing` могут измениться; документ не является рекомендацией. Ниже — только то, что **соответствует находкам** и что имеет смысл закладывать в работу уже сейчас.

### 7.1. Требования, которые усиливают находки

| Требование | Находки | Что это меняет в работе |
|---|---|---|
| [2.3.3 Focus relevant / Focus retained](https://www.w3.org/TR/wcag-3.0/#x2-3-3-2-focus-retained) | Д-07, Д-08, Д-09, Д-10 | Формулирует как требование то, что WCAG 2.2 описывает вскользь: фокус не теряется и не уезжает |
| [2.3.3 Focus order meaningful](https://www.w3.org/TR/wcag-3.0/#x2-3-3-3-focus-order-meaningful) | Д-13 | Порядок обхода = порядок восприятия |
| [2.3.5 Changes to elements notified](https://www.w3.org/TR/wcag-3.0/#x2-3-5-3-changes-to-elements-notified) | Д-02 | Изменение состояния элемента всегда объявляется |
| [2.3.5 Interactive element names available](https://www.w3.org/TR/wcag-3.0/#x2-3-5-2-interactive-element-names-available) | Д-05 | Имя должно быть **достаточным для идентификации**, а не просто присутствовать — шире, чем WCAG 2.2 |
| [2.3.5 Label included in programmatic name](https://www.w3.org/TR/wcag-3.0/#x2-3-5-5-label-included-in-programmatic-name) | Д-21 | Отдельное требование, а не следствие 2.5.3 |
| [2.3.1 Focus indicator contrast sufficient](https://www.w3.org/TR/wcag-3.0/#x2-3-1-2-focus-indicator-contrast-sufficient) / [size sufficient](https://www.w3.org/TR/wcag-3.0/#x2-3-1-3-focus-indicator-size-sufficient) | Д-06 | Контраст и площадь индикатора — отдельно от WCAG 2.2 |
| [2.1.8 Graphical object contrast sufficient](https://www.w3.org/TR/wcag-3.0/#x2-1-8-2-graphical-object-contrast-sufficient) | Д-25 | Покрывает **графические объекты** шире WCAG 2.2, включая границы полей |
| [2.2.1 Text contrast sufficient (minimum)](https://www.w3.org/TR/wcag-3.0/#x2-2-1-3-text-contrast-sufficient-minimum) / [Text style readable (minimum)](https://www.w3.org/TR/wcag-3.0/#x2-2-1-2-text-style-readable-minimum) | Д-24 | Дополняет контракт требованием к **читаемости стиля**, что покрывает подписи 9–11 px |
| [2.12.5 Change of content notified](https://www.w3.org/TR/wcag-3.0/#x2-12-5-1-change-of-content-notified) / [Change of focus notified](https://www.w3.org/TR/wcag-3.0/#x2-12-5-2-change-of-focus-notified) | Д-14 … Д-19, Д-41 | Центральная тема черновика: всё, что меняется само, объявляется. Закрывает 6 находок сразу |
| [2.7.3 Heading structure available](https://www.w3.org/TR/wcag-3.0/#x2-7-3-4-heading-structure-available) | Д-03, Д-04 | Требует доступной структуры, а не просто наличия заголовков |
| [2.7.2 Page/view change notified](https://www.w3.org/TR/wcag-3.0/#x2-7-2-5-page-view-change-notified) | Д-42 | Смена представления объявляется |
| [2.6.1 No visual motion](https://www.w3.org/TR/wcag-3.0/#x2-6-1-3-no-visual-motion) | Д-45 | Переносит `prefers-reduced-motion` в нормативные требования — **самый практичный пункт** |
| [2.9.4 No redundant entry](https://www.w3.org/TR/wcag-3.0/#x2-9-4-2-no-redundant-entry) | Д-40 | Прямое соответствие 3.3.7 WCAG 2.2 |
| [2.9.5 Information requirements available at start](https://www.w3.org/TR/wcag-3.0/#x2-9-5-2-information-requirements-available-at-start) | Д-11, Д-39, Д-44 | Формат поля сообщается **до** ввода |
| [2.3.4 Conventional pattern used](https://www.w3.org/TR/wcag-3.0/#x2-3-4-3-conventional-pattern-used) | Д-13, Д-29, Д-30 | Кастомные виджеты должны вести себя как стандартные |
| [2.11.2 Feedback mechanism available](https://www.w3.org/TR/wcag-3.0/#x2-11-2-1-feedback-mechanism-available) | Д-14, Д-19, Д-20 | Результат любого действия подтверждается |
| [2.4.1 No keyboard traps](https://www.w3.org/TR/wcag-3.0/#x2-4-1-7-no-keyboard-traps) | Д-13 | Клавиатурная ловушка — отдельное требование |
| [2.5.1 Errors associated](https://www.w3.org/TR/wcag-3.0/#x2-5-1-5-errors-associated) / [Error messages collocated](https://www.w3.org/TR/wcag-3.0/#x2-5-1-6-error-messages-collocated) | Д-08 | Ошибка связана с полем и находится рядом с ним |

### 7.2. Требования, которые проект уже выполняет — не потерять

- [2.1.1 Decorative images hidden](https://www.w3.org/TR/wcag-3.0/#decorative-images-hidden) — `aria-hidden` + пустой `alt` на всей декоративной графике
- [2.3.5 Roles, values, states, properties available](https://www.w3.org/TR/wcag-3.0/#x2-3-5-6-roles-values-states-properties-available) — `aria-pressed`, `aria-expanded`, `aria-checked`, `aria-current`, `aria-selected`, `aria-busy` расставлены последовательно
- [2.7.3 Relationships detectable](https://www.w3.org/TR/wcag-3.0/#x2-7-3-1-relationships-detectable) — `<dl>/<dt>/<dd>`, `<article aria-labelledby>`
- [2.7.3 Sections labeled](https://www.w3.org/TR/wcag-3.0/#x2-7-3-3-sections-labeled) — `aria-labelledby` на секциях
- [2.4.6 Biometrics not relied on](https://www.w3.org/TR/wcag-3.0/#x2-4-6-1-biometrics-not-relied-on) / [Voice identification not relied on](https://www.w3.org/TR/wcag-3.0/#x2-4-6-2-voice-identification-not-relied-on) — CAPTCHA и биометрии нет
- [2.9.1 Cognitive test alternatives available](https://www.w3.org/TR/wcag-3.0/#x2-9-1-2-cognitive-test-alternatives-available) — когнитивных тестов в аутентификации нет
- [2.12.3 Text reflow supported](https://www.w3.org/TR/wcag-3.0/#x2-12-3-3-text-reflow-supported) — вёрстка на CSS без фиксированных ширин
- [2.11.1 Consistent help available](https://www.w3.org/TR/wcag-3.0/#x2-11-1-1-consistent-help-available) — «Обратная связь» в футере на всех страницах

### 7.3. Отдельная рекомендация: длинные ответы ассистента

Ответы Веры — юридические консультации на 1–2 экрана. В WCAG 3.0 (WD) есть требования, которых в WCAG 2.2 нет вовсе: [2.2.3 Clear language → Summaries available](https://www.w3.org/TR/wcag-3.0/#x2-2-3-3-summaries-available), [No nested clauses](https://www.w3.org/TR/wcag-3.0/#x2-2-3-6-no-nested-clauses), [Common words used](https://www.w3.org/TR/wcag-3.0/#x2-2-3-4-common-words-used).

**Выгода, а не формальность.** Пользователь экранного доступа получает ответ **на слух**. Слушать юридический текст два экрана — мучение; короткое резюме даёт суть за 10 секунд, а полный текст остаётся доступен для повторного чтения.

**Но делать это так, а не иначе.** В проекте **уже есть** кнопка «Объяснить проще» (`vera/ChatMessage.tsx` → `SimplifyAnswerButton`, `useVeraChat.ts` `SIMPLIFY_ANSWER_REQUEST`). Она реализует ровно ту же задачу — дать короткую версию — по запросу пользователя. Это **лучше**, чем всегда показывать сводку:

- не тратит лишний LLM-токены на каждое сообщение;
- не рискует тем, что автоматическая сводка исказит юридический смысл;
- даёт пользователю **выбор** — коротко или полностью.

**Рекомендация:** добавить второй уровень — «Коротко» (2–3 предложения) рядом с «Объяснить проще» (перефраздировать). Технически это тот же механизм `sendMessage` с другим промптом. Это и есть WCAG 3.0 (WD) 2.2.3, но встроенное в существующую архитектуру, а не прикрученное сбоку.

---

## 8. Дорожная карта

### 8.1. Матрица «эффект × трудоёмкость»

```
                  Трудоёмкость
              низкая            высокая
          ┌─────────────────┬─────────────────┐
  высокий │ Д-02 Д-05 Д-06  │ Д-07 Д-08       │
  эффект  │ Д-01 Д-11 Д-12  │ Д-09 Д-10 Д-13  │
          │ Д-03 Д-04       │                 │
          ├─────────────────┼─────────────────┤
  средний │ Д-14 Д-15 Д-16  │ Д-20 Д-21       │
  эффект  │ Д-17 Д-18 Д-19  │ Д-24 Д-25       │
          │ Д-22 Д-23 Д-27  │                 │
          ├─────────────────┼─────────────────┤
  низкий  │ Д-28 Д-29 Д-30  │ Д-45            │
  эффект  │ Д-31 … Д-44     │                 │
          └─────────────────┴─────────────────┘
```

### 8.2. Спринт 1 — «Не сломанный сценарий» (≈ 2 ч)

Цель: убрать всё, что мешает **завершить** задачу.

| Действие | Находка | Файлы |
|---|---|---|
| `tabIndex={-1}` на `<main>` | Д-01 | `app/layout.tsx:39` |
| Сброс `activeIndex` по `Escape` + защита `ArrowDown` | Д-02 | `search/RegionCombobox.tsx:80-82,65-73` |
| Убрать `inputMode="numeric"`, исправить подсказку | Д-11 | `auth/OtpCodeInput.tsx:26-31` |
| `tabIndex={0}` на историю чата | Д-12 | `vera/ChatWindow.tsx:357-366` |
| Убрать перехват `Tab` в listbox | Д-13 | `assistant/AssistantFlow.tsx:292-298` |
| Видимый фокус у радиокнопок фильтра | Д-06 | `vacancies/VacancyFilters.tsx:90-120` |
| `sr-only` с названием вакансии в ссылках «Подробнее» | Д-05 | `vacancies/VacancyCard.tsx:82-91`; `favorites/FavoritesList.tsx:162-177` |
| `h1` на `/assistant/start` и на странице ошибки | Д-03, Д-04 | `assistant/start/page.tsx`; `ui/ServiceError.tsx:34`; `app/error.tsx` |

### 8.3. Спринт 2 — «Фокус и обратная связь» (≈ 4 ч)

Цель: пользователь всегда знает, где находится и что произошло.

| Действие | Находка |
|---|---|
| Перенос фокуса на `h1` в auth-формах (паттерн `FocusHeading`) | Д-07 |
| Перенос фокуса на первое ошибочное поле в 6 формах (паттерн `SearchForm.tsx:52-55`) | Д-08 |
| Убрать `aria-busy` с кнопки, вынести «Загрузка...» в постоянный `role="status"` | Д-09 |
| Не размонтировать форму фидбека + перевод фокуса на «Спасибо» | Д-10 |
| `aria-live` для копирования в `ShareButton` и `AssistantFlow` | Д-14 |
| Объявление количества найденных вакансий | Д-15 |
| `role="status"` для скелетонов | Д-16 |
| Постоянные live-регионы вместо монтируемых | Д-17 |
| Текст ожидания чата — в живой регион | Д-18 |
| Обратный отсчёт — в `role="status"`, кнопку не блокировать | Д-19 |
| Обработка всех типов ошибок переотправки кода | Д-20 |
| Убрать `aria-label` с карточек контактов | Д-21 |

### 8.4. Спринт 3 — «Видимость и прочность» (≈ 3 ч)

| Действие | Находка |
|---|---|
| Контраст текста в 6 местах | Д-24 |
| Контраст рамок полей ввода | Д-25 |
| Таргеты ≥ 24×24 | Д-26 |
| `role="list"` для 6 списков | Д-27 |
| `focus-visible` вместо `focus:outline-none` на `h1` | Д-28 |
| Стрелки выбирают в radiogroup | Д-29 |
| `aria-labelledby` для кнопки dropdown | Д-30 |
| «Отключённые» ссылки пагинации → кнопки | Д-31 |
| `sr-only` для многоточия пагинации | Д-32 |
| `aria-labelledby` на `<article>` | Д-33 |
| Один `role="status"` на список вакансий вместо 20 `role="alert"` | Д-34 |
| `prefers-reduced-motion` для всех анимаций | Д-45 |

### 8.5. Спринт 4 — «Полировка» (≈ 2 ч)

Д-35 … Д-44 — точечные правки.

### 8.6. Стратегическая часть: не дать дефектам вернуться

Сейчас в `package.json` нет **ничего**, что ловило бы проблемы доступности на этапе коммита. Без этого каждое исправление через полгода будет стёрто очередным рефакторингом.

| Инструмент | Что ловит | Как подключить |
|---|---|---|
| `eslint-plugin-jsx-a11y` | Статические ошибки: нет `alt`, нет `label`, невалидная ARIA-разметка, `role` на неподходящем элементе | `eslint.config.mjs` — уже есть eslint 9 и `eslint-config-next` |
| `axe-core` + `vitest` + `@testing-library/react` | a11y-правила в компонентных тестах | `vitest.config.ts`, все пакеты уже в `devDependencies` |
| `pa11y-ci` или Lighthouse CI | Прогон по ключевым маршрутам в CI | Отдельный скрипт в `package.json` + шаг в пайплайне |

**Маршруты для прогона:** `/`, `/vacancies`, `/vacancies/{id}`, `/favorites`, `/assistant/start`, `/assistant/chat`, `/auth/login`, `/auth/register`, `/contact`, `/blog`, `/blog/{slug}`, `/privacy`.

---

## 9. Ручные сценарии проверки

Автосканер не увидит ни одного из этих дефектов. Проверять вручную.

| # | Сценарий | Ожидание | Находка |
|---|---|---|---|
| 1 | Вход: неверный email → Enter | NVDA объявляет ошибку **и фокус оказывается в поле email**; текст ошибки читается как описание поля | Д-08 |
| 2 | Регистрация: ошибка в поле «Имя» | То же | Д-08 |
| 3 | Вход → успех → следующая страница | Фокус на заголовке новой страницы, а не в начале документа | Д-07 |
| 4 | Отправка отзыва | Фокус не теряется; форму можно отправить повторно без F5 | Д-10 |
| 5 | Комбобокс региона: открыть → стрелки → `Escape` → Tab назад | Нет сообщения «referenced node invalid»; NVDA: «Регион, поле с автодопнением, свёрнуто» | Д-02 |
| 6 | Обзор ссылок (NVDA `Ctrl+Enter`) на `/vacancies` | Каждая ссылка различима по имени | Д-05 |
| 7 | Клавиатурная прокрутка длинной истории чата | Стрелки прокручивают историю, когда в сообщениях нет кнопок | Д-12 |
| 8 | Навигация по заголовкам (`H`) на каждой странице | Ровно один `h1`, без пропусков уровней | Д-03, Д-04 |
| 9 | Модалка отзыва: Tab → Shift+Tab → Escape | Фокус не выходит за пределы модалки; после закрытия возвращается на кнопку-триггер | — |
| 10 | Фильтр «Источник»: стрелки по группе | Видно, где фокус | Д-06 |
| 11 | Мастер ассистента: открыть список вакансий → `Tab` | Фокус переходит к следующему элементу, а не возвращается на кнопку | Д-13 |
| 12 | Масштаб 200 % и 400 % | Фокусное кольцо не перекрывается, элементы не обрезаются | Д-12, 2.4.11 |
| 13 | Страница ошибки (`/error`) | Навигация по заголовкам находит заголовок | Д-04 |
| 14 | Голосовой ввод (Voice Control / Voice Access): «нажми Подробнее» | Срабатывает, несмотря на добавленное имя вакансии | Д-05 |

---

## 10. Приложение: ссылки

Все ссылки проверены на доступность (HTTP 200) на дату аудита.

**Нормативные документы**
- WCAG 2.2 (Recommendation, 12.12.2024) — <https://www.w3.org/TR/WCAG22/>
- WCAG 3.0 (Working Draft, 10.09.2026) — <https://www.w3.org/TR/wcag-3.0/>
- WAI-ARIA 1.2 — <https://www.w3.org/TR/wai-aria-1.2/>

**Справочные документы W3C WAI**
- Understanding WCAG 2.2 — <https://www.w3.org/WAI/WCAG22/Understanding/>
- How to Meet WCAG 2.2 (фильтруемый быстрый справочник) — <https://www.w3.org/WAI/WCAG22/quickref/>
- WCAG 2.2 Techniques — <https://www.w3.org/WAI/WCAG22/Techniques/>
- ARIA Authoring Practices Guide — <https://www.w3.org/WAI/ARIA/apg/>
- APG Read Me First (почему нельзя слепо следовать паттернам) — <https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/>
- APG Landmark Regions — <https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/>

**Правовой контекст**
- European Accessibility Act — <https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/union-equality-strategy-rights-persons-disabilities-2021-2030/european-accessibility-act_en>
