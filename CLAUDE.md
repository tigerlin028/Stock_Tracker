# 股票追踪器 — Claude 项目说明

## 项目结构
```
Stock_Tracker/
├── index.html          # 页面结构
├── style.css           # 样式
├── app.js              # 所有逻辑
├── 启动股票追踪器.command  # 一键启动本地服务器（双击）
└── CLAUDE.md           # 本文件
```

纯静态网页。**推荐用本地服务器打开**：双击 `启动股票追踪器.command`（起 `python3 -m http.server 8756` 并自动打开 `http://localhost:8756/index.html`）。
- **为什么不直接双击 index.html？** `file://` 页面被 Chrome 当作不稳定的独立来源，localStorage 会被浏览器不定期清空 → 交易数据凭空消失。`http://localhost` 是稳定来源，localStorage 持久化可靠。
- 注意：`file://` 和 `http://localhost` 是两个不同来源，localStorage 各自独立；从 file:// 迁到 localhost 需重新导入一次备份。

外部依赖（均走 CDN）：
- Chart.js 4.4.0 —— 盈亏图、持仓占比图
- Lightweight Charts 4.2.0（TradingView）—— K 线图

## 数据存储
- 全部存在浏览器 localStorage，key 前缀 `st_`
  - `st_trades`：交易记录数组
  - `st_order`：历史列表显示顺序（拖拽排序）
  - `st_credit`：利息与奖金总额（数字）
  - `st_pnl_order`：各股盈亏图表的股票顺序
  - `st_td_key`：Twelve Data API Key（K 线数据源）
- 导出备份：`exportBackup()` 导出 `Trading Info.json`（支持 File System Access API 时可覆盖同一文件，否则回退普通下载），`importBackup()` 导入恢复，可跨设备（不含 API Key）
- ⚠️ localStorage 依赖浏览器来源，务必走 localhost 打开（见项目结构说明）；养成记完交易点「导出备份」的习惯，多一层保险

## 交易记录数据结构
```js
// 买入
{ id, symbol, date, type: 'BUY', price, shares, fee: 0 }

// 卖出
{ id, symbol, date, type: 'SELL', price, shares, fee }

// 股息
{ id, symbol, date, type: 'DIV', amount }
```

## 核心算法
- **持仓均价**：FIFO（先进先出）——卖出消耗最早买的批次，剩余股票均价为最近购买批次的加权均价
- **已实现盈亏**：FIFO 盈亏 - 手续费 + 股息（DIV）
- **已实现盈亏显示值**：realized + creditTotal（利息与奖金）

## 图表
1. **K 线图**（Lightweight Charts，Robinhood 风格面积折线）
   - 折线取每日**收盘价**（close），整段区间涨=绿、跌=红，右侧标最新价
   - 数据源：**Twelve Data**（免费 800次/天，自带 CORS 头可浏览器直连；需点 ⚙ 填 API Key）
   - 顶部下拉选单只股票，右上 1M/3M/6M/1Y 切换范围
   - 买卖用**圆点**画在**成交价对应的 Y 高度**（独立 line series，`lineVisible:false` 只显点）
     - 同日多笔按加权均价合成一个点，绿=买 红=卖
     - 点击圆点/那一天弹出气泡：日期 + 均价 + 股数 + 笔数（`klineMarkerInfo` + `subscribeClick`）
   - 内存缓存 `klineCache`（`{symbol}_{range}`），同股同范围不重复请求
2. **各股盈亏**（Chart.js bar）：已实现盈亏，绿正红负，柱顶标数字，股票标签可拖拽排序，自动按盈亏降序
3. **持仓占比**（Chart.js doughnut）：当前持仓按成本比例，扇形内显示百分比，与持仓表格在同一卡片

## 布局
- 左栏：表单 + 当前持仓（饼图在上，表格在下）
- 右栏：K 线图 + 盈亏图 + 交易历史
- 顶部 header：4 个统计卡片 + 导出/导入备份按钮

## 表单类型切换
- `setType(type)` 控制表单字段显隐：
  - BUY：symbol, date, price, shares
  - SELL：symbol, date, price, shares, fee
  - DIV：symbol, date, amount（price 字段复用，shares 隐藏）

## 交易历史
- 拖拽排序（`initDragAndDrop()`），顺序存 `displayOrder`
- 点 ✎ 编辑，回填表单，改完保存覆盖原记录
- 点 × 删除

## 颜色分配
`PALETTE` 数组 12 色，按股票首次出现顺序分配，存 `colorMap`

## 注意事项
- 持仓表按总成本降序排列
- 各股盈亏图按盈亏值降序自动排序（拖拽调整临时生效，刷新恢复）
- `calcPortfolioFrom(tradeList)` 是编辑时 oversell 检查用的辅助函数，也是 FIFO
- DIV 交易不参与持仓计算，不出现在 K 线图，只加进该股 realized P&L
- K 线数据源为什么用 Twelve Data：Yahoo Finance 不发 CORS 头 + IP 限流，`file://` 网页无法直连；免费公共代理（corsproxy/allorigins 等）全部超载/反爬不可靠；Stooq 加了 JS 反爬。只有带 key 且自带 `access-control-allow-origin:*` 的 API 能浏览器直连稳定，Twelve Data 免费额度最大（800/天）
