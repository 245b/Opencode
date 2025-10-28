@echo off
setlocal
set "OPENCODE_CONFIG=%~dp0opencode.json"
"%~dp0packages\opencode\dist\opencode-windows-x64\bin\opencode.exe" %*
