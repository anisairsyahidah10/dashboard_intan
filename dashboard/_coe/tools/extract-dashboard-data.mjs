import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [workbookPath, outputPath] = process.argv.slice(2);
if (!workbookPath || !outputPath) {
  throw new Error("Usage: extract-dashboard-data.mjs <workbook.xlsx> <output.json>");
}

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const today = new Date("2026-09-17T00:00:00Z");

function asNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function excelDate(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

function statusFor(rawStatus, actualStart, actualEnd, plannedStart, plannedEnd) {
  const normalized = String(rawStatus || "").trim().toUpperCase();
  if (/SELESAI|COMPLETE/.test(normalized)) return "SELESAI";
  if (/PELAKSANAAN|PROGRESS|SEDANG/.test(normalized)) return "DALAM PELAKSANAAN";
  if (/BELUM|NOT START/.test(normalized)) return "BELUM MULA";
  if (actualEnd) return "SELESAI";
  if (actualStart) return "DALAM PELAKSANAAN";
  if (plannedEnd && new Date(`${plannedEnd}T00:00:00Z`) < today) return "LEWAT";
  if (plannedStart && new Date(`${plannedStart}T00:00:00Z`) <= today) return "BELUM MULA";
  return "BELUM MULA";
}

const monthKeys = ["JUN", "JUL", "OGOS", "SEPT", "OKT", "NOV", "DIS", "JAN"];
function weekMarks(startText, endText) {
  const marks = {};
  if (!startText || !endText) return marks;
  const start = new Date(`${startText}T00:00:00Z`);
  const end = new Date(`${endText}T00:00:00Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return marks;
  for (const key of monthKeys) {
    const monthIndex = { JUN: 5, JUL: 6, OGOS: 7, SEPT: 8, OKT: 9, NOV: 10, DIS: 11, JAN: 0 }[key];
    const year = key === "JAN" ? 2027 : 2026;
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const spans = [[1, 7], [8, 14], [15, 21], [22, lastDay]];
    spans.forEach(([fromDay, toDay], index) => {
      const from = new Date(Date.UTC(year, monthIndex, fromDay));
      const to = new Date(Date.UTC(year, monthIndex, toDay));
      if (start <= to && end >= from) marks[`${key}_M${index + 1}`] = true;
    });
  }
  return marks;
}

const initiatives = {};
const diagnostics = [];

for (const sheet of workbook.worksheets.items) {
  const match = sheet.name.trim().match(/^INISIATIF\s*(\d+)$/i);
  if (!match) continue;
  const id = Number(match[1]);
  const used = sheet.getUsedRange(true);
  const rows = used ? used.values : [];
  const tasks = [];

  for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const bil = Number(row[0]);
    const aktiviti = String(row[1] || "").trim();
    if (!Number.isFinite(bil) || bil <= 0 || !aktiviti) continue;

    const sasaranMula = excelDate(row[3]);
    const sasaranTamat = excelDate(row[4]);
    const laksanaMula = excelDate(row[5]);
    const laksanaTamat = excelDate(row[6]);
    const status = statusFor(row[12], laksanaMula, laksanaTamat, sasaranMula, sasaranTamat);

    tasks.push({
      bil,
      aktiviti,
      kos: asNumber(row[2]),
      sasaranMula,
      sasaranTamat,
      laksanaMula,
      laksanaTamat,
      tempohRancang: asNumber(row[7]),
      tempohSelesai: asNumber(row[8]),
      peratusRancang: asNumber(row[9]),
      peratusSemasa: asNumber(row[10]),
      output: String(row[11] || "").trim(),
      status,
      statusSumber: String(row[12] || "").trim(),
      sourceRow: rowIndex + 1,
      weeks: weekMarks(sasaranMula, sasaranTamat),
    });
  }

  const seen = new Set();
  const duplicateBil = [...new Set(tasks.filter((task) => seen.has(task.bil) || !seen.add(task.bil)).map((task) => task.bil))];
  diagnostics.push({
    id,
    sheet: sheet.name,
    tasks: tasks.length,
    completed: tasks.filter((task) => task.status === "SELESAI").length,
    inProgress: tasks.filter((task) => task.status === "DALAM PELAKSANAAN").length,
    overdue: tasks.filter((task) => task.status === "LEWAT").length,
    missingPlannedDates: tasks.filter((task) => !task.sasaranMula || !task.sasaranTamat).length,
    duplicateBil,
    cost: tasks.reduce((sum, task) => sum + task.kos, 0),
  });
  initiatives[id] = tasks;
}

await fs.mkdir(new URL(".", `file:///${outputPath.replace(/\\/g, "/")}`).pathname, { recursive: true }).catch(() => {});
await fs.writeFile(outputPath, JSON.stringify({ sourceDate: "2026-09-11", monitoringDate: "2026-09-17", initiatives, diagnostics }, null, 2));
console.log(JSON.stringify({ initiatives: Object.keys(initiatives).length, diagnostics }));
