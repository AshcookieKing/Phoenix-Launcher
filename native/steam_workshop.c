/* steam_workshop.exe - подписка и загрузка модов Workshop через Steam API (ISteamUGC), как это делает Arma 3 Launcher.
 *
 *   steam_workshop.exe <папка Arma 3> sync  <id> [id ...]   подписаться, поставить в загрузку, ждать окончания
 *   steam_workshop.exe <папка Arma 3> state <id> [id ...]   одно состояние и выход
 *
 * Берёт steam_api64.dll из папки Arma 3 и входит в Steam как Arma 3 (appid 107410, переменная SteamAppId).
 * Ссылок steam://subscribe у Steam нет - качать моды можно только так.
 * Вывод (по строке):
 *   READY
 *   S <id> <флаги> <скачано байт> <всего байт> <время мода> <папка>   раз в секунду по каждому моду
 *   DONE                       sync: все моды установлены и обновлены
 *   ERR <причина>              no_dll | no_steam | init | no_ugc | not_logged_on | usage
 * Флаги - EItemState: 1 подписан, 4 установлен, 8 нужно обновить, 16 качается, 32 в очереди.
 * Сборка: build.bat (MinGW gcc из WinLibs).
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define APPID "107410"
#define MAX_ITEMS 256

enum { ST_SUBSCRIBED = 1, ST_INSTALLED = 4, ST_NEEDS_UPDATE = 8, ST_DOWNLOADING = 16, ST_PENDING = 32 };

typedef int (*InitFlatFn)(char *errMsg);
typedef int (*InitSafeFn)(void);
typedef int (*IsRunningFn)(void);
typedef void (*VoidFn)(void);
typedef void *(*AccessorFn)(void);
typedef int (*LoggedOnFn)(void *);
typedef unsigned int (*GetStateFn)(void *, unsigned long long);
typedef unsigned long long (*SubscribeFn)(void *, unsigned long long);
typedef unsigned char (*DownloadFn)(void *, unsigned long long, unsigned char);
typedef unsigned char (*DlInfoFn)(void *, unsigned long long, unsigned long long *, unsigned long long *);
typedef unsigned char (*InstInfoFn)(void *, unsigned long long, unsigned long long *, char *, unsigned int, unsigned int *);

static int out(const char *line)
{
    /* лаунчер закрыт - канал оборван: выходим, Steam снимает статус «в игре» */
    if (fputs(line, stdout) == EOF || fputc('\n', stdout) == EOF || fflush(stdout) == EOF) exit(3);
    return 0;
}

static int fail(const char *why)
{
    char b[256];
    _snprintf(b, sizeof(b) - 1, "ERR %s", why);
    b[sizeof(b) - 1] = '\0';
    out(b);
    return 1;
}

int main(int argc, char **argv)
{
    if (argc < 4) return fail("usage");
    int sync = strcmp(argv[2], "sync") == 0;

    unsigned long long ids[MAX_ITEMS];
    int n = 0;
    for (int i = 3; i < argc && n < MAX_ITEMS; i++) {
        unsigned long long v = _strtoui64(argv[i], NULL, 10);
        if (v) ids[n++] = v;
    }
    if (!n) return fail("usage");

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
        IsRunningFn running = (IsRunningFn)GetProcAddress(h, "SteamAPI_IsSteamRunning");
        if (running && !running()) return fail("no_steam");
        return fail("init");
    }
    VoidFn shutdown = (VoidFn)GetProcAddress(h, "SteamAPI_Shutdown");
    VoidFn callbacks = (VoidFn)GetProcAddress(h, "SteamAPI_RunCallbacks");

    static const char *ugcVers[] = {"SteamAPI_SteamUGC_v021", "SteamAPI_SteamUGC_v020", "SteamAPI_SteamUGC_v018",
                                    "SteamAPI_SteamUGC_v017", "SteamAPI_SteamUGC_v016"};
    AccessorFn ugcFn = NULL;
    for (int i = 0; i < 5 && !ugcFn; i++) ugcFn = (AccessorFn)GetProcAddress(h, ugcVers[i]);
    static const char *userVers[] = {"SteamAPI_SteamUser_v023", "SteamAPI_SteamUser_v022", "SteamAPI_SteamUser_v021", "SteamAPI_SteamUser_v020"};
    AccessorFn userFn = NULL;
    for (int i = 0; i < 4 && !userFn; i++) userFn = (AccessorFn)GetProcAddress(h, userVers[i]);
    LoggedOnFn loggedOn = (LoggedOnFn)GetProcAddress(h, "SteamAPI_ISteamUser_BLoggedOn");
    GetStateFn getState = (GetStateFn)GetProcAddress(h, "SteamAPI_ISteamUGC_GetItemState");
    SubscribeFn subscribe = (SubscribeFn)GetProcAddress(h, "SteamAPI_ISteamUGC_SubscribeItem");
    DownloadFn download = (DownloadFn)GetProcAddress(h, "SteamAPI_ISteamUGC_DownloadItem");
    DlInfoFn dlInfo = (DlInfoFn)GetProcAddress(h, "SteamAPI_ISteamUGC_GetItemDownloadInfo");
    InstInfoFn instInfo = (InstInfoFn)GetProcAddress(h, "SteamAPI_ISteamUGC_GetItemInstallInfo");

    void *ugc = ugcFn ? ugcFn() : NULL;
    if (!ugc || !getState || !subscribe || !download) { if (shutdown) shutdown(); return fail("no_ugc"); }
    void *user = userFn ? userFn() : NULL;
    if (user && loggedOn && !loggedOn(user)) { if (shutdown) shutdown(); return fail("not_logged_on"); }

    out("READY");

    /* sync: подписка на всё недостающее и загрузка с высоким приоритетом всего, что не установлено или устарело */
    if (sync) {
        for (int i = 0; i < n; i++) {
            unsigned int st = getState(ugc, ids[i]);
            if (!(st & ST_SUBSCRIBED)) subscribe(ugc, ids[i]);
            if (!(st & ST_INSTALLED) || (st & ST_NEEDS_UPDATE)) download(ugc, ids[i], 1);
        }
    }

    char line[MAX_PATH * 2 + 128];
    char folder[MAX_PATH * 2];
    for (int tick = 0;; tick++) {
        if (callbacks) callbacks();
        int pending = 0;
        for (int i = 0; i < n; i++) {
            unsigned int st = getState(ugc, ids[i]);
            unsigned long long done = 0, total = 0, size = 0;
            unsigned int stamp = 0;
            folder[0] = '\0';
            if (dlInfo) dlInfo(ugc, ids[i], &done, &total);
            if (instInfo && (st & ST_INSTALLED)) instInfo(ugc, ids[i], &size, folder, sizeof(folder), &stamp);
            int ready = (st & ST_INSTALLED) && !(st & (ST_NEEDS_UPDATE | ST_DOWNLOADING | ST_PENDING));
            if (!ready) {
                pending++;
                /* Steam иногда «забывает» запрос: повтор раз в 20 с, если мод не качается и не в очереди */
                if (sync && tick > 0 && tick % 20 == 0 && !(st & (ST_DOWNLOADING | ST_PENDING))) {
                    if (!(st & ST_SUBSCRIBED)) subscribe(ugc, ids[i]);
                    download(ugc, ids[i], 1);
                }
            }
            _snprintf(line, sizeof(line) - 1, "S %llu %u %llu %llu %u %s", ids[i], st, done, total, stamp, folder);
            line[sizeof(line) - 1] = '\0';
            out(line);
        }
        if (!sync) break;
        if (!pending) { out("DONE"); break; }
        Sleep(1000);
    }
    if (shutdown) shutdown();
    return 0;
}
