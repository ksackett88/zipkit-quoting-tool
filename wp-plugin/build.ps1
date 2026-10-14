<#
  Builds the WordPress plugin zip from this repo.

    powershell -ExecutionPolicy Bypass -File wp-plugin\build.ps1

  Output: wp-plugin\dist\zipkit-sales-tools-<version>.zip  (install it in
  WP Admin > Plugins > Add New > Upload Plugin). The unzipped copy is left in
  wp-plugin\dist\zipkit-sales-tools\ for checking.

  What goes in:
    zipkit-sales-tools\*          the plugin's PHP (from wp-plugin\zipkit-sales-tools)
    app\js, app\lib, app\css      the tool, exactly as on GitHub Pages
    app\images, app\photos        logos and model photos (full size + cards\)
    private\catalog.json.php      the full price list, readable only through
                                  the plugin's reps-only endpoint

  Works in Windows PowerShell 5.1 and PowerShell 7 (Mac/Linux too).
#>
param([switch]$NoZip)
$ErrorActionPreference = 'Stop'

$here  = $PSScriptRoot
$repo  = Split-Path -Parent $here
$src   = Join-Path $here 'zipkit-sales-tools'
$dist  = Join-Path $here 'dist'
$stage = Join-Path $dist 'zipkit-sales-tools'
$utf8  = New-Object System.Text.UTF8Encoding($false)

function Copy-Into([string]$from, [string]$to, [string[]]$include) {
  New-Item -ItemType Directory -Force $to | Out-Null
  foreach ($pattern in $include) {
    Get-ChildItem -Path $from -Filter $pattern -File | ForEach-Object { Copy-Item $_.FullName (Join-Path $to $_.Name) }
  }
}

# Version from the plugin header.
$main = [IO.File]::ReadAllText((Join-Path $src 'zipkit-sales-tools.php'), $utf8)
if ($main -notmatch "define\(\s*'ZKST_VERSION',\s*'([^']+)'") { throw 'ZKST_VERSION not found in zipkit-sales-tools.php' }
$version = $Matches[1]

# The price list must be valid JSON before anything ships.
$catalogText = [IO.File]::ReadAllText((Join-Path (Join-Path $repo 'data') 'catalog.json'), $utf8)
try { $catalog = $catalogText | ConvertFrom-Json } catch { throw "data\catalog.json is not valid JSON: $($_.Exception.Message)" }
if (-not $catalog.products -or $catalog.products.Count -lt 1) { throw 'data\catalog.json has no products' }

# Fresh staging folder (build output only).
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

# 1. Plugin PHP and docs.
Copy-Item -Recurse (Join-Path $src '*') $stage
Copy-Item (Join-Path $here 'README.md') (Join-Path $stage 'README.md')

# 2. The tool.
$app = Join-Path $stage 'app'
Copy-Into (Join-Path $repo 'js')     (Join-Path $app 'js')     @('*.js')
Copy-Into (Join-Path $repo 'lib')    (Join-Path $app 'lib')    @('supabase.js')
Copy-Into (Join-Path $repo 'css')    (Join-Path $app 'css')    @('tool.css')
Copy-Into (Join-Path $repo 'images') (Join-Path $app 'images') @('*.png', '*.jpg', '*.svg')
# Photos: web-size copies for documents (photos/web) and card copies. The
# full-size originals stay in the repo only (Kelsey 2026-10-13: web-sized
# copies for the plugin, originals untouched).
Copy-Into (Join-Path (Join-Path $repo 'photos') 'web') (Join-Path (Join-Path $app 'photos') 'web') @('*.jpg')
Copy-Into (Join-Path (Join-Path $repo 'photos') 'cards') (Join-Path (Join-Path $app 'photos') 'cards') @('*.jpg')

# 3. The full price list, behind a PHP guard line.
$private = Join-Path $stage 'private'
New-Item -ItemType Directory -Force $private | Out-Null
[IO.File]::WriteAllText((Join-Path $private 'catalog.json.php'), "<?php defined( 'ABSPATH' ) || exit; ?>`n" + $catalogText, $utf8)

# 4. No directory listings.
Get-ChildItem $stage -Recurse -Directory | ForEach-Object {
  $idx = Join-Path $_.FullName 'index.php'
  if (-not (Test-Path $idx)) { [IO.File]::WriteAllText($idx, "<?php`n// Silence is golden.`n", $utf8) }
}

$files = Get-ChildItem $stage -Recurse -File
"Built zipkit-sales-tools $version : $($files.Count) files, $([Math]::Round(($files | Measure-Object Length -Sum).Sum / 1MB, 1)) MB, $($catalog.products.Count) products (catalog updated $($catalog.updated))"

if ($NoZip) { return }

# 5. Zip with forward-slash paths (WordPress needs them; Compress-Archive in
#    Windows PowerShell 5.1 writes backslashes).
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zipPath = Join-Path $dist "zipkit-sales-tools-$version.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($f in $files) {
    $rel = 'zipkit-sales-tools/' + $f.FullName.Substring($stage.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $rel, 'Optimal') | Out-Null
  }
} finally { $zip.Dispose() }
"Zip: $zipPath ($([Math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB)"
