@echo off
title CineGen Launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-cinegen.ps1"
if errorlevel 1 pause
