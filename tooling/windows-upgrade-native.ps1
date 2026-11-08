param(
  [ValidateSet('Install', 'CompleteUpdate')][string]$Mode,
  [string]$Installer, [string]$InstallDirectory, [string]$TargetVersion, [string]$Report
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or -not $env:RUNNER_TEMP) {
  throw 'Real updater acceptance requires a disposable GitHub-hosted Windows runner.'
}
$resolvedInstall = [IO.Path]::GetFullPath($InstallDirectory)
$runnerPrefix = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
if (-not $resolvedInstall.StartsWith($runnerPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Install directory must be inside RUNNER_TEMP.' }
$exe = Join-Path $resolvedInstall 'Ono Workbench.exe'
if ($Mode -eq 'Install') {
  if (Test-Path -LiteralPath $resolvedInstall) { throw 'Refusing to reuse an installation.' }
  $process = Start-Process -FilePath $Installer -ArgumentList "/S /currentuser /D=$resolvedInstall" -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) { throw 'Baseline NSIS installation timed out.' }
  $process.Refresh()
  if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $exe)) { throw 'Baseline NSIS installation failed.' }
  exit 0
}

# Operate only NSIS dialogs belonging to this product on the disposable runner.
# The real updater chooses its normal assisted installer; do not replace it with /S.
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class UpgradeWindows {
  public delegate bool EnumCallback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumCallback callback, IntPtr data);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr window, int id);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$actions = [Collections.Generic.List[object]]::new()
$clicked = @{}
$deadline = [DateTime]::UtcNow.AddMinutes(6)
while ([DateTime]::UtcNow -lt $deadline) {
  $callback = [UpgradeWindows+EnumCallback]{ param($window, $unused)
    $class = [Text.StringBuilder]::new(128)
    $title = [Text.StringBuilder]::new(512)
    [void][UpgradeWindows]::GetClassName($window, $class, $class.Capacity)
    [void][UpgradeWindows]::GetWindowText($window, $title, $title.Capacity)
    if ($class.ToString() -ne '#32770' -or $title.ToString() -notlike '*Ono Workbench*') { return $true }
    [uint32]$ownerId = 0
    [void][UpgradeWindows]::GetWindowThreadProcessId($window, [ref]$ownerId)
    $owner = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
    if (-not $owner -or -not $owner.Path) { return $true }
    $cachePrefix = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'onosan-workbench-updater')).TrimEnd('\') + '\'
    if (-not ($owner.Path.StartsWith($cachePrefix, [StringComparison]::OrdinalIgnoreCase) -or $owner.Path.StartsWith($runnerPrefix, [StringComparison]::OrdinalIgnoreCase) -or $owner.Path.StartsWith([IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase))) { return $true }
    $button = [UpgradeWindows]::GetDlgItem($window, 1)
    $label = [Text.StringBuilder]::new(256)
    [void][UpgradeWindows]::GetWindowText($button, $label, $label.Capacity)
    $text = $label.ToString().Replace('&', '').Trim()
    $key = "$window/$text"
    if ($text -match '^(Install|Next\s*>?|Finish|Close)$' -and [UpgradeWindows]::IsWindowVisible($button) -and [UpgradeWindows]::IsWindowEnabled($button) -and -not $clicked.ContainsKey($key)) {
      $clicked[$key] = $true
      $actions.Add(@{ button = $text; process = $owner.Path; pid = $ownerId })
      [void][UpgradeWindows]::PostMessage($button, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
    }
    return $true
  }
  [void][UpgradeWindows]::EnumWindows($callback, [IntPtr]::Zero)
  $running = @(Get-Process -Name 'Ono Workbench' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe -and $_.MainWindowHandle -ne 0 })
  if ($running.Count -eq 1) {
    $package = Get-Content -LiteralPath (Join-Path $resolvedInstall 'resources\app\package.json') -Raw | ConvertFrom-Json
    if ($package.version -ne $TargetVersion) { Start-Sleep -Milliseconds 500; continue }
    $restarted = $running[0]
    # Get-Process has no retained query handle. Without acquiring it before exit,
    # WaitForExit can succeed while ExitCode stays null for this non-child process.
    $retainedProcessHandle = $restarted.Handle
    $result = @{ status = 'passed'; version = $package.version; autoRestartPid = $restarted.Id; executable = $restarted.Path; wizardActions = @($actions.ToArray()) }
    # Exit-on-close was selected in the old version through the UI before updating.
    [void][UpgradeWindows]::PostMessage($restarted.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
    if (-not $restarted.WaitForExit(30000)) { throw 'Auto-restarted app did not exit normally after WM_CLOSE.' }
    $restarted.Refresh()
    $result.normalExitCode = $restarted.ExitCode
    if ($restarted.ExitCode -ne 0) { throw "Auto-restarted app exited with code $($restarted.ExitCode)." }
    $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Report -Encoding utf8
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
throw 'Real update installer or automatic application restart timed out.'
