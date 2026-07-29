import ExcelJS from 'exceljs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const prisma = new PrismaClient();

function normalizeBiometricCode(code: string): string {
  if (!code) return '';
  return code.replace(/^KFIL[\/-_]/i, '').trim().toUpperCase();
}

function parseISTEpoch(dateStr: string, timeStr: string): number | null {
  if (!dateStr || !timeStr) return null;
  try {
    let m = 0, d = 0, y = 0;
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/').map(Number);
      m = parts[0]; d = parts[1]; y = parts[2];
    } else if (dateStr.includes('-')) {
      const parts = dateStr.split('-').map(Number);
      y = parts[0]; m = parts[1]; d = parts[2];
    }
    const [h, min] = timeStr.split(':').map(Number);
    if (!m || !d || !y || isNaN(h) || isNaN(min)) return null;

    const isoStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00+05:30`;
    const dt = new Date(isoStr);
    return isNaN(dt.getTime()) ? null : dt.getTime();
  } catch (_) {
    return null;
  }
}

async function repairJul27Records() {
  console.log('===========================================================');
  console.log('  REPAIRING 27-JUL-2026 ATTENDANCE RECORDS IN DATABASE');
  console.log('===========================================================');

  const dir = path.resolve(__dirname, '../../Attendence_27 July');
  const biometricPath = path.join(dir, 'Attendence Biometric 27 July.xlsx');

  const wbBio = new ExcelJS.Workbook();
  await wbBio.xlsx.readFile(biometricPath);
  const bioSheet = wbBio.worksheets[0];

  const dbEmployees = await prisma.employee.findMany();
  const empMap = new Map<string, typeof dbEmployees[0]>();
  dbEmployees.forEach(e => {
    empMap.set(e.employeeId, e);
    if (e.punchingCode) {
      empMap.set(e.punchingCode, e);
      empMap.set(normalizeBiometricCode(e.punchingCode), e);
    }
  });

  let repairedCount = 0;

  for (let r = 5; r <= bioSheet.rowCount; r++) {
    const row = bioSheet.getRow(r);
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      let v = '';
      if (cell.value instanceof Date) {
        v = cell.value.toTimeString().slice(0, 5);
      } else {
        v = cell.value?.toString()?.trim() || '';
      }
      vals[col] = v;
    });

    const sno = parseInt(vals[1] || '0');
    if (!sno) continue;

    const rawCode = vals[2] || '';
    const normCode = normalizeBiometricCode(rawCode);
    const emp = empMap.get(normCode) || empMap.get(rawCode);

    if (!emp) continue;

    const inTime = vals[7] || '';
    const outTime = vals[8] || vals[9] || '';

    if (!inTime || inTime === '00:00') continue;

    // Check if employee has an attendance record for 7/27/2026
    const att = await prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: emp.employeeId,
          date: '7/27/2026'
        }
      }
    });

    if (att && outTime && outTime !== '00:00') {
      const inEpoch = parseISTEpoch('7/27/2026', att.checkIn);
      let outDate = '7/27/2026';
      const [inH] = att.checkIn.split(':').map(Number);
      const [outH] = outTime.split(':').map(Number);

      if (outH < inH || (inH >= 20 && outH <= 12)) {
        outDate = '7/28/2026';
      }

      const outEpoch = parseISTEpoch(outDate, outTime);

      if (inEpoch && outEpoch && outEpoch > inEpoch) {
        const hoursWorked = Number(((outEpoch - inEpoch) / (1000 * 60 * 60)).toFixed(2));

        let status = 'PRESENT';
        if (hoursWorked > 0.0 && hoursWorked < 4.0) {
          status = 'HALF_DAY';
        } else if (hoursWorked > 9.0) {
          status = 'OVERTIME';
        } else {
          const [inHour, inMin] = att.checkIn.split(':').map(Number);
          if (inHour >= 5 && inHour <= 11) {
            const isLate = inHour > 7 || (inHour === 7 && inMin > 0);
            if (isLate) status = 'LATE';
          } else if (inHour >= 13 && inHour <= 18) {
            const isLate = inHour > 15 || (inHour === 15 && inMin > 0);
            if (isLate) status = 'LATE';
          } else if (inHour >= 21 || inHour <= 2) {
            const isLate = (inHour === 23 && inMin > 0) || (inHour >= 0 && inHour <= 2);
            if (isLate) status = 'LATE';
          }
        }

        await prisma.attendance.update({
          where: { id: att.id },
          data: {
            checkOut: outTime,
            hoursWorked,
            status
          }
        });

        repairedCount++;
        console.log(`Repaired ${emp.employeeId.padEnd(10)} | ${emp.name.padEnd(30)} | In: ${att.checkIn} Out: ${outTime} | Hrs: ${hoursWorked}`);
      }
    }
  }

  console.log('===========================================================');
  console.log(`REPAIR COMPLETE: ${repairedCount} records updated successfully.`);
  console.log('===========================================================');
}

repairJul27Records().catch(console.error);
