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

  // 1. Employee Master Sync (upserting to preserve existing Attendance and Job logs)
  console.log('Syncing employee master records...');

  // 2. Open and Read Employee_List.xlsx
  const filePath = path.join(__dirname, '..', '..', 'frontend', 'Dataset', 'Employee_List.xlsx');
  console.log(`Reading Excel spreadsheet from: ${filePath}`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const sheet = workbook.worksheets[0];
  console.log(`Successfully loaded sheet: "${sheet.name}" with ${sheet.rowCount} rows.`);

  let seededCount = 0;

  // 3. Loop through rows and upsert employees
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
    const salaryPerDay = isLoadBasis ? 0.0 : (rate || 0.0);
    const deductionPerDay = isLoadBasis ? (rate || 0.0) : 0.0;

    // Upsert Employee record to preserve existing Attendance and Job logs
    await prisma.employee.upsert({
      where: { employeeId: punchCode },
      update: {
        name: name,
        department: dept.toUpperCase(),
        salaryPerDay: salaryPerDay,
        deductionPerDay: deductionPerDay,
        ifscCode: ifsc,
        bankAcc: bankAcc,
        punchingCode: punchCode
      },
      create: {
        employeeId: punchCode,
        name: name,
        department: dept.toUpperCase(),
        salaryPerDay: salaryPerDay,
        deductionPerDay: deductionPerDay,
        uan: '',
        esic: '',
        bankName: '',
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

  // 4. Seed castings
  console.log('Seeding default castings specifications...');
  const defaultCastings = [
    { code: '402', name: '4DI BLOCK', weightKg: 83.9 },
    { code: '459', name: 'DHRUV 3DI BLOCK', weightKg: 74.2 },
    { code: '745', name: 'DHRUV 4DI BLOCK', weightKg: 89.5 },
    { code: '4011', name: 'D25 REIMAGINE', weightKg: 86.6 },
    { code: '715', name: 'D25LCV', weightKg: 90.4 },
    { code: '466', name: 'P-15 CYL BLOCK', weightKg: 46.4 },
    { code: '467', name: 'ZD30 UPPER BLK', weightKg: 74.7 },
    { code: '475', name: 'MHWAK REG', weightKg: 69.2 },
    { code: '717', name: 'W109', weightKg: 72.0 },
    { code: '718', name: 'D09 2CB', weightKg: 42.5 },
    { code: '730', name: '3D15', weightKg: 55.6 },
    { code: '731', name: '4D15', weightKg: 62.7 },
    { code: '748', name: 'UPP BLK', weightKg: 53.4 },
    { code: '476', name: '2CB TURBO CHARGER', weightKg: 42.0 },
    { code: '719', name: 'HINO BLOCK', weightKg: 104.1 },
    { code: '732', name: 'YANMAR BLOCK', weightKg: 40.8 },
    { code: '729', name: '3R 1190 CYL BLOCK', weightKg: 106.4 },
    { code: '4029', name: '3R 550 BLOCK', weightKg: 54.9 },
    { code: '4026', name: 'EICHER -483', weightKg: 110.9 },
    { code: '4046', name: 'EICHER TITAN BLOCK', weightKg: 87.0 },
    { code: '495', name: 'EICHER 3CB', weightKg: 80.5 },
    { code: '711', name: 'EICHER 4CB', weightKg: 96.3 },
    { code: '4022', name: 'EICHER 110 HP', weightKg: 110.3 },
    { code: '4068', name: 'ISUZU', weightKg: 73.0 }
  ];

  await prisma.casting.createMany({
    data: defaultCastings,
    skipDuplicates: true
  });

  // 5. Seed job templates
  console.log('Seeding default job templates...');
  const defaultTemplates = [
    { name: 'HE Casting', rate: 320.0, unit: 'Tons' },
    { name: 'Final Quality Inspection', rate: 220.0, unit: 'Tons' },
    { name: 'Rework Sorting', rate: 4.90, unit: 'Pieces' },
    { name: 'Painting Job', rate: 6.00, unit: 'Pieces' },
    { name: 'AVG Inspection', rate: 5.00, unit: 'Pieces' },
    { name: 'Yanmark Line Assembly', rate: 28.00, unit: 'Pieces' }
  ];

  await prisma.jobTemplate.createMany({
    data: defaultTemplates,
    skipDuplicates: true
  });

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
