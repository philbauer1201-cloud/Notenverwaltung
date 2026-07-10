/**
 * grading.js – Notenlogik
 * LBVO-konforme Berechnung: Cut-Scores, Qualitätsstufen, Leistungsprofil, Mitarbeit
 */

// ── Grade Labels ─────────────────────────────────────────────────
export const GRADE_LABELS = {
  1: 'Sehr Gut',
  2: 'Gut',
  3: 'Befriedigend',
  4: 'Genügend',
  5: 'Nicht Genügend'
};

export const GRADE_SHORT = {
  1: 'SG', 2: 'G', 3: 'Bef', 4: 'Gen', 5: 'NG'
};

// ── Points → Percentage → Quality Level ──────────────────────────
/**
 * Convert raw points to a quality level (1–5) based on cut scores.
 * @param {number} points - Points achieved
 * @param {number} maxPoints - Maximum points
 * @param {object} cutScores - { sehrGut, gut, befriedigend, genuegend } in %
 * @returns {{ pct: number, level: number, label: string }}
 */
export function pointsToLevel(points, maxPoints, cutScores) {
  if (points === null || points === undefined || maxPoints <= 0) {
    return { pct: null, level: null, label: '–' };
  }
  const pct = Math.round((points / maxPoints) * 1000) / 10;
  const level = pctToLevel(pct, cutScores);
  return { pct, level, label: GRADE_LABELS[level] };
}

/**
 * Convert percentage to quality level.
 */
export function pctToLevel(pct, cutScores) {
  const cs = cutScores || { sehrGut: 91, gut: 80, befriedigend: 66, genuegend: 50 };
  if (pct >= cs.sehrGut)    return 1;
  if (pct >= cs.gut)         return 2;
  if (pct >= cs.befriedigend) return 3;
  if (pct >= cs.genuegend)   return 4;
  return 5;
}

/**
 * Direct grade (1–5) input – no calculation needed.
 */
export function directGradeToLevel(grade) {
  const g = parseInt(grade);
  if (g >= 1 && g <= 5) return { pct: null, level: g, label: GRADE_LABELS[g] };
  return { pct: null, level: null, label: '–' };
}

// ── Dimension Scores → Total ──────────────────────────────────────
/**
 * Sum dimension scores and return total points achieved and max.
 */
export function sumDimensions(dimensionScores, dimensionConfig) {
  let total = 0;
  let max = 0;
  dimensionConfig.forEach(dim => {
    const score = dimensionScores.find(ds => ds.dimensionId === dim.id);
    const pts = score?.points ?? 0;
    total += pts;
    max += dim.maxPoints;
  });
  return { total, max };
}

// ── Participation Aggregation ────────────────────────────────────
/**
 * Aggregate participation ticks for a student in a course.
 * Returns score (avg of +1/0/-1), level, label.
 */
export function computeParticipationLevel(participationRecords, studentId, cutScores) {
  const cs = cutScores || { sehrGut: 0.7, gut: 0.3, genuegend: -0.3, nichtGenuegend: -0.7 };
  const tickValues = { '+': 1, '~': 0, '-': -1 };

  let sum = 0, count = 0;
  participationRecords.forEach(rec => {
    const tick = rec.ticks.find(t => t.studentId === studentId);
    if (tick && tick.tick !== undefined) {
      sum += tickValues[tick.tick] ?? 0;
      count++;
    }
  });

  if (count === 0) return { avg: null, level: null, label: '–', count: 0 };

  const avg = sum / count;
  let level;
  if (avg >= cs.sehrGut)       level = 1;
  else if (avg >= cs.gut)       level = 2;
  else if (avg >= cs.genuegend) level = 3;
  else if (avg >= cs.nichtGenuegend) level = 4;
  else                           level = 5;

  return { avg: Math.round(avg * 100) / 100, level, label: GRADE_LABELS[level], count };
}

// ── Result → Level (with override) ──────────────────────────────
/**
 * Get the quality level for a single assessment result.
 */
export function getResultLevel(result, assessment, course) {
  if (!result) return { pct: null, level: null, label: '–' };

  // Manual override takes precedence
  if (result.isOverridden && result.overrideLevel) {
    return { pct: null, level: result.overrideLevel, label: GRADE_LABELS[result.overrideLevel], overridden: true };
  }

  const effectiveDimConfig = assessment.dimensionConfig || course.dimensionTemplate;

  if (assessment.mode === 'dimensions' && result.dimensionScores?.length > 0 && effectiveDimConfig?.length > 0) {
    const { total, max } = sumDimensions(result.dimensionScores, effectiveDimConfig);
    return pointsToLevel(total, max, course.cutScores);
  }

  return pointsToLevel(result.totalPoints, assessment.maxPoints, course.cutScores);
}

// ── Student Profile ──────────────────────────────────────────────
/**
 * Compute the full learning profile for a student in a course.
 * Returns weighted category levels, recommendation, and profile distribution.
 */
export function computeStudentProfile(course, studentId) {
  const { categories, assessments, participationRecords, cutScores, participationCutScores } = course;

  // Group assessments by category
  const categoryResults = {}; // catId → [level]
  categories.forEach(cat => {
    if (cat.type === 'participation') {
      const pr = computeParticipationLevel(participationRecords, studentId, participationCutScores);
      categoryResults[cat.id] = pr.level ? [pr.level] : [];
    } else {
      const catAssessments = assessments.filter(a => a.categoryId === cat.id);
      categoryResults[cat.id] = catAssessments
        .map(a => {
          const res = a.results.find(r => r.studentId === studentId);
          return getResultLevel(res, a, course).level;
        })
        .filter(l => l !== null);
    }
  });

  // Weighted level computation
  let totalWeight = 0;
  let weightedSum = 0;
  const categoryProfiles = [];

  categories.forEach(cat => {
    const levels = categoryResults[cat.id];
    if (levels.length === 0) return;

    const avg = levels.reduce((s, l) => s + l, 0) / levels.length;
    categoryProfiles.push({ cat, avg, levels });
    weightedSum += avg * cat.weight;
    totalWeight += cat.weight;
  });

  const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : null;
  const recommendation = weightedAvg !== null ? Math.min(5, Math.max(1, Math.round(weightedAvg))) : null;

  // Distribution across all levels
  const allLevels = Object.values(categoryResults).flat();
  const distribution = [1, 2, 3, 4, 5].map(l => ({
    level: l,
    count: allLevels.filter(x => x === l).length,
    label: GRADE_LABELS[l]
  }));

  // Trend: last 3 assessments
  const sortedAssessments = [...assessments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-3);
  const trend = sortedAssessments.map(a => {
    const res = a.results.find(r => r.studentId === studentId);
    return { date: a.date, title: a.title, level: getResultLevel(res, a, course).level };
  });

  return {
    categoryProfiles,
    weightedAvg,
    recommendation,
    distribution,
    trend,
    allLevels
  };
}

// ── Course Statistics ────────────────────────────────────────────
/**
 * Compute summary statistics for an entire course.
 */
export function computeCourseStats(course) {
  const recommendations = course.students.map(s => {
    const profile = computeStudentProfile(course, s.id);
    return profile.recommendation;
  }).filter(r => r !== null);

  if (recommendations.length === 0) {
    return { avg: null, distribution: [], count: 0 };
  }

  const avg = recommendations.reduce((s, r) => s + r, 0) / recommendations.length;
  const distribution = [1, 2, 3, 4, 5].map(l => ({
    level: l,
    count: recommendations.filter(r => r === l).length,
    label: GRADE_LABELS[l]
  }));

  return {
    avg: Math.round(avg * 10) / 10,
    distribution,
    count: recommendations.length,
    best: Math.min(...recommendations),
    worst: Math.max(...recommendations)
  };
}

// ── Formatting Helpers ───────────────────────────────────────────
export function formatLevel(level) {
  if (!level) return '–';
  return `${level} – ${GRADE_LABELS[level]}`;
}

export function gradeClass(level) {
  if (!level) return 'empty';
  return `g${level}`;
}

export function formatPct(pct) {
  if (pct === null || pct === undefined) return '–';
  return `${pct.toFixed(1)} %`;
}

export function getCutScoreLabel(pct, cutScores) {
  if (pct === null || pct === undefined) return null;
  const level = pctToLevel(pct, cutScores);
  return { level, label: GRADE_LABELS[level] };
}

// ── Timeline data for charts ─────────────────────────────────────
export function buildTimeline(course, studentId) {
  return [...course.assessments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(a => {
      const res = a.results.find(r => r.studentId === studentId);
      const { level } = getResultLevel(res, a, course);
      return { date: a.date, title: a.title, level };
    })
    .filter(d => d.level !== null);
}

// Expose for db.js cross-reference
window._grading = { computeStudentProfile };
