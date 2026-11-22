@echo off
title Live AI Classroom PRO - Secure Real-Time Server
echo Stopping any previous server instance on port 8080...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$conns = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue; if ($conns) { $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"
echo Starting Live AI Classroom PRO on http://localhost:8080 ...
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Milliseconds 1200; Start-Process 'http://localhost:8080/'"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8080
pause

