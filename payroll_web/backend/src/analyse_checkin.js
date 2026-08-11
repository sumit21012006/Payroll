const ExcelJS = require('exceljs');

async function main() {
  // ============================================================
  // PARSE ESSL SOURCE FILE
  // ============================================================
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile('D:/DEEPTI_ANTIGRAVITY/payroll_web/FINAL CHECK/Essl Attendence.xlsx');
  const ws1 = wb1.worksheets[0];

  const getTime = (cell) => {
    const v = cell.value;
    if (!v) return '';
    const s = String(v).trim();
    if (s === '0' || s === '' || s === '00:00') return '';
    if (typeof v === 'number') {
      const totalMins = Math.round(v * 24 * 60);
      const h = Math.floor(totalMins / 60) % 24;
      const mn = totalMins % 60;
      return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
    }
    // Normalize seconds away: "15:01:34" -> "15:01"
    const parts = s.split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
    return s;
  };

  const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
  const normalizeCode = (code) => {
    if (!code) return '';
    return code.replace(/^KFIL[\/\-_]/i, '').trim().toUpperCase();
  };

  const esslRecords = [];
  let currentDate = null;

  for (let r = 8; r <= ws1.rowCount; r++) {
    const row = ws1.getRow(r);
    const c2 = String(row.getCell(2).value || '').trim();
    if (c2 === 'Attendance Date') {
      const rawDate = String(row.getCell(5).value || '').trim();
      const m = rawDate.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
      if (m) currentDate = `${months[m[2]]}/${parseInt(m[1])}/${m[3]}`;
      continue;
    }
    if (c2 === 'SNo') continue;
    if (!currentDate) continue;
    const sno = row.getCell(2).value;
    if (!sno || isNaN(Number(sno))) continue;

    const eCode = normalizeCode(String(row.getCell(3).value || '').trim());
    const name = String(row.getCell(4).value || '').trim();
    const inTime = getTime(row.getCell(8));
    const outTime = getTime(row.getCell(9)) || getTime(row.getCell(10));
    const statusRaw = String(row.getCell(14).value || row.getCell(13).value || '').trim();

    if (!eCode) continue;
    esslRecords.push({ eCode, name, date: currentDate, inTime, outTime, status: statusRaw });
  }

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
    const empId = String(row.getCell(2).value || '').trim().toUpperCase();
    const empName = String(row.getCell(3).value || '').trim();
    const checkIn = String(row.getCell(5).value || '').trim();
    const checkOut = String(row.getCell(6).value || '').trim();
    const hoursWorked = row.getCell(7).value;
    const status = String(row.getCell(8).value || '').trim();
    if (!dateRaw || !empId) continue;
    dbRecords.push({ date: dateRaw, empId, empName, checkIn, checkOut, hoursWorked, status });
  }

  // Build maps
  const esslMap = new Map();
  for (const r of esslRecords) {
    const key = `${r.eCode}_${r.date}`;
    if (!esslMap.has(key)) esslMap.set(key, r);
  }
  const dbMap = new Map();
  for (const r of dbRecords) {
    const key = `${r.empId}_${r.date}`;
    dbMap.set(key, r);
  }

  // ============================================================
  // ANALYSE CHECK-IN MISMATCHES
  // ============================================================
  const wrongCheckIn = [];
  const missingCheckIn = [];
  const wrongCheckOut = [];

  for (const [key, essl] of esslMap) {
    const db = dbMap.get(key);
    if (!db) continue; // handled as MISSING separately

    // ESSL has check-in but DB has none or '-'
    if (essl.inTime && (!db.checkIn || db.checkIn === '-' || db.checkIn === '')) {
      missingCheckIn.push({ date: essl.date, eCode: essl.eCode, name: essl.name, esslIn: essl.inTime, dbIn: db.checkIn, dbStatus: db.status });
    }

    // Both have check-in but they differ (ignoring seconds - already stripped)
    if (essl.inTime && db.checkIn && db.checkIn !== '-' && essl.inTime !== db.checkIn) {
      // Check if off by a few minutes (within 3 min = seconds rounding) vs truly different
      const toMins = (t) => {
        const [h,m] = t.split(':').map(Number);
        return h*60+m;
      };
      const diff = Math.abs(toMins(essl.inTime) - toMins(db.checkIn));
      if (diff > 3) {
        wrongCheckIn.push({ date: essl.date, eCode: essl.eCode, name: essl.name, esslIn: essl.inTime, dbIn: db.checkIn, esslOut: essl.outTime, dbOut: db.checkOut, dbStatus: db.status });
      }
    }

    // Check wrong checkout (more than 3 min diff)
    if (essl.outTime && db.checkOut && db.checkOut !== '-') {
      const toMins = (t) => {
        const [h,m] = t.split(':').map(Number);
        return h*60+m;
      };
      const diff = Math.abs(toMins(essl.outTime) - toMins(db.checkOut));
      if (diff > 3) {
        wrongCheckOut.push({ date: essl.date, eCode: essl.eCode, name: essl.name, esslIn: essl.inTime, esslOut: essl.outTime, dbIn: db.checkIn, dbOut: db.checkOut, dbStatus: db.status });
      }
    }

    // DB has check-in but ESSL is absent (cross-midnight false alarm)
    // These are the 112 status mismatches we found before - skip
  }

  // DB records where check-in is suspiciously wrong (00:00 or starts with 00:)
  const dbWrongCheckIn00 = dbRecords.filter(r => r.checkIn && (r.checkIn.startsWith('00:') || r.checkIn === '0'));

  console.log(`\n====== CHECK-IN/OUT DETAILED ANALYSIS ======`);
  console.log(`\nDB records with 00:xx check-in (midnight punches): ${dbWrongCheckIn00.length}`);
  console.log(`ESSL has check-in but DB has empty/'-' check-in: ${missingCheckIn.length}`);
  console.log(`Check-in differs by >3 min (ESSL vs DB): ${wrongCheckIn.length}`);
  console.log(`Check-out differs by >3 min (ESSL vs DB): ${wrongCheckOut.length}`);

  console.log(`\n--- DB records with 00:xx check-in (sample 20) ---`);
  dbWrongCheckIn00.slice(0,20).forEach(r => console.log(`  ${r.date} | ${r.empId} | ${r.empName} | DB In:${r.checkIn} Out:${r.checkOut} Status:${r.status}`));

  console.log(`\n--- MISSING CHECK-IN in DB (ESSL has punch, DB has empty) ---`);
  missingCheckIn.slice(0,20).forEach(i => console.log(`  ${i.date} | ${i.eCode} | ${i.name} | ESSL In:${i.esslIn} | DB In:"${i.dbIn}" Status:${i.dbStatus}`));

  console.log(`\n--- WRONG CHECK-IN (>3 min diff, ESSL vs DB) ---`);
  wrongCheckIn.slice(0,30).forEach(i => console.log(`  ${i.date} | ${i.eCode} | ${i.name} | ESSL In:${i.esslIn} → DB In:${i.dbIn}`));

  console.log(`\n--- TRULY WRONG CHECKOUT (>3 min diff) ---`);
  wrongCheckOut.slice(0,30).forEach(i => console.log(`  ${i.date} | ${i.eCode} | ${i.name} | ESSL In:${i.esslIn} Out:${i.esslOut} | DB In:${i.dbIn} Out:${i.dbOut}`));

  // Breakdown by date of wrong checkouts
  const byDate = {};
  wrongCheckOut.forEach(i => { byDate[i.date] = (byDate[i.date]||0)+1; });
  console.log(`\n--- WRONG CHECKOUT COUNT BY DATE ---`);
  Object.entries(byDate).sort().forEach(([d,c]) => console.log(`  ${d}: ${c} records`));

  // Check if auto-checkout pattern (checkout = checkin + 2.5hrs due to UTC offset)
  const toMins = (t) => {
    if (!t || t==='-') return null;
    const [h,m] = t.split(':').map(Number);
    return h*60+m;
  };
  const autoCheckoutPattern = wrongCheckOut.filter(i => {
    const dbInM = toMins(i.dbIn);
    const dbOutM = toMins(i.dbOut);
    const esslOutM = toMins(i.esslOut);
    if (dbInM===null || dbOutM===null) return false;
    const dbDiff = ((dbOutM - dbInM + 1440) % 1440);
    // If DB diff is 8h exactly (480 min) -> auto-checkout
    return Math.abs(dbDiff - 480) <= 5;
  });
  console.log(`\nAuto-checkout pattern (DB diff ~8h exactly): ${autoCheckoutPattern.length} records`);
  autoCheckoutPattern.slice(0,10).forEach(i => console.log(`  ${i.date} | ${i.eCode} | ${i.name} | DB In:${i.dbIn} → DB Out:${i.dbOut} (ESSL Out:${i.esslOut})`));
}

main().catch(console.error);
