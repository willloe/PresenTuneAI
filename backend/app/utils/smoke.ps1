param(
  [string]$Api = "http://localhost:8000/v1",
  [string]$Topic = "Smoke Test",
  [int]$Slides = 3,
  [string]$OutDir = "."
)

Write-Host "=== PresenTuneAI Smoke Test (PowerShell) ===" -ForegroundColor Cyan
Write-Host "API    = $Api"
Write-Host "Topic  = $Topic"
Write-Host "Slides = $Slides"
Write-Host "OutDir = $OutDir"
Write-Host ""

# Ensure output directory exists
if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

function Invoke-Json {
  param([string]$Method, [string]$Url, [hashtable]$Body)
  if ($Body) {
    $json = ($Body | ConvertTo-Json -Depth 10 -Compress)
    return Invoke-RestMethod -Method $Method -Uri $Url -ContentType "application/json" -Body $json
  } else {
    return Invoke-RestMethod -Method $Method -Uri $Url
  }
}

function Save-Utf8Bom {
  param([string]$Path, [string]$Text)
  $enc = if ($PSVersionTable.PSEdition -eq 'Core') { 'utf8BOM' } else { 'utf8' }
  $Text | Out-File -FilePath $Path -Encoding $enc
}

# 1) Health
Write-Host "1) Health" -ForegroundColor Yellow
try {
  $resp = Invoke-WebRequest -Method GET -Uri "$Api/health" -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  Write-Host ("Status: {0}" -f $resp.StatusCode)
  Write-Host ("Schema: {0}" -f ($json.schema_version))
  Write-Host ("X-Request-Id: {0}" -f ($resp.Headers['X-Request-Id']))
  Write-Host ("Server-Timing: {0}" -f ($resp.Headers['Server-Timing']))
} catch {
  Write-Error ("Health failed: {0}" -f $_.Exception.Message)
  exit 1
}
Write-Host ""

# 2) Outline
Write-Host "2) Outline" -ForegroundColor Yellow
try {
  $outline = Invoke-Json -Method POST -Url "$Api/outline" -Body @{ topic = $Topic; slide_count = $Slides }
  $outline | Select-Object version, topic, slide_count | ConvertTo-Json
} catch {
  Write-Error ("Outline failed: {0}" -f $_.Exception.Message)
  exit 1
}
Write-Host ""

# 3) Build export payload
Write-Host "3) Build export payload" -ForegroundColor Yellow
$payload = @{ slides = $outline.slides; theme = "default" }
$payloadPath = Join-Path -Path $OutDir -ChildPath "payload.smoke.json"
$payloadJson = ($payload | ConvertTo-Json -Depth 10)
Save-Utf8Bom -Path $payloadPath -Text $payloadJson
Write-Host ("payload.smoke.json written to {0}" -f $payloadPath)
Write-Host ""

# 4) Export
Write-Host "4) Export" -ForegroundColor Yellow
try {
  $export = Invoke-Json -Method POST -Url "$Api/export" -Body $payload
  $export | Select-Object format, bytes, path | ConvertTo-Json
  $filename = Split-Path -Path $export.path -Leaf
  Write-Host ("Export filename = {0}" -f $filename)
} catch {
  Write-Error ("Export failed: {0}" -f $_.Exception.Message)
  exit 1
}
Write-Host ""

# 5) Download
Write-Host "5) Download" -ForegroundColor Yellow
try {
  $url = "$Api/export/$filename"
  $exportPath = Join-Path -Path $OutDir -ChildPath "exported.txt"
  $resp = Invoke-WebRequest -Method GET -Uri $url -OutFile $exportPath -UseBasicParsing -PassThru
  $status = if ($resp.StatusCode) { $resp.StatusCode } else { 200 }
  $ctype = $resp.Headers['Content-Type']
  if (-not $ctype) {
    $head = Invoke-WebRequest -Method HEAD -Uri $url -UseBasicParsing -ErrorAction SilentlyContinue
    if ($head) {
      $ctype = $head.Headers['Content-Type']
      if ($head.StatusCode) { $status = $head.StatusCode }
    }
  }
  Write-Host ("Status: {0}" -f $status)
  if ($ctype) { Write-Host ("Content-Type: {0}" -f $ctype) }
  Write-Host ("Saved to {0}" -f $exportPath)
} catch {
  Write-Error ("Download failed: {0}" -f $_.Exception.Message)
  exit 1
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
