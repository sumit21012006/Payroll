const ExcelJS = require('exceljs');

async function main() {
  // ============================================================
  // PARSE ESSL SOURCE FILE
  // ============================================================
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile('D:/DEEPTI_ANTIGRAVITY/payroll_web/FINAL CHECK/Essl Attendence.xlsx');
  const ws1 = wb1.worksheets[0];

  // ESSL structure:
  // Row 8+: date header rows with "Attendance Date | 01-Aug-2026" etc.
  // Row 11 = column headers (SNo | E. Code | Name | Shift | InTime | OutTime | Work Dur | Status)
  // Data rows start at 12 for each date block
  // Col 3 = E.Code, Col 4=Name, Col 8=InTime, Col 9=OutTime (or col10), Col 13=Status

  const esslRecords = []; // { eCode, name, date, inTime, outTime, workDur, status }

  let currentDate = null;

  for (let r = 8; r <= ws1.rowCount; r++) {
    const row = ws1.getRow(r);
    
    const c2 = String(row.getCell(2).value || '').trim();
    const c3 = String(row.getCell(3).value || '').trim();
    const c4 = String(row.getCell(4).value || '').trim();

    // Date header row: col2 = "Attendance Date", col5 = "01-Aug-2026"
    if (c2 === 'Attendance Date') {
      const rawDate = String(row.getCell(5).value || '').trim();
      // Parse "01-Aug-2026" -> "8/1/2026"
      const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
      const m = rawDate.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
      if (m) {
        currentDate = `${months[m[2]]}/${parseInt(m[1])}/${m[3]}`;
      }
      continue;
    }

    // Column header row - skip
    if (c2 === 'SNo') continue;

    // Data row: col2 = number, col3 = E.Code, col4 = Name
    if (!currentDate) continue;
    const sno = row.getCell(2).value;
    if (!sno || isNaN(Number(sno))) continue;

    const eCode = c3;
    const name = c4;
    
    // InTime col 8, OutTime col 9 (might be empty), Status col 14
    const getTime = (cell) => {
      const v = cell.value;
      if (!v) return '';
      const s = String(v).trim();
      if (s === '0' || s === '' || s === '00:00') return '';
      // ExcelJS may return time as fraction
      if (typeof v === 'number') {
        const totalMins = Math.round(v * 24 * 60);
        const h = Math.floor(totalMins / 60) % 24;
        const mn = totalMins % 60;
        return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
      }
      return s;
    };

    const inTime = getTime(row.getCell(8));
    const outTime = getTime(row.getCell(9)) || getTime(row.getCell(10));
    const workDurRaw = row.getCell(11).value;
    const workDur = workDurRaw ? String(workDurRaw).trim() : '';
    const statusRaw = String(row.getCell(14).value || row.getCell(13).value || '').trim();
    const status = statusRaw;

    if (!eCode) continue;

    esslRecords.push({ eCode, name, date: currentDate, inTime, outTime, workDur, status });
  }

  console.log(`ESSL: Parsed ${esslRecords.length} records across all dates`);

  // ============================================================
  // PARSE DB RECORDS FILE
  // ============================================================
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile('D:/DEEPTI_ANTIGRAVITY/payroll_web/FINAL CHECK/Attendence records.xlsx');
  const ws2 = wb2.worksheets[0];

  const dbRecords = [];

  for (let r = 2; r <= ws2.rowCount; r++) {
    const row = ws2.getRow(r);
    const dateRaw = String(row.getCell(1).value || '').trim();
    const empId = String(row.getCell(2).value || '').trim();
    const empName = String(row.getCell(3).value || '').trim();
    const dept = String(row.getCell(4).value || '').trim();
    const checkIn = String(row.getCell(5).value || '').trim();
    const checkOut = String(row.getCell(6).value || '').trim();
    const hoursWorked = row.getCell(7).value;
    const status = String(row.getCell(8).value || '').trim();

    if (!dateRaw || !empId) continue;
    dbRecords.push({ date: dateRaw, empId, empName, dept, checkIn, checkOut, hoursWorked, status });
  }

  console.log(`DB: Parsed ${dbRecords.length} records\n`);

  // ============================================================
  // NORMALIZE ESSL CODES
  // ============================================================
  function normalizeCode(code) {
    if (!code) return '';
    // Remove KFIL/, KFIL-, KFIL_ prefix
    let c = code.replace(/^KFIL[\/\-_]/i, '').trim().toUpperCase();
    // Normalize L1-001 vs L1001 etc
    // Remove zeros padding: L1-001 -> L1-1? No, keep as is for now
    return c;
  }

  // Build ESSL map: normalizedCode_date -> record
  const esslMap = new Map();
  for (const r of esslRecords) {
    const key = `${normalizeCode(r.eCode)}_${r.date}`;
    // There might be multiple rows per employee per date in ESSL (if employee appears in multiple departments)
    if (!esslMap.has(key)) esslMap.set(key, []);
    esslMap.get(key).push(r);
  }

  // Build DB map: empId_date -> record
  const dbMap = new Map();
  for (const r of dbRecords) {
    const key = `${r.empId}_${r.date}`;
    dbMap.set(key, r);
  }

  // ============================================================
  // COMPARISON
  // ============================================================
  let issues = [];

  // Check all ESSL records against DB
  for (const [key, esslList] of esslMap) {
    const essl = esslList[0]; // take first match
    const dbRec = dbMap.get(key);

    if (!dbRec) {
      // MISSING in DB
      if (essl.status !== 'Absent' && essl.inTime) {
        issues.push({ type: 'MISSING_IN_DB', date: essl.date, eCode: essl.eCode, name: essl.name, esslIn: essl.inTime, esslOut: essl.outTime, esslStatus: essl.status });
      }
      continue;
    }

    // Check for wrong CheckOut (auto-checkout error - UTC vs IST)
    if (dbRec.checkOut && essl.outTime && dbRec.checkOut !== essl.outTime) {
      // Calculate expected checkout from ESSL
      issues.push({ type: 'WRONG_CHECKOUT', date: essl.date, eCode: essl.eCode, name: essl.name, esslIn: essl.inTime, esslOut: essl.outTime, dbIn: dbRec.checkIn, dbOut: dbRec.checkOut, esslStatus: essl.status, dbStatus: dbRec.status });
    }

    // Check for hours worked = 8 but checkout doesn't match
    if (Number(dbRec.hoursWorked) === 8 && essl.outTime && dbRec.checkOut !== essl.outTime) {
      // Already captured above
    }

    // Check status mismatches (Absent in ESSL but Present in DB or vice versa)
    const esslAbsent = essl.status === 'Absent' || !essl.inTime;
    const dbAbsent = dbRec.status === 'A';
    if (esslAbsent && !dbAbsent) {
      issues.push({ type: 'STATUS_MISMATCH_ABSENT', date: essl.date, eCode: essl.eCode, name: essl.name, esslStatus: essl.status, dbStatus: dbRec.status, dbIn: dbRec.checkIn });
    }
  }

  // Check for DB records not in ESSL
  for (const [key, dbRec] of dbMap) {
    if (!esslMap.has(key)) {
      issues.push({ type: 'EXTRA_IN_DB', date: dbRec.date, eCode: dbRec.empId, name: dbRec.empName, dbIn: dbRec.checkIn, dbOut: dbRec.checkOut, dbStatus: dbRec.status });
    }
  }

  // ============================================================
  // REPORT
  // ============================================================
  const missing = issues.filter(i => i.type === 'MISSING_IN_DB');
  const wrongCheckout = issues.filter(i => i.type === 'WRONG_CHECKOUT');
  const statusMismatch = issues.filter(i => i.type === 'STATUS_MISMATCH_ABSENT');
  const extra = issues.filter(i => i.type === 'EXTRA_IN_DB');

  console.log(`\n====== ISSUE SUMMARY ======`);
  console.log(`MISSING in DB (ESSL has punch, DB doesn't): ${missing.length}`);
  console.log(`WRONG CHECKOUT (DB checkout != ESSL checkout): ${wrongCheckout.length}`);
  console.log(`STATUS MISMATCH (ESSL=Absent, DB=Present): ${statusMismatch.length}`);
  console.log(`EXTRA in DB (DB has record, ESSL doesn't): ${extra.length}`);

  console.log(`\n--- MISSING IN DB (first 20) ---`);
  missing.slice(0,20).forEach(i => console.log(`  ${i.date} | ${i.eCode} | ${i.name} | ESSL In:${i.esslIn} Out:${i.esslOut} Status:${i.esslStatus}`));

  console.log(`\n--- WRONG CHECKOUT (first 30) ---`);
  wrongCheckout.slice(0,30).forEach(i => console.log(`  ${i.date} | ${i.eCode} | ${i.name} | ESSL In:${i.esslIn} Out:${i.esslOut} | DB In:${i.dbIn} Out:${i.dbOut}`));

  console.log(`\n--- STATUS MISMATCH Absent vs Present (first 20) ---`);
  statusMismatch.slice(0,20).forEach(i => console.log(`  ${i.date} | ${i.eCode} | ${i.name} | ESSL:${i.esslStatus} DB:${i.dbStatus} DB_In:${i.dbIn}`));

  console.log(`\n--- EXTRA IN DB (first 20) ---`);
  extra.slice(0,20).forEach(i => console.log(`  ${i.date} | ${i.eCode} | ${i.name} | DB In:${i.dbIn} Out:${i.dbOut} Status:${i.dbStatus}`));

  // Show a sample of ESSL records with inTime to understand format
  console.log('\n--- SAMPLE ESSL RECORDS WITH PUNCH ---');
  esslRecords.filter(r => r.inTime).slice(0,10).forEach(r => 
    console.log(`  ${r.date} | ${r.eCode} | ${r.name} | In:${r.inTime} Out:${r.outTime} Work:${r.workDur} Status:${r.status}`)
  );
}

main().catch(console.error);
