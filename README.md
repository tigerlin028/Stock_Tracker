# Stock Tracker

A lightweight, single-page stock trading tracker. Pure static web app — just double-click `index.html` to open it in your browser. No server, no build step, no install.

All data lives in your browser's `localStorage` and never leaves your machine (except the K-line price data fetched from Twelve Data).

## Features

- **Trade logging** — record BUY / SELL / dividend (DIV) entries with symbol, date, price, shares, and fee.
- **FIFO cost basis** — average cost reflects your most recent lots after day-trading in and out.
- **Realized P&L** — FIFO gains − fees + dividends, plus a manual "interest & bonus" credit.
- **Holdings table** — current positions sorted by total cost.
- **K-line chart** (Robinhood-style area line):
  - Daily **closing price** line; green when the range is up, red when down.
  - Powered by **Twelve Data** (free tier: 800 requests/day, browser-direct via CORS).
  - Buy/sell **dots plotted at the actual trade price level** on the Y-axis; click a dot to reveal average price, shares, and trade count.
  - Symbol selector + 1M / 3M / 6M / 1Y range toggle, with in-memory caching.
- **Per-stock realized P&L** bar chart (auto-sorted, draggable labels).
- **Position allocation** doughnut chart (share of total cost).
- **Trade history** — drag to reorder, click ✎ to edit, × to delete.
- **Backup** — export/import a JSON file to move data across devices.

## K-line data source setup

The K-line chart needs a free **Twelve Data** API key:

1. Register at <https://twelvedata.com/register> (email only, free "Basic" plan).
2. Copy your API key from the dashboard.
3. In the app, click the **⚙** button next to the K-line chart and paste the key.

The key is stored locally in `localStorage` (`st_td_key`) and is **not** included in exported backups.

> **Why a key instead of a free source like Yahoo Finance?**
> Yahoo Finance sends no CORS headers and rate-limits by IP, so a `file://` page can't fetch it directly. Free public CORS proxies are unreliable (overloaded / anti-bot), and Stooq now has a JS anti-bot challenge. Only a keyed API that sends `access-control-allow-origin: *` can be called directly from the browser reliably — Twelve Data has the most generous free tier.

## Tech stack

- Vanilla HTML / CSS / JavaScript (no framework)
- [Chart.js 4.4.0](https://www.chartjs.org/) — P&L and allocation charts
- [Lightweight Charts 4.2.0](https://tradingview.github.io/lightweight-charts/) (TradingView) — K-line chart

Both libraries load from a CDN.

## Data storage

Everything is kept in `localStorage` under the `st_` prefix:

| Key | Contents |
| --- | --- |
| `st_trades` | Array of trade records |
| `st_order` | Display order of the history list (drag-sort) |
| `st_credit` | Interest & bonus total |
| `st_pnl_order` | Stock order for the P&L chart |
| `st_td_key` | Twelve Data API key |

## Project structure

```
Stock/
├── index.html   # markup
├── style.css    # styles
├── app.js       # all logic
└── README.md
```
