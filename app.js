'use strict';

// ── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = [
  '#6366f1','#f59e0b','#10b981','#ef4444',
  '#8b5cf6','#06b6d4','#f97316','#ec4899',
  '#14b8a6','#84cc16','#3b82f6','#a855f7',
];

let colorMap = {};   // symbol -> color
let colorIdx = 0;

function colorFor(symbol) {
  if (!colorMap[symbol]) {
    colorMap[symbol] = PALETTE[colorIdx % PALETTE.length];
    colorIdx++;
  }
  return colorMap[symbol];
}

// ── Storage ───────────────────────────────────────────────────────────────────
let trades = [];
let displayOrder = [];
let creditTotal = 0;
let pnlOrder    = []; // custom symbol order for P&L chart

function load() {
  try {
    trades = JSON.parse(localStorage.getItem('st_trades') || '[]');
  } catch { trades = []; }
  trades.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  colorMap = {}; colorIdx = 0;
  [...new Set(trades.map(t => t.symbol))].forEach(s => colorFor(s));

  try { displayOrder = JSON.parse(localStorage.getItem('st_order') || '[]'); } catch { displayOrder = []; }
  syncOrder();

  creditTotal = parseFloat(localStorage.getItem('st_credit') || '0');

  try { pnlOrder = JSON.parse(localStorage.getItem('st_pnl_order') || '[]'); } catch { pnlOrder = []; }
}

function save() {
  localStorage.setItem('st_trades',    JSON.stringify(trades));
  localStorage.setItem('st_order',     JSON.stringify(displayOrder));
  localStorage.setItem('st_credit',    String(creditTotal));
  localStorage.setItem('st_pnl_order', JSON.stringify(pnlOrder));
}

// Keep pnlOrder in sync with available symbols
function syncPnlOrder(allSyms) {
  pnlOrder = pnlOrder.filter(s => allSyms.includes(s));
  for (const s of allSyms) {
    if (!pnlOrder.includes(s)) pnlOrder.push(s);
  }
}

// Keep displayOrder in sync: remove deleted IDs, prepend new ones
function syncOrder() {
  const ids = new Set(trades.map(t => t.id));
  displayOrder = displayOrder.filter(id => ids.has(id));
  for (const t of [...trades].reverse()) {
    if (!displayOrder.includes(t.id)) displayOrder.unshift(t.id);
  }
}

function orderedHistory() {
  const map = Object.fromEntries(trades.map(t => [t.id, t]));
  return displayOrder.map(id => map[id]).filter(Boolean);
}

// ── Portfolio calculation (FIFO) ──────────────────────────────────────────────
function calcPortfolio() {
  const holdings  = {}; // sym -> { lots: [{price, shares}], shares, totalCost }
  const realized  = {};
  const lastPrice = {};
  let   totalFees = 0;

  for (const t of trades) {
    const s = t.symbol;
    if (!holdings[s]) { holdings[s] = { lots: [], shares: 0, totalCost: 0 }; }
    if (!realized[s]) { realized[s] = 0; }
    if (t.type !== 'DIV') lastPrice[s] = t.price;

    if (t.type === 'DIV') {
      realized[s] += t.amount;
    } else if (t.type === 'BUY') {
      holdings[s].lots.push({ price: t.price, shares: t.shares });
      holdings[s].shares    += t.shares;
      holdings[s].totalCost += t.price * t.shares;
    } else {
      // FIFO: consume oldest lots first
      const fee = t.fee || 0;
      let remaining = t.shares;
      while (remaining > 0.000001 && holdings[s].lots.length > 0) {
        const lot  = holdings[s].lots[0];
        const used = Math.min(remaining, lot.shares);
        realized[s] += (t.price - lot.price) * used;
        lot.shares  -= used;
        remaining   -= used;
        if (lot.shares < 0.000001) holdings[s].lots.shift();
      }
      realized[s] -= fee;
      totalFees   += fee;
      // Recalculate from remaining lots
      holdings[s].shares    = holdings[s].lots.reduce((s, l) => s + l.shares, 0);
      holdings[s].totalCost = holdings[s].lots.reduce((s, l) => s + l.price * l.shares, 0);
    }
  }
  return { holdings, realized, lastPrice, totalFees };
}

// ── Form state ────────────────────────────────────────────────────────────────
let currentType = 'BUY';
let editingId   = null;

function setType(type) {
  currentType = type;
  document.getElementById('btn-buy').className  = 'toggle-btn' + (type === 'BUY'  ? ' active buy'  : '');
  document.getElementById('btn-sell').className = 'toggle-btn' + (type === 'SELL' ? ' active sell' : '');
  document.getElementById('btn-div').className  = 'toggle-btn' + (type === 'DIV'  ? ' active div'  : '');
  document.getElementById('fee-group').style.display    = type === 'SELL' ? '' : 'none';
  document.getElementById('shares-group').style.display = type === 'DIV'  ? 'none' : '';
  document.getElementById('f-price-label').textContent  = type === 'DIV'  ? '金额（$）' : '价格（$）';
  document.getElementById('f-shares').required = type !== 'DIV';
  const btn = document.getElementById('submit-btn');
  btn.textContent = editingId ? '保存修改'
    : type === 'BUY' ? '确认买入'
    : type === 'SELL' ? '确认卖出'
    : '记录股息';
  btn.className = 'btn-submit ' + (type === 'BUY' ? 'buy' : type === 'SELL' ? 'sell' : 'div');
}

function startEdit(id) {
  const t = trades.find(t => t.id === id);
  if (!t) return;
  editingId = id;
  setType(t.type);
  document.getElementById('f-symbol').value = t.symbol;
  document.getElementById('f-date').value   = t.date;
  document.getElementById('f-price').value  = t.type === 'DIV' ? t.amount : t.price;
  if (t.type !== 'DIV') document.getElementById('f-shares').value = t.shares;
  if (t.type === 'SELL') document.getElementById('f-fee').value = t.fee || 0;
  document.getElementById('submit-btn').textContent = '保存修改';
  document.getElementById('cancel-edit').style.display = '';
  document.querySelector('.card h2') && (document.querySelector('#form-title').textContent = '编辑交易');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  document.getElementById('trade-form').reset();
  initDate();
  document.getElementById('cancel-edit').style.display = 'none';
  document.getElementById('fee-group').style.display   = 'none';
  document.getElementById('form-title').textContent    = '记录交易';
  setType('BUY');
}

// ── Init date ─────────────────────────────────────────────────────────────────
function initDate() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('f-date').value =
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ── Submit ────────────────────────────────────────────────────────────────────
function handleSubmit(e) {
  e.preventDefault();
  const symbol = document.getElementById('f-symbol').value.trim().toUpperCase();
  const date   = document.getElementById('f-date').value;
  const price  = parseFloat(document.getElementById('f-price').value);
  const shares = parseFloat(document.getElementById('f-shares').value);
  const fee    = currentType === 'SELL' ? (parseFloat(document.getElementById('f-fee').value) || 0) : 0;

  if (!symbol || !date || price <= 0) { toast('请填写完整信息'); return; }
  if (currentType !== 'DIV' && shares <= 0) { toast('请填写股数'); return; }

  if (currentType === 'SELL') {
    const { holdings } = calcPortfolio();
    // Exclude current editing trade from holdings check
    const held = editingId
      ? (() => {
          const orig = trades.find(t => t.id === editingId);
          const tmp  = trades.filter(t => t.id !== editingId);
          return calcPortfolioFrom(tmp)[symbol]?.shares ?? 0;
        })()
      : (holdings[symbol]?.shares ?? 0);
    if (shares > held + 0.000001) {
      toast(`⚠️ ${symbol} 当前仅持有 ${fmtShares(held)} 股，卖出数量超出`);
      return;
    }
  }

  if (editingId) {
    // Update existing trade
    const idx = trades.findIndex(t => t.id === editingId);
    if (idx !== -1) {
      trades[idx] = currentType === 'DIV'
        ? { ...trades[idx], symbol, date, type: 'DIV', amount: price }
        : { ...trades[idx], symbol, date, type: currentType, price, shares, fee };
      trades.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    }
    cancelEdit();
    toast(`已更新 ${symbol}`);
  } else {
    const trade = currentType === 'DIV'
    ? { id: Date.now(), symbol, date, type: 'DIV', amount: price }
    : { id: Date.now(), symbol, date, type: currentType, price, shares, fee };
    trades.push(trade);
    trades.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    colorFor(symbol);
    displayOrder.unshift(trade.id);
    document.getElementById('f-price').value  = '';
    document.getElementById('f-shares').value = '';
    document.getElementById('f-fee').value    = '0';
    toast(`已记录 ${currentType === 'BUY' ? '买入' : currentType === 'SELL' ? '卖出' : '股息'} ${symbol}`);
  }

  save();
  render();
}

// Helper: calc holdings from a custom trade list (FIFO)
function calcPortfolioFrom(tradeList) {
  const holdings = {};
  for (const t of tradeList) {
    const s = t.symbol;
    if (!holdings[s]) holdings[s] = { lots: [], shares: 0, totalCost: 0 };
    if (t.type === 'BUY') {
      holdings[s].lots.push({ price: t.price, shares: t.shares });
      holdings[s].shares    += t.shares;
      holdings[s].totalCost += t.price * t.shares;
    } else {
      let rem = t.shares;
      while (rem > 0.000001 && holdings[s].lots.length > 0) {
        const lot  = holdings[s].lots[0];
        const used = Math.min(rem, lot.shares);
        lot.shares -= used;
        rem        -= used;
        if (lot.shares < 0.000001) holdings[s].lots.shift();
      }
      holdings[s].shares    = holdings[s].lots.reduce((s, l) => s + l.shares, 0);
      holdings[s].totalCost = holdings[s].lots.reduce((s, l) => s + l.price * l.shares, 0);
    }
  }
  return holdings;
}

function deleteTrade(id) {
  if (!confirm('确认删除这条记录？')) return;
  trades = trades.filter(t => t.id !== id);
  displayOrder = displayOrder.filter(oid => oid !== id);
  save();
  render();
}

function clearAll() {
  if (!confirm('确认清空所有数据？此操作不可撤销。')) return;
  trades = [];
  displayOrder = [];
  pnlOrder     = [];
  creditTotal  = 0;
  colorMap = {}; colorIdx = 0;
  save();
  render();
  toast('数据已清空');
}

function initPnlDrag() {
  const container = document.getElementById('pnl-order');
  if (!container) return;
  let dragSym = null;

  container.addEventListener('dragstart', e => {
    const chip = e.target.closest('.pnl-chip');
    if (!chip) return;
    dragSym = chip.dataset.sym;
    setTimeout(() => chip.classList.add('dragging'), 0);
  });
  container.addEventListener('dragend', () => {
    container.querySelectorAll('.pnl-chip').forEach(c => c.classList.remove('dragging', 'drag-over'));
    dragSym = null;
  });
  container.addEventListener('dragover', e => {
    e.preventDefault();
    const chip = e.target.closest('.pnl-chip');
    if (!chip) return;
    container.querySelectorAll('.pnl-chip').forEach(c => c.classList.remove('drag-over'));
    if (chip.dataset.sym !== dragSym) chip.classList.add('drag-over');
  });
  container.addEventListener('drop', e => {
    e.preventDefault();
    const chip = e.target.closest('.pnl-chip');
    if (!chip || !dragSym) return;
    const targetSym = chip.dataset.sym;
    if (targetSym === dragSym) return;
    const from = pnlOrder.indexOf(dragSym);
    const to   = pnlOrder.indexOf(targetSym);
    const rect = chip.getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    pnlOrder.splice(from, 1);
    pnlOrder.splice(after ? to : to, 0, dragSym);
    save();
    renderPnL();
    dragSym = null;
  });
}

function editCredit() {
  const input = prompt('输入利息与奖金总额（$）：', creditTotal.toFixed(2));
  if (input === null) return;
  const v = parseFloat(input);
  if (isNaN(v)) { toast('请输入有效数字'); return; }
  creditTotal = v;
  save();
  renderStats();
}

// ── Formatting ────────────────────────────────────────────────────────────────
function fmt(n)    { return '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function fmtN(n)   { const v = (n ?? 0); return (v >= 0 ? '+' : '') + fmt(v); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function fmtShares(n) { return parseFloat(n.toFixed(6)).toString(); }

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  renderStats();
  renderHoldings();
  renderPnL();
  renderPie();
  renderHistory();
  initKlineSection();
}

// Stats bar
function renderStats() {
  const { holdings, realized, totalFees } = calcPortfolio();

  let totalCost = 0, totalRealized = 0;
  for (const [s, h] of Object.entries(holdings)) {
    if (h.shares > 0.00001) totalCost += h.totalCost;
    totalRealized += realized[s] ?? 0;
  }

  const setVal = (id, val, cls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    el.className = 'stat-value ' + cls;
  };

  if (trades.length === 0) {
    setVal('total-cost',     '—', 'neutral');
    setVal('total-realized', '—', 'neutral');
    setVal('total-fee',      '—', 'neutral');
  } else {
    setVal('total-cost',     fmt(totalCost),      'neutral');
    const netRealized = totalRealized + creditTotal;
  setVal('total-realized', fmtN(netRealized), netRealized >= 0 ? 'pos' : 'neg');
    setVal('total-fee',      totalFees > 0 ? '-' + fmt(totalFees) : fmt(0), totalFees > 0 ? 'neg' : 'neutral');
  }
  // Credit always shown (clickable)
  setVal('total-credit', creditTotal !== 0 ? fmtN(creditTotal) : '点击编辑', creditTotal >= 0 ? 'pos' : 'neg');
}

// Holdings table
function renderHoldings() {
  const { holdings, realized, lastPrice } = calcPortfolio();
  const wrap = document.getElementById('holdings-wrap');
  const active = Object.entries(holdings)
    .filter(([, h]) => h.shares > 0.00001)
    .sort(([, a], [, b]) => b.totalCost - a.totalCost);

  if (active.length === 0) {
    wrap.innerHTML = '<p class="empty-msg">暂无持仓</p>';
    return;
  }

  let rows = '';
  for (const [sym, h] of active) {
    const avg = h.totalCost / h.shares;
    const col = colorFor(sym);

    rows += `<tr>
      <td><span class="sym-badge">
        <span class="sym-dot" style="background:${col}"></span>${sym}
      </span></td>
      <td>${fmtShares(h.shares)}</td>
      <td>${fmt(avg)}</td>
      <td>${fmt(h.totalCost)}</td>
    </tr>`;
  }

  wrap.innerHTML = `<table class="holdings-table">
    <thead><tr>
      <th>股票</th><th>股数</th><th>均价</th><th>成本</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// Trade history
function renderHistory() {
  const wrap = document.getElementById('history-wrap');
  if (trades.length === 0) {
    wrap.innerHTML = '<p class="empty-msg">暂无记录</p>';
    return;
  }

  const items = orderedHistory().map(t => {
    const col     = colorFor(t.symbol);
    const dateStr = t.date.replace(/-/g, '/');
    let tagLabel, details, total;
    if (t.type === 'DIV') {
      tagLabel = '息';
      details  = `${dateStr} · 股息`;
      total    = fmt(t.amount);
    } else {
      const feeStr = (t.type === 'SELL' && t.fee > 0) ? ` · 手续费 ${fmt(t.fee)}` : '';
      tagLabel = t.type === 'BUY' ? '买' : '卖';
      details  = `${dateStr} · ${fmtShares(t.shares)} 股 @ ${fmt(t.price)}${feeStr}`;
      total    = fmt(t.price * t.shares);
    }
    return `<div class="history-item" draggable="true" data-id="${t.id}">
      <span class="drag-handle" title="拖拽排序">⠿</span>
      <span class="tag ${t.type.toLowerCase()}">${tagLabel}</span>
      <span class="sym" style="color:${col}">${t.symbol}</span>
      <span class="details">${details}</span>
      <span class="total">${total}</span>
      <button class="btn-edit" onclick="startEdit(${t.id})" title="编辑">✎</button>
      <button class="btn-del"  onclick="deleteTrade(${t.id})" title="删除">×</button>
    </div>`;
  }).join('');

  wrap.innerHTML = `<div class="history-list" id="history-list">${items}</div>`;
}

// ── Charts ────────────────────────────────────────────────────────────────────
let charts = {};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// 2. P&L bar chart (realized)
function renderPnL() {
  destroyChart('pnl');
  const ctx = document.getElementById('pnl-chart');

  const { realized } = calcPortfolio();
  const allSyms = Object.keys(realized);

  // Sort by realized P&L descending, then render draggable chips
  syncPnlOrder(allSyms);
  pnlOrder.sort((a, b) => (realized[b] ?? 0) - (realized[a] ?? 0));
  const chipsEl = document.getElementById('pnl-order');
  if (chipsEl) {
    chipsEl.innerHTML = pnlOrder.map(sym => {
      const col = colorFor(sym);
      return `<div class="pnl-chip" draggable="true" data-sym="${sym}"
                style="border-color:${col};color:${col}">${sym}</div>`;
    }).join('');
  }

  if (allSyms.length === 0) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels   = pnlOrder.filter(s => allSyms.includes(s));
  const realData = labels.map(s => +(realized[s] ?? 0).toFixed(2));

  const barLabels = {
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((ds, di) => {
        chart.getDatasetMeta(di).data.forEach((bar, i) => {
          const v = ds.data[i];
          if (v === 0) return;
          const label = (v >= 0 ? '+' : '-') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          ctx.save();
          ctx.font         = 'bold 11px -apple-system, sans-serif';
          ctx.fillStyle    = v >= 0 ? '#059669' : '#dc2626';
          ctx.textAlign    = 'center';
          ctx.textBaseline = v >= 0 ? 'bottom' : 'top';
          ctx.fillText(label, bar.x, v >= 0 ? bar.y - 4 : bar.y + 4);
          ctx.restore();
        });
      });
    },
  };

  charts['pnl'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '已实现盈亏',
          data: realData,
          backgroundColor: realData.map(v => v >= 0 ? '#10b98166' : '#ef444466'),
          borderColor:     realData.map(v => v >= 0 ? '#10b981'   : '#ef4444'),
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ],
    },
    plugins: [barLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => `${item.dataset.label}：${fmtN(item.raw)}`,
          },
        },
      },
      scales: {
        y: {
          ticks: { callback: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) },
          grid: { color: '#f0f2f5' },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

// 3. Pie / doughnut
function renderPie() {
  destroyChart('pie');
  const ctx = document.getElementById('pie-chart');

  const { holdings, lastPrice } = calcPortfolio();
  const active = Object.entries(holdings).filter(([, h]) => h.shares > 0.00001);

  if (active.length === 0) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels = active.map(([s]) => s);
  const data   = active.map(([s, h]) => {
    const last = lastPrice[s] ?? (h.totalCost / h.shares);
    return +(h.shares * last).toFixed(2);
  });
  const colors = labels.map(s => colorFor(s));

  const pieLabels = {
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { width, height } } = chart;
      const total = data.reduce((a, b) => a + b, 0);
      const meta  = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font      = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      meta.data.forEach((arc, i) => {
        const pct = data[i] / total * 100;
        if (pct < 5) return; // skip tiny slices
        const angle   = (arc.startAngle + arc.endAngle) / 2;
        const midR    = (arc.innerRadius + arc.outerRadius) / 2;
        const x = arc.x + Math.cos(angle) * midR;
        const y = arc.y + Math.sin(angle) * midR;
        ctx.fillStyle = '#fff';
        ctx.fillText(pct.toFixed(1) + '%', x, y);
      });
      ctx.restore();
    },
  };

  charts['pie'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 1.5,
        hoverOffset: 6,
      }],
    },
    plugins: [pieLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: item => {
              const total = item.dataset.data.reduce((a, b) => a + b, 0);
              const pct = (item.raw / total * 100).toFixed(1);
              return `${item.label}：${fmt(item.raw)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Drag & drop history ───────────────────────────────────────────────────────
let dragId = null;

function initDragAndDrop() {
  document.addEventListener('dragstart', e => {
    const item = e.target.closest('.history-item[data-id]');
    if (!item) return;
    dragId = parseInt(item.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => item.classList.add('dragging'), 0);
  });

  document.addEventListener('dragend', () => {
    document.querySelectorAll('.history-item').forEach(el => {
      el.classList.remove('dragging', 'drag-over');
    });
  });

  document.addEventListener('dragover', e => {
    const item = e.target.closest('.history-item[data-id]');
    if (!item) return;
    e.preventDefault();
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('drag-over'));
    if (parseInt(item.dataset.id) !== dragId) item.classList.add('drag-over');
  });

  document.addEventListener('drop', e => {
    const item = e.target.closest('.history-item[data-id]');
    if (!item || dragId === null) return;
    e.preventDefault();
    const targetId = parseInt(item.dataset.id);
    if (targetId === dragId) return;

    const fromIdx = displayOrder.indexOf(dragId);
    const toIdx   = displayOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    displayOrder.splice(fromIdx, 1);
    // Insert before or after based on vertical position
    const rect = item.getBoundingClientRect();
    const insertAfter = e.clientY > rect.top + rect.height / 2;
    displayOrder.splice(insertAfter ? toIdx + 1 : toIdx, 0, dragId);

    save();
    renderHistory();
    dragId = null;
  });
}

// ── 手动备份 / 恢复 ───────────────────────────────────────────────────────────
async function exportBackup() {
  const data = JSON.stringify({ trades, displayOrder, creditTotal }, null, 2);
  const fileName = 'Trading Info.json';

  // If the browser supports the File System Access API (Chrome/Edge over http/https),
  // let the user save straight into the Stock folder and overwrite the same file.
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      toast('已保存 Trading Info.json');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled
      // otherwise fall through to plain download
    }
  }

  // Fallback: normal download (goes to the browser's download folder).
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  toast('已导出 Trading Info.json');
}

function importBackup() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.trades)) { toast('⚠️ 文件格式不正确'); return; }
      trades       = data.trades;
      displayOrder = data.displayOrder ?? [];
      creditTotal  = data.creditTotal  ?? 0;
      trades.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      colorMap = {}; colorIdx = 0;
      [...new Set(trades.map(t => t.symbol))].forEach(s => colorFor(s));
      syncOrder();
      save();
      render();
      toast('数据已恢复');
    } catch { toast('⚠️ 读取文件失败'); }
  };
  input.click();
}

// ── K-line chart ──────────────────────────────────────────────────────────────
let klineSymbol = '';
let klineRange  = '3mo';
const klineCache = {};
let lwChart  = null;
let lwSeries = null;
let tdApiKey = localStorage.getItem('st_td_key') || '';

function initKlineSection() {
  const allSymbols = [...new Set(trades.map(t => t.symbol))];
  const sel = document.getElementById('kline-symbol-sel');
  if (!sel) return;

  sel.innerHTML = '<option value="">选择股票...</option>' +
    allSymbols.map(s => `<option value="${s}"${s === klineSymbol ? ' selected' : ''}>${s}</option>`).join('');

  if (klineSymbol && !allSymbols.includes(klineSymbol)) {
    klineSymbol = '';
    clearKlineChart();
  } else if (klineSymbol) {
    updateKlineMarkers();
  }
}

function onKlineSelect(sym) {
  klineSymbol = sym;
  if (!sym) { clearKlineChart(); return; }
  loadKline();
}

function setKlineRange(range) {
  klineRange = range;
  document.querySelectorAll('.kr-btn').forEach(b => b.classList.remove('kr-active'));
  document.getElementById('kr-' + range)?.classList.add('kr-active');
  if (klineSymbol) loadKline();
}

function toggleKlineSettings() {
  const panel = document.getElementById('kline-settings');
  const input = document.getElementById('td-key-input');
  if (panel.style.display === 'none') {
    panel.style.display = 'flex';
    input.value = tdApiKey;
    input.focus();
  } else {
    panel.style.display = 'none';
  }
}

function saveTdKey() {
  const val = document.getElementById('td-key-input').value.trim();
  tdApiKey = val;
  if (val) {
    localStorage.setItem('st_td_key', val);
    toast('API Key 已保存，将使用 Twelve Data 获取数据');
  } else {
    localStorage.removeItem('st_td_key');
    toast('API Key 已清除，需重新设置才能加载 K 线');
  }
  document.getElementById('kline-settings').style.display = 'none';
  Object.keys(klineCache).forEach(k => delete klineCache[k]);
  if (klineSymbol) loadKline();
}

async function loadKline() {
  const sym = klineSymbol;
  if (!sym) return;
  if (!tdApiKey) {
    clearKlineChart();
    setKlineStatus('error', '请先点击 ⚙ 设置 Twelve Data API Key（免费 800次/天）');
    return;
  }
  setKlineStatus('loading', `正在加载 ${sym} K线数据…`);
  const cacheKey = `${sym}_${klineRange}`;
  try {
    let candles = klineCache[cacheKey];
    if (!candles) {
      candles = await fetchKlineData(sym, klineRange);
      klineCache[cacheKey] = candles;
    }
    renderKlineChart(candles, sym);
    setKlineStatus('', '');
  } catch (e) {
    clearKlineChart();
    setKlineStatus('error', `⚠️ ${sym} 数据加载失败：${e.message}`);
  }
}

function setKlineStatus(type, msg) {
  const el = document.getElementById('kline-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `kline-status${type === 'error' ? ' kline-error' : type === 'loading' ? ' kline-loading' : ''}`;
  el.style.display = msg ? '' : 'none';
}

async function fetchKlineData(symbol, range) {
  return fetchTwelveData(symbol, range);
}

async function fetchTwelveData(symbol, range) {
  const outputsize = { '1mo': 23, '3mo': 66, '6mo': 130, '1y': 260 }[range] || 66;
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}`
            + `&interval=1day&outputsize=${outputsize}&apikey=${encodeURIComponent(tdApiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'error') {
    if (data.code === 429) throw new Error('Twelve Data 请求已达上限（免费版800次/天或8次/分钟），请稍后重试');
    if (data.code === 404 || /not found|symbol/i.test(data.message || '')) throw new Error('未找到该股票，请确认代码');
    throw new Error(data.message || 'Twelve Data 返回错误');
  }
  if (!Array.isArray(data.values) || data.values.length === 0) throw new Error('该时间范围内暂无数据');

  return data.values
    .map(v => ({
      time:  v.datetime,
      open:  +parseFloat(v.open).toFixed(4),
      high:  +parseFloat(v.high).toFixed(4),
      low:   +parseFloat(v.low).toFixed(4),
      close: +parseFloat(v.close).toFixed(4),
    }))
    .sort((a, b) => a.time.localeCompare(b.time)); // TD returns newest-first
}

// date -> { buy:{avg,shares,count}, sell:{avg,shares,count} } for click tooltip
let klineMarkerInfo = {};

// Build buy/sell dots positioned at the actual trade price (Y = price level),
// aggregated per day by weighted-average price. Only dates present in the
// candle data are kept so the dots align to real x-axis points.
function getKlineTradePoints(symbol, candleDates) {
  const symTrades = trades.filter(t => t.symbol === symbol && (t.type === 'BUY' || t.type === 'SELL'));
  const byDate = {};
  for (const t of symTrades) (byDate[t.date] = byDate[t.date] || []).push(t);

  klineMarkerInfo = {};
  const buyPoints = [], sellPoints = [];
  for (const [date, dayTrades] of Object.entries(byDate)) {
    if (candleDates && !candleDates.has(date)) continue;
    const buys  = dayTrades.filter(t => t.type === 'BUY');
    const sells = dayTrades.filter(t => t.type === 'SELL');
    const info = {};
    if (buys.length) {
      const sh  = buys.reduce((s, t) => s + t.shares, 0);
      const avg = buys.reduce((s, t) => s + t.price * t.shares, 0) / sh;
      info.buy = { avg, shares: sh, count: buys.length };
      buyPoints.push({ time: date, value: +avg.toFixed(4) });
    }
    if (sells.length) {
      const sh  = sells.reduce((s, t) => s + t.shares, 0);
      const avg = sells.reduce((s, t) => s + t.price * t.shares, 0) / sh;
      info.sell = { avg, shares: sh, count: sells.length };
      sellPoints.push({ time: date, value: +avg.toFixed(4) });
    }
    klineMarkerInfo[date] = info;
  }
  buyPoints.sort((a, b) => a.time.localeCompare(b.time));
  sellPoints.sort((a, b) => a.time.localeCompare(b.time));
  return { buyPoints, sellPoints };
}

function clearKlineChart() {
  if (lwChart) { lwChart.remove(); lwChart = null; lwSeries = null; }
  setKlineStatus('', '');
}

function updateKlineMarkers() {
  if (!lwChart || !klineSymbol) return;
  const candles = klineCache[`${klineSymbol}_${klineRange}`];
  if (candles) renderKlineChart(candles, klineSymbol);
}

function renderKlineChart(candles, symbol) {
  const container = document.getElementById('kline-chart');
  if (!container) return;
  if (typeof LightweightCharts === 'undefined') {
    setKlineStatus('error', '⚠️ 图表库加载失败，请刷新页面重试');
    return;
  }

  if (lwChart) { lwChart.remove(); lwChart = null; lwSeries = null; }

  lwChart = LightweightCharts.createChart(container, {
    autoSize: true,
    layout: {
      background: { type: 'solid', color: '#ffffff' },
      textColor: '#374151',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    grid: {
      vertLines: { color: '#f0f2f5' },
      horzLines: { color: '#f0f2f5' },
    },
    crosshair: { mode: 1 },
    rightPriceScale: {
      borderColor: '#e5e7eb',
      // leave headroom for the arrow markers so the candles aren't squashed
      scaleMargins: { top: 0.12, bottom: 0.12 },
    },
    timeScale: { borderColor: '#e5e7eb' },
  });

  // Robinhood-style area line using daily close prices.
  // Whole-range up = green, down = red.
  const firstClose = candles[0].close;
  const lastClose  = candles[candles.length - 1].close;
  const up = lastClose >= firstClose;
  const lineCol = up ? '#10b981' : '#ef4444';

  lwSeries = lwChart.addAreaSeries({
    lineColor:   lineCol,
    topColor:    up ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.28)',
    bottomColor: up ? 'rgba(16,185,129,0.02)' : 'rgba(239,68,68,0.02)',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerRadius: 4,
  });

  lwSeries.setData(candles.map(c => ({ time: c.time, value: c.close })));

  // Buy/sell dots at their actual trade-price height (Y = price level).
  // Invisible connecting line, visible round point markers only.
  const candleDates = new Set(candles.map(c => c.time));
  const { buyPoints, sellPoints } = getKlineTradePoints(symbol, candleDates);

  const dotSeriesOpts = {
    lineVisible: false,
    pointMarkersVisible: true,
    pointMarkersRadius: 5,
    lastValueVisible: false,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  };
  if (buyPoints.length) {
    lwChart.addLineSeries({ ...dotSeriesOpts, color: '#10b981' }).setData(buyPoints);
  }
  if (sellPoints.length) {
    lwChart.addLineSeries({ ...dotSeriesOpts, color: '#ef4444' }).setData(sellPoints);
  }

  setupKlineTooltip(container);

  lwChart.timeScale().fitContent();
}

// Click a marker/date to reveal the trade prices (kept off the chart otherwise)
function setupKlineTooltip(container) {
  let tip = document.getElementById('kline-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'kline-tooltip';
    tip.className = 'kline-tooltip';
    container.appendChild(tip);
  }
  tip.style.display = 'none';

  lwChart.subscribeClick(param => {
    if (!param.time || !param.point) { tip.style.display = 'none'; return; }
    const info = klineMarkerInfo[param.time];
    if (!info || (!info.buy && !info.sell)) { tip.style.display = 'none'; return; }

    const [, m, d] = String(param.time).split('-').map(Number);
    let html = `<div class="ktt-date">${m}/${d}</div>`;
    if (info.buy) {
      html += `<div class="ktt-row"><span class="ktt-tag buy">买</span>`
            + `均价 $${info.buy.avg.toFixed(2)} · ${fmtShares(info.buy.shares)} 股`
            + `${info.buy.count > 1 ? ` (${info.buy.count}笔)` : ''}</div>`;
    }
    if (info.sell) {
      html += `<div class="ktt-row"><span class="ktt-tag sell">卖</span>`
            + `均价 $${info.sell.avg.toFixed(2)} · ${fmtShares(info.sell.shares)} 股`
            + `${info.sell.count > 1 ? ` (${info.sell.count}笔)` : ''}</div>`;
    }
    tip.innerHTML = html;
    tip.style.display = 'block';

    // position near the click, clamped inside the chart
    const cw = container.clientWidth, tw = tip.offsetWidth;
    let left = param.point.x + 12;
    if (left + tw > cw) left = param.point.x - tw - 12;
    tip.style.left = Math.max(4, left) + 'px';
    tip.style.top  = Math.max(4, param.point.y - 10) + 'px';
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
load();
initDate();
initDragAndDrop();
initPnlDrag();
render();
