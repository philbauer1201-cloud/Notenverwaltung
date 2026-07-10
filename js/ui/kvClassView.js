import { getKVClass, getCourses, addStudentToKVClass, removeStudentFromKVClass, createKVChecklist, toggleKVChecklistTick, deleteKVChecklist, getGlobalStudents, createStudent } from '../db.js';
import { navigate, showModal, closeModal, showToast, confirm } from '../app.js';

export function renderKVClassView(container, kvId) {
  const kv = getKVClass(kvId);
  if (!kv) {
    container.innerHTML = '<div class="empty-state"><h3>Klasse nicht gefunden</h3></div>';
    return;
  }

  document.getElementById('topbar-breadcrumb').innerHTML = `
    <a href="#kv_dashboard" class="text-secondary">KV-Klassen</a>
    <span class="sep">›</span>
    <strong>${escHtml(kv.name)}</strong>
  `;

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-ghost btn-sm" id="tb-kv-import-course">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
      Aus Kurs übernehmen
    </button>
    <button class="btn btn-ghost btn-sm" id="tb-kv-create-student">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      Schüler neu anlegen
    </button>
    <button class="btn btn-primary btn-sm" id="tb-kv-new-checklist">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Neue Checkliste
    </button>
  `;

  renderMatrix(container, kv);
  attachEvents(container, kv);
}

function attachEvents(container, kv) {
  // ── Neue Checkliste ───────────────────────────────────────────
  document.getElementById('tb-kv-new-checklist')?.addEventListener('click', () => {
    showModal('Neue Checkliste anlegen', `
      <div class="form-group">
        <label class="form-label">Titel der Checkliste</label>
        <input type="text" id="cl-title" placeholder="z.B. Kopiergeld, Elternheft unterschrieben, …" autofocus>
      </div>
    `, [
      { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
      { label: 'Erstellen', cls: 'btn-primary', onClick: () => {
        const t = document.getElementById('cl-title').value.trim();
        if (!t) { showToast('Bitte einen Titel eingeben', 'error'); return; }
        createKVChecklist(kv.id, t);
        closeModal();
        showToast(`Checkliste "${t}" erstellt`, 'success');
        renderKVClassView(container, kv.id);
      }}
    ]);
  });

  // ── Aus Kurs übernehmen ───────────────────────────────────────
  document.getElementById('tb-kv-import-course')?.addEventListener('click', () => {
    const courses = getCourses();
    if (courses.length === 0) {
      showToast('Keine Fach-Kurse vorhanden. Bitte zuerst einen Kurs mit Schülern anlegen.', 'info');
      return;
    }
    const options = courses.map(c => `<option value="${c.id}">${escHtml(c.name)} (${c.students?.length || 0} Schüler)</option>`).join('');
    showModal('Schüler aus Kurs übernehmen', `
      <p class="text-sm text-muted" style="margin-bottom:12px;">Alle Schüler des gewählten Kurses werden in diese KV-Klasse importiert.</p>
      <div class="form-group">
        <label class="form-label">Fach-Kurs wählen</label>
        <select id="import-course-id">${options}</select>
      </div>
    `, [
      { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
      { label: 'Importieren', cls: 'btn-primary', onClick: () => {
        const cid = document.getElementById('import-course-id').value;
        const course = getCourses().find(c => c.id === cid);
        if (course) {
          let added = 0;
          (course.studentIds || []).forEach(sid => {
            if (!(kv.studentIds || []).includes(sid)) {
              addStudentToKVClass(kv.id, sid);
              added++;
            }
          });
          showToast(added > 0 ? `${added} Schüler importiert` : 'Alle Schüler waren bereits in der KV-Klasse', added > 0 ? 'success' : 'info');
        }
        closeModal();
        renderKVClassView(container, kv.id);
      }}
    ]);
  });

  // ── Neuen Schüler direkt anlegen ──────────────────────────────
  document.getElementById('tb-kv-create-student')?.addEventListener('click', () => {
    showModal('Neuen Schüler anlegen', `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Vorname</label>
          <input type="text" id="inp-kv-fn" placeholder="z.B. Max" autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Nachname</label>
          <input type="text" id="inp-kv-ln" placeholder="z.B. Mustermann">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Geburtsdatum (optional)</label>
        <input type="date" id="inp-kv-bd">
      </div>
    `, [
      { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
      { label: 'Anlegen & zuweisen', cls: 'btn-primary', onClick: () => {
        const fn = document.getElementById('inp-kv-fn').value.trim();
        const ln = document.getElementById('inp-kv-ln').value.trim();
        const bd = document.getElementById('inp-kv-bd').value;
        if (!fn || !ln) { showToast('Vor- und Nachname erforderlich', 'error'); return; }
        const s = createStudent(null, { firstName: fn, lastName: ln, birthDate: bd || null });
        addStudentToKVClass(kv.id, s.id);
        closeModal();
        showToast(`${fn} ${ln} angelegt und zugewiesen`, 'success');
        renderKVClassView(container, kv.id);
      }}
    ]);
  });

  // ── Matrix-Events (Checklisten-Haken & Löschen) ───────────────
  container.querySelectorAll('.btn-tick').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleKVChecklistTick(kv.id, btn.dataset.clid, btn.dataset.sid);
      const checked = btn.classList.toggle('checked');
      btn.style.borderColor = checked ? 'var(--primary)' : 'var(--border)';
      btn.style.background = checked ? 'rgba(99,102,241,0.15)' : 'transparent';
    });
  });

  container.querySelectorAll('.btn-del-checklist').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (await confirm(`Checkliste "${btn.dataset.name}" wirklich löschen?`)) {
        deleteKVChecklist(kv.id, btn.dataset.id);
        showToast('Checkliste gelöscht', 'info');
        renderKVClassView(container, kv.id);
      }
    });
  });

  container.querySelectorAll('.btn-rm-student').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (await confirm(`"${btn.dataset.name}" aus der KV-Klasse entfernen?`)) {
        removeStudentFromKVClass(kv.id, btn.dataset.id);
        renderKVClassView(container, kv.id);
      }
    });
  });
}

function renderMatrix(container, kv) {
  const students = (kv.students || []).slice().sort((a, b) => a.lastName.localeCompare(b.lastName));
  const checklists = kv.checklists || [];

  // ── Leer-Zustand ─────────────────────────────────────────────
  if (students.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 80px 24px;">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4; margin-bottom:20px; display:block; margin-left:auto; margin-right:auto;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <h3 style="margin-bottom:8px; font-size:1.2rem;">Noch keine Schüler in dieser KV-Klasse</h3>
        <p style="color:var(--text-muted); margin-bottom:24px;">Fügen Sie Schüler hinzu, um die Checklisten-Matrix zu nutzen.</p>
        <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
          <button class="btn btn-primary" id="empty-btn-import">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Aus Kurs übernehmen
          </button>
          <button class="btn btn-ghost" id="empty-btn-create">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            Schüler neu anlegen
          </button>
        </div>
      </div>
    `;
    container.querySelector('#empty-btn-import')?.addEventListener('click', () => {
      document.getElementById('tb-kv-import-course')?.click();
    });
    container.querySelector('#empty-btn-create')?.addEventListener('click', () => {
      document.getElementById('tb-kv-create-student')?.click();
    });
    return;
  }

  // ── Matrix-Tabelle ────────────────────────────────────────────
  container.innerHTML = `
    <div class="section-title" style="margin-bottom:16px;">
      Checklisten-Matrix
      <span class="label-count">${checklists.length} Checklisten · ${students.length} Schüler</span>
    </div>
    ${checklists.length === 0 ? `
      <div class="card" style="text-align:center; padding:32px; margin-bottom:24px; border-style:dashed; background:transparent;">
        <p style="color:var(--text-muted); margin:0 0 12px 0;">Noch keine Checklisten angelegt.</p>
        <button class="btn btn-primary btn-sm" id="inline-btn-new-cl">+ Checkliste erstellen (z.B. Kopiergeld)</button>
      </div>
    ` : ''}
    <div class="table-wrapper" style="overflow-x:auto;">
      <table class="data-table" style="min-width:500px;">
        <thead>
          <tr>
            <th style="width:220px; position:sticky; left:0; z-index:2; background:var(--surface);">Schüler</th>
            ${checklists.map(cl => `
              <th class="col-center" style="min-width:110px;">
                <div style="font-size:0.82rem; font-weight:600; margin-bottom:6px;">${escHtml(cl.title)}</div>
                <button class="btn btn-ghost btn-sm btn-del-checklist" 
                  data-id="${cl.id}" data-name="${escHtml(cl.title)}"
                  style="font-size:0.7rem; padding:2px 6px; opacity:0.5;">
                  ✕ Löschen
                </button>
              </th>
            `).join('')}
            <th style="width:50px;"></th>
          </tr>
        </thead>
        <tbody>
          ${students.map(s => `
            <tr>
              <td style="font-weight:600; position:sticky; left:0; z-index:1; background:var(--surface);">
                ${escHtml(s.lastName)}, ${escHtml(s.firstName)}
              </td>
              ${checklists.map(cl => {
                const checked = (cl.ticks || []).includes(s.id);
                return `
                  <td class="col-center">
                    <button class="btn-tick${checked ? ' checked' : ''}" 
                      data-clid="${cl.id}" data-sid="${s.id}"
                      title="${checked ? 'Erledigt – klicken zum Rückgängig machen' : 'Noch offen – klicken zum Abhaken'}"
                      style="
                        width:32px; height:32px; border-radius:6px; cursor:pointer;
                        border: 2px solid ${checked ? 'var(--primary)' : 'var(--border)'};
                        background: ${checked ? 'rgba(99,102,241,0.15)' : 'transparent'};
                        display:inline-flex; align-items:center; justify-content:center;
                        transition:all 0.15s; font-size:16px;">
                      ${checked ? '✓' : ''}
                    </button>
                  </td>
                `;
              }).join('')}
              <td class="col-actions">
                <button class="btn btn-ghost btn-sm btn-rm-student" 
                  data-id="${s.id}" data-name="${escHtml(s.firstName)} ${escHtml(s.lastName)}"
                  title="Schüler aus KV-Klasse entfernen">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Inline-Button für erste Checkliste
  container.querySelector('#inline-btn-new-cl')?.addEventListener('click', () => {
    document.getElementById('tb-kv-new-checklist')?.click();
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
