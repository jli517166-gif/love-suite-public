@echo off
setlocal
rem 启动 love-state 状态桥（供 AIRI 轮询）。默认 127.0.0.1:8790。
rem 想要别的端口：start-love-state.bat --port 8791

if not defined NODE set "NODE=node"
if not exist "%NODE%" set "NODE=node"

start "love-state" /min "%NODE%" "%~dp0love-state.mjs" %*
