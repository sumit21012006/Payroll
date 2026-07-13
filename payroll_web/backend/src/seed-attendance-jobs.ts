import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- SEEDING ATTENDANCE AND JOBS DATA FOR JULY 2026 ---');

  // Fetch all employees
  const employees = await prisma.employee.findMany();
  if (employees.length === 0) {
    console.error('No employees found. Run import-employees first!');
    return;
  }

  // Clear existing attendance and jobs for July 2026 to avoid unique constraint violations
  await prisma.payrollRun.deleteMany({});
  await prisma.jobLogEmployee.deleteMany({});
  await prisma.jobLog.deleteMany({});
  await prisma.attendance.deleteMany({});

  console.log('Generating attendance logs for 200 employees...');
  const attendanceData: any[] = [];
  const daysInJuly = 12; // Seeding first 12 days of July 2026

  for (let day = 1; day <= daysInJuly; day++) {
    const dateStr = `7/${day}/2026`;
    const isWeekend = day === 5 || day === 6 || day === 12; // mock some rest days

    for (const emp of employees) {
      if (isWeekend) {
        // Skip weekend punches for some rest
        if (Math.random() > 0.3) continue;
      }

      // 10% chance employee is absent
      if (Math.random() < 0.1) {
        attendanceData.push({
          employeeId: emp.employeeId,
          date: dateStr,
          checkIn: '',
          checkOut: '',
          hoursWorked: 0.0,
          status: 'ABSENT'
        });
        continue;
      }

      // Assign a shift randomly
      const shiftType = Math.random();
      let checkIn = '06:45';
      let checkOut = '15:00';
      let hoursWorked = 8.25;
      let status = 'PRESENT';

      if (shiftType < 0.33) {
        // Shift A (06:45 - 15:00)
        const isLate = Math.random() < 0.15;
        checkIn = isLate ? '07:15' : '06:45';
        checkOut = '15:00';
        hoursWorked = isLate ? 7.75 : 8.25;
        status = isLate ? 'LATE' : 'PRESENT';
      } else if (shiftType < 0.66) {
        // Shift B (14:45 - 23:00)
        const isOvertime = Math.random() < 0.2;
        checkIn = '14:45';
        checkOut = isOvertime ? '00:30' : '23:00';
        hoursWorked = isOvertime ? 9.75 : 8.25;
        status = isOvertime ? 'OVERTIME' : 'PRESENT';
      } else {
        // Shift C (22:45 - 06:00)
        const isHalfDay = Math.random() < 0.05;
        checkIn = '22:45';
        checkOut = isHalfDay ? '02:00' : '06:00'; // under 4 hours
        hoursWorked = isHalfDay ? 3.25 : 7.25;
        status = isHalfDay ? 'HALF_DAY' : 'PRESENT';
      }

      attendanceData.push({
        employeeId: emp.employeeId,
        date: dateStr,
        checkIn,
        checkOut,
        hoursWorked,
        status
      });
    }
  }

  // Batch insert attendance
  console.log(`Inserting ${attendanceData.length} attendance records...`);
  await prisma.attendance.createMany({
    data: attendanceData
  });

  // Generate 8 Supervisor Job Logs
  console.log('Generating supervisor job logs...');
  const loaders = employees.filter(e => e.salaryPerDay === 0.0);
  const dayStaff = employees.filter(e => e.salaryPerDay > 0.0);

  const jobNames = [
    'HE Casting',
    'Final Quality Inspection',
    'Rework Sorting',
    'Painting Job',
    'AVG Inspection',
    'Yanmark Line Assembly'
  ];

  for (let i = 1; i <= 8; i++) {
    const jobLogId = `JOB-${100000 + i}`;
    const dateStr = `7/${i}/2026`;
    const name = jobNames[i % jobNames.length];
    const totalTons = 50 + Math.random() * 80;
    const ratePerTon = 320;
    const totalPayout = totalTons * ratePerTon;

    // Pick a crew of 4 loaders and 1 day-basis helper
    const startLoaderIdx = (i * 4) % loaders.length;
    const crewLoaders = loaders.slice(startLoaderIdx, Math.min(startLoaderIdx + 4, loaders.length));
    
    const startDayIdx = i % dayStaff.length;
    const crewDay = dayStaff.slice(startDayIdx, Math.min(startDayIdx + 1, dayStaff.length));
    
    const crewIds = [...crewLoaders.map(e => e.employeeId), ...crewDay.map(e => e.employeeId)];

    // Calculate payouts
    let dayDeductions = 0.0;
    for (const de of crewDay) {
      dayDeductions += de.salaryPerDay > 0 ? de.salaryPerDay : 636.0;
    }
    const remaining = totalPayout - dayDeductions;
    const split = remaining > 0 ? remaining / crewLoaders.length : 0.0;

    await prisma.jobLog.create({
      data: {
        id: jobLogId,
        date: dateStr,
        jobName: name,
        totalTons,
        ratePerTon,
        unit: 'Tons',
        employees: {
          create: crewIds.map(empId => {
            const isLoad = crewLoaders.some(l => l.employeeId === empId);
            return {
              employeeId: empId,
              splitEarnings: isLoad ? split : 0.0
            };
          })
        }
      }
    });
  }

  console.log('✅ Seeding completed! You can now reload the Admin Dashboard and click/trigger recalculation to see all figures populated.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
