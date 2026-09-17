import fs from "node:fs/promises";
import "../public/scurve.js";
import "../public/status-engine.js";

const data = JSON.parse(await fs.readFile(".analysis/dashboard-data.json", "utf8"));
const dashboardHtml = await fs.readFile("public/dashboard.html", "utf8");
const inlineScripts = [...dashboardHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);
inlineScripts.forEach((source) => new Function(source));
const results = [];
const evaluations = [];

for (const [id, tasks] of Object.entries(data.initiatives)) {
  const curve = globalThis.buildDynamicSCurve(tasks, "2026-09-17");
  const plannedValues = curve.planned.filter((value) => value !== null);
  const actualValues = curve.actual.filter((value) => value !== null);
  const plannedMonotonic = plannedValues.every((value, index) => index === 0 || value >= plannedValues[index - 1]);
  const actualMonotonic = actualValues.every((value, index) => index === 0 || value >= actualValues[index - 1]);
  const valuesInRange = [...plannedValues, ...actualValues].every((value) => value >= 0 && value <= 100);
  const plannedReachesHundred = curve.basis === "no-dates" || plannedValues.at(-1) === 100;

  if (!plannedMonotonic || !actualMonotonic || !valuesInRange || !plannedReachesHundred) {
    throw new Error(`S-curve validation failed for Initiative ${id}`);
  }

  results.push({
    initiative: Number(id),
    points: curve.labels.length,
    basis: curve.basis,
    plannedFinal: plannedValues.at(-1),
    actualAsOf: actualValues.at(-1) ?? null,
  });
  const evaluation = globalThis.evaluateInitiativePerformance(tasks, {
    activeYear: "ALL",
    monitoringDate: "2026-09-17",
  });
  const validPerformance = ["ON TRACK", "PERLU PERHATIAN", "KRITIKAL", "DATA TIDAK LENGKAP", "SELESAI SEPENUHNYA", "PERANCANGAN"];
  const validExecution = ["BELUM MULA", "AKTIF", "LEWAT BELUM MULA", "SELESAI"];
  if (!validPerformance.includes(evaluation.performance) || !validExecution.includes(evaluation.execution)) {
    throw new Error(`Status validation failed for Initiative ${id}`);
  }
  evaluations.push(evaluation);

  const years = [...new Set(tasks.flatMap((task) => [task.sasaranMula, task.sasaranTamat])
    .filter(Boolean)
    .map((value) => String(value).slice(0, 4)))];
  for (const year of years) {
    const annual = globalThis.buildDynamicSCurve(tasks, "2026-09-17", year);
    const annualPlanned = annual.planned.filter((value) => value !== null);
    const annualActual = annual.actual.filter((value) => value !== null);
    const annualValues = [...annualPlanned, ...annualActual];
    if (annualValues.some((value) => value < 0 || value > 100)) {
      throw new Error(`Annual S-curve out of range for Initiative ${id}, ${year}`);
    }
    if (annual.basis !== "no-dates" && annualPlanned.at(-1) !== 100) {
      throw new Error(`Annual planned curve does not reach 100 for Initiative ${id}, ${year}`);
    }
  }
}

const portfolio = globalThis.evaluatePortfolioPerformance(evaluations);
if (!["MEMUASKAN", "PERLU PERHATIAN", "KRITIKAL", "PERANCANGAN", "DATA TIDAK MENCUKUPI"].includes(portfolio.status)) {
  throw new Error("Portfolio status validation failed");
}

const baseMetrics = {
  total: 10,
  completed: 2,
  started: 3,
  execution: "AKTIF",
  missingRatio: 0,
  curveBasis: "excel-weight",
  overdueCount: 0,
  overdueRatio: 0,
};
const boundaryCases = [
  [{ ...baseMetrics, variance: -5 }, "ON TRACK"],
  [{ ...baseMetrics, variance: -5.01 }, "PERLU PERHATIAN"],
  [{ ...baseMetrics, variance: -15 }, "PERLU PERHATIAN"],
  [{ ...baseMetrics, variance: -15.01 }, "KRITIKAL"],
  [{ ...baseMetrics, variance: 0, overdueCount: 2, overdueRatio: 0.20 }, "PERLU PERHATIAN"],
  [{ ...baseMetrics, variance: 0, overdueCount: 3, overdueRatio: 0.30 }, "KRITIKAL"],
  [{ ...baseMetrics, variance: 0, execution: "LEWAT BELUM MULA", started: 0 }, "PERLU PERHATIAN"],
  [{ ...baseMetrics, variance: null, curveBasis: "no-dates", missingRatio: 1, started: 0, execution: "BELUM MULA" }, "DATA TIDAK LENGKAP"],
];
boundaryCases.forEach(([metrics, expected]) => {
  const actual = globalThis.classifyInitiativePerformance(metrics);
  if (actual !== expected) throw new Error(`Boundary status expected ${expected}, received ${actual}`);
});

const equalWeightPortfolio = globalThis.evaluatePortfolioPerformance([
  { total: 100, started: 1, variance: -10, performance: "PERLU PERHATIAN" },
  { total: 1, started: 1, variance: 0, performance: "ON TRACK" },
]);
if (equalWeightPortfolio.variance !== -5) {
  throw new Error(`Portfolio must use equal initiative weights; received ${equalWeightPortfolio.variance}`);
}

console.log(JSON.stringify({ curves: results, portfolio }));
