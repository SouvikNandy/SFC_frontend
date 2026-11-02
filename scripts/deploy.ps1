# Deploys the Angular production build to the Ubuntu server.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File D:\brij\projects\SFC_frontend\scripts\deploy.ps1
# Uses your existing SSH config / keys (~/.ssh). No credentials are stored here.
# Flags: -SkipBuild  reuse the existing dist output instead of rebuilding.
#
# Server prerequisites (never changed by this script; the preflight lists exactly what is missing):
#   - unzip installed
#   - the ubuntu user can write every path this build will create or overwrite in /var/www/html
#     (checked per path; the web root is NOT chown'ed recursively)
#   - /var/www/html is root:ubuntu 1775 (sticky, not owned by ubuntu) so ubuntu can add files but cannot
#     delete or rename other users' files such as payoff.html
#   - passwordless sudo ONLY for: nginx -t   and   service nginx restart
#
# Existing site files that are not part of the build (payoff.html, index.nginx-debian.html, other
# files in assets/ ...) are never touched; payoff.html and index.nginx-debian.html are additionally
# protected: the deploy aborts if the build contains them, and their owner/mode/size/mtime are
# compared before and after the copy.
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'

$ProjectDir = Split-Path -Parent $PSScriptRoot
$Server     = 'ubuntu@13.205.99.59'
$RemoteDir  = '/home/ubuntu/SFC_Frontend'
$WebRoot    = '/var/www/html'
$SiteHost   = 'quantsfc.com'   # Host header for the post-deploy health check (HTTP 301 to HTTPS is expected)
$Protected  = @('payoff.html', 'index.nginx-debian.html')
$BrowserDir = Join-Path $ProjectDir 'dist\SFC_frontend\browser'
$ZipPath    = Join-Path $ProjectDir 'dist.zip'
$Tar        = Join-Path $env:SystemRoot 'System32\tar.exe'   # bsdtar: writes forward-slash zip entries
$SshOpts    = @('-o', 'BatchMode=yes')

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }

# Runs a bash script on the server over SSH. The script is fed via stdin from a LF-only file,
# and ssh exits (closing the session) as soon as the script ends.
function Invoke-Remote([string]$Name, [string]$Script, [switch]$ReturnExitCode) {
    $tmp = Join-Path $env:TEMP ("sfc-deploy-{0}-{1}.sh" -f $Name, [guid]::NewGuid().ToString('N'))
    try {
        # Wrapped in a function so bash parses the whole script before running it, and stdin is
        # /dev/null while it runs (no command can swallow the rest of the script from stdin).
        $body = "main() {`n" + ($Script -replace "`r", '') + "`n}`nmain </dev/null`nexit `$?`n"
        [IO.File]::WriteAllText($tmp, $body, (New-Object Text.UTF8Encoding($false)))
        $p = Start-Process -FilePath 'ssh' -ArgumentList ($SshOpts + @('-T', $Server, 'bash', '-s')) `
             -RedirectStandardInput $tmp -NoNewWindow -Wait -PassThru
        if ($ReturnExitCode) { return $p.ExitCode }
        if ($p.ExitCode -ne 0) { throw "Remote step '$Name' failed (exit code $($p.ExitCode))" }
    }
    finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

# Single-quoted here-strings: bash code is literal; __TOKENS__ are substituted by Expand-Tokens.
function Expand-Tokens([string]$Text, [hashtable]$Map) {
    foreach ($k in $Map.Keys) { $Text = $Text.Replace($k, [string]$Map[$k]) }
    $Text
}

$PreflightTemplate = @'
set -u
PATH="$PATH:/usr/sbin:/sbin"
WEB='__WEBROOT__'
mkdir -p '__REMOTEDIR__' || { echo 'ERROR: cannot create __REMOTEDIR__'; exit 1; }
missing=0
command -v unzip >/dev/null || { echo 'ERROR: unzip is not installed. Fix: sudo apt install unzip'; missing=1; }

# ---- Which build paths need write permission? (read-only checks, nothing is changed) ----
need=""; conflicts=""
add_need() { case $'\n'"$need" in *$'\n'"$1"$'\n'*) ;; *) need="$need$1"$'\n';; esac; }
# new entry at $1: the nearest existing ancestor directory must be writable and searchable
check_create() {
  local a; a=$(dirname "$1")
  while [ ! -e "$a" ] && [ "$a" != / ]; do a=$(dirname "$a"); done
  if [ ! -d "$a" ]; then conflicts="$conflicts$a (exists but is not a directory)"$'\n'
  elif [ ! -w "$a" ] || [ ! -x "$a" ]; then add_need "$a"; fi
}
while IFS='|' read -r kind rel; do
  [ -z "$rel" ] && continue
  case "$rel" in __PROTECTED_CASE__) echo "ERROR: the build contains protected file '$rel'; refusing to deploy."; exit 1;; esac
  t="$WEB/$rel"
  if [ "$kind" = d ]; then
    if [ -d "$t" ]; then [ -x "$t" ] || add_need "$t"
    elif [ -e "$t" ]; then conflicts="$conflicts$t (build has a directory here, server has a file)"$'\n'
    else check_create "$t"; fi
  else
    if [ -d "$t" ]; then conflicts="$conflicts$t (build has a file here, server has a directory)"$'\n'
    elif [ -e "$t" ]; then [ -w "$t" ] || add_need "$t"
    else check_create "$t"; fi
  fi
done <<'LIST'
__LIST__
LIST

if [ -n "$conflicts" ]; then
  echo "ERROR: type conflicts between the build and $WEB (nothing was changed):"
  printf '%s' "$conflicts" | sed 's/^/  /'
  missing=1
fi
if [ -n "$need" ]; then
  echo "ERROR: $(whoami) lacks write permission on these existing paths (nothing was changed):"
  while IFS= read -r p; do [ -n "$p" ] && stat -c '  %A %U:%G %n' "$p"; done <<< "$need"
  echo
  echo 'Minimum fix. Each command changes ONLY that one path (no -R); run them once on the server:'
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    # root keeps ownership; the deploy user gets write via group. Directories are sticky (1775) so the
    # deploy user can add files but cannot delete/rename entries owned by others (e.g. payoff.html).
    if [ -d "$p" ]; then echo "  sudo chown root:$(whoami) '$p' && sudo chmod 1775 '$p'"
    else echo "  sudo chgrp $(whoami) '$p' && sudo chmod 664 '$p'"; fi
  done <<< "$need"
  echo
  missing=1
fi

# ---- Protection: the web root must be sticky and NOT owned by the deploy user (its owner could
# delete/rename anything in it despite the sticky bit); protected files must not be deploy-user-owned ----
me=$(whoami)
if [ -d "$WEB" ] && { [ ! -k "$WEB" ] || [ "$(stat -c %U "$WEB")" = "$me" ]; }; then
  echo "ERROR: $WEB does not protect other users' files from $me (needs sticky bit and an owner other than $me):"
  stat -c '  %A %U:%G %n' "$WEB"
  echo "  Fix: sudo chown root:$me '$WEB' && sudo chmod 1775 '$WEB'"
  missing=1
fi
for f in __PROTECTED_LIST__; do
  if [ -e "$WEB/$f" ] && [ "$(stat -c %U "$WEB/$f")" = "$me" ]; then
    echo "ERROR: $WEB/$f is owned by $me, so the sticky bit cannot protect it. Fix: sudo chown root:root '$WEB/$f'"
    missing=1
  fi
done

# ---- sudo (only the two Nginx commands, with exact arguments) ----
sudo -n -l nginx -t >/dev/null 2>&1 || { echo 'ERROR: passwordless sudo not allowed for: nginx -t'; missing=1; }
sudo -n -l service nginx restart >/dev/null 2>&1 || { echo 'ERROR: passwordless sudo not allowed for: service nginx restart'; missing=1; }
if [ $missing -ne 0 ]; then
  echo
  echo 'If sudo is the problem: sudo visudo -f /etc/sudoers.d/sfc-deploy   and add this single line:'
  echo "  $(whoami) ALL=(root) NOPASSWD: $(command -v nginx) -t, $(command -v service) nginx restart"
  echo 'Verify with:  sudo -n -l nginx -t ; sudo -n -l service nginx restart'
  exit 1
fi
echo 'Preflight OK: every path the build writes is writable; protected files are untouched.'
'@

$DeployTemplate = @'
set -euo pipefail
umask 022
WEB='__WEBROOT__'
cd '__REMOTEDIR__'
echo '--- Extracting'
rm -rf ./browser
unzip -oq dist.zip
test -f browser/index.html
snap() {
  for f in __PROTECTED_LIST__; do
    if [ -e "$WEB/$f" ]; then stat -c '%n %U:%G %a %s %Y' "$WEB/$f"; else echo "$f absent"; fi
  done
}
before=$(snap)
echo "--- Copying to $WEB without sudo (adds/overwrites build files only; nothing is deleted)"
cp -r browser/. "$WEB/"
after=$(snap)
if [ "$before" != "$after" ]; then echo 'ERROR: a protected file changed during deployment:'; echo "$before"; echo "$after"; exit 1; fi
echo 'Protected files unchanged.'
echo '--- Validating Nginx config'
sudo nginx -t
echo '--- Restarting Nginx'
sudo service nginx restart
echo '--- Verifying'
systemctl is-active --quiet nginx || { echo 'ERROR: nginx is not active after restart'; exit 1; }
cd browser
count=0
while IFS= read -r -d '' f; do
  cmp -s "$f" "$WEB/$f" || { echo "ERROR: deployed file differs or is missing: $f"; exit 1; }
  count=$((count+1))
done < <(find . -type f -print0)
echo "Verified $count files match in $WEB"
cd ..
echo '--- Cleaning up temporary files'
rm -rf ./browser ./dist.zip
echo 'Remote deploy OK'
'@

# Separate from the deployment: a failure here is reported as a health-check warning only.
$HealthTemplate = @'
set -u
command -v curl >/dev/null || { echo 'curl is not installed on the server; health check skipped'; exit 4; }
code=000
for i in 1 2 3; do
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H 'Host: __HOSTNAME__' http://127.0.0.1/ || true)
  case "$code" in 2??|3??) echo "GET http://127.0.0.1/ (Host: __HOSTNAME__) -> HTTP $code"; exit 0;; esac
  sleep 2
done
echo "GET http://127.0.0.1/ (Host: __HOSTNAME__) -> HTTP $code (expected 200-399)"
exit 3
'@

$Tokens = @{
    '__WEBROOT__'        = $WebRoot
    '__REMOTEDIR__'      = $RemoteDir
    '__HOSTNAME__'       = $SiteHost
    '__PROTECTED_CASE__' = ($Protected -join '|')
    '__PROTECTED_LIST__' = ($Protected -join ' ')
}

try {
    Set-Location $ProjectDir

    if (-not $SkipBuild) {
        Step '1/9 Building (production)'
        npx ng build --configuration production
        Check 'Angular build'
    }
    if (-not (Test-Path (Join-Path $BrowserDir 'index.html'))) {
        throw "Build output not found: $BrowserDir\index.html"
    }

    # Every file/dir the build will create or overwrite under the web root ("f|path" / "d|path").
    $items = Get-ChildItem -LiteralPath $BrowserDir -Recurse -Force | ForEach-Object {
        $rel = $_.FullName.Substring($BrowserDir.Length + 1).Replace('\', '/')
        if ($_.PSIsContainer) { "d|$rel" } else { "f|$rel" }
    }
    foreach ($i in $items) {
        if ($Protected -contains $i.Substring(2)) { throw "Build output contains protected file '$($i.Substring(2))'; refusing to deploy." }
    }
    $Tokens['__LIST__'] = ($items -join "`n")

    Step '2/9 Creating dist.zip (contains a top-level "browser/" folder)'
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    & $Tar -a -cf $ZipPath -C (Join-Path $ProjectDir 'dist\SFC_frontend') browser
    Check 'Zip creation'

    Step 'Preflight: remote directory, unzip, per-path write permissions and restricted sudo'
    Invoke-Remote 'preflight' (Expand-Tokens $PreflightTemplate $Tokens)

    Step '3/9 Uploading dist.zip'
    scp @SshOpts 'dist.zip' "${Server}:${RemoteDir}/"   # relative path (cwd = project): avoids "D:" being read as a host
    Check 'Upload (scp)'

    Step '4-8/9 Extracting, deploying, validating, restarting and verifying on server'
    # Nothing in the web root is ever deleted. Temp files are removed only at the very end, after
    # every check passes; on any failure the script exits immediately and leaves them in place.
    Invoke-Remote 'deploy' (Expand-Tokens $DeployTemplate $Tokens)

    Step '9/9 Cleaning up local dist.zip'
    Remove-Item $ZipPath -Force   # local dist/ build output is kept

    Write-Host "`nDEPLOYMENT SUCCEEDED: files copied and verified, Nginx validated, restarted and active." -ForegroundColor Green

    Step "Health check (separate from deployment): http://127.0.0.1/ with Host: $SiteHost"
    $health = Invoke-Remote 'health' (Expand-Tokens $HealthTemplate $Tokens) -ReturnExitCode
    if ($health -eq 0) {
        Write-Host 'HEALTH CHECK: OK' -ForegroundColor Green
    } else {
        Write-Host "HEALTH CHECK: WARNING (exit $health) - the deployment itself succeeded, but the site did not return HTTP 200-399. Check Nginx/site config." -ForegroundColor Yellow
        exit 2
    }
}
catch {
    Write-Host "`nDEPLOYMENT FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Stopped. Zip files and extracted folders (local and remote) were left in place for diagnosis.' -ForegroundColor Yellow
    exit 1
}
