@echo off
cd /d "%~dp0"
node tools/preview.ts --open %*
