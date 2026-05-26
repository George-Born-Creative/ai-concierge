# Run in PowerShell AS ADMINISTRATOR (right-click → Run as administrator).
# Allows phones on your LAN to reach the Nest API on port 4000.
# Metro (8081) is often allowed already; 4000 is blocked by default on Windows.

$ruleName = 'AI Concierge Nest API 4000'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existing) {
  Write-Host "Firewall rule already exists: $ruleName"
} else {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 | Out-Null
  Write-Host "Added firewall rule: allow inbound TCP 4000"
}

Write-Host ""
Write-Host "Test on your phone browser (use your PC IP from the Expo QR):"
Write-Host "  Phone hotspot:  http://192.168.43.22:4000/health  (yours may differ)"
Write-Host "  PC hotspot:     http://192.168.137.1:4000/health"
Write-Host "  Same Wi-Fi:     http://<Expo-QR-IP>:4000/health"
