/**
 * kvClassView.js - KV-Klassenansicht
 * Schuelerliste mit Filter, Sortierung, Bulk-Actions, Zuordnung/Verschieben
 */
import {
  getKVClass, getKVClasses, getKVStudents, updateStudent,
  assignStudentToKVClass, unassignStudentFromKVClass, moveStudentToKVClass,
  getGlobalStudents, createStudent, calculateAge, isEigenberechtigt
} from "../db.js";
import { navigate, showModal, closeModal, showToast, confirm } from "../app.js";

const DOC_LABELS = {
  kaliumJodid:             "Kalium-Jodid",
  stammblatt:              "Stammblatt",
  foto:                    "Foto",
  lehrvertrag:             "Lehrvertrag",
  geburtsurkunde:          "Geburtsurkunde",
  unterschriftenLeitfaden: "Unterschriften Leitfaden",
  zeugnis:                 "Zeugnis",
  dsgvo:                   "DSGVO",
  jugendNetzticket:        "Jugend-Netzticket"
};
const DOC_KEYS = Object.keys(DOC_LABELS);

function escHtml(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function docProgress(student) {
  const docs = student.dokumente || {};
  const erledigt = DOC_KEYS.filter(k => docs[k] === 1 || docs[k] === 2).length;
  return { erledigt, total: DOC_KEYS.length, pct: Math.round(erledigt / DOC_KEYS.length * 100) };
}

function progressBar(pct, erledigt, total) {
  const color = pct === 100 ? "var(--grade-1)" : pct >= 60 ? "var(--grade-3)" : "var(--grade-5)";
  return `<div style="display:flex;align-items:center;gap:0.8rem;">
    <div class="progress-bar" style="flex:1;height:0.6rem;">
      <div class="progress-bar-fill" style="width:${pct}%;background:${color};"></div>
    </div>
    ${total !== "" ? `<span style="font-size:1.2rem;color:var(--text-muted);white-space:nowrap;">${erledigt}/${total}</span>` : ""}
  </div>`;
}

export function renderKVClassView(container, kvId) {
  const kv = getKVClass(kvId);
  if (!kv) { container.innerHTML = "<div class='empty-state'><h3>Klasse nicht gefunden</h3></div>"; return; }
  document.getElementById("topbar-breadcrumb").innerHTML =
    `<a href="#kv_dashboard" style="color:var(--text-secondary);text-decoration:none;">KV-Klassen</a>
     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
     <strong>${escHtml(kv.name)}</strong>`;
  document.getElementById("topbar-actions").innerHTML = `
    <button class="btn btn-ghost btn-sm" id="btn-kv-print">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Drucken
    </button>
    <button class="btn btn-ghost btn-sm" id="btn-kv-csv">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      CSV
    </button>
    <button class="btn btn-primary btn-sm" id="btn-assign-student">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Schueler zuordnen
    </button>`;
  renderContent(container, kvId, { filter: "all", sort: "name", search: "" });
  document.getElementById("btn-assign-student")?.addEventListener("click", () => showAssignModal(kvId, container));
}

function renderContent(container, kvId, state) {
  const kv = getKVClass(kvId);
  let students = getKVStudents(kvId);

  // Initialize state filters if undefined
  if (!state.financeFilter) state.financeFilter = "all";
  if (!state.docFilterObj) state.docFilterObj = {}; // e.g. { kaliumJodid: 'open', stammblatt: 'done' }
  if (!state.generalFilter) state.generalFilter = "all"; // all, raucher, u18, ue18

  // Search filter
  if (state.search) {
    const q = state.search.toLowerCase();
    students = students.filter(s => ((s.nachname||s.lastName||"")+" "+(s.vorname||s.firstName||"")).toLowerCase().includes(q));
  }

  // Finance filter
  switch(state.financeFilter) {
    case "open_payment":
      students = students.filter(s => (s.schulgeldBar||0)+(s.schulgeldKarte||0)===0);
      break;
    case "paid_payment":
      students = students.filter(s => (s.schulgeldBar||0)+(s.schulgeldKarte||0)>0);
      break;
    case "schloss_paid":
      students = students.filter(s => s.schlossBezahlt);
      break;
    case "schloss_open":
      students = students.filter(s => !s.schlossBezahlt);
      break;
  }

  // General state filters
  switch(state.generalFilter) {
    case "raucher": students = students.filter(s => s.raucher); break;
    case "u18":     students = students.filter(s => !isEigenberechtigt(s.geburtsdatum)); break;
    case "ue18":    students = students.filter(s => isEigenberechtigt(s.geburtsdatum)); break;
  }

  // Checkbox-based Document checklist multi-filter (OR logic)
  const activeFilters = Object.keys(state.docFilterObj).filter(k => !!state.docFilterObj[k]);
  if (activeFilters.length > 0) {
    const mode = state.docFilterMode || "open"; // "open" or "done"
    students = students.filter(s => {
      // Check if at least one of the active filters matches this student
      return activeFilters.some(key => {
        const val = (s.dokumente||{})[key] || 0;
        if (mode === "done") {
          return val === 1 || val === 2; // Erledigt or Nicht erforderlich
        } else {
          return val === 0; // Offen
        }
      });
    });
  }

  students = [...students].sort((a,b) => state.sort==="spind" ? (a.spindNr||999)-(b.spindNr||999)
    : ((a.nachname||a.lastName)+(a.vorname||a.firstName)).localeCompare((b.nachname||b.lastName)+(b.vorname||b.firstName),"de"));

  // Store filtered students on container so topbar export buttons can access them
  container._kvFilteredStudents = students;
  container._kvState = state;
  container._kvId = kvId;

  const all = getKVStudents(kvId);
  const offeneDocs = all.filter(s => DOC_KEYS.some(k => (s.dokumente||{})[k]===0)).length;
  const offeneZahlung = all.filter(s => (s.schulgeldBar||0)+(s.schulgeldKarte||0)===0).length;
  const avgPct = all.length ? Math.round(all.reduce((sum,s)=>sum+docProgress(s).pct,0)/all.length) : 0;

  const activeDocCount = Object.keys(state.docFilterObj).filter(k => state.docFilterObj[k] !== "all").length;
  const isFiltered = state.financeFilter !== "all" || state.generalFilter !== "all" || activeDocCount > 0 || state.search;
  const filterLabel = state.search ? `Suche: "${state.search}"` : "Aktive Filter";

  // Update topbar export buttons label
  document.getElementById("btn-kv-print")?.setAttribute("title",
    isFiltered ? `Drucken: ${students.length} Schueler` : `Drucken: alle ${all.length} Schueler`);
  document.getElementById("btn-kv-csv")?.setAttribute("title",
    isFiltered ? `CSV: ${students.length} Schueler` : `CSV: alle ${all.length} Schueler`);

  // Re-attach export events with CURRENT filtered list
  document.getElementById("btn-kv-print")?.replaceWith(document.getElementById("btn-kv-print").cloneNode(true));
  document.getElementById("btn-kv-csv")?.replaceWith(document.getElementById("btn-kv-csv").cloneNode(true));
  document.getElementById("btn-kv-print")?.addEventListener("click", () =>
    showExportDialog(kvId, kv, students, all, filterLabel, isFiltered, "print"));
  document.getElementById("btn-kv-csv")?.addEventListener("click", () =>
    showExportDialog(kvId, kv, students, all, filterLabel, isFiltered, "csv"));

  container.innerHTML = `<div class="page-anim">
    <div class="grid-3" style="margin-bottom:2.4rem;">
      <div class="card" style="text-align:center;"><div class="stat-card-label">Schueler</div><div class="stat-card-value">${all.length}</div></div>
      <div class="card" style="text-align:center;"><div class="stat-card-label">Fehlende Docs</div><div class="stat-card-value" style="color:${offeneDocs>0?"var(--grade-5)":"var(--grade-1)"};">${offeneDocs}</div></div>
      <div class="card" style="text-align:center;"><div class="stat-card-label">Offene Zahlung</div><div class="stat-card-value" style="color:${offeneZahlung>0?"var(--grade-5)":"var(--grade-1)"};">${offeneZahlung}</div></div>
    </div>
    <div class="card" style="margin-bottom:2rem;padding:1.4rem 2rem;">
      <div style="display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap;">
        
        <!-- Suche -->
        <div style="position:relative;flex:1;min-width:18rem;">
          <svg style="position:absolute;left:1.2rem;top:50%;transform:translateY(-50%);opacity:.4;" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="kv-search" placeholder="Name suchen..." value="${escHtml(state.search)}" style="padding-left:3.6rem;width:100%;">
        </div>

        <!-- Filter Finanzen -->
        <select id="kv-filter-finance" style="padding:0.7rem 1.2rem;background:var(--bg-input);border:1px solid var(--border-md);border-radius:var(--r-sm);color:var(--text-primary);">
          <option value="all" ${state.financeFilter==="all"?"selected":""}>💶 Schulgeld: Alle</option>
          <option value="open_payment" ${state.financeFilter==="open_payment"?"selected":""}>Schulgeld: Offen</option>
          <option value="paid_payment" ${state.financeFilter==="paid_payment"?"selected":""}>Schulgeld: Bezahlt</option>
          <option value="schloss_paid" ${state.financeFilter==="schloss_paid"?"selected":""}>Schloss: Bezahlt</option>
          <option value="schloss_open" ${state.financeFilter==="schloss_open"?"selected":""}>Schloss: Offen</option>
        </select>

        <!-- Allgemeiner Filter (Raucher, Alter) -->
        <select id="kv-filter-general" style="padding:0.7rem 1.2rem;background:var(--bg-input);border:1px solid var(--border-md);border-radius:var(--r-sm);color:var(--text-primary);">
          <option value="all" ${state.generalFilter==="all"?"selected":""}>👤 Schüler: Alle</option>
          <option value="raucher" ${state.generalFilter==="raucher"?"selected":""}>Schüler: Raucher</option>
          <option value="u18" ${state.generalFilter==="u18"?"selected":""}>Schüler: U18</option>
          <option value="ue18" ${state.generalFilter==="ue18"?"selected":""}>Schüler: Ü18</option>
        </select>

        <!-- Multi-Checklist Filter (Modal Trigger) -->
        <div>
          <button class="btn btn-ghost btn-sm" id="btn-doc-popover" style="padding:0.7rem 1.2rem;border:1px solid var(--border-md);font-size:1.32rem;">
            📋 Dokumente-Filter ${activeDocCount > 0 ? `(${activeDocCount})` : ""} ▾
          </button>
        </div>

        <!-- Sortierung -->
        <select id="kv-sort" style="padding:0.7rem 1.2rem;background:var(--bg-input);border:1px solid var(--border-md);border-radius:var(--r-sm);color:var(--text-primary);">
          <option value="name" ${state.sort==="name"?"selected":""}>Sortieren: A-Z</option>
          <option value="spind" ${state.sort==="spind"?"selected":""}>Sortieren: Spind-Nr.</option>
        </select>

        <!-- Bulk Aktionen -->
        <div style="position:relative;">
          <button class="btn btn-ghost btn-sm" id="bulk-btn">Bulk-Aktionen</button>
          <div id="bulk-menu" style="display:none;position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-md);z-index:9999;min-width:26rem;padding:0.8rem;box-shadow:var(--shadow-md);">
            ${DOC_KEYS.map(k=>`<button class="btn btn-ghost btn-sm bulk-doc-btn" data-key="${k}" style="width:100%;text-align:left;margin-bottom:0.4rem;">Alle <strong>${DOC_LABELS[k]}</strong> - Erledigt</button>`).join("")}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Table -->
    <div class="card" style="padding:0;overflow:hidden;">
      ${students.length===0 ? `<div class="empty-state" style="padding:4rem;"><h3>Keine Schueler gefunden</h3><p>Passe den Filter an oder ordne Schueler zu.</p></div>` : `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Alter</th><th>Ue18</th><th>Spind</th><th>Schulgeld</th><th>Dokumente</th><th></th></tr></thead>
          <tbody>
            ${students.map(s => {
              const age = calculateAge(s.geburtsdatum);
              const ue18 = isEigenberechtigt(s.geburtsdatum);
              const summe = (s.schulgeldBar||0)+(s.schulgeldKarte||0);
              const prog = docProgress(s);
              const initials = escHtml(((s.vorname||s.firstName||"?").charAt(0))+((s.nachname||s.lastName||"").charAt(0)));
              return `<tr class="kv-student-row" data-id="${s.id}" style="cursor:pointer;">
                <td class="col-name">
                  <div style="display:flex;align-items:center;gap:1.2rem;">
                    <div style="width:3.6rem;height:3.6rem;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-dark));display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:1.35rem;flex-shrink:0;">${initials}</div>
                    <div>
                      <div style="font-weight:600;">${escHtml(s.nachname||s.lastName)} ${escHtml(s.vorname||s.firstName)}</div>
                      ${s.geburtsdatum?`<div style="font-size:1.2rem;color:var(--text-muted);">${new Date(s.geburtsdatum).toLocaleDateString("de-AT")}</div>`:""}
                    </div>
                  </div>
                </td>
                <td>${age!==null?age:"-"}</td>
                <td style="font-size:1.5rem;">${ue18?"✅":"❌"}</td>
                <td style="font-family:'JetBrains Mono',monospace;">${s.spindNr!==null&&s.spindNr!==undefined?s.spindNr:"-"}</td>
                <td><span style="color:${summe>0?"var(--grade-1)":"var(--grade-5)"};font-weight:600;font-family:'JetBrains Mono',monospace;">${summe>0?summe+" EUR":"Offen"}</span></td>
                <td style="min-width:16rem;">${progressBar(prog.pct,prog.erledigt,prog.total)}</td>
                <td class="col-actions">
                  <button class="btn btn-ghost btn-sm btn-move-student" data-id="${s.id}" data-name="${escHtml((s.nachname||s.lastName)+" "+(s.vorname||s.firstName))}" title="Verschieben">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                  </button>
                  <button class="btn btn-ghost btn-sm btn-remove-student" data-id="${s.id}" data-name="${escHtml((s.nachname||s.lastName)+" "+(s.vorname||s.firstName))}" title="Entfernen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`}
    </div>
  </div>`;

  container.querySelector("#kv-search")?.addEventListener("input", e => {
    const val = e.target.value;
    const sel = [e.target.selectionStart, e.target.selectionEnd];
    renderContent(container, kvId, {...state, search: val});
    const inp = container.querySelector("#kv-search");
    if (inp) { inp.focus(); try { inp.setSelectionRange(sel[0], sel[1]); } catch(_){} }
  });
  
  container.querySelector("#kv-filter-finance")?.addEventListener("change", e => {
    renderContent(container, kvId, {...state, financeFilter: e.target.value});
  });

  container.querySelector("#kv-filter-general")?.addEventListener("change", e => {
    renderContent(container, kvId, {...state, generalFilter: e.target.value});
  });

  // Doc filter Modal Trigger
  container.querySelector("#btn-doc-popover")?.addEventListener("click", () => {
    showDocFilterModal(kvId, container, state);
  });

  container.querySelector("#kv-sort")?.addEventListener("change", e =>
    renderContent(container, kvId, {...state, sort: e.target.value}));



  const bulkBtn = container.querySelector("#bulk-btn");
  const bulkMenu = container.querySelector("#bulk-menu");
  bulkBtn?.addEventListener("click", e => {
    e.stopPropagation();
    if (bulkMenu.style.display === "none") {
      const rect = bulkBtn.getBoundingClientRect();
      const menuW = 280;
      let left = rect.right - menuW; // align right edge with button
      if (left < 8) left = rect.left; // don't go off left edge
      if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
      bulkMenu.style.top  = (rect.bottom + 4) + "px";
      bulkMenu.style.left = Math.max(8, left) + "px";
      bulkMenu.style.right = "auto";
      bulkMenu.style.display = "block";
    } else {
      bulkMenu.style.display = "none";
    }
  });
  document.addEventListener("click", () => { if(bulkMenu) bulkMenu.style.display="none"; }, {once:true});

  container.querySelectorAll(".bulk-doc-btn").forEach(btn =>
    btn.addEventListener("click", async () => {
      const key = btn.dataset.key;
      const all2 = getKVStudents(kvId);
      if(await confirm(`${DOC_LABELS[key]} fuer ALLE ${all2.length} Schueler auf Erledigt setzen?`)) {
        all2.forEach(s => updateStudent(s.id, {dokumente:{...s.dokumente,[key]:1}}));
        showToast(`${DOC_LABELS[key]} fuer alle erledigt`, "success");
        renderContent(container, kvId, state);
      }
    }));

  container.querySelectorAll(".kv-student-row").forEach(row =>
    row.addEventListener("click", e => {
      if(e.target.closest("button")) return;
      navigate("kv_student", {courseId: kvId, studentId: row.dataset.id});
    }));

  container.querySelectorAll(".btn-move-student").forEach(btn =>
    btn.addEventListener("click", e => { e.stopPropagation(); showMoveModal(btn.dataset.id, btn.dataset.name, kvId, container, state); }));

  container.querySelectorAll(".btn-remove-student").forEach(btn =>
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if(await confirm(`${btn.dataset.name} aus dieser Klasse entfernen?`)) {
        unassignStudentFromKVClass(kvId, btn.dataset.id);
        showToast("Schueler entfernt", "info");
        renderContent(container, kvId, state);
      }
    }));
}


// ── Document Checklist Filter Modal ────────────────────────────────
function showDocFilterModal(kvId, container, state) {
  const currentMode = state.docFilterMode || "open";
  const currentObj = state.docFilterObj || {};

  showModal("Dokumente filtern (ODER-Verknüpfung)", `
    <div style="display:flex;flex-direction:column;gap:1.6rem;">
      <div class="form-group">
        <label class="form-label">Zustand der Dokumente</label>
        <div style="display:flex;gap:1.6rem;background:var(--bg-card-2);padding:1rem 1.2rem;border-radius:var(--r-sm);border:1px solid var(--border-light);">
          <label style="display:flex;align-items:center;gap:0.8rem;font-size:1.3rem;cursor:pointer;">
            <input type="radio" name="modal-doc-filter-mode" value="open" ${currentMode==="open"?"checked":""} style="width:1.8rem;height:1.8rem;">
            <span>Ausgewählte <strong>FEHLEN (Offen)</strong></span>
          </label>
          <label style="display:flex;align-items:center;gap:0.8rem;font-size:1.3rem;cursor:pointer;">
            <input type="radio" name="modal-doc-filter-mode" value="done" ${currentMode==="done"?"checked":""} style="width:1.8rem;height:1.8rem;">
            <span>Ausgewählte <strong>ERLEDIGT</strong></span>
          </label>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Dokumente auswählen</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
          ${DOC_KEYS.map(k => {
            const isChecked = !!currentObj[k];
            return `
            <label style="display:flex;align-items:center;gap:1rem;padding:0.8rem 1rem;border:1px solid ${isChecked?'var(--accent)':'var(--border-light)'};background:${isChecked?'var(--accent-light)':'transparent'};border-radius:var(--r-sm);cursor:pointer;transition:all var(--t-fast);" class="modal-doc-label">
              <input type="checkbox" class="modal-doc-checkbox" data-key="${k}" ${isChecked?"checked":""} style="width:1.8rem;height:1.8rem;">
              <span style="font-size:1.3rem;font-weight:500;">${DOC_LABELS[k]}</span>
            </label>`;
          }).join("")}
        </div>
      </div>
    </div>
  `, [
    { label: "Zurücksetzen", cls: "btn-ghost", onClick: () => {
      closeModal();
      renderContent(container, kvId, { ...state, docFilterObj: {}, docFilterMode: "open" });
      showToast("Filter zurückgesetzt", "info");
    }},
    { label: "Filter anwenden", cls: "btn-primary", onClick: () => {
      const mode = document.querySelector("input[name='modal-doc-filter-mode']:checked")?.value || "open";
      const newObj = {};
      document.querySelectorAll(".modal-doc-checkbox:checked").forEach(cb => {
        newObj[cb.dataset.key] = true;
      });
      closeModal();
      renderContent(container, kvId, { ...state, docFilterObj: newObj, docFilterMode: mode });
    }}
  ], "modal-lg");

  // Visual toggle on checkbox click inside modal
  setTimeout(() => {
    document.querySelectorAll(".modal-doc-checkbox").forEach(cb => {
      cb.addEventListener("change", () => {
        const lbl = cb.closest(".modal-doc-label");
        if (lbl) {
          lbl.style.borderColor = cb.checked ? "var(--accent)" : "var(--border-light)";
          lbl.style.background = cb.checked ? "var(--accent-light)" : "transparent";
        }
      });
    });
  }, 50);
}

function showAssignModal(kvId, container) {
  const already = getKVStudents(kvId).map(s=>s.id);
  const available = getGlobalStudents().filter(s=>!already.includes(s.id));
  showModal("Schueler zuordnen", `
    <div class="form-group">
      <input type="text" id="assign-search" placeholder="Name suchen..." style="margin-bottom:1.2rem;">
      <div id="assign-list" style="max-height:32rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.6rem;">
        ${available.length===0
          ? "<div style='padding:2rem;text-align:center;color:var(--text-muted);'>Alle Schueler bereits zugeordnet</div>"
          : available.map(s=>`
            <label style="display:flex;align-items:center;gap:1.2rem;padding:1rem 1.2rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);" class="assign-item">
              <input type="checkbox" value="${s.id}" style="width:1.8rem;height:1.8rem;cursor:pointer;">
              <div>
                <div style="font-weight:600;">${escHtml(s.nachname||s.lastName)} ${escHtml(s.vorname||s.firstName)}</div>
                ${s.geburtsdatum?`<div style="font-size:1.2rem;color:var(--text-muted);">${new Date(s.geburtsdatum).toLocaleDateString("de-AT")}</div>`:""}
              </div>
            </label>`).join("")}
      </div>
    </div>
    <hr style="border-color:var(--border);margin:1.2rem 0;">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
      <button class="btn btn-ghost btn-sm" id="btn-new-global-student">+ Neuen Schueler anlegen</button>
      <div>
        <input type="file" id="csv-file-input" accept=".csv" style="display:none;">
        <button class="btn btn-ghost btn-sm" id="btn-import-csv" style="color:var(--accent);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.4rem;vertical-align:middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Aus CSV importieren
        </button>
      </div>
    </div>
  `,[
    {label:"Abbrechen",cls:"btn-ghost",onClick:closeModal},
    {label:"Zuordnen",cls:"btn-primary",onClick:()=>{
      const checked=[...document.querySelectorAll("#assign-list input[type=checkbox]:checked")];
      if(!checked.length) return showToast("Bitte Schueler auswaehlen","error");
      checked.forEach(cb=>assignStudentToKVClass(kvId,cb.value));
      closeModal(); showToast(`${checked.length} Schueler zugeordnet`,"success");
      renderContent(container,kvId,{filter:"all",sort:"name",search:""});
    }}
  ],"modal-lg");

  setTimeout(()=>{
    document.getElementById("assign-search")?.addEventListener("input",e=>{
      const q=e.target.value.toLowerCase();
      document.querySelectorAll(".assign-item").forEach(item=>item.style.display=item.textContent.toLowerCase().includes(q)?"":"none");
    });
    document.getElementById("btn-new-global-student")?.addEventListener("click",()=>{ closeModal(); showNewStudentModal(kvId,container); });

    const fileInput = document.getElementById("csv-file-input");
    const importBtn = document.getElementById("btn-import-csv");

    importBtn?.addEventListener("click", () => fileInput?.click());

    fileInput?.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const text = evt.target.result;
          const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
          if (lines.length < 2) {
            showToast("Die CSV Datei enthält nicht genug Daten.", "error");
            return;
          }

          // Parse CSV Line Helper (handles quotes and semicolons)
          const parseCSVLine = (line) => {
            const result = [];
            let current = "";
            let inQuotes = false;
            // Detect delimiter: semicolon is typical for German Excel exports
            const delimiter = line.includes(";") ? ";" : ",";
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = "";
              } else {
                current += char;
              }
            }
            result.push(current.trim());
            return result;
          };

          const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/["']/g, ""));
          
          const idxNachname = headers.findIndex(h => h.includes("nachname"));
          const idxVorname = headers.findIndex(h => h.includes("vorname"));
          const idxMail = headers.findIndex(h => h.includes("mail")); // captures "eigene mailadresse" or "email"

          if (idxNachname === -1 || idxVorname === -1) {
            showToast("Spalten 'Nachname' und 'Vorname' wurden in der Kopfzeile nicht gefunden.", "error");
            return;
          }

          let importCount = 0;
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length < Math.max(idxNachname, idxVorname) + 1) continue;

            const nn = values[idxNachname]?.replace(/["']/g, "");
            const vn = values[idxVorname]?.replace(/["']/g, "");
            const email = idxMail !== -1 ? values[idxMail]?.replace(/["']/g, "") : "";

            if (!nn || !vn) continue;

            // Check if student already exists globally
            let existing = getGlobalStudents().find(s => 
              (s.nachname||s.lastName||"").toLowerCase() === nn.toLowerCase() &&
              (s.vorname||s.firstName||"").toLowerCase() === vn.toLowerCase()
            );

            let studentId;
            if (!existing) {
              const newStudent = createStudent(null, {
                nachname: nn,
                vorname: vn,
                firstName: vn,
                lastName: nn,
                kommentar: email ? `E-Mail: ${email}` : ""
              });
              studentId = newStudent.id;
            } else {
              studentId = existing.id;
            }

            // Assign to this class if not already
            const alreadyInClass = getKVStudents(kvId).some(s => s.id === studentId);
            if (!alreadyInClass) {
              assignStudentToKVClass(kvId, studentId);
              importCount++;
            }
          }

          closeModal();
          showToast(`${importCount} Schüler erfolgreich importiert & zugeordnet!`, "success");
          renderContent(container, kvId, { filter: "all", sort: "name", search: "" });
        } catch (err) {
          console.error(err);
          showToast("Fehler beim Parsen der CSV Datei.", "error");
        }
      };
      reader.readAsText(file, "UTF-8");
    });
  }, 50);
}


function showNewStudentModal(kvId, container) {
  showModal("Neuen Schueler anlegen",`
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nachname *</label><input type="text" id="ns-nn" placeholder="Mustermann"></div>
      <div class="form-group"><label class="form-label">Vorname *</label><input type="text" id="ns-vn" placeholder="Max"></div>
    </div>
    <div class="form-group"><label class="form-label">Geburtsdatum</label><input type="date" id="ns-geb"></div>
  `,[
    {label:"Abbrechen",cls:"btn-ghost",onClick:closeModal},
    {label:"Anlegen & zuordnen",cls:"btn-primary",onClick:()=>{
      const nn=document.getElementById("ns-nn").value.trim();
      const vn=document.getElementById("ns-vn").value.trim();
      const geb=document.getElementById("ns-geb").value;
      if(!nn||!vn) return showToast("Nachname und Vorname erforderlich","error");
      const s=createStudent(null,{nachname:nn,vorname:vn,firstName:vn,lastName:nn,geburtsdatum:geb});
      assignStudentToKVClass(kvId,s.id);
      closeModal(); showToast("Schueler angelegt und zugeordnet","success");
      renderContent(container,kvId,{filter:"all",sort:"name",search:""});
    }}
  ]);
}

function showMoveModal(studentId, name, fromKvId, container, state) {
  const others=getKVClasses().filter(c=>c.id!==fromKvId);
  if(!others.length) return showToast("Keine andere KV-Klasse vorhanden","error");
  showModal(`${name} verschieben`,`
    <div class="form-group">
      <label class="form-label">In welche Klasse verschieben?</label>
      <select id="move-target" style="width:100%;padding:0.9rem 1.2rem;background:var(--bg-input);border:1px solid var(--border-md);border-radius:var(--r-sm);color:var(--text-primary);">
        ${others.map(c=>`<option value="${c.id}">${escHtml(c.name)}</option>`).join("")}
      </select>
    </div>
  `,[
    {label:"Abbrechen",cls:"btn-ghost",onClick:closeModal},
    {label:"Verschieben",cls:"btn-primary",onClick:()=>{
      const toKvId=document.getElementById("move-target").value;
      moveStudentToKVClass(studentId,fromKvId,toKvId);
      closeModal(); showToast(`${name} verschoben`,"success");
      renderContent(container,fromKvId,state);
    }}
  ]);
}

function exportCSV(kvId) {
  const kv=getKVClass(kvId);
  const students=getKVStudents(kvId);
  const headers=["Nachname","Vorname","Geburtsdatum","Alter","Ue18","Spind-Nr.","Schloss bezahlt","Schulgeld BAR","Schulgeld KARTE","Summe Schulgeld",...DOC_KEYS.map(k=>DOC_LABELS[k]),"Raucher","Religion","Befreiungen","Vorerhebung LAP","Kommentar"];
  const ds={0:"Offen",1:"Erledigt",2:"Nicht erforderlich"};
  const rows=[headers,...students.map(s=>{
    const age=calculateAge(s.geburtsdatum);
    const summe=(s.schulgeldBar||0)+(s.schulgeldKarte||0);
    return[s.nachname||s.lastName,s.vorname||s.firstName,s.geburtsdatum||"",age!==null?age:"",isEigenberechtigt(s.geburtsdatum)?"Ja":"Nein",s.spindNr??"",s.schlossBezahlt?"Ja":"Nein",s.schulgeldBar||0,s.schulgeldKarte||0,summe,...DOC_KEYS.map(k=>ds[(s.dokumente||{})[k]]||"Offen"),s.raucher?"Ja":"Nein",s.religion||"",s.befreiungen||"",s.vorerhebungLAP?"Ja":"Nein",s.kommentar||""];
  })];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`${kv.name}_KV_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast("CSV exportiert","success");
}

// ── Export Dialog ─────────────────────────────────────────────────
function showExportDialog(kvId, kv, filteredStudents, allStudents, filterLabel, isFiltered, mode) {
  const modeLabel = mode === "print" ? "Drucken" : "CSV exportieren";
  const colOptions = [
    {key:"name",    label:"Name / Geburtsdatum", checked:true},
    {key:"alter",   label:"Alter & Ü18",         checked:true},
    {key:"spind",   label:"Spind-Nr.",            checked:true},
    {key:"schulgeld",label:"Schulgeld",           checked:true},
    {key:"dokumente",label:"Dokumente-Status",    checked:true},
    {key:"raucher", label:"Raucher",              checked:false},
    {key:"religion",label:"Religion",             checked:false},
    {key:"befreiungen",label:"Befreiungen",       checked:false},
    {key:"lap",     label:"Vorerhebung LAP",      checked:false},
    {key:"kommentar",label:"Kommentar",           checked:false},
  ];

  showModal(`${modeLabel} – Konfiguration`, `
    <div style="display:flex;flex-direction:column;gap:1.6rem;">

      ${isFiltered ? `
      <!-- Umfang -->
      <div class="form-group">
        <label class="form-label">Welche Schüler?</label>
        <div style="display:flex;flex-direction:column;gap:0.8rem;">
          <label style="display:flex;align-items:center;gap:1rem;padding:1rem 1.2rem;border:2px solid var(--accent);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);">
            <input type="radio" name="exp-scope" value="filtered" checked style="width:1.8rem;height:1.8rem;">
            <div>
              <div style="font-weight:600;">Aktuelle Ansicht (${filteredStudents.length} Schüler)</div>
              <div style="font-size:1.2rem;color:var(--text-muted);">Filter: ${filterLabel}</div>
            </div>
          </label>
          <label style="display:flex;align-items:center;gap:1rem;padding:1rem 1.2rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;background:var(--bg-card-2);">
            <input type="radio" name="exp-scope" value="all" style="width:1.8rem;height:1.8rem;">
            <div>
              <div style="font-weight:600;">Alle Schüler (${allStudents.length})</div>
              <div style="font-size:1.2rem;color:var(--text-muted);">Kein Filter</div>
            </div>
          </label>
        </div>
      </div>` : `
      <div style="padding:1rem 1.4rem;background:var(--bg-card-2);border-radius:var(--r-sm);color:var(--text-muted);font-size:1.3rem;">
        Alle ${allStudents.length} Schüler werden ausgegeben (kein Filter aktiv).
      </div>`}

      <!-- Spalten -->
      <div class="form-group">
        <label class="form-label">Spalten auswählen</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
          ${colOptions.map(c=>`
            <label style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem 1rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;">
              <input type="checkbox" class="exp-col" value="${c.key}" ${c.checked?"checked":""} style="width:1.6rem;height:1.6rem;">
              <span>${c.label}</span>
            </label>`).join("")}
        </div>
      </div>
    </div>
  `, [
    {label:"Abbrechen", cls:"btn-ghost", onClick: closeModal},
    {label:modeLabel, cls:"btn-primary", onClick: () => {
      const scope = document.querySelector("input[name='exp-scope']:checked")?.value || "all";
      const cols = [...document.querySelectorAll(".exp-col:checked")].map(c=>c.value);
      const students = (isFiltered && scope==="filtered") ? filteredStudents : allStudents;
      closeModal();
      if (mode==="print") printKVFiltered(kv, students, cols);
      else exportCSVFiltered(kvId, kv, students, cols);
    }}
  ], "modal-lg");
}

function printKV(kvId) {
  const kv=getKVClass(kvId);
  const students=getKVStudents(kvId);
  const ds={0:"[ ]",1:"[X]",2:"[-]"};
  const w=window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${kv.name} KV-Liste</title>
    <style>body{font-family:Arial,sans-serif;font-size:10px;margin:20px;}h1{font-size:15px;}
    table{width:100%;border-collapse:collapse;}th{background:#f0f0f0;padding:4px;border:1px solid #ccc;font-size:8px;}
    td{padding:4px;border:1px solid #ddd;}tr:nth-child(even) td{background:#fafafa;}</style>
  </head><body>
    <h1>KV-Klasse: ${escHtml(kv.name)} &mdash; ${new Date().toLocaleDateString("de-AT")} &mdash; ${students.length} Schueler</h1>
    <table><thead><tr><th>Name</th><th>Geb.</th><th>Ue18</th><th>Spind</th><th>Schulgeld</th>
      ${DOC_KEYS.map(k=>`<th>${DOC_LABELS[k]}</th>`).join("")}<th>Raucher</th><th>Kommentar</th>
    </tr></thead><tbody>
      ${students.map(s=>{
        const summe=(s.schulgeldBar||0)+(s.schulgeldKarte||0);
        return`<tr><td><strong>${escHtml(s.nachname||s.lastName)}</strong><br>${escHtml(s.vorname||s.firstName)}</td>
          <td>${s.geburtsdatum?new Date(s.geburtsdatum).toLocaleDateString("de-AT"):"-"}</td>
          <td>${isEigenberechtigt(s.geburtsdatum)?"J":"N"}</td>
          <td>${s.spindNr??"-"}</td>
          <td>${summe>0?summe+" EUR":"Offen"}</td>
          ${DOC_KEYS.map(k=>`<td style="text-align:center;">${ds[(s.dokumente||{})[k]]||"[ ]"}</td>`).join("")}
          <td>${s.raucher?"Ja":"Nein"}</td><td>${escHtml(s.kommentar||"")}</td></tr>`;
      }).join("")}
    </tbody></table>
  </body></html>`);
  w.document.close(); w.print();
}

// ── Filter-aware print & CSV ──────────────────────────────────────
function printKVFiltered(kv, students, cols) {
  const has = k => cols.includes(k);
  const ds = {0:"[ ]",1:"[X]",2:"[-]"};
  const headers = [
    has("name")     && "<th>Nachname</th><th>Vorname</th><th>Geb.</th>",
    has("alter")    && "<th>Alter</th><th>Ü18</th>",
    has("spind")    && "<th>Spind</th>",
    has("schulgeld")&& "<th>BAR</th><th>KARTE</th><th>Summe</th>",
    has("dokumente")&& DOC_KEYS.map(k=>`<th>${DOC_LABELS[k]}</th>`).join(""),
    has("raucher")  && "<th>Raucher</th>",
    has("religion") && "<th>Religion</th>",
    has("befreiungen")&&"<th>Befreiungen</th>",
    has("lap")      && "<th>LAP</th>",
    has("kommentar")&& "<th>Kommentar</th>",
  ].filter(Boolean).join("");

  const rows = students.map(s => {
    const summe = (s.schulgeldBar||0)+(s.schulgeldKarte||0);
    const age = calculateAge(s.geburtsdatum);
    const ue18 = isEigenberechtigt(s.geburtsdatum);
    return "<tr>"+ [
      has("name")      && `<td><strong>${escHtml(s.nachname||s.lastName)}</strong></td><td>${escHtml(s.vorname||s.firstName)}</td><td>${s.geburtsdatum?new Date(s.geburtsdatum).toLocaleDateString("de-AT"):"-"}</td>`,
      has("alter")     && `<td>${age!==null?age:"-"}</td><td>${ue18?"J":"N"}</td>`,
      has("spind")     && `<td>${s.spindNr??"-"}</td>`,
      has("schulgeld") && `<td>${s.schulgeldBar||0}</td><td>${s.schulgeldKarte||0}</td><td>${summe>0?summe+" EUR":"Offen"}</td>`,
      has("dokumente") && DOC_KEYS.map(k=>`<td>${ds[(s.dokumente||{})[k]]||"[ ]"}</td>`).join(""),
      has("raucher")   && `<td>${s.raucher?"Ja":"Nein"}</td>`,
      has("religion")  && `<td>${escHtml(s.religion||"")}</td>`,
      has("befreiungen")&&`<td>${escHtml(s.befreiungen||"")}</td>`,
      has("lap")       && `<td>${s.vorerhebungLAP?"Ja":"Nein"}</td>`,
      has("kommentar") && `<td>${escHtml(s.kommentar||"")}</td>`,
    ].filter(Boolean).join("") +"</tr>";
  }).join("");

  const w = window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${kv.name}</title>
    <style>body{font-family:Arial,sans-serif;font-size:10px;margin:20px;}h1{font-size:14px;}
    table{width:100%;border-collapse:collapse;}th{background:#f0f0f0;padding:4px;border:1px solid #ccc;font-size:8px;}
    td{padding:4px;border:1px solid #ddd;}tr:nth-child(even) td{background:#fafafa;}</style>
  </head><body>
    <h1>${escHtml(kv.name)} &mdash; ${students.length} Schüler &mdash; ${new Date().toLocaleDateString("de-AT")}</h1>
    <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
  </body></html>`);
  w.document.close(); w.print();
}

function exportCSVFiltered(kvId, kv, students, cols) {
  const has = k => cols.includes(k);
  const ds = {0:"Offen",1:"Erledigt",2:"Nicht erforderlich"};
  const headers = [
    has("name")      && ["Nachname","Vorname","Geburtsdatum"],
    has("alter")     && ["Alter","Ue18"],
    has("spind")     && ["Spind-Nr."],
    has("schulgeld") && ["Schulgeld BAR","Schulgeld KARTE","Summe Schulgeld"],
    has("dokumente") && DOC_KEYS.map(k=>DOC_LABELS[k]),
    has("raucher")   && ["Raucher"],
    has("religion")  && ["Religion"],
    has("befreiungen")&&["Befreiungen"],
    has("lap")       && ["Vorerhebung LAP"],
    has("kommentar") && ["Kommentar"],
  ].filter(Boolean).flat();

  const rows = [headers, ...students.map(s => {
    const summe = (s.schulgeldBar||0)+(s.schulgeldKarte||0);
    const age = calculateAge(s.geburtsdatum);
    return [
      has("name")      && [s.nachname||s.lastName, s.vorname||s.firstName, s.geburtsdatum||""],
      has("alter")     && [age!==null?age:"", isEigenberechtigt(s.geburtsdatum)?"Ja":"Nein"],
      has("spind")     && [s.spindNr??""],
      has("schulgeld") && [s.schulgeldBar||0, s.schulgeldKarte||0, summe],
      has("dokumente") && DOC_KEYS.map(k=>ds[(s.dokumente||{})[k]]||"Offen"),
      has("raucher")   && [s.raucher?"Ja":"Nein"],
      has("religion")  && [s.religion||""],
      has("befreiungen")&&[s.befreiungen||""],
      has("lap")       && [s.vorerhebungLAP?"Ja":"Nein"],
      has("kommentar") && [s.kommentar||""],
    ].filter(Boolean).flat();
  })];
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=`${kv.name}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast("CSV exportiert","success");
}
