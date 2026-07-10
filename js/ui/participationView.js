/**
 * participationView.js – Mitarbeit-Schnelleingabe (+ ~ -)
 * Klassen-Schnelleingabe mit Tick-Buttons für alle Schüler
 */

import { getCourses, getCourse, getParticipationRecords, saveParticipationRecord } from '../db.js';
import { computeParticipationLevel, gradeClass, GRADE_LABELS } from '../grading.js';
import { showToast, navigate } from '../app.js';

export function renderParticipationView(container) {
  const courses = getCourses().filter(c =>
    c.categories.some(cat => cat.type === 'participation')
  );

  document.getElementById('topbar-breadcrumb').innerHTML = '<strong>Mitarbeit</strong>';
  document.getElementById('topbar-actions').innerHTML = '';

  container.innerHTML = `
    <div class="page-anim">
      <div class="page-header">
        <h1>Mitarbeit erfassen</h1>
        <p>Tägliche Mitarbeit schnell mit + / ~ / − erfassen</p>
      </div>

      ${courses.length === 0 ? `
        <div class="empty-state card">
          <h3>Keine Mitarbeit-Kategorien</h3>
          <p>Füge in einem Kurs eine Kategorie vom Typ "Mitarbeit" hinzu.</p>
          <button class="btn btn-primary btn-sm" id="btn-go-settings">Einstellungen</button>
        </div>
      ` : `
        <!-- Course selector + date -->
        <div class="card mb-3">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Kurs</label>
              <select id="participation-course-select">
                ${courses.map(c => `<option value="${c.id}">${escHtml(c.name)} – ${escHtml(c.subject)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Datum</label>
              <input type="date" id="participation-date" value="${new Date().toISOString().slice(0,10)}">
            </div>
          </div>
        </div>

        <div id="participation-content"></div>
      `}
    </div>
  `;

  container.querySelector('#btn-go-settings')?.addEventListener('click', () => navigate('settings'));

  if (courses.length === 0) return;

  const courseSelect = container.querySelector('#participation-course-select');
  const dateInput    = container.querySelector('#participation-date');

  function refresh() {
    const courseId = courseSelect.value;
    const date     = dateInput.value;
    renderParticipationSheet(container.querySelector('#participation-content'), courseId, date);
  }

  courseSelect?.addEventListener('change', refresh);
  dateInput?.addEventListener('change', refresh);
  refresh();
}

function renderParticipationSheet(container, courseId, date) {
  const course = getCourse(courseId);
  if (!course) return;

  const students = [...course.students].sort((a, b) => a.lastName.localeCompare(b.lastName));
  const records  = getParticipationRecords(courseId);
  const existing = records.find(r => r.date === date);

  // Current ticks state (in-memory for the sheet)
  const ticks = {};
  students.forEach(s => {
    const existingTick = existing?.ticks.find(t => t.studentId === s.id);
    ticks[s.id] = existingTick?.tick || null;
  });

  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <div class="section-title mb-0">
        Klasse: <strong>${escHtml(course.name)}</strong> · Fach: <strong>${escHtml(course.subject)}</strong>
        <span class="chip">${students.length} Schüler</span>
        ${existing ? '<span class="chip chip-accent">Bereits erfasst</span>' : ''}
      </div>
      <button class="btn btn-primary" id="btn-save-participation">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Speichern
      </button>
    </div>

    <!-- Legend -->
    <div class="flex gap-2 mb-3">
      <span class="chip" style="color:var(--tick-plus);border-color:rgba(34,211,160,.3)">+ Aktiv / Gut</span>
      <span class="chip" style="color:var(--tick-neu);border-color:rgba(148,163,184,.3)">~ Neutral</span>
      <span class="chip" style="color:var(--tick-minus);border-color:rgba(248,113,113,.3)">− Keine / Störend</span>
    </div>

    <!-- Quick all buttons -->
    <div class="flex gap-2 mb-3">
      <span class="text-sm text-muted">Alle setzen:</span>
      <button class="btn btn-ghost btn-sm" id="quick-all-plus" style="color:var(--tick-plus)">+ Alle</button>
      <button class="btn btn-ghost btn-sm" id="quick-all-neu"  style="color:var(--tick-neu)">~ Alle</button>
      <button class="btn btn-ghost btn-sm" id="quick-all-minus" style="color:var(--tick-minus)">− Alle</button>
      <button class="btn btn-ghost btn-sm" id="quick-all-clear">✕ Alle löschen</button>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:220px">Schüler</th>
            <th class="col-center">Mitarbeit heute</th>
            <th class="col-center">Ø Score</th>
            <th class="col-center">Gesamtstatus</th>
          </tr>
        </thead>
        <tbody id="participation-tbody">
          ${students.map(s => participationStudentRow(s, ticks[s.id], records, course)).join('')}
        </tbody>
      </table>
    </div>

    <!-- History -->
    ${records.length > 0 ? `
      <div class="section-title mt-4">Letzte Einträge</div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Datum</th>
              ${students.slice(0,8).map(s => `<th class="col-center" style="font-size:.7rem">${escHtml(s.lastName.slice(0,6))}</th>`).join('')}
              ${students.length > 8 ? '<th>…</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${[...records].sort((a,b) => b.date.localeCompare(a.date)).slice(0,8).map(rec => `
              <tr>
                <td class="col-mono">${formatDateShort(rec.date)}</td>
                ${students.slice(0,8).map(s => {
                  const t = rec.ticks.find(x => x.studentId === s.id)?.tick;
                  const col = t === '+' ? 'var(--tick-plus)' : t === '-' ? 'var(--tick-minus)' : 'var(--tick-neu)';
                  return `<td class="col-center" style="color:${col};font-weight:700">${t || '–'}</td>`;
                }).join('')}
                ${students.length > 8 ? '<td>…</td>' : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;

  // Tick button events
  setupTickEvents(container, ticks, students);

  // Quick-fill
  container.querySelector('#quick-all-plus')?.addEventListener('click', () => {
    students.forEach(s => setTick(s.id, '+', ticks));
    rerenderTicks(container, ticks, students, records, course);
  });
  container.querySelector('#quick-all-neu')?.addEventListener('click', () => {
    students.forEach(s => setTick(s.id, '~', ticks));
    rerenderTicks(container, ticks, students, records, course);
  });
  container.querySelector('#quick-all-minus')?.addEventListener('click', () => {
    students.forEach(s => setTick(s.id, '-', ticks));
    rerenderTicks(container, ticks, students, records, course);
  });
  container.querySelector('#quick-all-clear')?.addEventListener('click', () => {
    students.forEach(s => { ticks[s.id] = null; });
    rerenderTicks(container, ticks, students, records, course);
  });

  // Save
  container.querySelector('#btn-save-participation')?.addEventListener('click', () => {
    const tickArray = students.map(s => ({ studentId: s.id, tick: ticks[s.id] || '~' }));
    saveParticipationRecord(courseId, date, tickArray);
    showToast('Mitarbeit gespeichert', 'success');
    renderParticipationSheet(container, courseId, date);
  });
}

function participationStudentRow(student, currentTick, records, course) {
  const pr = computeParticipationLevel(records, student.id, course.participationCutScores);
  const initials = (student.firstName[0]||'') + (student.lastName[0]||'');

  return `
    <tr data-student-id="${student.id}">
      <td>
        <div class="flex items-center gap-2">
          <div class="student-avatar" style="width:28px;height:28px;font-size:.7rem">${initials}</div>
          ${escHtml(student.lastName)}, ${escHtml(student.firstName)}
        </div>
      </td>
      <td class="col-center">
        <div class="tick-cell">
          <button class="tick-btn tick-plus ${currentTick === '+' ? 'active' : ''}" data-student="${student.id}" data-tick="+" title="Aktiv">+</button>
          <button class="tick-btn tick-neu  ${currentTick === '~' ? 'active' : ''}" data-student="${student.id}" data-tick="~" title="Neutral">~</button>
          <button class="tick-btn tick-minus ${currentTick === '-' ? 'active' : ''}" data-student="${student.id}" data-tick="-" title="Keine">−</button>
        </div>
      </td>
      <td class="col-center col-mono text-sm">
        ${pr.avg !== null ? `${pr.avg > 0 ? '+' : ''}${pr.avg.toFixed(2)}` : '–'}
      </td>
      <td class="col-center">
        ${pr.level ? `<span class="grade-badge ${gradeClass(pr.level)}" title="${pr.label}">${pr.level}</span>` : '<span class="grade-badge empty">–</span>'}
      </td>
    </tr>
  `;
}

function setupTickEvents(container, ticks, students) {
  container.querySelectorAll('.tick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid  = btn.dataset.student;
      const tick = btn.dataset.tick;
      // Toggle off if already active
      ticks[sid] = ticks[sid] === tick ? null : tick;
      // Update buttons for this row
      const row = container.querySelector(`tr[data-student-id="${sid}"]`);
      row?.querySelectorAll('.tick-btn').forEach(b => {
        b.classList.toggle('active', ticks[sid] !== null && b.dataset.tick === ticks[sid]);
      });
    });
  });
}

function setTick(studentId, tick, ticks) { ticks[studentId] = tick; }

function rerenderTicks(container, ticks, students, records, course) {
  students.forEach(s => {
    const row = container.querySelector(`tr[data-student-id="${s.id}"]`);
    if (!row) return;
    row.querySelectorAll('.tick-btn').forEach(btn => {
      btn.classList.toggle('active', ticks[s.id] !== null && btn.dataset.tick === ticks[s.id]);
    });
  });
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDateShort(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`; }
