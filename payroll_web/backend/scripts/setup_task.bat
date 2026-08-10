@echo off
echo ===================================================
echo   Configuring eSSL Attendance Syncer Scheduled Task
echo ===================================================
echo.

:: Delete any corrupted task
schtasks /delete /tn "eSSL Attendance Syncer" /f >nul 2>&1

:: Create clean task running every 60 minutes
schtasks /create /tn "eSSL Attendance Syncer" /tr "python \"%~dp0essl_client_sync.py\"" /sc minute /mo 60 /f

echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Task created successfully! It will run automatically every 1 hour.
) else (
    echo [ERROR] Failed to create task. Please right-click this batch file and select 'Run as Administrator'.
)

echo.
pause
