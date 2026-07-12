/**
 * classView.js – Klassen-Ansicht
 * Schüler-Tabelle, Schnelleingabe, Notenübersicht pro Kategorie
 */

import { getCourse, createStudent, removeStudentFromCourse, getAssessments, exportCSV, getFinalGrade, getGlobalStudents, assignStudentToCourse } from '../db.js';
import { computeStudentProfile, computeParticipationLevel, getResultLevel, gradeClass, GRADE_LABELS, formatPct } from '../grading.js';
import { showToast, navigate, confirm, showModal, closeModal } from '../app.js';
import { renderStudentModal } from './studentView.js';
import { renderAssessmentEditor, openGradingSheet } from './assessmentEditor.js';
import { renderCourseModal } from './settingsView.js';

export function renderClassView(container, courseId) {
  const course = getCourse(courseId);
  if (!course) { container.innerHTML = '<div class="empty-state"><h3>Kurs nicht gefunden</h3></div>'; return; }

  // Update breadcrumb
  document.getElementById('topbar-breadcrumb').innerHTML =
    `<a href="#dashboard" class="text-secondary">Dashboard</a>
     <span class="sep">›</span>
     <strong>${escHtml(course.name)}</strong>`;

  // Update topbar actions
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-ghost btn-sm" id="tb-seating-plan">
      🪑 Sitzplan
    </button>
    <button class="btn btn-ghost btn-sm" id="tb-print-checklist">
      📋 Checkliste
    </button>
    <button class="btn btn-ghost btn-sm" id="tb-edit-course">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
      Kurs bearbeiten
    </button>
    <button class="btn btn-ghost btn-sm" id="tb-export-csv">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      CSV Export
    </button>
    <button class="btn btn-ghost btn-sm" id="tb-import-csv">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      CSV Import
    </button>
    <button class="btn btn-ghost btn-sm" id="tb-add-student">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      Schüler
    </button>
    <button class="btn btn-primary btn-sm" id="tb-new-assessment">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Leistung
    </button>
  `;

  renderClassContent(container, course);

  // Events
  document.getElementById('tb-seating-plan')?.addEventListener('click', () => {
    window.location.hash = 'seating/' + courseId;
  });
  document.getElementById('tb-print-checklist')?.addEventListener('click', () => {
    printChecklist(course);
  });
  document.getElementById('tb-edit-course')?.addEventListener('click', () => {
    renderCourseModal(courseId, () => renderClassView(container, courseId));
  });
  document.getElementById('tb-export-csv')?.addEventListener('click', () => {
    exportCSV(courseId); showToast('CSV exportiert', 'success');
  });
  document.getElementById('tb-import-csv')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv, text/csv';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = event => {
        const lines = event.target.result.split('\n');
        let added = 0;
        lines.forEach(line => {
          const parts = line.split(/[;,]/).map(p => p.trim());
          if (parts.length >= 2 && parts[0] && parts[1]) {
            let p1 = parts[0].replace(/"/g, '');
            let p2 = parts[1].replace(/"/g, '');
            if (p1.toLowerCase() !== 'nachname' && p1.toLowerCase() !== 'vorname') {
              createStudent(courseId, { lastName: p1, firstName: p2 });
              added++;
            }
          }
        });
        showToast(`${added} Schüler aus CSV importiert`, 'success');
        renderClassView(container.closest('.page-content') || container, courseId);
      };
      reader.readAsText(file);
    };
    input.click();
  });
  document.getElementById('tb-add-student')?.addEventListener('click', () => showAddStudentModal(courseId, () => renderClassView(container, courseId)));
  document.getElementById('tb-new-assessment')?.addEventListener('click', () => renderAssessmentEditor(null, courseId, () => renderClassView(container, courseId)));
  document.getElementById('btn-new-course')?.addEventListener('click', () => renderAssessmentEditor(null, courseId, () => renderClassView(container, courseId)));
}

function renderClassContent(container, course) {
  const assessments = course.assessments.sort((a, b) => a.date.localeCompare(b.date));
  const students    = [...course.students].sort((a, b) => a.lastName.localeCompare(b.lastName));

  container.innerHTML = `
    <div class="page-anim">
      <!-- Header -->
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="chip chip-accent">${escHtml(course.subject)}</span>
              <span class="chip">Lehrgang ${course.lehrgang}</span>
              <span class="chip">${escHtml(course.schoolYear)}</span>
            </div>
            <h1>${escHtml(course.name)}</h1>
            <p>${students.length} Schüler · ${assessments.length} Leistungsfeststellungen</p>
          </div>
        </div>
      </div>

      <!-- Category weights -->
      <div class="card mb-3">
        <div class="section-title">Kategorien & Gewichtung</div>
        <div class="grid-3">
          ${course.categories.map(cat => `
            <div class="weight-row">
              <div class="weight-label">${escHtml(cat.name)}${cat.type === 'participation' ? ' <span class="chip" style="font-size:.7rem;padding:2px 6px">Mitarbeit</span>' : ''}</div>
              <div class="weight-bar progress-bar">
                <div class="progress-bar-fill" style="width:${cat.weight}%"></div>
              </div>
              <div class="weight-pct">${cat.weight}%</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Students table -->
      ${students.length === 0 ? `
        <div class="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <h3>Noch keine Schüler</h3>
          <p>Füge Schüler zu diesem Kurs hinzu.</p>
          <button class="btn btn-primary btn-sm" id="btn-add-first-student">Schüler hinzufügen</button>
        </div>
      ` : `
        <div class="section-title">
          Schüler-Übersicht
          <span class="label-count">${students.length}</span>
        </div>
        <div class="table-wrapper">
          <table class="data-table mobile-cards">
            <thead>
              <tr>
                <th style="width:200px">Name</th>
                ${course.categories.map(cat =>
                  `<th class="col-center" title="${escHtml(cat.name)}">${escHtml(cat.name).slice(0,10)}${cat.name.length > 10 ? '…' : ''}<br><small style="font-weight:400;opacity:.6">${cat.weight}%</small></th>`
                ).join('')}
                <th class="col-center">Ø Profil</th>
                <th class="col-center">LBVO-Empf.</th>
                <th class="col-center" style="width:90px">Endnote</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              ${students.map(s => studentRow(s, course, assessments)).join('')}
            </tbody>
          </table>
        </div>
      `}

      <!-- Assessments list -->
      ${assessments.length > 0 ? `
        <div class="section-title mt-4">
          Leistungsfeststellungen
          <span class="label-count">${assessments.length}</span>
        </div>
        <div class="grid-auto">
          ${assessments.map(a => assessmentCard(a, course)).join('')}
          <button class="card card-hover" id="btn-add-assessment-card" style="border-style:dashed;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--text-muted);min-height:90px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Neue Leistung
          </button>
        </div>
      ` : ''}
    </div>
  `;

  // Student row events
  container.querySelectorAll('.btn-open-student').forEach(btn => {
    btn.addEventListener('click', () => navigate('student', { courseId: course.id, studentId: btn.dataset.id }));
  });
  container.querySelectorAll('.btn-edit-student').forEach(btn => {
    btn.addEventListener('click', () => {
      const student = course.students.find(s => s.id === btn.dataset.id);
      showEditStudentModal(course.id, student, () => renderClassView(container.closest('.page-content') || container, course.id));
    });
  });
  container.querySelectorAll('.btn-delete-student').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirm(`Schüler "${btn.dataset.name}" wirklich aus dem Kurs entfernen?`);
      if (ok) { removeStudentFromCourse(course.id, btn.dataset.id); renderClassView(container.closest('.page-content') || container, course.id); showToast('Schüler entfernt', 'info'); }
    });
  });

  // Assessment events
  container.querySelectorAll('.btn-print-assessment').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const assessment = getAssessments(course.id).find(a => a.id === btn.dataset.id);
      if (assessment) {
        printAssessmentChecklist(assessment, course);
      }
    });
  });
  container.querySelectorAll('.btn-grade-assessment').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const assessment = getAssessments(course.id).find(a => a.id === btn.dataset.id);
      openGradingSheet(assessment, course, () => renderClassContent(container, getCourse(course.id)));
    });
  });
  container.querySelectorAll('.btn-open-assessment').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderAssessmentEditor(btn.dataset.id, course.id, () => renderClassContent(container, getCourse(course.id)));
    });
  });
  container.querySelectorAll('.btn-delete-assessment').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const { deleteAssessment } = await import('../db.js');
      const ok = await confirm(`Leistung "${btn.dataset.name}" löschen?`);
      if (ok) { deleteAssessment(course.id, btn.dataset.id); renderClassContent(container, getCourse(course.id)); showToast('Leistung gelöscht', 'info'); }
    });
  });

  container.querySelector('#btn-add-first-student')?.addEventListener('click', () =>
    showAddStudentModal(course.id, () => renderClassContent(container, getCourse(course.id))));
  container.querySelector('#btn-add-assessment-card')?.addEventListener('click', () =>
    renderAssessmentEditor(null, course.id, () => renderClassContent(container, getCourse(course.id))));
}

function studentRow(student, course, assessments) {
  const profile = computeStudentProfile(course, student.id);
  const { recommendation } = profile;

  const categoryCells = course.categories.map(cat => {
    if (cat.type === 'participation') {
      const pr = computeParticipationLevel(course.participationRecords, student.id, course.participationCutScores);
      return `<td data-label="${escHtml(cat.name)}" class="col-center">
        ${pr.level ? `<span class="grade-badge ${gradeClass(pr.level)}" title="${pr.label}">${pr.level}</span>` : '<span class="grade-badge empty">–</span>'}
      </td>`;
    }
    const catAssessments = assessments.filter(a => a.categoryId === cat.id);
    if (catAssessments.length === 0) return `<td data-label="${escHtml(cat.name)}" class="col-center"><span class="grade-badge empty">–</span></td>`;

    const levels = catAssessments.map(a => {
      const res = a.results.find(r => r.studentId === student.id);
      return getResultLevel(res, a, course).level;
    }).filter(Boolean);

    if (levels.length === 0) return `<td data-label="${escHtml(cat.name)}" class="col-center"><span class="grade-badge empty">–</span></td>`;
    const avg = Math.round(levels.reduce((s,l) => s+l,0) / levels.length);
    return `<td data-label="${escHtml(cat.name)}" class="col-center"><span class="grade-badge ${gradeClass(avg)}">${avg}</span></td>`;
  });

  // Mini profile bar
  const total = profile.allLevels.length;
  const bar = total > 0
    ? `<div class="profile-bar" style="height:8px;width:80px;gap:2px">
        ${[1,2,3,4,5].map(l => {
          const cnt = profile.distribution.find(d => d.level === l)?.count || 0;
          return cnt > 0 ? `<div class="profile-segment g${l}" style="flex:${cnt}"></div>` : '';
        }).join('')}
       </div>`
    : '–';

  // Badges & indicators
  const adultStatus = isAdult(student.birthDate);
  const ageBadge = adultStatus === false 
    ? `<span class="chip" style="font-size:0.65rem;background:rgba(251,146,60,0.12);color:#f97316;border-color:rgba(251,146,60,0.22);padding:1px 4px;font-weight:600;border-radius:4px" title="Unter 18 (Minderjährig)">U18</span>` 
    : '';

  const ibaBadge = student.ibaStatus && student.ibaStatus !== 'none'
    ? `<span class="chip" style="font-size:0.65rem;background:rgba(99,102,241,0.12);color:#818cf8;border-color:rgba(99,102,241,0.22);padding:1px 4px;font-weight:600;border-radius:4px" title="IBA-Kommentar: ${escHtml(student.ibaComment || 'Kein Kommentar')}">IBA ${escHtml(student.ibaStatus)}</span>`
    : '';

  const hasInfo = student.info1 || student.info2 || student.info3;
  const infoBadge = hasInfo
    ? `<span class="text-muted" style="cursor:help;font-size:0.75rem" title="${[student.info1, student.info2, student.info3].filter(Boolean).map(escHtml).join(' · ')}">ℹ️ info</span>`
    : '';

  const finalGradeObj = getFinalGrade(course.id, student.id) || {};
  const finalGrade = finalGradeObj.finalGrade;

  const finalGradeCell = finalGrade
    ? `<td data-label="Endnote" class="col-center">
        <span class="grade-badge ${gradeClass(finalGrade)}" style="font-weight:700;border:1.5px solid var(--accent)">${finalGrade}</span>
       </td>`
    : `<td data-label="Endnote" class="col-center text-muted" style="font-size:0.85rem">
        <span class="grade-badge empty">–</span>
       </td>`;

  return `
    <tr>
      <td data-label="Name" class="col-name">
        <div class="flex items-center gap-2">
          <div class="student-avatar" style="width:30px;height:30px;font-size:.75rem;flex-shrink:0">
            ${student.firstName[0]}${student.lastName[0]}
          </div>
          <div class="flex flex-col">
            <span style="font-weight:600;line-height:1.2">${escHtml(student.lastName)}, ${escHtml(student.firstName)}</span>
            <div class="flex items-center gap-1 mt-1" style="flex-wrap:wrap">
              ${ageBadge}
              ${ibaBadge}
              ${infoBadge}
            </div>
          </div>
        </div>
      </td>
      ${categoryCells.join('')}
      <td data-label="Ø Profil" class="col-center">${bar}</td>
      <td data-label="LBVO-Empf." class="col-center">
        ${recommendation
          ? `<span class="grade-badge ${gradeClass(recommendation)}" style="opacity:0.75">${recommendation}</span>`
          : '<span class="grade-badge empty">–</span>'}
      </td>
      ${finalGradeCell}
      <td data-label="Aktionen" class="col-actions">
        <button class="btn btn-ghost btn-sm btn-icon btn-edit-student" data-id="${student.id}" title="Stammdaten bearbeiten">✏️</button>
        <button class="btn btn-ghost btn-sm btn-icon btn-open-student" data-id="${student.id}" title="Details">→</button>
        <button class="btn btn-danger btn-sm btn-icon btn-delete-student" data-id="${student.id}" data-name="${escHtml(student.firstName + ' ' + student.lastName)}" title="Löschen">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    </tr>
  `;
}

function assessmentCard(assessment, course) {
  const cat = course.categories.find(c => c.id === assessment.categoryId);
  const filled = assessment.results.filter(r => r.totalPoints !== null).length;
  const total  = assessment.results.length;
  const pct    = total > 0 ? Math.round((filled / total) * 100) : 0;

  return `
    <div class="card card-hover" style="cursor:pointer">
      <div class="flex justify-between items-center mb-2">
        <span class="chip" style="font-size:.72rem">${escHtml(cat?.name || '?')}</span>
        <span class="text-sm text-muted font-mono">${formatDateShort(assessment.date)}</span>
      </div>
      <div class="font-bold mb-2" style="font-size:.95rem">${escHtml(assessment.title)}</div>
      <div class="text-sm text-muted mb-2">
        Skala: <span class="font-mono">${assessment.maxPoints} Pkt.</span>
        · Modus: ${assessment.mode === 'dimensions' ? 'Teilnoten' : 'Einfach'}
      </div>
      <div class="progress-bar mb-2">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-sm text-muted">${filled}/${total} bewertet</span>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm btn-icon btn-print-assessment" data-id="${assessment.id}" title="Bewertungsbogen (Checkliste) drucken">🖨️</button>
          <button class="btn btn-primary btn-sm btn-grade-assessment" data-id="${assessment.id}">Noten</button>
          <button class="btn btn-ghost btn-sm btn-open-assessment" data-id="${assessment.id}">Details</button>
          <button class="btn btn-danger btn-sm btn-icon btn-delete-assessment" data-id="${assessment.id}" data-name="${escHtml(assessment.title)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── Add Student Modal ─────────────────────────────────────────────
// ── Add Student Modal ─────────────────────────────────────────────
function showAddStudentModal(courseId, onDone) {
  const course = getCourse(courseId);
  const globalStudents = getGlobalStudents() || [];
  
  // Filter out students who are already enrolled in this course
  const currentStudentIds = course.studentIds || [];
  const availableStudents = globalStudents.filter(s => !currentStudentIds.includes(s.id));
  
  // Sort available students by last name
  availableStudents.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  showModal('Schüler hinzufügen', `
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:2rem;max-height:60vh;overflow-y:auto;padding-right:0.4rem;">
      
      <!-- Left: Create new student -->
      <div>
        <div style="font-weight:700;font-size:1.3rem;margin-bottom:1rem;color:var(--text-bright);">✍️ Neuen Schüler anlegen</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Vorname</label>
            <input type="text" id="inp-firstname" placeholder="z.B. Max" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Nachname</label>
            <input type="text" id="inp-lastname" placeholder="z.B. Mustermann">
          </div>
        </div>
        <div class="form-group mt-2">
          <label class="form-label">Mehrere Schüler (optional, je Zeile)</label>
          <textarea id="inp-bulk" rows="5" placeholder="Anna Berger&#10;Lukas Huber&#10;Sara Gruber"></textarea>
          <div class="form-hint">Format: Vorname Nachname (eine Person pro Zeile)</div>
        </div>
      </div>

      <!-- Right: Select existing students from global DB -->
      <div style="border-left:1px solid var(--border);padding-left:2rem;display:flex;flex-direction:column;gap:1rem;">
        <div style="font-weight:700;font-size:1.3rem;color:var(--text-bright);">📂 Aus Datenbank auswählen</div>
        
        <input type="text" id="db-student-search" placeholder="Schüler suchen..." style="width:100%;padding:0.8rem;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:0.5rem;font-size:1.15rem;">
        
        <div id="db-students-list" style="display:flex;flex-direction:column;gap:0.6rem;max-height:22rem;overflow-y:auto;padding-right:0.4rem;">
          ${availableStudents.length === 0 
            ? '<div style="color:var(--text-muted);font-size:1.1rem;padding:1rem 0;">Keine weiteren Schüler in der Datenbank vorhanden.</div>'
            : availableStudents.map(s => {
                const ageLabel = s.birthDate ? ` (${new Date().getFullYear() - new Date(s.birthDate).getFullYear()} J.)` : '';
                return `
                <label class="db-student-row" data-name="${(s.lastName||'').toLowerCase()} ${(s.firstName||'').toLowerCase()}" style="display:flex;align-items:center;gap:0.8rem;padding:0.6rem 0.8rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);font-size:1.15rem;">
                  <input type="checkbox" class="db-student-select-cb" value="${s.id}" style="width:1.6rem;height:1.6rem;">
                  <span style="font-weight:600;">${escHtml(s.lastName)}, ${escHtml(s.firstName)}${ageLabel}</span>
                </label>`;
              }).join('')}
        </div>
      </div>

    </div>
  `, [
    { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
    {
      label: 'Hinzufügen', cls: 'btn-primary', onClick: () => {
        const fn = document.getElementById('inp-firstname').value.trim();
        const ln = document.getElementById('inp-lastname').value.trim();
        const bulk = document.getElementById('inp-bulk').value.trim();
        
        // Selected from DB checkbox list
        const selectedFromDb = [...document.querySelectorAll(".db-student-select-cb:checked")].map(cb => cb.value);
        
        let added = 0;

        // 1. Assign selected from DB
        selectedFromDb.forEach(sid => {
          assignStudentToCourse(courseId, sid);
          added++;
        });

        // 2. Create new from textareas
        if (bulk) {
          bulk.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              const lastName = parts.pop();
              const firstName = parts.join(' ');
              createStudent(courseId, { firstName, lastName });
              added++;
            }
          });
        } else if (fn && ln) {
          createStudent(courseId, { firstName: fn, lastName: ln });
          added++;
        }

        if (added === 0) {
          showToast('Bitte Schüler auswählen oder neuen Namen eingeben', 'error');
          return;
        }

        closeModal();
        showToast(`${added} Schüler hinzugefügt`, 'success');
        onDone();
      }
    }
  ], "modal-lg");

  // Real-time search inside the DB select list
  const searchInput = document.getElementById('db-student-search');
  searchInput?.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    document.querySelectorAll('.db-student-row').forEach(row => {
      const name = row.dataset.name;
      if (name.includes(query)) {
        row.style.display = 'flex';
      } else {
        row.style.display = 'none';
      }
    });
  });
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function isAdult(birthDateString) {
  if (!birthDateString) return null;
  const today = new Date();
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 18;
}

function showEditStudentModal(courseId, student, onDone) {
  const ibaOptions = ['none', '§8b1_N', '§8b2_N', '§8b2_G'];
  const ibaLabels = {
    'none': 'Kein IBA-Status',
    '§8b1_N': '§8b1_N (Verlängerte Lehre - Normaler Lehrplan)',
    '§8b2_N': '§8b2_N (Teilqualifizierung - Normaler Lehrplan)',
    '§8b2_G': '§8b2_G (Teilqualifizierung - Genereller Lehrplan)'
  };

  showModal(
    `Schüler bearbeiten: ${escHtml(student.firstName)} ${escHtml(student.lastName)}`,
    `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Vorname</label>
          <input type="text" id="edit-s-firstname" value="${escHtml(student.firstName)}">
        </div>
        <div class="form-group">
          <label class="form-label">Nachname</label>
          <input type="text" id="edit-s-lastname" value="${escHtml(student.lastName)}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Geburtsdatum</label>
          <input type="date" id="edit-s-birthdate" value="${student.birthDate || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">IBA-Status</label>
          <select id="edit-s-iba">
            ${ibaOptions.map(opt => `<option value="${opt}" ${student.ibaStatus === opt ? 'selected' : ''}>${ibaLabels[opt]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">IBA Kommentar / Anmerkung</label>
        <input type="text" id="edit-s-ibacomment" value="${escHtml(student.ibaComment || '')}" placeholder="z.B. Erhöhte Aufmerksamkeitsspanne nötig">
      </div>
      <hr class="divider">
      <div class="section-title text-sm">Zusatzinformationen</div>
      <div class="form-group">
        <label class="form-label">Zusatzinfo 1 (z.B. Netzticket)</label>
        <input type="text" id="edit-s-info1" value="${escHtml(student.info1 || '')}" placeholder="z.B. Netzticket vorhanden">
      </div>
      <div class="form-group">
        <label class="form-label">Zusatzinfo 2</label>
        <input type="text" id="edit-s-info2" value="${escHtml(student.info2 || '')}" placeholder="z.B. Internat Zimmer 12">
      </div>
      <div class="form-group">
        <label class="form-label">Zusatzinfo 3</label>
        <input type="text" id="edit-s-info3" value="${escHtml(student.info3 || '')}" placeholder="z.B. Freigestellt ab 14:00">
      </div>
    `,
    [
      { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
      {
        label: 'Speichern',
        cls: 'btn-primary',
        onClick: async () => {
          const { updateStudent } = await import('../db.js');
          const fn = document.getElementById('edit-s-firstname').value.trim();
          const ln = document.getElementById('edit-s-lastname').value.trim();
          const bd = document.getElementById('edit-s-birthdate').value;
          const iba = document.getElementById('edit-s-iba').value;
          const ibaCom = document.getElementById('edit-s-ibacomment').value.trim();
          const inf1 = document.getElementById('edit-s-info1').value.trim();
          const inf2 = document.getElementById('edit-s-info2').value.trim();
          const inf3 = document.getElementById('edit-s-info3').value.trim();

          if (!fn || !ln) {
            showToast('Vor- und Nachname erforderlich', 'error');
            return;
          }

          updateStudent(student.id, {
            firstName: fn,
            lastName: ln,
            birthDate: bd || null,
            ibaStatus: iba,
            ibaComment: ibaCom || null,
            info1: inf1 || null,
            info2: inf2 || null,
            info3: inf3 || null
          });

          closeModal();
          showToast('Schülerdaten gespeichert', 'success');
          onDone();
        }
      }
    ],
    'modal-lg'
  );
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDateShort(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`; }

function printAssessmentChecklist(assessment, course) {
  const win = window.open('', '_blank');
  const students = [...course.students].sort((a, b) => a.lastName.localeCompare(b.lastName));
  const isSimple = assessment.mode !== 'dimensions';
  const dims = assessment.dimensionConfig || course.dimensionTemplate || [];

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Bewertungsbogen - ${escHtml(assessment.title)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 30px; color: #000; background: #fff; }
          h1 { font-size: 1.4rem; margin-bottom: 2px; color: #0f172a; }
          h2 { font-size: 0.88rem; color: #475569; margin-top: 0; margin-bottom: 20px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1.5px solid #000; padding: 10px 8px; font-size: 0.82rem; text-align: left; }
          th { background: #f1f5f9; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .col-num { width: 35px; text-align: center; }
          .col-name { width: 240px; font-weight: 600; }
          .col-points { width: 85px; text-align: center; font-size: 0.78rem; }
          .col-level { width: 140px; text-align: center; font-weight: 600; }
          .col-notes { min-width: 150px; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <h1>📋 Bewertungsbogen: ${escHtml(assessment.title)}</h1>
        <h2>Kurs: ${escHtml(course.name)} · Fach: ${escHtml(course.subject)} · Max. Punkte: ${assessment.maxPoints}P · Typ: ${isSimple ? 'Einfache Leistung' : 'Teilnoten-Leistung'}</h2>
        <table>
          <thead>
            <tr>
              <th class="col-num">Nr.</th>
              <th class="col-name">Schüler</th>
              ${isSimple ? `
                <th class="col-points">Punkte (Max ${assessment.maxPoints}P)</th>
                <th class="col-level" style="font-size:0.75rem; letter-spacing: 0;">Kompetenz (Kreisen: E V S Ü N)</th>
              ` : `
                ${dims.map(d => `<th class="col-points" style="font-size:0.72rem">${escHtml(d.name)}<br><small>(Max ${d.maxPoints}P)</small></th>`).join('')}
                <th class="col-points">Gesamt<br><small>(Max ${assessment.maxPoints}P)</small></th>
              `}
              <th class="col-notes">Beobachtungen / Feedback</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((s, idx) => `
              <tr>
                <td class="col-num">${idx + 1}</td>
                <td class="col-name">${escHtml(s.lastName)}, ${escHtml(s.firstName)}</td>
                ${isSimple ? `
                  <td class="col-points" style="height:26px"></td>
                  <td class="col-level" style="font-family: monospace; font-size:0.85rem; letter-spacing:8px; text-align:center;">E V S Ü N</td>
                ` : `
                  ${dims.map(() => `<td class="col-points" style="height:26px"></td>`).join('')}
                  <td class="col-points" style="height:26px"></td>
                `}
                <td class="col-notes"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top: 30px; font-size: 0.75rem; color: #475569; font-style: italic;">
          Legende Kompetenzstufen: E = Exzellent / Übertroffen | V = Vollständig erfüllt | S = Sicher erfüllt | Ü = Überwiegend erfüllt | N = Nicht erfüllt
        </div>
        <script>
          window.onload = () => {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  win.document.close();
}

function printChecklist(course) {
  const win = window.open('', '_blank');
  const students = [...course.students].sort((a, b) => a.lastName.localeCompare(b.lastName));
  const dims = course.dimensions || [];
  const hasDims = dims.length > 0;
  const sumMaxPoints = dims.reduce((sum, d) => sum + (parseInt(d.maxPoints) || 0), 0);

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Checkliste - ${escHtml(course.name)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 30px; color: #000; background: #fff; }
          h1 { font-size: 1.5rem; margin-bottom: 2px; color: #0f172a; }
          h2 { font-size: 0.9rem; color: #475569; margin-top: 0; margin-bottom: 24px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1.5px solid #000; padding: 10px 8px; font-size: 0.85rem; text-align: left; }
          th { background: #f1f5f9; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .col-num { width: 35px; text-align: center; }
          .col-name { width: 240px; font-weight: 600; }
          .col-check { width: 45px; text-align: center; }
          .col-points { width: 85px; text-align: center; font-size: 0.78rem; }
          .col-notes { min-width: 150px; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <h1>📋 Checkliste: ${escHtml(course.name)} – ${escHtml(course.subject)}</h1>
        <h2>Schuljahr: ${escHtml(course.schoolYear)} · Lehrgang: ${course.lehrgang} · Datum: __________________</h2>
        <table>
          <thead>
            <tr>
              <th class="col-num">Nr.</th>
              <th class="col-name">Name</th>
              ${hasDims ? `
                ${dims.map(d => `<th class="col-points">${escHtml(d.name)}<br><small>(Max ${d.maxPoints}P)</small></th>`).join('')}
                <th class="col-points">Gesamt<br><small>(Max ${sumMaxPoints}P)</small></th>
              ` : `
                <th class="col-check"></th>
                <th class="col-check"></th>
                <th class="col-check"></th>
                <th class="col-check"></th>
                <th class="col-check"></th>
                <th class="col-check"></th>
                <th class="col-check"></th>
                <th class="col-check"></th>
                <th class="col-check"></th>
                <th class="col-check"></th>
              `}
              <th class="col-notes">Notizen</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((s, idx) => `
              <tr>
                <td class="col-num">${idx + 1}</td>
                <td class="col-name">${escHtml(s.lastName)}, ${escHtml(s.firstName)}</td>
                ${hasDims ? `
                  ${dims.map(() => `<td class="col-points" style="height:26px"></td>`).join('')}
                  <td class="col-points" style="height:26px"></td>
                ` : `
                  <td class="col-check"></td>
                  <td class="col-check"></td>
                  <td class="col-check"></td>
                  <td class="col-check"></td>
                  <td class="col-check"></td>
                  <td class="col-check"></td>
                  <td class="col-check"></td>
                  <td class="col-check"></td>
                  <td class="col-check"></td>
                  <td class="col-check"></td>
                `}
                <td class="col-notes"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <script>
          window.onload = () => {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  win.document.close();
}
