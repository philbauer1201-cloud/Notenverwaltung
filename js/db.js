/**
 * db.js – Datenschicht (LocalStorage CRUD + Export/Import)
 * NotenPro – Notenverwaltungs-App
 */

const DB_KEY = 'notenpro_v1';

// ── Default / Seed Data ─────────────────────────────────────────
function createDefaultData() {
  return {
    version: 1,
    settings: { theme: 'dark', lastCourseId: null },
    students: [],
    kvClasses: [],
    courses: [
      createSeedCourse()
    ]
  };
}

function createSeedCourse() {
  const courseId = uid();
  const cat1 = uid(), cat2 = uid(), cat3 = uid(), cat4 = uid();
  const s1 = uid(), s2 = uid(), s3 = uid(), s4 = uid(), s5 = uid();
  const a1 = uid(), a2 = uid(), a3 = uid();

  return {
    id: courseId,
    name: '3A – Rechnungswesen',
    subject: 'Rechnungswesen',
    schoolYear: '2025/26',
    lehrgang: 1,
    categories: [
      { id: cat1, name: 'Schularbeit',        weight: 40 },
      { id: cat2, name: 'Extemporale',         weight: 20 },
      { id: cat3, name: 'Mündliche Mitarbeit', weight: 20, type: 'participation' },
      { id: cat4, name: 'Praxisarbeit',        weight: 20 }
    ],
    dimensionTemplate: [
      { id: uid(), name: 'Fachliche Richtigkeit', maxPoints: 15 },
      { id: uid(), name: 'Selbstständigkeit',      maxPoints: 10 },
      { id: uid(), name: 'Darstellung',            maxPoints: 5  }
    ],
    cutScores: { sehrGut: 91, gut: 80, befriedigend: 66, genuegend: 50 },
    participationCutScores: { sehrGut: 0.7, gut: 0.3, genuegend: -0.3, nichtGenuegend: -0.7 },
    students: [
      { id: s1, firstName: 'Anna',   lastName: 'Berger'   },
      { id: s2, firstName: 'Lukas',  lastName: 'Huber'    },
      { id: s3, firstName: 'Sara',   lastName: 'Gruber'   },
      { id: s4, firstName: 'Tobias', lastName: 'Mayer'    },
      { id: s5, firstName: 'Julia',  lastName: 'Schneider'}
    ],
    assessments: [
      {
        id: a1,
        courseId,
        categoryId: cat1,
        title: 'Schularbeit 1',
        date: '2026-03-14',
        scale: 30,
        maxPoints: 30,
        mode: 'simple',
        dimensionConfig: null,
        groupId: null,
        results: [
          { studentId: s1, totalPoints: 27, dimensionScores: [], comment: 'Sehr gute Leistung', isOverridden: false, overrideLevel: null },
          { studentId: s2, totalPoints: 19, dimensionScores: [], comment: '',                   isOverridden: false, overrideLevel: null },
          { studentId: s3, totalPoints: 23, dimensionScores: [], comment: '',                   isOverridden: false, overrideLevel: null },
          { studentId: s4, totalPoints: 14, dimensionScores: [], comment: 'Häufige Hilfe benötigt', isOverridden: false, overrideLevel: null },
          { studentId: s5, totalPoints: 25, dimensionScores: [], comment: '',                   isOverridden: false, overrideLevel: null }
        ]
      },
      {
        id: a2,
        courseId,
        categoryId: cat2,
        title: 'Extemporale 1 – Buchungen',
        date: '2026-04-03',
        scale: 15,
        maxPoints: 15,
        mode: 'simple',
        dimensionConfig: null,
        groupId: null,
        results: [
          { studentId: s1, totalPoints: 14, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null },
          { studentId: s2, totalPoints: 10, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null },
          { studentId: s3, totalPoints: 12, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null },
          { studentId: s4, totalPoints: 7,  dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null },
          { studentId: s5, totalPoints: 13, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null }
        ]
      },
      {
        id: a3,
        courseId,
        categoryId: cat4,
        title: 'Praxisprojekt – Jahresabschluss',
        date: '2026-05-10',
        scale: 45,
        maxPoints: 45,
        mode: 'simple',
        dimensionConfig: null,
        groupId: null,
        results: [
          { studentId: s1, totalPoints: 41, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null },
          { studentId: s2, totalPoints: 28, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null },
          { studentId: s3, totalPoints: 33, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null },
          { studentId: s4, totalPoints: 22, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null },
          { studentId: s5, totalPoints: 38, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null }
        ]
      }
    ],
    groups: [],
    participationRecords: [
      { id: uid(), courseId, date: '2026-03-01', ticks: [
        { studentId: s1, tick: '+' }, { studentId: s2, tick: '~' },
        { studentId: s3, tick: '+' }, { studentId: s4, tick: '-' },
        { studentId: s5, tick: '+' }
      ]},
      { id: uid(), courseId, date: '2026-03-08', ticks: [
        { studentId: s1, tick: '+' }, { studentId: s2, tick: '+' },
        { studentId: s3, tick: '~' }, { studentId: s4, tick: '~' },
        { studentId: s5, tick: '+' }
      ]},
      { id: uid(), courseId, date: '2026-03-15', ticks: [
        { studentId: s1, tick: '~' }, { studentId: s2, tick: '-' },
        { studentId: s3, tick: '+' }, { studentId: s4, tick: '-' },
        { studentId: s5, tick: '~' }
      ]}
    ],
    finalGrades: [],
    savedGroupConfigs: []
  };
}

// ── UID Generator ───────────────────────────────────────────────
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Load / Save ─────────────────────────────────────────────────
function migrateData(data) {
  let changed = false;

  if (!data.students) { data.students = []; changed = true; }
  if (!data.kvClasses) { data.kvClasses = []; changed = true; }

  // Migrate students from courses to central DB
  if (data.courses) {
    data.courses.forEach(course => {
      if (course.students && course.students.length > 0 && typeof course.students[0] === 'object') {
        const studentIds = [];
        course.students.forEach(s => {
          let existing = data.students.find(es => es.firstName === s.firstName && es.lastName === s.lastName);
          if (!existing) {
            existing = { ...s };
            data.students.push(existing);
          }
          studentIds.push(existing.id);
        });
        course.studentIds = studentIds;
        delete course.students;
        changed = true;
      } else if (!course.studentIds) {
        course.studentIds = [];
        delete course.students;
        changed = true;
      }
    });
  }

  if (changed) save(data);
  return data;
}

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    let data = raw ? JSON.parse(raw) : createDefaultData();
    return migrateData(data);
  } catch {
    return migrateData(createDefaultData());
  }
}

function save(data) {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
}

// ── Singleton state ─────────────────────────────────────────────
let _db = null;

export function getDB() {
  if (!_db) _db = load();
  return _db;
}

export function saveDB() {
  if (_db) save(_db);
}

// ── Settings ────────────────────────────────────────────────────
export function getSetting(key) {
  return getDB().settings[key];
}
export function setSetting(key, value) {
  getDB().settings[key] = value;
  saveDB();
}

// ── Courses ─────────────────────────────────────────────────────
export function getCourses() {
  const db = getDB();
  return db.courses.map(course => ({
    ...course,
    students: (course.studentIds || []).map(sid => db.students.find(s => s.id === sid)).filter(Boolean)
  }));
}
export function getCourse(id) {
  const db = getDB();
  const course = db.courses.find(c => c.id === id);
  if (!course) return null;
  return {
    ...course,
    students: (course.studentIds || []).map(sid => db.students.find(s => s.id === sid)).filter(Boolean)
  };
}
export function createCourse(data) {
  const course = {
    id: uid(),
    name: data.name || 'Neuer Kurs',
    subject: data.subject || '',
    schoolYear: data.schoolYear || '2025/26',
    lehrgang: data.lehrgang || 1,
    categories: data.categories || [
      { id: uid(), name: 'Schularbeit',        weight: 40 },
      { id: uid(), name: 'Mündliche Mitarbeit', weight: 30, type: 'participation' },
      { id: uid(), name: 'Praxisarbeit',        weight: 30 }
    ],
    dimensionTemplate: data.dimensionTemplate || [],
    cutScores: data.cutScores || { sehrGut: 91, gut: 81, befriedigend: 67, genuegend: 50 },
    participationCutScores: { sehrGut: 0.7, gut: 0.3, genuegend: -0.3, nichtGenuegend: -0.7 },
    studentIds: [],
    assessments: [],
    groups: [],
    participationRecords: [],
    finalGrades: [],
    savedGroupConfigs: data.savedGroupConfigs || []
  };
  getDB().courses.push(course);
  saveDB();
  return course;
}
export function updateCourse(id, data) {
  const db = getDB();
  const idx = db.courses.findIndex(c => c.id === id);
  if (idx === -1) return null;
  db.courses[idx] = { ...db.courses[idx], ...data };
  saveDB();
  return db.courses[idx];
}
export function deleteCourse(id) {
  const db = getDB();
  db.courses = db.courses.filter(c => c.id !== id);
  saveDB();
}

// ── Students ────────────────────────────────────────────────────
export function getStudents(courseId) {
  return getCourse(courseId)?.students || [];
}
export function getGlobalStudents() {
  return getDB().students;
}
export function createStudent(courseId, data) {
  const db = getDB();
  const student = { id: uid(), firstName: data.firstName || '', lastName: data.lastName || '', ...data };
  db.students.push(student);
  
  if (courseId) {
    const course = db.courses.find(c => c.id === courseId);
    if (course) {
      course.studentIds = course.studentIds || [];
      course.studentIds.push(student.id);
    }
  }
  saveDB();
  return student;
}
export function updateStudent(studentId, data) {
  const db = getDB();
  const idx = db.students.findIndex(s => s.id === studentId);
  if (idx === -1) return null;
  db.students[idx] = { ...db.students[idx], ...data };
  saveDB();
  return db.students[idx];
}
export function assignStudentToCourse(courseId, studentId) {
  const db = getDB();
  const course = db.courses.find(c => c.id === courseId);
  if (course && !(course.studentIds || []).includes(studentId)) {
    course.studentIds = course.studentIds || [];
    course.studentIds.push(studentId);
    saveDB();
  }
}
export function removeStudentFromCourse(courseId, studentId) {
  const db = getDB();
  const course = db.courses.find(c => c.id === courseId);
  if (!course) return;
  course.studentIds = (course.studentIds || []).filter(id => id !== studentId);
  
  // Remove results
  course.assessments.forEach(a => {
    a.results = a.results.filter(r => r.studentId !== studentId);
  });
  course.participationRecords.forEach(r => {
    r.ticks = r.ticks.filter(t => t.studentId !== studentId);
  });
  // Delete from groups
  course.groups.forEach(g => {
    g.members = g.members.filter(id => id !== studentId);
  });
  course.savedGroupConfigs.forEach(cfg => {
    cfg.groups.forEach(g => {
      g.members = g.members.filter(id => id !== studentId);
    });
  });
  saveDB();
}

// ── Assessments ─────────────────────────────────────────────────
export function getAssessments(courseId) {
  return getCourse(courseId)?.assessments || [];
}
export function getAssessment(courseId, assessmentId) {
  return getCourse(courseId)?.assessments.find(a => a.id === assessmentId) || null;
}
export function createAssessment(courseId, data) {
  const course = getCourse(courseId);
  if (!course) return null;
  const assessment = {
    id: uid(),
    courseId,
    categoryId: data.categoryId || course.categories[0]?.id,
    title: data.title || 'Neue Leistung',
    date: data.date || new Date().toISOString().slice(0,10),
    scale: data.scale || 30,
    maxPoints: data.maxPoints || 30,
    mode: data.mode || 'simple',
    dimensionConfig: data.dimensionConfig || null,
    groupId: data.groupId || null,
    groups: data.groups || [],
    results: []
  };
  // Pre-fill results for all students
  course.students.forEach(s => {
    assessment.results.push({
      studentId: s.id,
      totalPoints: null,
      dimensionScores: [],
      comment: '',
      isOverridden: false,
      overrideLevel: null
    });
  });
  course.assessments.push(assessment);
  saveDB();
  return assessment;
}
export function updateAssessment(courseId, assessmentId, data) {
  const course = getCourse(courseId);
  if (!course) return null;
  const idx = course.assessments.findIndex(a => a.id === assessmentId);
  if (idx === -1) return null;
  course.assessments[idx] = { ...course.assessments[idx], ...data };
  saveDB();
  return course.assessments[idx];
}
export function deleteAssessment(courseId, assessmentId) {
  const course = getCourse(courseId);
  if (!course) return;
  course.assessments = course.assessments.filter(a => a.id !== assessmentId);
  saveDB();
}
export function updateResult(courseId, assessmentId, studentId, data) {
  const assessment = getAssessment(courseId, assessmentId);
  if (!assessment) return null;
  const idx = assessment.results.findIndex(r => r.studentId === studentId);
  if (idx === -1) {
    assessment.results.push({ studentId, totalPoints: null, dimensionScores: [], comment: '', isOverridden: false, overrideLevel: null, ...data });
  } else {
    assessment.results[idx] = { ...assessment.results[idx], ...data };
  }
  saveDB();
  return assessment.results[idx === -1 ? assessment.results.length - 1 : idx];
}

// ── Participation Records ────────────────────────────────────────
export function getParticipationRecords(courseId) {
  return getCourse(courseId)?.participationRecords || [];
}
export function saveParticipationRecord(courseId, date, ticks) {
  const course = getCourse(courseId);
  if (!course) return;
  const existing = course.participationRecords.find(r => r.date === date);
  if (existing) {
    existing.ticks = ticks;
  } else {
    course.participationRecords.push({ id: uid(), courseId, date, ticks });
  }
  saveDB();
}

// ── Groups ───────────────────────────────────────────────────────
export function createGroup(courseId, assessmentId, name, memberIds) {
  const course = getCourse(courseId);
  if (!course) return null;
  const group = { id: uid(), assessmentId, name, memberIds };
  course.groups.push(group);
  saveDB();
  return group;
}
export function getGroupsForAssessment(courseId, assessmentId) {
  return getCourse(courseId)?.groups.filter(g => g.assessmentId === assessmentId) || [];
}

// ── Saved Group Configs ──────────────────────────────────────────
export function saveGroupConfig(courseId, name, groups) {
  const course = getCourse(courseId);
  if (!course) return null;
  if (!course.savedGroupConfigs) course.savedGroupConfigs = [];
  const config = { id: uid(), name, date: new Date().toISOString().slice(0, 10), groups };
  course.savedGroupConfigs.push(config);
  saveDB();
  return config;
}
export function deleteGroupConfig(courseId, configId) {
  const course = getCourse(courseId);
  if (!course || !course.savedGroupConfigs) return;
  course.savedGroupConfigs = course.savedGroupConfigs.filter(c => c.id !== configId);
  saveDB();
}

// ── Final Grades ─────────────────────────────────────────────────
export function getFinalGrade(courseId, studentId) {
  return getCourse(courseId)?.finalGrades.find(g => g.studentId === studentId) || null;
}
export function saveFinalGrade(courseId, studentId, data) {
  const course = getCourse(courseId);
  if (!course) return;
  const idx = course.finalGrades.findIndex(g => g.studentId === studentId);
  const grade = { studentId, courseId, finalGrade: null, recommendation: null, prognosis: null, teacherNote: '', ...data };
  if (idx === -1) {
    course.finalGrades.push(grade);
  } else {
    course.finalGrades[idx] = { ...course.finalGrades[idx], ...data };
  }
  saveDB();
}

// ── Export / Import ──────────────────────────────────────────────
export function exportJSON() {
  const data = getDB();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `notenpro_backup_${dateStr()}.json`);
}

export function exportCSV(courseId) {
  const course = getCourse(courseId);
  if (!course) return;

  const rows = [['Nachname', 'Vorname', ...course.assessments.map(a => `${a.title} (/${a.maxPoints})`), 'Empfehlung']];
  const { computeStudentProfile } = window._grading || {};

  course.students.forEach(s => {
    const row = [s.lastName, s.firstName];
    course.assessments.forEach(a => {
      const res = a.results.find(r => r.studentId === s.id);
      row.push(res?.totalPoints ?? '');
    });
    const profile = computeStudentProfile ? computeStudentProfile(course, s.id) : { recommendation: '' };
    row.push(profile.recommendation ?? '');
    rows.push(row);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${course.name}_Noten_${dateStr()}.csv`);
}

export async function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.courses || !data.settings) throw new Error('Ungültiges Format');
        _db = data;
        saveDB();
        resolve(data);
      } catch (err) { reject(err); }
    };
    reader.readAsText(file);
  });
}

// ── Helpers ──────────────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function dateStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Seating Plan ─────────────────────────────────────────────────
export function getSeatingPlan(courseId) {
  const course = getCourse(courseId);
  return course?.seatingPlan || { rows: 4, cols: 6, seats: {} };
}

export function saveSeatingPlan(courseId, seatingPlan) {
  const course = getCourse(courseId);
  if (!course) return;
  course.seatingPlan = seatingPlan;
  saveDB();
}

// ── Klassenvorstand (KV) Modul ─────────────────────────────────
export function getKVClasses() {
  const db = getDB();
  if (!db.kvClasses) db.kvClasses = [];
  return db.kvClasses.map(c => ({
    ...c,
    students: (c.studentIds || []).map(sid => db.students.find(s => s.id === sid)).filter(Boolean)
  }));
}
export function getKVClass(id) {
  const classes = getKVClasses();
  return classes.find(c => c.id === id) || null;
}
export function createKVClass(name) {
  const db = getDB();
  if (!db.kvClasses) db.kvClasses = [];
  const kv = { id: uid(), name: name || 'Neue KV-Klasse', studentIds: [], checklists: [] };
  db.kvClasses.push(kv);
  saveDB();
  return kv;
}
export function updateKVClass(id, data) {
  const db = getDB();
  if (!db.kvClasses) db.kvClasses = [];
  const idx = db.kvClasses.findIndex(c => c.id === id);
  if (idx === -1) return null;
  db.kvClasses[idx] = { ...db.kvClasses[idx], ...data };
  saveDB();
  return db.kvClasses[idx];
}
export function deleteKVClass(id) {
  const db = getDB();
  if (!db.kvClasses) return;
  db.kvClasses = db.kvClasses.filter(c => c.id !== id);
  saveDB();
}
export function addStudentToKVClass(kvId, studentId) {
  const db = getDB();
  const kv = db.kvClasses.find(c => c.id === kvId);
  if (kv && !(kv.studentIds || []).includes(studentId)) {
    kv.studentIds = kv.studentIds || [];
    kv.studentIds.push(studentId);
    saveDB();
  }
}
export function removeStudentFromKVClass(kvId, studentId) {
  const db = getDB();
  const kv = db.kvClasses.find(c => c.id === kvId);
  if (!kv) return;
  kv.studentIds = (kv.studentIds || []).filter(id => id !== studentId);
  saveDB();
}
// KV Checklists
export function createKVChecklist(kvId, title) {
  const db = getDB();
  const kv = db.kvClasses.find(c => c.id === kvId);
  if (!kv) return null;
  if (!kv.checklists) kv.checklists = [];
  const cl = { id: uid(), title, date: new Date().toISOString().slice(0,10), ticks: [] }; // ticks: array of studentIds
  kv.checklists.push(cl);
  saveDB();
  return cl;
}
export function toggleKVChecklistTick(kvId, checklistId, studentId) {
  const db = getDB();
  const kv = db.kvClasses.find(c => c.id === kvId);
  if (!kv) return;
  const cl = (kv.checklists || []).find(c => c.id === checklistId);
  if (!cl) return;
  if (!cl.ticks) cl.ticks = [];
  if (cl.ticks.includes(studentId)) {
    cl.ticks = cl.ticks.filter(id => id !== studentId);
  } else {
    cl.ticks.push(studentId);
  }
  saveDB();
}
export function deleteKVChecklist(kvId, checklistId) {
  const db = getDB();
  const kv = db.kvClasses.find(c => c.id === kvId);
  if (!kv) return;
  kv.checklists = (kv.checklists || []).filter(c => c.id !== checklistId);
  saveDB();
}
