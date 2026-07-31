import fs from 'fs';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

function normalizeBiometricCode(code: string): string {
  if (!code) return '';
  return code.replace(/^KFIL[\/-_]/i, '').trim().toUpperCase();
}

async function testBatch() {
  const start = Date.now();
  const filePath = 'D:/DEEPTI_ANTIGRAVITY/payroll_web/Attendence_31 July/DailyAttendance_BasicReport (6).xlsx';
  const fileBuf = fs.readFileSync(filePath);
  const base64 = fileBuf.toString('base64');
  const buffer = Buffer.from(base64, 'base64');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];

  const targetDateStr = '7/31/2026';

  const dbEmployees = await prisma.employee.findMany();
  const employeeMap = new Map<string, typeof dbEmployees[0]>();
  dbEmployees.forEach(e => {
    if (e.punchingCode) {
      employeeMap.set(e.punchingCode.toUpperCase(), e);
      employeeMap.set(normalizeBiometricCode(e.punchingCode), e);
    }
    employeeMap.set(e.employeeId.toUpperCase(), e);
    employeeMap.set(normalizeBiometricCode(e.employeeId), e);
  });

  const existingRecords = await prisma.attendance.findMany({
    where: { date: targetDateStr }
  });
  const existingMap = new Map(existingRecords.map(a => [a.employeeId, a]));

  const toCreate: any[] = [];
  const toUpdate: any[] = [];

  for (let r = 12; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const rawCode = String(row.getCell(3).value || row.getCell(2).value || '').trim();
    if (!rawCode || /^(SNo|E\. Code|Department|Name|Status|Total)$/i.test(rawCode)) continue;

    const normCode = normalizeBiometricCode(rawCode);
    const employee = employeeMap.get(normCode) || employeeMap.get(rawCode.toUpperCase());
    if (!employee) continue;

    const inTimeVal = row.getCell(8).value;
    const outTimeVal = row.getCell(9).value;

    let inTime = '';
    let outTime = '';
    if (inTimeVal instanceof Date) inTime = inTimeVal.toTimeString().slice(0, 5);
    else inTime = String(inTimeVal || '').trim().slice(0, 5);

    if (outTimeVal instanceof Date) outTime = outTimeVal.toTimeString().slice(0, 5);
    else outTime = String(outTimeVal || '').trim().slice(0, 5);

    const cIn = inTime || '';
    const cOut = outTime || '';
    const hoursWorked = (cIn && cOut) ? 8.0 : 0.0;
    const finalStatus = (cIn && cOut) ? 'P1' : (cIn ? 'P1' : 'A');

    const item = {
      employeeId: employee.employeeId,
      date: targetDateStr,
      checkIn: cIn,
      checkOut: cOut,
      hoursWorked,
      status: finalStatus
    };

    if (existingMap.has(employee.employeeId)) {
      toUpdate.push({ id: existingMap.get(employee.employeeId)!.id, ...item });
    } else {
      toCreate.push(item);
    }
  }

  console.log('To Create:', toCreate.length, '| To Update:', toUpdate.length);

  if (toCreate.length > 0) {
    await prisma.attendance.createMany({ data: toCreate, skipDuplicates: true });
  }

  if (toUpdate.length > 0) {
    const batchSize = 25;
    for (let i = 0; i < toUpdate.length; i += batchSize) {
      const batch = toUpdate.slice(i, i + batchSize);
      await Promise.all(batch.map(u =>
        prisma.attendance.update({
          where: { id: u.id },
          data: { checkIn: u.checkIn, checkOut: u.checkOut, hoursWorked: u.hoursWorked, status: u.status }
        })
      ));
    }
  }

  console.log(`Processing completed in ${Date.now() - start} ms!`);
  await prisma.$disconnect();
}

testBatch().catch(console.error);
