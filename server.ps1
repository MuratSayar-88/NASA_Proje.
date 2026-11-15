$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8765/")

function Write-Response($context, [int]$status, [string]$contentType, [byte[]]$bytes) {
  $context.Response.StatusCode = $status
  $context.Response.ContentType = $contentType
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.Close()
}

function Write-Json($context, [int]$status, $value) {
  $json = ConvertTo-Json -InputObject $value -Depth 6 -Compress
  Write-Response $context $status "application/json; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes($json))
}

function Get-Observations($context) {
  $query = $context.Request.QueryString
  $ra = [double]::Parse($query["ra"], [Globalization.CultureInfo]::InvariantCulture)
  $dec = [double]::Parse($query["dec"], [Globalization.CultureInfo]::InvariantCulture)
  $size = [double]::Parse($query["size"], [Globalization.CultureInfo]::InvariantCulture)
  $detector = $query["detector"]
  if ($ra -lt 0 -or $ra -gt 360 -or $dec -lt -90 -or $dec -gt 90 -or $size -le 0 -or $size -gt 1 -or $detector -notmatch "^D[1-6]$") {
    throw "The coordinates, field of view, or detector value is invalid."
  }

  $raText = $ra.ToString("0.########", [Globalization.CultureInfo]::InvariantCulture)
  $decText = $dec.ToString("0.########", [Globalization.CultureInfo]::InvariantCulture)
  $sizeText = $size.ToString("0.####", [Globalization.CultureInfo]::InvariantCulture)
  $radius = [Math]::Max($size, 0.01).ToString("0.####", [Globalization.CultureInfo]::InvariantCulture)
  $position = [Uri]::EscapeDataString("circle $raText $decText $radius")
  $bandRanges = @{
    D1 = "0.75e-6 1.09e-6"
    D2 = "1.10e-6 1.62e-6"
    D3 = "1.63e-6 2.41e-6"
    D4 = "2.42e-6 3.82e-6"
    D5 = "3.83e-6 4.41e-6"
    D6 = "4.42e-6 5.00e-6"
  }
  $bandRange = [Uri]::EscapeDataString($bandRanges[$detector])
  $collections = @("spherex_dr1", "spherex_qr3")
  $observations = New-Object System.Collections.Generic.List[object]

  foreach ($collection in $collections) {
    $url = "https://irsa.ipac.caltech.edu/SIA?COLLECTION=$collection&POS=$position&BAND=$bandRange&RESPONSEFORMAT=CSV&MAXREC=500"
    $response = Invoke-WebRequest -Uri $url -TimeoutSec 90 -UseBasicParsing
    foreach ($row in @($response.Content | ConvertFrom-Csv)) {
      if ($row.energy_bandpassname -ne "SPHEREx-$detector" -or -not $row.access_url.StartsWith("https://irsa.ipac.caltech.edu/")) {
        continue
      }
      $mjd = [double]::Parse($row.t_min, [Globalization.CultureInfo]::InvariantCulture)
      $date = ([DateTime]::new(1858, 11, 17).AddDays($mjd)).ToString("yyyy-MM-dd HH:mm:ss", [Globalization.CultureInfo]::InvariantCulture)
      $center = [Uri]::EscapeDataString("$raText,$decText")
      $cutoutUrl = "$($row.access_url)?center=$center&size=$sizeText"
      $observations.Add([pscustomobject]@{
        uri = $cutoutUrl
        date = $date
        name = $row.obs_id
        mjd = $mjd
        bandpass = $row.energy_bandpassname
        observation = $row.obs_id
        collection = $row.obs_collection
      })
    }
  }

  $unique = @{}
  foreach ($item in ($observations | Sort-Object mjd)) {
    $key = "$($item.observation)|$($item.bandpass)|$($item.mjd)"
    if (-not $unique.ContainsKey($key)) { $unique[$key] = $item }
  }
  return @($unique.Values | Sort-Object mjd)
}

function Send-StaticFile($context, [string]$requestPath) {
  $relativePath = [Uri]::UnescapeDataString($requestPath.TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = "index.html" }
  $filePath = [IO.Path]::GetFullPath((Join-Path $root $relativePath))
  $rootPrefix = [IO.Path]::GetFullPath($root).TrimEnd("\") + "\"
  if (-not $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
    Write-Response $context 404 "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Not found"))
    return
  }
  $mime = switch ([IO.Path]::GetExtension($filePath).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".js" { "text/javascript; charset=utf-8" }
    ".fits" { "application/fits" }
    default { "application/octet-stream" }
  }
  Write-Response $context 200 $mime ([IO.File]::ReadAllBytes($filePath))
}

try {
  $listener.Start()
  Write-Host "SPHEREx Sky Motion Lab: http://127.0.0.1:8765"
  Write-Host "The built-in astronomy FAQ works without a separate AI service."
  Write-Host "Press Ctrl+C to stop the server."

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $path = $context.Request.Url.AbsolutePath
      if ($context.Request.HttpMethod -ne "GET") {
        Write-Json $context 405 @{ error = "Only GET is supported." }
      } elseif ($path -eq "/api/observations") {
        try {
          Write-Json $context 200 (Get-Observations $context)
        } catch {
          Write-Host "SPHEREx SIA error: $($_.Exception.Message)"
          $status = if ($_.Exception.Message.Contains("coordinates")) { 400 } else { 502 }
          Write-Json $context $status @{ error = $_.Exception.Message }
        }
      } elseif ($path -eq "/api/frame") {
        try {
          $source = [Uri]$context.Request.QueryString["url"]
          if ($source.Scheme -ne "https" -or $source.Host -ne "irsa.ipac.caltech.edu" -or -not $source.AbsolutePath.StartsWith("/ibe/data/spherex/")) {
            throw "Only IRSA SPHEREx FITS URLs are allowed."
          }
          $request = [Net.HttpWebRequest]::Create($source)
          $request.Timeout = 120000
          $request.ReadWriteTimeout = 120000
          $upstream = $request.GetResponse()
          try {
            $context.Response.StatusCode = 200
            $context.Response.ContentType = "application/fits"
            $context.Response.Headers.Add("Cache-Control", "public, max-age=3600")
            $stream = $upstream.GetResponseStream()
            $stream.CopyTo($context.Response.OutputStream)
            $context.Response.Close()
          } finally {
            $upstream.Close()
          }
        } catch {
          Write-Host "SPHEREx FITS error: $($_.Exception.Message)"
          try { Write-Json $context 502 @{ error = $_.Exception.Message } } catch {}
        }
      } else {
        Send-StaticFile $context $path
      }
    } catch {
      Write-Host "Request error: $($_.Exception.Message)"
      try { Write-Json $context 500 @{ error = $_.Exception.Message } } catch {}
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
