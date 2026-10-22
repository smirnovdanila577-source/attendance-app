@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Трекер: телефон из любого места
rem Приложение на телефоне через интернет, не только по домашнему Wi-Fi:
rem сервер предпросмотра (phone-server.js) + бесплатный туннель localtunnel с постоянным адресом.
rem Адрес и пароль пишутся в tunnel-log2.txt - Claude читает их оттуда сам. Окна не закрывать, компьютер не усыплять.

start "Трекер: сервер для телефона" cmd /k node phone-server.js
timeout /t 2 >nul

set "PASS="
for /f "usebackq delims=" %%I in (`curl -s https://loca.lt/mytunnelpassword`) do set "PASS=%%I"
echo %date% %time% password: %PASS% >> "%~dp0tunnel-log2.txt"

:loop
echo.
echo   Туннель запущен. Адрес и пароль Claude пришлёт сам. НЕ закрывай это окно и окно сервера.
echo %date% %time% start >> "%~dp0tunnel-log2.txt"
call npx --yes localtunnel --port 8080 --subdomain tracker-smirnov-danila >> "%~dp0tunnel-log2.txt" 2>&1
echo   Туннель оборвался, переподключаюсь через 5 секунд...
timeout /t 5 >nul
goto loop
