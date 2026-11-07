# Установка HoloNet-ленты лаунчера на хосте Phoenix (.239): задача при старте Windows (SYSTEM) + правило брандмауэра.
# Запуск: powershell -ExecutionPolicy Bypass -File C:\PhoenixHoloNet\install_holonet_feed.ps1
$ErrorActionPreference = 'Stop'
$dir = 'C:\PhoenixHoloNet'
$py = 'C:\Python314\python.exe'
$task = 'PhoenixHoloNetFeed'
$port = 8795

# прежний экземпляр (если был) - только наш скрипт, по пути
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*PhoenixHoloNet\holonet_feed.py*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$action = New-ScheduledTaskAction -Execute $py -Argument "-I -B `"$dir\holonet_feed.py`" `"$dir\config.json`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

if (-not (Get-NetFirewallRule -DisplayName "phoenix_holonet_feed $port" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "phoenix_holonet_feed $port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
}
Start-ScheduledTask -TaskName $task
Start-Sleep -Seconds 8
try { (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/health").Content } catch { "health: $($_.Exception.Message)" }
