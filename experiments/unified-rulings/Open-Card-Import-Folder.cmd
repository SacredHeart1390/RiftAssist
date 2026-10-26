@echo off
if not exist "%~dp0source-updates\cards\inbox" mkdir "%~dp0source-updates\cards\inbox"
explorer.exe "%~dp0source-updates\cards\inbox"
