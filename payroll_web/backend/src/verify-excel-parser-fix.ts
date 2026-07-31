import fs from 'fs';
import ExcelJS from 'exceljs';

function normalizeBiometricCode(code: string): string {
  if (!code) return '';
  return code.replace(/^KFIL[\/-_]/i, '').trim().toUpperCase();
}

function determineShiftStatus(checkIn: string, hoursWorked: number): string {
  if (!checkIn || checkIn === '-' || checkIn === '' || checkIn === '00:00') return 'A';
  if (hoursWorked === 0.0 && (!checkIn || checkIn === '00:00')) return 'A';

  const [inHour, inMin] = checkIn.split(':').map(Number);
  if (isNaN(inHour)) return 'A';

  const isShift1 = (inHour >= 5 && inHour <= 12);
  const shiftNum = isShift1 ? '1' : '2';

  let isLate = false;
  if (isShift1) {
    isLate = inHour > 7 || (inHour === 7 && inMin > 0);
  } else {
    if (inHour >= 13 && inHour <= 18) {
      isLate = inHour > 15 || (inHour === 15 && inMin > 0);
    } else if (inHour >= 21 || inHour <= 2) {
      isLate = (inHour === 23 && inMin > 0) || (inHour >= 0 && inHour <= 2);
    }
  }

  if (hoursWorked > 0.0 && hoursWorked < 4.0) {
    return `HD${shiftNum}`;
  } else if (hoursWorked > 9.0) {
    return `OT${shiftNum}`;
  } else if (isLate) {
    return `L${shiftNum}`;
  } else {
    return `P${shiftNum}`;
  }
}

async function verifyFix() {
  const filePath = 'D:/DEEPTI_ANTIGRAVITY/payroll_web/Attendence_31 July/DailyAttendance_BasicReport (6).xlsx';
  const fileBuf = fs.readFileSync(filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fileBuf as any);
  const ws = wb.worksheets[0];

  const targetDateStr = '7/31/2026';
  const records: any[] = [];

  for (let r = 12; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawCode = String(row.getCell(3).value || row.getCell(2).value || '').trim();
    if (!rawCode || /^(SNo|E\. Code|Department|Name|Status|Total)$/i.test(rawCode)) continue;

    const normCode = normalizeBiometricCode(rawCode);
    const name = String(row.getCell(4).value || '').trim();

    let rawInVal: any = row.getCell(8).value;
    let rawOutVal: any = row.getCell(9).value;
    let statusStr = String(row.getCell(14).value || '').trim();

    let rawIn = '';
    let rawOut = '';
    if (rawInVal instanceof Date) rawIn = rawInVal.toTimeString().slice(0, 5);
    else rawIn = String(rawInVal || '').trim();

    if (rawOutVal instanceof Date) rawOut = rawOutVal.toTimeString().slice(0, 5);
    else rawOut = String(rawOutVal || '').trim();

    let cIn = '';
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(rawIn) && rawIn !== '00:00' && rawIn !== '00:00:00') {
      cIn = rawIn.slice(0, 5);
    }

    let cOut = '';
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(rawOut) && rawOut !== '00:00' && rawOut !== '00:00:00') {
      cOut = rawOut.slice(0, 5);
    }

    let hoursWorked = 0.0;
    if (cIn && cOut) {
      // Calculate hours
      const [inH, inM] = cIn.split(':').map(Number);
      const [outH, outM] = cOut.split(':').map(Number);
      let diff = (outH * 60 + outM) - (inH * 60 + inM);
      if (diff < 0) diff += 24 * 60;
      hoursWorked = Number((diff / 60).toFixed(2));
    }

    let finalStatus = determineShiftStatus(cIn, hoursWorked);
    if (!cIn && (/absent/i.test(statusStr) || statusStr === '')) {
      finalStatus = 'A';
    }

    records.push({ code: normCode, name, cIn: cIn || '-', cOut: cOut || '-', hoursWorked, status: finalStatus });
  }

  console.log('Total Parsed:', records.length);
  console.log('\n--- SAMPLE PARSED RECORDS ---');
  const samples = ['L1_120', 'L1-004', 'L1-014', 'KFIL-L1-001', 'L-026', 'L1-019', 'L1-038'];
  for (const s of samples) {
    const r = records.find(x => x.code === s || x.code === normalizeBiometricCode(s));
    if (r) {
      console.log(`${r.code.padEnd(12)} | ${r.name.padEnd(30)} | In: ${r.cIn.padEnd(6)} | Out: ${r.cOut.padEnd(6)} | Hrs: ${r.hoursWorked} | Status: ${r.status}`);
    }
  }

  console.log('\nStatus counts:');
  const counts = new Map<string, number>();
  records.forEach(r => counts.set(r.status, (counts.get(r.status) || 0) + 1));
  for (const [k, v] of counts) {
    console.log(`  ${k}: ${v}`);
  }
}

verifyFix().catch(console.error);
