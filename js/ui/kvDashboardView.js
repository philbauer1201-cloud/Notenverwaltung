import { getKVClasses, createKVClass, deleteKVClass } from '../db.js';
import { navigate, showModal, closeModal, showToast, confirm } from '../app.js';

export function renderKVDashboard(container) {
  document.getElementById('topbar-breadcrumb').innerHTML = `<strong>KV-Klassen (Checklisten)</strong>`;
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" id="btn-new-kvclass">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Neue KV-Klasse
    </button>
  `;

  const classes = getKVClasses();

  if (classes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5; margin-bottom:16px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <h3>Klassenvorstand-Bereich</h3>
        <p>Erstellen Sie eine KV-Klasse, um Checklisten (z.B. Kopiergeld, Entschuldigungen) und Schülerprotokolle zu verwalten.</p>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="section-title">Meine KV-Klassen</div>
      <div class="grid-auto">
        ${classes.map(c => `
          <div class="card card-hover" style="display:flex; flex-direction:column; justify-content:space-between;" data-id="${c.id}">
            <div>
              <h3 style="margin:0 0 4px 0">${escHtml(c.name)}</h3>
              <div class="text-sm text-muted">${c.studentIds?.length || 0} Schüler</div>
            </div>
            <div style="margin-top: 16px; display:flex; gap:8px;">
              <button class="btn btn-primary btn-sm btn-open-kv" style="flex:1" data-id="${c.id}">Öffnen</button>
              <button class="btn btn-ghost btn-sm btn-delete-kv" data-id="${c.id}" data-name="${escHtml(c.name)}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.btn-open-kv').forEach(btn => {
      btn.addEventListener('click', () => navigate('kv_class', { courseId: btn.dataset.id }));
    });
    container.querySelectorAll('.btn-delete-kv').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await confirm(`Klasse "${btn.dataset.name}" wirklich löschen?`)) {
          deleteKVClass(btn.dataset.id);
          renderKVDashboard(container);
          showToast('Klasse gelöscht', 'info');
        }
      });
    });
  }

  document.getElementById('btn-new-kvclass')?.addEventListener('click', () => {
    showModal('Neue KV-Klasse', `
      <div class="form-group">
        <label class="form-label">Name der Klasse</label>
        <input type="text" id="kv-name" placeholder="z.B. 1A" autofocus>
      </div>
    `, [
      { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
      { label: 'Erstellen', cls: 'btn-primary', onClick: () => {
          const name = document.getElementById('kv-name').value.trim();
          if (!name) return showToast('Bitte Namen eingeben', 'error');
          const kv = createKVClass(name);
          closeModal();
          showToast('Klasse erstellt', 'success');
          navigate('kv_class', { courseId: kv.id });
      }}
    ]);
  });
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
