@echo off
echo =======================================================
echo   Running eSSL Attendance Syncer (Manual Execution)
echo =======================================================
echo.

cd /d "%~dp0"

echo Running essl_client_sync.py...
python "%~dp0essl_client_sync.py"

echo.
echo =======================================================
echo Check "sync.log" in this folder for full log history.
echo =======================================================
echo.
pause
