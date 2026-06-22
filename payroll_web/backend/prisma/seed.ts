import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function main() {
  console.log('Starting seed operations...');

  // 1. Clean Database
  console.log('Clearing existing database tables...');
  await prisma.payrollRun.deleteMany({});
  await prisma.jobLogEmployee.deleteMany({});
  await prisma.jobLog.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.employee.deleteMany({});

  // 2. Paths to previous data in payroll_app
  const employeesCsvPath = path.join(__dirname, '..', '..', '..', 'payroll_app', 'employees_100.csv');
  const attendanceCsvPath = path.join(__dirname, '..', '..', '..', 'payroll_app', 'attendance_may_2026.csv');

  console.log(`Reading employees from: ${employeesCsvPath}`);
  console.log(`Reading attendance from: ${attendanceCsvPath}`);

  // 3. Seed Employees
  if (!fs.existsSync(employeesCsvPath)) {
    throw new Error(`Employees CSV not found at: ${employeesCsvPath}`);
  }

  const employeesContent = fs.readFileSync(employeesCsvPath, 'utf-8');
  const employeeLines = employeesContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  // Skip Header: employee_id,name,department,salary_per_day,deduction_per_day,uan,esic,bank_name,ifsc_code,bank_acc,punching_code,mobile_no
  const employeeHeaders = parseCSVLine(employeeLines[0]);
  console.log(`Employee headers parsed: ${employeeHeaders.join(', ')}`);

  let employeeCount = 0;
  for (let i = 1; i < employeeLines.length; i++) {
    const cols = parseCSVLine(employeeLines[i]);
    if (cols.length < 5 || !cols[0]) continue;

    const employeeId = cols[0];
    const name = cols[1];
    const department = cols[2] || '';
    const deptNormalized = department.toLowerCase().replace(/\s+/g, '');
    const loadBasisDepts = ['painter', 'yanmarline', 'rework', 'final', 'avg'];
    const isLoadBasis = loadBasisDepts.some(d => deptNormalized.includes(d));
    const salaryPerDay = isLoadBasis ? 0.0 : (parseFloat(cols[3]) || 0.0);
    const deductionPerDay = parseFloat(cols[4]) || 0.0;

    const uan = cols[5] || '';
    const esic = cols[6] || '';
    const bankName = cols[7] || '';
    const ifscCode = cols[8] || '';
    const bankAcc = cols[9] || '';
    const punchingCode = cols[10] || '';
    const mobileNo = cols[11] || '';

    // Handle optional fields accAdv and remAdv if they exist in CSV
    const accountAdvance = cols.length > 12 ? parseFloat(cols[12]) || 0.0 : 0.0;
    const remainingAdvance = cols.length > 13 ? parseFloat(cols[13]) || 0.0 : 0.0;

    await prisma.employee.create({
      data: {
        employeeId,
        name,
        department,
        salaryPerDay,
        deductionPerDay,
        uan: uan === '#N/A' ? '' : uan,
        esic: esic === '#N/A' ? '' : esic,
        bankName: bankName === '#N/A' ? '' : bankName,
        ifscCode: ifscCode === '#N/A' ? '' : ifscCode,
        bankAcc: bankAcc === '#N/A' ? '' : bankAcc,
        punchingCode: punchingCode === '#N/A' ? '' : punchingCode,
        mobileNo: mobileNo === '#N/A' ? '' : mobileNo,
        accountAdvance,
        remainingAdvance,
      }
    });
    employeeCount++;
  }
  console.log(`Successfully seeded ${employeeCount} employees.`);

  // 4. Seed Attendance Logs
  if (!fs.existsSync(attendanceCsvPath)) {
    throw new Error(`Attendance CSV not found at: ${attendanceCsvPath}`);
  }

  const attendanceContent = fs.readFileSync(attendanceCsvPath, 'utf-8');
  const attendanceLines = attendanceContent.split(/\r?\n/).filter(line => line.trim().length > 0);

  // Skip Header: employee_id,date,check_in,check_out,status
  let attendanceCount = 0;
  for (let i = 1; i < attendanceLines.length; i++) {
    const cols = parseCSVLine(attendanceLines[i]);
    if (cols.length < 5 || !cols[0]) continue;

    const employeeId = cols[0];
    const date = cols[1];
    const checkIn = cols[2];
    const checkOut = cols[3];
    const status = cols[4];

    // Calculate hours worked
    let hoursWorked = 0.0;
    if (checkIn && checkOut) {
      try {
        const inParts = checkIn.split(':').map(Number);
        const outParts = checkOut.split(':').map(Number);
        if (inParts.length >= 2 && outParts.length >= 2) {
          const start = inParts[0] + (inParts[1] / 60.0);
          const end = outParts[0] + (outParts[1] / 60.0);
          hoursWorked = end > start ? Number((end - start).toFixed(2)) : 0.0;
        }
      } catch (err) {
        // Safe fallback
      }
    }

    // Double check that employee exists
    const empExists = await prisma.employee.findUnique({
      where: { employeeId }
    });

    if (empExists) {
      await prisma.attendance.upsert({
        where: {
          employeeId_date: { employeeId, date }
        },
        update: {
          checkIn,
          checkOut,
          status,
          hoursWorked,
        },
        create: {
          employeeId,
          date,
          checkIn,
          checkOut,
          status,
          hoursWorked,
        }
      });
      attendanceCount++;
    }
  }
  console.log(`Successfully seeded ${attendanceCount} attendance records.`);

  // 5. Prepopulate Job Logs matching the supervisor logs from the Flutter application
  console.log('Seeding default Supervisor Job Logs...');
  
  const allEmployees = await prisma.employee.findMany();
  
  // Designate default Load-basis departments
  const loadBasisDepts = ['painter', 'yanmar line', 'yanmarkline', 'rework', 'final', 'avg'];
  const loadBasisEmployees = allEmployees.filter(emp => {
    const dept = emp.department.toLowerCase().replace(/\s+/g, '');
    return loadBasisDepts.some(d => dept.includes(d));
  });

  const loadBasisEmpIds = loadBasisEmployees.map(e => e.employeeId);

  const heEmpIds = allEmployees.filter(e => e.department.toUpperCase() === 'HE').map(e => e.employeeId);
  const finalEmpIds = allEmployees.filter(e => e.department.toUpperCase() === 'FINAL').map(e => e.employeeId);
  const reworkEmpIds = allEmployees.filter(e => e.department.toUpperCase() === 'REWORK').map(e => e.employeeId);
  const painterEmpIds = allEmployees.filter(e => e.department.toUpperCase().includes('PAINTER')).map(e => e.employeeId);
  const avgEmpIds = allEmployees.filter(e => e.department.toUpperCase() === 'AVG').map(e => e.employeeId);
  const yanmarEmpIds = allEmployees.filter(e => e.department.toUpperCase().includes('YANMAR')).map(e => e.employeeId);

  // Helper helper to get sub-crew
  const getCrew = (list: string[], start: number, count: number): string[] => {
    if (list.length === 0) return loadBasisEmpIds.slice(start, start + count);
    const crew: string[] = [];
    for (let i = 0; i < count; i++) {
      crew.push(list[(start + i) % list.length]);
    }
    return crew;
  };

  const defaultJobs = [
    {
      id: 'JOB-101',
      date: '5/4/2026',
      jobName: 'HE Casting Operation',
      totalTons: 120.0,
      ratePerTon: 320.0,
      unit: 'Tons',
      crew: getCrew(heEmpIds, 0, 4),
    },
    {
      id: 'JOB-102',
      date: '5/6/2026',
      jobName: 'Final Warehouse Loadout',
      totalTons: 95.0,
      ratePerTon: 220.0,
      unit: 'Tons',
      crew: getCrew(finalEmpIds, 0, 3),
    },
    {
      id: 'JOB-103',
      date: '5/8/2026',
      jobName: 'Rework Area Jobs',
      totalTons: 3200.0,
      ratePerTon: 4.90,
      unit: 'Pieces',
      crew: getCrew(reworkEmpIds, 0, 2),
    },
    {
      id: 'JOB-104',
      date: '5/11/2026',
      jobName: 'Painting Platform Shift 1',
      totalTons: 1800.0,
      ratePerTon: 6.00,
      unit: 'Pieces',
      crew: getCrew(painterEmpIds, 0, 3),
    },
    {
      id: 'JOB-105',
      date: '5/15/2026',
      jobName: 'Painting Platform Shift 2',
      totalTons: 2100.0,
      ratePerTon: 6.00,
      unit: 'Pieces',
      crew: getCrew(painterEmpIds, 3, 3),
    },
    {
      id: 'JOB-106',
      date: '5/20/2026',
      jobName: 'AVG Sorting Line',
      totalTons: 1500.0,
      ratePerTon: 5.00,
      unit: 'Pieces',
      crew: getCrew(avgEmpIds, 0, 1),
    },
    {
      id: 'JOB-107',
      date: '5/25/2026',
      jobName: 'Yanmar Line Assembly',
      totalTons: 450.0,
      ratePerTon: 28.00,
      unit: 'Pieces',
      crew: getCrew(yanmarEmpIds, 0, 3),
    },
  ];

  for (const job of defaultJobs) {
    const uniqueCrew = Array.from(new Set(job.crew));
    const totalPayout = job.totalTons * job.ratePerTon;
    
    // We split equally for simplicity in seed
    const splitPayout = uniqueCrew.length > 0 ? totalPayout / uniqueCrew.length : 0.0;

    await prisma.jobLog.create({
      data: {
        id: job.id,
        date: job.date,
        jobName: job.jobName,
        totalTons: job.totalTons,
        ratePerTon: job.ratePerTon,
        unit: job.unit,
        employees: {
          create: uniqueCrew.map(employeeId => ({
            employeeId,
            splitEarnings: splitPayout
          }))
        }
      }
    });
  }
  console.log('Successfully seeded default job logs.');
  console.log('Seed operations complete!');
}

main()
  .catch((e) => {
    console.error('Error during seed execution:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
