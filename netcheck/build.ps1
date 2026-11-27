param([string]$out = '')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $out) { $out = Join-Path $root 'PhoenixNetCheck.exe' }
$fw = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$sdk = (Get-ChildItem 'C:\Program Files\dotnet\sdk' -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
$csc = Join-Path $sdk 'Roslyn\bincore\csc.dll'
$refs = 'mscorlib','System','System.Core','System.Drawing','System.Windows.Forms','Microsoft.CSharp' | ForEach-Object { "-r:$fw\$_.dll" }
& dotnet $csc -nologo -nostdlib -noconfig -target:winexe -optimize+ -langversion:7.3 `
  "-out:$out" "-win32manifest:$root\src\app.manifest" @refs "$root\src\NetCheck.cs"
if ($LASTEXITCODE -ne 0) { throw "build failed" }
Write-Host "OK -> $out"
