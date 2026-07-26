#!/bin/bash
# 双击此文件即可启动股票追踪器（本地服务器方式，数据不会丢）
# 用 http://localhost 打开，localStorage 会稳定持久化，不会被浏览器清掉。

# 切到脚本所在目录（Stock 文件夹）
cd "$(dirname "$0")" || exit 1

PORT=8756
URL="http://localhost:${PORT}/index.html"

echo "股票追踪器启动中..."
echo "地址: ${URL}"
echo "（用完直接关掉这个终端窗口即可停止服务）"

# 等服务器起来后自动打开浏览器
( sleep 1; open "${URL}" ) &

# 启动本地静态服务器（前台运行，关窗口即停止）
python3 -m http.server ${PORT}
