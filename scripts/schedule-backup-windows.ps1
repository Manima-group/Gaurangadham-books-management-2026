# Registers a daily Windows scheduled task that runs `npm run db:backup` at 2:00 AM.
# Run once in PowerShell from the project folder:   powershell -ExecutionPolicy Bypass -File scripts\schedule-backup-windows.ps1
$project = (Resolve-Path "$PSScriptRoot\..").Path
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$project`" && `"$npm`" run db:backup >> backups\backup.log 2>&1"
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun
New-Item -ItemType Directory -Force -Path "$project\backups" | Out-Null
Register-ScheduledTask -TaskName "Gaurangadham Grantha Seva - Daily Backup" -Action $action -Trigger $trigger -Settings $settings -Description "Daily database backup" -Force
Write-Host "Daily backup scheduled at 2:00 AM. Backups go to $project\backups (newest 30 kept)."
