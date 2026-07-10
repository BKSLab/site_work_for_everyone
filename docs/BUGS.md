# Журнал багов — Работа для всех

> Файл создан для фиксации воспроизведённых проблем до их исправления.
> Дата: 2026-04-05

---

## BUG-001 — Пустая страница избранного после входа/регистрации (без обновления страницы)

### Статус
`ОТКРЫТ` — причина локализована, правка не применена

### Воспроизведение

**Сценарий A — Регистрация:**
1. Открыть главную `/` (пользователь не зарегистрирован)
2. Пройти регистрацию: `/auth/register` → `/auth/verify-email` → подтвердить OTP
3. Перенаправление на `/` — пользователь авторизован (шапка показывает имя)
4. Нажать «Избранное» в навигации → перейти на `/favorites`
5. **Результат:** пустая страница — нет скелетона, нет данных, нет сообщения «список пуст»

**Сценарий B — Вход:**
1. Открыть главную `/` (пользователь не авторизован)
2. Нажать «Избранное» → middleware редиректит на `/auth/login?redirect=/favorites`
3. Войти → `router.push("/favorites")`
4. **Результат:** та же пустая страница

**Что работает корректно:**
- Открыть `/favorites` → обновить страницу (F5) → страница работает правильно:
  показывает скелетон загрузки, потом либо список, либо «Список избранного пуст»

### Симптомы

- Показывается `<h1>Избранные вакансии</h1>` (не редирект, не ошибка)
- Ниже h1 — полностью пусто:
  - `FavoritesListSkeleton` **не отображается** (`query.isLoading = false`)
  - `ServiceError` **не отображается** (`query.isError = false`)
  - `FavoritesList` **не отображается** (`query.data` — falsy / `undefined`)
  - Сообщение «Список избранного пуст» **не показывается** (внутри `FavoritesList`)
- После `F5` всё отрабатывает корректно

### Локализация бага

**Файл:** `frontend/src/app/favorites/page.tsx`

**Корневая причина — порядок вызовов хуков и условная логика:**

```tsx
// useFavorites вызывается БЕЗУСЛОВНО, до проверки user
const { query, removeMutation } = useFavorites(
    user?.email ?? "",   // ← если user = null → userId = "" → enabled: false
    page,
    PAGE_SIZE
);

// ...

// Проверка auth-состояния — ПОСЛЕ вызова хука
if (isLoading || !user) {
    return <AuthSkeleton />;
}

// Рендер данных — три взаимоисключающих условия
return (
    <>
        <h1>Избранные вакансии</h1>
        {query.isLoading && <FavoritesListSkeleton />}      // (1)
        {query.isError && !query.isLoading && <ServiceError />}  // (2)
        {query.data && <FavoritesList />}                    // (3)
    </>
);
```

**Точный сценарий отказа:**

При клиентской навигации на `/favorites` (без обновления страницы) возникает рендер,
в котором Zustand возвращает `isLoading = false, user = null` — переходное состояние
до того, как store обновился после login/verify-email.

В этом рендере:
- `useFavorites("", 1, 10)` → `enabled: !!userId = false` → **disabled query**
- TanStack Query для disabled query: `{ status: "pending", fetchStatus: "idle" }`
- `isLoading` (TanStack Query v5) = `status === "pending" && isFetching` = **false**
- `data = undefined`, `isError = false`

После того как store обновляется (`user = {...}`):
- `if (isLoading || !user)` → `false` → переходим в ветку рендера данных
- `useFavorites(email, 1, 10)` → ключ меняется на `["favorites", email, 1, 10]`
- Новый запрос должен стартовать с `isLoading: true` — НО

**Возможная причина итогового состояния:**
В некоторых сценариях (зависит от React batching / timing) компонент видит
финальное состояние disabled query (`isLoading: false, data: undefined`)
уже после того, как `user` появился, без промежуточного рендера с `isLoading: true`.
Результат: все три условия `(1)(2)(3)` — false → пустой контент ниже h1.

### Дополнительный контекст

**Почему после F5 работает:**
- Zustand сбрасывается до начального: `{ user: null, isLoading: true }`
- `AuthProvider` → `useAuth` → `hydrate()` → `GET /api/auth/me` → `setUser()`
- `FavoritesPage` видит `isLoading = true` → показывает auth-скелетон
- После гидратации: `isLoading = false, user = {...}` → `useFavorites(email)`
  сразу стартует с нужным userId → `query.isLoading = true` → query-скелетон
- Данные приходят → `FavoritesList` с пустым списком

**Почему после клиентского перехода ломается:**
- Zustand хранит состояние в памяти между навигациями
- `AuthProvider.useAuth` (empty deps `[]`) не повторяет гидратацию
- Переходное состояние `isLoading = false, user = null` достигает рендера
- `useFavorites` инициализируется с `userId = ""` (disabled query)
- TanStack Query cache получает disabled-запись с ключом `["favorites", "", 1, 10]`

**Схема состояний Zustand (store/auth.ts):**
```
Инициализация: { user: null, isAuthenticated: false, isLoading: true }
После setUser(): { user: {...}, isAuthenticated: true, isLoading: false }
После reset():  { user: null, isAuthenticated: false, isLoading: false }
```

**Важно:** `reset()` устанавливает `isLoading: false`.
Если `reset()` вызывается в момент, когда пользователь уже залогинен
(race condition с `hydrate()`), и затем `setUser()` не успевает отработать
до рендера `FavoritesPage` — возникает состояние `isLoading = false, user = null`.

### Затронутые файлы

| Файл | Роль |
|---|---|
| `src/app/favorites/page.tsx` | Основное место бага — порядок хуков |
| `src/hooks/useFavorites.ts` | `enabled: !!userId` — зависит от email |
| `src/hooks/useAuth.ts` | `hydrate()` с empty deps — не повторяется |
| `src/stores/auth.ts` | `isLoading: true` в начальном состоянии |
| `src/providers/AuthProvider.tsx` | Единственный вызов `useAuth` |

### Варианты исправления (не применены)

**Вариант 1 — Добавить явный guard перед вызовом useFavorites:**
Вынести `useFavorites` за пределы "опасного" рендера — вызывать только когда
user гарантированно существует. Поскольку хуки не могут быть условными,
нужно вынести логику в дочерний компонент.

```tsx
// FavoritesPage — только auth-guard
export default function FavoritesPage() {
    const user = useAuthStore((s) => s.user);
    const isLoading = useAuthStore((s) => s.isLoading);
    // ...
    if (isLoading || !user) return <AuthSkeleton />;
    return <FavoritesContent user={user} />;  // ← хуки внутри, user гарантирован
}

// FavoritesContent — вызывает useFavorites с гарантированным userId
function FavoritesContent({ user }: { user: AuthUser }) {
    const { query } = useFavorites(user.email, ...);
    // ...
}
```

**Вариант 2 — Добавить явный pending-state для disabled query:**
В `FavoritesPage` добавить условие: если `!userId` (query disabled) — показывать
скелетон, даже если auth-loading завершён.

```tsx
const userId = user?.email ?? "";
const { query } = useFavorites(userId, page, PAGE_SIZE);

const isQueryReady = !!userId;  // false → query disabled, данных не будет

if (isLoading || !user) return <AuthSkeleton />;

return (
    <>
        <h1>Избранные вакансии</h1>
        {(!isQueryReady || query.isLoading) && <FavoritesListSkeleton />}
        {query.isError && !query.isLoading && <ServiceError />}
        {query.data && <FavoritesList />}
    </>
);
```

**Вариант 3 — Разделить компонент (предпочтительный, чистый):**
Самый правильный подход: вынести всю логику с useFavorites в отдельный
клиентский компонент, который монтируется только когда user подтверждён.
Аналогично тому, как устроен `VacanciesContent.tsx`.

### Связанные наблюдения (не баги, но стоит зафиксировать)

1. **`Header.tsx` использует `user?.first_name`** — поле есть в `AuthUser`
   (proxy возвращает `{ email, first_name, last_name }`) — это корректно,
   но `PROJECT_KNOWLEDGE.md` устарел (написано `{ email, username }`).

2. **Двойной вызов `useAuth`**: `AuthProvider` вызывает `useAuth()`,
   а `LoginPage` тоже вызывает `useAuth()`. Если оба запустят `hydrate()`
   одновременно (при `isLoading = true`), возникнут две параллельные
   гидратации `/api/auth/me`. Мутексного механизма между ними нет.
   В большинстве случаев это безвредно, но потенциально создаёт race condition.

3. **`proxy.ts` middleware** редиректит авторизованных пользователей
   с auth-страниц на `/` (не на `redirect`-параметр). Это архитектурное решение,
   но означает что если у пользователя есть валидный токен и он заходит на
   `/auth/login?redirect=/favorites`, он попадёт на `/`, а не на `/favorites`.

---

## Связанные файлы для изучения при отладке

```
frontend/src/app/favorites/page.tsx        ← основное место
frontend/src/hooks/useFavorites.ts
frontend/src/hooks/useAuth.ts
frontend/src/stores/auth.ts
frontend/src/providers/AuthProvider.tsx
frontend/src/app/auth/login/page.tsx
frontend/src/app/auth/verify-email/page.tsx
frontend/src/hooks/useLogin.ts
frontend/src/hooks/useVerifyEmail.ts
```
