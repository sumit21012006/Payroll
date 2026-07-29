import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

/**
 * Deep comparison of ESSL Biometric vs Payroll attendance for 27-Jul-2026.
 * Writes complete results to a file to avoid truncation.
 */

interface BioRecord {
  sno: number;
  eCode: string;
  name: string;
  shift: string;
  inTime: string;
  outTime: string;
  workDur: string;
  ot: string;
  totDur: string;
  status: string;
}

interface PayRecord {
  date: string;
  employeeId: string;
  employeeName: string;
  department: string;
  checkIn: string;
  checkOut: string;
  hoursWorked: number;
  status: string;
}

async function deepCompare() {
  const dir = path.resolve(__dirname, '../../Attendence_27 July');
  const biometricPath = path.join(dir, 'Attendence Biometric 27 July.xlsx');
  const payrollPath   = path.join(dir, 'Attendance Payroll 27 July.xlsx');

  const wbBio = new ExcelJS.Workbook();
  await wbBio.xlsx.readFile(biometricPath);

  const wbPay = new ExcelJS.Workbook();
  await wbPay.xlsx.readFile(payrollPath);

  const bioSheet = wbBio.worksheets[0];
  const paySheet = wbPay.worksheets[0];

  // ---------- Parse Biometric Records ----------
  const bioRecords: BioRecord[] = [];
  for (let r = 5; r <= bioSheet.rowCount; r++) {
    const row = bioSheet.getRow(r);
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      let v = '';
      if (cell.value instanceof Date) {
        v = cell.value.toTimeString().slice(0, 8);
      } else {
        v = cell.value?.toString()?.trim() || '';
      }
      vals[col] = v;
    });
    const sno = parseInt(vals[1] || '0');
    if (!sno || sno === 0) continue;
    bioRecords.push({
      sno,
      eCode: vals[2] || '',
      name: (vals[3] || vals[4] || '').trim(),
      shift: (vals[5] || vals[6] || '').trim(),
      inTime: vals[7] || '',
      outTime: vals[8] || vals[9] || '',
      workDur: vals[10] || '',
      ot: vals[11] || '',
      totDur: vals[12] || '',
      status: (vals[13] || vals[14] || '').trim()
    });
  }

  // ---------- Parse Payroll Records ----------
  const payRecords: PayRecord[] = [];
  for (let r = 2; r <= paySheet.rowCount; r++) {
    const row = paySheet.getRow(r);
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      let v = '';
      if (cell.value instanceof Date) {
        v = cell.value.toISOString();
      } else {
        v = cell.value?.toString()?.trim() || '';
      }
      vals[col] = v;
    });
    if (!vals[2]) continue;
    payRecords.push({
      date: vals[1] || '',
      employeeId: vals[2] || '',
      employeeName: vals[3] || '',
      department: vals[4] || '',
      checkIn: vals[5] || '',
      checkOut: vals[6] || '',
      hoursWorked: parseFloat(vals[7] || '0') || 0,
      status: vals[8] || ''
    });
  }

  const normalizeCode = (code: string): string => {
    return code.replace(/^KFIL[\/-]/i, '').trim().toUpperCase();
  };

  const bioByCode = new Map<string, BioRecord>();
  for (const rec of bioRecords) {
    bioByCode.set(normalizeCode(rec.eCode), rec);
  }

  const payByCode = new Map<string, PayRecord>();
  for (const rec of payRecords) {
    payByCode.set(rec.employeeId.toUpperCase(), rec);
  }

  const lines: string[] = [];
  const log = (s: string) => lines.push(s);

  log(`Total ESSL Biometric Records: ${bioRecords.length}`);
  log(`Total Payroll Records: ${payRecords.length}`);

  // ----- CATEGORY 1: In ESSL but NOT in Payroll -----
  const inBioNotPay: BioRecord[] = [];
  for (const [nc, bio] of bioByCode) {
    if (!payByCode.has(nc)) inBioNotPay.push(bio);
  }

  // Separate into actually-present missing vs absent missing
  const missingPresent = inBioNotPay.filter(b => {
    const s = b.status.toUpperCase();
    return s.includes('PRESENT') || s.includes('P') || (b.inTime !== '00:00' && b.inTime !== '' && !s.includes('ABSENT'));
  });
  const missingAbsent = inBioNotPay.filter(b => {
    const s = b.status.toUpperCase();
    return s.includes('ABSENT') || (b.inTime === '00:00' && b.outTime === '00:00');
  });

  log(`\n${'='.repeat(80)}`);
  log(`CATEGORY 1: EMPLOYEES IN ESSL BUT NOT IN PAYROLL (${inBioNotPay.length})`);
  log(`${'='.repeat(80)}`);
  
  log(`\n  A) ACTUALLY PRESENT IN ESSL BUT MISSING FROM PAYROLL (${missingPresent.length}) — CRITICAL`);
  missingPresent.forEach(b => {
    log(`    ${normalizeCode(b.eCode).padEnd(12)} | ${b.name.padEnd(35)} | ESSL: ${b.status.padEnd(10)} | In: ${b.inTime.padEnd(10)} | Out: ${b.outTime.padEnd(10)} | WorkDur: ${b.workDur}`);
  });

  log(`\n  B) ABSENT IN ESSL AND NOT IN PAYROLL (${missingAbsent.length}) — Expected behavior`);
  missingAbsent.forEach(b => {
    log(`    ${normalizeCode(b.eCode).padEnd(12)} | ${b.name.padEnd(35)} | ESSL: ${b.status}`);
  });

  // ----- CATEGORY 2: In Payroll but NOT in ESSL -----
  const inPayNotBio: PayRecord[] = [];
  for (const [nc, pay] of payByCode) {
    if (!bioByCode.has(nc)) inPayNotBio.push(pay);
  }

  log(`\n${'='.repeat(80)}`);
  log(`CATEGORY 2: IN PAYROLL BUT NOT IN ESSL (${inPayNotBio.length})`);
  log(`${'='.repeat(80)}`);
  inPayNotBio.forEach(p => {
    log(`    ${p.employeeId.padEnd(12)} | ${p.employeeName.padEnd(35)} | Status: ${p.status.padEnd(10)} | CheckIn: ${p.checkIn} | CheckOut: ${p.checkOut}`);
  });

  // ----- CATEGORY 3: Status mismatch -----
  const statusMismatch: { bio: BioRecord; pay: PayRecord; nc: string }[] = [];
  for (const [nc, bio] of bioByCode) {
    const pay = payByCode.get(nc);
    if (!pay) continue;
    const bioS = bio.status.toUpperCase();
    const payS = pay.status.toUpperCase();
    const bioIsAbsent = bioS.includes('ABSENT') || (bio.inTime === '00:00' && bio.outTime === '00:00' && bioS !== 'PRESENT');
    const payIsPresent = payS.includes('PRESENT') || payS.includes('LATE');
    const bioIsPresent = bioS.includes('PRESENT') || (bio.inTime !== '00:00' && bio.inTime !== '');
    const payIsAbsent = payS.includes('ABSENT');
    if ((bioIsAbsent && payIsPresent) || (bioIsPresent && payIsAbsent)) {
      statusMismatch.push({ bio, pay, nc });
    }
  }

  log(`\n${'='.repeat(80)}`);
  log(`CATEGORY 3: STATUS CONTRADICTIONS (${statusMismatch.length})`);
  log(`${'='.repeat(80)}`);
  statusMismatch.forEach(({ bio, pay, nc }) => {
    log(`    ${nc.padEnd(12)} | ${bio.name.padEnd(35)} | ESSL: ${bio.status.padEnd(12)} InTime: ${bio.inTime.padEnd(10)} | Payroll: ${pay.status.padEnd(12)} CheckIn: ${pay.checkIn}`);
  });

  // ----- CATEGORY 4: Check-in == Check-out (0 hours calculated but marked present/late) -----
  const sameTimestamp: { pay: PayRecord; bio: BioRecord | undefined; nc: string }[] = [];
  for (const pay of payRecords) {
    if (pay.checkIn === pay.checkOut && pay.checkIn !== '-' && pay.checkIn !== '') {
      const nc = pay.employeeId.toUpperCase();
      sameTimestamp.push({ pay, bio: bioByCode.get(nc), nc });
    }
  }

  log(`\n${'='.repeat(80)}`);
  log(`CATEGORY 4: PAYROLL CHECK-IN == CHECK-OUT (0 hours, ${sameTimestamp.length} records)`);
  log(`${'='.repeat(80)}`);
  log(`  These employees had their check-in and check-out recorded as the SAME timestamp.`);
  log(`  This means 0 hours worked was calculated, even though ESSL shows they worked a full shift.`);
  log('');
  
  // Sub-categorise by shift pattern
  const nightShiftSame = sameTimestamp.filter(s => {
    const hr = parseInt(s.pay.checkIn.split(':')[0] || '0');
    return hr >= 22 || hr < 6;
  });
  const dayShiftSame = sameTimestamp.filter(s => {
    const hr = parseInt(s.pay.checkIn.split(':')[0] || '0');
    return hr >= 6 && hr < 22;
  });

  log(`  A) NIGHT SHIFT (Check-in 22:00-06:00) — ${nightShiftSame.length} records`);
  nightShiftSame.forEach(({ pay, bio, nc }) => {
    const bioOut = bio?.outTime || 'N/A';
    const bioWorkDur = bio?.workDur || 'N/A';
    log(`    ${nc.padEnd(12)} | ${pay.employeeName.padEnd(35)} | Payroll: In ${pay.checkIn} Out ${pay.checkOut} Hrs: ${pay.hoursWorked} | ESSL Out: ${bioOut.padEnd(10)} WorkDur: ${bioWorkDur}`);
  });

  log(`\n  B) DAY SHIFT (Check-in 06:00-22:00) — ${dayShiftSame.length} records`);
  dayShiftSame.forEach(({ pay, bio, nc }) => {
    const bioOut = bio?.outTime || 'N/A';
    const bioWorkDur = bio?.workDur || 'N/A';
    log(`    ${nc.padEnd(12)} | ${pay.employeeName.padEnd(35)} | Payroll: In ${pay.checkIn} Out ${pay.checkOut} Hrs: ${pay.hoursWorked} | ESSL Out: ${bioOut.padEnd(10)} WorkDur: ${bioWorkDur}`);
  });

  // ----- CATEGORY 5: Hours mismatch (both present but significantly different hours) -----
  log(`\n${'='.repeat(80)}`);
  log(`CATEGORY 5: HOURS WORKED COMPARISON (both present in both systems)`);
  log(`${'='.repeat(80)}`);

  let matchedCount = 0;
  for (const [nc, bio] of bioByCode) {
    const pay = payByCode.get(nc);
    if (!pay) continue;
    const bioS = bio.status.toUpperCase();
    const payS = pay.status.toUpperCase();
    if (bioS.includes('ABSENT') || payS.includes('ABSENT')) continue;

    // Parse bio work duration (format HH:MM or similar)
    let bioHours = 0;
    if (bio.workDur) {
      const parts = bio.workDur.split(':');
      if (parts.length >= 2) {
        bioHours = parseInt(parts[0]) + parseInt(parts[1]) / 60;
      }
    }
    
    const payHours = pay.hoursWorked;
    const diff = Math.abs(bioHours - payHours);
    
    if (diff > 2) { // More than 2 hours difference
      matchedCount++;
      log(`    ${nc.padEnd(12)} | ${bio.name.padEnd(35)} | ESSL Hrs: ${bioHours.toFixed(1).padStart(5)} | Payroll Hrs: ${payHours.toFixed(1).padStart(5)} | Diff: ${diff.toFixed(1)}h | ESSL In: ${bio.inTime} Out: ${bio.outTime} | Pay In: ${pay.checkIn} Out: ${pay.checkOut}`);
    }
  }
  log(`  Total with >2hr difference: ${matchedCount}`);

  // ----- SUMMARY -----
  log(`\n${'='.repeat(80)}`);
  log(`SUMMARY`);
  log(`${'='.repeat(80)}`);
  log(`  ESSL Total:            ${bioRecords.length} employees`);
  log(`  Payroll Total:         ${payRecords.length} records`);
  log(`  Missing from Payroll:  ${inBioNotPay.length} (${missingPresent.length} were PRESENT, ${missingAbsent.length} were ABSENT)`);
  log(`  Missing from ESSL:     ${inPayNotBio.length}`);
  log(`  Status Contradictions: ${statusMismatch.length}`);
  log(`  Same Check-in/out:     ${sameTimestamp.length} (Hours = 0 despite working)`);
  log(`  Major Hours Diff:      ${matchedCount}`);

  // Write to file
  const outPath = path.resolve(__dirname, '../../Attendence_27 July/COMPARISON_RESULTS.txt');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`\nResults written to: ${outPath}`);
  console.log(lines.join('\n'));
}

deepCompare().catch(console.error);
