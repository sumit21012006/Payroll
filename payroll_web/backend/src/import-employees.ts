import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import * as path from 'path';

const prisma = new PrismaClient();

function getCellValueString(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('text' in val) {
      return (val as any).text?.toString().trim() || '';
    }
    if ('result' in val) {
      return (val as any).result?.toString().trim() || '';
    }
  }
  return val.toString().trim();
}

async function main() {
  console.log('--- STARTING INITIAL WORKFORCE DATABASE RESET & SEED ---');

  // 1. Clean Database (respecting Cascade deletes)
  console.log('Clearing existing records from tables (PayrollRun, JobLogEmployee, JobLog, Attendance, Employee)...');
  await prisma.payrollRun.deleteMany({});
  await prisma.jobLogEmployee.deleteMany({});
  await prisma.jobLog.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.employee.deleteMany({});
  console.log('Database cleared successfully.');

  // 2. Open and Read Employee_List.xlsx
  const filePath = path.join(__dirname, '..', '..', 'frontend', 'Dataset', 'Employee_List.xlsx');
  console.log(`Reading Excel spreadsheet from: ${filePath}`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const sheet = workbook.worksheets[0];
  console.log(`Successfully loaded sheet: "${sheet.name}" with ${sheet.rowCount} rows.`);

  let seededCount = 0;

  // 3. Loop through rows and insert employees
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const punchCode = getCellValueString(row.getCell(1));
    if (!punchCode) continue;

    const rateVal = row.getCell(2).value;
    const rate = typeof rateVal === 'number' ? rateVal : parseFloat(rateVal?.toString() || '0') || 0;

    const dept = getCellValueString(row.getCell(3)) || 'GENERAL';
    const jobType = getCellValueString(row.getCell(4));
    const bankAcc = getCellValueString(row.getCell(5));
    const ifsc = getCellValueString(row.getCell(6));
    const nameDevice = getCellValueString(row.getCell(7));
    const nameReal = getCellValueString(row.getCell(8));
    const name = nameReal || nameDevice || punchCode;

    // Classify as Load Basis if jobType explicitly contains "load" or matches common load depts
    const isLoadBasis = jobType.toLowerCase().includes('load');
    const salaryPerDay = isLoadBasis ? 0.0 : (rate || 636.0);

    // Create Employee record
    await prisma.employee.create({
      data: {
        employeeId: punchCode, // Set unique Punching Code as employeeId
        name: name,
        department: dept.toUpperCase(),
        salaryPerDay: salaryPerDay,
        deductionPerDay: 0.0,
        uan: '',
        esic: '',
        bankName: bankAcc ? 'Associated Bank' : '', // Mock bank name if account exists
        ifscCode: ifsc,
        bankAcc: bankAcc,
        punchingCode: punchCode,
        mobileNo: '',
        accountAdvance: 0.0,
        remainingAdvance: 0.0
      }
    });

    seededCount++;
  }

  console.log(`\n✅ Database seed completed successfully!`);
  console.log(`Total Employees seeded: ${seededCount}`);
}

main()
  .catch((err) => {
    console.error('❌ Error during seeding database:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
