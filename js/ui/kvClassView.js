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
  document.getElementById("btn-kv-print")?.addEventListener("click", () => printKV(kvId));
  document.getElementById("btn-kv-csv")?.addEventListener("click",  () => exportCSV(kvId));
  document.getElementById("btn-assign-student")?.addEventListener("click", () => showAssignModal(kvId, container));
}

function renderContent(container, kvId, state) {
  const kv = getKVClass(kvId);
  let students = getKVStudents(kvId);
  if (state.search) {
    const q = state.search.toLowerCase();
    students = students.filter(s => ((s.nachname||s.lastName||"")+" "+(s.vorname||s.firstName||"")).toLowerCase().includes(q));
  }
  switch(state.filter) {
    case "missing_docs":  students = students.filter(s => DOC_KEYS.some(k => (s.dokumente||{})[k]===0)); break;
    case "open_payment":  students = students.filter(s => (s.schulgeldBar||0)+(s.schulgeldKarte||0)===0); break;
    case "raucher":       students = students.filter(s => s.raucher); break;
    case "u18":           students = students.filter(s => !isEigenberechtigt(s.geburtsdatum)); break;
    case "ue18":          students = students.filter(s => isEigenberechtigt(s.geburtsdatum)); break;
  }
  students = [...students].sort((a,b) => state.sort==="spind" ? (a.spindNr||999)-(b.spindNr||999)
    : ((a.nachname||a.lastName)+(a.vorname||a.firstName)).localeCompare((b.nachname||b.lastName)+(b.vorname||b.firstName),"de"));

  const all = getKVStudents(kvId);
  const offeneDocs = all.filter(s => DOC_KEYS.some(k => (s.dokumente||{})[k]===0)).length;
  const offeneZahlung = all.filter(s => (s.schulgeldBar||0)+(s.schulgeldKarte||0)===0).length;
  const avgPct = all.length ? Math.round(all.reduce((sum,s)=>sum+docProgress(s).pct,0)/all.length) : 0;

  const filterBtns = [["all","Alle"],["missing_docs","Fehlende Docs"],["open_payment","Offene Zahlung"],["raucher","Raucher"],["u18","U18"],["ue18","Ue18"]];

  container.innerHTML = `<div class="page-anim">
    <div class="grid-3" style="margin-bottom:2.4rem;">
      <div class="card" style="text-align:center;"><div class="stat-card-label">Schueler</div><div class="stat-card-value">${all.length}</div></div>
      <div class="card" style="text-align:center;"><div class="stat-card-label">Fehlende Docs</div><div class="stat-card-value" style="color:${offeneDocs>0?"var(--grade-5)":"var(--grade-1)"};">${offeneDocs}</div></div>
      <div class="card" style="text-align:center;"><div class="stat-card-label">Offene Zahlung</div><div class="stat-card-value" style="color:${offeneZahlung>0?"var(--grade-5)":"var(--grade-1)"};">${offeneZahlung}</div></div>
    </div>
    <div class="card" style="margin-bottom:2rem;padding:1.4rem 2rem;">
      <div style="display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap;">
        <div style="position:relative;flex:1;min-width:18rem;">
          <svg style="position:absolute;left:1.2rem;top:50%;transform:translateY(-50%);opacity:.4;" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="kv-search" placeholder="Name suchen..." value="${escHtml(state.search)}" style="padding-left:3.6rem;width:100%;">
        </div>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
          ${filterBtns.map(([v,l])=>`<button class="btn btn-sm ${state.filter===v?"btn-primary":"btn-ghost"} kv-filter-btn" data-filter="${v}">${l}</button>`).join("")}
        </div>
        <select id="kv-sort" style="padding:0.7rem 1.2rem;background:var(--bg-input);border:1px solid var(--border-md);border-radius:var(--r-sm);color:var(--text-primary);">
          <option value="name" ${state.sort==="name"?"selected":""}>A-Z</option>
          <option value="spind" ${state.sort==="spind"?"selected":""}>Spind-Nr.</option>
        </select>
        <div style="position:relative;">
          <button class="btn btn-ghost btn-sm" id="bulk-btn">Bulk-Aktionen</button>
          <div id="bulk-menu" style="display:none;position:absolute;right:0;top:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-md);z-index:100;min-width:26rem;padding:0.8rem;box-shadow:var(--shadow-md);">
            ${DOC_KEYS.map(k=>`<button class="btn btn-ghost btn-sm bulk-doc-btn" data-key="${k}" style="width:100%;text-align:left;margin-bottom:0.4rem;">Alle <strong>${DOC_LABELS[k]}</strong> - Erledigt</button>`).join("")}
          </div>
        </div>
      </div>
    </div>
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

  container.querySelector("#kv-search")?.addEventListener("input", e =>
    renderContent(container, kvId, {...state, search: e.target.value}));
  container.querySelectorAll(".kv-filter-btn").forEach(btn =>
    btn.addEventListener("click", () => renderContent(container, kvId, {...state, filter: btn.dataset.filter})));
  container.querySelector("#kv-sort")?.addEventListener("change", e =>
    renderContent(container, kvId, {...state, sort: e.target.value}));

  const bulkBtn = container.querySelector("#bulk-btn");
  const bulkMenu = container.querySelector("#bulk-menu");
  bulkBtn?.addEventListener("click", e => { e.stopPropagation(); bulkMenu.style.display = bulkMenu.style.display==="none"?"block":"none"; });
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
    <button class="btn btn-ghost btn-sm" id="btn-new-global-student">+ Neuen Schueler anlegen</button>
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
  },50);
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
