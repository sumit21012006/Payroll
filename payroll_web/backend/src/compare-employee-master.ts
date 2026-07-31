import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();

function norm(c: string): string {
  let r = c.replace(/^KFIL[\/-_]/i, '').trim().toUpperCase();
  const m = r.match(/^(L\d)(\d{3})$/);
  if (m) r = m[1] + '-' + m[2];
  return r;
}

async function main() {
  const emps = await prisma.employee.findMany();
  const dbCodes = new Set<string>();
  emps.forEach(e => {
    dbCodes.add(e.employeeId.toUpperCase());
    if (e.punchingCode) dbCodes.add(e.punchingCode.toUpperCase());
    dbCodes.add(norm(e.employeeId));
    if (e.punchingCode) dbCodes.add(norm(e.punchingCode));
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('D:/DEEPTI_ANTIGRAVITY/payroll_web/Attendence_31 July/DailyAttendance_BasicReport (6).xlsx');
  const ws = wb.worksheets[0];

  const esslCodes = new Map<string, { raw: string; normed: string; name: string; status: string }>();
  for (let r = 12; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawCode = String(row.getCell(3).value || '').trim();
    if (!rawCode) continue;
    const normed = norm(rawCode);
    const name = String(row.getCell(4).value || '').trim();
    const status = String(row.getCell(14).value || '').trim();
    esslCodes.set(normed, { raw: rawCode, normed, name, status });
  }

  // Find ESSL employees NOT in Payroll DB
  const missingFromDB: typeof esslCodes extends Map<string, infer V> ? V[] : never[] = [];
  for (const [code, rec] of esslCodes) {
    if (!dbCodes.has(code) && !dbCodes.has(rec.raw.toUpperCase())) {
      missingFromDB.push(rec);
    }
  }

  // Find Payroll DB employees NOT in ESSL
  const missingFromESSL: string[] = [];
  for (const e of emps) {
    const n = norm(e.employeeId);
    if (!esslCodes.has(n) && !esslCodes.has(e.employeeId.toUpperCase())) {
      missingFromESSL.push(`${e.employeeId.padEnd(12)} | ${e.name}`);
    }
  }

  console.log('===============================================================================');
  console.log('  EMPLOYEE MASTER COMPARISON: ESSL vs PAYROLL DATABASE');
  console.log('===============================================================================');
  console.log(`Payroll DB employees:  ${emps.length}`);
  console.log(`ESSL employees:        ${esslCodes.size}`);
  console.log('');

  const present = missingFromDB.filter(m => /present/i.test(m.status));
  const absent = missingFromDB.filter(m => !/present/i.test(m.status));

  console.log(`=== EMPLOYEES IN ESSL BUT NOT IN PAYROLL DB (${missingFromDB.length}) ===`);
  console.log('');
  console.log(`  PRESENT ones (${present.length}) - CRITICAL: These employees work but don't exist in payroll!`);
  for (const m of present) {
    console.log(`    ${m.raw.padEnd(15)} -> ${m.normed.padEnd(12)} | ${m.name.padEnd(36)} | ${m.status}`);
  }
  console.log('');
  console.log(`  ABSENT ones (${absent.length}) - May need registration for future shifts:`);
  for (const m of absent) {
    console.log(`    ${m.raw.padEnd(15)} -> ${m.normed.padEnd(12)} | ${m.name.padEnd(36)} | ${m.status}`);
  }

  console.log('');
  console.log(`=== EMPLOYEES IN PAYROLL DB BUT NOT IN ESSL (${missingFromESSL.length}) ===`);
  for (const s of missingFromESSL) {
    console.log(`    ${s}`);
  }

  console.log('');
  console.log('===============================================================================');
  console.log('SUMMARY');
  console.log('===============================================================================');
  console.log(`  Payroll DB:    ${emps.length} employees`);
  console.log(`  ESSL:          ${esslCodes.size} employees`);
  console.log(`  In ESSL, not in DB:  ${missingFromDB.length} (${present.length} PRESENT, ${absent.length} ABSENT)`);
  console.log(`  In DB, not in ESSL:  ${missingFromESSL.length}`);
  console.log(`  GAP:           ${esslCodes.size - emps.length} more employees in ESSL than Payroll DB`);
}

main().catch(console.error);
