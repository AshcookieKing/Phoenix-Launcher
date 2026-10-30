/* steam_ticket.exe - Steam-билет сессии Arma 3 для входа через Discord в лаунчере (как phx_open_x64.dll в игре).
 *
 *   steam_ticket.exe <папка Arma 3> [секунд]
 *
 * Берёт steam_api64.dll из папки Arma 3, входит в Steam как Arma 3 (appid 107410, переменная SteamAppId - без
 * steam_appid.txt), печатает одну строку и держит билет живым [секунд] (по умолчанию 40), пока phx_roleapi проверяет
 * его через Steam Web API (ISteamUserAuth/AuthenticateUserTicket). Лаунчер завершает процесс раньше, когда вход готов.
 *   OK <SteamID64> <билет hex>
 *   ERR <причина>        (no_dll | no_steam | init | no_user | not_logged_on | no_ticket)
 * Сборка: build.bat (MinGW gcc из WinLibs).
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>

#define APPID "107410"

typedef int (*InitFlatFn)(char *errMsg);          /* 0 = OK (SteamAPI_InitFlat, SDK 1.59+) */
typedef int (*InitSafeFn)(void);                  /* 1 = OK */
typedef int (*IsRunningFn)(void);
typedef void (*VoidFn)(void);
typedef void *(*SteamUserFn)(void);
typedef unsigned long long (*GetSteamIdFn)(void *);
typedef int (*LoggedOnFn)(void *);
typedef unsigned int (*GetTicketFn)(void *, void *, int, unsigned int *, const void *);
typedef void (*CancelTicketFn)(void *, unsigned int);

static int fail(const char *why)
{
    printf("ERR %s\n", why);
    fflush(stdout);
    return 1;
}

int main(int argc, char **argv)
{
    if (argc < 2) return fail("usage");
    int seconds = argc > 2 ? atoi(argv[2]) : 40;
    if (seconds < 5 || seconds > 300) seconds = 40;

    char dll[MAX_PATH * 2];
    _snprintf(dll, sizeof(dll) - 1, "%s\\steam_api64.dll", argv[1]);
    dll[sizeof(dll) - 1] = '\0';
    SetEnvironmentVariableA("SteamAppId", APPID);
    SetEnvironmentVariableA("SteamGameId", APPID);
    HMODULE h = LoadLibraryExA(dll, NULL, LOAD_WITH_ALTERED_SEARCH_PATH);
    if (!h) return fail("no_dll");

    InitFlatFn initFlat = (InitFlatFn)GetProcAddress(h, "SteamAPI_InitFlat");
    InitSafeFn initSafe = (InitSafeFn)GetProcAddress(h, "SteamAPI_InitSafe");
    char err[1024] = {0};
    int ok = initFlat ? initFlat(err) == 0 : (initSafe ? initSafe() != 0 : 0);
    if (!ok) {
        /* Steam не запущен - отдельная причина (лаунчер предложит запустить Steam) */
        IsRunningFn running = (IsRunningFn)GetProcAddress(h, "SteamAPI_IsSteamRunning");
        if (running && !running()) return fail("no_steam");
        if (err[0]) { printf("ERR init %s\n", err); fflush(stdout); return 1; }
        return fail("init");
    }
    VoidFn shutdown = (VoidFn)GetProcAddress(h, "SteamAPI_Shutdown");
    VoidFn callbacks = (VoidFn)GetProcAddress(h, "SteamAPI_RunCallbacks");

    static const char *vers[] = {"SteamAPI_SteamUser_v023", "SteamAPI_SteamUser_v022", "SteamAPI_SteamUser_v021", "SteamAPI_SteamUser_v020"};
    SteamUserFn userFn = NULL;
    for (int i = 0; i < 4 && !userFn; i++) userFn = (SteamUserFn)GetProcAddress(h, vers[i]);
    GetSteamIdFn getId = (GetSteamIdFn)GetProcAddress(h, "SteamAPI_ISteamUser_GetSteamID");
    LoggedOnFn loggedOn = (LoggedOnFn)GetProcAddress(h, "SteamAPI_ISteamUser_BLoggedOn");
    GetTicketFn getTicket = (GetTicketFn)GetProcAddress(h, "SteamAPI_ISteamUser_GetAuthSessionTicket");
    CancelTicketFn cancel = (CancelTicketFn)GetProcAddress(h, "SteamAPI_ISteamUser_CancelAuthTicket");
    void *user = userFn ? userFn() : NULL;
    if (!user || !getId || !getTicket) { if (shutdown) shutdown(); return fail("no_user"); }
    if (loggedOn && !loggedOn(user)) { if (shutdown) shutdown(); return fail("not_logged_on"); }

    unsigned char buf[1024];
    unsigned int len = 0;
    unsigned int handle = getTicket(user, buf, (int)sizeof(buf), &len, NULL);
    if (handle == 0 || len == 0 || len > sizeof(buf)) { if (shutdown) shutdown(); return fail("no_ticket"); }

    static const char hx[] = "0123456789ABCDEF";
    char hex[sizeof(buf) * 2 + 1];
    for (unsigned int i = 0; i < len; i++) { hex[i * 2] = hx[buf[i] >> 4]; hex[i * 2 + 1] = hx[buf[i] & 15]; }
    hex[len * 2] = '\0';
    printf("OK %llu %s\n", getId(user), hex);
    fflush(stdout);

    /* билет действует, пока процесс жив: Steam регистрирует его на сервере за несколько секунд */
    for (int t = 0; t < seconds * 10; t++) {
        if (callbacks) callbacks();
        Sleep(100);
    }
    if (cancel) cancel(user, handle);
    if (shutdown) shutdown();
    return 0;
}
