# Подпись exe (Phoenix Launcher и Phoenix NetCheck)

Без подписи антивирусы и SmartScreen оценивают файл только по поведению, поэтому подпись — главное средство против ложных срабатываний.

## Сертификат
Нужен сертификат подписи кода (Code Signing) на имя автора. Варианты, цены и условия проверить на сайтах:
- Certum «Open Source Code Signing» — для открытых проектов, дешёвый, ключ на смарт-карте или в облаке SimplySign.
- SignPath Foundation — бесплатная подпись для open-source проектов на GitHub (подпись идёт через их CI).
- Обычный OV-сертификат (Sectigo, DigiCert и т. п.) — дороже, ключ на токене.

## Сборка с подписью
electron-builder подписывает сам, если заданы переменные:

```
set CSC_LINK=C:\путь\к\сертификату.pfx
set CSC_KEY_PASSWORD=пароль
npm run pack
```

Для ключа на токене (Certum SimplySign, OV на токене) вместо CSC_LINK указывают `win.signtoolOptions.certificateSubjectName` в package.json.

Вложенные помощники (`resources\steam_ticket.exe`, `resources\steam_workshop.exe`) и отдельный `PhoenixNetCheck.exe` подписывать тем же сертификатом через signtool:

```
signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /a native\steam_ticket.exe native\steam_workshop.exe
```
