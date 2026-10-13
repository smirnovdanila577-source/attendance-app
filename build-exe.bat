@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Сборка exe, подожди пару минут...
call npm run dist
echo.
if errorlevel 1 (echo Сборка не удалась: пришли текст ошибки выше) else (echo Готово: установщик Tracker-Setup-1.0.0.exe лежит в папке dist)
pause
