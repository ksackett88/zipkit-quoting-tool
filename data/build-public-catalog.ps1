<#
  Makes data/catalog-public.json from data/catalog.json.

    powershell -ExecutionPolicy Bypass -File data\build-public-catalog.ps1

  The customer quoter loads ONLY the public file. It keeps model names, sizes,
  photos, starting prices and where each product is sold. Nothing else is
  copied: no rates, no overrides, no discounts, no notes, no snow or window
  prices. wp-plugin/build.ps1 runs this every time, so the two files can't
  drift; tests/public-check.html checks the result independently.
#>
$ErrorActionPreference = 'Stop'
$dataDir = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$c = [IO.File]::ReadAllText((Join-Path $dataDir 'catalog.json'), $utf8) | ConvertFrom-Json
$pub = $c.public
if (-not $pub) { throw 'catalog.json has no "public" section' }

# Follow a "product_types.x.y" reference inside catalog.json.
function Resolve-Ref([string]$ref) {
  if (-not $ref) { return $null }
  $v = $c
  foreach ($part in $ref.Split('.')) { $v = $v.$part }
  return $v
}

# Where each product line is sold.
$avail = [ordered]@{}
foreach ($line in 'wood_kits', 'steel_kits', 'complete_modular', 'assembly') {
  $a = $pub.availability.$line
  if ($a.states_from) { $states = @(Resolve-Ref $a.states_from) } elseif ($a.states -eq 'all') { $states = 'all' } else { $states = @($a.states) }
  $avail[$line] = $states
}

# Product types customers can pick, in the rep tool's order.
$types = New-Object System.Collections.ArrayList
$confirm = New-Object System.Collections.ArrayList
foreach ($line in 'wood_kits', 'steel_kits', 'complete_modular', 'assembly') {
  $a = $pub.availability.$line
  if ($a.confirm) { [void]$confirm.Add([ordered]@{ what = $a.label + ' availability'; note = $a.source }) }
}
foreach ($id in 'shell', 'modular', 'garage', 'hangar', 'steel', 'custom') {
  $t = $pub.types.$id
  if (-not $t) { continue }
  if ($t.confirm) { [void]$confirm.Add([ordered]@{ what = $(if ($t.label) { $t.label } else { $id }); note = $(if ($t.confirm_note) { $t.confirm_note } else { 'Shown in the public quoter.' }) }) }
  if (-not $t.show) { continue }
  $design = Resolve-Ref $t.design_from
  if ($design -isnot [int] -and $design -isnot [long] -and $design -isnot [double]) { $design = $null }
  [void]$types.Add([ordered]@{
    id           = $id
    label        = $t.label
    line         = $t.line
    per          = $t.per
    lead_only    = [bool]$t.lead_only
    ask_homes    = [bool]$t.ask_homes
    ask_snow     = [bool]$t.ask_snow
    ask_assembly = [bool]$t.ask_assembly
    design_from  = $design
  })
}

# Models: active ones of the shown, priced types. Starting price = the same
# "Kit from / Complete from / Starting at" figure the rep tool shows on its cards.
$showIds = @($types | Where-Object { -not $_.lead_only } | ForEach-Object { $_.id })
$products = New-Object System.Collections.ArrayList
$list = @($c.products | Where-Object { $showIds -contains $_.type -and $_.status -eq 'active' })
foreach ($p in $list) {
  $brandOk = @($p.brands | Where-Object { $c.brands.$_.active }).Count -gt 0
  if (-not $brandOk) { continue }
  $z = $p.pricing.($p.brands[0])
  switch ($p.type) {
    'shell'   { $start = $z.shell_kit }
    'garage'  { $start = $z.shell_kit }
    'modular' { $start = $z.base }
    'hangar'  { $start = $z.kit }
  }
  if (-not ($start -gt 0)) { throw "No starting price for $($p.id)" }
  $photo = $null
  if ($p.photo) { $photo = 'photos/cards/' + [IO.Path]::GetFileNameWithoutExtension($p.photo) + '.jpg' }
  [void]$products.Add([ordered]@{
    id          = $p.id
    type        = $p.type
    name        = $p.name
    sqft        = $(if ($p.sqft) { $p.sqft } else { $null })
    # Ranges read "1,290 to 1,536", never with a dash (public copy rule).
    size        = ($(if ($p.sqft_label) { $p.sqft_label + ' sq ft' } else { [string]$p.dimensions }) -replace ('\s*[' + [char]0x2013 + [char]0x2014 + ']\s*'), ' to ')
    tag         = $(if ($p.barndominium) { 'Barndominium' } else { $null })
    photo       = $photo
    start_price = $start
  })
}

$b = $c.brands.zipkit
$out = [ordered]@{
  generated       = 'Made by data/build-public-catalog.ps1 from data/catalog.json. Do not edit by hand.'
  catalog_updated = $c.updated
  brand           = [ordered]@{ name = $b.name; phone = $b.phone.Replace([string][char]0x00B7, '-'); email = $b.email }
  availability    = $avail
  types           = [object[]]$types
  snow_choices    = [object[]]@($pub.snow_choices | ForEach-Object { [ordered]@{ id = $_.id; label = $_.label; help = $_.help } })
  max_homes       = $pub.max_homes
  products        = [object[]]$products
}
$json = $out | ConvertTo-Json -Depth 10
[IO.File]::WriteAllText((Join-Path $dataDir 'catalog-public.json'), $json + "`n", $utf8)
"catalog-public.json: $($products.Count) models, $($types.Count) product types"
# The CONFIRM list stays out of the public file (it can mention internal
# numbers); it is printed here for whoever runs the build.
if ($confirm.Count) {
  "CONFIRM WITH KELSEY ($($confirm.Count)):"
  $confirm | ForEach-Object { "  - " + $_.what + ": " + $_.note }
}
