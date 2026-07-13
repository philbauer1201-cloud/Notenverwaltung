/**
 * kvClassView.js - KV-Klassenansicht
 * Schuelerliste mit Filter, Sortierung, Bulk-Actions, Zuordnung/Verschieben
 */
import {
  getKVClass, getKVClasses, getKVStudents, updateStudent,
  assignStudentToKVClass, unassignStudentFromKVClass, moveStudentToKVClass,
  getGlobalStudents, createStudent, calculateAge, isEigenberechtigt,
  addKVClassProject, updateKVClassProject, deleteKVClassProject,
  updateProjectPayment, updateStudentKVFinance
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
  renderContent(container, kvId, { filter: "all", sort: "name", search: "", activeTab: "schueler" });
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
      students = students.filter(s => (s.schulgeldBetrag||0)===0);
      break;
    case "paid_payment":
      students = students.filter(s => (s.schulgeldBetrag||0)>0);
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

  // Re-attach export events with CURRENT filtered list
  document.getElementById("btn-kv-print")?.replaceWith(document.getElementById("btn-kv-print").cloneNode(true));
  document.getElementById("btn-kv-csv")?.replaceWith(document.getElementById("btn-kv-csv").cloneNode(true));
  document.getElementById("btn-kv-print")?.addEventListener("click", () =>
    showExportDialog(kvId, kv, students, all, filterLabel, isFiltered, "print"));
  document.getElementById("btn-kv-csv")?.addEventListener("click", () =>
    showExportDialog(kvId, kv, students, all, filterLabel, isFiltered, "csv"));

  // Check if activeTab is 'finanzen'
  const isFinanceTab = state.activeTab === "finanzen";

  let mainContentHTML = "";

  if (!isFinanceTab) {
    // ─── TAB: SCHUELER & DOKUMENTE (BISHIERIGER CODE) ───
    mainContentHTML = `
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
                      ${s.photo 
                        ? `<img src="${s.photo}" style="width:3.6rem;height:3.6rem;border-radius:50%;object-fit:cover;border:1.5px solid var(--accent);flex-shrink:0;">`
                        : `<div style="width:3.6rem;height:3.6rem;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-dark));display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:1.35rem;flex-shrink:0;">${initials}</div>`
                      }
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
    `;
  } else {
    // ─── TAB: KLASSENKASSE ───
    // Calculate global metrics
    const totalSchulgeldBar = all.reduce((sum, s) => sum + (s.schulgeldMethode === 'bar' ? (s.schulgeldBetrag || 0) : 0), 0);
    const totalSchulgeldKarte = all.reduce((sum, s) => sum + (s.schulgeldMethode === 'karte' ? (s.schulgeldBetrag || 0) : 0), 0);
    const totalSchulgeld = totalSchulgeldBar + totalSchulgeldKarte;

    const totalSpindBar = all.reduce((sum, s) => sum + (s.spindKautionMethode === 'bar' ? (s.spindKautionBetrag || 0) : 0), 0);
    const totalSpindKarte = all.reduce((sum, s) => sum + (s.spindKautionMethode === 'karte' ? (s.spindKautionBetrag || 0) : 0), 0);
    const totalSpind = totalSpindBar + totalSpindKarte;

    const projects = kv.projekte || [];

    mainContentHTML = `
      <div class="grid-3" style="margin-bottom:2.4rem;">
        <div class="card" style="text-align:center;">
          <div class="stat-card-label">Gesamteinnahmen (Schulgemeinde)</div>
          <div class="stat-card-value" style="color:var(--accent);">${(totalSchulgeld + totalSpind).toFixed(2)} EUR</div>
          <div class="text-sm text-muted mt-1">Bar: ${(totalSchulgeldBar + totalSpindBar).toFixed(2)} € | Karte: ${(totalSchulgeldKarte + totalSpindKarte).toFixed(2)} €</div>
        </div>
        <div class="card" style="text-align:center;">
          <div class="stat-card-label">Eingesammeltes Schulgeld</div>
          <div class="stat-card-value" style="color:var(--grade-1);">${totalSchulgeld.toFixed(2)} EUR</div>
          <div class="text-sm text-muted mt-1">Bar: ${totalSchulgeldBar.toFixed(2)} € | Karte: ${totalSchulgeldKarte.toFixed(2)} €</div>
        </div>
        <div class="card" style="text-align:center;">
          <div class="stat-card-label">Spindkautionen</div>
          <div class="stat-card-value" style="color:var(--warning);">${totalSpind.toFixed(2)} EUR</div>
          <div class="text-sm text-muted mt-1">Bar: ${totalSpindBar.toFixed(2)} € | Karte: ${totalSpindKarte.toFixed(2)} €</div>
        </div>
      </div>

      <!-- Schulgemeinde Abrechnungsbeleg -->
      <div class="card" style="margin-bottom:2.4rem;padding:2rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.6rem;flex-wrap:wrap;gap:1rem;">
          <div style="font-weight:700;font-size:1.3rem;">📋 Einnahmenabrechnung für Schulgemeinde</div>
          <button class="btn btn-ghost btn-sm" id="btn-print-finance-summary">🖨️ Abrechnung drucken</button>
        </div>
        
        <div class="table-responsive">
          <table class="data-table" style="width:100%;text-align:left;">
            <thead>
              <tr>
                <th>Posten</th>
                <th class="col-center">Eingenommen (Bar)</th>
                <th class="col-center">Eingenommen (Bankomat/Karte)</th>
                <th class="col-center">Summe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight:600;">Schulgeld</td>
                <td class="col-center">${totalSchulgeldBar.toFixed(2)} EUR</td>
                <td class="col-center">${totalSchulgeldKarte.toFixed(2)} EUR</td>
                <td class="col-center" style="font-weight:600;">${totalSchulgeld.toFixed(2)} EUR</td>
              </tr>
              <tr>
                <td style="font-weight:600;">Spindkautionen</td>
                <td class="col-center">${totalSpindBar.toFixed(2)} EUR</td>
                <td class="col-center">${totalSpindKarte.toFixed(2)} EUR</td>
                <td class="col-center" style="font-weight:600;">${totalSpind.toFixed(2)} EUR</td>
              </tr>
              <tr style="background:var(--bg-card-3);font-weight:700;border-top:1.5px solid var(--border-md);">
                <td>GESAMT</td>
                <td class="col-center">${(totalSchulgeldBar + totalSpindBar).toFixed(2)} EUR</td>
                <td class="col-center">${(totalSchulgeldKarte + totalSpindKarte).toFixed(2)} EUR</td>
                <td class="col-center" style="color:var(--accent);">${(totalSchulgeld + totalSpind).toFixed(2)} EUR</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Custom Project Cashboxes (Exkursionen, Workshops) -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.6rem;flex-wrap:wrap;gap:1rem;">
        <div class="section-title" style="margin:0;">🎒 Exkursionen & Sonderprojekte</div>
        <button class="btn btn-primary btn-sm" id="btn-add-finance-project">+ Projekt hinzufügen</button>
      </div>

      ${projects.length === 0 
        ? `<div class="empty-state card" style="padding:4rem;">
            <h3>Keine Sonderprojekte angelegt</h3>
            <p>Erstelle Projekte wie Exkursionen oder Workshops, um individuelle Kosten und Rückzahlungen zu berechnen.</p>
           </div>`
        : projects.map(p => {
            const payments = all.map(s => {
              const payment = (s.projektZahlungen || {})[p.id] || { betrag: 0, methode: "bar" };
              return { student: s, ...payment };
            });
            const totalCollected = payments.reduce((sum, py) => sum + py.betrag, 0);
            const payerCount = payments.filter(py => py.betrag > 0).length;
            const refundPerStudent = payerCount > 0 && p.tatsaechlicheKosten > 0 && totalCollected > p.tatsaechlicheKosten
              ? (totalCollected - p.tatsaechlicheKosten) / payerCount
              : 0;

            return `
              <div class="card" style="margin-bottom:2.4rem;padding:2rem;" data-project-id="${p.id}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.6rem;flex-wrap:wrap;gap:1rem;border-bottom:1px solid var(--border);padding-bottom:1rem;">
                  <div>
                    <h3 style="margin:0;font-size:1.4rem;color:var(--text-bright);">${escHtml(p.name)}</h3>
                    <p style="margin-top:0.4rem;color:var(--text-muted);font-size:1.15rem;">
                      Soll pro Schüler: <strong>${p.sollProSchueler.toFixed(2)} €</strong> | 
                      Eingezahlt von: <strong>${payerCount} / ${all.length} SuS</strong>
                    </p>
                  </div>
                  <div style="display:flex;gap:0.8rem;">
                    <button class="btn btn-ghost btn-sm btn-edit-project" data-id="${p.id}" data-name="${escHtml(p.name)}" data-soll="${p.sollProSchueler}" data-kosten="${p.tatsaechlicheKosten}">✏️ Bearbeiten</button>
                    <button class="btn btn-ghost btn-sm btn-print-project-receipt" data-id="${p.id}" style="color:var(--accent);border-color:var(--accent);">🖨️ Abrechnung drucken</button>
                    <button class="btn btn-ghost btn-sm btn-delete-project" data-id="${p.id}" style="color:var(--grade-5);">🗑️ Löschen</button>
                  </div>
                </div>

                <div class="grid-3" style="margin-bottom:1.6rem;background:var(--bg-card-3);padding:1.2rem;border-radius:var(--r-sm);">
                  <div>
                    <span style="font-size:1.05rem;color:var(--text-muted);">Eingesammelt Gesamt</span>
                    <div style="font-size:1.4rem;font-weight:700;color:var(--grade-1);">${totalCollected.toFixed(2)} EUR</div>
                  </div>
                  <div>
                    <span style="font-size:1.05rem;color:var(--text-muted);">Tatsächliche Gesamtkosten</span>
                    <div style="font-size:1.4rem;font-weight:700;color:var(--text-bright);">${p.tatsaechlicheKosten.toFixed(2)} EUR</div>
                  </div>
                  <div>
                    <span style="font-size:1.05rem;color:var(--text-muted);">Erstattung pro Einzahler</span>
                    <div style="font-size:1.4rem;font-weight:700;color:${refundPerStudent > 0 ? "var(--accent)" : "var(--text-muted)"};">
                      ${refundPerStudent > 0 ? `${refundPerStudent.toFixed(2)} EUR` : "Keine"}
                    </div>
                  </div>
                </div>

                <div class="table-responsive">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Schüler</th>
                        <th class="col-center">Soll-Beitrag</th>
                        <th class="col-center">Eingezahlter Betrag</th>
                        <th class="col-center">Zahlungsart</th>
                        <th class="col-center">Guthaben / Rückzahlung</th>
                        <th class="col-center">Beleg</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${payments.map(py => {
                        const hasPaid = py.betrag > 0;
                        const individualRefund = hasPaid ? refundPerStudent : 0;
                        return `
                          <tr class="project-student-row" data-student-id="${py.student.id}" data-project-id="${p.id}">
                            <td class="col-name" style="font-weight:600;">
                              ${escHtml(py.student.nachname || py.student.lastName)}, ${escHtml(py.student.vorname || py.student.firstName)}
                            </td>
                            <td class="col-center">${p.sollProSchueler.toFixed(2)} EUR</td>
                            <td class="col-center">
                              <input type="number" class="project-payment-input" data-student-id="${py.student.id}" data-project-id="${p.id}" value="${py.betrag || ""}" placeholder="0.00" style="width:90px;text-align:center;padding:4px;">
                            </td>
                            <td class="col-center">
                              <select class="project-method-select" data-student-id="${py.student.id}" data-project-id="${p.id}" style="padding:4px;">
                                <option value="bar" ${py.methode === "bar" ? "selected" : ""}>Bar 💵</option>
                                <option value="karte" ${py.methode === "karte" ? "selected" : ""}>Bankomat 💳</option>
                              </select>
                            </td>
                            <td class="col-center" style="font-weight:600;color:${individualRefund > 0 ? "var(--accent)" : "var(--text-muted)"};">
                              ${individualRefund > 0 ? `${individualRefund.toFixed(2)} EUR` : "–"}
                            </td>
                            <td class="col-center">
                              <button class="btn btn-ghost btn-sm btn-print-student-project-receipt" data-student-id="${py.student.id}" data-project-id="${p.id}" title="Einzelbeleg drucken">🖨️</button>
                            </td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }).join('')}
    `;
  }

  container.innerHTML = `
    <div class="page-anim">
      <!-- Tabs (no-print) -->
      <div class="tabs no-print" style="margin-bottom:2rem;display:flex;gap:0.4rem;border-bottom:1px solid var(--border);">
        <button class="tab-btn ${!isFinanceTab ? "active" : ""}" id="tab-kv-schueler" style="padding:1rem 2rem;font-weight:700;font-size:1.25rem;">👥 Schüler & Dokumente</button>
        <button class="tab-btn ${isFinanceTab ? "active" : ""}" id="tab-kv-finanzen" style="padding:1rem 2rem;font-weight:700;font-size:1.25rem;">🪙 Klassenkasse & Abrechnung</button>
      </div>

      <div id="kv-tab-content">
        ${mainContentHTML}
      </div>
    </div>
  `;

  // Bind Tab switching
  container.querySelector("#tab-kv-schueler")?.addEventListener("click", () => {
    renderContent(container, kvId, { ...state, activeTab: "schueler" });
  });

  container.querySelector("#tab-kv-finanzen")?.addEventListener("click", () => {
    renderContent(container, kvId, { ...state, activeTab: "finanzen" });
  });

  if (!isFinanceTab) {
    // Search input event
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
  } else {
    // ─── EVENTS FOR TAB: KLASSENKASSE ───
    
    // Print Schulgemeinde Summary
    container.querySelector("#btn-print-finance-summary")?.addEventListener("click", () => {
      printSchulgemeindeAbrechnung(kvId, kv, all);
    });

    // Add cost project
    container.querySelector("#btn-add-finance-project")?.addEventListener("click", () => {
      showModal("Projekt hinzufügen", `
        <div class="form-group">
          <label class="form-label">Projektname</label>
          <input type="text" id="proj-new-name" placeholder="z.B. Exkursion Linz">
        </div>
        <div class="form-group">
          <label class="form-label">Soll-Beitrag pro Schüler (€)</label>
          <input type="number" id="proj-new-soll" placeholder="0.00" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">Tatsächliche Gesamtkosten (€)</label>
          <input type="number" id="proj-new-kosten" placeholder="0.00" value="0">
        </div>
      `, [
        { label: "Abbrechen", cls: "btn-ghost", onClick: () => closeModal() },
        { label: "Erstellen", cls: "btn-primary", onClick: () => {
            const name = document.getElementById("proj-new-name").value.trim();
            const soll = parseFloat(document.getElementById("proj-new-soll").value) || 0;
            const kosten = parseFloat(document.getElementById("proj-new-kosten").value) || 0;
            if (!name) { showToast("Bitte Namen angeben", "error"); return; }
            addKVClassProject(kvId, name, soll, kosten);
            closeModal();
            showToast("Sonderprojekt erstellt", "success");
            renderContent(container, kvId, state);
          }
        }
      ]);
    });

    // Edit cost project
    container.querySelectorAll(".btn-edit-project").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const soll = btn.dataset.soll;
        const kosten = btn.dataset.kosten;

        showModal("Projekt bearbeiten", `
          <div class="form-group">
            <label class="form-label">Projektname</label>
            <input type="text" id="proj-edit-name" value="${escHtml(name)}">
          </div>
          <div class="form-group">
            <label class="form-label">Soll-Beitrag pro Schüler (€)</label>
            <input type="number" id="proj-edit-soll" value="${soll}">
          </div>
          <div class="form-group">
            <label class="form-label">Tatsächliche Gesamtkosten (€)</label>
            <input type="number" id="proj-edit-kosten" value="${kosten}">
          </div>
        `, [
          { label: "Abbrechen", cls: "btn-ghost", onClick: () => closeModal() },
          { label: "Speichern", cls: "btn-primary", onClick: () => {
              const uName = document.getElementById("proj-edit-name").value.trim();
              const uSoll = parseFloat(document.getElementById("proj-edit-soll").value) || 0;
              const uKosten = parseFloat(document.getElementById("proj-edit-kosten").value) || 0;
              if (!uName) { showToast("Name erforderlich", "error"); return; }
              updateKVClassProject(kvId, id, uName, uSoll, uKosten);
              closeModal();
              showToast("Projekt aktualisiert", "success");
              renderContent(container, kvId, state);
            }
          }
        ]);
      });
    });

    // Delete cost project
    container.querySelectorAll(".btn-delete-project").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (await confirm("Dieses Projekt und alle erfassten Zahlungen endgültig löschen?")) {
          deleteKVClassProject(kvId, id);
          showToast("Projekt gelöscht", "info");
          renderContent(container, kvId, state);
        }
      });
    });

    // Payment input changes
    container.querySelectorAll(".project-payment-input").forEach(inp => {
      inp.addEventListener("change", (e) => {
        const sId = inp.dataset.studentId;
        const pId = inp.dataset.projectId;
        const val = e.target.value;
        const row = inp.closest("tr");
        const method = row.querySelector(".project-method-select").value;

        updateProjectPayment(sId, pId, val, method);
        showToast("Zahlung erfasst", "success");
        renderContent(container, kvId, state);
      });
    });

    // Payment method select changes
    container.querySelectorAll(".project-method-select").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const sId = sel.dataset.studentId;
        const pId = sel.dataset.projectId;
        const row = sel.closest("tr");
        const val = row.querySelector(".project-payment-input").value;
        const method = e.target.value;

        updateProjectPayment(sId, pId, val, method);
        showToast("Zahlungsart aktualisiert", "success");
        renderContent(container, kvId, state);
      });
    });

    // Print individual project receipt
    container.querySelectorAll(".btn-print-project-receipt").forEach(btn => {
      btn.addEventListener("click", () => {
        const pId = btn.dataset.id;
        const proj = kv.projekte?.find(p => p.id === pId);
        if (proj) {
          printProjectAbrechnung(kvId, kv, proj, all);
        }
      });
    });

    // Print single student project receipt
    container.querySelectorAll(".btn-print-student-project-receipt").forEach(btn => {
      btn.addEventListener("click", () => {
        const sId = btn.dataset.studentId;
        const pId = btn.dataset.projectId;
        const student = all.find(st => st.id === sId);
        const proj = kv.projekte?.find(p => p.id === pId);
        if (student && proj) {
          printSingleStudentProjectReceipt(kv, proj, student, all);
        }
      });
    });
  }
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



// ── Export Dialog ─────────────────────────────────────────────────
function showExportDialog(kvId, kv, filteredStudents, allStudents, filterLabel, isFiltered, mode) {
  const modeLabel = mode === "print" ? "Drucken" : "CSV exportieren";
  const state = document.getElementById("kv-class-content")?.parentElement?._kvState || {};
  
  // Find active doc filters in UI
  const activeDocKeys = Object.keys(state.docFilterObj || {}).filter(k => !!state.docFilterObj[k]);
  const hasActiveDocFilters = activeDocKeys.length > 0;

  const colOptions = [
    {key:"name",       label:"Name / Geburtsdatum", checked:true},
    {key:"alter",      label:"Alter & Ü18",         checked:true},
    {key:"spind",      label:"Spind-Nr.",            checked:true},
    {key:"schulgeld",  label:"Schulgeld",           checked:true},
    {key:"raucher",    label:"Raucher",              checked:state.generalFilter === "raucher"},
    {key:"religion",   label:"Religion",             checked:false},
    {key:"befreiungen",label:"Befreiungen",       checked:false},
    {key:"lap",        label:"Vorerhebung LAP",      checked:false},
    {key:"kommentar",  label:"Kommentar",           checked:false},
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
        <label class="form-label">Allgemeine Spalten auswählen</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
          ${colOptions.map(c=>`
            <label style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem 1rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;">
              <input type="checkbox" class="exp-col" value="${c.key}" ${c.checked?"checked":""} style="width:1.6rem;height:1.6rem;">
              <span>${c.label}</span>
            </label>`).join("")}
        </div>
      </div>

      <!-- Dokumente Spalten -->
      <div class="form-group">
        <label class="form-label">Dokumente / Checkliste im Export</label>
        <div style="font-size:1.2rem;color:var(--text-muted);margin-bottom:0.6rem;">
          ${hasActiveDocFilters ? "⚠️ Filter aktiv: Nur gefilterte Dokumente sind vorausgewählt." : "Alle Dokumente vorausgewählt."}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
          ${DOC_KEYS.map(k => {
            const isChecked = !hasActiveDocFilters || activeDocKeys.includes(k);
            return `
            <label style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem 1rem;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;">
              <input type="checkbox" class="exp-doc-col" value="${k}" ${isChecked?"checked":""} style="width:1.6rem;height:1.6rem;">
              <span>${DOC_LABELS[k]}</span>
            </label>`;
          }).join("")}
        </div>
      </div>

    </div>
  `, [
    {label:"Abbrechen", cls:"btn-ghost", onClick: closeModal},
    {label:modeLabel, cls:"btn-primary", onClick: () => {
      const scope = document.querySelector("input[name='exp-scope']:checked")?.value || "all";
      const cols = [...document.querySelectorAll(".exp-col:checked")].map(c=>c.value);
      const docs = [...document.querySelectorAll(".exp-doc-col:checked")].map(c=>c.value);
      const students = (isFiltered && scope==="filtered") ? filteredStudents : allStudents;
      
      closeModal();
      if (mode==="print") printKVFiltered(kv, students, cols, docs);
      else exportCSVFiltered(kvId, kv, students, cols, docs);
    }}
  ], "modal-lg");
}

// ── Filter-aware print & CSV ──────────────────────────────────────
function printKVFiltered(kv, students, cols, docsToPrint = []) {
  const has = k => cols.includes(k);
  const ds = {0:"[ ]",1:"[X]",2:"[-]"};
  
  const headers = [
    has("name")     && "<th>Nachname</th><th>Vorname</th><th>Geb.</th>",
    has("alter")    && "<th>Alter</th><th>Ü18</th>",
    has("spind")    && "<th>Spind</th>",
    has("schulgeld")&& "<th>BAR</th><th>KARTE</th><th>Summe</th>",
    docsToPrint.map(k=>`<th>${DOC_LABELS[k]}</th>`).join(""),
    has("raucher")  && "<th>Raucher</th>",
    has("religion") && "<th>Religion</th>",
    has("befreiungen")&&"<th>Befreiungen</th>",
    has("lap")      && "<th>LAP</th>",
    has("kommentar")&& "<th>Kommentar</th>",
  ].filter(Boolean).join("");

  const rows = students.map(s => {
    const summe = s.schulgeldBetrag || 0;
    const age = calculateAge(s.geburtsdatum);
    const ue18 = isEigenberechtigt(s.geburtsdatum);
    return "<tr>"+ [
      has("name")      && `<td><strong>${escHtml(s.nachname||s.lastName)}</strong></td><td>${escHtml(s.vorname||s.firstName)}</td><td>${s.geburtsdatum?new Date(s.geburtsdatum).toLocaleDateString("de-AT"):"-"}</td>`,
      has("alter")     && `<td>${age!==null?age:"-"}</td><td>${ue18?"J":"N"}</td>`,
      has("spind")     && `<td>${s.spindNr??"-"}</td>`,
      has("schulgeld") && `<td>${s.schulgeldMethode==='bar'?summe.toFixed(2):"0.00"}</td><td>${s.schulgeldMethode==='karte'?summe.toFixed(2):"0.00"}</td><td>${summe>0?summe.toFixed(2)+" EUR":"Offen"}</td>`,
      docsToPrint.map(k=>`<td>${ds[(s.dokumente||{})[k]]||"[ ]"}</td>`).join(""),
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

function exportCSVFiltered(kvId, kv, students, cols, docsToPrint = []) {
  const has = k => cols.includes(k);
  const ds = {0:"Offen",1:"Erledigt",2:"Nicht erforderlich"};

  const headers = [
    has("name")      && ["Nachname","Vorname","Geburtsdatum"],
    has("alter")     && ["Alter","Ue18"],
    has("spind")     && ["Spind-Nr."],
    has("schulgeld") && ["Schulgeld BAR","Schulgeld KARTE","Summe Schulgeld"],
    docsToPrint.map(k=>DOC_LABELS[k]),
    has("raucher")   && ["Raucher"],
    has("religion")  && ["Religion"],
    has("befreiungen")&&["Befreiungen"],
    has("lap")       && ["Vorerhebung LAP"],
    has("kommentar") && ["Kommentar"],
  ].filter(Boolean).flat();

  const rows = [headers, ...students.map(s => {
    const summe = s.schulgeldBetrag || 0;
    const age = calculateAge(s.geburtsdatum);
    return [
      has("name")      && [s.nachname||s.lastName, s.vorname||s.firstName, s.geburtsdatum||""],
      has("alter")     && [age!==null?age:"", isEigenberechtigt(s.geburtsdatum)?"Ja":"Nein"],
      has("spind")     && [s.spindNr??""],
      has("schulgeld") && [s.schulgeldMethode==='bar'?summe:0, s.schulgeldMethode==='karte'?summe:0, summe],
      docsToPrint.map(k=>ds[(s.dokumente||{})[k]]||"Offen"),
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

function printSchulgemeindeAbrechnung(kvId, kv, students) {
  const totalSchulgeldBar = students.reduce((sum, s) => sum + (s.schulgeldMethode === 'bar' ? (s.schulgeldBetrag || 0) : 0), 0);
  const totalSchulgeldKarte = students.reduce((sum, s) => sum + (s.schulgeldMethode === 'karte' ? (s.schulgeldBetrag || 0) : 0), 0);
  const totalSchulgeld = totalSchulgeldBar + totalSchulgeldKarte;

  const totalSpindBar = students.reduce((sum, s) => sum + (s.spindKautionMethode === 'bar' ? (s.spindKautionBetrag || 0) : 0), 0);
  const totalSpindKarte = students.reduce((sum, s) => sum + (s.spindKautionMethode === 'karte' ? (s.spindKautionBetrag || 0) : 0), 0);
  const totalSpind = totalSpindBar + totalSpindKarte;

  const w = window.open("", "_blank");
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Finanzabrechnung Schulgemeinde - ${escHtml(kv.name)}</title>
      <style>
        body { font-family: 'Inter', Arial, sans-serif; font-size: 11pt; color: #000; padding: 2cm; }
        h1 { font-size: 16pt; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        h2 { font-size: 12pt; color: #555; margin-bottom: 24px; font-weight: normal; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 10pt; }
        th { background: #f0f0f0; border: 1.5px solid #000; padding: 8px; font-weight: bold; text-align: left; }
        td { border: 1px solid #ccc; padding: 8px; }
        .total-row { font-weight: bold; background: #fafafa; border-top: 2px solid #000; }
        .footer-sig { margin-top: 60px; display: flex; justify-content: space-between; }
        .sig-box { width: 200px; border-top: 1px solid #000; text-align: center; padding-top: 6px; font-size: 9pt; }
      </style>
    </head>
    <body>
      <h1>Abrechnung Klassenkasse</h1>
      <h2>Klasse: ${escHtml(kv.name)} &bull; Datum: ${new Date().toLocaleDateString("de-AT")} &bull; Klassenvorstand: _________________</h2>
      
      <table>
        <thead>
          <tr>
            <th>Abrechnungsposten</th>
            <th>Einnahme Bar</th>
            <th>Einnahme Bankomat/Karte</th>
            <th>Summe Gesamt</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Schulgeld (Soll)</strong></td>
            <td>${totalSchulgeldBar.toFixed(2)} EUR</td>
            <td>${totalSchulgeldKarte.toFixed(2)} EUR</td>
            <td><strong>${totalSchulgeld.toFixed(2)} EUR</strong></td>
          </tr>
          <tr>
            <td><strong>Spindkautionen (Schlüssel)</strong></td>
            <td>${totalSpindBar.toFixed(2)} EUR</td>
            <td>${totalSpindKarte.toFixed(2)} EUR</td>
            <td><strong>${totalSpind.toFixed(2)} EUR</strong></td>
          </tr>
          <tr class="total-row">
            <td>GESAMTABRECHNUNG FÜR SCHULGEMEINDE</td>
            <td>${(totalSchulgeldBar + totalSpindBar).toFixed(2)} EUR</td>
            <td>${(totalSchulgeldKarte + totalSpindKarte).toFixed(2)} EUR</td>
            <td style="color:#000;">${(totalSchulgeld + totalSpind).toFixed(2)} EUR</td>
          </tr>
        </tbody>
      </table>

      <div style="font-size:9pt;color:#333;margin-top:40px;line-height:1.6;">
        <strong>Bestätigung:</strong><br>
        Hiermit wird die Richtigkeit der oben aufgeführten Einnahmen aus der Klassenkasse für die Klasse ${escHtml(kv.name)} bestätigt. 
        Die Beträge wurden entsprechend verbucht.
      </div>

      <div class="footer-sig">
        <div class="sig-box">Klassenvorstand (Datum/Unterschrift)</div>
        <div class="sig-box">Schuleiter/Schulgemeinde</div>
      </div>
    </body>
    </html>
  `);
  w.document.close();
  w.print();
}

function printProjectAbrechnung(kvId, kv, project, students) {
  const payments = students.map(s => {
    const payment = (s.projektZahlungen || {})[project.id] || { betrag: 0, methode: "bar" };
    return { student: s, ...payment };
  });
  const totalCollected = payments.reduce((sum, py) => sum + py.betrag, 0);
  const payerCount = payments.filter(py => py.betrag > 0).length;
  const refundPerStudent = payerCount > 0 && project.tatsaechlicheKosten > 0 && totalCollected > project.tatsaechlicheKosten
    ? (totalCollected - project.tatsaechlicheKosten) / payerCount
    : 0;

  const w = window.open("", "_blank");
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Projektabrechnung: ${escHtml(project.name)}</title>
      <style>
        body { font-family: 'Inter', Arial, sans-serif; font-size: 10pt; color: #000; padding: 1.5cm; }
        h1 { font-size: 15pt; margin-bottom: 2px; text-transform: uppercase; }
        h2 { font-size: 11pt; color: #555; margin-bottom: 20px; font-weight: normal; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 9pt; }
        th { background: #f0f0f0; border: 1.5px solid #000; padding: 6px; font-weight: bold; text-align: left; }
        td { border: 1px solid #ccc; padding: 6px; }
        .summary-box { display: flex; gap: 20px; margin-bottom: 24px; }
        .sum-card { border: 1px solid #000; padding: 10px; flex: 1; border-radius: 4px; }
        .sum-val { font-size: 14pt; font-weight: bold; margin-top: 4px; }
        .sig-col { width: 150px; }
      </style>
    </head>
    <body>
      <h1>Projektabrechnung & Rückzahlung</h1>
      <h2>Projekt: <strong>${escHtml(project.name)}</strong> &bull; Klasse: ${escHtml(kv.name)} &bull; Datum: ${new Date().toLocaleDateString("de-AT")}</h2>

      <div class="summary-box">
        <div class="sum-card">
          <div style="font-size:8pt;color:#555;">Eingesammelt Gesamt (${payerCount} SuS)</div>
          <div class="sum-val">${totalCollected.toFixed(2)} EUR</div>
        </div>
        <div class="sum-card">
          <div style="font-size:8pt;color:#555;">Tatsächliche Kosten</div>
          <div class="sum-val">${project.tatsaechlicheKosten.toFixed(2)} EUR</div>
        </div>
        <div class="sum-card" style="border-color: #000; background: #fafafa;">
          <div style="font-size:8pt;color:#555;font-weight:bold;">Rückerstattung pro Einzahler</div>
          <div class="sum-val" style="color:#000;">${refundPerStudent.toFixed(2)} EUR</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Schüler</th>
            <th>Zahlungsstatus</th>
            <th>Eingezahlt</th>
            <th>Rückzahlungsbetrag</th>
            <th class="sig-col">Erhalten (Handzeichen)</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map(py => {
            const hasPaid = py.betrag > 0;
            const refund = hasPaid ? refundPerStudent : 0;
            return `
              <tr>
                <td><strong>${escHtml(py.student.nachname || py.student.lastName)}</strong>, ${escHtml(py.student.vorname || py.student.firstName)}</td>
                <td>${hasPaid ? `Bezahlt (${py.methode === "bar" ? "Bar" : "Karte"})` : `<span style="color:#999;">Offen</span>`}</td>
                <td>${py.betrag.toFixed(2)} EUR</td>
                <td style="font-weight:bold;">${refund > 0 ? `${refund.toFixed(2)} EUR` : "–"}</td>
                <td style="border-bottom:1px solid #000;"></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div style="margin-top:40px;font-size:9pt;text-align:right;">
        Klassenvorstand (Unterschrift): ___________________________
      </div>
    </body>
    </html>
  `);
  w.document.close();
  w.print();
}

function printSingleStudentProjectReceipt(kv, project, student, allStudents) {
  const pay = (student.projektZahlungen || {})[project.id] || { betrag: 0, methode: "bar" };
  const hasPaid = pay.betrag > 0;
  const methodenLabels = { bar: "Bar 💵", karte: "Bankomat 💳" };

  // Calculate project refund
  const allPayments = allStudents.map(st => (st.projektZahlungen || {})[project.id] || { betrag: 0 });
  const totalCollected = allPayments.reduce((sum, py) => sum + py.betrag, 0);
  const payerCount = allPayments.filter(py => py.betrag > 0).length;
  const refundPerStudent = payerCount > 0 && project.tatsaechlicheKosten > 0 && totalCollected > project.tatsaechlicheKosten
    ? (totalCollected - project.tatsaechlicheKosten) / payerCount
    : 0;

  const refund = hasPaid ? refundPerStudent : 0;

  const w = window.open("", "_blank");
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Einzelbeleg - ${escHtml(project.name)} - ${escHtml(student.nachname || student.lastName)}</title>
      <style>
        body { font-family: 'Inter', Arial, sans-serif; font-size: 10pt; color: #000; padding: 1.5cm; line-height: 1.4; }
        h1 { font-size: 14pt; margin-bottom: 2px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 6px; }
        h2 { font-size: 11pt; color: #444; margin-bottom: 20px; font-weight: normal; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; background: #f9f9f9; padding: 12px; border: 1px solid #ddd; border-radius: 4px; }
        .meta-item { font-size: 9.5pt; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 9pt; }
        th { background: #f0f0f0; border: 1px solid #000; padding: 6px; font-weight: bold; text-align: left; }
        td { border: 1px solid #ccc; padding: 6px; }
        .refund-total-box { border: 1.5px solid #10b981; background: #f0fdf4; padding: 12px; font-size: 11pt; font-weight: bold; text-align: center; border-radius: 4px; margin-bottom: 30px; }
        .footer-sig { margin-top: 50px; display: flex; justify-content: space-between; }
        .sig-box { width: 220px; border-top: 1px solid #000; text-align: center; padding-top: 6px; font-size: 8.5pt; }
      </style>
    </head>
    <body>
      <h1>Abrechnungsbeleg / Quittung</h1>
      <h2>Projekt: <strong>${escHtml(project.name)}</strong> &bull; Klasse: ${escHtml(kv.name)}</h2>

      <div class="meta-grid">
        <div class="meta-item">
          <strong>Schüler/in:</strong><br>
          <span style="font-size:11pt;font-weight:bold;">${escHtml(student.nachname || student.lastName)}, ${escHtml(student.vorname || student.firstName)}</span>
        </div>
        <div class="meta-item" style="text-align:right;">
          <strong>Datum:</strong><br>
          ${new Date().toLocaleDateString("de-AT")}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Posten</th>
            <th>Soll-Beitrag</th>
            <th>Eingezahlter Betrag</th>
            <th>Guthaben / Rückzahlung</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Projektkosten (${escHtml(project.name)})</strong></td>
            <td>${project.sollProSchueler.toFixed(2)} EUR</td>
            <td>${hasPaid ? `${pay.betrag.toFixed(2)} EUR (${methodenLabels[pay.methode] || pay.methode})` : `<span style="color:#666;">Nicht eingezahlt</span>`}</td>
            <td style="font-weight:bold;color:${refund > 0 ? '#10b981' : '#000'};">
              ${refund > 0 ? `${refund.toFixed(2)} EUR` : "–"}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Rückzahlungssumme -->
      <div class="refund-total-box">
        RÜCKZAHLUNGSBETRAG (GUTHABEN): ${refund.toFixed(2)} EUR
      </div>

      <div style="font-size:8.5pt;color:#333;margin-top:20px;line-height:1.5;">
        <strong>Empfangsbestätigung:</strong><br>
        Hiermit bestätige ich, den oben angeführten Rückzahlungsbetrag in Höhe von 
        <strong>${refund.toFixed(2)} EUR</strong> ordnungsgemäß in bar erhalten zu haben.
      </div>

      <div class="footer-sig">
        <div class="sig-box">Klassenvorstand (Auszahlung)</div>
        <div class="sig-box">Schüler/in bzw. Erziehungsberechtigte/r (Erhalt)</div>
      </div>
    </body>
    </html>
  `);
  w.document.close();
  w.print();
}

