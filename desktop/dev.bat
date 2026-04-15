@echo off
REM Worktale Desktop — Quick Dev Server
REM Usage: dev.bat

echo [Worktale Desktop] Setting up environment...

set "MSVC_DIR=C:\Program Files\Microsoft Visual Studio\2026\VC\Tools\MSVC\14.50.35717"
set "WIN_SDK=C:\Program Files (x86)\Windows Kits\10"
set "WIN_SDK_VER=10.0.26100.0"

set "CC=%MSVC_DIR%\bin\Hostx86\x64\cl.exe"
set "CXX=%MSVC_DIR%\bin\Hostx86\x64\cl.exe"
set "PATH=%MSVC_DIR%\bin\Hostx86\x64;%PATH%"
set "INCLUDE=%MSVC_DIR%\include;%WIN_SDK%\Include\%WIN_SDK_VER%\ucrt;%WIN_SDK%\Include\%WIN_SDK_VER%\um;%WIN_SDK%\Include\%WIN_SDK_VER%\shared"
set "LIB=%MSVC_DIR%\lib\x64;%WIN_SDK%\Lib\%WIN_SDK_VER%\um\x64;%WIN_SDK%\Lib\%WIN_SDK_VER%\ucrt\x64"

echo [Worktale Desktop] Starting dev server...
echo.
npx tauri dev
