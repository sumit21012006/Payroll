// Offline script to test the backend calculations logic
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTest() {
  console.log('--- RUNNING CALCULATIONS TEST ENGINE ---');
  
  const employees = await prisma.employee.findMany({
    take: 5
  });

  if (employees.length === 0) {
    console.error('No employees found in DB. Please run prisma:seed first.');
    return;
  }

  for (const emp of employees) {
    const isLoad = emp.salaryPerDay === 0.0;
    console.log(`\nEmployee: ${emp.name} (${emp.employeeId}) | Dept: ${emp.department} | Mode: ${isLoad ? "Load Basis" : "Day Basis"}`);
    
    // Simulate calculation for May 2026
    const attendance = await prisma.attendance.findMany({
      where: {
        employeeId: emp.employeeId,
        date: {
          startsWith: '5/'
        }
      }
    });

    const activeLogs = attendance.filter(log => {
      const parts = log.date.split('/');
      return parts.length === 3 && parts[2] === '2026';
    });

    const present = activeLogs.filter(l => l.status.includes('PRESENT')).length;
    const late = activeLogs.filter(l => l.status.includes('LATE')).length;
    const ot = activeLogs.filter(l => l.status.includes('OVERTIME')).length;
    const half = activeLogs.filter(l => l.status.includes('HALF_DAY')).length;

    console.log(`Logs Found: ${activeLogs.length} | Present: ${present} | Late: ${late} | Overtime: ${ot} | Half-Day: ${half}`);

    // Retrieve jobs splits
    const jobs = await prisma.jobLogEmployee.findMany({
      where: {
        employeeId: emp.employeeId,
        jobLog: {
          date: {
            startsWith: '5/'
          }
        }
      },
      include: {
        jobLog: true
      }
    });

    const jobEarnings = jobs.reduce((sum, j) => sum + j.splitEarnings, 0.0);
    console.log(`Participated in ${jobs.length} Job operations. Split Earnings: ₹${jobEarnings.toFixed(2)}`);
  }
}

runTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
