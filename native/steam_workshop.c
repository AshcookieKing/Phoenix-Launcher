/* Steam Workshop (Arma 3, Windows x64). sync/state <id> ...; +id requests a repair.
 * S id state done total timestamp installSize folder, then TICK.
 * ITEM_ERR reason id EResult records a failed item; remaining mods still get their turn.
 * DONE means every requested item was installed. ERR is terminal.
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>
#include <errno.h>
#include <string.h>

typedef unsigned long long U64;
typedef unsigned char SteamBool;
enum { SUBSCRIBED = 1, INSTALLED = 4, NEEDS_UPDATE = 8, DOWNLOADING = 16, PENDING = 32 };
enum { APP_ID = 107410, CALL_COMPLETED = 703, SUBSCRIBE_RESULT = 1313, DOWNLOAD_RESULT = 3406 };
enum { MAX_ATTEMPTS = 3, SUBSCRIBE_TIMEOUT_MS = 60000, INSTALL_WAIT_MS = 120000, STALL_MS = 15 * 60000 };

typedef struct { int user, type; unsigned char *data; int length; } Callback;
typedef struct { U64 handle; int type; unsigned int size; } CallCompleted;
typedef struct { int result; U64 id; } SubscribeResult;
typedef struct { unsigned int appId; U64 id; int result; } DownloadResult;
_Static_assert(sizeof(Callback) == 24 && sizeof(DownloadResult) == 24 && sizeof(SubscribeResult) == 16,
               "Steamworks Windows x64 callback ABI");

static void *ugc, *user;
static int pipeHandle;
static SteamBool (*loggedOn)(void *);
static void (*runFrame)(int);
static SteamBool (*nextCallback)(int, Callback *);
static void (*freeCallback)(int);
static SteamBool (*callResult)(int, U64, void *, int, int, SteamBool *);
static unsigned int (*getState)(void *, U64);
static U64 (*subscribe)(void *, U64);
static SteamBool (*download)(void *, U64, SteamBool);
static SteamBool (*dlInfo)(void *, U64, U64 *, U64 *);
static SteamBool (*instInfo)(void *, U64, U64 *, char *, unsigned int, unsigned int *);

typedef struct { U64 id; int repair; } Item;
typedef struct {
    unsigned int flags, stamp;
    U64 done, total, size;
    char folder[4096];
} Status;
typedef struct { const char *code; int result; } Failure;

static void flushOutput(void)
{
    if (fflush(stdout) || ferror(stdout)) exit(3); /* Launcher closed its end of the pipe. */
}

static int fail(const char *code)
{
    printf("ERR %s\n", code);
    flushOutput();
    return 1;
}

static void *interfaceFor(HMODULE dll, const char *family, int highest, int lowest)
{
    char symbol[64];
    for (int version = highest; version >= lowest; version--) {
        snprintf(symbol, sizeof(symbol), "SteamAPI_Steam%s_v%03d", family, version);
        void *(*accessor)(void) = (void *)GetProcAddress(dll, symbol);
        if (accessor) return accessor();
    }
    return NULL;
}

static int installed(unsigned int flags)
{
    return (flags & INSTALLED) && !(flags & (NEEDS_UPDATE | DOWNLOADING | PENDING));
}

static Status statusOf(U64 id, int allowInstallInfo)
{
    Status s = {0};
    s.flags = getState(ugc, id);
    dlInfo(ugc, id, &s.done, &s.total);
    if (allowInstallInfo && installed(s.flags)) {
        if (!instInfo(ugc, id, &s.size, s.folder, sizeof(s.folder), &s.stamp)) s.folder[0] = '\0';
    }
    return s;
}

static void report(U64 id, const Status *s)
{
    printf("S %llu %u %llu %llu %u %llu %s\n", id, s->flags, s->done, s->total, s->stamp, s->size, s->folder);
}

static void tick(void)
{
    puts("TICK");
    flushOutput();
}

/* Use the SDK manual dispatcher for both asynchronous APIs. DownloadItemResult_t
 * is broadcast for every app; filter by app and Workshop ID. */
static void pump(U64 id, U64 subHandle, int *subResult, int *dlResult)
{
    Callback message;
    runFrame(pipeHandle);
    while (nextCallback(pipeHandle, &message)) {
        if (message.type == CALL_COMPLETED && message.length >= (int)sizeof(CallCompleted)) {
            const CallCompleted *c = (const CallCompleted *)message.data;
            if (subHandle && c->handle == subHandle && c->type == SUBSCRIBE_RESULT) {
                SubscribeResult result = {0};
                SteamBool failed = 0;
                SteamBool ok = callResult(pipeHandle, c->handle, &result, sizeof(result), SUBSCRIBE_RESULT, &failed);
                *subResult = ok && !failed && result.result ? result.result : 2;
            }
        } else if (message.type == DOWNLOAD_RESULT && message.length >= (int)sizeof(DownloadResult)) {
            const DownloadResult *result = (const DownloadResult *)message.data;
            if (result->appId == APP_ID && result->id == id) *dlResult = result->result ? result->result : 2;
        }
        freeCallback(pipeHandle);
    }
}

static int online(void)
{
    return !loggedOn || !user || loggedOn(user);
}

static Failure syncItem(Item item)
{
    int subResult = 0, dlResult = 0;
    U64 subHandle = 0;
    if (!(getState(ugc, item.id) & SUBSCRIBED)) {
        subHandle = subscribe(ugc, item.id);
        if (!subHandle) return (Failure){"subscribe", 0};
        U64 start = GetTickCount64();
        while (subResult != 1 || !(getState(ugc, item.id) & SUBSCRIBED)) {
            pump(item.id, subHandle, &subResult, &dlResult);
            if (!online()) return (Failure){"not_logged_on", 0};
            if (subResult && subResult != 1) return (Failure){"subscribe", subResult};
            if (GetTickCount64() - start >= SUBSCRIBE_TIMEOUT_MS) return (Failure){"subscribe", 16};
            Sleep(100);
        }
    }

    Status s = statusOf(item.id, 1);
    if (!item.repair && s.folder[0]) return (Failure){0};
    /* A high priority request pauses other Steam downloads. Only one such request
     * can be outstanding here; do not promote a transfer already in progress. */
    dlResult = 0;
    if (!download(ugc, item.id, !(s.flags & DOWNLOADING))) return (Failure){"download", 0};
    U64 changed = GetTickCount64();
    for (;;) {
        pump(item.id, 0, &subResult, &dlResult);
        if (!online()) return (Failure){"not_logged_on", 0};
        if (dlResult && dlResult != 1) return (Failure){"download", dlResult};
        Status next = statusOf(item.id, dlResult == 1);
        report(item.id, &next);
        tick();
        if (next.folder[0] && (next.flags & SUBSCRIBED)) return (Failure){0};
        if (s.done != next.done || s.total != next.total || s.flags != next.flags) changed = GetTickCount64();
        /* After all bytes have arrived, Steam may defer applying files while an
         * Arma session is open. Let the launcher release the AppID and retry. */
        unsigned int limit = next.total && next.done >= next.total ? INSTALL_WAIT_MS : STALL_MS;
        if (GetTickCount64() - changed >= limit) return (Failure){"stalled", 0};
        s = next;
        Sleep(1000);
    }
}

static int retryable(int result)
{
    /* Request not accepted, Fail, NoConnection, Busy, Timeout, ServiceUnavailable, IOFailure, RemoteCallFailed. */
    return result == 0 || result == 2 || result == 3 || result == 10 || result == 16 ||
           result == 20 || result == 37 || result == 55;
}

static int run(Item *items, int count, int sync)
{
    puts("READY");
    for (int i = 0; i < count; i++) {
        Status s = statusOf(items[i].id, !sync || !items[i].repair);
        report(items[i].id, &s);
    }
    tick();
    if (!sync) return 0;
    int failed = 0;
    for (int i = 0; i < count; i++) {
        Failure failure = {0};
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            failure = syncItem(items[i]);
            if (!failure.code) break;
            if (!strcmp(failure.code, "stalled") || !strcmp(failure.code, "not_logged_on")) {
                printf("ERR %s %llu\n", failure.code, items[i].id);
                flushOutput();
                return 1;
            }
            if (attempt == MAX_ATTEMPTS || !retryable(failure.result)) break;
            Sleep(2000 * attempt);
        }
        if (failure.code) {
            printf("ITEM_ERR %s %llu %d\n", failure.code, items[i].id, failure.result);
            flushOutput();
            failed++;
        }
    }
    for (int i = 0; i < count; i++) {
        Status s = statusOf(items[i].id, 1);
        report(items[i].id, &s);
        if (!(s.flags & SUBSCRIBED) || !s.folder[0]) failed++;
    }
    tick();
    if (failed) return fail("incomplete");
    puts("DONE");
    flushOutput();
    return 0;
}

int wmain(int argc, wchar_t **argv)
{
    if (argc < 4) return fail("usage");
    int sync = wcscmp(argv[2], L"sync") == 0;
    if (!sync && wcscmp(argv[2], L"state") != 0) return fail("usage");
    int count = argc - 3;
    Item *items = calloc(count, sizeof(Item));
    if (!items) return fail("memory");
    for (int i = 0; i < count; i++) {
        const wchar_t *arg = argv[3 + i];
        items[i].repair = *arg == L'+';
        arg += items[i].repair;
        if (!*arg || arg[wcsspn(arg, L"0123456789")]) return fail("usage");
        errno = 0;
        items[i].id = wcstoull(arg, NULL, 10);
        if (errno == ERANGE || !items[i].id) return fail("usage");
    }

    const wchar_t suffix[] = L"\\steam_api64.dll";
    size_t length = wcslen(argv[1]) + sizeof(suffix) / sizeof(*suffix);
    wchar_t *filename = calloc(length, sizeof(wchar_t));
    if (!filename) return fail("memory");
    swprintf(filename, length, L"%ls%ls", argv[1], suffix);
    SetEnvironmentVariableW(L"SteamAppId", L"107410");
    SetEnvironmentVariableW(L"SteamGameId", L"107410");
    HMODULE h = LoadLibraryExW(filename, NULL, LOAD_WITH_ALTERED_SEARCH_PATH);
    free(filename);
    if (!h) return fail("no_dll");

    int (*initFlat)(char *) = (void *)GetProcAddress(h, "SteamAPI_InitFlat");
    SteamBool (*initSafe)(void) = (void *)GetProcAddress(h, "SteamAPI_InitSafe");
    SteamBool (*running)(void) = (void *)GetProcAddress(h, "SteamAPI_IsSteamRunning");
    char err[1024] = {0};
    if (!(initFlat ? initFlat(err) == 0 : initSafe && initSafe())) return fail(running && !running() ? "no_steam" : "init");
    void (*shutdown)(void) = (void *)GetProcAddress(h, "SteamAPI_Shutdown");
    ugc = interfaceFor(h, "UGC", 21, 16);
    user = interfaceFor(h, "User", 23, 20);
    loggedOn = (void *)GetProcAddress(h, "SteamAPI_ISteamUser_BLoggedOn");
    getState = (void *)GetProcAddress(h, "SteamAPI_ISteamUGC_GetItemState");
    dlInfo = (void *)GetProcAddress(h, "SteamAPI_ISteamUGC_GetItemDownloadInfo");
    instInfo = (void *)GetProcAddress(h, "SteamAPI_ISteamUGC_GetItemInstallInfo");
    subscribe = (void *)GetProcAddress(h, "SteamAPI_ISteamUGC_SubscribeItem");
    download = (void *)GetProcAddress(h, "SteamAPI_ISteamUGC_DownloadItem");
    void (*initDispatch)(void) = (void *)GetProcAddress(h, "SteamAPI_ManualDispatch_Init");
    int (*getPipe)(void) = (void *)GetProcAddress(h, "SteamAPI_GetHSteamPipe");
    runFrame = (void *)GetProcAddress(h, "SteamAPI_ManualDispatch_RunFrame");
    nextCallback = (void *)GetProcAddress(h, "SteamAPI_ManualDispatch_GetNextCallback");
    freeCallback = (void *)GetProcAddress(h, "SteamAPI_ManualDispatch_FreeLastCallback");
    callResult = (void *)GetProcAddress(h, "SteamAPI_ManualDispatch_GetAPICallResult");

    int result;
    if (!ugc || !getState || !dlInfo || !instInfo ||
        (sync && (!subscribe || !download || !initDispatch || !getPipe || !runFrame || !nextCallback || !freeCallback || !callResult))) {
        result = fail("no_ugc");
    } else if (!online()) {
        result = fail("not_logged_on");
    } else {
        if (sync) { initDispatch(); pipeHandle = getPipe(); }
        result = run(items, count, sync);
    }
    if (shutdown) shutdown();
    free(items);
    return result;
}
