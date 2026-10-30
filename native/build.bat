@echo off
rem Сборка native\steam_ticket.exe (MinGW gcc из WinLibs). Готовый файл кладётся в ресурсы лаунчера (extraResources).
cd /d "%~dp0"
gcc -O2 -s -static -o steam_ticket.exe steam_ticket.c
