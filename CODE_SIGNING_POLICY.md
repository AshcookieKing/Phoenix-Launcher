# Code signing policy

Phoenix Launcher (`PhoenixLauncherSetup.exe`, `PhoenixLauncher.exe`) and Phoenix NetCheck (`PhoenixNetCheck.exe`)
are built only by the GitHub Actions workflow [`.github/workflows/build.yml`](.github/workflows/build.yml) from the
source code in this repository, and only those builds are released.

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).
*(This applies once the project has been accepted by SignPath Foundation. Until then, releases are unsigned.)*

## Team roles
- Author, committer, reviewer and approver: [Ima Gun Di](https://github.com/AshcookieKing)

Every release is approved by hand before signing.

## Privacy policy
The program transfers no information to other networked systems unless the user or the person installing or
operating it specifically asks for it. What it connects to:
- Phoenix RP servers (109.248.4.45, 109.248.4.239, phoenixrp.ru) for server status, roles, the HoloNet news feed
  and the Discord login the user starts;
- Steam (through the local Steam client), for mod downloads and the login ticket;
- GitHub (github.com), to check for and download launcher updates;
- the network check (read only) connects to 1.1.1.1, 8.8.8.8, discord.com, cdn.discordapp.com,
  api.steampowered.com, steamcommunity.com and the Phoenix TeamSpeak servers to measure connectivity.

The launcher changes nothing in Windows settings, network configuration, the hosts file, the firewall or services.
Phoenix NetCheck, a separate program, can do so only when the user presses a button and confirms it; it also
asks cloudflare-dns.com (DNS over HTTPS) for the real address of the Steam download cache.
