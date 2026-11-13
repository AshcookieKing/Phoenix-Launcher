@echo off
rem Сборка помощников Steam (MinGW gcc из WinLibs). Готовые файлы кладутся в ресурсы лаунчера (extraResources).
cd /d "%~dp0"
gcc -O2 -s -static -o steam_ticket.exe steam_ticket.c
gcc -O2 -s -static -municode -Wl,--no-insert-timestamp -o steam_workshop.exe steam_workshop.c
