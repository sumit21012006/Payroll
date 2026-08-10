@echo off
echo ===================================================
echo   Configuring eSSL Attendance Syncer Scheduled Task
echo ===================================================
echo.

set SCRIPT_DIR=C:\Users\SSD\eSSL_Sync
set SCRIPT_PATH=C:\Users\SSD\eSSL_Sync\essl_client_sync.py

:: Delete any existing or corrupted task
schtasks /delete /tn "eSSL Attendance Syncer" /f >nul 2>&1

:: Create clean task running every 60 minutes
schtasks /create /tn "eSSL Attendance Syncer" /tr "python \"%SCRIPT_PATH%\"" /sc minute /mo 60 /f

echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Task created successfully!
    echo Script Location: %SCRIPT_PATH%
    echo It will now run automatically every 1 hour.
) else (
    echo [ERROR] Failed to create task. Please right-click this setup_task.bat file and select 'Run as Administrator'.
)

echo.
pause
