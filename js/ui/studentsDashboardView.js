import { getGlobalStudents, updateStudent, getKVClasses, addStudentToKVClass, removeStudentFromKVClass, createStudent, getCourses, assignStudentToCourse, removeStudentFromCourse } from '../db.js';
import { navigate, showModal, closeModal, showToast } from '../app.js';

export function renderStudentsDashboard(container) {
  document.getElementById('topbar-breadcrumb').innerHTML = `<strong>Zentrale Schüler-Datenbank</strong>`;
  document.getElementById('topbar-actions').innerHTML = `
    <input type="file" id="global-csv-file" accept=".csv" style="display:none;">
    <button class="btn btn-ghost btn-sm" id="btn-global-csv-import" style="color:var(--accent); margin-right: 0.8rem;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.4rem; vertical-align: middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Aus CSV importieren
    </button>
    <button class="btn btn-primary btn-sm" id="btn-global-new-student">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      Schüler anlegen
    </button>
  `;

  // Attach CSV import events
  const fileInput = document.getElementById("global-csv-file");
  document.getElementById("btn-global-csv-import")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(evt) {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) return showToast("CSV ist leer oder hat keine Kopfzeile.", "error");

        const parseCSVLine = (line) => {
          const result = [];
          let current = "";
          let inQuotes = false;
          const delimiter = line.includes(";") ? ";" : ",";
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === delimiter && !inQuotes) { result.push(current.trim()); current = ""; }
            else current += char;
          }
          result.push(current.trim());
          return result;
        };

        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/["']/g, ""));
        const idxNachname = headers.findIndex(h => h.includes("nachname"));
        const idxVorname = headers.findIndex(h => h.includes("vorname"));
        const idxMail = headers.findIndex(h => h.includes("mail"));

        if (idxNachname === -1 || idxVorname === -1) {
          return showToast("Spalten 'Nachname' und 'Vorname' wurden nicht gefunden.", "error");
        }

        let newCount = 0;
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          if (values.length < Math.max(idxNachname, idxVorname) + 1) continue;
          const nn = values[idxNachname]?.replace(/["']/g, "");
          const vn = values[idxVorname]?.replace(/["']/g, "");
          const email = idxMail !== -1 ? values[idxMail]?.replace(/["']/g, "") : "";

          if (!nn || !vn) continue;

          const exists = (getGlobalStudents() || []).some(s =>
            (s.nachname||s.lastName||"").toLowerCase() === nn.toLowerCase() &&
            (s.vorname||s.firstName||"").toLowerCase() === vn.toLowerCase()
          );

          if (!exists) {
            createStudent(null, {
              nachname: nn,
              vorname: vn,
              firstName: vn,
              lastName: nn,
              kommentar: email ? `E-Mail: ${email}` : ""
            });
            newCount++;
          }
        }
        showToast(`${newCount} neue(r) Schüler importiert!`, "success");
        renderStudentsDashboard(container);
      } catch (err) {
        showToast("Fehler beim Importieren.", "error");
      }
    };
    reader.readAsText(file, "UTF-8");
  });

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

    const kvClasses = getKVClasses() || [];
    const courses = getCourses() || [];




    // Helper to find which KV class a student belongs to
    const findStudentKVClass = (studentId) => {
      return kvClasses.find(c => (c.studentIds || []).includes(studentId));
    };

    // Helper to find which Courses a student belongs to
    const findStudentCourses = (studentId) => {
      return courses.filter(c => (c.studentIds || []).includes(studentId));
    };

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.6rem;flex-wrap:wrap;gap:1rem;">
        <div class="section-title" style="margin:0;">Alle Schüler <span class="label-count">${students.length}</span></div>
        <div style="display:flex;gap:0.8rem;" id="bulk-actions-container">
          <button class="btn btn-ghost btn-sm" id="btn-bulk-assign" style="display:none;color:var(--accent);border:1px solid var(--accent);">
            📂 Klassen zuweisen (<span id="bulk-select-count">0</span>)
          </button>
        </div>
      </div>
      <div class="table-wrapper">
        <table class="data-table mobile-cards">
          <thead>
            <tr>
              <th style="width:40px;text-align:center;">
                <input type="checkbox" id="select-all-students" style="width:1.8rem;height:1.8rem;cursor:pointer;">
              </th>
              <th style="width:250px">Name</th>
              <th>Geburtsdatum</th>
              <th>Zuweisung</th>
              <th>IBA-Status</th>
              <th>Zusatzinfos</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            ${students.map(s => {
              const assignedKV = findStudentKVClass(s.id);
              const assignedCourses = findStudentCourses(s.id);
              const labelParts = [];
              if (assignedKV) labelParts.push(`KV: ${assignedKV.name}`);
              if (assignedCourses.length) labelParts.push(`Kurse (${assignedCourses.length})`);
              const assignLabel = labelParts.length ? labelParts.join(" | ") : "+ Zuweisen";
              
              return `
              <tr>
                <td style="text-align:center;" data-label="Auswählen">
                  <input type="checkbox" class="student-select-checkbox" data-id="${s.id}" style="width:1.8rem;height:1.8rem;cursor:pointer;">
                </td>
                <td data-label="Name" style="font-weight:600">${escHtml(s.lastName)}, ${escHtml(s.firstName)}</td>
                <td data-label="Geburtsdatum">${s.birthDate ? formatDateShort(s.birthDate) : '–'}</td>
                <td data-label="Zuweisung">
                  <button class="btn btn-sm btn-ghost btn-assign-class-quick" data-id="${s.id}" data-name="${escHtml(s.firstName)} ${escHtml(s.lastName)}" style="color:${labelParts.length?'var(--accent)':'var(--text-muted)'}; border: 1px dashed ${labelParts.length?'var(--accent)':'var(--border)'}; font-weight:600; padding:0.4rem 0.8rem;">
                    ${assignLabel}
                  </button>
                </td>
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
            `}).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Bulk selection handler
    const selectAllCb = container.querySelector("#select-all-students");
    const rowCheckboxes = container.querySelectorAll(".student-select-checkbox");
    const bulkAssignBtn = container.querySelector("#btn-bulk-assign");
    const bulkCountSpan = container.querySelector("#bulk-select-count");

    const updateBulkButtonState = () => {
      const checked = [...rowCheckboxes].filter(cb => cb.checked);
      if (checked.length > 0) {
        bulkAssignBtn.style.display = "inline-flex";
        bulkCountSpan.textContent = checked.length;
      } else {
        bulkAssignBtn.style.display = "none";
      }
    };

    selectAllCb?.addEventListener("change", () => {
      rowCheckboxes.forEach(cb => cb.checked = selectAllCb.checked);
      updateBulkButtonState();
    });

    rowCheckboxes.forEach(cb => {
      cb.addEventListener("change", () => {
        updateBulkButtonState();
        if (!cb.checked && selectAllCb) selectAllCb.checked = false;
      });
    });

    // Bulk assign handler
    bulkAssignBtn?.addEventListener("click", () => {
      const selectedIds = [...rowCheckboxes].filter(cb => cb.checked).map(cb => cb.dataset.id);
      showZuweisungModal(selectedIds, `Klassen zuweisen für ${selectedIds.length} Schüler`, courses, kvClasses, () => {
        renderStudentsDashboard(container);
      });
    });

    // Individual assign class event handler
    container.querySelectorAll('.btn-assign-class-quick').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const studentId = btn.dataset.id;
        const studentName = btn.dataset.name;
        showZuweisungModal([studentId], `Zuweisung: ${studentName}`, courses, kvClasses, () => {
          renderStudentsDashboard(container);
        });
      });
    });

    // Attach listener for new student button
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
          createStudent(null, { firstName: fn, lastName: ln });
          closeModal();
          showToast('Schüler in Datenbank angelegt', 'success');
          renderStudentsDashboard(container);
        }}
      ]);
    });

    container.querySelectorAll('.btn-edit-global').forEach(btn => {
      btn.addEventListener('click', () => {
        const student = students.find(s => s.id === btn.dataset.id);
        if (student) showEditStudentGlobalModal(student, () => renderStudentsDashboard(container));
      });
    });
  }
}

// ── Universal Zuweisung Modal (Individual and Bulk) ─────────────────
function showZuweisungModal(studentIds, title, courses, kvClasses, onDone) {
  const isBulk = studentIds.length > 1;

  // For individual student, find current assignments
  let currentKV = null;
  let currentCourses = [];
  if (!isBulk) {
    const sid = studentIds[0];
    currentKV = kvClasses.find(c => (c.studentIds || []).includes(sid));
    currentCourses = courses.filter(c => (c.studentIds || []).includes(sid));
  }

  showModal(title, `
    <div style="display:flex;flex-direction:column;gap:1.8rem;">
      
      <!-- Section 1: Fach-Kurse -->
      <div>
        <div style="font-weight:700;font-size:1.3rem;margin-bottom:0.8rem;">📘 Fach-Kurse / Noten-Klassen (Mehrfachauswahl)</div>
        ${isBulk ? `
        <div style="font-size:1.2rem;color:var(--text-muted);margin-bottom:0.8rem;">
          Wähle Fach-Kurse, in die alle ausgewählten Schüler eingeschrieben werden sollen.
        </div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;max-height:20rem;overflow-y:auto;padding-right:0.4rem;">
          ${courses.length === 0 
            ? '<div style="color:var(--text-muted);padding:1rem;">Keine Fach-Kurse angelegt.</div>'
            : courses.map(c => {
                const isChecked = !isBulk && currentCourses.some(cc => cc.id === c.id);
                return `
                <label style="display:flex;align-items:center;gap:1rem;padding:0.8rem 1rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);">
                  <input type="checkbox" class="modal-assign-course-cb" value="${c.id}" ${isChecked?"checked":""} style="width:1.8rem;height:1.8rem;">
                  <div>
                    <div style="font-weight:600;font-size:1.25rem;">${escHtml(c.name)}</div>
                    <div style="font-size:1.1rem;color:var(--text-muted);">${escHtml(c.subject)}</div>
                  </div>
                </label>`;
              }).join('')}
        </div>
      </div>

      <!-- Section 2: KV Klasse -->
      <div>
        <div style="font-weight:700;font-size:1.3rem;margin-bottom:0.8rem;">📋 Klassenvorstand-Klasse (Einfachauswahl)</div>
        ${isBulk ? `
        <div style="font-size:1.2rem;color:var(--text-muted);margin-bottom:0.8rem;">
          Wähle eine KV-Klasse, der alle ausgewählten Schüler zugewiesen werden.
        </div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;max-height:20rem;overflow-y:auto;padding-right:0.4rem;">
          <label style="display:flex;align-items:center;gap:1rem;padding:0.8rem 1rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);">
            <input type="radio" name="modal-assign-kv-radio" value="none" ${(!isBulk && !currentKV) || isBulk ? "checked" : ""} style="width:1.8rem;height:1.8rem;">
            <div>
              <div style="font-weight:600;font-size:1.25rem;color:var(--text-muted);">Keine Zuweisung</div>
              <div style="font-size:1.1rem;color:var(--text-muted);">Aus KV austragen / Unverändert lassen</div>
            </div>
          </label>
          
          ${kvClasses.map(c => {
            const isChecked = !isBulk && currentKV?.id === c.id;
            return `
            <label style="display:flex;align-items:center;gap:1rem;padding:0.8rem 1rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);">
              <input type="radio" name="modal-assign-kv-radio" value="${c.id}" ${isChecked?"checked":""} style="width:1.8rem;height:1.8rem;">
              <div>
                <div style="font-weight:600;font-size:1.25rem;">${escHtml(c.name)}</div>
                <div style="font-size:1.1rem;color:var(--text-muted);">Checklisten & Protokolle</div>
              </div>
            </label>`;
          }).join('')}
        </div>
      </div>

    </div>
  `, [
    { label: "Abbrechen", cls: "btn-ghost", onClick: closeModal },
    { label: "Zuweisung speichern", cls: "btn-primary", onClick: () => {
      const selectedCourses = [...document.querySelectorAll(".modal-assign-course-cb:checked")].map(cb => cb.value);
      const selectedKV = document.querySelector("input[name='modal-assign-kv-radio']:checked")?.value;

      studentIds.forEach(sid => {
        // Handle Course membership
        if (isBulk) {
          selectedCourses.forEach(cid => assignStudentToCourse(cid, sid));
        } else {
          courses.forEach(c => {
            const shouldBeIn = selectedCourses.includes(c.id);
            const isIn = (c.studentIds || []).includes(sid);
            if (shouldBeIn && !isIn) assignStudentToCourse(c.id, sid);
            else if (!shouldBeIn && isIn) removeStudentFromCourse(c.id, sid);
          });
        }

        // Handle KV Class membership
        if (selectedKV && selectedKV !== "none") {
          kvClasses.forEach(c => removeStudentFromKVClass(c.id, sid));
          addStudentToKVClass(selectedKV, sid);
        } else if (selectedKV === "none" && !isBulk) {
          kvClasses.forEach(c => removeStudentFromKVClass(c.id, sid));
        }
      });

      closeModal();
      showToast(isBulk ? "Klassenzuweisungen aktualisiert" : "Zuweisung gespeichert", "success");
      onDone();
    }}
  ], "modal-lg");
}

function showEditStudentGlobalModal(student, onDone) {
  const ibaOptions = ['none', '§8b1_N', '§8b2_N', '§8b2_G'];
  const ibaLabels = { 'none': 'Kein IBA-Status', '§8b1_N': '§8b1_N', '§8b2_N': '§8b2_N', '§8b2_G': '§8b2_G' };

  // Fetch current lists to show options
  const kvClasses = getKVClasses() || [];
  const courses = getCourses() || [];

  const currentKV = kvClasses.find(c => (c.studentIds || []).includes(student.id));
  const currentCourses = courses.filter(c => (c.studentIds || []).includes(student.id));

  showModal(`Bearbeiten: ${escHtml(student.firstName)} ${escHtml(student.lastName)}`, `
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:2rem;max-height:60vh;overflow-y:auto;padding-right:0.8rem;">
      <div>
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
      </div>

      <!-- Right column for quick class assignments inside edit modal -->
      <div style="border-left:1px solid var(--border);padding-left:2rem;display:flex;flex-direction:column;gap:1.6rem;">
        
        <div>
          <div style="font-weight:700;font-size:1.2rem;margin-bottom:0.8rem;">📘 Fach-Kurse (Mehrfachauswahl)</div>
          <div style="display:flex;flex-direction:column;gap:0.6rem;max-height:16rem;overflow-y:auto;padding-right:0.4rem;">
            ${courses.length === 0 
              ? '<div style="color:var(--text-muted);font-size:1.1rem;">Keine Fach-Kurse angelegt.</div>'
              : courses.map(c => {
                  const isChecked = currentCourses.some(cc => cc.id === c.id);
                  return `
                  <label style="display:flex;align-items:center;gap:0.8rem;padding:0.6rem 0.8rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);font-size:1.15rem;">
                    <input type="checkbox" class="edit-modal-course-cb" value="${c.id}" ${isChecked?"checked":""} style="width:1.6rem;height:1.6rem;">
                    <span style="font-weight:600;">${escHtml(c.name)}</span>
                  </label>`;
                }).join('')}
          </div>
        </div>

        <div>
          <div style="font-weight:700;font-size:1.2rem;margin-bottom:0.8rem;">📋 Klassenvorstand-Klasse</div>
          <div style="display:flex;flex-direction:column;gap:0.6rem;max-height:16rem;overflow-y:auto;padding-right:0.4rem;">
            <label style="display:flex;align-items:center;gap:0.8rem;padding:0.6rem 0.8rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);font-size:1.15rem;">
              <input type="radio" name="edit-modal-kv-radio" value="none" ${!currentKV ? "checked" : ""} style="width:1.6rem;height:1.6rem;">
              <span style="color:var(--text-muted);">Keine KV-Klasse</span>
            </label>
            ${kvClasses.map(c => {
              const isChecked = currentKV?.id === c.id;
              return `
              <label style="display:flex;align-items:center;gap:0.8rem;padding:0.6rem 0.8rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);font-size:1.15rem;">
                <input type="radio" name="edit-modal-kv-radio" value="${c.id}" ${isChecked?"checked":""} style="width:1.6rem;height:1.6rem;">
                <span style="font-weight:600;">${escHtml(c.name)}</span>
              </label>`;
            }).join('')}
          </div>
        </div>

      </div>
    </div>
  `, [
    { label: 'Abbrechen', cls: 'btn-ghost', onClick: () => closeModal() },
    { label: 'Speichern', cls: 'btn-primary', onClick: () => {
        const sid = student.id;

        // 1. Save standard fields
        updateStudent(sid, {
          firstName: document.getElementById('e-fn').value.trim(),
          lastName: document.getElementById('e-ln').value.trim(),
          birthDate: document.getElementById('e-bd').value || null,
          ibaStatus: document.getElementById('e-iba').value,
          ibaComment: document.getElementById('e-ibac').value.trim(),
          info1: document.getElementById('e-i1').value.trim(),
          info2: document.getElementById('e-i2').value.trim(),
          info3: document.getElementById('e-i3').value.trim(),
        });

        // 2. Save Course assignments
        const selectedCourses = [...document.querySelectorAll(".edit-modal-course-cb:checked")].map(cb => cb.value);
        courses.forEach(c => {
          const shouldBeIn = selectedCourses.includes(c.id);
          const isIn = (c.studentIds || []).includes(sid);
          if (shouldBeIn && !isIn) assignStudentToCourse(c.id, sid);
          else if (!shouldBeIn && isIn) removeStudentFromCourse(c.id, sid);
        });

        // 3. Save KV class assignment
        const selectedKV = document.querySelector("input[name='edit-modal-kv-radio']:checked")?.value;
        if (selectedKV && selectedKV !== "none") {
          kvClasses.forEach(c => removeStudentFromKVClass(c.id, sid));
          addStudentToKVClass(selectedKV, sid);
        } else {
          kvClasses.forEach(c => removeStudentFromKVClass(c.id, sid));
        }

        closeModal();
        showToast('Schülerdaten & Zuweisungen gespeichert', 'success');
        onDone();
    }}
  ], "modal-lg");
}


function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDateShort(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`; }

