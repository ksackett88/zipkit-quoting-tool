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
        if ((Is-Number $amt) -and -not $needsPrice) { $design = $t.design_line.Replace('{amount}', (Money $amt)) }
      } elseif (-not $needsPrice) { $design = $t.design_line }
    }
    [void]$types.Add([ordered]@{
      id           = $id
      label        = $t.label
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
  if ($pb.products) {
    $list = @($pb.products | ForEach-Object { $id = $_; $c.products | Where-Object { $_.id -eq $id } })
  } else {
    $list = @($c.products | Where-Object { $_.status -eq 'active' -and @($_.brands | Where-Object { $pb.catalog_brands -contains $_ }).Count -gt 0 })
  }
  $products = New-Object System.Collections.ArrayList
  foreach ($p in $list) {
    if ($priced -notcontains $p.type) { continue }
    $start = $null
    if (-not $needsPrice) {
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
    $label = $null
    if ($pb.photo_labels -and $pb.photo_labels.($p.id)) { $label = $pb.photo_labels.($p.id) }
    [void]$products.Add([ordered]@{
      id          = $p.id
      type        = $p.type
      name        = $p.name
      sqft        = $(if ($p.sqft) { $p.sqft } else { $null })
      # Ranges read "1,290 to 1,536", never with a dash (public copy rule).
      size        = ($(if ($p.sqft_label) { ($p.sqft_label -replace '^(.+?) / (\w+)$', '$1 sq ft per $2') + $(if ($p.sqft_label -match ' / ') { '' } else { ' sq ft' }) } else { [string]$p.dimensions }) -replace ('\s*[' + [char]0x2013 + [char]0x2014 + ']\s*'), ' to ')
      tag         = $(if ($p.barndominium) { 'Barndominium' } else { $null })
      photo       = $photo
      photo_label = $label
      start_price = $start
    })
  }

  $out = [ordered]@{
    generated       = 'Made by data/build-public-catalog.ps1 from data/catalog.json. Do not edit by hand.'
    catalog_updated = $c.updated
    brand           = [ordered]@{ key = $key; name = $b.name; phone = $b.phone.Replace([string][char]0x00B7, '-'); email = $b.email; logo = $b.logo; colors = [ordered]@{ main = $b.colors.main; dark = $b.colors.dark } }
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
  "catalog-public-$key.json: $($products.Count) models, $($types.Count) product types" + $(if ($needsPrice) { ' (needs prices: none shown)' } else { '' })
}

# The CONFIRM list stays out of the public files (it can mention internal
# numbers); it is printed here for whoever runs the build.
if ($confirm.Count) {
  "CONFIRM WITH KELSEY ($($confirm.Count)):"
  $confirm | ForEach-Object { '  - ' + $_ }
}
