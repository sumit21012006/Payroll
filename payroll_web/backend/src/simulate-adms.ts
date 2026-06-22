import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runSimulation() {
  console.log('--- STARTING ADMS BIOMETRIC SIMULATOR ---');

  // 1. Find a test employee with a punching code
  const employee = await prisma.employee.findFirst({
    where: {
      punchingCode: { not: '' }
    }
  });

  if (!employee) {
    console.error('No employee with a valid punching code found in database.');
    return;
  }

  const pCode = employee.punchingCode;
  console.log(`Selected Employee for Simulation: ${employee.name} (${employee.employeeId})`);
  console.log(`Biometric Punching Code (Pin): ${pCode}`);

  const testDate = '2026-05-20';
  const checkInTime = '08:45:00';
  const checkOutTime = '18:15:00'; // 9.5 hours later

  // Construct raw tab-separated logs matching ZKTeco ADMS table protocol
  const checkInRow = `${pCode}\t${testDate} ${checkInTime}\t1\t0\t1\t0\r\n`;
  const checkOutRow = `${pCode}\t${testDate} ${checkOutTime}\t1\t0\t1\t0\r\n`;

  console.log('\nSending check-in punch log...');
  console.log(`Raw payload: ${JSON.stringify(checkInRow)}`);

  const inRes = await fetch('http://localhost:8080/iclock/cdata?sn=TESTSN123&table=ATTLOG', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    },
    body: checkInRow
  });

  const inText = await inRes.text();
  console.log(`Server response: ${inText.trim()}`);

  console.log('\nSending check-out punch log...');
  console.log(`Raw payload: ${JSON.stringify(checkOutRow)}`);

  const outRes = await fetch('http://localhost:8080/iclock/cdata?sn=TESTSN123&table=ATTLOG', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    },
    body: checkOutRow
  });

  const outText = await outRes.text();
  console.log(`Server response: ${outText.trim()}`);

  // 2. Fetch from DB and verify logs were successfully created
  console.log('\nVerifying record in database...');
  // Formatted date string in DB is "m/d/yyyy"
  const dbDateStr = '5/20/2026';
  
  // Wait a short moment for async write
  await new Promise(resolve => setTimeout(resolve, 1000));

  const log = await prisma.attendance.findUnique({
    where: {
      employeeId_date: {
        employeeId: employee.employeeId,
        date: dbDateStr
      }
    }
  });

  if (log) {
    console.log('✅ Biometric sync successful! Record found:');
    console.log(JSON.stringify(log, null, 2));
  } else {
    console.error('❌ Failed: Sync record not found in database.');
  }
}

runSimulation()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
