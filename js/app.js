/**
 * app.js – Haupt-Controller
 * Router, Theme-Toggle, Modal-System, Toast-System, Navigation
 */

import { getSetting, setSetting } from './db.js';
import { updateChartsTheme } from './charts.js';
import { renderDashboard }    from './ui/dashboard.js';
import { renderClassView }    from './ui/classView.js';
import { renderStudentView }  from './ui/studentView.js';
import { renderParticipationView } from './ui/participationView.js';
import { renderSettingsView } from './ui/settingsView.js';
import { renderAssessmentsView } from './ui/assessmentsView.js';
import { initGeneratorPage } from './ui/generatorView.js';
import { renderSeatingPlan } from './ui/seatingPlan.js';
import { renderKVDashboard } from './ui/kvDashboardView.js';
import { renderKVClassView } from './ui/kvClassView.js';
import { renderStudentsDashboard } from './ui/studentsDashboardView.js';

// ── State ────────────────────────────────────────────────────────
let _currentPage = null;
let _modalStack  = [];

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  const savedTheme = getSetting('theme') || 'dark';
  applyTheme(savedTheme);

  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setSetting('theme', next);
    updateChartsTheme();
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Close sidebar on nav click (mobile)
  document.querySelectorAll('.nav-item, [data-page]').forEach(el => {
    el.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });

  // Nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  // Modal close
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Hash routing
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
});

// ── Router ───────────────────────────────────────────────────────
function handleRoute() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const [page, ...params] = hash.split('/');

  const content = document.getElementById('page-content');
  content.innerHTML = '';

  setActiveNav(page);
  resetTopbarActions();

  // Restore default topbar button
  document.getElementById('btn-new-course')?.removeEventListener('click', handleRoute);

  switch (page) {
    case 'dashboard':
      renderDashboard(content);
      break;
    case 'classes':
      renderDashboard(content);
      break;
    case 'class':
      if (params[0]) {
        renderClassView(content, params[0]);
      } else {
        renderDashboard(content);
      }
      break;
    case 'student':
      if (params[0] && params[1]) {
        renderStudentView(content, params[0], params[1]);
      }
      break;
    case 'assessments':
      renderAssessmentsView(content);
      break;
    case 'participation':
      renderParticipationView(content);
      break;
    case 'settings':
      renderSettingsView(content);
      break;
    case 'generator':
      initGeneratorPage(content);
      break;
    case 'seating':
      if (params[0]) renderSeatingPlan(content, params[0]);
      break;
    case 'students_db':
      renderStudentsDashboard(content);
      break;
    case 'kv_dashboard':
      renderKVDashboard(content);
      break;
    case 'kv_class':
      if (params[0]) renderKVClassView(content, params[0]);
      break;
    default:
      renderDashboard(content);
  }
}

// ── Navigation ────────────────────────────────────────────────────
export function navigate(page, params = {}) {
  let hash = page;
  if (page === 'class'    && params.courseId)  hash = `class/${params.courseId}`;
  if (page === 'student'  && params.courseId && params.studentId) hash = `student/${params.courseId}/${params.studentId}`;
  window.location.hash = hash;
}

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    const navPage = el.dataset.page || el.id.replace('nav-', '');
    el.classList.toggle('active',
      navPage === page ||
      (page === 'class' && navPage === 'classes') ||
      (page === 'student' && navPage === 'classes')
    );
  });
}

function resetTopbarActions() {
  const actions = document.getElementById('topbar-actions');
  if (actions) {
    actions.innerHTML = `
      <button class="btn btn-ghost" id="btn-export" title="Daten exportieren" style="display:none">Export</button>
      <button class="btn btn-primary" id="btn-new-course">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Neuer Kurs
      </button>
    `;
  }
  document.getElementById('topbar-breadcrumb').innerHTML = '<span>Dashboard</span>';
}

// ── Theme ─────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.querySelector('span').textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  }
}

// ── Modal System ─────────────────────────────────────────────────
/**
 * Show a modal dialog.
 * @param {string} title
 * @param {string} bodyHTML
 * @param {Array<{label, cls, onClick}>} buttons
 * @param {string} sizeClass - optional CSS class (modal-lg, modal-xl)
 */
export function showModal(title, bodyHTML, buttons = [], sizeClass = '') {
  const overlay = document.getElementById('modal-overlay');
  const modal   = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl  = document.getElementById('modal-body');
  const footerEl= document.getElementById('modal-footer');

  titleEl.textContent = title;
  bodyEl.innerHTML    = bodyHTML;

  // Buttons
  footerEl.innerHTML = '';
  buttons.forEach(btn => {
    const el = document.createElement('button');
    el.className = `btn ${btn.cls || 'btn-ghost'}`;
    el.textContent = btn.label;
    el.addEventListener('click', btn.onClick);
    footerEl.appendChild(el);
  });

  // Size class
  modal.className = `modal ${sizeClass}`;

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  // Focus first input
  setTimeout(() => bodyEl.querySelector('input, select, textarea')?.focus(), 100);
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

// ── Confirm Dialog ────────────────────────────────────────────────
export function confirm(message) {
  return new Promise(resolve => {
    showModal('Bestätigung', `
      <div style="padding:8px 0">
        <p style="color:var(--text-secondary);line-height:1.6">${escHtml(message)}</p>
      </div>
    `, [
      { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => { closeModal(); resolve(false); } },
      { label: 'Löschen',   cls: 'btn-danger', onClick: () => { closeModal(); resolve(true); } }
    ]);
  });
}

// ── Toast System ──────────────────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span style="color:var(--grade-${type === 'success' ? 1 : type === 'error' ? 5 : 'accent'})">${icons[type] || ''}</span>${escHtml(message)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 350);
  }, 3200);
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
