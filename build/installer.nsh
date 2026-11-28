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

!macro customInstall
  DetailPrint "Поиск установленной Arma 3..."
  Var /GLOBAL PHX_SteamPath
  Var /GLOBAL PHX_ArmaPath
  Var /GLOBAL PHX_ArmaExe

  StrCpy $PHX_SteamPath ""
  StrCpy $PHX_ArmaPath ""
  StrCpy $PHX_ArmaExe ""

  ReadRegStr $PHX_SteamPath HKCU "Software\Valve\Steam" "SteamPath"
  ${If} $PHX_SteamPath == ""
    ReadRegStr $PHX_SteamPath HKLM "Software\Valve\Steam" "InstallPath"
  ${EndIf}
  ${If} $PHX_SteamPath == ""
    ReadRegStr $PHX_SteamPath HKLM "Software\WOW6432Node\Valve\Steam" "InstallPath"
  ${EndIf}

  ReadRegStr $PHX_ArmaPath HKLM "SOFTWARE\WOW6432Node\Bohemia Interactive\Arma 3" "main"
  ${If} $PHX_ArmaPath == ""
    ReadRegStr $PHX_ArmaPath HKLM "SOFTWARE\Bohemia Interactive\Arma 3" "main"
  ${EndIf}

  ${If} $PHX_ArmaPath != ""
    ${If} ${FileExists} "$PHX_ArmaPath\arma3_x64.exe"
      StrCpy $PHX_ArmaExe "$PHX_ArmaPath\arma3_x64.exe"
    ${EndIf}
  ${EndIf}

  ${If} $PHX_ArmaExe == ""
    ${If} $PHX_SteamPath != ""
      ${If} ${FileExists} "$PHX_SteamPath\steamapps\common\Arma 3\arma3_x64.exe"
        StrCpy $PHX_ArmaExe "$PHX_SteamPath\steamapps\common\Arma 3\arma3_x64.exe"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} $PHX_ArmaExe != ""
    WriteRegStr HKCU "Software\PhoenixLauncher" "armaExe" "$PHX_ArmaExe"
  ${EndIf}
  ${If} $PHX_SteamPath != ""
    WriteRegStr HKCU "Software\PhoenixLauncher" "steamPath" "$PHX_SteamPath"
  ${EndIf}
!macroend
