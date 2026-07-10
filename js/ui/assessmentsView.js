/**
 * assessmentsView.js – Global Assessments View
 * Chronologische Auflistung aller Leistungsfeststellungen mit Kurs-Filter und Suche
 */

import { getCourses, getCourse, deleteAssessment } from '../db.js';
import { renderAssessmentEditor, openGradingSheet } from './assessmentEditor.js';
import { showToast, navigate, confirm, showModal, closeModal } from '../app.js';

export function renderAssessmentsView(container) {
  const courses = getCourses();
  
  // Update breadcrumb
  document.getElementById('topbar-breadcrumb').innerHTML = '<strong>Leistungsfeststellungen</strong>';
  
  // Set default topbar actions (Create Assessment)
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" id="tb-new-assessment-global">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Neue Leistung
    </button>
  `;

  // Base layout
  container.innerHTML = `
    <div class="page-anim">
      <div class="page-header">
        <h1>Leistungen</h1>
        <p>Kursübergreifende Übersicht aller Schularbeiten, Tests und Übungen</p>
      </div>

      <!-- Filters -->
      <div class="card mb-3" style="padding: 16px">
        <div class="form-row">
          <div class="form-group mb-0">
            <label class="form-label" style="font-size:.78rem">Nach Kurs/Klasse filtern</label>
            <select id="flt-course">
              <option value="">-- Alle Kurse --</option>
              ${courses.map(c => `<option value="${c.id}">${escHtml(c.name)} (${escHtml(c.subject)})</option>`).join('')}
            </select>
          </div>
          <div class="form-group mb-0">
            <label class="form-label" style="font-size:.78rem">Titel suchen</label>
            <input type="text" id="flt-search" placeholder="z.B. Schularbeit...">
          </div>
        </div>
      </div>

      <!-- Table of assessments -->
      <div class="table-wrapper">
        <table class="data-table mobile-cards">
          <thead>
            <tr>
              <th style="width:110px">Datum</th>
              <th>Kurs</th>
              <th>Leistung</th>
              <th>Kategorie</th>
              <th class="col-center">Skala</th>
              <th class="col-center">Status</th>
              <th class="col-actions">Aktionen</th>
            </tr>
          </thead>
          <tbody id="assessments-tbody">
            <!-- Dynamic rows -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  const courseSelect = document.getElementById('flt-course');
  const searchInput  = document.getElementById('flt-search');

  function updateList() {
    const selectedCourseId = courseSelect.value;
    const searchVal = searchInput.value.toLowerCase().trim();
    
    // Collect all assessments
    let all = [];
    courses.forEach(c => {
      c.assessments.forEach(a => {
        all.push({ course: c, assessment: a });
      });
    });

    // Sort chronologically descending
    all.sort((a, b) => b.assessment.date.localeCompare(a.assessment.date));

    // Filter
    if (selectedCourseId) {
      all = all.filter(item => item.course.id === selectedCourseId);
    }
    if (searchVal) {
      all = all.filter(item => item.assessment.title.toLowerCase().includes(searchVal));
    }

    const tbody = document.getElementById('assessments-tbody');
    if (all.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-muted" style="text-align:center;padding:30px">
            Keine Leistungen gefunden.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = all.map(({ course, assessment }) => {
      const cat = course.categories.find(c => c.id === assessment.categoryId);
      const filled = assessment.results.filter(r => r.totalPoints !== null).length;
      const total  = assessment.results.length;
      const pct    = total > 0 ? Math.round((filled / total) * 100) : 0;

      return `
        <tr data-course-id="${course.id}" data-id="${assessment.id}">
          <td data-label="Datum" class="col-mono">${formatDateShort(assessment.date)}</td>
          <td data-label="Kurs">
            <a href="#class/${course.id}" style="font-weight:600;color:var(--text-accent)">
              ${escHtml(course.name)}
            </a>
          </td>
          <td data-label="Leistung" class="font-bold">${escHtml(assessment.title)}</td>
          <td data-label="Kategorie"><span class="chip" style="font-size:.72rem">${escHtml(cat?.name || 'Unbekannt')}</span></td>
          <td data-label="Skala" class="col-center col-mono">${assessment.maxPoints} Pkt.</td>
          <td data-label="Status" class="col-center">
            <span style="font-size:.8rem;color:var(--text-secondary)">${filled}/${total} bewertet</span>
            <div class="progress-bar mt-2" style="width:100px;height:4px;margin:4px auto 0">
              <div class="progress-bar-fill" style="width:${pct}%"></div>
            </div>
          </td>
          <td data-label="Aktionen" class="col-actions">
            <button class="btn btn-ghost btn-sm btn-grading" data-course="${course.id}" data-id="${assessment.id}">
              Bewerten
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-edit" data-course="${course.id}" data-id="${assessment.id}" title="Bearbeiten">
              ✏️
            </button>
            <button class="btn btn-danger btn-sm btn-icon btn-delete" data-course="${course.id}" data-id="${assessment.id}" data-title="${escHtml(assessment.title)}" title="Löschen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Bind item actions
    tbody.querySelectorAll('.btn-grading').forEach(btn => {
      btn.addEventListener('click', () => {
        const course = getCourse(btn.dataset.course);
        const assessment = course.assessments.find(a => a.id === btn.dataset.id);
        openGradingSheet(assessment, course, () => updateList());
      });
    });

    tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        renderAssessmentEditor(btn.dataset.id, btn.dataset.course, () => updateList());
      });
    });

    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await confirm(`Leistung "${btn.dataset.title}" wirklich löschen?`);
        if (ok) {
          deleteAssessment(btn.dataset.course, btn.dataset.id);
          showToast('Leistung gelöscht', 'info');
          updateList();
        }
      });
    });
  }

  // Bind filter events
  courseSelect.addEventListener('change', updateList);
  searchInput.addEventListener('input', updateList);

  // Global new assessment button event
  document.getElementById('tb-new-assessment-global')?.addEventListener('click', () => {
    if (courses.length === 0) {
      showToast('Bitte erstelle zuerst einen Kurs.', 'error');
      return;
    }
    if (courses.length === 1) {
      renderAssessmentEditor(null, courses[0].id, () => updateList());
    } else {
      // Prompt modal to select course
      showModal('Kurs auswählen', `
        <div class="form-group">
          <label class="form-label">Für welchen Kurs soll die Leistung erstellt werden?</label>
          <select id="sel-new-assessment-course" style="width: 100%">
            ${courses.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>
      `, [
        { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
        { label: 'Weiter', cls: 'btn-primary', onClick: () => {
          const cid = document.getElementById('sel-new-assessment-course').value;
          closeModal();
          renderAssessmentEditor(null, cid, () => updateList());
        }}
      ]);
    }
  });

  updateList();
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDateShort(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`; }
