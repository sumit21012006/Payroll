import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

function norm(c: string): string {
  let r = c.replace(/^KFIL[\/-_]/i, '').trim().toUpperCase();
  // Convert L1001 -> L1-001, L2009 -> L2-009
  const m = r.match(/^(L\d)(\d{3})$/);
  if (m) r = m[1] + '-' + m[2];
  return r;
}

(async () => {
  const dir = 'D:/DEEPTI_ANTIGRAVITY/payroll_web/Attendence_31 July';
  
  // Parse ESSL
  const wbE = new ExcelJS.Workbook();
  await wbE.xlsx.readFile(path.join(dir, 'DailyAttendance_BasicReport (6).xlsx'));
  const wsE = wbE.worksheets[0];
  
  const essl = new Map<string, any>();
  for (let r = 12; r <= wsE.rowCount; r++) {
    const row = wsE.getRow(r);
    const rawCode = String(row.getCell(3).value || '').trim();
    if (!rawCode) continue;
    const code = norm(rawCode);
    const name = String(row.getCell(4).value || '').trim();
    const status = String(row.getCell(14).value || '').trim();
    let inTime = row.getCell(8).value;
    let outTime = row.getCell(9).value;
    if (inTime instanceof Date) inTime = inTime.toTimeString().slice(0, 8);
    else inTime = String(inTime || '').trim();
    if (outTime instanceof Date) outTime = outTime.toTimeString().slice(0, 8);
    else outTime = String(outTime || '').trim();
    const workDur = String(row.getCell(11).value || '').trim();
    essl.set(code, { rawCode, code, name, status, inTime, outTime, workDur });
  }
  
  // Parse Payroll
  const wbP = new ExcelJS.Workbook();
  await wbP.xlsx.readFile(path.join(dir, 'Attendance_Logs_2026-07-31_to_2026-07-31.xlsx'));
  const wsP = wbP.worksheets[0];
  
  const pay = new Map<string, any>();
  for (let r = 2; r <= wsP.rowCount; r++) {
    const row = wsP.getRow(r);
    const code = norm(String(row.getCell(2).value || '').trim());
    if (!code) continue;
    const name = String(row.getCell(3).value || '').trim();
    const checkIn = String(row.getCell(5).value || '').trim();
    const checkOut = String(row.getCell(6).value || '').trim();
    const hours = parseFloat(String(row.getCell(7).value || '0')) || 0;
    const status = String(row.getCell(8).value || '').trim();
    pay.set(code, { code, name, checkIn, checkOut, hours, status });
  }
  
  const lines: string[] = [];
  lines.push('===============================================================================');
  lines.push('  ATTENDANCE COMPARISON: 31-JUL-2026 (ESSL vs Payroll Script Output)');
  lines.push('===============================================================================');
  lines.push(`ESSL Total: ${essl.size} employees | Payroll Total: ${pay.size} records`);
  lines.push('');
  
  // 1. Present in ESSL but missing from payroll — CRITICAL
  const missingPresent: any[] = [];
  const missingAbsent: any[] = [];
  for (const [code, e] of essl) {
    if (!pay.has(code)) {
      if (/present/i.test(e.status)) missingPresent.push(e);
      else missingAbsent.push(e);
    }
  }
  
  lines.push(`CATEGORY 1: PRESENT IN ESSL BUT MISSING FROM PAYROLL (${missingPresent.length}) — CRITICAL`);
  for (const e of missingPresent) {
    lines.push(`    ${e.code.padEnd(13)}| ${e.name.padEnd(36)}| In: ${(e.inTime || '-').padEnd(10)} | Out: ${(e.outTime || '-').padEnd(10)}| Dur: ${e.workDur}`);
  }
  
  lines.push('');
  lines.push(`CATEGORY 2: ABSENT IN ESSL AND NOT IN PAYROLL (${missingAbsent.length}) — Expected`);
  
  // 3. Payroll records pending checkout (night shift — checkout will come tomorrow)
  const pendingCheckout: any[] = [];
  const pendingWithEsslOut: any[] = [];
  for (const [code, p] of pay) {
    if (!p.checkOut || p.checkOut === '-' || p.checkOut === '') {
      const e = essl.get(code);
      if (e && e.outTime && e.outTime !== '' && /present/i.test(e.status)) {
        pendingWithEsslOut.push({ ...p, esslIn: e.inTime, esslOut: e.outTime, esslDur: e.workDur });
      } else {
        pendingCheckout.push({ ...p, esslIn: e?.inTime || '-', esslOut: e?.outTime || '-', esslDur: e?.workDur || '-' });
      }
    }
  }
  
  lines.push('');
  lines.push(`CATEGORY 3: PAYROLL RECORDS PENDING CHECKOUT — NO CHECKOUT YET (${pendingCheckout.length})`);
  lines.push('  (These are night shift workers whose checkout will come tomorrow morning)');
  for (const p of pendingCheckout) {
    lines.push(`    ${p.code.padEnd(13)}| ${p.name.padEnd(36)}| PayIn: ${p.checkIn.padEnd(6)} | ESSL In: ${p.esslIn.padEnd(10)} Out: ${p.esslOut.padEnd(10)}| Dur: ${p.esslDur}`);
  }
  
  lines.push('');
  lines.push(`CATEGORY 4: PAYROLL HAS NO CHECKOUT BUT ESSL HAS CHECKOUT (${pendingWithEsslOut.length}) — BUG`);
  lines.push('  (ESSL shows checkout exists but payroll did not capture it)');
  for (const p of pendingWithEsslOut) {
    lines.push(`    ${p.code.padEnd(13)}| ${p.name.padEnd(36)}| PayIn: ${p.checkIn.padEnd(6)} | ESSL In: ${p.esslIn.padEnd(10)} Out: ${p.esslOut.padEnd(10)}| Dur: ${p.esslDur}`);
  }
  
  // 5. Hours mismatches for completed records
  const hoursMismatch: any[] = [];
  for (const [code, p] of pay) {
    if (p.checkOut && p.checkOut !== '-' && p.hours > 0) {
      const e = essl.get(code);
      if (e && e.workDur && e.workDur !== '00:00') {
        const parts = e.workDur.split(':').map(Number);
        const esslHrs = parts[0] + (parts[1] || 0) / 60;
        if (Math.abs(esslHrs - p.hours) > 1) {
          hoursMismatch.push({ ...p, esslDur: e.workDur, esslHrs: esslHrs.toFixed(1) });
        }
      }
    }
  }
  
  lines.push('');
  lines.push(`CATEGORY 5: HOURS MISMATCH > 1hr (completed records) (${hoursMismatch.length})`);
  for (const h of hoursMismatch) {
    lines.push(`    ${h.code.padEnd(13)}| ${h.name.padEnd(36)}| ESSL: ${h.esslDur} (${h.esslHrs}h) | Payroll: ${h.hours}h`);
  }
  
  // In Payroll but not in ESSL
  const notInEssl: any[] = [];
  for (const [code, p] of pay) {
    if (!essl.has(code)) notInEssl.push(p);
  }
  lines.push('');
  lines.push(`CATEGORY 6: IN PAYROLL BUT NOT IN ESSL (${notInEssl.length})`);
  for (const p of notInEssl) {
    lines.push(`    ${p.code.padEnd(13)}| ${p.name.padEnd(36)}| In: ${p.checkIn.padEnd(6)} Out: ${(p.checkOut || '-').padEnd(6)} | Hrs: ${p.hours} | ${p.status}`);
  }
  
  // Summary
  const withCheckout = [...pay.values()].filter(p => p.checkOut && p.checkOut !== '-' && p.checkOut !== '').length;
  lines.push('');
  lines.push('================================================================================');
  lines.push('SUMMARY');
  lines.push('================================================================================');
  lines.push(`  ESSL Total:                     ${essl.size} employees`);
  lines.push(`  ESSL Present:                   ${[...essl.values()].filter(e => /present/i.test(e.status)).length}`);
  lines.push(`  Payroll Total:                  ${pay.size} records`);
  lines.push(`  Payroll with Checkout:          ${withCheckout}`);
  lines.push(`  Payroll pending Checkout:       ${pay.size - withCheckout} (night shift — checkout tomorrow)`);
  lines.push(`  Present in ESSL, missing Pay:   ${missingPresent.length} — CRITICAL`);
  lines.push(`  ESSL has Out, Payroll doesn't:  ${pendingWithEsslOut.length} — BUG`);
  lines.push(`  Hours mismatch > 1hr:           ${hoursMismatch.length}`);
  lines.push(`  In Payroll not in ESSL:         ${notInEssl.length}`);
  
  const output = lines.join('\n');
  console.log('\n' + output);
  
  const outPath = path.join(dir, 'COMPARISON_RESULTS_31_JULY.txt');
  fs.writeFileSync(outPath, output, 'utf8');
  console.log('\nResults saved to:', outPath);
})();
