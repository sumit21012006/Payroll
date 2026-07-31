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

async function importMissingEmployees() {
  console.log('===============================================================================');
  console.log('  IMPORTING MISSING ESSL EMPLOYEES INTO PAYROLL DATABASE');
  console.log('===============================================================================');

  // Get existing employees from DB
  const existing = await prisma.employee.findMany();
  const dbCodes = new Set<string>();
  existing.forEach(e => {
    dbCodes.add(e.employeeId.toUpperCase());
    if (e.punchingCode) dbCodes.add(e.punchingCode.toUpperCase());
    dbCodes.add(norm(e.employeeId));
    if (e.punchingCode) dbCodes.add(norm(e.punchingCode));
  });

  console.log(`Existing employees in DB: ${existing.length}`);

  // Read ESSL file
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('D:/DEEPTI_ANTIGRAVITY/payroll_web/Attendence_31 July/DailyAttendance_BasicReport (6).xlsx');
  const ws = wb.worksheets[0];

  // Find employees in ESSL but not in DB
  const toImport: { code: string; rawCode: string; name: string; dept: string }[] = [];
  for (let r = 12; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawCode = String(row.getCell(3).value || '').trim();
    if (!rawCode) continue;

    const normed = norm(rawCode);
    const name = String(row.getCell(4).value || '').trim();

    // Skip header-like rows
    if (/^(E\. Code|Department|SNo|Name|Status)$/i.test(rawCode)) continue;
    if (/^(E\. Code|Department|SNo|Name|Status)$/i.test(name)) continue;

    if (!dbCodes.has(normed) && !dbCodes.has(rawCode.toUpperCase())) {
      // Determine department from code prefix
      let dept = 'GENERAL';
      if (normed.startsWith('L1')) dept = 'PRODUCTION L1';
      else if (normed.startsWith('L2')) dept = 'PRODUCTION L2';

      // Use the real name if available, otherwise use the code
      const empName = (name && name !== normed && !/^L\d/.test(name)) ? name : normed;

      toImport.push({ code: normed, rawCode, name: empName, dept });
    }
  }

  console.log(`Missing employees to import: ${toImport.length}`);
  console.log('');

  let imported = 0;
  let skipped = 0;

  for (const emp of toImport) {
    // Skip if code looks invalid
    if (emp.code.length < 3 || /^(DEPARTMENT|E\.|NAME|STATUS|SNO)/.test(emp.code)) {
      console.log(`  SKIP (invalid): ${emp.rawCode} -> ${emp.code} | ${emp.name}`);
      skipped++;
      continue;
    }

    try {
      await prisma.employee.create({
        data: {
          employeeId: emp.code,
          name: emp.name,
          department: emp.dept,
          salaryPerDay: 550,       // Default daily wage (can be updated later)
          deductionPerDay: 0,
          punchingCode: emp.code,
          uan: '',
          esic: '',
          bankName: '',
          ifscCode: '',
          bankAcc: '',
          mobileNo: '',
          accountAdvance: 0,
          remainingAdvance: 0
        }
      });
      imported++;
      console.log(`  IMPORTED: ${emp.code.padEnd(12)} | ${emp.name.padEnd(36)} | Dept: ${emp.dept}`);
    } catch (err: any) {
      if (err.code === 'P2002') {
        console.log(`  SKIP (already exists): ${emp.code} | ${emp.name}`);
        skipped++;
      } else {
        console.error(`  ERROR importing ${emp.code}: ${err.message}`);
        skipped++;
      }
    }
  }

  console.log('');
  console.log('===============================================================================');
  console.log(`  IMPORT COMPLETE: ${imported} employees imported, ${skipped} skipped`);
  console.log(`  New total: ${existing.length + imported} employees`);
  console.log('===============================================================================');
}

importMissingEmployees().catch(console.error);
