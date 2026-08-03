@echo off
rem GamePMer 本地启动。双击即可，不依赖任何会话。
rem
rem 两个必须显式写死的参数，都是踩过的坑：
rem   --host 127.0.0.1  Vite 默认可能只绑 IPv6，本机反而连不上
rem   --strictPort      端口被占时直接报错，而不是悄悄换一个端口
rem                     （曾经换到 5173，打开看到的是另一个应用）

cd /d "%~dp0"

echo.
echo   GamePMer 工作台
echo   启动后浏览器打开： http://127.0.0.1:5180/
echo   关掉这个窗口就等于停掉服务。
echo.

start "" http://127.0.0.1:5180/
npm.cmd run dev -- --host 127.0.0.1 --port 5180 --strictPort

rem 服务异常退出时留住窗口，好让人看见报错，而不是一闪而过
if errorlevel 1 (
  echo.
  echo   启动失败。常见原因：
  echo     1. 5180 端口被别的程序占着 —— 换个端口重开，或先关掉那个程序
  echo     2. 依赖没装 —— 在这个目录下先跑一次： npm.cmd install
  echo.
  pause
)
