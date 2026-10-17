@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Трекер: предпросмотр на телефоне
node phone-server.js
if errorlevel 1 (
  echo.
  echo Не получилось запустить. Проверь, что установлен Node.js ^(он же нужен для start.bat^).
)
pause
