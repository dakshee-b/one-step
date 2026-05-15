$ErrorActionPreference = 'Stop'
$log = "$env:TEMP\meddrop-setup-network.log"
Remove-Item $log -ErrorAction SilentlyContinue

function L($msg) { Add-Content -Path $log -Value $msg -Encoding utf8 }

try {
    $conf = "C:\Program Files\mosquitto\mosquitto.conf"
    $content = Get-Content $conf -Raw
    if ($content -notmatch '(?m)^\s*listener\s+1883\s+0\.0\.0\.0') {
        Add-Content -Path $conf -Encoding ascii -Value "`r`n# Added by MedDrop setup-network.ps1`r`nlistener 1883 0.0.0.0`r`nallow_anonymous true`r`n"
        L "[1/4] mosquitto.conf updated."
    } else {
        L "[1/4] mosquitto.conf already configured — no change."
    }

    $ruleName = "Mosquitto MQTT 1883 (MedDrop)"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow -Profile Private | Out-Null
        L "[2/4] Firewall rule added (TCP 1883 inbound, Private profile)."
    } else {
        L "[2/4] Firewall rule already exists — no change."
    }

    Restart-Service -Name mosquitto -Force
    Start-Sleep -Seconds 1
    L "[3/4] mosquitto service restarted."

    $listeners = Get-NetTCPConnection -LocalPort 1883 -State Listen -ErrorAction SilentlyContinue
    if ($listeners) {
        $addrs = ($listeners | Select-Object -ExpandProperty LocalAddress -Unique) -join ', '
        L "[4/4] Listening on: $addrs"
    } else {
        L "[4/4] WARNING: no listener on 1883 after restart."
    }

    L "DONE"
} catch {
    L ("ERROR: " + $_.Exception.Message)
    exit 1
}
