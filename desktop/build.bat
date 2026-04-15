@echo off
REM Worktale Desktop — Build Script
REM Sets up the MSVC environment for Rust/Tauri compilation on Windows

echo [Worktale Desktop] Setting up build environment...

REM Visual Studio 2026 MSVC toolchain
set "MSVC_DIR=C:\Program Files\Microsoft Visual Studio\2026\VC\Tools\MSVC\14.50.35717"
set "WIN_SDK=C:\Program Files (x86)\Windows Kits\10"
set "WIN_SDK_VER=10.0.26100.0"

REM Set compiler and linker paths
set "CC=%MSVC_DIR%\bin\Hostx86\x64\cl.exe"
set "CXX=%MSVC_DIR%\bin\Hostx86\x64\cl.exe"

REM Add MSVC bin to PATH (before Git's /usr/bin which has a conflicting link.exe)
set "PATH=%MSVC_DIR%\bin\Hostx86\x64;%PATH%"

REM Set include paths
set "INCLUDE=%MSVC_DIR%\include;%WIN_SDK%\Include\%WIN_SDK_VER%\ucrt;%WIN_SDK%\Include\%WIN_SDK_VER%\um;%WIN_SDK%\Include\%WIN_SDK_VER%\shared"

REM Set library paths
set "LIB=%MSVC_DIR%\lib\x64;%WIN_SDK%\Lib\%WIN_SDK_VER%\um\x64;%WIN_SDK%\Lib\%WIN_SDK_VER%\ucrt\x64"

echo [Worktale Desktop] Environment ready.
echo   CC:      %CC%
echo   INCLUDE: (set)
echo   LIB:     (set)
echo.

REM Parse command
if "%1"=="dev" (
    echo [Worktale Desktop] Starting dev server...
    npx tauri dev
) else if "%1"=="build" (
    echo [Worktale Desktop] Building release...
    npx tauri build
) else if "%1"=="check" (
    echo [Worktale Desktop] Checking Rust compilation...
    cd src-tauri
    cargo check
    cd ..
) else (
    echo Usage: build.bat [dev^|build^|check]
    echo.
    echo   dev    Start the development server with hot reload
    echo   build  Build the production release
    echo   check  Check Rust code compiles without building
)
