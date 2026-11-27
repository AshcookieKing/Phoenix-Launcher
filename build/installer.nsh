; Phoenix Launcher 1.4.3+: установка в Program Files (для всех пользователей).
; Версии 1.4.0-1.4.2 стояли в %LOCALAPPDATA%\Programs\PhoenixLauncher (только для текущего пользователя):
; их тихо удаляем собственным деинсталлятором, чтобы не осталось двух копий и двух ярлыков.
; Данные лаунчера (%APPDATA%\PhoenixLauncher: настройки, вход) не трогаются.
!macro customInit
  ReadRegStr $0 HKCU "Software\${APP_GUID}" "InstallLocation"
  StrCmp $0 "" phx_old_done
  IfFileExists "$0\Uninstall PhoenixLauncher.exe" 0 phx_old_done
    ExecWait '"$0\Uninstall PhoenixLauncher.exe" /currentuser /S _?=$0'
    Delete "$0\Uninstall PhoenixLauncher.exe"
    RMDir "$0"
  phx_old_done:
!macroend
