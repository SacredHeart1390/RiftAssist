@echo off
if not exist "%~dp0private\tools" mkdir "%~dp0private\tools"
explorer.exe "%~dp0private\tools"
