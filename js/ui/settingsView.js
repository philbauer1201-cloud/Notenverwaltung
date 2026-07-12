/**
 * settingsView.js – Kurseinstellungen, Kategorien, Dimensionen-Template, Cut-Scores
 */

import { getCourses, getCourse, createCourse, updateCourse, uid } from '../db.js';
import { showModal, closeModal, showToast, navigate } from '../app.js';

// ── Course Create/Edit Modal ──────────────────────────────────────
export function renderCourseModal(courseId, onDone) {
  const course = courseId ? getCourse(courseId) : null;
  const isEdit = !!course;

  showModal(
    isEdit ? 'Kurs bearbeiten' : 'Neuen Kurs erstellen',
    buildCourseForm(course),
    [
      { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
      {
        label: isEdit ? 'Speichern' : 'Erstellen',
        cls: 'btn-primary',
        onClick: () => {
          const data = collectCourseData();
          if (!data) return;
          if (isEdit) {
            updateCourse(courseId, data);
            showToast('Kurs aktualisiert', 'success');
          } else {
            createCourse(data);
            showToast('Kurs erstellt', 'success');
          }
          closeModal();
          onDone();
        }
      }
    ],
    'modal-lg'
  );

  setupCourseFormEvents(course);
}

function buildCourseForm(course) {
  const cats = course?.categories || [
    { id: uid(), name: 'Schularbeit',        weight: 50 },
    { id: uid(), name: 'Mündliche Mitarbeit', weight: 20, type: 'participation' },
    { id: uid(), name: 'Unterrichtsarbeit',  weight: 30 }
  ];
  const dims = course?.dimensionTemplate || [];
  const cs   = course?.cutScores || { sehrGut: 91, gut: 81, befriedigend: 67, genuegend: 50 };

  return `
    <!-- Basic Info -->
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Klasse / Bezeichnung</label>
        <input type="text" id="c-name" value="${escHtml(course?.name || '')}" placeholder="z.B. 3A – Rechnungswesen" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Fach</label>
        <input type="text" id="c-subject" value="${escHtml(course?.subject || '')}" placeholder="z.B. Rechnungswesen">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Schuljahr</label>
        <input type="text" id="c-year" value="${escHtml(course?.schoolYear || '2025/26')}" placeholder="z.B. 2025/26">
      </div>
      <div class="form-group">
        <label class="form-label">Lehrgang</label>
        <select id="c-lehrgang">
          <option value="1" ${course?.lehrgang === 1 || !course ? 'selected' : ''}>1. Lehrgang</option>
          <option value="2" ${course?.lehrgang === 2 ? 'selected' : ''}>2. Lehrgang</option>
          <option value="3" ${course?.lehrgang === 3 ? 'selected' : ''}>3. Lehrgang</option>
          <option value="4" ${course?.lehrgang === 4 ? 'selected' : ''}>4. Lehrgang</option>
        </select>
      </div>
    </div>

    <hr class="divider">

    <!-- Categories -->
    <div class="section-title">
      Kategorien & Gewichtung
      <span id="weight-total-badge" class="chip"></span>
    </div>
    <div class="form-hint mb-3">Die Summe aller Gewichtungen muss 100% ergeben.</div>
    <div id="category-rows">
      ${cats.map(c => categoryRow(c)).join('')}
    </div>
    <button class="btn btn-ghost btn-sm" id="btn-add-cat">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Kategorie hinzufügen
    </button>

    <hr class="divider">

    <!-- Dimension Template -->
    <div class="section-title">Teilnoten-Template (zentral für alle Schüler)</div>
    <div class="form-hint mb-3">Diese Teilnoten werden als Standard für neue Leistungsfeststellungen vorgeschlagen. Pro Leistung anpassbar.</div>
    <div id="dim-template-rows">
      ${dims.map(d => dimTemplateRow(d)).join('')}
    </div>
    <button class="btn btn-ghost btn-sm" id="btn-add-dim">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Teilnote hinzufügen
    </button>

    <hr class="divider">

    <!-- Cut Scores -->
    <div class="section-title">LBVO-Grenzwerte (Schwellenwerte in %)</div>
    <div class="form-hint mb-3">Diese Grenzwerte bestimmen, ab welchem Prozentwert eine Qualitätsstufe erreicht wird.</div>
    <div class="form-row-3">
      ${[
        { id: 'cs-sg', label: 'Sehr Gut (1)', key: 'sehrGut', val: cs.sehrGut },
        { id: 'cs-g',  label: 'Gut (2)',       key: 'gut',     val: cs.gut },
        { id: 'cs-b',  label: 'Befriedigend (3)', key: 'befriedigend', val: cs.befriedigend },
      ].map(f => `
        <div class="form-group">
          <label class="form-label">${f.label}</label>
          <div style="position:relative">
            <input type="number" id="${f.id}" value="${f.val}" min="0" max="100" style="padding-right:28px">
            <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:.85rem">%</span>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="form-group">
      <label class="form-label">Genügend (4)</label>
      <div style="position:relative;max-width:200px">
        <input type="number" id="cs-gen" value="${cs.genuegend}" min="0" max="100" style="padding-right:28px">
        <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:.85rem">%</span>
      </div>
      <div class="form-hint">Unter ${cs.genuegend}% → Nicht Genügend (5)</div>
    </div>
  `;
}

function categoryRow(cat) {
  const rowId = cat.id || uid();
  return `
    <div class="dimension-row cat-row" data-cat-id="${rowId}" style="grid-template-columns:1fr 80px auto auto">
      <input type="text" class="cat-name" value="${escHtml(cat.name || '')}" placeholder="Kategoriename">
      <div style="position:relative">
        <input type="number" class="cat-weight" value="${cat.weight || ''}" min="0" max="100" style="padding-right:20px;text-align:center">
        <span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:.8rem">%</span>
      </div>
      <label class="toggle-wrap" title="Mitarbeit-Kategorie">
        <span class="toggle-switch" style="transform:scale(.8)">
          <input type="checkbox" class="cat-participation" ${cat.type === 'participation' ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </span>
        <span class="text-sm text-muted">Mitarbeit</span>
      </label>
      <button class="btn btn-danger btn-sm btn-icon cat-remove">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function dimTemplateRow(dim) {
  return `
    <div class="dimension-row dim-template-row">
      <input type="text" class="dim-t-name" value="${escHtml(dim.name || '')}" placeholder="Teilnoten-Bezeichnung">
      <input type="number" class="dim-t-max" value="${dim.maxPoints || ''}" min="1" max="999" style="width:80px" placeholder="Max">
      <span class="text-muted text-sm">Pkt.</span>
      <button class="btn btn-danger btn-sm btn-icon dim-t-remove">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function setupCourseFormEvents(course) {
  // Category add/remove + weight total
  document.getElementById('btn-add-cat')?.addEventListener('click', () => {
    const container = document.getElementById('category-rows');
    const tmp = document.createElement('div');
    tmp.innerHTML = categoryRow({ id: uid(), name: '', weight: 0 });
    const row = tmp.firstElementChild;
    setupCatRowEvents(row);
    container.appendChild(row);
    updateWeightTotal();
  });

  document.querySelectorAll('.cat-row').forEach(row => setupCatRowEvents(row));
  updateWeightTotal();

  // Dimension add/remove
  document.getElementById('btn-add-dim')?.addEventListener('click', () => {
    const container = document.getElementById('dim-template-rows');
    const tmp = document.createElement('div');
    tmp.innerHTML = dimTemplateRow({ name: '', maxPoints: '' });
    const row = tmp.firstElementChild;
    row.querySelector('.dim-t-remove')?.addEventListener('click', () => row.remove());
    container.appendChild(row);
  });

  document.querySelectorAll('.dim-template-row').forEach(row => {
    row.querySelector('.dim-t-remove')?.addEventListener('click', () => row.remove());
  });
}

function setupCatRowEvents(row) {
  row.querySelector('.cat-remove')?.addEventListener('click', () => { row.remove(); updateWeightTotal(); });
  row.querySelector('.cat-weight')?.addEventListener('input', updateWeightTotal);
}

function updateWeightTotal() {
  let total = 0;
  document.querySelectorAll('.cat-weight').forEach(inp => { total += parseInt(inp.value) || 0; });
  const badge = document.getElementById('weight-total-badge');
  if (!badge) return;
  badge.textContent = `${total}%`;
  badge.style.background = total === 100 ? 'rgba(34,211,160,.15)' : 'rgba(248,113,113,.15)';
  badge.style.color = total === 100 ? 'var(--grade-1)' : 'var(--grade-5)';
  badge.style.borderColor = total === 100 ? 'rgba(34,211,160,.3)' : 'rgba(248,113,113,.3)';
}

function collectCourseData() {
  const name    = document.getElementById('c-name')?.value.trim();
  const subject = document.getElementById('c-subject')?.value.trim();
  const year    = document.getElementById('c-year')?.value.trim();
  const lehrgang = parseInt(document.getElementById('c-lehrgang')?.value);

  if (!name) { showToast('Bitte Bezeichnung eingeben', 'error'); return null; }

  // Categories
  const categories = [];
  let totalWeight = 0;
  document.querySelectorAll('.cat-row').forEach((row, i) => {
    const catName = row.querySelector('.cat-name')?.value.trim();
    const weight  = parseInt(row.querySelector('.cat-weight')?.value) || 0;
    const isParticipation = row.querySelector('.cat-participation')?.checked;
    if (catName) {
      categories.push({ id: uid(), name: catName, weight, ...(isParticipation ? { type: 'participation' } : {}) });
      totalWeight += weight;
    }
  });

  if (categories.length === 0) { showToast('Mindestens eine Kategorie erforderlich', 'error'); return null; }
  if (totalWeight !== 100) { showToast(`Gewichtungen ergeben ${totalWeight}% (muss 100% sein)`, 'error'); return null; }

  // Dimension template
  const dimensionTemplate = [];
  document.querySelectorAll('.dim-template-row').forEach(row => {
    const dName = row.querySelector('.dim-t-name')?.value.trim();
    const dMax  = parseInt(row.querySelector('.dim-t-max')?.value);
    if (dName && dMax) dimensionTemplate.push({ id: uid(), name: dName, maxPoints: dMax });
  });

  // Cut scores
  const cutScores = {
    sehrGut:     parseInt(document.getElementById('cs-sg')?.value) || 91,
    gut:         parseInt(document.getElementById('cs-g')?.value) || 81,
    befriedigend:parseInt(document.getElementById('cs-b')?.value)  || 67,
    genuegend:   parseInt(document.getElementById('cs-gen')?.value)|| 50
  };

  return { name, subject, schoolYear: year, lehrgang, categories, dimensionTemplate, cutScores };
}

// ── Settings Page ─────────────────────────────────────────────────
export function renderSettingsView(container) {
  const courses = getCourses();

  document.getElementById('topbar-breadcrumb').innerHTML = '<strong>Einstellungen</strong>';
  document.getElementById('topbar-actions').innerHTML = '';

  container.innerHTML = `
    <div class="page-anim">
      <div class="page-header">
        <h1>Einstellungen</h1>
        <p>Kurse konfigurieren und App-Einstellungen verwalten</p>
      </div>

      <div class="settings-section">
        <h3>Kurse</h3>
        <p class="settings-desc">Kurse bearbeiten, Kategorien und Gewichtungen anpassen.</p>
        ${courses.length === 0 ? '<p class="text-muted text-sm">Noch keine Kurse vorhanden.</p>' : `
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
            ${courses.map(c => `
              <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg-card-2)">
                <div style="flex:1">
                  <div class="font-bold">${escHtml(c.name)}</div>
                  <div class="text-sm text-muted">${escHtml(c.subject)} · Lehrgang ${c.lehrgang} · ${escHtml(c.schoolYear)} · ${c.students.length} Schüler</div>
                </div>
                <button class="btn btn-ghost btn-sm btn-edit-course" data-id="${c.id}">Bearbeiten</button>
              </div>
            `).join('')}
          </div>
        `}
        <button class="btn btn-primary btn-sm" id="btn-new-course-settings">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Neuen Kurs erstellen
        </button>
      </div>

      <div class="settings-section">
        <h3>Sicherheit & Passwort</h3>
        <p class="settings-desc">Ändern Sie hier das Master-Passwort der Anwendung.</p>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Aktuelles Passwort</label>
            <input type="password" id="pw-current" placeholder="Derzeitiges Passwort" autocomplete="current-password">
          </div>
          <div class="form-group">
            <label class="form-label">Neues Passwort</label>
            <input type="password" id="pw-new" placeholder="Neues Passwort" autocomplete="new-password">
          </div>
          <div class="form-group">
            <label class="form-label">Neues Passwort (Wdh.)</label>
            <input type="password" id="pw-new-confirm" placeholder="Bestätigung" autocomplete="new-password">
          </div>
        </div>
        <button class="btn btn-primary btn-sm mt-3" id="btn-change-pw">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Passwort ändern
        </button>
      </div>

      <div class="settings-section">
        <h3>Über NotenPro</h3>
        <p class="settings-desc">LBVO-konforme Notenverwaltung für Berufsschullehrkräfte.</p>
        <div class="text-sm text-muted">
          Version 1.0.0 · Alle Daten werden lokal in deinem Browser gespeichert (LocalStorage). Erstelle regelmäßige JSON-Backups.
        </div>
        <div class="lbvo-note mt-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Diese App ist kein Ersatz für das pädagogische Urteil der Lehrkraft. Die Notenempfehlungen basieren auf einem Leistungsprofil nach LBVO §20. Die finale Beurteilung liegt immer bei der Lehrkraft.</span>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.btn-edit-course').forEach(btn => {
    btn.addEventListener('click', () => renderCourseModal(btn.dataset.id, () => renderSettingsView(container)));
  });
  container.querySelector('#btn-new-course-settings')?.addEventListener('click', () =>
    renderCourseModal(null, () => renderSettingsView(container)));

  // Password Change Logic
  container.querySelector('#btn-change-pw')?.addEventListener('click', async () => {
    const curr = document.getElementById('pw-current').value;
    const n1 = document.getElementById('pw-new').value;
    const n2 = document.getElementById('pw-new-confirm').value;

    if (!curr || !n1 || !n2) {
      showToast('Bitte alle Felder ausfüllen', 'error');
      return;
    }
    if (n1 !== n2) {
      showToast('Die neuen Passwörter stimmen nicht überein', 'error');
      return;
    }
    if (n1.length < 6) {
      showToast('Das neue Passwort muss mindestens 6 Zeichen lang sein', 'error');
      return;
    }

    const currentHashAttempt = await window.sha256(curr);
    const correctHash = await window.computeCorrectHash();

    if (currentHashAttempt !== correctHash) {
      showToast('Das aktuelle Passwort ist falsch', 'error');
      return;
    }

    const newHash = await window.sha256(n1);
    localStorage.setItem('notenpro_custom_pw', newHash);
    showToast('Passwort erfolgreich geändert!', 'success');
    
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-new-confirm').value = '';
  });
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
