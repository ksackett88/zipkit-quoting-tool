<#
  Makes the customer quoter's public catalogs from data/catalog.json, one per
  brand in catalog.json "public.brands":

    data/catalog-public-zipkit.json
    data/catalog-public-mvp.json

    powershell -ExecutionPolicy Bypass -File data\build-public-catalog.ps1

  The customer quoter loads ONLY its brand's public file. It keeps model names,
  sizes, photos, starting prices, where things are sold and the brand's public
  contact details. Nothing else is copied: no rates, zones, overrides,
  discounts, notes, snow or window prices. A brand marked "prices":
  "needs_price" gets no prices at all. wp-plugin/build.ps1 runs this every
  time, so the files can't drift; tests/public-check.html checks them.
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
function Is-Number($v) { return ($v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [decimal]) }
function Money($n) { return '$' + ([long]$n).ToString('N0', [Globalization.CultureInfo]::InvariantCulture) }
function States($a) {
  if ($a.states_from) { return [object[]]@(Resolve-Ref $a.states_from) }
  if ($a.states -eq 'all') { return 'all' }
  return [object[]]@($a.states)
}

$confirm = New-Object System.Collections.ArrayList
foreach ($line in $pub.availability.PSObject.Properties) {
  if ($line.Value.confirm) { [void]$confirm.Add($line.Value.label + ' availability: ' + $line.Value.source) }
}
if ($pub.location.zones_confirm) { [void]$confirm.Add('Price zones: ' + $pub.location.zones_confirm) }
if ($pub.location.road_factor -eq 'needs_price') { [void]$confirm.Add('Road factor for shipping: ' + $pub.location.road_factor_note) }
if ($pub.location.zip_data -eq 'needs_data') { [void]$confirm.Add('Zip data: ' + $pub.location.zip_data_note) }

foreach ($bp in $pub.brands.PSObject.Properties) {
  $key = $bp.Name; $pb = $bp.Value
  $b = $c.brands.$key
  if ($pb.confirm) { [void]$confirm.Add($b.name + ': ' + $pb.confirm_note) }
  $needsPrice = ($pb.prices -eq 'needs_price')
  # "placeholder": each model's own test price ("price", "placeholder": true).
  # The plugin strips them on production sites; the rep tool never reads them.
  # Design lines stay off until a brand has real prices.
  $testPrices = ($pb.prices -eq 'placeholder')
  $noDesign = $needsPrice -or $testPrices

  # Where each line is sold, with this brand's overrides.
  $avail = [ordered]@{}
  foreach ($line in $pub.availability.PSObject.Properties) {
    $a = $line.Value
    if ($pb.availability -and $pb.availability.($line.Name)) { $a = $pb.availability.($line.Name) }
    $avail[$line.Name] = States $a
  }

  # Product types this brand offers.
  $types = New-Object System.Collections.ArrayList
  foreach ($id in $pb.types) {
    $t = $pub.types.$id
    if (-not $t -or -not $t.show) { continue }
    $design = $null
    if ($t.design_line) {
      if ($t.design_line -match '\{amount\}') {
        $amt = Resolve-Ref $t.design_from
        if ((Is-Number $amt) -and -not $noDesign) { $design = $t.design_line.Replace('{amount}', (Money $amt)) }
      } elseif (-not $noDesign) { $design = $t.design_line }
    }
    [void]$types.Add([ordered]@{
      id           = $id
      label        = $(if ($pb.type_labels -and $pb.type_labels.$id) { $pb.type_labels.$id } else { $t.label })
      line         = $t.line
      per          = $t.per
      lead_only    = [bool]$t.lead_only
      ask_homes    = [bool]$t.ask_homes
      ask_snow     = [bool]$t.ask_snow
      ask_assembly = [bool]$t.ask_assembly
      design_line  = $design
    })
  }

  # Models. Starting price = the rep tool's card price ("Kit from / Complete
  # from / Starting at"), or nothing while the brand needs prices.
  $priced = @($types | Where-Object { -not $_.lead_only } | ForEach-Object { $_.id })
  # A brand either lists its public models ("models": name, size and photo
  # from a catalog product, or given directly) or takes every active catalog
  # product of its catalog brands.
  if ($pb.models) {
    $list = @($pb.models | ForEach-Object {
      $m = $_; $src = $null
      if ($m.from_product) { $src = $c.products | Where-Object { $_.id -eq $m.from_product }; if (-not $src) { throw "Model $($m.id): no catalog product $($m.from_product)" } }
      [pscustomobject]@{
        id = $m.id; type = $(if ($src) { $src.type } else { $pb.types[0] }); name = $(if ($m.name) { $m.name } else { $src.name })
        sqft = $(if ($src -and -not $m.size) { $src.sqft } else { $null }); sqft_label = $(if ($m.size) { $null } elseif ($src) { $src.sqft_label } else { $null })
        dimensions = $(if ($m.size) { $m.size } elseif ($src) { $src.dimensions } else { $null }); photo = $(if ($m.photo) { $m.photo } elseif ($src) { $src.photo } else { $null }); photo_focus = $m.photo_focus; floor_plan = $m.floor_plan
        barndominium = $false; multifamily = [bool]$m.multifamily_only; building_units = $m.building_units; price = $m.price; placeholder = [bool]$m.placeholder; brands = $(if ($src) { $src.brands } else { @() }); pricing = $(if ($src) { $src.pricing } else { $null })
      }
    })
  } else {
    $list = @($c.products | Where-Object { $_.status -eq 'active' -and @($_.brands | Where-Object { $pb.catalog_brands -contains $_ }).Count -gt 0 })
  }
  $products = New-Object System.Collections.ArrayList
  foreach ($p in $list) {
    if ($priced -notcontains $p.type) { continue }
    $start = $null
    $isTest = $false
    if ($testPrices) {
      if ($p.price -gt 0) { $start = $p.price; $isTest = [bool]$p.placeholder }
    } elseif (-not $needsPrice) {
      if (-not $p.pricing) { throw "Model $($p.id) has no catalog prices; mark the brand needs_price" }
      $z = $p.pricing.($p.brands[0])
      switch ($p.type) {
        'shell'   { $start = $z.shell_kit }
        'garage'  { $start = $z.shell_kit }
        'modular' { $start = $z.base }
        'hangar'  { $start = $z.kit }
      }
      if (-not ($start -gt 0)) { throw "No starting price for $($p.id)" }
    }
    $photo = $null
    if ($p.photo) { $photo = 'photos/cards/' + [IO.Path]::GetFileNameWithoutExtension($p.photo) + '.jpg' }
    # A model with no photo can show its floor plan instead (Kelsey 2026-10-20).
    $plan = $null
    if ($p.floor_plan -and -not $p.photo) { $plan = 'photos/cards/' + [IO.Path]::GetFileNameWithoutExtension($p.floor_plan) + '.jpg' }
    # (Set outside the table so a one-item list stays a list in the JSON.)
    $bu = $null
    if ($p.building_units) { $bu = [object[]]@($p.building_units | ForEach-Object { [int]$_ }) }
    $label = $null
    if ($pb.photo_labels -and $pb.photo_labels.($p.id)) { $label = $pb.photo_labels.($p.id) }
    [void]$products.Add([ordered]@{
      id          = $p.id
      type        = $p.type
      name        = $p.name
      sqft        = $(if ($p.sqft) { $p.sqft } else { $null })
      # Ranges read "1,290 to 1,536", never with a dash (public copy rule).
      size        = ($(if ($p.sqft_label) { ($p.sqft_label -replace '^(.+?) / (\w+)$', '$1 sq ft per $2') + $(if ($p.sqft_label -match ' / ') { '' } else { ' sq ft' }) } else { [string]$p.dimensions }) -replace ('\s*[' + [char]0x2013 + [char]0x2014 + ']\s*'), ' to ')
      tag         = $(if ($p.multifamily) { 'Multifamily only' } elseif ($p.barndominium) { 'Barndominium' } else { $null })
      photo       = $photo
      photo_label = $label
      photo_focus = $(if ($p.photo_focus) { $p.photo_focus } else { $null })
      floor_plan  = $plan
      # Multifamily buildings: the units per building the customer picks from
      # (Dakota 2 or 3, Westley 5). The tool asks how many buildings.
      building_units = $bu
      start_price = $start
      placeholder = $isTest
    })
  }

  $out = [ordered]@{
    generated       = 'Made by data/build-public-catalog.ps1 from data/catalog.json. Do not edit by hand.'
    catalog_updated = $c.updated
    brand           = [ordered]@{ key = $key; name = $b.name; phone = $b.phone.Replace([string][char]0x00B7, '-'); email = $b.email; logo = $(if ($pb.logo) { $pb.logo } else { $b.logo }); unit_word = $(if ($pb.unit_word) { $pb.unit_word } else { $null }); colors = [ordered]@{ main = $b.colors.main; dark = $b.colors.dark } }
    scope           = $(if ($pb.scope) { $pb.scope } else { $null })
    needs_price     = $needsPrice
    availability    = $avail
    types           = [object[]]$types
    snow_choices    = [object[]]@($pub.snow_choices | ForEach-Object { [ordered]@{ id = $_.id; label = $_.label; help = $_.help } })
    timelines       = [object[]]@($pub.timelines)
    max_homes       = $pub.max_homes
    products        = [object[]]$products
  }
  $file = Join-Path $dataDir ('catalog-public-' + $key + '.json')
  [IO.File]::WriteAllText($file, ($out | ConvertTo-Json -Depth 10) + "`n", $utf8)
  "catalog-public-$key.json: $($products.Count) models, $($types.Count) product types" + $(if ($needsPrice) { ' (needs prices: none shown)' } elseif ($testPrices) { ' (TEST PRICES: placeholders, hidden on production sites)' } else { '' })
}

# The CONFIRM list stays out of the public files (it can mention internal
# numbers); it is printed here for whoever runs the build.
if ($confirm.Count) {
  "CONFIRM WITH KELSEY ($($confirm.Count)):"
  $confirm | ForEach-Object { '  - ' + $_ }
}
