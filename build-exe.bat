@echo off
chcp 65001 >nul
echo Сборка exe, подожди пару минут...
call npm run dist
echo.
if errorlevel 1 (echo Сборка не удалась: пришли текст ошибки выше) else (echo Готово: файл Tracker-1.0.0.exe лежит в папке dist)
pause
