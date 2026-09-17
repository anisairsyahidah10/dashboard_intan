import fs from 'node:fs/promises';
import '../public/scurve.js';
import '../public/status-engine.js';

const data = JSON.parse(await fs.readFile('.analysis/dashboard-data.json', 'utf8'));
const rows = [];

for (const [id, tasks] of Object.entries(data.initiatives)) {
  const all = globalThis.evaluateInitiativePerformance(tasks, { activeYear: 'ALL', monitoringDate: '2026-09-17' });
  const tasks2026 = tasks.filter(task => {
    const startYear = task.sasaranMula ? Number(String(task.sasaranMula).slice(0, 4)) : null;
    const endYear = task.sasaranTamat ? Number(String(task.sasaranTamat).slice(0, 4)) : null;
    return startYear === 2026 || endYear === 2026 || (startYear && endYear && startYear < 2026 && endYear > 2026);
  });
  const y2026 = globalThis.evaluateInitiativePerformance(tasks2026, { activeYear: '2026', monitoringDate: '2026-09-17' });
  rows.push({
    id: Number(id),
    tasks: tasks.length,
    weightSum: Number(tasks.reduce((sum, task) => sum + (Number(task.peratusRancang) || 0), 0).toFixed(4)),
    missingDates: tasks.filter(task => !task.sasaranMula || !task.sasaranTamat).length,
    all: { planned: all.planned, actual: all.actual, variance: all.variance, overdue: all.overdueCount, status: all.performance, execution: all.execution },
    y2026: { planned: y2026.planned, actual: y2026.actual, variance: y2026.variance, overdue: y2026.overdueCount, status: y2026.performance, execution: y2026.execution },
  });
}

console.table(rows.map(row => ({
  id: row.id,
  tasks: row.tasks,
  weightSum: row.weightSum,
  missing: row.missingDates,
  planned: row.all.planned,
  actual: row.all.actual,
  variance: row.all.variance === null ? null : Number(row.all.variance.toFixed(1)),
  overdue: row.all.overdue,
  status: row.all.status,
  execution: row.all.execution,
})));

console.log(JSON.stringify(rows, null, 2));
