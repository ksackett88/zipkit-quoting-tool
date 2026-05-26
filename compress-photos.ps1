# compress-photos.ps1
# Resizes every .png / .jpg / .jpeg in photos/ down to a sensible web size
# and re-encodes as JPG. Originals are NOT touched — output goes to
# photos-compressed/ so you can review before swapping.
#
# Usage from the repo root:
#   powershell -ExecutionPolicy Bypass -File .\compress-photos.ps1
#
# After reviewing photos-compressed/, you can replace the originals with:
#   Remove-Item photos\*.png, photos\*.jpg, photos\*.jpeg
#   Move-Item photos-compressed\*.jpg photos\
#   Remove-Item photos-compressed

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Join-Path $repoRoot "photos"
$destDir   = Join-Path $repoRoot "photos-compressed"
$maxWidth  = 1600      # photos wider than this get scaled down
$quality   = 82        # JPG quality (0-100); 82 is a good sweet spot

if (-not (Test-Path $sourceDir)) {
    Write-Host "ERROR: photos/ folder not found at $sourceDir" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [int64]$quality
)

$files = Get-ChildItem -Path $sourceDir -File | Where-Object {
    $_.Extension -match '^\.(png|jpg|jpeg)$'
}

if ($files.Count -eq 0) {
    Write-Host "No images found in $sourceDir" -ForegroundColor Yellow
    exit 0
}

$totalOldBytes = 0
$totalNewBytes = 0
$count = 0

Write-Host ""
Write-Host "Compressing $($files.Count) image(s)..." -ForegroundColor Cyan
Write-Host ""

foreach ($file in $files) {
    try {
        $original = [System.Drawing.Image]::FromFile($file.FullName)
        $w = $original.Width
        $h = $original.Height

        if ($w -gt $maxWidth) {
            $ratio = $maxWidth / $w
            $newW  = $maxWidth
            $newH  = [int]([Math]::Round($h * $ratio))
        } else {
            $newW = $w; $newH = $h
        }

        $resized = New-Object System.Drawing.Bitmap($newW, $newH)
        $g = [System.Drawing.Graphics]::FromImage($resized)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.DrawImage($original, 0, 0, $newW, $newH)

        $stem = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
        $destFile = Join-Path $destDir ($stem + ".jpg")
        $resized.Save($destFile, $jpegCodec, $encParams)

        $g.Dispose()
        $resized.Dispose()
        $original.Dispose()

        $oldKB = [Math]::Round($file.Length / 1KB)
        $newKB = [Math]::Round((Get-Item $destFile).Length / 1KB)
        $pct   = [Math]::Round((1 - $newKB / $oldKB) * 100)

        $line = "{0,-25} {1,5}x{2,-5} -> {3,4}x{4,-5}   {5,5} KB -> {6,4} KB  ({7,3}% smaller)" -f `
            $file.Name, $w, $h, $newW, $newH, $oldKB, $newKB, $pct
        Write-Host $line

        $totalOldBytes += $file.Length
        $totalNewBytes += (Get-Item $destFile).Length
        $count++
    } catch {
        Write-Host ("FAILED: {0} - {1}" -f $file.Name, $_.Exception.Message) -ForegroundColor Red
    }
}

$totalOldMB = [Math]::Round($totalOldBytes / 1MB, 1)
$totalNewMB = [Math]::Round($totalNewBytes / 1MB, 1)
$totalPct   = [Math]::Round((1 - $totalNewBytes / $totalOldBytes) * 100)

Write-Host ""
Write-Host "Done. $count file(s) compressed." -ForegroundColor Green
Write-Host ("Total: {0} MB -> {1} MB ({2}% smaller)" -f $totalOldMB, $totalNewMB, $totalPct) -ForegroundColor Green
Write-Host ""
Write-Host "Output: $destDir" -ForegroundColor Cyan
Write-Host "Open a few of the new JPGs and confirm they look right."
Write-Host "When you're happy, swap the originals with:"
Write-Host '  Remove-Item photos\*.png, photos\*.jpg, photos\*.jpeg' -ForegroundColor Yellow
Write-Host '  Move-Item photos-compressed\*.jpg photos\' -ForegroundColor Yellow
Write-Host '  Remove-Item photos-compressed' -ForegroundColor Yellow
