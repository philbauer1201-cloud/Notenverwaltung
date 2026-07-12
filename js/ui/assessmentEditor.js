/**
 * assessmentEditor.js – Leistungsfeststellung anlegen/bearbeiten
 * Unterstützt: Schnell-Modus, Teilnoten-Modus, Gruppen, Klassen-Schnelleingabe
 */

import {
  getCourse, getAssessment, createAssessment, updateAssessment, updateResult,
  createGroup, getGroupsForAssessment, uid
} from '../db.js';
import { pointsToLevel, getResultLevel, gradeClass, GRADE_LABELS, sumDimensions } from '../grading.js';
import { showModal, closeModal, showToast, navigate } from '../app.js';

const SCALES = [15, 30, 45];

export function renderAssessmentEditor(assessmentId, courseId, onDone, prefill = null) {
  const course = getCourse(courseId);
  if (!course) return;

  const isEdit = !!assessmentId;
  const assessment = isEdit ? getAssessment(courseId, assessmentId) : null;

  showModal(
    isEdit ? 'Leistung bearbeiten' : 'Neue Leistungsfeststellung',
    buildEditorForm(course, assessment, prefill),
    [
      { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
      {
        label: isEdit ? 'Speichern & Bewerten' : 'Erstellen & Bewerten',
        cls: 'btn-primary',
        onClick: () => {
          const data = collectFormData(course, assessment);
          if (!data) return;

          let finalAssessment;
          if (isEdit) {
            finalAssessment = updateAssessment(courseId, assessmentId, data);
          } else {
            finalAssessment = createAssessment(courseId, data);
          }
          closeModal();
          // Open grading sheet
          openGradingSheet(finalAssessment, course, onDone);
        }
      }
    ],
    'modal-lg'
  );

  // Live preview events
  setupEditorEvents(course, assessment, prefill);
}

// ── Form Builder ──────────────────────────────────────────────────
function buildEditorForm(course, assessment, prefill = null) {
  const today = new Date().toISOString().slice(0,10);
  const selScale = assessment?.scale || 30;
  const isFree   = !SCALES.includes(selScale);

  const isGroupChecked = (assessment?.groups?.length > 0) || prefill?.isGroup;

  return `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Titel</label>
        <input type="text" id="ed-title" value="${escHtml(assessment?.title || '')}" placeholder="z.B. Schularbeit 1" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Datum</label>
        <input type="date" id="ed-date" value="${assessment?.date || today}">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Kategorie</label>
        <select id="ed-category">
          ${course.categories.filter(c => c.type !== 'participation').map(c =>
            `<option value="${c.id}" ${assessment?.categoryId === c.id ? 'selected' : ''}>${escHtml(c.name)} (${c.weight}%)</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Bewertungsmethode</label>
        <div class="scale-selector" id="mode-selector">
          <div class="scale-option ${assessment?.mode !== 'dimensions' ? 'selected' : ''}" data-mode="simple" style="padding: 6px">
            <span class="scale-points" style="font-size:0.95rem">Gesamtpunkte</span>
            Einfache Note
          </div>
          <div class="scale-option ${assessment?.mode === 'dimensions' ? 'selected' : ''}" data-mode="dimensions" style="padding: 6px">
            <span class="scale-points" style="font-size:0.95rem">Teilnoten</span>
            Detaillierte Kriterien
          </div>
        </div>
      </div>
    </div>

    <!-- Scale Selector -->
    <div class="form-group" id="scale-selector-group" style="${assessment?.mode === 'dimensions' ? 'display:none' : ''}">
      <label class="form-label">Punkteskala</label>
      <div class="scale-selector" id="scale-selector">
        ${SCALES.map(s => `
          <div class="scale-option ${selScale === s && !isFree ? 'selected' : ''}" data-scale="${s}">
            <span class="scale-points">${s}</span>
            Punkte
            <div style="font-size:.7rem;color:var(--text-muted);margin-top:3px">${s === 15 ? 'Kurzcheck' : s === 30 ? 'Mittlerer Test' : 'Großes Projekt'}</div>
          </div>
        `).join('')}
        <div class="scale-option ${isFree ? 'selected' : ''}" data-scale="free">
          <span class="scale-points">Frei</span>
          Skala
          <div style="font-size:.7rem;color:var(--text-muted);margin-top:3px">Benutzerdefiniert</div>
        </div>
      </div>
    </div>

    <div class="form-group" id="free-scale-group" style="${isFree && assessment?.mode !== 'dimensions' ? '' : 'display:none'}">
      <label class="form-label">Maximalpunkte (freie Skala)</label>
      <input type="number" id="ed-max-points" value="${assessment?.maxPoints || ''}" min="1" max="999" placeholder="z.B. 60">
    </div>

    <!-- Cut Scores preview -->
    <div class="card mb-3" style="padding:14px">
      <div class="text-sm font-bold mb-2">Grenzwerte für diese Leistung</div>
      <div id="cutscores-preview"></div>
    </div>

    <!-- Dimensions (if mode = dimensions) -->
    <div id="dimensions-section" style="${assessment?.mode === 'dimensions' ? '' : 'display:none'}">
      <div class="section-title">Teilnoten-Konfiguration</div>
      <div class="lbvo-note mb-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Teilnoten aus dem Kurs-Template werden vorgeschlagen. Passe sie für diese Leistung an.
      </div>
      <div id="dimension-rows"></div>
      <button class="btn btn-ghost btn-sm" id="btn-add-dimension">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Teilnote hinzufügen
      </button>
    </div>

    <!-- Group assessment toggle -->
    <div class="divider"></div>
    <label class="toggle-wrap">
      <span class="toggle-switch">
        <input type="checkbox" id="ed-is-group" ${isGroupChecked ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </span>
      <span class="text-sm">Gruppenarbeit (Schüler in Gruppen bündeln & benennen)</span>
    </label>

    <!-- Groups UI -->
    <div id="groups-section" style="${isGroupChecked ? '' : 'display:none'}">
      <div style="display:flex;justify-content:between;align-items:center;margin-top:16px;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div class="section-title" style="margin-bottom:0">Gruppen einrichten</div>
        <select id="ed-load-group-config" class="btn btn-ghost btn-sm" style="width:auto;max-width:250px;font-size:.78rem;padding:4px 8px">
          <option value="">-- Vorlage laden (Zufallsgenerator) --</option>
          ${(course.savedGroupConfigs || []).map(cfg => `<option value="${cfg.id}" ${prefill?.groupTemplateId === cfg.id ? 'selected' : ''}>${escHtml(cfg.name)} (${cfg.groups.length}G)</option>`).join('')}
        </select>
      </div>
      <div id="groups-container"></div>
      <button class="btn btn-ghost btn-sm" id="btn-add-group" style="margin-top:10px" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Gruppe hinzufügen
      </button>
    </div>
  `;
}

function setupEditorEvents(course, assessment, prefill = null) {
  // Scale selector
  document.querySelectorAll('#scale-selector .scale-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#scale-selector .scale-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const isFree = opt.dataset.scale === 'free';
      document.getElementById('free-scale-group').style.display = isFree ? '' : 'none';
      updateCutScoresPreview(course, getSelectedScale());
    });
  });

  document.getElementById('ed-max-points')?.addEventListener('input', () => updateCutScoresPreview(course, getSelectedScale()));

  // Mode selector
  document.querySelectorAll('#mode-selector .scale-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#mode-selector .scale-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const mode = opt.dataset.mode;
      const isDim = mode === 'dimensions';
      
      document.getElementById('dimensions-section').style.display = isDim ? '' : 'none';
      document.getElementById('scale-selector-group').style.display = isDim ? 'none' : '';
      document.getElementById('free-scale-group').style.display = 
        (isDim || getSelectedScale().scale !== 'free') ? 'none' : '';
      
      updateCutScoresPreview(course, isDim ? getDimensionsMax() : getSelectedScale());
    });
  });

  document.getElementById('btn-add-dimension')?.addEventListener('click', () => {
    addDimensionRow(null);
    setupDimensionInputListeners(course);
    updateCutScoresPreview(course, getDimensionsMax());
  });

  // Init dimension rows
  const dims = assessment?.dimensionConfig || course.dimensionTemplate;
  if (dims?.length > 0 && assessment?.mode === 'dimensions') {
    dims.forEach(d => addDimensionRow(d));
  } else {
    // Pre-populate from template for when they switch
    course.dimensionTemplate?.forEach(d => addDimensionRow(d));
  }
  
  setupDimensionInputListeners(course);

  document.getElementById('ed-is-group')?.addEventListener('change', e => {
    document.getElementById('groups-section').style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('btn-add-group')?.addEventListener('click', () => {
    addGroupCard(course, null);
  });

  const existingGroups = assessment?.groups || [];
  if (existingGroups.length > 0) {
    existingGroups.forEach(g => addGroupCard(course, g));
  }

  // Load from template dropdown
  document.getElementById('ed-load-group-config')?.addEventListener('change', e => {
    const configId = e.target.value;
    if (!configId) return;
    const config = course.savedGroupConfigs?.find(c => c.id === configId);
    if (!config) return;

    // Clear existing group cards
    document.getElementById('groups-container').innerHTML = '';

    // Load group cards
    config.groups.forEach(g => {
      addGroupCard(course, g);
    });

    e.target.value = '';
    showToast(`Vorlage "${config.name}" geladen`, 'success');
  });

  // Prefill if template passed
  if (prefill?.groupTemplateId) {
    const config = course.savedGroupConfigs?.find(c => c.id === prefill.groupTemplateId);
    if (config) {
      document.getElementById('groups-container').innerHTML = '';
      config.groups.forEach(g => {
        addGroupCard(course, g);
      });
    }
  }

  const currentMode = document.querySelector('#mode-selector .scale-option.selected')?.dataset.mode;
  updateCutScoresPreview(course, currentMode === 'dimensions' ? getDimensionsMax() : getSelectedScale());
}

function addDimensionRow(dim) {
  const container = document.getElementById('dimension-rows');
  if (!container) return;
  const rowId = uid();
  const row = document.createElement('div');
  row.className = 'dimension-row';
  row.dataset.rowId = rowId;
  row.innerHTML = `
    <input type="text" class="dim-name" placeholder="Bezeichnung" value="${escHtml(dim?.name || '')}">
    <input type="number" class="dim-max" placeholder="Max" min="1" max="999" value="${dim?.maxPoints || ''}" style="width:80px">
    <span class="text-muted text-sm">Pkt.</span>
    <button class="btn btn-danger btn-sm btn-icon dim-remove" title="Entfernen">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  row.querySelector('.dim-remove').addEventListener('click', () => {
    row.remove();
    setupDimensionInputListeners(course);
    updateCutScoresPreview(course, getDimensionsMax());
  });
  container.appendChild(row);
}

function setupDimensionInputListeners(course) {
  document.querySelectorAll('#dimension-rows .dim-max').forEach(inp => {
    if (inp._hasListener) return;
    inp._hasListener = true;
    inp.addEventListener('input', () => {
      const currentMode = document.querySelector('#mode-selector .scale-option.selected')?.dataset.mode;
      if (currentMode === 'dimensions') {
        updateCutScoresPreview(course, getDimensionsMax());
      }
    });
  });
}

function getDimensionsMax() {
  let total = 0;
  document.querySelectorAll('#dimension-rows .dim-max').forEach(inp => {
    total += parseInt(inp.value) || 0;
  });
  return { maxPoints: total || 30 };
}

function addGroupCard(course, group) {
  const container = document.getElementById('groups-container');
  if (!container) return;
  const groupId = group?.id || uid();
  const card = document.createElement('div');
  card.className = 'card mb-2 group-card';
  card.dataset.groupId = groupId;
  card.style.padding = '14px';

  const memberIds = group?.memberIds || [];

  card.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <input type="text" class="group-name" placeholder="z.B. Gruppe A: Holzbox" value="${escHtml(group?.name || '')}" style="max-width:320px;font-weight:600">
      <button class="btn btn-danger btn-sm btn-icon group-remove" title="Gruppe entfernen">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:6px;font-weight:600">Mitglieder:</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:8px">
      ${course.students.map(s => `
        <label class="flex items-center gap-2" style="cursor:pointer;font-size:.82rem">
          <input type="checkbox" class="group-member-cb" data-student-id="${s.id}" ${memberIds.includes(s.id) ? 'checked' : ''}>
          <span>${escHtml(s.lastName)}, ${escHtml(s.firstName)}</span>
        </label>
      `).join('')}
    </div>
  `;

  card.querySelector('.group-remove').addEventListener('click', () => card.remove());
  
  // Uncheck from other groups if checked here
  card.querySelectorAll('.group-member-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        const studentId = cb.dataset.studentId;
        document.querySelectorAll(`.group-card:not([data-group-id="${groupId}"]) .group-member-cb[data-student-id="${studentId}"]`).forEach(otherCb => {
          otherCb.checked = false;
        });
      }
    });
  });

  container.appendChild(card);
}

function getSelectedScale() {
  const selected = document.querySelector('#scale-selector .scale-option.selected');
  if (!selected) return { scale: 30, maxPoints: 30 };
  if (selected.dataset.scale === 'free') {
    const max = parseInt(document.getElementById('ed-max-points')?.value) || 0;
    return { scale: 'free', maxPoints: max };
  }
  const s = parseInt(selected.dataset.scale);
  return { scale: s, maxPoints: s };
}

function updateCutScoresPreview(course, { maxPoints }) {
  const preview = document.getElementById('cutscores-preview');
  if (!preview || !maxPoints) return;
  const cs = course.cutScores;
  const grades = [
    { g: 1, label: 'Sehr Gut',       min: cs.sehrGut },
    { g: 2, label: 'Gut',            min: cs.gut },
    { g: 3, label: 'Befriedigend',   min: cs.befriedigend },
    { g: 4, label: 'Genügend',       min: cs.genuegend },
    { g: 5, label: 'Nicht Genügend', min: 0 }
  ];

  preview.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${grades.map((g, i) => {
        const nextMin = grades[i-1]?.min || 100;
        const fromPts = Math.ceil(maxPoints * g.min / 100);
        const toPts   = i === 0
          ? maxPoints
          : Math.floor(maxPoints * nextMin / 100) - 1;
        return `
          <div style="text-align:center;padding:8px 12px;border-radius:8px;border:1px solid var(--border);flex:1;min-width:80px">
            <div class="grade-badge g${g.g}" style="margin:0 auto 6px;display:flex">${g.g}</div>
            <div style="font-size:.7rem;color:var(--text-secondary);font-weight:600">${g.label}</div>
            <div style="font-size:.75rem;font-family:'JetBrains Mono',monospace;margin-top:4px;color:var(--text-primary)">
              ${g.g === 5 ? `0–${toPts}` : `${fromPts}–${toPts}`}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function collectFormData(course, existing) {
  const title = document.getElementById('ed-title')?.value.trim();
  const date  = document.getElementById('ed-date')?.value;
  const catId = document.getElementById('ed-category')?.value;
  const mode  = document.querySelector('#mode-selector .scale-option.selected')?.dataset.mode || 'simple';
  const isGroup = document.getElementById('ed-is-group')?.checked;

  if (!title) { showToast('Bitte Titel eingeben', 'error'); return null; }

  // Collect dimension config if mode = dimensions
  let dimensionConfig = null;
  let maxPoints = 0;
  let scale = 30;

  if (mode === 'dimensions') {
    const rows = document.querySelectorAll('#dimension-rows .dimension-row');
    dimensionConfig = [];
    for (const row of rows) {
      const name  = row.querySelector('.dim-name')?.value.trim();
      const max   = parseInt(row.querySelector('.dim-max')?.value);
      if (!name || !max) { showToast('Bitte alle Teilnoten ausfüllen', 'error'); return null; }
      dimensionConfig.push({ id: uid(), name, maxPoints: max });
      maxPoints += max;
    }
    if (dimensionConfig.length === 0) { showToast('Bitte mindestens eine Teilnote definieren', 'error'); return null; }
    scale = maxPoints;
  } else {
    const scaleData = getSelectedScale();
    scale = scaleData.scale;
    maxPoints = scaleData.maxPoints;
    if (!maxPoints || maxPoints < 1) { showToast('Bitte gültige Punktezahl eingeben', 'error'); return null; }
  }

  // Collect groups
  const groups = [];
  if (isGroup) {
    const groupCards = document.querySelectorAll('#groups-container .group-card');
    for (const card of groupCards) {
      const gName = card.querySelector('.group-name')?.value.trim();
      if (!gName) { showToast('Bitte allen Gruppen einen Namen geben', 'error'); return null; }
      const memberIds = Array.from(card.querySelectorAll('.group-member-cb:checked')).map(cb => cb.dataset.studentId);
      groups.push({ id: card.dataset.groupId, name: gName, memberIds });
    }
  }

  return { title, date, categoryId: catId, mode, scale, maxPoints, dimensionConfig, groups };
}

// ── Grading Sheet ─────────────────────────────────────────────────
export function openGradingSheet(assessment, course, onDone) {
  const students = [...course.students].sort((a, b) => a.lastName.localeCompare(b.lastName));
  const effectiveDims = assessment.dimensionConfig || course.dimensionTemplate;
  const isGroup = false; // can be extended

  showModal(
    `Bewertung: ${assessment.title}`,
    buildGradingSheet(assessment, course, students, effectiveDims),
    [
      { label: 'Schließen', cls: 'btn-ghost', onClick: () => { closeModal(); onDone(); } },
      {
        label: 'Alle speichern',
        cls: 'btn-primary',
        onClick: () => { saveGradingSheet(assessment, course, students, effectiveDims); onDone(); closeModal(); showToast('Noten gespeichert', 'success'); }
      }
    ],
    'modal-xl'
  );

  setupGradingEvents(assessment, course, students, effectiveDims);
}

function buildGradingSheet(assessment, course, students, dims) {
  const isSimple = assessment.mode === 'simple' || !dims?.length;
  const groups = assessment.groups || [];

  let tbodyHTML = '';

  if (groups.length > 0) {
    groups.forEach(g => {
      tbodyHTML += `
        <tr class="group-header-row" style="background:var(--bg-card-2);font-weight:700">
          <td colspan="${isSimple ? 6 : dims.length + 5}" style="padding:12px 16px;color:var(--accent);border-bottom:1.5px solid var(--border-md)">
            📁 ${escHtml(g.name)} (${g.memberIds.length} Schüler)
          </td>
        </tr>
      `;
      const groupStudents = students.filter(s => g.memberIds.includes(s.id));
      if (groupStudents.length === 0) {
        tbodyHTML += `
          <tr>
            <td colspan="${isSimple ? 6 : dims.length + 5}" class="text-muted" style="padding:10px 32px;font-style:italic">
              Keine Schüler in dieser Gruppe zugewiesen
            </td>
          </tr>
        `;
      } else {
        tbodyHTML += groupStudents.map(s => gradingRow(s, assessment, course, dims, isSimple)).join('');
      }
    });

    // Unassigned students
    const assignedIds = groups.flatMap(g => g.memberIds);
    const unassigned = students.filter(s => !assignedIds.includes(s.id));
    if (unassigned.length > 0) {
      tbodyHTML += `
        <tr class="group-header-row" style="background:var(--bg-card-2);font-weight:700">
          <td colspan="${isSimple ? 6 : dims.length + 5}" style="padding:12px 16px;color:var(--text-secondary);border-bottom:1.5px solid var(--border-md)">
            👤 Einzelarbeit / Unzugeordnet (${unassigned.length} Schüler)
          </td>
        </tr>
      `;
      tbodyHTML += unassigned.map(s => gradingRow(s, assessment, course, dims, isSimple)).join('');
    }
  } else {
    tbodyHTML = students.map(s => gradingRow(s, assessment, course, dims, isSimple)).join('');
  }

  return `
    <div class="lbvo-note mb-3">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span><strong>${escHtml(assessment.title)}</strong> · ${formatDateShort(assessment.date)} · Skala: ${assessment.maxPoints} Punkte
        ${!isSimple ? ` · Teilnoten: ${dims.map(d => `${d.name} (${d.maxPoints}P)`).join(', ')}` : ''}</span>
    </div>

    <div class="table-wrapper">
      <table class="data-table" id="grading-table">
        <thead>
          <tr>
            <th style="width:180px">Schüler</th>
            ${isSimple ? `<th style="width:140px">Kompetenzstufe</th>` : ''}
            ${isSimple
              ? `<th class="col-center" style="width:140px">Punkte (/${assessment.maxPoints})</th>`
              : dims.map(d => `<th class="col-center">${escHtml(d.name)}<br><small style="opacity:.6">${d.maxPoints}P</small></th>`).join('')
            }
            <th class="col-center" style="width:80px">%</th>
            <th class="col-center" style="width:90px">Stufe</th>
            <th class="col-center" style="width:80px">Override</th>
            <th style="min-width:140px">Kommentar</th>
          </tr>
        </thead>
        <tbody>
          ${tbodyHTML}
        </tbody>
      </table>
    </div>

    <!-- Quick fill all -->
    ${isSimple ? `
      <div class="flex items-center gap-2 mt-3" style="padding:12px;background:var(--bg-card-2);border-radius:var(--r-sm)">
        <span class="text-sm text-secondary">Schnell-Ausfüllen:</span>
        <input type="number" id="quick-fill-val" placeholder="Punkte für alle" style="width:120px" min="0" max="${assessment.maxPoints}">
        <span class="text-sm text-muted">/ ${assessment.maxPoints}</span>
        <button class="btn btn-ghost btn-sm" id="btn-quick-fill">Alle setzen</button>
      </div>
    ` : ''}
  `;
}

function gradingRow(student, assessment, course, dims, isSimple) {
  const res = assessment.results.find(r => r.studentId === student.id) || {};
  const { level } = getResultLevel(res, assessment, course);
  const initials = (student.firstName[0]||'') + (student.lastName[0]||'');

  let preselectedLevel = '';
  if (isSimple && res.totalPoints !== null && res.totalPoints !== undefined) {
    const { level: calculatedLevel } = pointsToLevel(res.totalPoints, assessment.maxPoints, course.cutScores);
    if (calculatedLevel) {
      preselectedLevel = 6 - calculatedLevel;
    }
  }

  const compSelectCell = isSimple
    ? `<td>
        <select class="comp-select" data-student="${student.id}" style="font-size:0.78rem;padding:4px 6px;width:130px">
          <option value="">-- wählen --</option>
          <option value="5" ${preselectedLevel === 5 ? 'selected' : ''}>Exzellent / Übertroffen</option>
          <option value="4" ${preselectedLevel === 4 ? 'selected' : ''}>Vollständig erfüllt</option>
          <option value="3" ${preselectedLevel === 3 ? 'selected' : ''}>Sicher erfüllt</option>
          <option value="2" ${preselectedLevel === 2 ? 'selected' : ''}>Überwiegend erfüllt</option>
          <option value="1" ${preselectedLevel === 1 ? 'selected' : ''}>Nicht erfüllt</option>
        </select>
       </td>`
    : '';

  const pointCells = isSimple
    ? `<td class="col-center">
        <div class="score-input-wrap" style="justify-content:center">
          <input type="number" class="grade-input" data-student="${student.id}" data-field="totalPoints"
            value="${res.totalPoints ?? ''}" min="0" max="${assessment.maxPoints}"
            style="width:80px;text-align:center" placeholder="–">
        </div>
      </td>`
    : dims.map(dim => {
        const ds = res.dimensionScores?.find(d => d.dimensionId === dim.id);
        return `<td class="col-center">
          <input type="number" class="dim-score-input" data-student="${student.id}" data-dim="${dim.id}"
            value="${ds?.points ?? ''}" min="0" max="${dim.maxPoints}"
            style="width:70px;text-align:center" placeholder="–">
        </td>`;
      }).join('');

  return `
    <tr data-student-id="${student.id}">
      <td>
        <div class="flex items-center gap-2">
          ${student.photo
            ? `<img src="${student.photo}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid var(--accent);flex-shrink:0;">`
            : `<div class="student-avatar" style="width:28px;height:28px;font-size:.7rem;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--bg-card-3);border:1px solid var(--border);border-radius:50%;font-weight:700;">${initials}</div>`
          }
          <span style="font-size:.85rem;font-weight:600">${escHtml(student.lastName)}, ${escHtml(student.firstName)}</span>
        </div>
      </td>
      ${compSelectCell}
      ${pointCells}
      <td class="col-center">
        <span class="pct-preview col-mono text-sm" data-student="${student.id}">
          ${res.totalPoints !== null && res.totalPoints !== undefined ? `${((res.totalPoints/assessment.maxPoints)*100).toFixed(1)}%` : '–'}
        </span>
      </td>
      <td class="col-center">
        <span class="level-preview" data-student="${student.id}">
          ${level ? `<span class="grade-badge ${gradeClass(level)}">${level}</span>` : '<span class="grade-badge empty">–</span>'}
        </span>
      </td>
      <td class="col-center">
        <select class="override-select" data-student="${student.id}" style="font-size:.78rem;padding:4px 6px;width:70px">
          <option value="">Auto</option>
          ${[1,2,3,4,5].map(g => `<option value="${g}" ${res.overrideLevel == g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </td>
      <td>
        <input type="text" class="comment-input" data-student="${student.id}"
          value="${escHtml(res.comment || '')}" placeholder="Kommentar…" style="font-size:.8rem">
      </td>
    </tr>
  `;
}

function setupGradingEvents(assessment, course, students, dims) {
  const isSimple = assessment.mode === 'simple' || !dims?.length;

  // Live preview on input
  document.querySelectorAll('.grade-input').forEach(inp => {
    inp.addEventListener('input', () => updateRowPreview(inp.dataset.student, assessment, course, dims, isSimple));
  });
  document.querySelectorAll('.dim-score-input').forEach(inp => {
    inp.addEventListener('input', () => updateRowPreview(inp.dataset.student, assessment, course, dims, isSimple));
  });
  document.querySelectorAll('.override-select').forEach(sel => {
    sel.addEventListener('change', () => updateRowPreview(sel.dataset.student, assessment, course, dims, isSimple));
  });

  // Competency select change
  document.querySelectorAll('.comp-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const studentId = sel.dataset.student;
      const compVal = parseInt(sel.value);
      if (!compVal) return;

      const pts = getPointsForCompetencyLevel(compVal, assessment.maxPoints, course.cutScores);
      const ptsInp = document.querySelector(`.grade-input[data-student="${studentId}"]`);
      if (ptsInp) {
        ptsInp.value = pts;
      }

      const commentInp = document.querySelector(`.comment-input[data-student="${studentId}"]`);
      if (commentInp && !commentInp.value.trim()) {
        const COMPETENCY_DESCRIPTORS = {
          5: "Aufgabe völlig eigenständig gelöst. Transfer auf neue Situationen. Fachsprache präzise, Lösung optimiert und fehlerfrei.",
          4: "Aufgabe weitgehend eigenständig und sicher gelöst. Wesentliche Anforderungen fehlerfrei. Minimale Unsicherheiten bei komplexen Transferfragen.",
          3: "Wesentliche Bereiche beherrscht. Gelegentlich Impuls/Hinweis nötig. Ausführung solide, kleine Mängel in Tiefe/Genauigkeit.",
          2: "Grundanforderungen in wesentlichen Teilen erfüllt. Lösung gelingt oft nur unter Anleitung. Vertiefungen fehlen.",
          1: "Grundanforderungen trotz Hilfe nicht erreicht. Leistung lückenhaft, fehlerhaft oder nicht vorhanden."
        };
        commentInp.value = COMPETENCY_DESCRIPTORS[compVal];
      }

      updateRowPreview(studentId, assessment, course, dims, isSimple);
    });
  });

  // Quick fill
  document.getElementById('btn-quick-fill')?.addEventListener('click', () => {
    const val = document.getElementById('quick-fill-val').value;
    if (val === '') return;
    document.querySelectorAll('.grade-input').forEach(inp => {
      inp.value = val;
      updateRowPreview(inp.dataset.student, assessment, course, dims, isSimple);
    });
  });
}

function updateRowPreview(studentId, assessment, course, dims, isSimple) {
  let pts = null;
  if (isSimple) {
    pts = parseFloat(document.querySelector(`.grade-input[data-student="${studentId}"]`)?.value);
  } else {
    let sum = 0, max = 0;
    dims.forEach(dim => {
      const inp = document.querySelector(`.dim-score-input[data-student="${studentId}"][data-dim="${dim.id}"]`);
      const v = parseFloat(inp?.value);
      if (!isNaN(v)) { sum += v; max += dim.maxPoints; }
    });
    if (max > 0) { pts = (sum / max) * assessment.maxPoints; }
  }

  const overrideVal = document.querySelector(`.override-select[data-student="${studentId}"]`)?.value;
  const pct = pts !== null && !isNaN(pts) ? (pts / assessment.maxPoints * 100) : null;
  const { level } = overrideVal
    ? { level: parseInt(overrideVal) }
    : pointsToLevel(pts, assessment.maxPoints, course.cutScores);

  const pctEl   = document.querySelector(`.pct-preview[data-student="${studentId}"]`);
  const levelEl = document.querySelector(`.level-preview[data-student="${studentId}"]`);
  if (pctEl) pctEl.textContent = pct !== null ? `${pct.toFixed(1)}%` : '–';
  if (levelEl) levelEl.innerHTML = level
    ? `<span class="grade-badge ${gradeClass(level)}">${level}</span>`
    : '<span class="grade-badge empty">–</span>';

  // Sync competency select dropdown with manual point edits
  const compSelect = document.querySelector(`.comp-select[data-student="${studentId}"]`);
  if (compSelect && pts !== null && !isNaN(pts)) {
    const { level: calculatedLevel } = pointsToLevel(pts, assessment.maxPoints, course.cutScores);
    if (calculatedLevel) {
      compSelect.value = 6 - calculatedLevel;
    } else {
      compSelect.value = "";
    }
  } else if (compSelect) {
    compSelect.value = "";
  }
}

function saveGradingSheet(assessment, course, students, dims) {
  const isSimple = assessment.mode === 'simple' || !dims?.length;
  students.forEach(s => {
    const comment  = document.querySelector(`.comment-input[data-student="${s.id}"]`)?.value || '';
    const override = document.querySelector(`.override-select[data-student="${s.id}"]`)?.value;

    if (isSimple) {
      const pts = document.querySelector(`.grade-input[data-student="${s.id}"]`)?.value;
      updateResult(course.id, assessment.id, s.id, {
        totalPoints:   pts !== '' && pts !== undefined ? parseFloat(pts) : null,
        comment,
        isOverridden:  !!override,
        overrideLevel: override ? parseInt(override) : null
      });
    } else {
      const dimScores = dims.map(dim => ({
        dimensionId: dim.id,
        points: parseFloat(document.querySelector(`.dim-score-input[data-student="${s.id}"][data-dim="${dim.id}"]`)?.value) || 0
      }));
      const { total } = sumDimensions(dimScores, dims);
      updateResult(course.id, assessment.id, s.id, {
        totalPoints:   total,
        dimensionScores: dimScores,
        comment,
        isOverridden:  !!override,
        overrideLevel: override ? parseInt(override) : null
      });
    }
  });
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDateShort(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`; }

function getPointsForCompetencyLevel(level, maxPoints, cutScores) {
  let minPct = 0, maxPct = 100;
  switch (level) {
    case 5:
      minPct = cutScores.sehrGut;
      maxPct = 100;
      break;
    case 4:
      minPct = cutScores.gut;
      maxPct = cutScores.sehrGut - 1;
      break;
    case 3:
      minPct = cutScores.befriedigend;
      maxPct = cutScores.gut - 1;
      break;
    case 2:
      minPct = cutScores.genuegend;
      maxPct = cutScores.befriedigend - 1;
      break;
    case 1:
      minPct = 0;
      maxPct = cutScores.genuegend - 1;
      break;
  }
  const minPts = Math.ceil(maxPoints * minPct / 100);
  const maxPts = Math.floor(maxPoints * maxPct / 100);
  return Math.round((minPts + maxPts) / 2);
}
