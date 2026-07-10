/**
 * generatorView.js – Zufallsgenerator für Gruppeneinteilungen
 * Zufällige Verteilung, interaktive Verschiebung und Speichern von Vorlagen
 */

import { getCourses, getCourse, saveGroupConfig, deleteGroupConfig, uid } from '../db.js';
import { showToast } from '../app.js';

export function renderGeneratorView(container) {
  const courses = getCourses();

  document.getElementById('topbar-breadcrumb').innerHTML = '<strong>Zufallsgenerator</strong>';
  document.getElementById('topbar-actions').innerHTML = '';

  container.innerHTML = `
    <div class="page-anim" style="max-width: 1000px; margin: 0 auto">
      <div class="page-header" style="text-align: center">
        <h1 style="display:flex;align-items:center;justify-content:center;gap:10px">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Zufallsgenerator
        </h1>
        <p>Erstelle zufällige Gruppen für Projekte und praktische Arbeiten</p>
      </div>

      <!-- Select Class -->
      <div class="card mb-3" style="max-width: 600px; margin: 0 auto 20px">
        <div class="form-group mb-0">
          <label class="form-label">Klasse auswählen</label>
          <select id="gen-course-select">
            <option value="">-- Klasse wählen --</option>
            ${courses.map(c => `<option value="${c.id}">${escHtml(c.name)} (${escHtml(c.subject)})</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="generator-workspace" style="display:none">
        <!-- Configuration -->
        <div class="card mb-3">
          <div class="section-title">Konfiguration</div>
          <div class="form-row-3" style="align-items:end">
            <div class="form-group mb-0">
              <label class="form-label">Methode</label>
              <select id="gen-method">
                <option value="num-groups">Anzahl der Gruppen</option>
                <option value="size-groups">Schüler pro Gruppe</option>
              </select>
            </div>
            <div class="form-group mb-0">
              <label class="form-label" id="gen-value-label">Anzahl Gruppen</label>
              <input type="number" id="gen-value" min="2" max="20" value="3">
            </div>
            <button class="btn btn-primary" id="btn-run-generator" style="width:100%">
              🎲 Gruppen erzeugen
            </button>
          </div>
        </div>

        <!-- Results Area -->
        <div id="generation-results-area" style="display:none" class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px" class="no-print">
            <div class="section-title" style="margin-bottom:0">Erstellte Gruppen</div>
            <button class="btn btn-ghost btn-sm" id="btn-print-active-groups" style="padding:4px 8px;font-size:0.75rem" type="button">🖨️ Gruppen drucken</button>
          </div>
          <div class="grid-3" id="generated-groups-grid"></div>

          <!-- Save Area -->
          <div class="card mt-3" style="background:var(--bg-card-2)">
            <div class="section-title">Einteilung speichern</div>
            <div class="form-row" style="align-items:end">
              <div class="form-group mb-0">
                <label class="form-label">Name des Gruppen-Setups</label>
                <input type="text" id="gen-save-name" placeholder="z.B. Projekt Werkstatt A">
              </div>
              <button class="btn btn-success" id="btn-save-gen-setup">
                💾 Setup speichern
              </button>
            </div>
          </div>
        </div>

        <!-- Saved Configs List -->
        <div class="card">
          <div class="section-title">Gespeicherte Gruppenarbeiten</div>
          <div id="saved-configs-container"></div>
        </div>
      </div>
    </div>
  `;

  const courseSelect = document.getElementById('gen-course-select');
  const workspace    = document.getElementById('generator-workspace');

  courseSelect.addEventListener('change', () => {
    const courseId = courseSelect.value;
    if (courseId) {
      workspace.style.display = '';
      document.getElementById('generation-results-area').style.display = 'none';
      renderSavedConfigs(courseId);
    } else {
      workspace.style.display = 'none';
    }
  });

  const methodSelect = document.getElementById('gen-method');
  const valueLabel   = document.getElementById('gen-value-label');
  const valueInput   = document.getElementById('gen-value');

  methodSelect.addEventListener('change', () => {
    if (methodSelect.value === 'num-groups') {
      valueLabel.textContent = 'Anzahl Gruppen';
      valueInput.value = '3';
    } else {
      valueLabel.textContent = 'Schüler pro Gruppe';
      valueInput.value = '3';
    }
  });

  // Current generated state
  let currentGroups = [];
}

function renderGeneratedGroups(course) {
  const area = document.getElementById('generation-results-area');
  const grid = document.getElementById('generated-groups-grid');
  if (!area || !grid) return;

  area.style.display = '';
  grid.innerHTML = '';

  const groups = window._currentGeneratorGroups || [];

  // Expose groups globally or keep in module level
  window._currentGeneratorGroups = window._currentGeneratorGroups || [];

  // Copy local structure to window for accessibility during dynamic rebuild
  const currentGroups = window._currentGeneratorGroups;

  // Initialize if empty
  const activeGroups = currentGroups.length > 0 ? currentGroups : JSON.parse(JSON.stringify(window._generatorGroupsState || []));

  // If local list is empty, initialize from the generated one
  if (currentGroups.length === 0) {
    // Actually let's use the local state directly
  }

  // To build a robust state:
  const render = () => {
    grid.innerHTML = window._activeGroups.map((g, gIdx) => {
      return `
        <div class="card" style="padding:14px;border:1.5px solid var(--border)">
          <div style="display:flex;justify-content:between;align-items:center;margin-bottom:10px">
            <input type="text" class="group-title-input font-bold" data-index="${gIdx}" value="${escHtml(g.name)}" style="border:none;background:transparent;padding:2px;font-size:.95rem">
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${g.memberIds.map(sid => {
              const s = course.students.find(x => x.id === sid);
              if (!s) return '';
              return `
                <div style="display:flex;align-items:center;justify-content:between;background:var(--bg-card-2);padding:6px 10px;border-radius:6px;font-size:.82rem">
                  <span class="truncate">${escHtml(s.lastName)}, ${escHtml(s.firstName)}</span>
                  <select class="move-student-select" data-student="${sid}" data-current-group="${gIdx}" style="width:auto;font-size:.72rem;padding:2px 4px;border:none">
                    <option value="${gIdx}">Gruppe ${gIdx+1}</option>
                    ${window._activeGroups.map((_, otherIdx) => otherIdx !== gIdx ? `<option value="${otherIdx}">Verschieben nach G${otherIdx+1}</option>` : '').join('')}
                  </select>
                </div>
              `;
            }).join('')}
            ${g.memberIds.length === 0 ? '<div class="text-sm text-muted" style="text-align:center;padding:10px;font-style:italic">Keine Mitglieder</div>' : ''}
          </div>
        </div>
      `;
    }).join('');

    // Bind events
    grid.querySelectorAll('.group-title-input').forEach(inp => {
      inp.addEventListener('change', () => {
        window._activeGroups[parseInt(inp.dataset.index)].name = inp.value.trim() || `Gruppe ${parseInt(inp.dataset.index) + 1}`;
      });
    });

    grid.querySelectorAll('.move-student-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const studentId = sel.dataset.student;
        const fromIdx   = parseInt(sel.dataset.currentGroup);
        const toIdx     = parseInt(sel.value);

        // Move student
        window._activeGroups[fromIdx].memberIds = window._activeGroups[fromIdx].memberIds.filter(id => id !== studentId);
        window._activeGroups[toIdx].memberIds.push(studentId);

        render();
      });
    });
  };

  // Setup initial activeGroups
  window._activeGroups = window._activeGroups || [];
 
  // Setup print button
  const printActiveBtn = document.getElementById('btn-print-active-groups');
  if (printActiveBtn) {
    printActiveBtn.onclick = () => {
      printGroups(course.name, "Temporäre Gruppenaufteilung", window._activeGroups, course);
    };
  }

  // Expose save function to use window._activeGroups
  document.getElementById('btn-save-gen-setup').onclick = () => {
    const courseId = document.getElementById('gen-course-select').value;
    const name = document.getElementById('gen-save-name').value.trim();
    if (!name) { showToast('Bitte einen Namen eingeben', 'error'); return; }
    saveGroupConfig(courseId, name, window._activeGroups);
    showToast('Gruppen-Setup gespeichert!', 'success');
    document.getElementById('gen-save-name').value = '';
    renderSavedConfigs(courseId);
  };
 
  render();
}

export function setupGeneratorCore(container) {
  const runBtn = container.querySelector('#btn-run-generator');
  if (!runBtn) return;
  runBtn.addEventListener('click', () => {
    const course = getCourse(container.querySelector('#gen-course-select').value);
    if (!course || course.students.length === 0) return;

    const val = parseInt(container.querySelector('#gen-value').value) || 2;
    const method = container.querySelector('#gen-method').value;
    let numGroups = 2;
    if (method === 'num-groups') {
      numGroups = val;
    } else {
      numGroups = Math.max(1, Math.ceil(course.students.length / val));
    }

    const shuffled = [...course.students].sort(() => Math.random() - 0.5);
    window._activeGroups = Array.from({ length: numGroups }, (_, i) => ({
      id: uid(),
      name: `Gruppe ${i + 1}`,
      memberIds: []
    }));

    shuffled.forEach((student, index) => {
      window._activeGroups[index % numGroups].memberIds.push(student.id);
    });

    renderGeneratedGroups(course);
  });
}

function renderSavedConfigs(courseId) {
  const container = document.getElementById('saved-configs-container');
  if (!container) return;

  const course = getCourse(courseId);
  const configs = course?.savedGroupConfigs || [];

  if (configs.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:20px">
        <p class="text-sm text-muted">Noch keine Gruppenarbeiten für diesen Kurs gespeichert.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${configs.map(c => `
        <div style="display:flex;align-items:center;justify-content:between;padding:12px 16px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg-card-2)">
          <div style="flex:1">
            <div class="font-bold">${escHtml(c.name)}</div>
            <div class="text-sm text-muted">${c.groups.length} Gruppen · ${escHtml(c.date)}</div>
            <div class="flex gap-2 mt-2" style="flex-wrap:wrap">
              ${c.groups.map(g => `<span class="chip" style="font-size:.7rem;padding:2px 6px">${escHtml(g.name)} (${g.memberIds.length})</span>`).join('')}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px" class="no-print">
            <button class="btn btn-ghost btn-sm btn-create-assessment-from-config" data-id="${c.id}" style="padding:4px 8px;font-size:0.75rem">
              ➕ Leistung anlegen
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-print-config" data-id="${c.id}" title="Drucken">
              🖨️
            </button>
            <button class="btn btn-danger btn-sm btn-icon btn-delete-config" data-id="${c.id}" data-name="${escHtml(c.name)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
 
  container.querySelectorAll('.btn-create-assessment-from-config').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { renderAssessmentEditor } = await import('./assessmentEditor.js');
      renderAssessmentEditor(null, courseId, () => {
        // done
      }, {
        isGroup: true,
        groupTemplateId: btn.dataset.id
      });
    });
  });

  container.querySelectorAll('.btn-print-config').forEach(btn => {
    btn.addEventListener('click', () => {
      const config = configs.find(x => x.id === btn.dataset.id);
      if (config) {
        printGroups(course.name, config.name, config.groups, course);
      }
    });
  });

  container.querySelectorAll('.btn-delete-config').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { confirm } = await import('../app.js');
      const ok = await confirm(`Gruppen-Setup "${btn.dataset.name}" löschen?`);
      if (ok) {
        deleteGroupConfig(courseId, btn.dataset.id);
        showToast('Gruppen-Setup gelöscht', 'info');
        renderSavedConfigs(courseId);
      }
    });
  });
}

// Override initial render entrypoint to run bindings properly
export function initGeneratorPage(container) {
  renderGeneratorView(container);
  setupGeneratorCore(container);
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function printGroups(courseName, configName, groups, course) {
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Gruppenliste - ${escHtml(configName)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
          h1 { margin-bottom: 4px; font-size: 1.6rem; color: #0f172a; }
          h2 { font-size: 1rem; color: #64748b; margin-top: 0; margin-bottom: 28px; font-weight: 500; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
          .group-card { border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 18px; page-break-inside: avoid; background: #fff; }
          .group-title { font-weight: 700; font-size: 1.1rem; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px; color: #0f172a; }
          .member-list { list-style: none; padding: 0; margin: 0; }
          .member-item { padding: 6px 0; font-size: 0.92rem; border-bottom: 1px dashed #e2e8f0; color: #334155; }
          .member-item:last-child { border-bottom: none; }
          .notes-area { margin-top: 18px; border-top: 1px dashed #cbd5e1; padding-top: 8px; font-size: 0.78rem; color: #64748b; min-height: 80px; }
          @media print {
            body { padding: 0; }
            .group-card { border-color: #94a3b8; }
          }
        </style>
      </head>
      <body>
        <h1>👥 Gruppenliste: ${escHtml(configName)}</h1>
        <h2>Kurs: ${escHtml(courseName)} · Erstellt: ${new Date().toLocaleDateString('de-AT')}</h2>
        <div class="grid">
          ${groups.map(g => `
            <div class="group-card">
              <div class="group-title">${escHtml(g.name)}</div>
              <ul class="member-list">
                ${g.memberIds.map(sid => {
                  const s = course.students.find(x => x.id === sid);
                  if (!s) return '';
                  return `<li class="member-item">${escHtml(s.lastName)}, ${escHtml(s.firstName)}</li>`;
                }).join('')}
              </ul>
              <div class="notes-area">Notizen / Aufgabenverteilung / Bewertung:</div>
            </div>
          `).join('')}
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
