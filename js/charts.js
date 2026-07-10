/**
 * charts.js – Chart.js Integration
 * NotenPro – Diagramme für Notenverteilung, Verlauf, Mitarbeit
 */

import { GRADE_LABELS } from './grading.js';

const GRADE_COLORS = ['#22d3a0', '#86efac', '#fbbf24', '#fb923c', '#f87171'];
const GRADE_BG     = ['rgba(34,211,160,.2)', 'rgba(134,239,172,.2)', 'rgba(251,191,36,.15)',
                      'rgba(251,146,60,.15)', 'rgba(248,113,113,.15)'];

function isDark() {
  return document.documentElement.dataset.theme === 'dark';
}
function textColor() {
  return isDark() ? '#94a3b8' : '#475569';
}
function gridColor() {
  return isDark() ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
}

const defaultFont = { family: "'Inter', sans-serif", size: 12 };

Chart.defaults.font = defaultFont;
Chart.defaults.plugins.legend.labels.boxWidth = 14;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.titleFont = { ...defaultFont, weight: '700' };

// ── Stored chart instances (for destroy on re-render) ─────────────
const _charts = {};

function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

// ── 1. Distribution Bar Chart ─────────────────────────────────────
/**
 * Render a vertical bar chart showing grade distribution (1–5).
 * @param {string} canvasId
 * @param {Array<{level, count, label}>} distribution
 */
export function renderDistributionChart(canvasId, distribution) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: distribution.map(d => d.level),
      datasets: [{
        data: distribution.map(d => d.count),
        backgroundColor: distribution.map((d, i) => GRADE_BG[i]),
        borderColor:     distribution.map((d, i) => GRADE_COLORS[i]),
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => `Note ${items[0].label}: ${GRADE_LABELS[items[0].label]}`,
            label: item => ` ${item.raw} Schüler`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor(), callback: (_, i) => distribution[i]?.level },
          grid: { color: gridColor() },
          border: { color: gridColor() }
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor(), stepSize: 1, precision: 0 },
          grid: { color: gridColor() },
          border: { color: gridColor() }
        }
      }
    }
  });
}

// ── 2. Timeline Line Chart ────────────────────────────────────────
/**
 * Render student grade timeline as a line chart.
 * @param {string} canvasId
 * @param {Array<{date, title, level}>} timeline
 */
export function renderTimelineChart(canvasId, timeline) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = timeline.map(d => formatDate(d.date));
  const data   = timeline.map(d => d.level);
  const colors = data.map(l => GRADE_COLORS[(l || 3) - 1]);

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,.1)',
        pointBackgroundColor: colors,
        pointBorderColor:     colors,
        pointRadius: 7,
        pointHoverRadius: 10,
        tension: 0.35,
        fill: true,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => timeline[items[0].dataIndex]?.title || items[0].label,
            label: item => ` Note ${item.raw}: ${GRADE_LABELS[item.raw]}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor() },
          grid:  { color: gridColor() },
          border:{ color: gridColor() }
        },
        y: {
          reverse: true,
          min: 0.5,
          max: 5.5,
          ticks: {
            color: textColor(),
            stepSize: 1,
            callback: v => v >= 1 && v <= 5 ? `${v}` : ''
          },
          grid: { color: gridColor() },
          border:{ color: gridColor() }
        }
      }
    }
  });
}

// ── 3. Donut Chart – Category Weights ────────────────────────────
/**
 * Render a donut chart showing the weight distribution of categories.
 */
export function renderCategoryDonut(canvasId, categories) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const PALETTE = ['#6366f1','#22d3a0','#fbbf24','#fb923c','#f87171','#818cf8','#86efac'];

  _charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories.map(c => c.name),
      datasets: [{
        data: categories.map(c => c.weight),
        backgroundColor: categories.map((_, i) => PALETTE[i % PALETTE.length] + '55'),
        borderColor:     categories.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: textColor(), padding: 14, boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: item => ` ${item.label}: ${item.raw}%`
          }
        }
      }
    }
  });
}

// ── 4. Participation Trend ────────────────────────────────────────
/**
 * Render a small bar chart for participation ticks over time.
 * @param {string} canvasId
 * @param {Array<{date, avg}>} weeklyData
 */
export function renderParticipationChart(canvasId, weeklyData) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weeklyData.map(d => formatDate(d.date)),
      datasets: [{
        data: weeklyData.map(d => d.avg),
        backgroundColor: weeklyData.map(d =>
          d.avg >= 0.3 ? 'rgba(34,211,160,.4)' :
          d.avg >= -0.3 ? 'rgba(148,163,184,.4)' :
          'rgba(248,113,113,.4)'
        ),
        borderColor: weeklyData.map(d =>
          d.avg >= 0.3 ? '#22d3a0' : d.avg >= -0.3 ? '#94a3b8' : '#f87171'
        ),
        borderWidth: 2,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor() }, grid: { display: false }, border: { color: gridColor() } },
        y: {
          min: -1, max: 1,
          ticks: {
            color: textColor(),
            callback: v => v === 1 ? '+' : v === 0 ? '~' : v === -1 ? '−' : ''
          },
          grid: { color: gridColor() }
        }
      }
    }
  });
}

// ── 5. Course Overview Horizontal Bar ────────────────────────────
/**
 * Render course-level grade distribution horizontal bar.
 */
export function renderCourseOverviewChart(canvasId, distribution) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: distribution.map(d => `Note ${d.level}`),
      datasets: [{
        data: distribution.map(d => d.count),
        backgroundColor: distribution.map((_, i) => GRADE_BG[i]),
        borderColor: distribution.map((_, i) => GRADE_COLORS[i]),
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: textColor(), stepSize: 1, precision: 0 },
          grid: { color: gridColor() }
        },
        y: { ticks: { color: textColor() }, grid: { display: false } }
      }
    }
  });
}

// ── Theme Update ──────────────────────────────────────────────────
export function updateChartsTheme() {
  Object.values(_charts).forEach(chart => {
    if (chart.options?.scales) {
      ['x', 'y'].forEach(axis => {
        if (chart.options.scales[axis]?.ticks) {
          chart.options.scales[axis].ticks.color = textColor();
        }
        if (chart.options.scales[axis]?.grid) {
          chart.options.scales[axis].grid.color = gridColor();
        }
      });
    }
    if (chart.options?.plugins?.legend?.labels) {
      chart.options.plugins.legend.labels.color = textColor();
    }
    chart.update('none');
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`;
}
