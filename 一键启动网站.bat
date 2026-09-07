@echo off
title SlideFlow AI PPT
cd /d "%~dp0"

echo ======================================================
echo           SlideFlow AI PPT 极简网站启动器
echo ======================================================
echo.

:: 1. 释放可能被占用的 3001 端口，确保顺利启动
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>nul
)

:: 2. 检查 Node.js 环境
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 后重试。
    pause
    exit /b
)

:: 3. 自动在浏览器中打开网址
echo [*] 正在为您打开默认浏览器: http://localhost:3001
start http://localhost:3001

echo [*] 服务已启动！(仅限本机访问: 127.0.0.1:3001)
echo.
echo ======================================================
echo   网址: http://localhost:3001
echo   提示: 保持此窗口开启即可持续使用。
echo   关闭: 直接关闭此黑框窗口即可退出服务。
echo ======================================================
echo.

node server.js
pause
