/**
 * seatingPlan.js – Interaktiver Sitzplan für Klassen
 */

import { getCourse, getSeatingPlan, saveSeatingPlan } from '../db.js';
import { showToast, navigate, showModal, closeModal } from '../app.js';

export function renderSeatingPlan(container, courseId) {
  const course = getCourse(courseId);
  if (!course) {
    navigate('dashboard');
    return;
  }

  // Load plan from DB, fallback to default 4x6
  let plan = getSeatingPlan(courseId);
  if (!plan.seats) plan.seats = {};
  plan.rows = plan.rows || 4;
  plan.cols = plan.cols || 6;

  container.innerHTML = `
    <div class="page-anim printable-area">
      <!-- Top header bar (hidden in print) -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px" class="no-print">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn btn-ghost btn-sm btn-back-class">← Zurück</button>
          <h1 style="margin:0">🪑 Sitzplan</h1>
          <span class="chip">${escHtml(course.name)} · ${escHtml(course.subject)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-ghost" id="btn-print-seating">🖨️ Drucken</button>
          <button class="btn btn-primary" id="btn-save-seating">💾 Sitzordnung speichern</button>
        </div>
      </div>

      <!-- Settings panel (hidden in print) -->
      <div class="card mb-3 no-print" style="padding:14px">
        <div class="flex items-center gap-3" style="flex-wrap:wrap">
          <div style="font-weight:600;font-size:0.9rem">Raumgröße anpassen:</div>
          <div class="flex items-center gap-1">
            <input type="number" id="seating-rows" value="${plan.rows}" min="1" max="10" style="width:60px;text-align:center;padding:4px">
            <span style="font-size:0.85rem">Zeilen (Tischreihen)</span>
          </div>
          <div class="flex items-center gap-1">
            <input type="number" id="seating-cols" value="${plan.cols}" min="1" max="10" style="width:60px;text-align:center;padding:4px">
            <span style="font-size:0.85rem">Spalten</span>
          </div>
          <button class="btn btn-ghost btn-sm" id="btn-resize-grid">Größe anwenden</button>
        </div>
      </div>

      <!-- Seating Plan Layout -->
      <div class="card" style="padding:24px;display:flex;flex-direction:column;align-items:center;gap:20px;background:var(--bg-card);border:1.5px solid var(--border)">
        
        <!-- Seating Grid -->
        <div id="seating-grid-container" style="width:100%;overflow-x:auto;display:flex;justify-content:center;padding:10px 0">
          <div id="seating-grid" style="display:grid;gap:12px;width:auto"></div>
        </div>

        <!-- Blackboard Indicator (Tafel / Pult) -->
        <div class="seating-blackboard" style="width:280px;background:var(--bg-card-2);border:1.5px solid var(--border);border-radius:6px;padding:8px 16px;text-align:center;font-weight:700;font-size:0.85rem;color:var(--text-secondary);letter-spacing:1px">
          (Tafel/Lehrerpult)
        </div>
      </div>

      <!-- Unassigned students section (hidden in print) -->
      <div class="card mt-3 no-print" style="padding:14px" id="unassigned-students-card">
        <div class="font-bold mb-2 text-sm" style="color:var(--text-secondary)">Noch nicht platziert:</div>
        <div class="flex gap-2" style="flex-wrap:wrap" id="unassigned-students-list"></div>
      </div>
    </div>
  `;

  // Bind Header Controls
  container.querySelector('.btn-back-class').addEventListener('click', () => {
    window.location.hash = 'class/' + course.id;
  });

  const printBtn = container.querySelector('#btn-print-seating');
  printBtn.addEventListener('click', () => {
    window.print();
  });

  const saveBtn = container.querySelector('#btn-save-seating');
  saveBtn.addEventListener('click', () => {
    saveSeatingPlan(courseId, plan);
    showToast('Sitzplan erfolgreich gespeichert', 'success');
  });

  const resizeBtn = container.querySelector('#btn-resize-grid');
  resizeBtn.addEventListener('click', () => {
    const r = parseInt(document.getElementById('seating-rows').value) || 4;
    const c = parseInt(document.getElementById('seating-cols').value) || 6;
    plan.rows = Math.min(10, Math.max(1, r));
    plan.cols = Math.min(10, Math.max(1, c));
    renderGrid();
  });

  // Render Grid helper
  function renderGrid() {
    const grid = document.getElementById('seating-grid');
    if (!grid) return;

    // Apply template rows/cols styling dynamically
    grid.style.gridTemplateRows = `repeat(${plan.rows}, auto)`;
    grid.style.gridTemplateColumns = `repeat(${plan.cols}, minmax(130px, 160px))`;

    let gridHTML = '';
    for (let r = 0; r < plan.rows; r++) {
      for (let c = 0; c < plan.cols; c++) {
        const key = `${r}_${c}`;
        const studentId = plan.seats[key];
        const student = studentId ? course.students.find(s => s.id === studentId) : null;

        if (student) {
          const initials = (student.firstName[0] || '') + (student.lastName[0] || '');
          const adultStatus = isAdult(student.birthDate);
          const u18Tag = adultStatus === false 
            ? `<span style="font-size:0.6rem;background:rgba(251,146,60,0.12);color:#f97316;padding:1px 3px;border-radius:2px;font-weight:700">U18</span>` 
            : '';
          const ibaTag = student.ibaStatus && student.ibaStatus !== 'none'
            ? `<span style="font-size:0.6rem;background:rgba(99,102,241,0.12);color:#818cf8;padding:1px 3px;border-radius:2px;font-weight:700" title="${escHtml(student.ibaComment || '')}">IBA</span>`
            : '';

          gridHTML += `
            <div class="seat-card occupied" data-row="${r}" data-col="${c}" style="border:1.5px solid var(--border);border-radius:var(--r-sm);background:var(--bg-card-2);padding:10px;text-align:center;position:relative;display:flex;flex-direction:column;align-items:center;gap:6px">
              <button class="btn-remove-seat no-print" data-row="${r}" data-col="${c}" title="Platz leeren" style="position:absolute;top:4px;right:4px;background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:0.75rem">×</button>
              <div class="student-avatar" style="width:28px;height:28px;font-size:0.75rem">${initials}</div>
              <div style="font-size:0.78rem;font-weight:600;line-height:1.2;word-break:break-word;width:100%">${escHtml(student.lastName)}</div>
              <div style="font-size:0.7rem;color:var(--text-secondary);word-break:break-word;width:100%">${escHtml(student.firstName)}</div>
              <div style="display:flex;gap:3px;margin-top:2px">
                ${u18Tag}
                ${ibaTag}
              </div>
            </div>
          `;
        } else {
          gridHTML += `
            <div class="seat-card empty no-print-placeholder" data-row="${r}" data-col="${c}" style="border:1.5px dashed var(--border);border-radius:var(--r-sm);padding:24px 10px;text-align:center;color:var(--text-muted);font-size:0.7rem;cursor:pointer;background:rgba(0,0,0,0.01)">
              <div style="font-size:1.1rem;margin-bottom:2px">+</div>
              Freier Platz
            </div>
          `;
        }
      }
    }

    grid.innerHTML = gridHTML;

    // Bind Empty Seats
    grid.querySelectorAll('.seat-card.empty').forEach(card => {
      card.addEventListener('click', () => {
        const row = parseInt(card.dataset.row);
        const col = parseInt(card.dataset.col);
        assignSeatPopover(row, col);
      });
    });

    // Bind Remove Buttons
    grid.querySelectorAll('.btn-remove-seat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = `${btn.dataset.row}_${btn.dataset.col}`;
        delete plan.seats[key];
        renderGrid();
      });
    });

    // Render Unassigned List
    renderUnassignedList();
  }

  function renderUnassignedList() {
    const list = document.getElementById('unassigned-students-list');
    const card = document.getElementById('unassigned-students-card');
    if (!list || !card) return;

    const placedIds = Object.values(plan.seats);
    const unseated = course.students.filter(s => !placedIds.includes(s.id));

    if (unseated.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    list.innerHTML = unseated.map(s => {
      return `
        <span class="chip btn-assign-student" data-id="${s.id}" style="cursor:pointer;padding:4px 10px">
          ${escHtml(s.lastName)}, ${escHtml(s.firstName)}
        </span>
      `;
    }).join('');

    // Clicking an unassigned student helps placing them in the first free desk
    list.querySelectorAll('.btn-assign-student').forEach(span => {
      span.addEventListener('click', () => {
        const studentId = span.dataset.id;
        // Find first empty seat
        let found = false;
        for (let r = 0; r < plan.rows; r++) {
          for (let c = 0; c < plan.cols; c++) {
            const key = `${r}_${c}`;
            if (!plan.seats[key]) {
              plan.seats[key] = studentId;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (!found) {
          showToast('Keine freien Plätze mehr im Raster. Erhöhe die Zeilen oder Spalten!', 'warning');
        } else {
          renderGrid();
        }
      });
    });
  }

  function assignSeatPopover(r, c) {
    const placedIds = Object.values(plan.seats);
    const unseated = course.students.filter(s => !placedIds.includes(s.id));

    if (unseated.length === 0) {
      showToast('Alle Schüler sind bereits platziert', 'info');
      return;
    }

    showModal(
      'Schüler platzieren',
      `
        <div class="form-group">
          <label class="form-label">Schüler auswählen</label>
          <select id="select-seat-student">
            ${unseated.map(s => `<option value="${s.id}">${escHtml(s.lastName)}, ${escHtml(s.firstName)}</option>`).join('')}
          </select>
        </div>
      `,
      [
        { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
        {
          label: 'Platzieren',
          cls: 'btn-primary',
          onClick: () => {
            const sId = document.getElementById('select-seat-student').value;
            plan.seats[`${r}_${c}`] = sId;
            closeModal();
            renderGrid();
          }
        }
      ]
    );
  }

  // Helper inside SeatingPlan
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

  // Initial Grid Render
  renderGrid();
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
