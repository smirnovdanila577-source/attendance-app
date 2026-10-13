@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Удаляю повреждённую папку node_modules...
if exist node_modules rmdir /s /q node_modules
echo Ставлю зависимости заново, это займёт пару минут...
call npm install
echo.
if errorlevel 1 (echo Установка не удалась: пришли текст ошибки выше) else (echo Готово. Теперь запусти build-exe.bat)
pause
