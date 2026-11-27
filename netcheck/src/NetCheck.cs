// Phoenix NetCheck — проверка и исправление сети для входа на 109.248.4.45:2302 + управление Zapret (Discord).
// 27.11: встроен в Phoenix Launcher. Без окна: PhoenixNetCheck.exe --json <файл> [--fix <id,id|auto>] - проверки
// (и исправления) с итогом в JSON; для исправлений с правами администратора программа сама один раз просит UAC.
// Окно - как раньше (при запуске просит права администратора; без них работает только проверка).
// Сборка: build.ps1 (Roslyn из .NET SDK, цель .NET Framework 4.x — работает на любой Windows 10/11 без установки).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PhoenixNetCheck
{
    enum St { Wait, Ok, Warn, Fail, Info }

    class CheckResult
    {
        public string Id;        // для лаунчера (JSON)
        public bool Admin;       // исправлению нужны права администратора
        public string Name;
        public St Status;
        public string Detail;
        public string FixName;   // null = нечего исправлять
        public Action Fix;
    }

    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | (SecurityProtocolType)12288;
            string json = Arg(args, "--json"), fix = Arg(args, "--fix");
            if (json != null) return Headless.Run(json, fix, args.Contains("--elevated"));
            // окно открывается с обычными правами; права администратора запрашиваются только по кнопке, которая их требует
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
            return 0;
        }

        public static string Arg(string[] args, string name)
        {
            int i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }
    }

    // ------------------------------------------------------------------ режим без окна (для Phoenix Launcher)
    static class Headless
    {
        // Сам чекер систему не меняет: исправления только по явному списку id (кнопка «Исправить» в лаунчере).
        // "--fix auto" ничего не исправляет.
        public static readonly string[] AutoIds = { };

        public static int Run(string outFile, string fix, bool elevated)
        {
            var log = new StringBuilder();
            var f = new MainForm();
            f.LogSink = m => log.AppendLine(m);
            f.InitZapretFolders();
            f.RunChecks();
            var done = new List<string>();
            var failed = new List<string>();
            bool uacDenied = false;
            if (!string.IsNullOrEmpty(fix))
            {
                var ids = fix == "auto" ? AutoIds : fix.Split(',').Select(x => x.Trim()).ToArray();
                var todo = f.Results.Where(r => r.Status != St.Ok && r.Status != St.Info && r.Fix != null && r.FixName != null && ids.Contains(r.Id)).ToList();
                if (todo.Any(r => r.Admin) && !MainForm.IsAdminNow() && !elevated)
                {
                    // всё исправляет копия с правами администратора (один запрос UAC) и сама пишет итог в outFile
                    try
                    {
                        if (File.Exists(outFile)) File.Delete(outFile);
                        var p = Process.Start(new ProcessStartInfo(Application.ExecutablePath,
                            "--json \"" + outFile + "\" --fix " + string.Join(",", todo.Select(r => r.Id)) + " --elevated")
                            { UseShellExecute = true, Verb = "runas" });
                        p.WaitForExit(180000);
                        if (File.Exists(outFile)) return 0;
                    }
                    catch (System.ComponentModel.Win32Exception) { uacDenied = true; }
                    todo = todo.Where(r => !r.Admin).ToList();
                }
                foreach (var r in todo)
                {
                    log.AppendLine("Исправляю: " + r.Name + " → " + r.FixName);
                    try { r.Fix(); done.Add(r.Id); }
                    catch (Exception e) { failed.Add(r.Id); log.AppendLine("  не вышло: " + e.Message); }
                }
                if (todo.Count > 0) f.RunChecks();
            }
            var sb = new StringBuilder("{\"admin\":" + (MainForm.IsAdminNow() ? "true" : "false") + ",\"uacDenied\":" + (uacDenied ? "true" : "false"));
            sb.Append(",\"fixed\":[" + string.Join(",", done.Select(Q)) + "],\"failed\":[" + string.Join(",", failed.Select(Q)) + "]");
            sb.Append(",\"results\":[");
            sb.Append(string.Join(",", f.Results.Select(r => "{\"id\":" + Q(r.Id) + ",\"name\":" + Q(r.Name) + ",\"status\":" + Q(r.Status.ToString().ToLowerInvariant()) +
                ",\"detail\":" + Q(r.Detail) + ",\"fix\":" + (r.Fix != null && r.FixName != null && r.Status != St.Ok ? Q(r.FixName) : "null") +
                ",\"admin\":" + (r.Admin ? "true" : "false") + ",\"auto\":" + (AutoIds.Contains(r.Id) ? "true" : "false") + "}")));
            sb.Append("],\"log\":" + Q(log.ToString()) + "}");
            var tmp = outFile + ".tmp";
            File.WriteAllText(tmp, sb.ToString(), new UTF8Encoding(false));
            if (File.Exists(outFile)) File.Delete(outFile);
            File.Move(tmp, outFile);
            return 0;
        }

        static string Q(string v)
        {
            if (v == null) return "null";
            var sb = new StringBuilder("\"");
            foreach (var c in v)
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }
    }

    // ------------------------------------------------------------------ сеть
    static class Net
    {
        public const string ServerIp = "109.248.4.45";
        public const int GamePort = 2302;
        // все серверы Phoenix: id, имя, query-порт (игровой + 1)
        public static readonly string[][] Servers = { new[] { "farabad", "Фарабад", "2303" }, new[] { "kamino", "Камино", "2403" }, new[] { "venator", "Венатор", "2503" } };
        public const int RoleApiPort = 8792;   // phx_roleapi: роли и вход через Discord в лаунчере

        public static bool TcpOpen(string host, int port, int timeoutMs, out long ms)
        {
            ms = 0;
            try
            {
                using (var c = new TcpClient())
                {
                    var sw = Stopwatch.StartNew();
                    var ar = c.BeginConnect(host, port, null, null);
                    if (!ar.AsyncWaitHandle.WaitOne(timeoutMs)) return false;
                    c.EndConnect(ar);
                    ms = sw.ElapsedMilliseconds;
                    return true;
                }
            }
            catch { return false; }
        }

        public static bool IsPrivate(IPAddress a)
        {
            var b = a.GetAddressBytes();
            if (b.Length != 4) return false;
            return b[0] == 10 || b[0] == 127 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168) || (b[0] == 100 && b[1] >= 64 && b[1] <= 127);
        }

        // Настоящий адрес хоста по DNS-over-HTTPS (Cloudflare), мимо DNS провайдера
        public static string DohA(string host)
        {
            try
            {
                var rq = (HttpWebRequest)WebRequest.Create("https://cloudflare-dns.com/dns-query?type=A&name=" + host);
                rq.Accept = "application/dns-json"; rq.Timeout = 6000; rq.Proxy = null;
                using (var r = rq.GetResponse()) using (var sr = new StreamReader(r.GetResponseStream()))
                {
                    var m = System.Text.RegularExpressions.Regex.Matches(sr.ReadToEnd(), "\"type\":1,[^}]*\"data\":\"(\\d+\\.\\d+\\.\\d+\\.\\d+)\"");
                    return m.Count > 0 ? m[0].Groups[1].Value : null;
                }
            }
            catch { return null; }
        }
        public static int QueryPort { get { return GamePort + 1; } }

        public class A2S { public bool Ok; public string Name, Map, Error; public int Players, Max; public long Ms; }

        // Steam A2S_INFO на query-порт (2303) — отвечает только живой Arma-сервер.
        public static A2S QueryServer(string ip, int port, int timeoutMs = 2500)
        {
            var res = new A2S();
            try
            {
                using (var u = new UdpClient())
                {
                    u.Client.ReceiveTimeout = timeoutMs;
                    u.Connect(ip, port);
                    var basePkt = new List<byte> { 0xFF, 0xFF, 0xFF, 0xFF, 0x54 };
                    basePkt.AddRange(Encoding.ASCII.GetBytes("Source Engine Query"));
                    basePkt.Add(0);
                    var sw = Stopwatch.StartNew();
                    byte[] pkt = basePkt.ToArray();
                    IPEndPoint ep = null;
                    byte[] r = null;
                    for (int attempt = 0; attempt < 3; attempt++)
                    {
                        u.Send(pkt, pkt.Length);
                        r = u.Receive(ref ep);
                        if (r.Length >= 9 && r[4] == 0x41) // challenge
                        {
                            var p2 = new List<byte>(basePkt);
                            p2.AddRange(r.Skip(5).Take(4));
                            pkt = p2.ToArray();
                            continue;
                        }
                        break;
                    }
                    res.Ms = sw.ElapsedMilliseconds;
                    if (r == null || r.Length < 6 || r[4] != 0x49) { res.Error = "неожиданный ответ"; return res; }
                    int i = 6;
                    res.Name = ReadZ(r, ref i);
                    res.Map = ReadZ(r, ref i);
                    ReadZ(r, ref i); ReadZ(r, ref i);
                    i += 2;
                    if (i + 1 < r.Length) { res.Players = r[i]; res.Max = r[i + 1]; }
                    res.Ok = true;
                }
            }
            catch (SocketException e) { res.Error = e.SocketErrorCode == SocketError.TimedOut ? "нет ответа (таймаут)" : e.Message; }
            catch (Exception e) { res.Error = e.Message; }
            return res;
        }

        static string ReadZ(byte[] b, ref int i)
        {
            int s = i;
            while (i < b.Length && b[i] != 0) i++;
            string v = Encoding.UTF8.GetString(b, s, i - s);
            i++;
            return v;
        }

        public class PingStat { public int Sent, Recv; public long Avg, Max; }
        public static PingStat PingMany(string host, int count, int timeout = 1500)
        {
            var st = new PingStat();
            var times = new List<long>();
            using (var p = new Ping())
            {
                for (int i = 0; i < count; i++)
                {
                    st.Sent++;
                    try
                    {
                        var r = p.Send(host, timeout);
                        if (r.Status == IPStatus.Success) { st.Recv++; times.Add(r.RoundtripTime); }
                    }
                    catch { }
                }
            }
            if (times.Count > 0) { st.Avg = (long)times.Average(); st.Max = times.Max(); }
            return st;
        }

        // Любой HTTP-ответ (даже 4xx) = TLS прошёл, DPI не режет.
        public static bool HttpsReachable(string url, int timeoutMs, out string info)
        {
            try
            {
                var rq = (HttpWebRequest)WebRequest.Create(url);
                rq.Timeout = timeoutMs; rq.ReadWriteTimeout = timeoutMs;
                rq.KeepAlive = false; rq.UserAgent = "Mozilla/5.0";
                rq.Proxy = null;
                using (var resp = (HttpWebResponse)rq.GetResponse()) { info = ((int)resp.StatusCode).ToString(); return true; }
            }
            catch (WebException e)
            {
                var hr = e.Response as HttpWebResponse;
                if (hr != null) { info = ((int)hr.StatusCode).ToString(); hr.Close(); return true; }
                info = e.Status.ToString();
                return false;
            }
            catch (Exception e) { info = e.Message; return false; }
        }

        public static bool DiscordOk(out string info)
        {
            string a, b, c;
            bool ok1 = HttpsReachable("https://discord.com/api/v9/gateway", 6000, out a);
            bool ok2 = HttpsReachable("https://gateway.discord.gg/", 6000, out b);
            bool ok3 = HttpsReachable("https://cdn.discordapp.com/", 6000, out c);
            info = string.Format("discord.com: {0}, gateway: {1}, cdn: {2}", a, b, c);
            return ok1 && ok2 && ok3;
        }

        // ---- TeamSpeak 3
        public const string TsMainIp = "185.104.249.127"; public const int TsMainPort = 10026;
        public const string TsProxyIp = "45.95.203.70"; public const int TsProxyPort = 41909;
        public static string[] AllTargets { get { return new[] { ServerIp, TsMainIp, TsProxyIp }; } }

        // Первый пакет рукопожатия клиента TS3 (TS3INIT1). Ответ с тем же заголовком = сервер жив и UDP проходит.
        public static bool Ts3Alive(string ip, int port, out long ms, int timeoutMs = 2500)
        {
            ms = 0;
            try
            {
                using (var u = new UdpClient())
                {
                    u.Client.ReceiveTimeout = timeoutMs;
                    u.Connect(ip, port);
                    var p = new List<byte>(Encoding.ASCII.GetBytes("TS3INIT1"));
                    p.AddRange(new byte[] { 0x00, 0x65, 0x88, 0x06, 0x3b, 0xec, 0xe9, 0x00 });
                    var ts = BitConverter.GetBytes((uint)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds); Array.Reverse(ts);
                    p.AddRange(ts);
                    var rnd = new byte[4]; new Random().NextBytes(rnd); p.AddRange(rnd);
                    p.AddRange(new byte[8]);
                    var sw = Stopwatch.StartNew();
                    for (int i = 0; i < 2; i++)
                    {
                        try
                        {
                            u.Send(p.ToArray(), p.Count);
                            IPEndPoint ep = null;
                            var r = u.Receive(ref ep);
                            ms = sw.ElapsedMilliseconds;
                            return r.Length >= 8 && Encoding.ASCII.GetString(r, 0, 8) == "TS3INIT1";
                        }
                        catch (SocketException) { }
                    }
                }
            }
            catch { }
            return false;
        }

        // ---- маршруты / VPN
        [System.Runtime.InteropServices.DllImport("iphlpapi.dll")]
        static extern int GetBestInterface(uint destAddr, out uint bestIfIndex);

        public static bool IsVpnName(string s)
        {
            s = s.ToLowerInvariant();
            return s.Contains("tap") || s.Contains("wireguard") || s.Contains("vpn") || s.Contains("wintun") || s.Contains("tun ")
                || s.Contains("openvpn") || s.Contains("amnezia") || s.Contains("radmin") || s.Contains("hamachi") || s.Contains("zerotier")
                || s.Contains("outline") || s.Contains("v2ray") || s.Contains("sing-box") || s.Contains("happ") || s.Contains("hiddify");
        }

        public static NetworkInterface IfByIndex(int idx)
        {
            foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
            {
                try { var p4 = n.GetIPProperties().GetIPv4Properties(); if (p4 != null && p4.Index == idx) return n; } catch { }
            }
            return null;
        }

        public static NetworkInterface RouteIf(string ip)
        {
            uint idx;
            uint addr = BitConverter.ToUInt32(IPAddress.Parse(ip).GetAddressBytes(), 0);
            return GetBestInterface(addr, out idx) == 0 ? IfByIndex((int)idx) : null;
        }

        public static bool ViaVpn(string ip)
        {
            var n = RouteIf(ip);
            return n != null && IsVpnName(n.Name + " " + n.Description);
        }

        // Физический адаптер (Ethernet/Wi-Fi) со шлюзом — через него пускаем серверы мимо VPN.
        public static bool PhysicalGateway(out string gw, out int ifIndex, out string name)
        {
            gw = null; ifIndex = 0; name = null;
            foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (n.OperationalStatus != OperationalStatus.Up) continue;
                if (IsVpnName(n.Name + " " + n.Description)) continue;
                if (n.NetworkInterfaceType != NetworkInterfaceType.Ethernet && n.NetworkInterfaceType != NetworkInterfaceType.Wireless80211 && n.NetworkInterfaceType != NetworkInterfaceType.GigabitEthernet) continue;
                var props = n.GetIPProperties();
                var g = props.GatewayAddresses.Select(a => a.Address).FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork && !a.Equals(IPAddress.Any));
                if (g == null) continue;
                gw = g.ToString(); ifIndex = props.GetIPv4Properties().Index; name = n.Name;
                return true;
            }
            return false;
        }

        public static void BypassVpn(Action<string> log)
        {
            string gw, name; int idx;
            if (!PhysicalGateway(out gw, out idx, out name)) throw new Exception("не найден обычный адаптер (Ethernet/Wi-Fi) со шлюзом");
            foreach (var ip in AllTargets)
            {
                Run("route", "delete " + ip);
                log("Маршрут " + ip + " → " + gw + " (" + name + "): " + Run("route", "-p add " + ip + " mask 255.255.255.255 " + gw + " metric 1 if " + idx));
            }
        }

        public static void RemoveBypass(Action<string> log)
        {
            foreach (var ip in AllTargets) log("route delete " + ip + ": " + Run("route", "delete " + ip));
        }

        public static string Run(string exe, string args, int timeoutMs = 30000)
        {
            try
            {
                var psi = new ProcessStartInfo(exe, args)
                {
                    UseShellExecute = false, CreateNoWindow = true,
                    RedirectStandardOutput = true, RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.GetEncoding(866)
                };
                using (var p = Process.Start(psi))
                {
                    string o = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
                    p.WaitForExit(timeoutMs);
                    return o.Trim();
                }
            }
            catch (Exception e) { return "ошибка: " + e.Message; }
        }
    }

    // ------------------------------------------------------------------ zapret
    static class Zapret
    {
        public const string ExcludeLine = Net.ServerIp + "/32";

        public static List<string> FindFolders()
        {
            var list = new List<string>();
            var roots = new List<string>
            {
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
                AppDomain.CurrentDomain.BaseDirectory,
                Path.GetDirectoryName(AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\')) ?? "",
                @"C:\", @"D:\"
            };
            foreach (var r in roots.Distinct())
            {
                try
                {
                    if (!Directory.Exists(r)) continue;
                    if (IsZapret(r)) list.Add(r);
                    foreach (var d in Directory.GetDirectories(r))
                        if (IsZapret(d)) list.Add(d);
                }
                catch { }
            }
            var svcDir = ServiceFolder();
            if (svcDir != null && IsZapret(svcDir)) list.Add(svcDir);
            return list.Select(x => Path.GetFullPath(x).TrimEnd('\\')).Distinct(StringComparer.OrdinalIgnoreCase)
                       .OrderByDescending(VerKey).ThenByDescending(x => x).ToList();
        }

        static Version VerKey(string path)
        {
            var m = System.Text.RegularExpressions.Regex.Match(Path.GetFileName(path), @"\d+(\.\d+)+");
            Version v;
            return m.Success && Version.TryParse(m.Value, out v) ? v : new Version(0, 0);
        }

        static bool IsZapret(string d)
        {
            return File.Exists(Path.Combine(d, @"bin\winws.exe")) && Directory.GetFiles(d, "general*.bat").Length > 0;
        }

        public static List<string> Strategies(string folder)
        {
            try
            {
                return Directory.GetFiles(folder, "general*.bat").Select(Path.GetFileNameWithoutExtension)
                    .OrderBy(x => x == "general" ? "" : x).ToList();
            }
            catch { return new List<string>(); }
        }

        // Достаём из .bat строку запуска winws.exe и подставляем переменные.
        public static string BuildArgs(string folder, string strategy, bool gameFilter)
        {
            var lines = File.ReadAllLines(Path.Combine(folder, strategy + ".bat"), Encoding.UTF8);
            var sb = new StringBuilder();
            bool on = false;
            foreach (var raw in lines)
            {
                string l = raw.TrimEnd();
                if (!on)
                {
                    int k = l.IndexOf("winws.exe\"", StringComparison.OrdinalIgnoreCase);
                    if (k < 0) continue;
                    on = true;
                    l = l.Substring(k + "winws.exe\"".Length);
                }
                bool cont = l.EndsWith("^");
                if (cont) l = l.Substring(0, l.Length - 1);
                sb.Append(' ').Append(l.Trim());
                if (!cont) break;
            }
            if (!on) throw new Exception("в " + strategy + ".bat не найден запуск winws.exe");
            string bin = Path.Combine(folder, "bin") + "\\";
            string lists = Path.Combine(folder, "lists") + "\\";
            string gf = gameFilter ? "1024-65535" : "12";
            string a = sb.ToString()
                .Replace("%BIN%", bin).Replace("%LISTS%", lists).Replace("%~dp0", folder + "\\")
                .Replace("%GameFilterTCP%", gf).Replace("%GameFilterUDP%", gf).Replace("%GameFilter%", gf);
            return a.Trim();
        }

        public static string ServiceImagePath()
        {
            using (var k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\zapret"))
                return k == null ? null : k.GetValue("ImagePath") as string;
        }

        public static string ServiceStrategy()
        {
            using (var k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\zapret"))
                return k == null ? null : k.GetValue("zapret-discord-youtube") as string;
        }

        public static string ServiceFolder()
        {
            var ip = ServiceImagePath();
            if (ip == null) return null;
            int s = ip.IndexOf('"'), e = s >= 0 ? ip.IndexOf('"', s + 1) : -1;
            string exe = s >= 0 && e > s ? ip.Substring(s + 1, e - s - 1) : ip.Split(' ')[0];
            var bin = Path.GetDirectoryName(exe);
            return bin == null ? null : Path.GetDirectoryName(bin);
        }

        public static string ServiceState()
        {
            string o = Net.Run("sc.exe", "query zapret");
            if (o.Contains("1060") || o.Contains("FAILED")) return null;
            if (o.Contains("RUNNING")) return "RUNNING";
            if (o.Contains("STOPPED")) return "STOPPED";
            return "OTHER";
        }

        public static Process[] WinwsProcs() { return Process.GetProcessesByName("winws"); }

        public static bool IsExcluded(string folder)
        {
            var f = Path.Combine(folder, @"lists\ipset-exclude-user.txt");
            if (!File.Exists(f)) return false;
            return File.ReadAllLines(f).Any(l => l.Trim() == ExcludeLine || l.Trim() == Net.ServerIp);
        }

        public static void AddExclude(string folder)
        {
            var f = Path.Combine(folder, @"lists\ipset-exclude-user.txt");
            if (IsExcluded(folder)) return;
            string cur = File.Exists(f) ? File.ReadAllText(f) : "";
            if (cur.Length > 0 && !cur.EndsWith("\n")) cur += "\r\n";
            File.WriteAllText(f, cur + ExcludeLine + "\r\n");
        }

        public static void StopAll(Action<string> log)
        {
            if (ServiceState() == "RUNNING") { log("Останавливаю службу zapret…"); Net.Run("sc.exe", "stop zapret"); }
            for (int i = 0; i < 20 && ServiceState() == "RUNNING"; i++) Thread.Sleep(300);
            foreach (var p in WinwsProcs()) { try { p.Kill(); p.WaitForExit(3000); } catch { } }
            Thread.Sleep(500);
        }

        public static void StartManual(string folder, string strategy, bool gameFilter, Action<string> log)
        {
            StopAll(log);
            string args = BuildArgs(folder, strategy, gameFilter);
            var psi = new ProcessStartInfo(Path.Combine(folder, @"bin\winws.exe"), args)
            {
                UseShellExecute = false, CreateNoWindow = true,
                WorkingDirectory = Path.Combine(folder, "bin"),
                WindowStyle = ProcessWindowStyle.Hidden
            };
            Process.Start(psi);
            Thread.Sleep(1500);
            if (WinwsProcs().Length == 0) throw new Exception("winws.exe сразу завершился — стратегия не стартовала");
            log("Zapret запущен: " + strategy + (gameFilter ? " (+игровой фильтр)" : ""));
        }

        public static void InstallService(string folder, string strategy, bool gameFilter, Action<string> log)
        {
            string args = BuildArgs(folder, strategy, gameFilter);
            StopAll(log);
            if (ServiceState() != null)
            {
                log("Удаляю старую службу zapret…");
                Net.Run("sc.exe", "delete zapret");
                Thread.Sleep(1500);
            }
            string exe = Path.Combine(folder, @"bin\winws.exe");
            log(Net.Run("sc.exe", "create zapret binPath= \"" + exe + "\" DisplayName= zapret start= auto"));
            using (var k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\zapret", true))
            {
                if (k == null) throw new Exception("служба не создалась (sc create)");
                k.SetValue("ImagePath", "\"" + exe + "\" " + args, RegistryValueKind.ExpandString);
                k.SetValue("Description", "Zapret DPI bypass software");
                k.SetValue("zapret-discord-youtube", strategy);
            }
            log(Net.Run("sc.exe", "start zapret"));
            Thread.Sleep(1500);
            log("Служба zapret: " + (ServiceState() ?? "нет") + ", стратегия " + strategy);
        }

        public static void RemoveService(Action<string> log)
        {
            StopAll(log);
            if (ServiceState() != null) log(Net.Run("sc.exe", "delete zapret"));
            Net.Run("sc.exe", "stop WinDivert");
            log("Служба zapret удалена");
        }
    }

    // ------------------------------------------------------------------ Arma / брандмауэр
    static class Arma
    {
        public static string FindExe()
        {
            var cands = new List<string>();
            foreach (var kp in new[] { @"SOFTWARE\WOW6432Node\Bohemia Interactive\arma 3", @"SOFTWARE\Bohemia Interactive\arma 3" })
            {
                try
                {
                    using (var k = Registry.LocalMachine.OpenSubKey(kp))
                        if (k != null && k.GetValue("main") is string) cands.Add((string)k.GetValue("main"));
                }
                catch { }
            }
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam"))
                {
                    var sp = k == null ? null : k.GetValue("SteamPath") as string;
                    if (sp != null)
                    {
                        cands.Add(Path.Combine(sp, @"steamapps\common\Arma 3"));
                        var vdf = Path.Combine(sp, @"steamapps\libraryfolders.vdf");
                        if (File.Exists(vdf))
                            foreach (var line in File.ReadAllLines(vdf))
                            {
                                var t = line.Trim();
                                if (t.StartsWith("\"path\""))
                                {
                                    var p = t.Substring(6).Trim().Trim('"').Replace("\\\\", "\\");
                                    cands.Add(Path.Combine(p, @"steamapps\common\Arma 3"));
                                }
                            }
                    }
                }
            }
            catch { }
            cands.Add(@"D:\SteamLibrary\steamapps\common\Arma 3");
            cands.Add(@"C:\Program Files (x86)\Steam\steamapps\common\Arma 3");
            foreach (var c in cands)
            {
                var e = Path.Combine(c, "arma3_x64.exe");
                if (File.Exists(e)) return e;
            }
            return null;
        }

        public static List<string> BlockRules(bool disable)
        {
            var found = new List<string>();
            var t = Type.GetTypeFromProgID("HNetCfg.FwPolicy2");
            dynamic pol = Activator.CreateInstance(t);
            foreach (dynamic r in pol.Rules)
            {
                string app = null; try { app = r.ApplicationName; } catch { }
                if (app == null) continue;
                string a = app.ToLowerInvariant();
                if (!(a.Contains("arma3") || a.EndsWith("steam.exe") || a.Contains("battleye") || a.Contains("beservice"))) continue;
                if ((int)r.Action == 0 && (bool)r.Enabled)
                {
                    found.Add((string)r.Name + " → " + app);
                    if (disable) r.Enabled = false;
                }
            }
            return found;
        }

        public static void AddAllow(string exe)
        {
            var t = Type.GetTypeFromProgID("HNetCfg.FwPolicy2");
            dynamic pol = Activator.CreateInstance(t);
            foreach (int dir in new[] { 1, 2 })
            {
                string name = "PhoenixNetCheck Arma3 " + (dir == 1 ? "IN" : "OUT");
                try { pol.Rules.Remove(name); } catch { }
                dynamic rule = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FWRule"));
                rule.Name = name;
                rule.ApplicationName = exe;
                rule.Protocol = 256;
                rule.Direction = dir;
                rule.Action = 1;
                rule.Profiles = 0x7FFFFFFF;
                rule.Enabled = true;
                pol.Rules.Add(rule);
            }
        }
    }

    // ------------------------------------------------------------------ UI
    class MainForm : Form
    {
        static readonly Color Bg = Color.FromArgb(24, 26, 31), Panel2 = Color.FromArgb(34, 37, 44),
            Fg = Color.FromArgb(225, 228, 235), Dim = Color.FromArgb(140, 146, 160),
            CGreen = Color.FromArgb(80, 200, 120), CYellow = Color.FromArgb(235, 190, 70),
            CRed = Color.FromArgb(235, 85, 85), CBlue = Color.FromArgb(90, 160, 240);

        ListView lv;
        TextBox logBox;
        Button btnCheck, btnFix, btnStart, btnStop, btnAuto, btnSvc, btnSvcDel, btnFlush, btnWinsock, btnCopy, btnBypass, btnUnbypass;
        ComboBox cbFolder, cbStrat;
        CheckBox chkGame;
        Label lblServer, lblZapret;
        List<CheckResult> results = new List<CheckResult>();
        volatile bool busy;

        public Action<string> LogSink;            // режим без окна: журнал сюда
        public List<CheckResult> Results { get { lock (results) return new List<CheckResult>(results); } }
        public static bool IsAdminNow() { return IsAdmin(); }

        public void InitZapretFolders()
        {
            var folders = Zapret.FindFolders();
            foreach (var f in folders) cbFolder.Items.Add(f);
            if (folders.Count > 0) cbFolder.SelectedIndex = 0;
        }

        public MainForm()
        {
            Text = "Phoenix NetCheck — " + Net.ServerIp + ":" + Net.GamePort;
            Font = new Font("Segoe UI", 9.5f);
            BackColor = Bg; ForeColor = Fg;
            ClientSize = new Size(1080, 760);
            MinimumSize = new Size(900, 600);
            StartPosition = FormStartPosition.CenterScreen;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            var top = new Panel { Dock = DockStyle.Top, Height = 64, BackColor = Panel2, Padding = new Padding(14, 8, 14, 8) };
            var title = new Label { Text = "Проверка соединения с сервером", Font = new Font("Segoe UI Semibold", 13f), AutoSize = true, Location = new Point(14, 8) };
            lblServer = new Label { Text = "Сервер " + Net.ServerIp + ":" + Net.GamePort + " — не проверен", ForeColor = Dim, AutoSize = true, Location = new Point(16, 36) };
            top.Controls.Add(title); top.Controls.Add(lblServer);

            // правая панель — zapret
            var right = new Panel { Dock = DockStyle.Right, Width = 330, BackColor = Panel2, Padding = new Padding(14) };
            int y = 12;
            right.Controls.Add(MkLabel("Zapret (Discord / YouTube)", 14, y, true)); y += 30;
            right.Controls.Add(MkLabel("Папка zapret:", 14, y, false)); y += 22;
            cbFolder = MkCombo(14, y, 300); right.Controls.Add(cbFolder); y += 34;
            right.Controls.Add(MkLabel("Стратегия:", 14, y, false)); y += 22;
            cbStrat = MkCombo(14, y, 300); right.Controls.Add(cbStrat); y += 34;
            chkGame = new CheckBox { Text = "Игровой фильтр (обычно НЕ нужен)", Location = new Point(14, y), AutoSize = true, ForeColor = Fg };
            right.Controls.Add(chkGame); y += 32;
            btnStart = MkBtn("▶ Запустить", 14, y, 145, CGreen); btnStop = MkBtn("■ Остановить", 169, y, 145, CRed);
            right.Controls.Add(btnStart); right.Controls.Add(btnStop); y += 42;
            btnAuto = MkBtn("Автоподбор рабочей стратегии", 14, y, 300, CBlue); right.Controls.Add(btnAuto); y += 42;
            btnSvc = MkBtn("Установить службой (автозапуск)", 14, y, 300, Panel2); right.Controls.Add(btnSvc); y += 42;
            btnSvcDel = MkBtn("Удалить службу zapret", 14, y, 300, Panel2); right.Controls.Add(btnSvcDel); y += 46;
            lblZapret = new Label { Location = new Point(14, y), Size = new Size(300, 110), ForeColor = Dim, Text = "…" };
            right.Controls.Add(lblZapret); y += 116;
            right.Controls.Add(MkLabel("Сеть Windows", 14, y, true)); y += 30;
            btnFlush = MkBtn("Сбросить DNS-кэш", 14, y, 300, Panel2); right.Controls.Add(btnFlush); y += 42;
            btnWinsock = MkBtn("Сброс Winsock/TCP-IP (нужна перезагрузка)", 14, y, 300, Panel2); right.Controls.Add(btnWinsock); y += 42;
            btnBypass = MkBtn("Серверы мимо VPN", 14, y, 145, CYellow); btnUnbypass = MkBtn("Убрать обход", 169, y, 145, Panel2);
            right.Controls.Add(btnBypass); right.Controls.Add(btnUnbypass);
            btnBypass.Click += (s, e) => { if (!Ask("Добавить маршруты к серверам Phoenix мимо VPN?") || !NeedAdmin()) return; RunBg(() => { Net.BypassVpn(Log); RunChecks(); }); };
            btnUnbypass.Click += (s, e) => { if (!NeedAdmin()) return; RunBg(() => { Net.RemoveBypass(Log); RunChecks(); }); };

            // центр — проверки
            var center = new Panel { Dock = DockStyle.Fill, Padding = new Padding(14, 10, 14, 10) };
            var bar = new Panel { Dock = DockStyle.Top, Height = 46 };
            btnCheck = MkBtn("Проверить", 0, 4, 150, CBlue);
            btnFix = MkBtn("Исправить найденное", 160, 4, 190, CGreen);
            btnCopy = MkBtn("Копировать отчёт", 360, 4, 150, Panel2);
            bar.Controls.Add(btnCheck); bar.Controls.Add(btnFix); bar.Controls.Add(btnCopy);

            lv = new ListView
            {
                Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, HeaderStyle = ColumnHeaderStyle.Nonclickable,
                BackColor = Bg, ForeColor = Fg, BorderStyle = BorderStyle.None, OwnerDraw = true
            };
            lv.Columns.Add("", 34); lv.Columns.Add("Проверка", 210); lv.Columns.Add("Результат", 420);
            lv.DrawColumnHeader += (s, e) => { e.Graphics.FillRectangle(new SolidBrush(Panel2), e.Bounds); TextRenderer.DrawText(e.Graphics, e.Header.Text, Font, e.Bounds, Dim, TextFormatFlags.VerticalCenter | TextFormatFlags.Left); };
            lv.DrawSubItem += DrawSub;
            lv.Resize += (s, e) => { lv.Columns[2].Width = Math.Max(200, lv.ClientSize.Width - 250); };

            logBox = new TextBox
            {
                Dock = DockStyle.Bottom, Height = 170, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical,
                BackColor = Color.FromArgb(16, 17, 21), ForeColor = Dim, BorderStyle = BorderStyle.None, Font = new Font("Consolas", 9f)
            };
            center.Controls.Add(lv); center.Controls.Add(new Panel { Dock = DockStyle.Bottom, Height = 8 });
            center.Controls.Add(logBox); center.Controls.Add(bar);

            Controls.Add(center); Controls.Add(right); Controls.Add(top);

            btnCheck.Click += (s, e) => RunBg(RunChecks);
            btnFix.Click += (s, e) =>
            {
                List<CheckResult> todo;
                lock (results) todo = results.Where(r => r.Status != St.Ok && r.Fix != null && r.FixName != null).ToList();
                if (todo.Count == 0) { Log("Исправлять нечего"); return; }
                if (!Ask("Будет изменено:" + NL + string.Join(NL, todo.Select(r => "- " + r.Name + ": " + r.FixName)) + NL + NL + "Продолжить?")) return;
                if (todo.Any(r => r.Admin) && !NeedAdmin()) return;
                RunBg(FixAll);
            };
            btnCopy.Click += (s, e) => CopyReport();
            btnStart.Click += (s, e) => { if (!NeedAdmin()) return; var f = Folder; var st = Strat; var g = chkGame.Checked; RunBg(() => { Zapret.StartManual(f, st, g, Log); CheckDiscordOnly(); }); };
            btnStop.Click += (s, e) => { if (!NeedAdmin()) return; RunBg(() => { Zapret.StopAll(Log); Log("Zapret остановлен"); }); };
            btnAuto.Click += (s, e) => { if (!Ask("Автоподбор по очереди запустит стратегии zapret (winws.exe и драйвер WinDivert). Продолжить?") || !NeedAdmin()) return; var f = Folder; var g = chkGame.Checked; RunBg(() => AutoPick(f, g)); };
            btnSvc.Click += (s, e) =>
            {
                var f = Folder; var st = Strat; var g = chkGame.Checked;
                if (!NeedAdmin()) return;
                if (Ask("Установить zapret службой Windows со стратегией «" + st + "»?\nОна будет запускаться автоматически при старте ПК (старая служба zapret будет заменена)."))
                    RunBg(() => { Zapret.AddExclude(f); Zapret.InstallService(f, st, g, Log); CheckDiscordOnly(); });
            };
            btnSvcDel.Click += (s, e) => { if (NeedAdmin() && Ask("Удалить службу zapret? Discord может перестать работать до запуска zapret вручную.")) RunBg(() => Zapret.RemoveService(Log)); };
            btnFlush.Click += (s, e) => RunBg(() => Log(Net.Run("ipconfig", "/flushdns")));
            btnWinsock.Click += (s, e) =>
            {
                if (NeedAdmin() && Ask("Сбросить Winsock и стек TCP/IP?\nЭто лечит «сломанную» сеть после VPN/прокси, но сбрасывает ручные настройки IP/DNS адаптеров. После — перезагрузите ПК."))
                    RunBg(() => { Log(Net.Run("netsh", "winsock reset")); Log(Net.Run("netsh", "int ip reset")); Log("Готово. Перезагрузите компьютер."); });
            };
            cbFolder.SelectedIndexChanged += (s, e) => FillStrategies();

            Load += (s, e) =>
            {
                Log("Запуск. Администратор: " + (IsAdmin() ? "да" : "нет — проверка работает; права попросятся только при нажатии исправления"));
                var folders = Zapret.FindFolders();
                foreach (var f in folders) cbFolder.Items.Add(f);
                if (folders.Count == 0) Log("Папка zapret не найдена. Положите zapret-discord-youtube рядом с программой или на Рабочий стол.");
                else cbFolder.SelectedIndex = 0;
                RunBg(RunChecks);
            };
        }

        string Folder { get { return cbFolder.SelectedItem as string; } }
        string Strat { get { return cbStrat.SelectedItem as string; } }

        void FillStrategies()
        {
            cbStrat.Items.Clear();
            if (Folder == null) return;
            string svcStrat = Zapret.ServiceStrategy();
            foreach (var s in Zapret.Strategies(Folder)) cbStrat.Items.Add(s);
            int idx = svcStrat == null ? -1 : cbStrat.Items.IndexOf(svcStrat);
            cbStrat.SelectedIndex = idx >= 0 ? idx : (cbStrat.Items.Count > 0 ? 0 : -1);
            chkGame.Checked = File.Exists(Path.Combine(Folder, @"utils\game_filter.enabled")) && false;
        }

        static bool IsAdmin()
        {
            var id = System.Security.Principal.WindowsIdentity.GetCurrent();
            return new System.Security.Principal.WindowsPrincipal(id).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        }

        // true - права уже есть. Иначе спрашивает и перезапускает окно через UAC (это окно закрывается).
        static readonly string NL = Environment.NewLine;
        bool NeedAdmin()
        {
            if (IsAdmin()) return true;
            if (!Ask("Для этого действия нужны права администратора. Перезапустить окно чекера с правами (Windows спросит разрешение)?")) return false;
            try
            {
                Process.Start(new ProcessStartInfo(Application.ExecutablePath) { UseShellExecute = true, Verb = "runas" });
                Close();
            }
            catch { Log("Права администратора не выданы"); }
            return false;
        }

        bool Ask(string q) { return MessageBox.Show(this, q, "Подтверждение", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes; }

        Label MkLabel(string t, int x, int y, bool head)
        {
            return new Label { Text = t, Location = new Point(x, y), AutoSize = true, ForeColor = head ? Fg : Dim, Font = head ? new Font("Segoe UI Semibold", 11f) : Font };
        }
        ComboBox MkCombo(int x, int y, int w)
        {
            return new ComboBox { Location = new Point(x, y), Width = w, DropDownStyle = ComboBoxStyle.DropDownList, BackColor = Bg, ForeColor = Fg, FlatStyle = FlatStyle.Flat };
        }
        Button MkBtn(string t, int x, int y, int w, Color c)
        {
            var b = new Button { Text = t, Location = new Point(x, y), Size = new Size(w, 34), FlatStyle = FlatStyle.Flat, BackColor = c == Panel2 ? Color.FromArgb(48, 52, 62) : c, ForeColor = c == Panel2 ? Fg : Color.FromArgb(15, 15, 18), Cursor = Cursors.Hand };
            b.FlatAppearance.BorderSize = 0;
            if (c != Panel2) b.Font = new Font("Segoe UI Semibold", 9.5f);
            return b;
        }

        void DrawSub(object s, DrawListViewSubItemEventArgs e)
        {
            var r = e.Item.Tag as CheckResult;
            var bg = e.ItemIndex % 2 == 0 ? Bg : Color.FromArgb(29, 31, 37);
            e.Graphics.FillRectangle(new SolidBrush(bg), e.Bounds);
            if (e.ColumnIndex == 0)
            {
                Color c = r == null ? Dim : r.Status == St.Ok ? CGreen : r.Status == St.Warn ? CYellow : r.Status == St.Fail ? CRed : r.Status == St.Info ? CBlue : Dim;
                e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                int d = 12;
                e.Graphics.FillEllipse(new SolidBrush(c), e.Bounds.X + 11, e.Bounds.Y + (e.Bounds.Height - d) / 2, d, d);
                return;
            }
            var fg = e.ColumnIndex == 1 ? Fg : Dim;
            TextRenderer.DrawText(e.Graphics, e.SubItem.Text, Font, new Rectangle(e.Bounds.X + 4, e.Bounds.Y, e.Bounds.Width - 6, e.Bounds.Height), fg,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
        }

        void Log(string m)
        {
            if (string.IsNullOrEmpty(m)) return;
            if (LogSink != null) { LogSink(m); return; }
            if (InvokeRequired) { BeginInvoke(new Action<string>(Log), m); return; }
            logBox.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + m.Replace("\n", "\r\n    ") + "\r\n");
        }

        void Ui(Action a) { if (InvokeRequired) Invoke(a); else a(); }

        void RunBg(Action a)
        {
            if (busy) { Log("Подождите — предыдущая операция ещё идёт"); return; }
            busy = true;
            SetButtons(false);
            var t = new Thread(() =>
            {
                try { a(); }
                catch (Exception ex) { Log("ОШИБКА: " + ex.Message); }
                finally { busy = false; Ui(() => { SetButtons(true); UpdateZapretLabel(); }); }
            }) { IsBackground = true };
            t.Start();
        }

        void SetButtons(bool on)
        {
            foreach (var b in new[] { btnCheck, btnFix, btnStart, btnStop, btnAuto, btnSvc, btnSvcDel, btnFlush, btnWinsock, btnBypass, btnUnbypass }) b.Enabled = on;
            Cursor = on ? Cursors.Default : Cursors.AppStarting;
        }

        void UpdateZapretLabel()
        {
            var st = Zapret.ServiceState();
            var procs = Zapret.WinwsProcs().Length;
            var sf = Zapret.ServiceFolder();
            lblZapret.Text = "Служба: " + (st == null ? "не установлена" : st + " (" + (Zapret.ServiceStrategy() ?? "?") + ")") +
                (sf != null ? "\nиз: " + sf : "") + "\nПроцессов winws: " + procs +
                (Folder != null ? "\nСервер в исключениях: " + (Zapret.IsExcluded(Folder) ? "да" : "нет") : "");
        }

        void SetRows(List<CheckResult> list)
        {
            Ui(() =>
            {
                lv.BeginUpdate();
                lv.Items.Clear();
                foreach (var r in list)
                {
                    var it = new ListViewItem(new[] { "", r.Name, r.Detail + (r.FixName != null && r.Status != St.Ok ? "   → исправление: " + r.FixName : "") }) { Tag = r };
                    lv.Items.Add(it);
                }
                lv.EndUpdate();
            });
        }

        void Add(CheckResult r)
        {
            if (r.Id == null) r.Id = IdOf(r.Name);
            if (Array.IndexOf(new[] { "route", "firewall", "hosts", "zapret", "lancache" }, r.Id) >= 0) r.Admin = true;
            lock (results) results.Add(r);
            if (LogSink == null) SetRows(new List<CheckResult>(results));
        }

        static string IdOf(string name)
        {
            if (name.StartsWith("Arma-сервер")) return "a2s_farabad";
            switch (name)
            {
                case "Интернет": return "inet";
                case "DNS": return "dns";
                case "Пинг до сервера": return "ping";
                case "TeamSpeak 3": return "ts";
                case "Маршрут к серверам": return "route";
                case "Брандмауэр Windows": return "firewall";
                case "Прокси / VPN": return "proxy";
                case "Файл hosts": return "hosts";
                case "Steam": return "steam";
                case "Zapret": return "zapret";
                case "Discord": return "discord";
                default: return name.ToLowerInvariant().Replace(' ', '_');
            }
        }

        // ------------------------------------------------ проверки
        public void RunChecks()
        {
            lock (results) results.Clear();
            SetRows(results);
            Log("=== Проверка ===");
            Ui(() => { lblServer.Text = "Сервер " + Net.ServerIp + ":" + Net.GamePort + " — проверяю…"; lblServer.ForeColor = Dim; });

            // 1. Интернет
            var inet = Net.PingMany("1.1.1.1", 3);
            var inet2 = inet.Recv > 0 ? inet : Net.PingMany("8.8.8.8", 3);
            Add(new CheckResult
            {
                Name = "Интернет",
                Status = inet2.Recv > 0 ? St.Ok : St.Fail,
                Detail = inet2.Recv > 0 ? "есть, пинг " + inet2.Avg + " мс" : "нет ответа от 1.1.1.1 и 8.8.8.8 — проверьте кабель/Wi-Fi/роутер",
                FixName = inet2.Recv > 0 ? null : "сброс DNS",
                Fix = () => Log(Net.Run("ipconfig", "/flushdns"))
            });

            // 2. DNS
            bool dnsOk; string dnsInfo;
            try { var a = Dns.GetHostAddresses("discord.com"); dnsOk = a.Length > 0; dnsInfo = "discord.com → " + a[0]; }
            catch (Exception e) { dnsOk = false; dnsInfo = e.Message; }
            Add(new CheckResult { Name = "DNS", Status = dnsOk ? St.Ok : St.Fail, Detail = dnsInfo, FixName = dnsOk ? null : "сброс DNS-кэша", Fix = () => Log(Net.Run("ipconfig", "/flushdns")) });

            // 3. Пинг до сервера
            var ps = Net.PingMany(Net.ServerIp, 10, 1200);
            int loss = ps.Sent == 0 ? 100 : (ps.Sent - ps.Recv) * 100 / ps.Sent;
            Add(new CheckResult
            {
                Name = "Пинг до сервера",
                Status = ps.Recv == 0 ? St.Warn : loss > 10 || ps.Avg > 150 ? St.Warn : St.Ok,
                Detail = ps.Recv == 0 ? "ICMP не отвечает (сервер может блокировать пинг — смотрите следующую строку)"
                                      : string.Format("ср. {0} мс, макс {1} мс, потери {2}%", ps.Avg, ps.Max, loss) + (loss > 10 ? " — нестабильная связь" : "")
            });

            // 4. Arma A2S
            var q = Net.QueryServer(Net.ServerIp, Net.QueryPort);
            if (!q.Ok) { Thread.Sleep(500); q = Net.QueryServer(Net.ServerIp, Net.QueryPort, 4000); }
            Add(new CheckResult
            {
                Name = "Arma-сервер (UDP " + Net.QueryPort + ")",
                Status = q.Ok ? St.Ok : St.Fail,
                Detail = q.Ok ? string.Format("«{0}», карта {1}, игроков {2}/{3}, ответ {4} мс", q.Name, q.Map, q.Players, q.Max, q.Ms)
                              : "сервер не отвечает: " + q.Error + ". Если интернет есть — сервер выключен/перезапускается, или UDP режет zapret/VPN/брандмауэр"
            });
            Ui(() =>
            {
                lblServer.Text = q.Ok ? "Сервер онлайн: " + q.Name + " — " + q.Players + "/" + q.Max + " игроков" : "Сервер не отвечает на UDP " + Net.QueryPort;
                lblServer.ForeColor = q.Ok ? CGreen : CRed;
            });

            // 4b. TeamSpeak 3
            long t1, t2;
            bool tsMain = Net.Ts3Alive(Net.TsMainIp, Net.TsMainPort, out t1);
            bool tsProxy = Net.Ts3Alive(Net.TsProxyIp, Net.TsProxyPort, out t2);
            Add(new CheckResult
            {
                Name = "TeamSpeak 3",
                Status = tsMain ? St.Ok : tsProxy ? St.Warn : St.Fail,
                Detail = "основной " + Net.TsMainIp + ":" + Net.TsMainPort + " — " + (tsMain ? "OK " + t1 + " мс" : "нет ответа") +
                         "; прокси " + Net.TsProxyIp + ":" + Net.TsProxyPort + " — " + (tsProxy ? "OK " + t2 + " мс" : "нет ответа") +
                         (!tsMain && tsProxy ? " → подключайтесь через прокси или включите обход VPN" : "") + ". Альтернативный адрес в клиенте: PhoenixRP"
            });

            // 4c. Маршрут через VPN
            var viaVpn = Net.AllTargets.Where(Net.ViaVpn).ToList();
            string vgw, vname; int vidx;
            bool hasGw = Net.PhysicalGateway(out vgw, out vidx, out vname);
            var rIf = Net.RouteIf(Net.ServerIp);
            Add(new CheckResult
            {
                Name = "Маршрут к серверам",
                Status = viaVpn.Count > 0 ? St.Warn : St.Ok,
                Detail = viaVpn.Count > 0
                    ? "идут через VPN (" + (Net.RouteIf(viaVpn[0]) ?? rIf).Name + "): " + string.Join(", ", viaVpn) + ". С VPN TS/игра могут не подключаться"
                    : "напрямую через " + (rIf != null ? rIf.Name : "?") + " — VPN не мешает",
                FixName = viaVpn.Count > 0 && hasGw ? "пустить серверы мимо VPN через " + vname + " (" + vgw + ")" : null,
                Fix = () => Net.BypassVpn(Log)
            });

            // 5. Zapret и исключение сервера
            CheckZapret();

            // 6. Брандмауэр
            try
            {
                var blocks = Arma.BlockRules(false);
                var exe = Arma.FindExe();
                Add(new CheckResult
                {
                    Name = "Брандмауэр Windows",
                    Status = blocks.Count > 0 ? St.Fail : St.Ok,
                    Detail = blocks.Count > 0 ? "блокирующие правила: " + string.Join("; ", blocks) : "блокирующих правил для Arma/Steam нет" + (exe != null ? "" : " (arma3_x64.exe не найден)"),
                    FixName = blocks.Count > 0 ? "отключить блокировку и разрешить Arma" : null,
                    Fix = () => { Arma.BlockRules(true); if (exe != null) Arma.AddAllow(exe); Log("Правила брандмауэра исправлены"); }
                });
            }
            catch (Exception e) { Add(new CheckResult { Name = "Брандмауэр Windows", Status = St.Info, Detail = "не удалось прочитать: " + e.Message }); }

            // 7. Прокси / VPN
            string proxy = null;
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Internet Settings"))
                    if (k != null && Convert.ToInt32(k.GetValue("ProxyEnable", 0)) == 1) proxy = k.GetValue("ProxyServer") as string ?? "вкл";
            }
            catch { }
            var vpn = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up)
                .Where(n => { var d = (n.Description + " " + n.Name).ToLowerInvariant(); return d.Contains("tap") || d.Contains("wireguard") || d.Contains("vpn") || d.Contains("wintun") || d.Contains("tun ") || d.Contains("openvpn") || d.Contains("amnezia") || d.Contains("radmin") || d.Contains("hamachi") || d.Contains("zerotier"); })
                .Select(n => n.Name).ToList();
            Add(new CheckResult
            {
                Name = "Прокси / VPN",
                Status = proxy != null || vpn.Count > 0 ? St.Warn : St.Ok,
                Detail = (proxy != null ? "системный прокси: " + proxy + ". " : "") + (vpn.Count > 0 ? "активные VPN/виртуальные адаптеры: " + string.Join(", ", vpn) + " — если не заходит, выключите VPN" : "") +
                         (proxy == null && vpn.Count == 0 ? "нет" : ""),
                FixName = proxy != null ? "выключить системный прокси" : null,
                Fix = () =>
                {
                    using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Internet Settings", true)) k.SetValue("ProxyEnable", 0);
                    Log("Системный прокси выключен");
                }
            });

            // 8. hosts
            try
            {
                var hosts = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"drivers\etc\hosts");
                var bad = File.ReadAllLines(hosts).Select(l => l.Trim()).Where(l => !l.StartsWith("#") && l.Length > 0)
                    .Where(l => !l.Contains("# Phoenix Launcher"))
                    .Where(l => l.Contains(Net.ServerIp) || l.ToLowerInvariant().Contains("steampowered") || l.ToLowerInvariant().Contains("steamcontent")
                             || l.ToLowerInvariant().Contains("steamcommunity")).ToList();
                Add(new CheckResult
                {
                    Name = "Файл hosts",
                    Status = bad.Count > 0 ? St.Warn : St.Ok,
                    Detail = bad.Count > 0 ? "подозрительные строки: " + string.Join(" | ", bad) : "чистый (Steam и сервер не переопределены)",
                    FixName = bad.Count > 0 ? "закомментировать эти строки" : null,
                    Fix = () =>
                    {
                        File.Copy(hosts, hosts + ".phxbak", true);
                        var lines = File.ReadAllLines(hosts).Select(l => bad.Contains(l.Trim()) ? "# " + l : l).ToArray();
                        File.WriteAllLines(hosts, lines);
                        Net.Run("ipconfig", "/flushdns");
                        Log("hosts исправлен (копия: hosts.phxbak)");
                    }
                });
            }
            catch (Exception e) { Add(new CheckResult { Name = "Файл hosts", Status = St.Info, Detail = e.Message }); }

            // 8b. остальные серверы Phoenix и сервер входа (вход через Discord в лаунчере)
            foreach (var sv in Net.Servers.Skip(1))
            {
                var qs = Net.QueryServer(Net.ServerIp, int.Parse(sv[2]));
                Add(new CheckResult
                {
                    Id = "a2s_" + sv[0], Name = sv[1] + " (UDP " + sv[2] + ")",
                    Status = qs.Ok ? St.Ok : St.Warn,
                    Detail = qs.Ok ? string.Format("онлайн, игроков {0}/{1}, ответ {2} мс", qs.Players, qs.Max, qs.Ms) : "не отвечает: " + qs.Error + " (сервер может быть выключен)"
                });
            }
            long rms;
            bool roleApi = Net.TcpOpen(Net.ServerIp, Net.RoleApiPort, 4000, out rms);
            Add(new CheckResult
            {
                Id = "roleapi", Name = "Сервер входа Phoenix (TCP " + Net.RoleApiPort + ")",
                Status = roleApi ? St.Ok : St.Warn,
                Detail = roleApi ? "доступен, " + rms + " мс" : "недоступен — вход через Discord в лаунчере не сработает; вход в игре по SteamID работает"
            });

            // 8c. Steam: сайт/API (моды, вход) и подмена кэша загрузок (lancache провайдера)
            string sa, sc;
            bool steamApi = Net.HttpsReachable("https://api.steampowered.com/", 8000, out sa);
            bool steamCom = Net.HttpsReachable("https://steamcommunity.com/", 8000, out sc);
            Add(new CheckResult
            {
                Id = "steam_web", Name = "Steam (API и Workshop)",
                Status = steamApi && steamCom ? St.Ok : St.Warn,
                Detail = "api.steampowered.com: " + sa + ", steamcommunity.com: " + sc + (steamApi && steamCom ? "" : " — Workshop может не обновлять моды; помогает обход блокировок")
            });
            try
            {
                var hostsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"drivers\etc\hosts");
                IPAddress[] lan = new IPAddress[0];
                try { lan = Dns.GetHostAddresses("lancache.steamcontent.com"); } catch { }
                var priv = lan.FirstOrDefault(Net.IsPrivate);
                bool pinned = File.ReadAllLines(hostsPath).Any(l => !l.Trim().StartsWith("#") && l.ToLowerInvariant().Contains("lancache.steamcontent.com"));
                Add(new CheckResult
                {
                    Id = "lancache", Name = "Кэш загрузок Steam",
                    Status = priv != null && !pinned ? St.Warn : St.Ok,
                    Detail = priv != null && !pinned ? "DNS провайдера отправляет загрузки Steam в свой кэш " + priv + " — моды могут качаться медленно или битыми"
                           : pinned ? "закреплён в hosts" : "обычные серверы Valve",
                    FixName = priv != null && !pinned ? "закрепить настоящий адрес кэша Steam в hosts" : null,
                    Fix = () =>
                    {
                        var ip = Net.DohA("lancache.steamcontent.com") ?? "162.254.198.13";
                        File.Copy(hostsPath, hostsPath + ".phxbak", true);
                        File.AppendAllText(hostsPath, "\r\n" + ip + " lancache.steamcontent.com # Phoenix Launcher\r\n");
                        Net.Run("ipconfig", "/flushdns");
                        Log("hosts: lancache.steamcontent.com → " + ip);
                    }
                });
            }
            catch (Exception e) { Add(new CheckResult { Id = "lancache", Name = "Кэш загрузок Steam", Status = St.Info, Detail = e.Message }); }

            // 9. Steam
            bool steam = Process.GetProcessesByName("steam").Length > 0;
            Add(new CheckResult { Name = "Steam", Status = steam ? St.Ok : St.Warn, Detail = steam ? "запущен" : "не запущен — без Steam Arma не пустит на сервер" });

            // 10. Discord
            CheckDiscordOnly();

            int fails = results.Count(r => r.Status == St.Fail), warns = results.Count(r => r.Status == St.Warn);
            Log(string.Format("Готово: ошибок {0}, предупреждений {1}", fails, warns));
        }

        void CheckZapret()
        {
            var st = Zapret.ServiceState();
            var procs = Zapret.WinwsProcs().Length;
            var svcFolder = Zapret.ServiceFolder();
            var img = Zapret.ServiceImagePath() ?? "";
            string folder = null; Ui(() => folder = Folder);
            var running = st == "RUNNING" || procs > 0;
            var foldersToCheck = new List<string>();
            if (svcFolder != null && Directory.Exists(svcFolder)) foldersToCheck.Add(svcFolder);
            if (folder != null && !foldersToCheck.Contains(folder, StringComparer.OrdinalIgnoreCase)) foldersToCheck.Add(folder);
            var notExcl = foldersToCheck.Where(f => !Zapret.IsExcluded(f)).ToList();
            bool gameFilterOn = img.Contains("1024-65535");

            string det = running ? "работает (" + (st == "RUNNING" ? "служба «" + Zapret.ServiceStrategy() + "»" : "вручную") + ")" : "не запущен";
            if (svcFolder != null && folder != null && !string.Equals(svcFolder, folder, StringComparison.OrdinalIgnoreCase)) det += "; служба из другой папки: " + svcFolder;
            if (gameFilterOn) det += "; включён игровой фильтр (трогает UDP/TCP игр)";
            if (notExcl.Count > 0) det += "; сервер НЕ в исключениях";
            else det += "; сервер в исключениях — игру не трогает";

            Add(new CheckResult
            {
                Name = "Zapret",
                Status = !running ? St.Info : notExcl.Count > 0 ? (gameFilterOn ? St.Fail : St.Warn) : St.Ok,
                Detail = det,
                FixName = notExcl.Count > 0 ? "добавить " + Net.ServerIp + " в список исключений zapret" : null,
                Fix = () =>
                {
                    // только текстовый список исключений; службу и winws.exe чекер не трогает
                    foreach (var f in notExcl) { Zapret.AddExclude(f); Log("Исключение добавлено: " + Path.Combine(f, @"lists\ipset-exclude-user.txt")); }
                    if (running) Log("Перезапустите zapret сами (service.bat или ваш ярлык), чтобы исключение заработало");
                }
            });
        }

        void CheckDiscordOnly()
        {
            string info;
            bool ok = Net.DiscordOk(out info);
            var r = new CheckResult
            {
                Id = "discord",
                Name = "Discord",
                Status = ok ? St.Ok : St.Fail,
                Detail = ok ? "доступен (" + info + ")" : "не открывается (" + info + ") — нужен zapret",
                FixName = ok ? null : "автоподбор стратегии zapret"
            };
            r.Fix = () => { string f = null; bool g = false; Ui(() => { f = Folder; g = chkGame.Checked; }); if (f != null) AutoPick(f, g); };
            lock (results) { results.RemoveAll(x => x.Name == "Discord"); results.Add(r); }
            SetRows(new List<CheckResult>(results));
            Log("Discord: " + (ok ? "OK" : "не работает") + " — " + info);
        }

        void FixAll()
        {
            List<CheckResult> todo;
            lock (results) todo = results.Where(r => r.Status != St.Ok && r.Fix != null && r.FixName != null).ToList();
            if (todo.Count == 0) { Log("Исправлять нечего"); return; }
            foreach (var r in todo)
            {
                Log("Исправляю: " + r.Name + " → " + r.FixName);
                try { r.Fix(); } catch (Exception e) { Log("  не вышло: " + e.Message); }
            }
            Log("Повторная проверка…");
            RunChecks();
        }

        void AutoPick(string folder, bool game)
        {
            if (folder == null) { Log("Не выбрана папка zapret"); return; }
            Zapret.AddExclude(folder);
            var strats = Zapret.Strategies(folder);
            Log("Автоподбор: " + strats.Count + " стратегий, по ~10 с на каждую");
            foreach (var s in strats)
            {
                Log("Пробую " + s + "…");
                try { Zapret.StartManual(folder, s, game, _ => { }); }
                catch (Exception e) { Log("  не стартовала: " + e.Message); continue; }
                Thread.Sleep(2500);
                string info;
                bool ok = Net.DiscordOk(out info);
                var q = Net.QueryServer(Net.ServerIp, Net.QueryPort);
                Log("  Discord: " + (ok ? "OK" : "нет") + ", сервер: " + (q.Ok ? "OK" : "нет") + "  (" + info + ")");
                if (ok)
                {
                    Ui(() => { int i = cbStrat.Items.IndexOf(s); if (i >= 0) cbStrat.SelectedIndex = i; });
                    Log("Рабочая стратегия: " + s + ". Она запущена. Нажмите «Установить службой», чтобы включалась сама.");
                    CheckDiscordOnly();
                    return;
                }
            }
            Zapret.StopAll(Log);
            Log("Ни одна стратегия не открыла Discord. Обновите zapret-discord-youtube до свежей версии.");
            CheckDiscordOnly();
        }

        void CopyReport()
        {
            var sb = new StringBuilder("Phoenix NetCheck " + DateTime.Now + "\r\n");
            lock (results) foreach (var r in results) sb.AppendLine("[" + r.Status + "] " + r.Name + ": " + r.Detail);
            sb.AppendLine().AppendLine(logBox.Text);
            Clipboard.SetText(sb.ToString());
            Log("Отчёт скопирован в буфер обмена");
        }
    }
}
