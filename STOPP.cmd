@echo off
cd /d "%~dp0"
node --disable-warning=ExperimentalWarning tools/preview.ts --stop
