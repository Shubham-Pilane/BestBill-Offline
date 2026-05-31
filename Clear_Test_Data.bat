@echo off
title BestBill POS - Database Cleanup Utility
color 0B
cls

echo ====================================================
echo             BESTBILL POS SYSTEM UTILITY
echo          -- Database Purge ^& Clean Tool --
echo ====================================================
echo.
echo WARNING: This utility will permanently delete all:
echo   - Billing History (Invoices, Sales, Payment Records)
echo   - KOT Order History (Kitchen tickets, Table histories)
echo.
echo It will safely PRESERVE:
echo   - Hotel Profiles ^& Configurations
echo   - Software License keys ^& Trial states
echo   - Table layouts ^& Floor room configurations
echo   - Menu Categories ^& Food Items
echo   - Printers ^& Users accounts
echo.
echo ====================================================
echo.

:PROMPT
set /p CONFIRM="Are you sure you want to delete all test transactional data? [Y/N]: "
if /i "%CONFIRM%"=="Y" goto PURGE
if /i "%CONFIRM%"=="N" goto CANCEL
echo Invalid input. Please enter Y or N.
goto PROMPT

:PURGE
echo.
echo Processing cleanup... Please do not close this window.
echo.

:: Check Node.js runtime availability
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Node.js runtime environment was not found on this system.
    echo Node.js is required to execute the backend database utility.
    echo Please make sure the software backend dependencies are installed.
    echo.
    echo Purge failed at %DATE% %TIME% > "%~dp0clear_error.log"
    echo Reason: Node.js runtime not found on PATH. >> "%~dp0clear_error.log"
    goto FAILURE
)

:: Run database cleanup script using absolute path resolution
node "%~dp0backend\src\db\clear-test-data.js"
if %errorlevel% neq 0 goto FAILURE

color 0A
echo ====================================================
echo             CLEANUP PROCESS COMPLETED
echo ====================================================
echo.
echo The database test data has been purged successfully!
echo The application is now in a clean, production-ready state.
echo Your client can now begin standard business operations.
echo.
goto EXIT_PROMPT

:CANCEL
echo.
echo Purge cancelled. No database records were modified.
echo.
goto EXIT_PROMPT

:FAILURE
color 0C
echo.
echo ====================================================
echo               CRITICAL CLEANUP FAILURE
echo ====================================================
echo.
echo An error occurred during the database cleanup.
echo Please inspect the log file for more information:
echo   "%~dp0clear_error.log"
echo.

:EXIT_PROMPT
echo Press any key to close this utility...
pause >nul
