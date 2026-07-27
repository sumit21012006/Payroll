import ExcelJS from 'exceljs';
import * as path from 'path';

import fs from 'fs';

async function inspectAll() {
  const dirPath = path.join(__dirname, '..', '..', 'Salary_Reports');
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));

  for (const filename of files) {
    const p = path.join(dirPath, filename);
    console.log('=====================================================');
    console.log('FILE:', filename);
    console.log('=====================================================');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(p);

    for (const ws of wb.worksheets) {
      console.log(`\n--- SHEET: "${ws.name}" (${ws.rowCount} rows x ${ws.columnCount} cols) ---`);
      for (let r = 1; r <= Math.min(12, ws.rowCount); r++) {
        const row = ws.getRow(r);
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const v = cell.value;
          let str = typeof v === 'object' ? (v && 'result' in v ? String(v.result) : (v && 'text' in v ? String((v as any).text) : JSON.stringify(v))) : String(v);
          if (str.length > 35) str = str.substring(0, 32) + '...';
          cells.push(`Col ${colNumber}: ${str}`);
        });
        if (cells.length > 0) {
          console.log(`  Row ${r}:`, cells.slice(0, 10).join(' | '));
        }
      }
    }
  }
}

inspectAll().catch(console.error);
