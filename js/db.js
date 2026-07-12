/**
 * db.js – Datenschicht (LocalStorage CRUD + Export/Import)
 * NotenPro – Notenverwaltungs-App
 */

const DB_KEY = 'notenpro_v1';

// ── Default / Seed Data ─────────────────────────────────────────
function kvStudentDefaults() {
  return {
    // Stammdaten
    nachname: '',
    vorname: '',
    geburtsdatum: '',
    // Infrastruktur & Finanzen
    spindNr: null,
    schlossBezahlt: false,
    schulgeldBar: 0,
    schulgeldKarte: 0,
    // Dokumente (0=Offen, 1=Erledigt, 2=Nicht erforderlich)
    dokumente: {
      kaliumJodid: 0,
      stammblatt: 0,
      foto: 0,
      lehrvertrag: 0,
      geburtsurkunde: 0,
      unterschriftenLeitfaden: 0,
      zeugnis: 0,
      dsgvo: 0,
      jugendNetzticket: 0
    },
    // Zusatz
    raucher: false,
    religion: '',
    befreiungen: '',
    vorerhebungLAP: false,
    kommentar: '',
    fotoId: null,
    // Zuordnungen
    kvClassIds: []
  };
}

function createDefaultData() {
  const cat1 = uid(), cat2 = uid();
  const categories = [
    { id: cat1, name: 'Mündliche Mitarbeit', weight: 50, type: 'participation' },
    { id: cat2, name: 'Schriftliche Prüfung', weight: 50 }
  ];

  const s1 = uid(), s2 = uid(), s3 = uid(), s4 = uid(), s5 = uid();
  const students = [
    { id: s1, firstName: 'Max',   lastName: 'Mustermann', nachname: 'Mustermann', vorname: 'Max',   geburtsdatum: '2007-03-15', ...kvStudentDefaults() },
    { id: s2, firstName: 'Laura', lastName: 'Huber',      nachname: 'Huber',      vorname: 'Laura', geburtsdatum: '2006-08-22', ...kvStudentDefaults() },
    { id: s3, firstName: 'Felix', lastName: 'Müller',     nachname: 'Müller',     vorname: 'Felix', geburtsdatum: '2007-01-10', ...kvStudentDefaults() },
    { id: s4, firstName: 'Anna',  lastName: 'Schmidt',    nachname: 'Schmidt',    vorname: 'Anna',  geburtsdatum: '2006-11-05', ...kvStudentDefaults() },
    { id: s5, firstName: 'Tom',   lastName: 'Kowalski',   nachname: 'Kowalski',   vorname: 'Tom',   geburtsdatum: '2005-06-30', ...kvStudentDefaults() }
  ];

  const course1A = uid();
  const course1B = uid();

  const courses = [
    {
      id: course1A,
      name: 'Klasse 1A',
      subject: 'Allgemein',
      schoolYear: '2025/26',
      lehrgang: 1,
      categories: JSON.parse(JSON.stringify(categories)),
      dimensionTemplate: [],
      cutScores: { sehrGut: 91, gut: 80, befriedigend: 66, genuegend: 50 },
      participationCutScores: { sehrGut: 0.7, gut: 0.3, genuegend: -0.3, nichtGenuegend: -0.7 },
      studentIds: [s1, s2, s3, s4],
      assessments: [],
      groups: [],
      participationRecords: [],
      finalGrades: [],
      savedGroupConfigs: []
    },
    {
      id: course1B,
      name: 'Klasse 1B',
      subject: 'Allgemein',
      schoolYear: '2025/26',
      lehrgang: 1,
      categories: JSON.parse(JSON.stringify(categories)),
      dimensionTemplate: [],
      cutScores: { sehrGut: 91, gut: 80, befriedigend: 66, genuegend: 50 },
      participationCutScores: { sehrGut: 0.7, gut: 0.3, genuegend: -0.3, nichtGenuegend: -0.7 },
      studentIds: [s5],
      assessments: [],
      groups: [],
      participationRecords: [],
      finalGrades: [],
      savedGroupConfigs: []
    }
  ];

  return {
    version: 2,
    settings: {
      theme: 'dark',
      lastCourseId: null,
      schulgeldDefault: 30,
      schlossBetrag: 5
    },
    students: students,
    kvClasses: [],
    courses: courses
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

  // Settings defaults
  if (data.settings.schulgeldDefault === undefined) { data.settings.schulgeldDefault = 30; changed = true; }
  if (data.settings.schlossBetrag    === undefined) { data.settings.schlossBetrag    = 5;  changed = true; }

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

  // Migrate existing students: add missing KV fields
  const defaults = kvStudentDefaults();
  data.students.forEach(s => {
    let studentChanged = false;
    // Sync nachname/vorname with firstName/lastName
    if (!s.nachname && s.lastName)  { s.nachname = s.lastName;  studentChanged = true; }
    if (!s.vorname  && s.firstName) { s.vorname  = s.firstName; studentChanged = true; }
    // Add missing fields
    Object.keys(defaults).forEach(key => {
      if (s[key] === undefined) {
        s[key] = key === 'dokumente' ? { ...defaults.dokumente } : defaults[key];
        studentChanged = true;
      }
    });
    if (!s.dokumente) { s.dokumente = { ...defaults.dokumente }; studentChanged = true; }
    // Fill in missing dokument keys
    Object.keys(defaults.dokumente).forEach(dk => {
      if (s.dokumente[dk] === undefined) { s.dokumente[dk] = 0; studentChanged = true; }
    });
    if (studentChanged) changed = true;
  });

  // Migrate kvClasses: build kvClassIds on students
  data.kvClasses.forEach(kv => {
    (kv.studentIds || []).forEach(sid => {
      const s = data.students.find(st => st.id === sid);
      if (s && !s.kvClassIds.includes(kv.id)) {
        s.kvClassIds.push(kv.id);
        changed = true;
      }
    });
  });

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
      { id: uid(), name: 'Schularbeit',        weight: 50 },
      { id: uid(), name: 'Mitarbeit',          weight: 20, type: 'participation' },
      { id: uid(), name: 'Unterrichtsarbeit',  weight: 30 }
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
  const student = {
    id: uid(),
    firstName: data.firstName || data.vorname || '',
    lastName:  data.lastName  || data.nachname || '',
    ...kvStudentDefaults(),
    ...data,
    // ensure sync
    nachname: data.nachname || data.lastName  || '',
    vorname:  data.vorname  || data.firstName || '',
    birthDate: data.birthDate || data.geburtsdatum || null,
    geburtsdatum: data.geburtsdatum || data.birthDate || null,
    dokumente: { ...kvStudentDefaults().dokumente, ...(data.dokumente || {}) },
    kvClassIds: data.kvClassIds || []
  };
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
  // Sync firstName/lastName ↔ vorname/nachname
  if (data.vorname  !== undefined) data.firstName = data.vorname;
  if (data.nachname !== undefined) data.lastName  = data.nachname;
  if (data.firstName !== undefined) data.vorname  = data.firstName;
  if (data.lastName  !== undefined) data.nachname = data.lastName;
  
  // Sync birthDate ↔ geburtsdatum
  if (data.geburtsdatum !== undefined) data.birthDate = data.geburtsdatum;
  if (data.birthDate !== undefined) data.geburtsdatum = data.birthDate;

  db.students[idx] = {

    ...db.students[idx],
    ...data,
    dokumente: { ...db.students[idx].dokumente, ...(data.dokumente || {}) }
  };
  saveDB();
  return db.students[idx];
}
// Alias
export const updateGlobalStudent = updateStudent;

export function deleteStudentGlobal(studentId) {
  const db = getDB();
  
  // 1. Remove from all regular courses (cleans up grades, ticks, groups too)
  (db.courses || []).forEach(c => {
    removeStudentFromCourse(c.id, studentId);
  });

  // 2. Remove from all KV classes
  (db.kvClasses || []).forEach(kv => {
    kv.studentIds = (kv.studentIds || []).filter(id => id !== studentId);
  });

  // 3. Remove from global students table
  db.students = (db.students || []).filter(s => s.id !== studentId);
  
  saveDB();
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
  course.assessments.forEach(a => {
    a.results = a.results.filter(r => r.studentId !== studentId);
  });
  course.participationRecords.forEach(r => {
    r.ticks = r.ticks.filter(t => t.studentId !== studentId);
  });
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

// ── KV Student Helpers ───────────────────────────────────────────
export function calculateAge(geburtsdatum) {
  if (!geburtsdatum) return null;
  const birth = new Date(geburtsdatum);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
export function isEigenberechtigt(geburtsdatum) {
  const age = calculateAge(geburtsdatum);
  return age !== null && age >= 18;
}
export function getKVStudents(kvId) {
  const db = getDB();
  const kv = db.kvClasses?.find(c => c.id === kvId);
  if (!kv) return [];
  return (kv.studentIds || []).map(sid => db.students.find(s => s.id === sid)).filter(Boolean);
}
export function moveStudentToKVClass(studentId, fromKvId, toKvId) {
  const db = getDB();
  // Remove from source
  const fromKv = db.kvClasses?.find(c => c.id === fromKvId);
  if (fromKv) {
    fromKv.studentIds = (fromKv.studentIds || []).filter(id => id !== studentId);
  }
  // Add to target
  const toKv = db.kvClasses?.find(c => c.id === toKvId);
  if (toKv && !(toKv.studentIds || []).includes(studentId)) {
    toKv.studentIds = toKv.studentIds || [];
    toKv.studentIds.push(studentId);
  }
  // Update student's kvClassIds
  const s = db.students.find(st => st.id === studentId);
  if (s) {
    s.kvClassIds = (s.kvClassIds || []).filter(id => id !== fromKvId);
    if (toKvId && !s.kvClassIds.includes(toKvId)) s.kvClassIds.push(toKvId);
  }
  saveDB();
}
// Override addStudentToKVClass to also update student.kvClassIds
export function assignStudentToKVClass(kvId, studentId) {
  addStudentToKVClass(kvId, studentId);
  const db = getDB();
  const s = db.students.find(st => st.id === studentId);
  if (s && !s.kvClassIds?.includes(kvId)) {
    s.kvClassIds = s.kvClassIds || [];
    s.kvClassIds.push(kvId);
    saveDB();
  }
}
export function unassignStudentFromKVClass(kvId, studentId) {
  removeStudentFromKVClass(kvId, studentId);
  const db = getDB();
  const s = db.students.find(st => st.id === studentId);
  if (s) {
    s.kvClassIds = (s.kvClassIds || []).filter(id => id !== kvId);
    saveDB();
  }
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
