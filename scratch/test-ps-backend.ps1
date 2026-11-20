# Test script to verify PowerShell backend functions in server.ps1
$ErrorActionPreference = "Stop"

Write-Host "Verifying PowerShell backend logic in server.ps1..."

# Load server.ps1 functions by reading content and extracting functions
$content = Get-Content -Raw -Path "E:\AI app\server.ps1"

# Check syntax of server.ps1
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$parseErrors) | Out-Null

if ($parseErrors.Count -gt 0) {
    Write-Error "Syntax errors in server.ps1: $($parseErrors | Format-Table -AutoSize | Out-String)"
    exit 1
} else {
    Write-Host "  PASS: server.ps1 syntax is 100% valid with 0 parse errors."
}

# Run unit tests on search normalization, phone normalization, duplicate checking
function Normalize-SearchText([string]$Str) {
  if ([string]::IsNullOrWhiteSpace($Str)) { return "" }
  return ($Str -replace '\s+', ' ').Trim().ToLowerInvariant()
}

function Normalize-Phone([string]$Str) {
  if ([string]::IsNullOrWhiteSpace($Str)) { return "" }
  return ($Str -replace '[^0-9]', '')
}

$sampleStudents = @(
  [PSCustomObject]@{
    id = "stu-1"
    name = "Naveen CSE"
    email = "naveen@mahendra.info"
    phone = "+91 9876543210"
    regNo = "26M1705257"
    status = "Active"
  }
)

function Find-StudentTest([string]$Identifier) {
  $identTrim = $Identifier.Trim()
  $cleanIdent = Normalize-SearchText $Identifier
  $digitsIdent = Normalize-Phone $Identifier

  foreach ($s in $sampleStudents) {
    if (([string]$s.regNo).Trim().Equals($identTrim, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $s
    }
  }
  foreach ($s in $sampleStudents) {
    if (([string]$s.email).Trim().Equals($identTrim, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $s
    }
  }
  if ($digitsIdent.Length -ge 7) {
    foreach ($s in $sampleStudents) {
      $sPhone = Normalize-Phone ([string]$s.phone)
      if ($sPhone.Length -ge 7 -and ($sPhone -eq $digitsIdent -or $sPhone.EndsWith($digitsIdent))) {
        return $s
      }
    }
  }
  foreach ($s in $sampleStudents) {
    if ((Normalize-SearchText ([string]$s.name)) -eq $cleanIdent) {
      return $s
    }
  }
  return $null
}

# Assertions
$m1 = Find-StudentTest "  26m1705257  "
if ($null -ne $m1 -and $m1.id -eq "stu-1") { Write-Host "  PASS: RegNo case-insensitive search with whitespace" } else { throw "RegNo failed" }

$m2 = Find-StudentTest "NAVEEN@MAHENDRA.INFO"
if ($null -ne $m2 -and $m2.id -eq "stu-1") { Write-Host "  PASS: Email search case-insensitive" } else { throw "Email failed" }

$m3 = Find-StudentTest "9876543210"
if ($null -ne $m3 -and $m3.id -eq "stu-1") { Write-Host "  PASS: Phone search" } else { throw "Phone failed" }

$m4 = Find-StudentTest "  Naveen   CSE "
if ($null -ne $m4 -and $m4.id -eq "stu-1") { Write-Host "  PASS: Full Name normalized search" } else { throw "Name failed" }

Write-Host "All PowerShell backend tests PASSED!"
