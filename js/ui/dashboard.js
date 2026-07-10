/**
 * dashboard.js – Dashboard View
 * Übersicht aller Kurse mit Statistiken
 */

import { getCourses, deleteCourse, exportJSON, exportCSV, importJSON } from '../db.js';
import { computeCourseStats, gradeClass, GRADE_LABELS } from '../grading.js';
import { renderCourseOverviewChart } from '../charts.js';
import { showModal, closeModal, showToast, navigate, confirm } from '../app.js';
import { renderCourseModal } from './settingsView.js';

export function renderDashboard(container) {
  const courses = getCourses();
  const stats = courses.map(c => ({ course: c, stats: computeCourseStats(c) }));

  const totalStudents = courses.reduce((s, c) => s + c.students.length, 0);
  const totalAssessments = courses.reduce((s, c) => s + c.assessments.length, 0);

  container.innerHTML = `
    <div class="page-anim">
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <h1>Dashboard</h1>
            <p>Übersicht aller Kurse und Leistungsdaten</p>
          </div>
          <div class="flex gap-2">
            <label class="btn btn-ghost btn-sm" id="btn-import-label" title="JSON importieren">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import
              <input type="file" id="import-file-input" accept=".json" style="display:none">
            </label>
            <button class="btn btn-ghost btn-sm" id="btn-export-json">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export JSON
            </button>
          </div>
        </div>
      </div>

      <!-- Stats Row -->
      <div class="grid-4 mb-3">
        ${statCard('Kurse', courses.length, '#6366f1', svgBook())}
        ${statCard('Schüler', totalStudents, '#22d3a0', svgUsers())}
        ${statCard('Leistungen', totalAssessments, '#fbbf24', svgClipboard())}
        ${statCard('Schuljahr', courses[0]?.schoolYear || '–', '#fb923c', svgCal())}
      </div>

      <!-- Courses Grid -->
      <div class="section-title">
        Kurse
        <span class="label-count">${courses.length}</span>
      </div>

      ${courses.length === 0 ? emptyState() : `
        <div class="grid-auto" id="courses-grid">
          ${stats.map(({ course, stats: s }) => courseCard(course, s)).join('')}
          <button class="course-card add-card" id="btn-add-course-card" style="border-style:dashed;cursor:pointer;background:transparent;display:flex;align-items:center;justify-content:center;gap:10px;color:var(--text-muted);min-height:160px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Neuen Kurs erstellen
          </button>
        </div>
      `}

      ${courses.length === 0 ? `
        <div class="mt-4">
          <button class="btn btn-primary" id="btn-add-course-empty">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ersten Kurs erstellen
          </button>
        </div>
      ` : ''}
    </div>
  `;

  // Events
  container.querySelectorAll('.course-card-btn-open').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      navigate('class', { courseId: btn.dataset.id });
    });
  });
  container.querySelectorAll('.course-card-btn-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await confirm(`Kurs "${btn.dataset.name}" wirklich löschen? Alle Daten gehen verloren.`);
      if (ok) { deleteCourse(btn.dataset.id); renderDashboard(container); showToast('Kurs gelöscht', 'info'); }
    });
  });
  container.querySelectorAll('[data-nav-class]').forEach(el => {
    el.addEventListener('click', () => navigate('class', { courseId: el.dataset.navClass }));
  });

  const addBtn = container.querySelector('#btn-add-course-card') || container.querySelector('#btn-add-course-empty');
  if (addBtn) addBtn.addEventListener('click', () => renderCourseModal(null, () => renderDashboard(container)));

  container.querySelector('#btn-export-json')?.addEventListener('click', () => { exportJSON(); showToast('JSON exportiert', 'success'); });
  container.querySelector('#import-file-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importJSON(file);
      renderDashboard(container);
      showToast('Daten importiert', 'success');
    } catch (err) {
      showToast('Import fehlgeschlagen: ' + err.message, 'error');
    }
  });

  // Global topbar
  document.getElementById('btn-new-course')?.addEventListener('click', () => renderCourseModal(null, () => renderDashboard(container)));
}

// ── Sub-renderers ─────────────────────────────────────────────────
function statCard(label, value, color, icon) {
  return `
    <div class="stat-card">
      <div class="stat-card-icon" style="background:${color}22; color:${color}">${icon}</div>
      <div class="stat-card-label">${label}</div>
      <div class="stat-card-value">${value}</div>
    </div>
  `;
}

function courseCard(course, stats) {
  const avgDisplay = stats.avg !== null
    ? `<span class="grade-badge ${gradeClass(Math.round(stats.avg))}">${stats.avg.toFixed(1)}</span>`
    : `<span class="grade-badge empty">–</span>`;

  const profileBar = stats.distribution.map(d => {
    const flex = stats.count > 0 ? d.count / stats.count : 0;
    return flex > 0
      ? `<div class="profile-segment g${d.level}" style="flex:${flex}" title="${d.count}× Note ${d.level}"></div>`
      : '';
  }).join('');

  return `
    <div class="course-card card-hover" data-nav-class="${course.id}">
      <div class="course-card-subject">${escHtml(course.subject)} · ${escHtml(course.schoolYear)}</div>
      <div class="course-card-name">${escHtml(course.name)}</div>
      <div class="course-card-meta">
        <span>${course.students.length} Schüler</span>
        <span>${course.assessments.length} Leistungen</span>
        <span>Lg. ${course.lehrgang}</span>
      </div>
      ${stats.count > 0 ? `
        <div class="profile-bar mt-3" style="gap:3px">${profileBar}</div>
      ` : ''}
      <div class="course-card-footer">
        ${avgDisplay}
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm course-card-btn-open" data-id="${course.id}" title="Öffnen">
            Öffnen →
          </button>
          <button class="btn btn-danger btn-sm btn-icon course-card-btn-delete" data-id="${course.id}" data-name="${escHtml(course.name)}" title="Kurs löschen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function emptyState() {
  return `
    <div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      <h3>Noch keine Kurse</h3>
      <p>Erstelle deinen ersten Kurs um mit der Notenverwaltung zu beginnen.</p>
    </div>
  `;
}

// ── Icons ─────────────────────────────────────────────────────────
function svgBook() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`; }
function svgUsers() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`; }
function svgClipboard() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`; }
function svgCal() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`; }

function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
