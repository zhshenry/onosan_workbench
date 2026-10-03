$ErrorActionPreference = 'Stop'
if (-not $env:RUNNER_TEMP -or -not $env:GITHUB_RUN_ID) { throw 'This installer pilot requires a fresh GitHub-hosted runner.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $projectRoot "release\Ono-Workbench-Setup-$version-x64.exe"
$root = Join-Path $env:RUNNER_TEMP "ono-windows-pilot-$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)"
$installDirectory = Join-Path $root 'Installed App'
$dataDirectory = Join-Path $root 'Synthetic Data'
$reportDirectory = Join-Path $projectRoot 'test-results\windows-pilot'
if (Test-Path -LiteralPath $root) { throw 'Pilot root already exists; refusing to reuse an installation or data.' }
New-Item -ItemType Directory -Path $root, $dataDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Real NSIS installer was not built.' }
# /D must be last. NSIS accepts spaces without quoting its directory argument.
$process = Start-Process -FilePath $installer -ArgumentList "/S /currentuser /D=$installDirectory" -PassThru
if (-not $process.WaitForExit(180000)) { $process.Kill(); throw 'Silent NSIS install timed out after 180 seconds.' }
$process.Refresh()
if ($process.ExitCode -ne 0) { throw "NSIS installer failed with exit code $($process.ExitCode)." }
$installedExe = Join-Path $installDirectory 'Ono Workbench.exe'
$uninstaller = Join-Path $installDirectory 'Uninstall Ono Workbench.exe'
foreach ($required in @($installedExe, $uninstaller, (Join-Path $installDirectory 'resources\app\dist-electron\main.cjs'))) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Installed file is missing: $required" }
}
$expectedMain = (Get-FileHash -LiteralPath (Join-Path $projectRoot 'dist-electron\main.cjs') -Algorithm SHA256).Hash
$installedMain = (Get-FileHash -LiteralPath (Join-Path $installDirectory 'resources\app\dist-electron\main.cjs') -Algorithm SHA256).Hash
if ($expectedMain -ne $installedMain) { throw 'Installed main bundle differs from the tested build.' }
$installedPackage = Get-Content (Join-Path $installDirectory 'resources\app\package.json') -Raw | ConvertFrom-Json
if ($installedPackage.version -ne $version) { throw 'Installed package version differs from source.' }
[ordered]@{
  status = 'passed'; version = $version; exitCode = $process.ExitCode
  mode = 'NSIS silent current-user install'; installerSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
  installedExe = $installedExe; installDirectory = $installDirectory; dataDirectory = $dataDirectory
  uninstallerPresent = $true; installedMainSha256 = $installedMain
  limitations = @('No native wizard, UAC or SmartScreen acceptance', 'No code signing, real updater or cross-version upgrade coverage')
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $reportDirectory 'install.json') -Encoding utf8
"WORKBENCH_PILOT_EXE=$installedExe" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"WORKBENCH_TEST_DATA_DIR=$dataDirectory" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
Write-Output "NSIS_INSTALL_OK version=$version exit=$($process.ExitCode) installedMainMatchesBuild=true"
