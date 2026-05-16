param(
  [string]$VersionCode = "",
  [string]$VersionName = ""
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$androidDir = Join-Path $root "android"
$jbr = "C:\Program Files\Android\Android Studio\jbr"

if (!(Test-Path -LiteralPath $jbr)) {
  throw "Android Studio JBR not found at $jbr. Install Android Studio or set JAVA_HOME before running this script."
}

$env:JAVA_HOME = $jbr
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

if ($VersionCode) { $env:LOCA_VERSION_CODE = $VersionCode }
if ($VersionName) { $env:LOCA_VERSION_NAME = $VersionName }

Push-Location $root
try {
  npm.cmd run build
  npx.cmd cap sync android
}
finally {
  Pop-Location
}

Push-Location $androidDir
try {
  .\gradlew.bat bundleRelease --no-daemon --console=plain
}
finally {
  Pop-Location
}
