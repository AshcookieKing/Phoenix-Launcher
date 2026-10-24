# Phoenix Launcher

Лаунчер Arma 3 для проекта **Phoenix · Star Wars RP** (Electron + React + Vite). Сделан на основе StarFront-лаунчера
(`Desktop\rim_launcher`), но это отдельный проект с собственными настройками (`%APPDATA%\PhoenixLauncher`).

## Что умеет

- **Серверы**: Фарабад (фронт, `109.248.4.45:2302`) и Камино (учебный хаб, `:2402`), онлайн, карта и пинг по Steam A2S каждые 10 с.
- **ИГРАТЬ** — запуск Arma 3 с модами в меню Phoenix (выбор персонажа → «Подключиться»).
  **Быстрый вход** на карточке сервера — сразу `-connect` на этот сервер с персонажем из прошлой сессии.
- **Моды**: встроенный пресет `preset/phoenix_preset.html` (35 модов), проверка установленных и устаревших, подписка через Steam.
  Можно выбрать свой HTML-пресет.
- **Аккаунт**: Steam берётся из `loginusers.vdf`; звание, батальон, рекрут и доступ к сторонам меню (БСО, Джедай, Наёмник, ARC, RC,
  3-й слот) — из `phx_roleapi` (`:8792/menu/roles`).
  «Войти через Discord» привязывает Discord к меню так же, как кнопка в игре: код → `/menu/pair` → страница бота `:5003/phx/menu/login`.
- **Системы Phoenix** — описание игровых систем (меню, фронт, Камино, перелёт, панель Shift+P, ShadowKit Shift+K, HUD, медицина, штаб).
- **Настройки**: пути к игре (автопоиск), профиль Arma, режим экрана, оптимизированный запуск, доп. параметры.

Адреса всех систем — в `electron/phx-config.cjs`.

## Сборка

```
npm install
npm run dev        # Vite + Electron с горячей перезагрузкой
npm run pack       # release/PhoenixLauncher.exe (portable)
```

Превью интерфейса в браузере: `npx vite` → http://localhost:5174 (вместо Electron подставляются тестовые данные
`src/dev/mockApi.js`; параметры `?unlinked=1`, `?nopath=1` показывают другие состояния).

Самопроверка сборки без окна: `PHX_SELFTEST=<папка> PhoenixLauncher.exe` — снимки экранов и `report.json` в папке.

## Ассеты

- `public/assets/background.jpg` — арт Войн клонов без логотипа TCW (обрезаны чёрные полосы).
- `public/assets/phoenix_logo.png`, `phoenix_emblem.png`, `build/icon.ico` — из логотипа Arma Phoenix.
