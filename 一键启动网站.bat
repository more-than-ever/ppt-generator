@echo off
chcp 65001 >nul
title SlideFlow AI PPT 智能演示文稿
cd /d "%~dp0"

echo ================================================================
echo           SlideFlow AI PPT 智能演示文稿生成器 (发布版)
echo ================================================================
echo.

:: 1. 查找 Node.js 运行环境 (优先使用随包附带的内置免安装运行时)
set "NODE_EXE="
if exist "%~dp0runtime\node.exe" (
    set "NODE_EXE=%~dp0runtime\node.exe"
    echo [*] 已加载内置免安装运行环境 (runtime\node.exe)
) else (
    where node >nul 2>nul
    if not errorlevel 1 (
        set "NODE_EXE=node"
        echo [*] 已加载系统 Node.js 环境
    )
)

if "%NODE_EXE%"=="" (
    echo [错误] 未检测到 Node.js 运行环境！
    echo 请确认 runtime 文件夹中的 node.exe 是否存在，或在电脑上安装 Node.js。
    echo.
    pause
    exit /b
)

echo [*] 正在检查依赖、构建产物、端口及服务健康状态。
echo [*] 不会终止占用端口的其他进程。
echo [*] 文稿保存在项目 data 文件夹，请定期导出备份。
echo.
"%NODE_EXE%" server\launch.js
pause
