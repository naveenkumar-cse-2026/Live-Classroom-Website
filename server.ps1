param(
  [int]$Port = 8080,
  [string]$BindAddress = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PublicDir = Join-Path $RootDir "public"
$DataDir = Join-Path $RootDir "data"
$DbPath = Join-Path $DataDir "db.json"
$AuthPath = Join-Path $DataDir "auth.json"
$SessionsPath = Join-Path $DataDir "sessions.json"

if (-not (Test-Path $DataDir)) {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
}

#  =========================================================================
#    CRYPTOGRAPHY: PBKDF2-HMAC-SHA256 & SECURE SESSION TOKENS
#    ========================================================================= 
function New-RandomBytes([int]$Length) {
  $bytes = New-Object byte[] $Length
  $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return $bytes
}

function New-PasswordHash([string]$Password, [int]$Iterations = 100000) {
  $saltBytes = New-RandomBytes 16
  $pbkdf2 = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
    $Password, $saltBytes, $Iterations, [System.Security.Cryptography.HashAlgorithmName]::SHA256
  )
  try {
    $hashBytes = $pbkdf2.GetBytes(32)
  } finally {
    $pbkdf2.Dispose()
  }
  return @{
    salt = [Convert]::ToBase64String($saltBytes)
    hash = [Convert]::ToBase64String($hashBytes)
    iterations = $Iterations
    algo = "PBKDF2-SHA256"
  }
}

function Test-PasswordHash([string]$Password, $StoredRecord) {
  if ([string]::IsNullOrEmpty($Password) -or $null -eq $StoredRecord) { return $false }
  if ([string]::IsNullOrEmpty($StoredRecord.salt) -or [string]::IsNullOrEmpty($StoredRecord.hash)) { return $false }
  try {
    $saltBytes = [Convert]::FromBase64String($StoredRecord.salt)
    $expected = [Convert]::FromBase64String($StoredRecord.hash)
    $iters = if ($StoredRecord.iterations) { [int]$StoredRecord.iterations } else { 100000 }
    $pbkdf2 = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
      $Password, $saltBytes, $iters, [System.Security.Cryptography.HashAlgorithmName]::SHA256
    )
    try {
      $actual = $pbkdf2.GetBytes($expected.Length)
    } finally {
      $pbkdf2.Dispose()
    }
    if ($actual.Length -ne $expected.Length) { return $false }
    $diff = 0
    for ($i = 0; $i -lt $actual.Length; $i++) {
      $diff = $diff -bor ($actual[$i] -bxor $expected[$i])
    }
    return ($diff -eq 0)
  } catch {
    return $false
  }
}

function New-SessionToken {
  $bytes = New-RandomBytes 32
  return ([BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
}

function Make-Initials([string]$Name) {
  $clean = ($Name -replace '^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*', '').Trim()
  if ([string]::IsNullOrWhiteSpace($clean)) { return "AD" }
  $parts = $clean -split '\s+'
  $a = if ($parts.Length -ge 1 -and $parts[0].Length -ge 1) { $parts[0].Substring(0, 1) } else { "U" }
  $b = if ($parts.Length -ge 2 -and $parts[1].Length -ge 1) { $parts[1].Substring(0, 1) } elseif ($parts[0].Length -ge 2) { $parts[0].Substring(1, 1) } else { "" }
  return ($a + $b).ToUpperInvariant()
}

#  =========================================================================
#    DATABASE & AUTH PERSISTENCE
#    ========================================================================= 
function Get-DefaultDb {
  return @{
    revision = 1
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    emergencyAlert = $null
    settings = @{
      collegeName = ""
      shortName = "Live AI Classroom"
      collegeCode = ""
      domain = ""
      address = ""
      logoDataUrl = ""
      adminProfile = @{
        name = "Naveen Kumar"
        designation = "Administrator"
        email = ""
        initials = "NK"
      }
      autoTranscripts = $true
      scanAndSolveEnabled = $true
      aiEngineVersion = "v4.2"
      lastCloudSync = ""
      departments = @()
      programs = @()
    }
    students = @()
    teachers = @()
    liveClasses = @()
    materials = @()
    assignments = @()
    notices = @()
    events = @()
    timetable = @()
    timetableImage = $null
    chatMessages = @()
    activityLog = @()
  }
}

function Save-JsonFile([string]$FilePath, $Obj) {
  $json = $Obj | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText($FilePath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Load-Db {
  if (-not (Test-Path $DbPath)) {
    $db = Get-DefaultDb
    Save-JsonFile $DbPath $db
    return $db
  }
  $raw = [System.IO.File]::ReadAllText($DbPath, [System.Text.Encoding]::UTF8)
  return ($raw | ConvertFrom-Json)
}

function Load-AuthStore {
  if (-not (Test-Path $AuthPath)) {
    $initialAdminHash = New-PasswordHash "Naveen@2008"
    $auth = @{
      admin = @{
        name = "Naveen Kumar"
        username = "Naveen Kumar"
        designation = "Administrator"
        salt = $initialAdminHash.salt
        hash = $initialAdminHash.hash
        iterations = $initialAdminHash.iterations
        algo = $initialAdminHash.algo
        mustChangePassword = $true
        updatedAt = (Get-Date).ToUniversalTime().ToString("o")
      }
      studentCredentials = @{}
    }
    Save-JsonFile $AuthPath $auth
    return (Load-AuthStore)
  }
  $raw = [System.IO.File]::ReadAllText($AuthPath, [System.Text.Encoding]::UTF8)
  $parsed = $raw | ConvertFrom-Json
  $adminMap = @{
    name = "Naveen Kumar"
    username = "Naveen Kumar"
    designation = "Administrator"
    salt = ""
    hash = ""
    iterations = 100000
    algo = "PBKDF2-SHA256"
    mustChangePassword = $true
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  if ($null -ne $parsed.admin) {
    foreach ($p in $parsed.admin.PSObject.Properties) {
      $adminMap[$p.Name] = $p.Value
    }
  }
  # Convert studentCredentials to Hashtable for easy key assignment
  $credMap = @{}
  if ($null -ne $parsed.studentCredentials) {
    foreach ($p in $parsed.studentCredentials.PSObject.Properties) {
      $credMap[$p.Name] = $p.Value
    }
  }
  return @{
    admin = $adminMap
    studentCredentials = $credMap
  }
}

function Load-Sessions {
  $map = @{}
  if (Test-Path $SessionsPath) {
    try {
      $raw = [System.IO.File]::ReadAllText($SessionsPath, [System.Text.Encoding]::UTF8)
      $parsed = $raw | ConvertFrom-Json
      $now = (Get-Date).ToUniversalTime()
      foreach ($p in $parsed.PSObject.Properties) {
        $exp = [DateTime]::Parse($p.Value.expiresAt).ToUniversalTime()
        if ($exp -gt $now) {
          $map[$p.Name] = $p.Value
        }
      }
    } catch {}
  }
  return $map
}

function Save-Sessions {
  Save-JsonFile $SessionsPath $script:Sessions
}

function New-Session([string]$Role, [string]$UserId, [string]$Name) {
  $token = New-SessionToken
  $session = @{
    token = $token
    role = $Role
    userId = $UserId
    name = $Name
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    expiresAt = (Get-Date).ToUniversalTime().AddHours(24).ToString("o")
  }
  $script:Sessions[$token] = $session
  Save-Sessions
  return $session
}

function Get-RequestSession($Headers) {
  $token = $null
  if ($Headers.ContainsKey("x-auth-token")) {
    $token = $Headers["x-auth-token"]
  } elseif ($Headers.ContainsKey("authorization")) {
    $authHdr = $Headers["authorization"]
    if ($authHdr -match "^Bearer\s+(.+)$") { $token = $Matches[1].Trim() }
  }
  if ([string]::IsNullOrWhiteSpace($token)) { return $null }
  if (-not $script:Sessions.ContainsKey($token)) { return $null }
  $sess = $script:Sessions[$token]
  try {
    $exp = [DateTime]::Parse($sess.expiresAt).ToUniversalTime()
    if ($exp -le (Get-Date).ToUniversalTime()) {
      $script:Sessions.Remove($token)
      Save-Sessions
      return $null
    }
  } catch { return $null }
  return $sess
}

function Sanitize-DbForClient($DbObj) {
  # Ensure NO password or _newPassword field ever leaves the backend
  if ($null -ne $DbObj.students) {
    foreach ($stu in @($DbObj.students)) {
      if ($null -eq $stu) { continue }
      if ($stu.PSObject.Properties["password"]) {
        $stu.PSObject.Properties.Remove("password")
      }
      if ($stu.PSObject.Properties["_newPassword"]) {
        $stu.PSObject.Properties.Remove("_newPassword")
      }
    }
  }
  return $DbObj
}

function Repair-And-Migrate {
  $dbChanged = $false
  $authChanged = $false

  # 1. Migrate any plaintext student passwords into hashed auth.json
  if ($null -ne $script:Db.students) {
    foreach ($stu in @($script:Db.students)) {
      if ($null -eq $stu) { continue }
      $hasPwdProp = $stu.PSObject.Properties["password"]
      if ($hasPwdProp -and -not [string]::IsNullOrEmpty([string]$stu.password)) {
        if (-not $script:Auth.studentCredentials.ContainsKey($stu.id)) {
          $script:Auth.studentCredentials[$stu.id] = New-PasswordHash ([string]$stu.password)
          $authChanged = $true
        }
        $stu.PSObject.Properties.Remove("password")
        $dbChanged = $true
      }
    }
  }

  # 2. Repair any timetable slots missing an id
  if ($null -ne $script:Db.timetable) {
    $idx = 1
    foreach ($slot in @($script:Db.timetable)) {
      if ($null -eq $slot) { continue }
      $curId = if ($slot.PSObject.Properties["id"]) { [string]$slot.id } else { "" }
      if ([string]::IsNullOrWhiteSpace($curId)) {
        $newId = "tt-migrated-$idx-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
        $slot | Add-Member -NotePropertyName "id" -NotePropertyValue $newId -Force
        $dbChanged = $true
      }
      $idx++
    }
  }

  # 3. Ensure adminProfile displays Naveen Kumar if still generic default
  if ($null -ne $script:Db.settings -and $null -ne $script:Db.settings.adminProfile) {
    if ($script:Db.settings.adminProfile.name -eq "Administrator") {
      $script:Db.settings.adminProfile.name = $script:Auth.admin.name
      $script:Db.settings.adminProfile.initials = Make-Initials $script:Auth.admin.name
      $dbChanged = $true
    }
  }

  if ($authChanged) { Save-JsonFile $AuthPath $script:Auth }
  if ($dbChanged) {
    $script:Db.revision = ([int]$script:Db.revision) + 1
    $script:Db.updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    Save-JsonFile $DbPath $script:Db
  }
}

$script:Db = Load-Db
$script:Auth = Load-AuthStore
$script:Sessions = Load-Sessions
Repair-And-Migrate

#  =========================================================================
#    HTTP SERVER UTILITIES
#    ========================================================================= 
function Get-MimeType([string]$Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css"  { return "text/css; charset=utf-8" }
    ".js"   { return "application/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".svg"  { return "image/svg+xml" }
    ".png"  { return "image/png" }
    ".jpg"  { return "image/jpeg" }
    ".ico"  { return "image/x-icon" }
    default { return "application/octet-stream" }
  }
}

function Write-HttpResponse {
  param(
    [System.IO.Stream]$Stream,
    [int]$StatusCode = 200,
    [string]$StatusText = "OK",
    [string]$ContentType = "application/json; charset=utf-8",
    [byte[]]$BodyBytes = @()
  )
  $headerStr = "HTTP/1.1 $StatusCode $StatusText`r`n" +
               "Content-Type: $ContentType`r`n" +
               "Content-Length: $($BodyBytes.Length)`r`n" +
               "Access-Control-Allow-Origin: *`r`n" +
               "Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`r`n" +
               "Access-Control-Allow-Headers: Content-Type, X-Auth-Token, Authorization`r`n" +
               "Cache-Control: no-store`r`n" +
               "Connection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerStr)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($BodyBytes.Length -gt 0) {
    $Stream.Write($BodyBytes, 0, $BodyBytes.Length)
  }
  $Stream.Flush()
}

function Send-Json($Stream, $Obj, [int]$Status = 200, [string]$Text = "OK") {
  $json = $Obj | ConvertTo-Json -Depth 20 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Write-HttpResponse -Stream $Stream -StatusCode $Status -StatusText $Text -ContentType "application/json; charset=utf-8" -BodyBytes $bytes
}

function Read-HttpRequest([System.IO.Stream]$Stream) {
  $ms = New-Object System.IO.MemoryStream
  $buf = New-Object byte[] 4096
  $headerEnd = -1
  $rawBytes = [byte[]]@()

  while ($true) {
    $read = $Stream.Read($buf, 0, $buf.Length)
    if ($read -le 0) { break }
    $ms.Write($buf, 0, $read)
    $rawBytes = $ms.ToArray()
    for ($i = [Math]::Max(0, $rawBytes.Length - $read - 3); $i -le $rawBytes.Length - 4; $i++) {
      if ($rawBytes[$i] -eq 13 -and $rawBytes[$i+1] -eq 10 -and $rawBytes[$i+2] -eq 13 -and $rawBytes[$i+3] -eq 10) {
        $headerEnd = $i + 4
        break
      }
    }
    if ($headerEnd -ge 0) { break }
    if ($rawBytes.Length -gt 1048576) { break }
  }

  if ($headerEnd -lt 0) { return $null }

  $headerText = [System.Text.Encoding]::ASCII.GetString($rawBytes, 0, $headerEnd)
  $lines = $headerText -split "`r`n"
  $reqLine = $lines[0] -split " "
  if ($reqLine.Length -lt 2) { return $null }

  $method = $reqLine[0].ToUpperInvariant()
  $rawUrl = $reqLine[1]
  $path = ($rawUrl -split "\?")[0]
  $contentLength = 0
  $headers = @{}
  foreach ($line in $lines[1..($lines.Length - 1)]) {
    if ($line -match "^([^:]+):\s*(.*)$") {
      $k = $Matches[1].Trim().ToLowerInvariant()
      $v = $Matches[2].Trim()
      $headers[$k] = $v
      if ($k -eq "content-length") {
        $contentLength = [int]$v
      }
    }
  }

  $bodyStream = New-Object System.IO.MemoryStream
  $already = $rawBytes.Length - $headerEnd
  if ($already -gt 0 -and $contentLength -gt 0) {
    $bodyStream.Write($rawBytes, $headerEnd, [Math]::Min($already, $contentLength))
  }
  if ($contentLength -gt 0) { $Stream.ReadTimeout = 30000 }
  while ($bodyStream.Length -lt $contentLength) {
    $need = [Math]::Min($buf.Length, $contentLength - $bodyStream.Length)
    $r = $Stream.Read($buf, 0, $need)
    if ($r -le 0) { break }
    $bodyStream.Write($buf, 0, $r)
  }

  $bodyStr = ""
  if ($bodyStream.Length -gt 0) {
    $bodyStr = [System.Text.Encoding]::UTF8.GetString($bodyStream.ToArray())
  }

  return @{
    Method = $method
    Path = $path
    Headers = $headers
    Body = $bodyStr
  }
}

function Add-ActivityLog([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return }
  $entry = [PSCustomObject]@{
    id = "act-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    time = (Get-Date).ToUniversalTime().ToString("o")
    text = $Text
  }
  $existing = @($script:Db.activityLog)
  $script:Db.activityLog = @($entry) + @($existing | Select-Object -First 29)
}

function Bump-And-SaveDb {
  $script:Db.revision = ([int]$script:Db.revision) + 1
  $script:Db.updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  Save-JsonFile $DbPath $script:Db
}

function Parse-JsonBody([string]$RawBody) {
  if ([string]::IsNullOrWhiteSpace($RawBody)) { return $null }
  try {
    return ($RawBody | ConvertFrom-Json)
  } catch {
    return $null
  }
}

$ip = [System.Net.IPAddress]::Parse($BindAddress)
$listener = New-Object System.Net.Sockets.TcpListener($ip, $Port)
$listener.Start()

$listenerV6 = $null
if ($BindAddress -eq "127.0.0.1") {
  try {
    $listenerV6 = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::IPv6Loopback, $Port)
    $listenerV6.Start()
  } catch {
    $listenerV6 = $null
  }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  LIVE AI CLASSROOM PRO - SECURE REAL-TIME SERVER ONLINE" -ForegroundColor Cyan
Write-Host "  URL:  http://localhost:$Port/" -ForegroundColor Green
Write-Host "  DB:   $DbPath" -ForegroundColor Gray
Write-Host "  AUTH: PBKDF2-SHA256 Protected (v2.0-secure)" -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to stop the server." -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host ""

try {
  while ($true) {
    $client = $null
    if ($listener.Pending()) {
      $client = $listener.AcceptTcpClient()
    } elseif ($null -ne $listenerV6 -and $listenerV6.Pending()) {
      $client = $listenerV6.AcceptTcpClient()
    } else {
      [System.Threading.Thread]::Sleep(5)
      continue
    }
    $client.ReceiveTimeout = 2000
    $client.SendTimeout = 15000
    try {
      # Drop idle browser speculative preconnect sockets quickly
      if (-not $client.Client.Poll(300000, [System.Net.Sockets.SelectMode]::SelectRead)) {
        continue
      }
      $stream = $client.GetStream()
      try {
        $req = Read-HttpRequest $stream
      } catch {
        $req = $null
      }
      if ($null -eq $req) { continue }

      $method = $req.Method
      $path = $req.Path
      $headers = $req.Headers

      if ($method -eq "OPTIONS") {
        Write-HttpResponse -Stream $stream -StatusCode 204 -StatusText "No Content" -BodyBytes ([byte[]]@())
        continue
      }

      if ($path -eq "/api/health") {
        Send-Json $stream @{
          ok = $true
          authEnabled = $true
          serverVersion = "2.0-secure"
          revision = $script:Db.revision
          serverTime = (Get-Date).ToUniversalTime().ToString("o")
        }
        continue
      }

      if ($path -eq "/api/version" -and $method -eq "GET") {
        Send-Json $stream @{
          revision = $script:Db.revision
          updatedAt = $script:Db.updatedAt
          authEnabled = $true
          serverVersion = "2.0-secure"
        }
        continue
      }

      #  ---------------- AUTHENTICATION ROUTES ---------------- 
      if ($path -eq "/api/auth/me" -and $method -eq "GET") {
        $sess = Get-RequestSession $headers
        if ($null -eq $sess) {
          Send-Json $stream @{ authenticated = $false } 401 "Unauthorized"
          continue
        }
        $mustChange = ($sess.role -eq "admin" -and [bool]$script:Auth.admin.mustChangePassword)
        Send-Json $stream @{
          authenticated = $true
          role = $sess.role
          userId = $sess.userId
          name = $sess.name
          mustChangePassword = $mustChange
        }
        continue
      }

      if ($path -eq "/api/auth/logout" -and $method -eq "POST") {
        $sess = Get-RequestSession $headers
        if ($null -ne $sess -and $script:Sessions.ContainsKey($sess.token)) {
          $script:Sessions.Remove($sess.token)
          Save-Sessions
        }
        Send-Json $stream @{ ok = $true }
        continue
      }

      if ($path -eq "/api/auth/admin/login" -and $method -eq "POST") {
        $body = Parse-JsonBody $req.Body
        if ($null -eq $body) {
          Send-Json $stream @{ ok = $false; error = "Invalid login request payload" } 400 "Bad Request"
          continue
        }
        $inName = (([string]$body.name) -replace '\s+', ' ').Trim()
        $inPwd = [string]$body.password
        if ([string]::IsNullOrWhiteSpace($inName)) {
          Send-Json $stream @{ ok = $false; error = "Please enter the administrator name" } 400 "Bad Request"
          continue
        }
        if ([string]::IsNullOrEmpty($inPwd)) {
          Send-Json $stream @{ ok = $false; error = "Please enter your password" } 400 "Bad Request"
          continue
        }
        $admin = $script:Auth.admin
        $adminEmail = ""
        if ($null -ne $script:Db.settings -and $null -ne $script:Db.settings.adminProfile -and $null -ne $script:Db.settings.adminProfile.email) {
          $adminEmail = ([string]$script:Db.settings.adminProfile.email).Trim()
        }
        $normAdminName = (([string]$admin.name) -replace '\s+', ' ').Trim()
        $normAdminUser = (([string]$admin.username) -replace '\s+', ' ').Trim()
        $nameMatches = ($inName.Equals($normAdminName, [System.StringComparison]::OrdinalIgnoreCase)) -or
                       ($inName.Equals($normAdminUser, [System.StringComparison]::OrdinalIgnoreCase)) -or
                       (-not [string]::IsNullOrWhiteSpace($adminEmail) -and $inName.Equals($adminEmail, [System.StringComparison]::OrdinalIgnoreCase))
        $pwdValid = Test-PasswordHash $inPwd $admin
        if (-not ($nameMatches -and $pwdValid)) {
          Send-Json $stream @{ ok = $false; error = "Invalid administrator name or password" } 401 "Unauthorized"
          continue
        }
        $sess = New-Session "admin" "admin-primary" $admin.name
        Add-ActivityLog "Administrator $($admin.name) signed in"
        Bump-And-SaveDb
        Send-Json $stream @{
          ok = $true
          token = $sess.token
          role = "admin"
          admin = @{
            name = $admin.name
            designation = $admin.designation
            mustChangePassword = [bool]$admin.mustChangePassword
          }
        }
        continue
      }

      if ($path -eq "/api/auth/admin/change-password" -and $method -eq "POST") {
        $sess = Get-RequestSession $headers
        if ($null -eq $sess -or $sess.role -ne "admin") {
          Send-Json $stream @{ ok = $false; error = "Administrator authentication required" } 403 "Forbidden"
          continue
        }
        $body = $req.Body | ConvertFrom-Json
        $curPwd = [string]$body.currentPassword
        $newPwd = [string]$body.newPassword
        if ([string]::IsNullOrEmpty($curPwd) -or [string]::IsNullOrEmpty($newPwd)) {
          Send-Json $stream @{ ok = $false; error = "Current password and new password are required" } 400 "Bad Request"
          continue
        }
        if ($newPwd.Length -lt 8) {
          Send-Json $stream @{ ok = $false; error = "New admin password must be at least 8 characters" } 400 "Bad Request"
          continue
        }
        if (-not (Test-PasswordHash $curPwd $script:Auth.admin)) {
          Send-Json $stream @{ ok = $false; error = "Current password is incorrect" } 401 "Unauthorized"
          continue
        }
        $newHash = New-PasswordHash $newPwd
        $script:Auth.admin.salt = $newHash.salt
        $script:Auth.admin.hash = $newHash.hash
        $script:Auth.admin.iterations = $newHash.iterations
        $script:Auth.admin.mustChangePassword = $false
        $script:Auth.admin.updatedAt = (Get-Date).ToUniversalTime().ToString("o")
        Save-JsonFile $AuthPath $script:Auth
        Add-ActivityLog "Administrator password changed securely"
        Bump-And-SaveDb
        Send-Json $stream @{ ok = $true; mustChangePassword = $false }
        continue
      }

      if ($path -eq "/api/auth/student/login" -and $method -eq "POST") {
        $body = Parse-JsonBody $req.Body
        if ($null -eq $body) {
          Send-Json $stream @{ ok = $false; error = "Invalid login request payload" } 400 "Bad Request"
          continue
        }
        $ident = (([string]$body.identifier) -replace '\s+', ' ').Trim()
        $pwd = [string]$body.password
        if ([string]::IsNullOrWhiteSpace($ident)) {
          Send-Json $stream @{ ok = $false; error = "Please enter your register number, email, or name" } 400 "Bad Request"
          continue
        }
        if ([string]::IsNullOrEmpty($pwd)) {
          Send-Json $stream @{ ok = $false; error = "Please enter your password" } 400 "Bad Request"
          continue
        }
        $match = $null
        foreach ($s in @($script:Db.students)) {
          if ($null -eq $s) { continue }
          if (([string]$s.regNo).Trim().Equals($ident, [System.StringComparison]::OrdinalIgnoreCase) -or
              ([string]$s.email).Trim().Equals($ident, [System.StringComparison]::OrdinalIgnoreCase)) {
            $match = $s
            break
          }
        }
        if ($null -eq $match) {
          $nameMatches = @()
          foreach ($s in @($script:Db.students)) {
            if ($null -eq $s) { continue }
            $normStuName = (([string]$s.name) -replace '\s+', ' ').Trim()
            if ($normStuName.Equals($ident, [System.StringComparison]::OrdinalIgnoreCase)) {
              $nameMatches += $s
            }
          }
          if ($nameMatches.Count -eq 1) {
            $match = $nameMatches[0]
          } elseif ($nameMatches.Count -gt 1) {
            Send-Json $stream @{ ok = $false; error = "Multiple students share that name. Please sign in using your register number or email." } 400 "Bad Request"
            continue
          }
        }
        if ($null -eq $match) {
          Send-Json $stream @{ ok = $false; error = "Student account not found" } 401 "Unauthorized"
          continue
        }
        if ($match.status -eq "Deactivated") {
          Send-Json $stream @{ ok = $false; error = "This student account is deactivated. Contact administration." } 403 "Forbidden"
          continue
        }
        $storedCred = $script:Auth.studentCredentials[$match.id]
        if ($null -eq $storedCred) {
          Send-Json $stream @{ ok = $false; error = "No password is set for this account. Please ask your administrator to set a password." } 401 "Unauthorized"
          continue
        }
        if (-not (Test-PasswordHash $pwd $storedCred)) {
          Send-Json $stream @{ ok = $false; error = "Incorrect Password" } 401 "Unauthorized"
          continue
        }
        $match | Add-Member -NotePropertyName "hasLoggedIn" -NotePropertyValue $true -Force
        $match | Add-Member -NotePropertyName "lastLoginAt" -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
        $match | Add-Member -NotePropertyName "status" -NotePropertyValue "Active" -Force
        if ($match.PSObject.Properties["password"]) { $match.PSObject.Properties.Remove("password") }
        if ($match.PSObject.Properties["_newPassword"]) { $match.PSObject.Properties.Remove("_newPassword") }
        Add-ActivityLog "Student $($match.name) signed in"
        Bump-And-SaveDb
        $sess = New-Session "student" $match.id $match.name
        Send-Json $stream @{
          ok = $true
          token = $sess.token
          role = "student"
          student = $match
        }
        continue
      }

      if ($path -eq "/api/auth/student/register" -and $method -eq "POST") {
        $body = $req.Body | ConvertFrom-Json
        $name = ([string]$body.name).Trim()
        $email = ([string]$body.email).Trim()
        $regNo = ([string]$body.regNo).Trim().ToUpperInvariant()
        $pwd = [string]$body.password
        if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($regNo)) {
          Send-Json $stream @{ ok = $false; error = "Name, email, and register number are required" } 400 "Bad Request"
          continue
        }
        if ([string]::IsNullOrEmpty($pwd) -or $pwd.Length -lt 6) {
          Send-Json $stream @{ ok = $false; error = "Password must be at least 6 characters" } 400 "Bad Request"
          continue
        }
        $dupFound = $false
        foreach ($s in @($script:Db.students)) {
          if ($null -eq $s) { continue }
          if (([string]$s.regNo).Equals($regNo, [System.StringComparison]::OrdinalIgnoreCase) -or
              ([string]$s.email).Equals($email, [System.StringComparison]::OrdinalIgnoreCase)) {
            $dupFound = $true
            break
          }
        }
        if ($dupFound) {
          Send-Json $stream @{ ok = $false; error = "A student with that register number or email already exists" } 409 "Conflict"
          continue
        }
        $stuId = "stu-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
        $nowIso = (Get-Date).ToUniversalTime().ToString("o")
        $newStu = [PSCustomObject]@{
          id = $stuId
          name = $name
          initials = Make-Initials $name
          email = $email
          regNo = $regNo
          department = ([string]$body.department).Trim()
          program = ([string]$body.program).Trim()
          year = if ($body.year) { [string]$body.year } else { "Year 1" }
          section = if ($body.section) { ([string]$body.section).Trim() } else { "Sec A" }
          semester = "Semester 1"
          cgpa = "-"
          attendance = 0
          aiScore = "-"
          creditsCleared = "-"
          status = "Active"
          hasLoggedIn = $true
          lastLoginAt = $nowIso
          aiProvisioned = $true
          avatarDataUrl = ""
        }
        $script:Auth.studentCredentials[$stuId] = New-PasswordHash $pwd
        Save-JsonFile $AuthPath $script:Auth
        $script:Db.students = @($newStu) + @($script:Db.students)
        Add-ActivityLog "Registered student $name ($regNo)"
        Bump-And-SaveDb
        $sess = New-Session "student" $stuId $name
        Send-Json $stream @{ ok = $true; token = $sess.token; role = "student"; student = $newStu }
        continue
      }

      if ($path -eq "/api/auth/student/change-password" -and $method -eq "POST") {
        $sess = Get-RequestSession $headers
        if ($null -eq $sess) {
          Send-Json $stream @{ ok = $false; error = "Authentication required" } 401 "Unauthorized"
          continue
        }
        $body = $req.Body | ConvertFrom-Json
        $targetId = if ($sess.role -eq "admin" -and $body.studentId) { [string]$body.studentId } else { [string]$sess.userId }
        $newPwd = [string]$body.newPassword
        if ([string]::IsNullOrEmpty($newPwd) -or $newPwd.Length -lt 6) {
          Send-Json $stream @{ ok = $false; error = "New password must be at least 6 characters" } 400 "Bad Request"
          continue
        }
        if ($sess.role -ne "admin") {
          $curPwd = [string]$body.currentPassword
          if ([string]::IsNullOrEmpty($curPwd)) {
            Send-Json $stream @{ ok = $false; error = "Please enter your current password" } 400 "Bad Request"
            continue
          }
          $stored = $script:Auth.studentCredentials[$targetId]
          if ($null -eq $stored -or -not (Test-PasswordHash $curPwd $stored)) {
            Send-Json $stream @{ ok = $false; error = "Current password is incorrect" } 401 "Unauthorized"
            continue
          }
        }
        $script:Auth.studentCredentials[$targetId] = New-PasswordHash $newPwd
        Save-JsonFile $AuthPath $script:Auth
        Send-Json $stream @{ ok = $true }
        continue
      }

      #  ---------------- DATA & PROTECTED ROUTES ---------------- 
      if ($path -eq "/api/state" -and $method -eq "GET") {
        $safe = Sanitize-DbForClient $script:Db
        Send-Json $stream $safe
        continue
      }

      if ($path -eq "/api/state" -and ($method -eq "PUT" -or $method -eq "POST")) {
        $sess = Get-RequestSession $headers
        if ($null -eq $sess -or $sess.role -ne "admin") {
          Send-Json $stream @{ ok = $false; error = "Administrator authentication required" } 403 "Forbidden"
          continue
        }
        if ([string]::IsNullOrWhiteSpace($req.Body)) {
          Send-Json $stream @{ error = "Empty payload" } 400 "Bad Request"
          continue
        }
        $incoming = $req.Body | ConvertFrom-Json

        # Extract and hash any _newPassword supplied by Admin for students
        $authUpdated = $false
        if ($null -ne $incoming.students) {
          foreach ($stu in @($incoming.students)) {
            if ($null -eq $stu) { continue }
            if ($stu.PSObject.Properties["_newPassword"] -and -not [string]::IsNullOrEmpty([string]$stu._newPassword)) {
              $script:Auth.studentCredentials[$stu.id] = New-PasswordHash ([string]$stu._newPassword)
              $authUpdated = $true
              $stu.PSObject.Properties.Remove("_newPassword")
            }
            if ($stu.PSObject.Properties["password"]) {
              $stu.PSObject.Properties.Remove("password")
            }
          }
        }
        # Sync admin profile display name to auth store if changed
        if ($null -ne $incoming.settings -and $null -ne $incoming.settings.adminProfile -and -not [string]::IsNullOrWhiteSpace([string]$incoming.settings.adminProfile.name)) {
          $newAdminName = ([string]$incoming.settings.adminProfile.name).Trim()
          if ($script:Auth.admin.name -ne $newAdminName) {
            $script:Auth.admin.name = $newAdminName
            $script:Auth.admin.designation = ([string]$incoming.settings.adminProfile.designation).Trim()
            $authUpdated = $true
          }
        }
        if ($authUpdated) { Save-JsonFile $AuthPath $script:Auth }

        # Ensure every timetable entry has a non-empty id
        if ($null -ne $incoming.timetable) {
          $idx = 1
          foreach ($slot in @($incoming.timetable)) {
            if ($null -eq $slot) { continue }
            $curId = if ($slot.PSObject.Properties["id"]) { [string]$slot.id } else { "" }
            if ([string]::IsNullOrWhiteSpace($curId)) {
              $slot | Add-Member -NotePropertyName "id" -NotePropertyValue "tt-$idx-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Force
            }
            $idx++
          }
        }

        $nextRev = ([int]$script:Db.revision) + 1
        $incoming | Add-Member -NotePropertyName "revision" -NotePropertyValue $nextRev -Force
        $incoming | Add-Member -NotePropertyName "updatedAt" -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
        $script:Db = $incoming
        Save-JsonFile $DbPath $script:Db
        Send-Json $stream @{ ok = $true; revision = $script:Db.revision; updatedAt = $script:Db.updatedAt }
        continue
      }

      if ($path -eq "/api/student/action" -and $method -eq "POST") {
        $sess = Get-RequestSession $headers
        if ($null -eq $sess) {
          Send-Json $stream @{ ok = $false; error = "Authentication required" } 401 "Unauthorized"
          continue
        }
        $body = $req.Body | ConvertFrom-Json
        $action = [string]$body.action

        if ($action -eq "updateAvatar") {
          $targetId = if ($sess.role -eq "admin" -and $body.studentId) { [string]$body.studentId } else { [string]$sess.userId }
          foreach ($s in @($script:Db.students)) {
            if ($s.id -eq $targetId) {
              $s | Add-Member -NotePropertyName "avatarDataUrl" -NotePropertyValue ([string]$body.avatarDataUrl) -Force
              break
            }
          }
          Bump-And-SaveDb
          Send-Json $stream @{ ok = $true; revision = $script:Db.revision }
          continue
        }

        if ($action -eq "submitAssignment") {
          foreach ($a in @($script:Db.assignments)) {
            if ($a.id -eq [string]$body.assignmentId) {
              $a.status = "Graded"
              $a.dueLabel = "Submitted"
              $a.submissionFile = [string]$body.fileName
              $a.score = [int]$body.score
              $a.feedback = [string]$body.feedback
              Add-ActivityLog "$($sess.name) submitted $($a.title)"
              break
            }
          }
          Bump-And-SaveDb
          Send-Json $stream @{ ok = $true; revision = $script:Db.revision }
          continue
        }

        if ($action -eq "postLiveQA") {
          foreach ($c in @($script:Db.liveClasses)) {
            if ($c.id -eq [string]$body.classId) {
              $qaItem = [PSCustomObject]@{
                id = "qa-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
                author = $sess.name
                regNo = [string]$body.regNo
                text = ([string]$body.text).Trim()
                time = (Get-Date).ToString("hh:mm tt")
              }
              $c.qa = @($c.qa) + @($qaItem)
              break
            }
          }
          Bump-And-SaveDb
          Send-Json $stream @{ ok = $true; revision = $script:Db.revision }
          continue
        }

        if ($action -eq "appendChatMessage") {
          $msg = $body.message
          $script:Db.chatMessages = @($script:Db.chatMessages) + @($msg)
          Bump-And-SaveDb
          Send-Json $stream @{ ok = $true; revision = $script:Db.revision }
          continue
        }

        if ($action -eq "clearChat") {
          $script:Db.chatMessages = @()
          Bump-And-SaveDb
          Send-Json $stream @{ ok = $true; revision = $script:Db.revision }
          continue
        }

        Send-Json $stream @{ ok = $false; error = "Unknown student action" } 400 "Bad Request"
        continue
      }

      #  ---------------- UNKNOWN API GUARD ---------------- 
      if ($path.StartsWith("/api/", [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Json $stream @{ ok = $false; error = "API endpoint not found: $method $path" } 404 "Not Found"
        continue
      }

      #  ---------------- STATIC FILE SERVING ---------------- 
      $relPath = [System.Uri]::UnescapeDataString($path.TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($relPath)) { $relPath = "index.html" }
      $relPath = $relPath -replace "/", "\"
      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $PublicDir $relPath))
      $publicFull = [System.IO.Path]::GetFullPath($PublicDir)

      if (-not $fullPath.StartsWith($publicFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Json $stream @{ error = "Forbidden" } 403 "Forbidden"
        continue
      }

      if (Test-Path $fullPath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $mime = Get-MimeType $fullPath
        Write-HttpResponse -Stream $stream -StatusCode 200 -StatusText "OK" -ContentType $mime -BodyBytes $bytes
      } else {
        $indexFile = Join-Path $PublicDir "index.html"
        $bytes = [System.IO.File]::ReadAllBytes($indexFile)
        Write-HttpResponse -Stream $stream -StatusCode 200 -StatusText "OK" -ContentType "text/html; charset=utf-8" -BodyBytes $bytes
      }
    } catch {
      try { Send-Json $stream @{ ok = $false; error = $_.Exception.Message } 500 "Internal Server Error" } catch {}
    } finally {
      try { $client.Close() } catch {}
    }
  }
} finally {
  try { $listener.Stop() } catch {}
  if ($null -ne $listenerV6) { try { $listenerV6.Stop() } catch {} }
}
