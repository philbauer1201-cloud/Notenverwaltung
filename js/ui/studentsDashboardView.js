import { getGlobalStudents, updateStudent } from '../db.js';
import { navigate, showModal, closeModal, showToast } from '../app.js';

export function renderStudentsDashboard(container) {
  document.getElementById('topbar-breadcrumb').innerHTML = `<strong>Zentrale Schüler-Datenbank</strong>`;
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" id="btn-global-new-student">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      Schüler anlegen
    </button>
  `;

  const students = getGlobalStudents() || [];

  if (students.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.5; margin-bottom:16px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <h3>Datenbank ist leer</h3>
        <p>Sie haben noch keine Schüler im System angelegt. Fügen Sie Schüler hier oder in Ihren Fach-Kursen hinzu.</p>
        <button class="btn btn-primary mt-4" id="empty-global-new-student">Schüler anlegen</button>
      </div>
    `;
    container.querySelector('#empty-global-new-student')?.addEventListener('click', () => {
      document.getElementById('btn-global-new-student').click();
    });
  } else {
    // Sort by last name
    students.sort((a,b) => a.lastName.localeCompare(b.lastName));

    container.innerHTML = `
      <div class="section-title">Alle Schüler <span class="label-count">${students.length}</span></div>
      <div class="table-wrapper">
        <table class="data-table mobile-cards">
          <thead>
            <tr>
              <th style="width:250px">Name</th>
              <th>Geburtsdatum</th>
              <th>IBA-Status</th>
              <th>Zusatzinfos</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            ${students.map(s => `
              <tr>
                <td data-label="Name" style="font-weight:600">${escHtml(s.lastName)}, ${escHtml(s.firstName)}</td>
                <td data-label="Geburtsdatum">${s.birthDate ? formatDateShort(s.birthDate) : '–'}</td>
                <td data-label="IBA-Status">
                  ${s.ibaStatus && s.ibaStatus !== 'none' ? `<span class="badge" style="background:var(--warning-light); color:var(--warning);">${escHtml(s.ibaStatus)}</span>` : '–'}
                </td>
                <td data-label="Zusatzinfos">
                  <div class="text-sm text-muted">
                    ${[s.info1, s.info2, s.info3, s.ibaComment].filter(Boolean).map(escHtml).join(', ') || '–'}
                  </div>
                </td>
                <td data-label="Aktionen" class="col-actions">
                  <button class="btn btn-ghost btn-sm btn-edit-global" data-id="${s.id}">Bearbeiten</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.btn-edit-global').forEach(btn => {
      btn.addEventListener('click', () => {
        const student = students.find(s => s.id === btn.dataset.id);
        if (student) showEditStudentGlobalModal(student, () => renderStudentsDashboard(container));
      });
    });
  }

  document.getElementById('btn-global-new-student')?.addEventListener('click', () => {
    showModal('Neuen Schüler anlegen', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Vorname</label><input type="text" id="g-firstname" autofocus></div>
        <div class="form-group"><label class="form-label">Nachname</label><input type="text" id="g-lastname"></div>
      </div>
    `, [
      { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
      { label: 'Anlegen', cls: 'btn-primary', onClick: async () => {
        const fn = document.getElementById('g-firstname').value.trim();
        const ln = document.getElementById('g-lastname').value.trim();
        if (!fn || !ln) return showToast('Name fehlt', 'error');
        const { createStudent } = await import('../db.js');
        createStudent(null, { firstName: fn, lastName: ln });
        closeModal();
        showToast('Schüler in Datenbank angelegt', 'success');
        renderStudentsDashboard(container);
      }}
    ]);
  });
}

function showEditStudentGlobalModal(student, onDone) {
  const ibaOptions = ['none', '§8b1_N', '§8b2_N', '§8b2_G'];
  const ibaLabels = { 'none': 'Kein IBA-Status', '§8b1_N': '§8b1_N', '§8b2_N': '§8b2_N', '§8b2_G': '§8b2_G' };

  showModal(`Bearbeiten: ${escHtml(student.firstName)} ${escHtml(student.lastName)}`, `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Vorname</label><input type="text" id="e-fn" value="${escHtml(student.firstName)}"></div>
      <div class="form-group"><label class="form-label">Nachname</label><input type="text" id="e-ln" value="${escHtml(student.lastName)}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Geburtsdatum</label><input type="date" id="e-bd" value="${student.birthDate || ''}"></div>
      <div class="form-group"><label class="form-label">IBA-Status</label>
        <select id="e-iba">${ibaOptions.map(opt => `<option value="${opt}" ${student.ibaStatus === opt ? 'selected' : ''}>${ibaLabels[opt]}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">IBA Kommentar</label><input type="text" id="e-ibac" value="${escHtml(student.ibaComment || '')}"></div>
    <div class="section-title text-sm mt-4">Zusatzinformationen</div>
    <div class="form-group"><input type="text" id="e-i1" value="${escHtml(student.info1 || '')}" placeholder="Zusatzinfo 1"></div>
    <div class="form-group"><input type="text" id="e-i2" value="${escHtml(student.info2 || '')}" placeholder="Zusatzinfo 2"></div>
    <div class="form-group"><input type="text" id="e-i3" value="${escHtml(student.info3 || '')}" placeholder="Zusatzinfo 3"></div>
  `, [
    { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
    { label: 'Speichern', cls: 'btn-primary', onClick: () => {
        updateStudent(student.id, {
          firstName: document.getElementById('e-fn').value.trim(),
          lastName: document.getElementById('e-ln').value.trim(),
          birthDate: document.getElementById('e-bd').value || null,
          ibaStatus: document.getElementById('e-iba').value,
          ibaComment: document.getElementById('e-ibac').value.trim(),
          info1: document.getElementById('e-i1').value.trim(),
          info2: document.getElementById('e-i2').value.trim(),
          info3: document.getElementById('e-i3').value.trim(),
        });
        closeModal();
        showToast('Gespeichert', 'success');
        onDone();
    }}
  ]);
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDateShort(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`; }
