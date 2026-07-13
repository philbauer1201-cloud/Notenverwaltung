/**
 * kvStudentView.js - KV Schueler-Detailansicht
 * 4 Tabs: Stammdaten / Finanzen / Dokumente / Zusatz
 */
import {
  getKVClass, getGlobalStudents, updateStudent, calculateAge, isEigenberechtigt, getSetting,
  getKVStudents, updateProjectPayment
} from "../db.js";
import { navigate, showToast } from "../app.js";

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

export function renderKVStudentView(container, kvId, studentId) {
  const db = getGlobalStudents();
  const student = db.find(s => s.id === studentId);
  const kv = getKVClass(kvId);
  if (!student) { container.innerHTML = "<div class='empty-state'><h3>Schueler nicht gefunden</h3></div>"; return; }

  const name = `${escHtml(student.nachname||student.lastName)} ${escHtml(student.vorname||student.firstName)}`;
  const age = calculateAge(student.geburtsdatum);
  const ue18 = isEigenberechtigt(student.geburtsdatum);

  document.getElementById("topbar-breadcrumb").innerHTML =
    `<a href="#kv_dashboard" style="color:var(--text-secondary);text-decoration:none;">KV-Klassen</a>
     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
     <a href="#kv_class/${kvId}" style="color:var(--text-secondary);text-decoration:none;">${escHtml(kv?.name||"")}</a>
     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
     <strong>${name}</strong>`;
  document.getElementById("topbar-actions").innerHTML = `
    <button class="btn btn-ghost btn-sm" id="btn-back-kv">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
      Zurueck
    </button>
    <button class="btn btn-primary btn-sm" id="btn-save-student">Speichern</button>`;

  const initials = ((student.vorname||student.firstName||"?").charAt(0)+((student.nachname||student.lastName||"").charAt(0))).toUpperCase();
  const docs = student.dokumente || {};
  const erledigt = DOC_KEYS.filter(k=>docs[k]===1||docs[k]===2).length;
  const docPct = Math.round(erledigt/DOC_KEYS.length*100);
  const summe = (student.schulgeldBar||0)+(student.schulgeldKarte||0);
  const schulgeldDefault = getSetting("schulgeldDefault")||30;

  const docStatusLabel = {0:"Offen",1:"Erledigt",2:"Nicht erf."};
  const docStatusColor = {0:"var(--grade-5)",1:"var(--grade-1)",2:"var(--text-muted)"};

  container.innerHTML = `<div class="page-anim">
    <!-- Header -->
    <div class="student-header" style="margin-bottom:2.8rem;">
      ${student.photo
        ? `<img src="${student.photo}" style="width:5rem;height:5rem;border-radius:50%;object-fit:cover;border:2.5px solid var(--accent);flex-shrink:0;">`
        : `<div class="student-avatar" style="width:5rem;height:5rem;font-size:1.8rem;display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:50%;background:var(--bg-card-3);border:2.5px solid var(--border);">${initials}</div>`
      }
      <div class="student-header-info">
        <h2>${name}</h2>
        <p>
          ${age!==null?`${age} Jahre &bull;`:""}
          ${ue18?`<span style="color:var(--grade-1);font-weight:600;">Eigenberechigt (Ue18)</span>`:`<span style="color:var(--grade-5);font-weight:600;">Nicht eigenberechigt (U18)</span>`}
          ${kv?` &bull; ${escHtml(kv.name)}`:""}
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab-btn active" data-tab="stammdaten">Stammdaten</button>
      <button class="tab-btn" data-tab="finanzen">Finanzen</button>
      <button class="tab-btn" data-tab="dokumente">
        Dokumente
        <span class="chip ${docPct===100?"chip-accent":""}" style="margin-left:0.8rem;padding:0.2rem 0.8rem;">${erledigt}/${DOC_KEYS.length}</span>
      </button>
      <button class="tab-btn" data-tab="zusatz">Zusatz</button>
    </div>

    <!-- Tab: Stammdaten -->
    <div class="tab-panel active" id="tab-stammdaten">
      <div class="card" style="max-width:70rem;">
        <div class="section-title">Stammdaten</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nachname</label>
            <input type="text" id="s-nachname" value="${escHtml(student.nachname||student.lastName||"")}">
          </div>
          <div class="form-group">
            <label class="form-label">Vorname</label>
            <input type="text" id="s-vorname" value="${escHtml(student.vorname||student.firstName||"")}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Geburtsdatum</label>
            <input type="date" id="s-geb" value="${escHtml(student.geburtsdatum||"")}">
          </div>
          <div class="form-group">
            <label class="form-label">Alter (berechnet)</label>
            <div id="s-alter-display" style="padding:0.9rem 1.2rem;background:var(--bg-card-2);border-radius:var(--r-sm);border:1px solid var(--border);font-family:'JetBrains Mono',monospace;font-weight:600;">
              ${age!==null?age+" Jahre":"-"}
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Eigenberechigt (Ue18)</label>
          <div style="padding:0.9rem 1.2rem;background:var(--bg-card-2);border-radius:var(--r-sm);border:1px solid var(--border);">
            <span id="s-ue18-display" style="font-weight:700;color:${ue18?"var(--grade-1)":"var(--grade-5)"};">
              ${ue18?"Ja - eigenberechigt":"Nein - nicht eigenberechigt"}
            </span>
          </div>
          <div class="form-hint">Wird automatisch berechnet (Geburtsdatum + 18 Jahre)</div>
        </div>
        <div class="form-group">
          <label class="form-label">Schulinterne Nr. <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
          <input type="text" id="s-schulnr" value="${escHtml(student.schulNr||"")}" placeholder="z.B. 2025-042">
          <div class="form-hint">Eigene Kennung der Schule (z.B. Schüler-Nummer aus dem Schulverwaltungsprogramm)</div>
        </div>
      </div>
    </div>

    <!-- Tab: Finanzen -->
    <div class="tab-panel" id="tab-finanzen">
      <div class="card" style="max-width:70rem;margin-bottom:2rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.6rem;flex-wrap:wrap;gap:1rem;">
          <div class="section-title" style="margin:0;">Infrastruktur &amp; Finanzen</div>
          <button class="btn btn-ghost btn-sm" id="btn-print-student-receipt" type="button">🖨️ Einzelbeleg drucken</button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Spind-Nr.</label>
            <input type="number" id="s-spind" value="${student.spindNr!==null&&student.spindNr!==undefined?student.spindNr:""}" placeholder="z.B. 42" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">Schloss bezahlt</label>
            <div style="display:flex;align-items:center;gap:2rem;padding-top:0.8rem;">
              <label class="toggle-wrap">
                <div class="toggle-switch">
                  <input type="checkbox" id="s-schloss" ${student.schlossBezahlt?"checked":""}>
                  <div class="toggle-slider"></div>
                </div>
                <span id="s-schloss-label">${student.schlossBezahlt?"Ja (5 EUR)":"Nein (0 EUR)"}</span>
              </label>
            </div>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Spindkaution Betrag (EUR)</label>
            <input type="number" id="s-spind-kaution-betrag" value="${student.spindKautionBetrag||0}" min="0" step="0.01">
          </div>
          <div class="form-group">
            <label class="form-label">Zahlungsart Kaution</label>
            <select id="s-spind-kaution-methode" style="width:100%;padding:0.9rem 1.2rem;background:var(--bg-input);border:1px solid var(--border-md);border-radius:var(--r-sm);color:var(--text-primary);">
              <option value="bar" ${student.spindKautionMethode === "bar" ? "selected" : ""}>Bar 💵</option>
              <option value="karte" ${student.spindKautionMethode === "karte" ? "selected" : ""}>Bankomat 💳</option>
            </select>
          </div>
        </div>

        <div class="divider"></div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Schulgeld Betrag (EUR)</label>
            <div style="display:flex;gap:0.8rem;">
              <input type="number" id="s-schulgeld-betrag" value="${student.schulgeldBetrag||0}" min="0" step="0.01" style="flex:1;">
              <button class="btn btn-ghost btn-sm" id="btn-smartfill-schulgeld" title="Standardbetrag uebernehmen" type="button">${schulgeldDefault} EUR</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Zahlungsart Schulgeld</label>
            <select id="s-schulgeld-methode" style="width:100%;padding:0.9rem 1.2rem;background:var(--bg-input);border:1px solid var(--border-md);border-radius:var(--r-sm);color:var(--text-primary);">
              <option value="bar" ${student.schulgeldMethode === "bar" ? "selected" : ""}>Bar 💵</option>
              <option value="karte" ${student.schulgeldMethode === "karte" ? "selected" : ""}>Bankomat 💳</option>
            </select>
          </div>
        </div>
        <div style="padding:1.4rem 2rem;background:var(--bg-card-2);border-radius:var(--r-md);border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;color:var(--text-secondary);">Summe Schulgeld</span>
          <span id="s-summe" style="font-size:2.4rem;font-weight:800;font-family:'JetBrains Mono',monospace;color:${summe>0?"var(--grade-1)":"var(--grade-5)"};">${summe.toFixed(2)} EUR</span>
        </div>
      </div>

      <!-- Sonderprojekte & Exkursionen -->
      <div class="card" style="max-width:70rem;">
        <div class="section-title">🎒 Exkursionen &amp; Sonderprojekte</div>
        
        ${(kv?.projekte || []).length === 0 
          ? `<p style="color:var(--text-muted);font-size:1.15rem;padding:1rem;">Für diese Klasse sind keine Sonderprojekte angelegt.</p>`
          : `
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Projekt</th>
                    <th class="col-center">Soll-Beitrag</th>
                    <th class="col-center">Eingezahlt (EUR)</th>
                    <th class="col-center">Zahlungsart</th>
                    <th class="col-center">Guthaben / Rückzahlung</th>
                  </tr>
                </thead>
                <tbody>
                  ${(kv.projekte || []).map(p => {
                    const pay = (student.projektZahlungen || {})[p.id] || { betrag: 0, methode: "bar" };
                    const studentsAll = getKVStudents(kvId);
                    const allPayments = studentsAll.map(st => (st.projektZahlungen || {})[p.id] || { betrag: 0 });
                    const totalCollected = allPayments.reduce((sum, py) => sum + py.betrag, 0);
                    const payerCount = allPayments.filter(py => py.betrag > 0).length;
                    
                    const refundPerStudent = payerCount > 0 && p.tatsaechlicheKosten > 0 && totalCollected > p.tatsaechlicheKosten
                      ? (totalCollected - p.tatsaechlicheKosten) / payerCount
                      : 0;

                    const hasPaid = pay.betrag > 0;
                    const individualRefund = hasPaid ? refundPerStudent : 0;

                    return `
                      <tr class="student-project-payment-row" data-project-id="${p.id}">
                        <td style="font-weight:600;">${escHtml(p.name)}</td>
                        <td class="col-center">${p.sollProSchueler.toFixed(2)} EUR</td>
                        <td class="col-center">
                          <input type="number" class="student-project-payment-input" data-project-id="${p.id}" value="${pay.betrag || ""}" placeholder="0.00" style="width:90px;text-align:center;padding:4px;">
                        </td>
                        <td class="col-center">
                          <select class="student-project-method-select" data-project-id="${p.id}" style="padding:4px;">
                            <option value="bar" ${pay.methode === "bar" ? "selected" : ""}>Bar 💵</option>
                            <option value="karte" ${pay.methode === "karte" ? "selected" : ""}>Bankomat 💳</option>
                          </select>
                        </td>
                        <td class="col-center" style="font-weight:600;color:${individualRefund > 0 ? "var(--accent)" : "var(--text-muted)"};">
                          ${individualRefund > 0 ? `${individualRefund.toFixed(2)} EUR` : "–"}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `
        }
      </div>
    </div>

    <!-- Tab: Dokumente -->
    <div class="tab-panel" id="tab-dokumente">
      <div class="card" style="max-width:70rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2rem;flex-wrap:wrap;gap:1rem;">
          <div class="section-title" style="margin-bottom:0;">Dokumente-Checkliste</div>
          <span style="font-size:1.5rem;font-weight:700;color:${docPct===100?"var(--grade-1)":docPct>=60?"var(--grade-3)":"var(--grade-5)"};">${erledigt}/${DOC_KEYS.length} erledigt</span>
        </div>
        <div class="progress-bar" style="height:0.8rem;margin-bottom:2.4rem;">
          <div class="progress-bar-fill" style="width:${docPct}%;background:${docPct===100?"var(--grade-1)":docPct>=60?"var(--grade-3)":"var(--grade-5)"};"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:1.2rem;" id="doc-list">
          ${DOC_KEYS.map(k => {
            const val = docs[k]||0;
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:1.2rem 1.6rem;background:var(--bg-card-2);border:1px solid var(--border);border-radius:var(--r-sm);">
              <span style="font-weight:500;">${DOC_LABELS[k]}</span>
              <div style="display:flex;gap:0.6rem;">
                <button class="btn btn-sm doc-status-btn ${val===0?"btn-primary":"btn-ghost"}" data-key="${k}" data-val="0">Offen</button>
                <button class="btn btn-sm doc-status-btn ${val===1?"btn-primary":"btn-ghost"}" data-key="${k}" data-val="1">Erledigt</button>
                <button class="btn btn-sm doc-status-btn ${val===2?"btn-primary":"btn-ghost"}" data-key="${k}" data-val="2">Nicht erf.</button>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <!-- Tab: Zusatz -->
    <div class="tab-panel" id="tab-zusatz">
      <div class="card" style="max-width:70rem;">
        <div class="section-title">Zusatzinformationen</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Raucher</label>
            <label class="toggle-wrap" style="padding-top:0.8rem;">
              <div class="toggle-switch">
                <input type="checkbox" id="s-raucher" ${student.raucher?"checked":""}>
                <div class="toggle-slider"></div>
              </div>
              <span>${student.raucher?"Ja":"Nein"}</span>
            </label>
          </div>
          <div class="form-group">
            <label class="form-label">Vorerhebung LAP</label>
            <label class="toggle-wrap" style="padding-top:0.8rem;">
              <div class="toggle-switch">
                <input type="checkbox" id="s-lap" ${student.vorerhebungLAP?"checked":""}>
                <div class="toggle-slider"></div>
              </div>
              <span>${student.vorerhebungLAP?"Erledigt":"Ausstehend"}</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Religion</label>
          <select id="s-religion" style="width:100%;padding:0.9rem 1.2rem;background:var(--bg-input);border:1px solid var(--border-md);border-radius:var(--r-sm);color:var(--text-primary);">
            <option value="">Keine Angabe</option>
            ${["Roemisch-Katholisch","Evangelisch","Islamisch","Ohne Bekenntnis","Sonstige"].map(r=>
              `<option value="${r}" ${student.religion===r?"selected":""}>${r}</option>`).join("")}
          </select>
          <input type="text" id="s-religion-txt" placeholder="Sonstige (Freitext)..." style="margin-top:0.8rem;" value="${escHtml(["Roemisch-Katholisch","Evangelisch","Islamisch","Ohne Bekenntnis","Sonstige"].includes(student.religion)?"":student.religion||"")}">
        </div>
        <div class="form-group">
          <label class="form-label">Befreiungen</label>
          <textarea id="s-befreiungen" rows="3" placeholder="z.B. Turnbefreiung, Religionsbefreiung...">${escHtml(student.befreiungen||"")}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Kommentar</label>
          <textarea id="s-kommentar" rows="4" placeholder="Individuelle Anmerkungen...">${escHtml(student.kommentar||"")}</textarea>
        </div>
      </div>
    </div>
  </div>`;

  // Tab switching
  container.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
      container.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      container.querySelector(`#tab-${btn.dataset.tab}`)?.classList.add("active");
    });
  });

  // Live update: Geburtsdatum -> Alter & Ue18
  container.querySelector("#s-geb")?.addEventListener("change", e => {
    const val = e.target.value;
    const a = calculateAge(val);
    const ue = isEigenberechtigt(val);
    container.querySelector("#s-alter-display").textContent = a!==null?a+" Jahre":"-";
    const el = container.querySelector("#s-ue18-display");
    el.textContent = ue?"Ja - eigenberechigt":"Nein - nicht eigenberechigt";
    el.style.color = ue?"var(--grade-1)":"var(--grade-5)";
  });

  // Schloss toggle label
  container.querySelector("#s-schloss")?.addEventListener("change", e => {
    container.querySelector("#s-schloss-label").textContent = e.target.checked?"Ja (5 EUR)":"Nein (0 EUR)";
  });

  // SmartFill buttons
  container.querySelector("#btn-smartfill-schulgeld")?.addEventListener("click", () => {
    document.getElementById("s-schulgeld-betrag").value = schulgeldDefault;
    updateSumme();
  });

  // Live summe
  function updateSumme() {
    const s = parseFloat(document.getElementById("s-schulgeld-betrag")?.value)||0;
    const el = container.querySelector("#s-summe");
    if(el){ el.textContent = s.toFixed(2)+" EUR"; el.style.color = s>0?"var(--grade-1)":"var(--grade-5)"; }
  }
  container.querySelector("#s-schulgeld-betrag")?.addEventListener("input", updateSumme);

  // Raucher toggle label
  container.querySelector("#s-raucher")?.addEventListener("change", e => {
    e.target.closest("label").querySelector("span").textContent = e.target.checked?"Ja":"Nein";
  });

  // LAP toggle label
  container.querySelector("#s-lap")?.addEventListener("change", e => {
    e.target.closest("label").querySelector("span").textContent = e.target.checked?"Erledigt":"Ausstehend";
  });

  // Doc status buttons (dreistufig)
  container.querySelectorAll(".doc-status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const val = parseInt(btn.dataset.val);
      // Update all buttons for this key
      container.querySelectorAll(`.doc-status-btn[data-key="${key}"]`).forEach(b => {
        b.className = `btn btn-sm doc-status-btn ${parseInt(b.dataset.val)===val?"btn-primary":"btn-ghost"}`;
      });
      // Save immediately
      const s2 = getGlobalStudents().find(s=>s.id===studentId);
      if(s2) updateStudent(studentId, {dokumente:{...s2.dokumente,[key]:val}});
      // Update progress
      const s3 = getGlobalStudents().find(s=>s.id===studentId);
      const done = DOC_KEYS.filter(k=>(s3?.dokumente||{})[k]===1||(s3?.dokumente||{})[k]===2).length;
      const pct2 = Math.round(done/DOC_KEYS.length*100);
      const pBar = container.querySelector(".progress-bar-fill");
      const pLabel = container.querySelector(".tabs .chip");
      if(pBar){ pBar.style.width=pct2+"%"; pBar.style.background=pct2===100?"var(--grade-1)":pct2>=60?"var(--grade-3)":"var(--grade-5)"; }
      if(pLabel) pLabel.textContent=`${done}/${DOC_KEYS.length}`;
    });
  });

  // Back button
  document.getElementById("btn-back-kv")?.addEventListener("click", () => navigate("kv_class",{courseId:kvId}));

  // Save button
  document.getElementById("btn-save-student")?.addEventListener("click", () => {
    const nn = document.getElementById("s-nachname")?.value.trim()||"";
    const vn = document.getElementById("s-vorname")?.value.trim()||"";
    const geb = document.getElementById("s-geb")?.value||"";
    const spind = document.getElementById("s-spind")?.value;
    const schloss = document.getElementById("s-schloss")?.checked||false;
    
    // Schulgeld & Kaution
    const schulgeldBetrag = parseFloat(document.getElementById("s-schulgeld-betrag")?.value)||0;
    const schulgeldMethode = document.getElementById("s-schulgeld-methode")?.value||"bar";
    const spindKautionBetrag = parseFloat(document.getElementById("s-spind-kaution-betrag")?.value)||0;
    const spindKautionMethode = document.getElementById("s-spind-kaution-methode")?.value||"bar";

    const raucher = document.getElementById("s-raucher")?.checked||false;
    const lap = document.getElementById("s-lap")?.checked||false;
    const relSelect = document.getElementById("s-religion")?.value||"";
    const relTxt = document.getElementById("s-religion-txt")?.value.trim()||"";
    const religion = relSelect==="Sonstige"&&relTxt ? relTxt : relSelect;
    const befreiungen = document.getElementById("s-befreiungen")?.value||"";
    const kommentar = document.getElementById("s-kommentar")?.value||"";
    const schulNr = document.getElementById("s-schulnr")?.value.trim()||"";
    if(!nn||!vn) return showToast("Nachname und Vorname erforderlich","error");
    
    // 1. Update Student standard & infrastructure fields
    updateStudent(studentId, {
      nachname:nn, vorname:vn, firstName:vn, lastName:nn, geburtsdatum:geb,
      schulNr,
      spindNr: spind!==null&&spind!==""?parseInt(spind):null,
      spindKautionBetrag, spindKautionMethode,
      schlossBezahlt:schloss, schulgeldBetrag, schulgeldMethode,
      raucher, vorerhebungLAP:lap, religion, befreiungen, kommentar
    });

    // 2. Collect and save all custom project payments from inputs
    container.querySelectorAll(".student-project-payment-row").forEach(row => {
      const pId = row.dataset.projectId;
      const payInp = row.querySelector(".student-project-payment-input");
      const methodSel = row.querySelector(".student-project-method-select");
      if (payInp && methodSel) {
        const val = payInp.value;
        const method = methodSel.value;
        updateProjectPayment(studentId, pId, val, method);
      }
    });

    showToast("Gespeichert","success");
    // Refresh display
    renderKVStudentView(container, kvId, studentId);
  });

  // Print single student receipt
  container.querySelector("#btn-print-student-receipt")?.addEventListener("click", () => {
    printSingleStudentReceipt(kv, student, kv.projekte || []);
  });
}

function printSingleStudentReceipt(kv, student, projects) {
  const escHtml = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const summeSchulgeld = student.schulgeldBetrag || 0;
  const methodenLabels = { bar: "Bar 💵", karte: "Bankomat 💳" };

  // Calculate project details
  let totalRefund = 0;
  const projectRows = projects.map(p => {
    const pay = (student.projektZahlungen || {})[p.id] || { betrag: 0, methode: "bar" };
    const hasPaid = pay.betrag > 0;
    
    // We need the global refund calculation for this project
    const allStudents = getKVStudents(kv.id);
    const allPayments = allStudents.map(st => (st.projektZahlungen || {})[p.id] || { betrag: 0 });
    const totalCollected = allPayments.reduce((sum, py) => sum + py.betrag, 0);
    const payerCount = allPayments.filter(py => py.betrag > 0).length;
    const refundPerStudent = payerCount > 0 && p.tatsaechlicheKosten > 0 && totalCollected > p.tatsaechlicheKosten
      ? (totalCollected - p.tatsaechlicheKosten) / payerCount
      : 0;

    const refund = hasPaid ? refundPerStudent : 0;
    totalRefund += refund;

    return `
      <tr>
        <td><strong>${escHtml(p.name)}</strong></td>
        <td>${p.sollProSchueler.toFixed(2)} EUR</td>
        <td>${hasPaid ? `${pay.betrag.toFixed(2)} EUR (${methodenLabels[pay.methode] || pay.methode})` : `<span style="color:#666;">Nicht eingezahlt</span>`}</td>
        <td style="font-weight:bold;color:${refund > 0 ? '#10b981' : '#000'};">
          ${refund > 0 ? `${refund.toFixed(2)} EUR` : "–"}
        </td>
      </tr>
    `;
  }).join("");

  const w = window.open("", "_blank");
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Finanzbeleg - ${escHtml(student.nachname || student.lastName)}, ${escHtml(student.vorname || student.firstName)}</title>
      <style>
        body { font-family: 'Inter', Arial, sans-serif; font-size: 10pt; color: #000; padding: 1.5cm; line-height: 1.4; }
        h1 { font-size: 14pt; margin-bottom: 2px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 6px; }
        h2 { font-size: 11pt; color: #444; margin-bottom: 20px; font-weight: normal; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; background: #f9f9f9; padding: 12px; border: 1px solid #ddd; border-radius: 4px; }
        .meta-item { font-size: 9.5pt; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 9pt; }
        th { background: #f0f0f0; border: 1px solid #000; padding: 6px; font-weight: bold; text-align: left; }
        td { border: 1px solid #ccc; padding: 6px; }
        .section-title { font-size: 11pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .refund-total-box { border: 1.5px solid #10b981; background: #f0fdf4; padding: 12px; font-size: 11pt; font-weight: bold; text-align: center; border-radius: 4px; margin-bottom: 30px; }
        .footer-sig { margin-top: 50px; display: flex; justify-content: space-between; }
        .sig-box { width: 220px; border-top: 1px solid #000; text-align: center; padding-top: 6px; font-size: 8.5pt; }
      </style>
    </head>
    <body>
      <h1>Finanzbeleg & Quittung</h1>
      <h2>Klasse: ${escHtml(kv.name)} &bull; Stand: ${new Date().toLocaleDateString("de-AT")}</h2>

      <div class="meta-grid">
        <div class="meta-item">
          <strong>Schüler/in:</strong><br>
          <span style="font-size:11pt;font-weight:bold;">${escHtml(student.nachname || student.lastName)}, ${escHtml(student.vorname || student.firstName)}</span>
        </div>
        <div class="meta-item" style="text-align:right;">
          <strong>Klassenvorstand:</strong><br>
          ___________________________
        </div>
      </div>

      <!-- Bereich 1: Fixe Einnahmen -->
      <div class="section-title">🔒 Fixe Beiträge (Schule & Infrastruktur)</div>
      <table>
        <thead>
          <tr>
            <th>Posten</th>
            <th>Zahlungsstatus / Betrag</th>
            <th>Zahlungsart</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Schulgeld (Soll)</strong></td>
            <td>${summeSchulgeld > 0 ? `${summeSchulgeld.toFixed(2)} EUR` : "Offen"}</td>
            <td>${summeSchulgeld > 0 ? (methodenLabels[student.schulgeldMethode] || student.schulgeldMethode) : "–"}</td>
          </tr>
          <tr>
            <td><strong>Spindkaution</strong></td>
            <td>${(student.spindKautionBetrag || 0) > 0 ? `${student.spindKautionBetrag.toFixed(2)} EUR` : "Offen"}</td>
            <td>${(student.spindKautionBetrag || 0) > 0 ? (methodenLabels[student.spindKautionMethode] || student.spindKautionMethode) : "–"}</td>
          </tr>
          <tr>
            <td><strong>Spindschloss</strong></td>
            <td>${student.schlossBezahlt ? "Bezahlt (5.00 EUR)" : "Offen (0.00 EUR)"}</td>
            <td>Bar 💵</td>
          </tr>
        </tbody>
      </table>

      <!-- Bereich 2: Sonderprojekte -->
      <div class="section-title">🎒 Exkursionen & Sonderprojekte</div>
      ${projects.length === 0 
        ? `<p style="color:#666;font-style:italic;margin-bottom:25px;">Keine Exkursionen oder Sonderprojekte erfasst.</p>`
        : `
          <table>
            <thead>
              <tr>
                <th>Projektname</th>
                <th>Soll-Beitrag</th>
                <th>Eingezahlt</th>
                <th>Guthaben / Erstattung</th>
              </tr>
            </thead>
            <tbody>
              ${projectRows}
            </tbody>
          </table>
        `
      }

      <!-- Rückzahlungssumme -->
      <div class="refund-total-box">
        AUSZAHLUNGSBETRAG (GESAMTERSTATTUNG GUTHABEN): ${totalRefund.toFixed(2)} EUR
      </div>

      <div style="font-size:8.5pt;color:#333;margin-top:20px;line-height:1.5;">
        <strong>Empfangsbestätigung:</strong><br>
        Hiermit bestätige ich, den oben angeführten Auszahlungsbetrag (Gesamterstattung Guthaben) in Höhe von 
        <strong>${totalRefund.toFixed(2)} EUR</strong> ordnungsgemäß in bar erhalten zu haben.
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
