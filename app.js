/* ═══════════════════════════════════════════════
   體重管理 Weight Tracker - PWA Application
   Data stored in localStorage (on-device)
   Compatible with aktiWir / 123.json format
   ═══════════════════════════════════════════════ */

// ── Storage Keys ──
const STORAGE_KEY = 'weight_tracker_records';
const SETTINGS_KEY = 'weight_tracker_settings';
const RECORDS_PER_PAGE = 20;

// ── State ──
let records = [];
let settings = { name: '', gender: 0, birthday: '' };
let currentPage = 1;
let chartInstances = { mini: null, main: null, bmi: null };
let currentChartRange = '1y';

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  loadSettings();
  setDefaultDate();
  updateDashboard();
  renderHistory();
  populateYearFilter();
  updateDataStats();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});

// ══════════════════════════════════
//  DATA PERSISTENCE (localStorage)
// ══════════════════════════════════

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    records = raw ? JSON.parse(raw) : [];
    // Ensure IDs are consistent
    records.forEach((r, i) => { if (!r.id) r.id = i + 1; });
  } catch { records = []; }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = JSON.parse(raw);
  } catch { /* use defaults */ }
  // Populate settings UI
  const nameEl = document.getElementById('setting-name');
  const genderEl = document.getElementById('setting-gender');
  const bdayEl = document.getElementById('setting-birthday');
  if (nameEl) nameEl.value = settings.name || '';
  if (genderEl) genderEl.value = settings.gender || 0;
  if (bdayEl) bdayEl.value = settings.birthday || '';
}

function saveSettings() {
  settings.name = document.getElementById('setting-name').value;
  settings.gender = parseInt(document.getElementById('setting-gender').value) || 0;
  settings.birthday = document.getElementById('setting-birthday').value || '';
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  showToast('設定已儲存', 'success');
}

// ══════════════════════════════════
//  TAB NAVIGATION
// ══════════════════════════════════

function switchTab(tabName) {
  // Update content
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // Update nav
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`nav-${tabName}`).classList.add('active');

  // Refresh views when switching
  if (tabName === 'home') updateDashboard();
  if (tabName === 'history') renderHistory();
  if (tabName === 'chart') {
    setTimeout(() => renderMainChart(), 100);
    setTimeout(() => renderBmiChart(), 150);
  }
}

// ══════════════════════════════════
//  SAVE NEW RECORD
// ══════════════════════════════════

function saveRecord() {
  const height = parseFloat(document.getElementById('input-height').value);
  const weight = parseFloat(document.getElementById('input-weight').value);
  const goal = parseFloat(document.getElementById('input-goal').value) || 0;
  const dateStr = document.getElementById('input-date').value;

  if (!height || !weight) {
    showToast('請輸入身高和體重', 'error');
    return;
  }

  if (height < 50 || height > 250) {
    showToast('身高範圍：50~250 cm', 'error');
    return;
  }

  if (weight < 10 || weight > 300) {
    showToast('體重範圍：10~300 kg', 'error');
    return;
  }

  const created = dateStr ? new Date(dateStr) : new Date();
  const nextId = records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1;

  const record = {
    id: nextId,
    uid: 1,
    height_ft: 0,
    height_inch: 0,
    height: parseFloat(height.toFixed(2)),
    weight: parseFloat(weight.toFixed(2)),
    desired_weight: parseFloat(goal.toFixed(2)),
    created: formatDateToStr(created),
    last_modified: formatDateToStr(new Date()),
    description: document.getElementById('input-desc').value || '',
    fat: parseFloat(document.getElementById('input-fat').value) || 0,
    muscle: parseFloat(document.getElementById('input-muscle').value) || 0,
    water: parseFloat(document.getElementById('input-water').value) || 0,
    waist: parseFloat(document.getElementById('input-waist').value) || 0,
    belly: parseFloat(document.getElementById('input-belly').value) || 0,
    chest: parseFloat(document.getElementById('input-chest').value) || 0,
    hip: parseFloat(document.getElementById('input-hip').value) || 0,
    purchased: 0,
    health: null
  };

  records.push(record);
  records.sort((a, b) => new Date(a.created) - new Date(b.created));
  saveData();

  // Remember height & goal for convenience
  localStorage.setItem('last_height', height);
  localStorage.setItem('last_goal', goal || '');

  showToast(`已儲存！BMI: ${calcBMI(height, weight).toFixed(1)}`, 'success');

  // Clear weight input only, keep height & goal
  document.getElementById('input-weight').value = '';
  document.getElementById('input-desc').value = '';
  ['fat', 'muscle', 'water', 'waist', 'belly', 'chest', 'hip'].forEach(f => {
    document.getElementById(`input-${f}`).value = '';
  });
  setDefaultDate();

  updateDashboard();
  updateDataStats();
  populateYearFilter();
}

// ══════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════

function updateDashboard() {
  const sorted = [...records].sort((a, b) => new Date(b.created) - new Date(a.created));
  const latest = sorted[0];

  if (!latest) {
    document.getElementById('bmi-value').textContent = '--';
    document.getElementById('bmi-status').textContent = '請新增第一筆紀錄';
    document.getElementById('bmi-status').className = 'bmi-status';
    document.getElementById('stat-weight').textContent = '--';
    document.getElementById('stat-height').textContent = '--';
    document.getElementById('stat-goal').textContent = '--';
    document.getElementById('goal-card').style.display = 'none';
    renderMiniChart();
    return;
  }

  const bmi = calcBMI(latest.height, latest.weight);
  const bmiInfo = getBMIStatus(bmi);

  document.getElementById('bmi-value').textContent = bmi.toFixed(1);
  document.getElementById('bmi-value').style.color = bmiInfo.color;
  document.getElementById('bmi-status').textContent = bmiInfo.label;
  document.getElementById('bmi-status').className = `bmi-status ${bmiInfo.cls}`;

  document.getElementById('stat-weight').textContent = latest.weight.toFixed(1);
  document.getElementById('stat-height').textContent = latest.height.toFixed(0);
  document.getElementById('stat-goal').textContent = latest.desired_weight > 0 ? latest.desired_weight.toFixed(1) : '--';

  // Goal progress
  if (latest.desired_weight > 0 && records.length >= 2) {
    const first = records[0];
    const startW = first.weight;
    const goalW = latest.desired_weight;
    const currentW = latest.weight;
    const totalDiff = Math.abs(startW - goalW);
    const achieved = Math.abs(startW - currentW);
    const pct = totalDiff > 0 ? Math.min(100, Math.max(0, (achieved / totalDiff) * 100)) : 0;

    document.getElementById('goal-card').style.display = 'block';
    document.getElementById('goal-bar').style.width = `${pct.toFixed(0)}%`;
    document.getElementById('goal-start').textContent = `起始: ${startW.toFixed(1)} kg`;
    document.getElementById('goal-remain').textContent = `距離目標: ${Math.abs(currentW - goalW).toFixed(1)} kg`;
  } else {
    document.getElementById('goal-card').style.display = 'none';
  }

  // Pre-fill add form with remembered values
  const lastH = localStorage.getItem('last_height');
  const lastG = localStorage.getItem('last_goal');
  if (lastH && !document.getElementById('input-height').value) {
    document.getElementById('input-height').value = lastH;
  }
  if (lastG && !document.getElementById('input-goal').value) {
    document.getElementById('input-goal').value = lastG;
  }

  renderMiniChart();
}

// ══════════════════════════════════
//  BMI CALCULATION
// ══════════════════════════════════

function calcBMI(heightCm, weightKg) {
  const hm = heightCm / 100;
  return weightKg / (hm * hm);
}

function getBMIStatus(bmi) {
  if (bmi < 18.5) return { label: '體重過輕', cls: 'bmi-underweight', color: '#38bdf8' };
  if (bmi < 24)   return { label: '正常範圍', cls: 'bmi-normal', color: '#22c55e' };
  if (bmi < 27)   return { label: '過重', cls: 'bmi-overweight', color: '#f59e0b' };
  return { label: '肥胖', cls: 'bmi-obese', color: '#ef4444' };
}

// ══════════════════════════════════
//  HISTORY LIST
// ══════════════════════════════════

function getFilteredRecords() {
  const yearVal = document.getElementById('filter-year').value;
  const monthVal = document.getElementById('filter-month').value;
  let filtered = [...records];

  if (yearVal) {
    filtered = filtered.filter(r => new Date(r.created).getFullYear() === parseInt(yearVal));
  }
  if (monthVal) {
    filtered = filtered.filter(r => (new Date(r.created).getMonth() + 1) === parseInt(monthVal));
  }

  return filtered.sort((a, b) => new Date(b.created) - new Date(a.created));
}

function renderHistory() {
  const filtered = getFilteredRecords();
  const list = document.getElementById('record-list');
  const empty = document.getElementById('empty-history');
  const pagination = document.getElementById('pagination');

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    pagination.innerHTML = '';
    return;
  }

  empty.style.display = 'none';

  const totalPages = Math.ceil(filtered.length / RECORDS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * RECORDS_PER_PAGE;
  const pageRecords = filtered.slice(start, start + RECORDS_PER_PAGE);

  let html = '';
  pageRecords.forEach((rec, idx) => {
    const globalIdx = start + idx;
    const prevRec = globalIdx < filtered.length - 1 ? filtered[globalIdx + 1] : null;
    const bmi = calcBMI(rec.height, rec.weight);
    const dateStr = formatDisplayDate(rec.created);

    let changeHtml = '';
    if (prevRec) {
      const diff = rec.weight - prevRec.weight;
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'unchanged';
      changeHtml = `<span class="record-change ${cls}">${sign}${diff.toFixed(1)}</span>`;
    }

    html += `
      <li class="record-item" ondblclick="openEditModal(${rec.id})" title="雙擊編輯">
        <div class="record-info">
          <span class="record-date">${dateStr}</span>
          <span class="record-weight">${rec.weight.toFixed(1)} kg</span>
          <span class="record-bmi">BMI ${bmi.toFixed(1)} · ${rec.height.toFixed(0)} cm</span>
        </div>
        <div class="record-meta">
          ${changeHtml}
          <button class="record-delete" onclick="deleteRecord(${rec.id}, event)" title="刪除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </li>`;
  });

  list.innerHTML = html;

  // Pagination
  if (totalPages > 1) {
    pagination.innerHTML = `
      <button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>◀</button>
      <span class="page-info">${currentPage} / ${totalPages}</span>
      <button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>▶</button>
    `;
  } else {
    pagination.innerHTML = '';
  }
}

function filterRecords() {
  currentPage = 1;
  renderHistory();
}

function goPage(page) {
  currentPage = page;
  renderHistory();
  // Scroll to top of list
  document.getElementById('tab-history').scrollIntoView({ behavior: 'smooth' });
}

function deleteRecord(id, event) {
  event.stopPropagation();
  if (!confirm('確定要刪除這筆紀錄嗎？')) return;
  records = records.filter(r => r.id !== id);
  saveData();
  renderHistory();
  updateDashboard();
  updateDataStats();
  showToast('紀錄已刪除', 'success');
}

// ══════════════════════════════════
//  EDIT RECORD
// ══════════════════════════════════

function openEditModal(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;

  document.getElementById('edit-id').value = id;
  document.getElementById('edit-weight').value = rec.weight;
  document.getElementById('edit-height').value = rec.height;
  document.getElementById('edit-goal').value = rec.desired_weight || '';
  document.getElementById('edit-desc').value = rec.description || '';

  // Format datetime for input
  const dt = new Date(rec.created);
  document.getElementById('edit-date').value = toLocalISOString(dt);

  document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
}

function updateRecord() {
  const id = parseInt(document.getElementById('edit-id').value);
  const rec = records.find(r => r.id === id);
  if (!rec) return;

  rec.weight = parseFloat(document.getElementById('edit-weight').value) || rec.weight;
  rec.height = parseFloat(document.getElementById('edit-height').value) || rec.height;
  rec.desired_weight = parseFloat(document.getElementById('edit-goal').value) || 0;
  rec.description = document.getElementById('edit-desc').value || '';

  const dateVal = document.getElementById('edit-date').value;
  if (dateVal) {
    rec.created = formatDateToStr(new Date(dateVal));
  }
  rec.last_modified = formatDateToStr(new Date());

  records.sort((a, b) => new Date(a.created) - new Date(b.created));
  saveData();
  closeEditModal();
  renderHistory();
  updateDashboard();
  showToast('紀錄已更新', 'success');
}

// ══════════════════════════════════
//  CHARTS
// ══════════════════════════════════

function renderMiniChart() {
  const ctx = document.getElementById('mini-chart');
  if (!ctx) return;

  if (chartInstances.mini) chartInstances.mini.destroy();

  // Last 30 records
  const sorted = [...records].sort((a, b) => new Date(a.created) - new Date(b.created));
  const recent = sorted.slice(-30);

  if (recent.length < 2) {
    chartInstances.mini = new Chart(ctx, {
      type: 'line',
      data: { labels: [''], datasets: [{ data: [0] }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
    return;
  }

  const labels = recent.map(r => new Date(r.created));
  const weights = recent.map(r => r.weight);
  const goalWeight = recent[recent.length - 1].desired_weight;

  const datasets = [{
    label: '體重',
    data: weights.map((w, i) => ({ x: labels[i], y: w })),
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 2,
    fill: true,
    tension: 0.3,
    pointRadius: recent.length > 20 ? 0 : 3,
    pointHoverRadius: 5,
    pointBackgroundColor: '#6366f1'
  }];

  if (goalWeight > 0) {
    datasets.push({
      label: '目標',
      data: labels.map(l => ({ x: l, y: goalWeight })),
      borderColor: 'rgba(34, 197, 94, 0.5)',
      borderWidth: 1,
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false
    });
  }

  chartInstances.mini = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: getMiniChartOptions()
  });
}

function renderMainChart() {
  const ctx = document.getElementById('main-chart');
  if (!ctx) return;

  if (chartInstances.main) chartInstances.main.destroy();

  const sorted = [...records].sort((a, b) => new Date(a.created) - new Date(b.created));
  const filtered = filterByRange(sorted, currentChartRange);

  if (filtered.length < 2) {
    chartInstances.main = new Chart(ctx, {
      type: 'line',
      data: { labels: [''], datasets: [{ data: [0] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
    return;
  }

  const labels = filtered.map(r => new Date(r.created));
  const weights = filtered.map(r => r.weight);
  const goalWeight = filtered[filtered.length - 1].desired_weight;

  const datasets = [{
    label: '體重 (kg)',
    data: weights.map((w, i) => ({ x: labels[i], y: w })),
    borderColor: '#6366f1',
    backgroundColor: createGradient(ctx, 'rgba(99, 102, 241, 0.2)', 'rgba(99, 102, 241, 0.01)'),
    borderWidth: 2.5,
    fill: true,
    tension: 0.3,
    pointRadius: filtered.length > 60 ? 0 : 3,
    pointHoverRadius: 6,
    pointBackgroundColor: '#6366f1',
    pointBorderColor: '#fff',
    pointBorderWidth: 1
  }];

  if (goalWeight > 0) {
    datasets.push({
      label: '目標體重',
      data: labels.map(l => ({ x: l, y: goalWeight })),
      borderColor: 'rgba(34, 197, 94, 0.6)',
      borderWidth: 1.5,
      borderDash: [8, 4],
      pointRadius: 0,
      fill: false
    });
  }

  chartInstances.main = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: getMainChartOptions('體重 (kg)')
  });
}

function renderBmiChart() {
  const ctx = document.getElementById('bmi-chart');
  if (!ctx) return;

  if (chartInstances.bmi) chartInstances.bmi.destroy();

  const sorted = [...records].sort((a, b) => new Date(a.created) - new Date(b.created));
  const filtered = filterByRange(sorted, currentChartRange);

  if (filtered.length < 2) {
    chartInstances.bmi = new Chart(ctx, {
      type: 'line',
      data: { labels: [''], datasets: [{ data: [0] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
    return;
  }

  const labels = filtered.map(r => new Date(r.created));
  const bmis = filtered.map(r => calcBMI(r.height, r.weight));

  // BMI zone backgrounds
  const datasets = [
    {
      label: 'BMI',
      data: bmis.map((b, i) => ({ x: labels[i], y: parseFloat(b.toFixed(1)) })),
      borderColor: '#06b6d4',
      backgroundColor: createGradient(ctx, 'rgba(6, 182, 212, 0.15)', 'rgba(6, 182, 212, 0.01)'),
      borderWidth: 2.5,
      fill: true,
      tension: 0.3,
      pointRadius: filtered.length > 60 ? 0 : 3,
      pointHoverRadius: 6,
      pointBackgroundColor: '#06b6d4'
    }
  ];

  chartInstances.bmi = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      ...getMainChartOptions('BMI'),
      plugins: {
        ...getMainChartOptions('BMI').plugins,
        annotation: undefined
      },
      scales: {
        ...getMainChartOptions('BMI').scales,
        y: {
          ...getMainChartOptions('BMI').scales.y,
          suggestedMin: 15,
          suggestedMax: 35
        }
      }
    }
  });
}

function setChartRange(range) {
  currentChartRange = range;
  document.querySelectorAll('.chart-range-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderMainChart();
  renderBmiChart();
}

function filterByRange(data, range) {
  if (range === 'all' || data.length === 0) return data;
  const now = new Date();
  let cutoff;
  if (range === '1w') {
    cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };
    const m = months[range] || 12;
    cutoff = new Date(now.getFullYear(), now.getMonth() - m, now.getDate());
  }
  return data.filter(r => new Date(r.created) >= cutoff);
}

function createGradient(ctx, colorTop, colorBottom) {
  const canvas = ctx.getContext ? ctx : ctx.canvas;
  const context = canvas.getContext ? canvas.getContext('2d') : canvas;
  try {
    const gradient = (context.getContext ? context.getContext('2d') : context).createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, colorTop);
    gradient.addColorStop(1, colorBottom);
    return gradient;
  } catch {
    return colorTop;
  }
}

function getMiniChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            return new Date(items[0].parsed.x).toLocaleDateString('zh-TW');
          },
          label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(1)}`
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day', displayFormats: { day: 'MM/dd' } },
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
        border: { display: false }
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.06)' },
        ticks: { color: '#64748b', font: { size: 10 }, padding: 8 },
        border: { display: false }
      }
    }
  };
}

function getMainChartOptions(ylabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: { color: '#94a3b8', font: { size: 11, family: 'Inter' }, boxWidth: 12, padding: 16 }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            return new Date(items[0].parsed.x).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'month', displayFormats: { month: 'yyyy/MM', day: 'MM/dd' } },
        grid: { color: 'rgba(148, 163, 184, 0.05)' },
        ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 8 },
        border: { display: false }
      },
      y: {
        title: { display: true, text: ylabel, color: '#64748b', font: { size: 11 } },
        grid: { color: 'rgba(148, 163, 184, 0.06)' },
        ticks: { color: '#64748b', font: { size: 10 }, padding: 8 },
        border: { display: false }
      }
    }
  };
}

// ══════════════════════════════════
//  IMPORT / EXPORT
// ══════════════════════════════════

function exportJSON() {
  if (records.length === 0) {
    showToast('沒有資料可匯出', 'error');
    return;
  }

  // Build compatible format with 123.json schema
  const exportData = {
    source_file: `weight-tracker-${formatFileDate(new Date())}.json`,
    database_type: 'WeightTrackerPWA',
    table_count: 1,
    tables: {
      tbl_bmi_values: {
        row_count: records.length,
        schema: [
          { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, default: null, primary_key: 1 },
          { cid: 1, name: 'uid', type: 'INTEGER', notnull: 0, default: null, primary_key: 0 },
          { cid: 2, name: 'height_ft', type: 'INTEGER', notnull: 0, default: null, primary_key: 0 },
          { cid: 3, name: 'height_inch', type: 'INTEGER', notnull: 0, default: null, primary_key: 0 },
          { cid: 4, name: 'height', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 5, name: 'weight', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 6, name: 'desired_weight', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 7, name: 'created', type: 'DATETIME', notnull: 0, default: null, primary_key: 0 },
          { cid: 8, name: 'last_modified', type: 'DATETIME', notnull: 0, default: null, primary_key: 0 },
          { cid: 9, name: 'description', type: 'TEXT', notnull: 0, default: null, primary_key: 0 },
          { cid: 10, name: 'fat', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 11, name: 'muscle', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 12, name: 'water', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 13, name: 'waist', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 14, name: 'belly', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 15, name: 'chest', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 16, name: 'hip', type: 'DECIMAL(18,2)', notnull: 0, default: null, primary_key: 0 },
          { cid: 17, name: 'purchased', type: 'INTEGER', notnull: 0, default: null, primary_key: 0 },
          { cid: 18, name: 'health', type: 'INTEGER', notnull: 0, default: null, primary_key: 0 }
        ],
        records: records
      }
    }
  };

  downloadFile(
    JSON.stringify(exportData, null, 2),
    `weight-tracker-${formatFileDate(new Date())}.json`,
    'application/json'
  );

  showToast(`已匯出 ${records.length} 筆紀錄`, 'success');
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      let imported = [];

      // Support 123.json / aktiWir format
      if (data.tables && data.tables.tbl_bmi_values && data.tables.tbl_bmi_values.records) {
        imported = data.tables.tbl_bmi_values.records;
      }
      // Support flat array
      else if (Array.isArray(data)) {
        imported = data;
      }
      // Support simple {records: [...]} format
      else if (data.records && Array.isArray(data.records)) {
        imported = data.records;
      }
      else {
        showToast('無法辨識的檔案格式', 'error');
        return;
      }

      if (imported.length === 0) {
        showToast('檔案中沒有紀錄', 'error');
        return;
      }

      // Validate and merge
      const existingDates = new Set(records.map(r => r.created));
      let added = 0;
      let nextId = records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1;

      imported.forEach(rec => {
        // Skip duplicates by created date
        if (existingDates.has(rec.created)) return;

        records.push({
          id: nextId++,
          uid: rec.uid || 1,
          height_ft: rec.height_ft || 0,
          height_inch: rec.height_inch || 0,
          height: parseFloat(rec.height) || 0,
          weight: parseFloat(rec.weight) || 0,
          desired_weight: parseFloat(rec.desired_weight) || 0,
          created: rec.created || '',
          last_modified: rec.last_modified || rec.created || '',
          description: rec.description || '',
          fat: parseFloat(rec.fat) || 0,
          muscle: parseFloat(rec.muscle) || 0,
          water: parseFloat(rec.water) || 0,
          waist: parseFloat(rec.waist) || 0,
          belly: parseFloat(rec.belly) || 0,
          chest: parseFloat(rec.chest) || 0,
          hip: parseFloat(rec.hip) || 0,
          purchased: rec.purchased || 0,
          health: rec.health || null
        });
        added++;
      });

      records.sort((a, b) => new Date(a.created) - new Date(b.created));
      saveData();
      updateDashboard();
      renderHistory();
      populateYearFilter();
      updateDataStats();

      showToast(`成功匯入 ${added} 筆紀錄 (共 ${imported.length} 筆，${imported.length - added} 筆重複)`, 'success');

      // Also try to import user profile
      if (data.tables && data.tables.tbl_main_values && data.tables.tbl_main_values.records) {
        const profile = data.tables.tbl_main_values.records[0];
        if (profile) {
          settings.gender = profile.gender || 0;
          if (profile.birthday) settings.birthday = profile.birthday.split(' ')[0];
          if (profile.name) settings.name = profile.name;
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          loadSettings();
        }
      }
    } catch (err) {
      showToast('匯入失敗：檔案格式錯誤', 'error');
      console.error('Import error:', err);
    }
  };
  reader.readAsText(file);
  // Reset file input so same file can be re-selected
  event.target.value = '';
}

function exportCSV() {
  if (records.length === 0) {
    showToast('沒有資料可匯出', 'error');
    return;
  }

  const headers = ['日期', '身高(cm)', '體重(kg)', 'BMI', '目標體重(kg)', '體脂率(%)', '肌肉量(%)', '含水量(%)', '腰圍(cm)', '腹圍(cm)', '胸圍(cm)', '臀圍(cm)', '備註'];
  const sorted = [...records].sort((a, b) => new Date(a.created) - new Date(b.created));

  const rows = sorted.map(r => [
    r.created,
    r.height,
    r.weight,
    calcBMI(r.height, r.weight).toFixed(1),
    r.desired_weight || '',
    r.fat || '',
    r.muscle || '',
    r.water || '',
    r.waist || '',
    r.belly || '',
    r.chest || '',
    r.hip || '',
    `"${(r.description || '').replace(/"/g, '""')}"`
  ]);

  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
  downloadFile(csv, `weight-tracker-${formatFileDate(new Date())}.csv`, 'text/csv');
  showToast(`已匯出 ${records.length} 筆紀錄為 CSV`, 'success');
}

// ══════════════════════════════════
//  DATA MANAGEMENT
// ══════════════════════════════════

function confirmClearData() {
  document.getElementById('clear-modal').classList.add('active');
}

function closeClearModal() {
  document.getElementById('clear-modal').classList.remove('active');
}

function clearAllData() {
  records = [];
  saveData();
  closeClearModal();
  updateDashboard();
  renderHistory();
  updateDataStats();
  populateYearFilter();
  showToast('所有資料已清除', 'success');
}

function updateDataStats() {
  document.getElementById('total-records').textContent = records.length;

  if (records.length > 0) {
    const dates = new Set(records.map(r => r.created.split(' ')[0]));
    document.getElementById('record-days').textContent = dates.size;

    const weights = records.map(r => r.weight);
    document.getElementById('min-weight').textContent = Math.min(...weights).toFixed(1);
    document.getElementById('max-weight').textContent = Math.max(...weights).toFixed(1);
  } else {
    document.getElementById('record-days').textContent = '0';
    document.getElementById('min-weight').textContent = '--';
    document.getElementById('max-weight').textContent = '--';
  }
}

function populateYearFilter() {
  const select = document.getElementById('filter-year');
  const years = new Set(records.map(r => new Date(r.created).getFullYear()));
  const sortedYears = [...years].sort((a, b) => b - a);

  const currentVal = select.value;
  select.innerHTML = '<option value="">全部年份</option>';
  sortedYears.forEach(y => {
    select.innerHTML += `<option value="${y}">${y} 年</option>`;
  });
  select.value = currentVal;
}

// ══════════════════════════════════
//  UTILITIES
// ══════════════════════════════════

function setDefaultDate() {
  const now = new Date();
  document.getElementById('input-date').value = toLocalISOString(now);
}

function toLocalISOString(date) {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateToStr(date) {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
    + ' ' + d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

function formatFileDate(date) {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

async function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });

  // Use Web Share API on mobile for better UX (share to LINE, iCloud, Google Drive, etc.)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: '體重管理資料',
        text: `體重紀錄備份 - ${filename}`,
        files: [file]
      });
      return; // Share succeeded
    } catch (err) {
      if (err.name === 'AbortError') return; // User cancelled share
      // Fall through to traditional download
    }
  }

  // Fallback: traditional download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
