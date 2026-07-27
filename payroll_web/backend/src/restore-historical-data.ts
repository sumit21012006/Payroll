import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import * as path from 'path';

const prisma = new PrismaClient();

function getCellValueString(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('text' in val) return (val as any).text?.toString().trim() || '';
    if ('result' in val) return (val as any).result?.toString().trim() || '';
  }
  return val.toString().trim();
}

async function restoreMonth(filePath: string, sheetName: string, month: number, year: number) {
  console.log(`\n--- RESTORING ATTENDANCE & PAYROLL FOR ${month}/${year} FROM ${path.basename(filePath)} ---`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    console.error(`Sheet "${sheetName}" not found in ${filePath}`);
    return;
  }

  console.log(`Processing worksheet "${sheet.name}" (${sheet.rowCount} rows)...`);
  
  // Find all employees in database
  const dbEmployees = await prisma.employee.findMany();
  const empMapByPunch = new Map(dbEmployees.map(e => [e.punchingCode, e]));
  const empMapById = new Map(dbEmployees.map(e => [e.employeeId, e]));

  let restoredLogsCount = 0;

  // Row 2 is header (Col 6 is Day 1, Col 7 is Day 2, etc.)
  for (let r = 3; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const punchCode = getCellValueString(row.getCell(2)) || getCellValueString(row.getCell(1));
    const uanNo = getCellValueString(row.getCell(3));
    const name = getCellValueString(row.getCell(4));

    if (!punchCode && !name) continue;

    let emp = empMapByPunch.get(punchCode) || empMapById.get(punchCode);
    
    // If not found by punch, try matching by name
    if (!emp && name) {
      emp = dbEmployees.find(e => e.name.trim().toLowerCase() === name.trim().toLowerCase());
    }

    if (emp) {
      // Update real UAN if available
      if (uanNo && uanNo.length > 5 && emp.uan !== uanNo) {
        await prisma.employee.update({
          where: { employeeId: emp.employeeId },
          data: { uan: uanNo }
        });
      }

      // Loop days 1 to 31 (Cols 6 to 36)
      for (let day = 1; day <= 31; day++) {
        const colNum = 5 + day; // Col 6 is Day 1
        const cell = row.getCell(colNum);
        const cellVal = cell.value;

        let status = 'ABSENT';
        let hoursWorked = 0.0;
        let checkIn = '';
        let checkOut = '';

        if (cellVal !== null && cellVal !== undefined && cellVal !== '') {
          const numVal = typeof cellVal === 'number' ? cellVal : parseFloat(cellVal.toString() || '0');
          if (numVal >= 0.9) {
            status = 'PRESENT';
            hoursWorked = 8.0;
            checkIn = '08:00';
            checkOut = '16:00';
          } else if (numVal >= 0.4) {
            status = 'HALF_DAY';
            hoursWorked = 4.0;
            checkIn = '08:00';
            checkOut = '12:00';
          }
        }

        const dateStr = `${month}/${day}/${year}`;

        await prisma.attendance.upsert({
          where: {
            employeeId_date: {
              employeeId: emp.employeeId,
              date: dateStr
            }
          },
          update: {
            checkIn,
            checkOut,
            hoursWorked,
            status
          },
          create: {
            employeeId: emp.employeeId,
            date: dateStr,
            checkIn,
            checkOut,
            hoursWorked,
            status
          }
        });

        restoredLogsCount++;
      }
    }
  }

  console.log(`✅ Successfully restored ${restoredLogsCount} attendance log records for ${month}/${year}!`);
}

async function main() {
  const mayPath = path.join(__dirname, '..', '..', 'Salary_Reports', 'May-2026 Line-01 FINAL 1 to 30.xlsx');
  const aprilPath = path.join(__dirname, '..', '..', 'Salary_Reports', 'Wages April-2026 Line-01 FINAL.xlsx');

  await restoreMonth(mayPath, 'Google attandance May -26', 5, 2026);
  await restoreMonth(aprilPath, 'Google attandance April -26', 4, 2026);

  console.log('\n--- RECALCULATING PAYROLL RUNS FOR APRIL & MAY 2026 ---');
  
  const employees = await prisma.employee.findMany();
  for (const month of [4, 5]) {
    const year = 2026;
    const monthLogs = await prisma.attendance.findMany({
      where: { date: { startsWith: `${month}/`, endsWith: `/${year}` } }
    });

    const attMap = new Map<string, any[]>();
    monthLogs.forEach(l => {
      const list = attMap.get(l.employeeId) || [];
      list.push(l);
      attMap.set(l.employeeId, list);
    });

    let runCount = 0;
    for (const emp of employees) {
      const logs = attMap.get(emp.employeeId) || [];
      let p = 0, h = 0, l = 0;
      logs.forEach(x => {
        if (x.status === 'PRESENT') p++;
        else if (x.status === 'HALF_DAY') h++;
        else if (x.status === 'LATE') l++;
      });

      const workedDays = p + l + (h * 0.5);
      if (workedDays === 0) continue;

      const rate = emp.salaryPerDay > 0 ? emp.salaryPerDay : emp.deductionPerDay;
      const basicPay = workedDays * rate;
      const gross = basicPay;
      const pt = gross > 10000 ? 200 : (gross > 7500 ? 175 : 0);
      const canteen = gross > 0 ? 500 : 0;
      const totalDeduct = pt + canteen + emp.accountAdvance;
      const net = Math.max(0, gross - totalDeduct);

      await prisma.payrollRun.upsert({
        where: { employeeId_month_year: { employeeId: emp.employeeId, month, year } },
        update: {
          basicPay, otPay: 0, basicDa: basicPay, hra: 0, otherAllowance: 0, pfDeduction: 0, esicDeduction: 0, ptDeduction: pt, otherDeduction: canteen, totalDeductions: totalDeduct, accountAdvance: emp.accountAdvance, mlwlDeduction: 0, grossSalary: gross, netSalary: net, workedDays, overtimeHours: 0, jobEarnings: 0
        },
        create: {
          employeeId: emp.employeeId, month, year, basicPay, otPay: 0, basicDa: basicPay, hra: 0, otherAllowance: 0, pfDeduction: 0, esicDeduction: 0, ptDeduction: pt, otherDeduction: canteen, totalDeductions: totalDeduct, accountAdvance: emp.accountAdvance, mlwlDeduction: 0, grossSalary: gross, netSalary: net, workedDays, overtimeHours: 0, jobEarnings: 0
        }
      });
      runCount++;
    }
    console.log(`✅ Calculated ${runCount} payroll runs for ${month}/${year}!`);
  }
}

main()
  .catch(err => console.error('Error during restoration:', err))
  .finally(() => prisma.$disconnect());
