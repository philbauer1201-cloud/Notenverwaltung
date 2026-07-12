import { getKVClasses, createKVClass, deleteKVClass, getKVStudents, calculateAge, isEigenberechtigt } from '../db.js';
import { navigate, showModal, closeModal, showToast, confirm } from '../app.js';

const DOC_KEYS = ['kaliumJodid','stammblatt','foto','lehrvertrag','geburtsurkunde','unterschriftenLeitfaden','zeugnis','dsgvo','jugendNetzticket'];

export function renderKVDashboard(container) {
  document.getElementById('topbar-breadcrumb').innerHTML = `<strong>Klassenvorstand</strong>`;
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" id="btn-new-kvclass">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Neue KV-Klasse
    </button>`;

  const classes = getKVClasses();

  if (classes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4;margin-bottom:2rem;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <h3>Kein Klassenvorstand-Bereich</h3>
        <p>Erstellen Sie eine KV-Klasse, um Schülerdaten, Dokumente und Finanzen zu verwalten.</p>
        <button class="btn btn-primary" id="btn-new-kvclass-empty" style="margin-top:1.6rem;">Erste KV-Klasse erstellen</button>
      </div>`;
    document.getElementById('btn-new-kvclass-empty')?.addEventListener('click', () => showCreateModal(container));
  } else {
    // Compute stats per class
    const classStats = classes.map(c => {
      const students = getKVStudents(c.id);
      const offeneDocs = students.filter(s => DOC_KEYS.some(k => (s.dokumente||{})[k]===0)).length;
      const offeneZahlung = students.filter(s => (s.schulgeldBar||0)+(s.schulgeldKarte||0)===0).length;
      const avgPct = students.length
        ? Math.round(students.reduce((sum,s) => sum + Math.round(DOC_KEYS.filter(k=>(s.dokumente||{})[k]===1||(s.dokumente||{})[k]===2).length/DOC_KEYS.length*100), 0) / students.length)
        : 0;
      return { ...c, students, offeneDocs, offeneZahlung, avgPct };
    });

    container.innerHTML = `
      <div class="page-anim">
        <div class="section-title">Meine KV-Klassen</div>
        <div class="grid-auto">
          ${classStats.map(c => `
            <div class="card card-hover kv-class-card" data-id="${c.id}" style="cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1.2rem;">
                  <h3 style="margin:0;">${escHtml(c.name)}</h3>
                  <span class="chip">${c.students.length} Schüler</span>
                </div>

                <div style="margin-bottom:1.6rem;">
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
                    <span style="font-size:1.25rem;color:var(--text-muted);">Ø Dokumente</span>
                    <span style="font-size:1.25rem;font-weight:600;">${c.avgPct}%</span>
                  </div>
                  <div class="progress-bar" style="height:0.5rem;">
                    <div class="progress-bar-fill" style="width:${c.avgPct}%;background:${c.avgPct===100?'var(--grade-1)':c.avgPct>=60?'var(--grade-3)':'var(--grade-5)'};"></div>
                  </div>
                </div>

                <div style="display:flex;gap:1.6rem;font-size:1.25rem;">
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <span style="color:${c.offeneDocs>0?'var(--grade-5)':'var(--grade-1)'};">⚠</span>
                    <span style="color:var(--text-muted);">Fehlende Docs: <strong style="color:var(--text-primary);">${c.offeneDocs}</strong></span>
                  </div>
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <span style="color:${c.offeneZahlung>0?'var(--grade-5)':'var(--grade-1)'};">💶</span>
                    <span style="color:var(--text-muted);">Offene Zahlung: <strong style="color:var(--text-primary);">${c.offeneZahlung}</strong></span>
                  </div>
                </div>
              </div>

              <div style="margin-top:1.6rem;display:flex;gap:0.8rem;">
                <button class="btn btn-primary btn-sm btn-open-kv" style="flex:1;" data-id="${c.id}">Öffnen</button>
                <button class="btn btn-ghost btn-sm btn-delete-kv" data-id="${c.id}" data-name="${escHtml(c.name)}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;

    container.querySelectorAll('.btn-open-kv').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); navigate('kv_class', { courseId: btn.dataset.id }); });
    });
    container.querySelectorAll('.kv-class-card').forEach(card => {
      card.addEventListener('click', () => navigate('kv_class', { courseId: card.dataset.id }));
    });
    container.querySelectorAll('.btn-delete-kv').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (await confirm(`Klasse "${btn.dataset.name}" wirklich löschen? Alle KV-Daten gehen verloren.`)) {
          deleteKVClass(btn.dataset.id);
          renderKVDashboard(container);
          showToast('Klasse gelöscht', 'info');
        }
      });
    });
  }

  document.getElementById('btn-new-kvclass')?.addEventListener('click', () => showCreateModal(container));
}

function showCreateModal(container) {
  showModal('Neue KV-Klasse', `
    <div class="form-group">
      <label class="form-label">Name der Klasse</label>
      <input type="text" id="kv-name" placeholder="z.B. 1A" autofocus>
    </div>`, [
    { label: 'Abbrechen', cls: 'btn-ghost', onClick: closeModal },
    { label: 'Erstellen', cls: 'btn-primary', onClick: () => {
      const name = document.getElementById('kv-name').value.trim();
      if (!name) return showToast('Bitte Namen eingeben', 'error');
      const kv = createKVClass(name);
      closeModal();
      showToast('Klasse erstellt', 'success');
      navigate('kv_class', { courseId: kv.id });
    }}
  ]);
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

