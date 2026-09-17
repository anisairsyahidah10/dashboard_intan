import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = process.argv[2];
if (!workbookPath) throw new Error("Workbook path is required");

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 12000,
});
console.log("OVERVIEW");
console.log(overview.ndjson);

for (const sheet of workbook.worksheets.items) {
  if (!/^(GENERAL|INISIATIF\s*\d+)$/i.test(sheet.name)) continue;
  const used = sheet.getUsedRange(true);
  if (!used) continue;
  const values = used.values;
  console.log(`SHEET ${sheet.name} ${used.address}`);
  console.log(JSON.stringify(values.slice(0, 45).map((row) => row.slice(0, 16))));
}
