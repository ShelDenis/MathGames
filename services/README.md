# Микросервисы MathGames (лабораторная 3)

```
Браузер / Vue (5173)
        │  http://localhost:3001  (адрес для фронтенда не изменился)
        ▼
  API Gateway :3001 ── проверка JWT, round robin, карантин упавших адресов
     │        │            │
     ▼        ▼            ▼
  Auth     Core        Image Worker
  :3002    :3003         :3004  (+ Socket.IO)
     │        │            │
  БД auth    БД core     Redis (BullMQ, очередь image-processing)
```

Пока Core Service и Image Worker не выделены, роль обоих играет старый монолит `backend`
на порту 3003 (см. `services/gateway/.env.example`).

## Кто что обслуживает (таблица маршрутизации Gateway)

| Путь                                  | Куда                       |
|---------------------------------------|----------------------------|
| `/api/auth/*`                         | Auth Service               |
| `/api/upload*`, `/uploads/*`          | Image Worker (round robin) |
| `/socket.io/*` (включая WebSocket)    | Image Worker (первый адрес)|
| `/api/health`, `/api/health/all`      | сам Gateway                |
| остальное под `/api/*`                | Core Service (round robin) |

Маршруты без токена перечислены в `services/gateway/src/rules.ts`. Они повторяют то, что
в монолите было открыто (список задач и турниров, табло, генерация бланков, вход и регистрация).
Остальное требует действительный JWT.

## Контракт для участников 2 и 3

1. **Каждый сервис обязан отвечать на `GET /api/health`** (код 200). Его использует Gateway (`/api/health/all`) и скрипт `npm run smoke`.
2. **`JWT_SECRET` одинаковый** у Auth, Gateway, Core и Image Worker. Формат токена прежний: `{ id, email, role }`.
   Проверку ролей (`requireRole`) сервисы делают сами по токену, как и раньше.
3. Gateway дополнительно передаёт сервисам заголовки `x-user-id`, `x-user-email`, `x-user-role`.
   Подделать их снаружи нельзя: Gateway вырезает их из входящих запросов.
4. **Очередь:** `services/queue/src/queue.ts`: имя `image-processing`, формат `ImageJobData`, повторные
   попытки и `jobId = imageId` (защита от дублей). Не меняйте без согласования.
5. **Пользователи живут в БД Auth** (`mathgames_auth`). В Core нельзя ссылаться на таблицу `users`
   внешним ключом. Сейчас `User.teamId` в Auth просто строка. Как Core будет хранить состав команд,
   нужно решить участнику 2 (например, своя таблица «участник команды» с `userId` строкой).

## Переменные окружения

| Сервис  | Файл                          | Главное                                                     |
|---------|-------------------------------|-------------------------------------------------------------|
| Auth    | `services/auth/.env`          | `DATABASE_URL`, `JWT_SECRET`, `ALLOW_ROLE_SELECTION`        |
| Gateway | `services/gateway/.env`       | `JWT_SECRET`, `AUTH_URL`, `CORE_URLS`, `IMAGE_WORKER_URLS`  |
| Queue   | `services/queue/.env`         | `REDIS_URL`, `WORKER_CONCURRENCY`                           |
| Монолит (Core) | `backend/.env` (шаблон `backend/.env.example`) | `DATABASE_URL`, `JWT_SECRET`, `PORT=3003` |

`ALLOW_ROLE_SELECTION=false` запрещает самостоятельную регистрацию с ролью, отличной от STUDENT:
такие пользователи создаются только администратором (по его токену). Первого админа создаёт `npm run seed:auth`.

## Команды (из корня репозитория)

```
npm install            # один раз: ставит concurrently
npm run install:all    # зависимости всех сервисов и монолита
npm run db:auth        # создать таблицы в БД Auth
npm run seed:auth      # создать администратора
npm run dev            # запустить Auth + Gateway + монолит одновременно
npm run smoke          # проверить цепочку через Gateway
npm run queue:demo     # 30 задач через Redis-очередь (нужен Redis)
```

## Балансировка

Несколько копий сервиса указываются через запятую: `CORE_URLS=http://localhost:3003,http://localhost:3013`.
Gateway раздаёт запросы по кругу. Если адрес не отвечает, он на 10 секунд исключается из ротации.
Запрос, который попал на упавший адрес, получает 502, повторно он не отправляется (повтор POST небезопасен).
Для Socket.IO используется только первый адрес Image Worker: для нескольких копий понадобятся sticky sessions или Redis-адаптер.
