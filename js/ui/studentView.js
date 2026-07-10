/**
 * studentView.js – Schüler-Detail-Ansicht
 * Alle Noten, Diagramme, Leistungsprofil, Endnote
 */

import { getCourse, getFinalGrade, saveFinalGrade } from '../db.js';
import { computeStudentProfile, computeParticipationLevel, getResultLevel, buildTimeline, gradeClass, GRADE_LABELS, formatPct } from '../grading.js';
import { renderTimelineChart, renderDistributionChart, renderCategoryDonut } from '../charts.js';
import { showToast, navigate, showModal, closeModal } from '../app.js';
import { renderAssessmentEditor } from './assessmentEditor.js';

export function renderStudentView(container, courseId, studentId) {
  const course = getCourse(courseId);
  if (!course) return;
  const student = course.students.find(s => s.id === studentId);
  if (!student) return;

  const profile  = computeStudentProfile(course, studentId);
  const timeline = buildTimeline(course, studentId);
  const finalGrade = getFinalGrade(courseId, studentId) || {};

  const initials = (student.firstName[0] || '') + (student.lastName[0] || '');

  document.getElementById('topbar-breadcrumb').innerHTML =
    `<a href="#dashboard" class="text-secondary">Dashboard</a>
     <span class="sep">›</span>
     <a href="#class/${courseId}" class="text-secondary" data-nav-class="${courseId}">${escHtml(course.name)}</a>
     <span class="sep">›</span>
     <strong>${escHtml(student.firstName)} ${escHtml(student.lastName)}</strong>`;

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="window.print()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Drucken
    </button>
  `;

  let ibaString = '';
  if (student.ibaStatus && student.ibaStatus !== 'none') {
    ibaString = `IBA: ${student.ibaStatus} ${student.ibaComment ? `(${student.ibaComment})` : ''}`;
  }
  const customInfo = [student.info1, student.info2, student.info3].filter(Boolean).join(' · ');

  container.innerHTML = `
    <div class="page-anim">
      <!-- Student Header -->
      <div class="student-header">
        <div class="student-avatar">${initials}</div>
        <div class="student-header-info">
          <h2>${escHtml(student.lastName)}, ${escHtml(student.firstName)}</h2>
          <p style="margin-bottom:6px">${escHtml(course.name)} · ${escHtml(course.subject)} · ${escHtml(course.schoolYear)}</p>
          <div style="font-size:0.85rem;color:var(--text-secondary);display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            ${getAgeString(student.birthDate) ? `<span style="background:var(--bg-card-2);padding:2px 6px;border-radius:4px">📅 ${getAgeString(student.birthDate)}</span>` : ''}
            ${ibaString ? `<span class="chip" style="font-size:0.75rem;background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3);padding:2px 6px">${escHtml(ibaString)}</span>` : ''}
            ${customInfo ? `<span style="opacity:0.85;background:var(--bg-card-2);padding:2px 6px;border-radius:4px" title="Zusatzinformationen">ℹ️ ${escHtml(customInfo)}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Main grid -->
      <div style="display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:start">
        <!-- Left: Timeline + Assessments -->
        <div>
          <!-- Timeline Chart -->
          ${timeline.length >= 2 ? `
            <div class="chart-container mb-3">
              <div class="chart-title">Notenentwicklung</div>
              <div style="height:200px"><canvas id="chart-timeline"></canvas></div>
            </div>
          ` : ''}

          <!-- All assessments per category -->
          ${course.categories.map(cat => {
            if (cat.type === 'participation') {
              return participationSection(cat, course, studentId);
            }
            const catAssessments = course.assessments
              .filter(a => a.categoryId === cat.id)
              .sort((a, b) => a.date.localeCompare(b.date));
            if (catAssessments.length === 0) return '';
            return `
              <div class="mb-3">
                <div class="section-title">
                  ${escHtml(cat.name)}
                  <span class="chip">${cat.weight}%</span>
                </div>
                <div class="table-wrapper">
                  <table class="data-table mobile-cards">
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Leistung</th>
                        <th class="col-center">Punkte</th>
                        <th class="col-center">%</th>
                        <th class="col-center">Stufe</th>
                        <th>Kommentar</th>
                        <th class="col-actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${catAssessments.map(a => assessmentResultRow(a, course, student)).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Right: Profile + Final Grade -->
        <div style="position:sticky;top:80px">
          <!-- Distribution chart -->
          ${profile.allLevels.length > 0 ? `
            <div class="chart-container mb-3">
              <div class="chart-title">Notenverteilung</div>
              <div style="height:160px"><canvas id="chart-dist"></canvas></div>
            </div>
          ` : ''}

          <!-- Category donut -->
          <div class="chart-container mb-3">
            <div class="chart-title">Kategorien</div>
            <div style="height:180px"><canvas id="chart-donut"></canvas></div>
          </div>

          <!-- Weighted profile -->
          <div class="recommendation-box mb-3">
            <div class="rec-label">App-Empfehlung (LBVO §20)</div>
            <div class="rec-grade ${profile.recommendation ? gradeClass(profile.recommendation) : 'text-muted'}" style="color: var(--grade-${profile.recommendation || '1'})">
              ${profile.recommendation || '–'}
            </div>
            ${profile.recommendation ? `<div class="text-sm text-secondary">${GRADE_LABELS[profile.recommendation]}</div>` : ''}
          <!-- Recommendation & Final Grade Box -->
          <div class="recommendation-box mb-3" style="display:flex;flex-direction:column;gap:12px;padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:10px">
              <div>
                <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600">App-Empfehlung (LBVO)</div>
                <div class="font-bold text-lg" style="margin-top:2px;color:var(--grade-${profile.recommendation || '1'})">
                  ${profile.recommendation ? `${profile.recommendation} – ${GRADE_LABELS[profile.recommendation]}` : '–'}
                </div>
              </div>
              <div class="grade-badge ${profile.recommendation ? gradeClass(profile.recommendation) : 'empty'}" style="width:36px;height:36px;font-size:1.1rem">
                ${profile.recommendation || '–'}
              </div>
            </div>
            
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600">Zeugnisnote (Endnote)</div>
                <div class="font-bold text-lg" style="margin-top:2px">
                  ${finalGrade.finalGrade ? `${finalGrade.finalGrade} – ${GRADE_LABELS[finalGrade.finalGrade]}` : '<span class="text-muted">Noch nicht gesetzt</span>'}
                </div>
              </div>
              <div class="grade-badge ${finalGrade.finalGrade ? gradeClass(finalGrade.finalGrade) : 'empty'}" style="width:36px;height:36px;font-size:1.1rem;border:1.5px solid var(--accent)">
                ${finalGrade.finalGrade || '–'}
              </div>
            </div>
          </div>

          <!-- Final grade edit -->
          <div class="card">
            <div class="section-title">Zeugnisnote festlegen</div>
            <div class="form-group">
              <label class="form-label">Endnote festlegen</label>
              <select id="final-grade-select">
                <option value="">– nicht gesetzt –</option>
                ${[1,2,3,4,5].map(g => `<option value="${g}" ${finalGrade.finalGrade == g ? 'selected' : ''}>${g} – ${GRADE_LABELS[g]}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Prognose (manuell)</label>
              <select id="prognosis-select">
                <option value="">– keine Prognose –</option>
                ${[1,2,3,4,5].map(g => `<option value="${g}" ${finalGrade.prognosis == g ? 'selected' : ''}>${g} – ${GRADE_LABELS[g]}</option>`).join('')}
              </select>
              <div class="form-hint">Fließt NICHT in die Berechnung ein</div>
            </div>
            <div class="form-group">
              <label class="form-label">Pädagogische Begründung</label>
              <textarea id="teacher-note" rows="3" placeholder="Begründung für die Endnote…">${escHtml(finalGrade.teacherNote || '')}</textarea>
            </div>
            <button class="btn btn-primary" style="width:100%" id="btn-save-final">Endnote speichern</button>
          </div>

          <div class="lbvo-note mt-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Eine mathematische Durchschnittsrechnung ist nach LBVO nicht zulässig. Die App erstellt ein Leistungsprofil als Grundlage für das pädagogische Urteil.</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Render charts
  if (timeline.length >= 2) renderTimelineChart('chart-timeline', timeline);
  if (profile.allLevels.length > 0) renderDistributionChart('chart-dist', profile.distribution);
  renderCategoryDonut('chart-donut', course.categories);

  // Breadcrumb nav
  container.querySelector('[data-nav-class]')?.addEventListener('click', e => {
    e.preventDefault();
    navigate('class', { courseId });
  });

  // Assessment open
  container.querySelectorAll('.btn-open-assessment').forEach(btn => {
    btn.addEventListener('click', () => renderAssessmentEditor(btn.dataset.id, courseId, () => renderStudentView(container, courseId, studentId)));
  });

  // Save final grade
  document.getElementById('btn-save-final')?.addEventListener('click', () => {
    const fg = document.getElementById('final-grade-select').value;
    const prog = document.getElementById('prognosis-select').value;
    const note = document.getElementById('teacher-note').value;
    saveFinalGrade(courseId, studentId, {
      finalGrade: fg ? parseInt(fg) : null,
      recommendation: profile.recommendation,
      prognosis: prog ? parseInt(prog) : null,
      teacherNote: note
    });
    showToast('Zeugnisnote gespeichert', 'success');
    renderStudentView(container, courseId, studentId);
  });
}

function assessmentResultRow(assessment, course, student) {
  const res = assessment.results.find(r => r.studentId === student.id);
  const { pct, level, label } = getResultLevel(res, assessment, course);
  const pts = res?.totalPoints ?? '–';

  let breakdownHTML = '';
  if (assessment.mode === 'dimensions' && res?.dimensionScores?.length > 0) {
    const dims = assessment.dimensionConfig || course.dimensionTemplate;
    breakdownHTML = `
      <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap">
        ${dims.map(d => {
          const score = res.dimensionScores.find(ds => ds.dimensionId === d.id);
          return `<span>${escHtml(d.name)}: <strong>${score?.points ?? 0}/${d.maxPoints}</strong></span>`;
        }).join(' · ')}
      </div>
    `;
  }

  return `
    <tr>
      <td data-label="Datum" class="col-mono">${formatDateShort(assessment.date)}</td>
      <td data-label="Leistung">
        <div class="font-bold">${escHtml(assessment.title)}</div>
        ${breakdownHTML}
      </td>
      <td data-label="Punkte" class="col-center col-mono">
        ${pts !== null && pts !== '–' ? `${pts}/${assessment.maxPoints}` : '<span class="text-muted">–</span>'}
      </td>
      <td data-label="%" class="col-center col-mono text-muted">${formatPct(pct)}</td>
      <td data-label="Stufe" class="col-center">
        ${level ? `<span class="grade-badge ${gradeClass(level)}">${level}</span>` : '<span class="grade-badge empty">–</span>'}
        ${res?.isOverridden ? '<span title="Manuell überschrieben" style="color:var(--grade-3);font-size:.7rem"> ✎</span>' : ''}
      </td>
      <td data-label="Kommentar" class="text-sm text-muted">${escHtml(res?.comment || '')}</td>
      <td data-label="Aktionen" class="col-actions">
        <button class="btn btn-ghost btn-sm btn-open-assessment" data-id="${assessment.id}">Bearbeiten</button>
      </td>
    </tr>
  `;
}

function participationSection(cat, course, studentId) {
  const pr = computeParticipationLevel(course.participationRecords, studentId, course.participationCutScores);
  const tickMap = { '+': '+ aktiv', '~': '~ neutral', '-': '− keine' };
  const tickColor = { '+': 'var(--grade-1)', '~': 'var(--text-muted)', '-': 'var(--grade-5)' };

  const recent = [...course.participationRecords]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  return `
    <div class="mb-3">
      <div class="section-title">
        ${escHtml(cat.name)}
        <span class="chip">${cat.weight}%</span>
        ${pr.level ? `<span class="grade-badge ${gradeClass(pr.level)}">${pr.level}</span>` : ''}
      </div>
      <div class="table-wrapper">
        <table class="data-table mobile-cards">
          <thead><tr><th>Datum</th><th>Eintrag</th></tr></thead>
          <tbody>
            ${recent.map(rec => {
              const tick = rec.ticks.find(t => t.studentId === studentId);
              if (!tick) return `<tr><td data-label="Datum" class="col-mono">${formatDateShort(rec.date)}</td><td data-label="Eintrag" class="text-muted">–</td></tr>`;
              return `<tr>
                <td data-label="Datum" class="col-mono">${formatDateShort(rec.date)}</td>
                <td data-label="Eintrag" style="color:${tickColor[tick.tick]};font-weight:600">${tickMap[tick.tick]}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${pr.count > 0 ? `
        <div class="text-sm text-muted mt-2">
          Ø Score: <span class="font-mono">${pr.avg > 0 ? '+' : ''}${pr.avg?.toFixed(2)}</span>
          · ${pr.count} Einträge
          · Stufe: <strong>${pr.label}</strong>
        </div>
      ` : ''}
    </div>
  `;
}

// Student modal (called from classView for editing)
export function renderStudentModal(courseId, studentId, onDone) {
  // placeholder - navigate to student view
  navigate('student', { courseId, studentId });
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDateShort(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`; }

function getAgeString(birthDateString) {
  if (!birthDateString) return '';
  const today = new Date();
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return '';
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  const statusStr = age >= 18 ? 'Volljährig' : 'U18 / Minderjährig';
  const parts = birthDateString.split('-');
  const formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
  return `Geb. ${formattedDate} (${age} Jahre, ${statusStr})`;
}
