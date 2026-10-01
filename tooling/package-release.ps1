param([ValidateSet('Portable', 'All')][string]$Mode = 'Portable')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'release'))
$releasePrefix = $releaseRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a stable release version, e.g. 0.1.0.' }

function Resolve-ReleaseTarget([string]$Path) {
  $fullPath = [IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($releasePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Release target is outside the release directory: $fullPath"
  }
  $ancestor = $fullPath
  while ($ancestor.Length -ge $releaseRoot.Length) {
    if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "Release target uses a link or junction: $ancestor"
    }
    $ancestor = [IO.Path]::GetDirectoryName($ancestor)
  }
  return $fullPath
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $algorithm.Dispose(); $stream.Dispose() }
}

$unpacked = Resolve-ReleaseTarget (Join-Path $releaseRoot 'win-unpacked')
if (-not (Test-Path -LiteralPath (Join-Path $unpacked 'Ono Workbench.exe'))) { throw 'Portable application was not built.' }
if (Get-ChildItem -LiteralPath $unpacked -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) {
  throw 'The unpacked application contains a link or junction.'
}
$installerName = "Ono-Workbench-Setup-$version-x64.exe"
if ($Mode -eq 'All') {
  foreach ($name in @($installerName, "$installerName.blockmap", 'latest.yml', 'win-unpacked\resources\app-update.yml')) {
    if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot $name))) { throw "Required installer artifact is missing: $name" }
  }
}

$portableRoot = Resolve-ReleaseTarget (Join-Path $releaseRoot 'portable')
$installerRoot = Resolve-ReleaseTarget (Join-Path $releaseRoot 'installer')
$archiveRoot = Resolve-ReleaseTarget (Join-Path $releaseRoot 'archive')
$metadataRoot = Resolve-ReleaseTarget (Join-Path $releaseRoot 'metadata')
New-Item -ItemType Directory -Force -Path $portableRoot, $installerRoot, $archiveRoot, $metadataRoot | Out-Null

foreach ($artifact in Get-ChildItem -LiteralPath $portableRoot -File) {
  if ($artifact.Name -match '^Ono-Workbench-(?<version>\d+\.\d+\.\d+)-Windows-x64-Portable\.zip$' -and $Matches.version -ne $version) {
    $oldRoot = Resolve-ReleaseTarget (Join-Path $archiveRoot "$($Matches.version)\portable")
    New-Item -ItemType Directory -Force -Path $oldRoot | Out-Null
    $source = Resolve-ReleaseTarget $artifact.FullName
    $destination = Resolve-ReleaseTarget (Join-Path $oldRoot $artifact.Name)
    Move-Item -LiteralPath $source -Destination $destination -Force
  }
}
foreach ($artifact in Get-ChildItem -LiteralPath $installerRoot -File) {
  if ($artifact.Name -match '^Ono-Workbench-Setup-(?<version>\d+\.\d+\.\d+)-x64\.exe(?:\.blockmap)?$' -and $Matches.version -ne $version) {
    $oldRoot = Resolve-ReleaseTarget (Join-Path $archiveRoot "$($Matches.version)\installer")
    New-Item -ItemType Directory -Force -Path $oldRoot | Out-Null
    $source = Resolve-ReleaseTarget $artifact.FullName
    $destination = Resolve-ReleaseTarget (Join-Path $oldRoot $artifact.Name)
    Move-Item -LiteralPath $source -Destination $destination -Force
  }
}

$portableDirectory = Resolve-ReleaseTarget (Join-Path $portableRoot "Ono Workbench $version Portable")
$portableZip = Resolve-ReleaseTarget (Join-Path $portableRoot "Ono-Workbench-$version-Windows-x64-Portable.zip")
if (Test-Path -LiteralPath $portableDirectory) { Remove-Item -LiteralPath $portableDirectory -Recurse -Force }
Move-Item -LiteralPath $unpacked -Destination $portableDirectory
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PORTABLE-README.txt') -Destination (Join-Path $portableDirectory 'README.txt') -Force
# Installer creation has already finished. Strip only the portable copy's update feed.
$portableFeed = Resolve-ReleaseTarget (Join-Path $portableDirectory 'resources\app-update.yml')
if (Test-Path -LiteralPath $portableFeed) { Remove-Item -LiteralPath $portableFeed -Force }
Compress-Archive -LiteralPath $portableDirectory -DestinationPath $portableZip -CompressionLevel Optimal -Force
Remove-Item -LiteralPath $portableDirectory -Recurse -Force

if ($Mode -eq 'All') {
  foreach ($name in @($installerName, "$installerName.blockmap")) {
    $source = Resolve-ReleaseTarget (Join-Path $releaseRoot $name)
    $destination = Resolve-ReleaseTarget (Join-Path $installerRoot $name)
    Move-Item -LiteralPath $source -Destination $destination -Force
  }
  $source = Resolve-ReleaseTarget (Join-Path $releaseRoot 'latest.yml')
  $destination = Resolve-ReleaseTarget (Join-Path $metadataRoot 'latest.yml')
  Move-Item -LiteralPath $source -Destination $destination -Force
}
foreach ($artifact in Get-ChildItem -LiteralPath $releaseRoot -File -Filter 'builder-*.yml') {
  $source = Resolve-ReleaseTarget $artifact.FullName
  $destination = Resolve-ReleaseTarget (Join-Path $metadataRoot $artifact.Name)
  Move-Item -LiteralPath $source -Destination $destination -Force
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PORTABLE-README.txt') -Destination (Join-Path $releaseRoot 'README.txt') -Force
$hashFiles = @($portableZip)
$currentInstaller = Resolve-ReleaseTarget (Join-Path $installerRoot $installerName)
if (Test-Path -LiteralPath $currentInstaller) { $hashFiles += $currentInstaller }
$hashLines = foreach ($file in $hashFiles) {
  $relative = $file.Substring($releasePrefix.Length).Replace('\', '/')
  "$(Get-Sha256 $file) *$relative"
}
Set-Content -LiteralPath (Join-Path $releaseRoot 'SHA256SUMS.txt') -Value $hashLines -Encoding utf8
Write-Output "Portable package: $portableZip"
if ($Mode -eq 'All') { Write-Output "Installer directory: $installerRoot" }
