import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 8080;

// Debug Request Logger
app.use((req, res, next) => {
  console.log(`[DEBUG] Incoming Request: ${req.method} ${req.path} from IP: ${req.ip}`);
  next();
});

// Restrict CORS origins to secure against unauthorized web origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001'
]
  .filter(Boolean)
  .map((url) => url!.trim().replace(/\/$/, '')) as string[];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or biometric machines)
    if (!origin) {
      return callback(null, true);
    }

    const incomingOrigin = origin.trim().replace(/\/$/, '');
    if (allowedOrigins.indexOf(incomingOrigin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`[CORS REJECT] Origin "${origin}" is not in allowed origins:`, allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  }
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Token-based API Authentication Middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Exclude public endpoints and biometric ADMS endpoints
  if (
    req.path === '/' ||
    req.path === '/favicon.ico' ||
    req.path === '/api/auth/login' ||
    req.path.startsWith('/api/auth/employee-preview/') ||
    req.path.startsWith('/iclock/')
  ) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const systemToken = process.env.API_ACCESS_KEY || 'default-secure-key-2106';

  if (!token || token !== systemToken) {
    console.warn(`[SECURITY] Unauthorized API access attempt to ${req.path} from IP ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Access token is missing or invalid.' });
  }

  next();
};

app.use(authenticateToken);

// Custom raw text parser for ADMS protocol requests
app.use((req, res, next) => {
  if (req.path.startsWith('/iclock/cdata')) {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      req.body = data;
      next();
    });
  } else {
    next();
  }
});

// Helper: Calculate hours worked from check-in and check-out strings
function calculateHours(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0.0;
  try {
    const inParts = checkIn.split(':').map(Number);
    const outParts = checkOut.split(':').map(Number);
    if (inParts.length >= 2 && outParts.length >= 2) {
      const start = inParts[0] + inParts[1] / 60.0;
      const end = outParts[0] + outParts[1] / 60.0;
      const diff = end >= start ? (end - start) : (24.0 - start + end);
      return Number(diff.toFixed(2));
    }
  } catch (_) {
    // Fail-safe
  }
  return 0.0;
}

// Root Route: Welcome & System Status
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the KFIL Solapur Web Payroll API!',
    status: 'online',
    database: 'connected (Supabase PostgreSQL)',
    environment: process.env.NODE_ENV || 'development',
    availableEndpoints: [
      'GET /api/employees',
      'GET /api/payroll/runs?month=5&year=2026',
      'GET /iclock/cdata (ADMS)',
      'GET /iclock/getrequest (ADMS)'
    ]
  });
});

// -------------------------------------------------------------
// ADMS (BIOMETRIC PUSH) ENPOINTS
// -------------------------------------------------------------

// 1. ADMS Handshake/Registry (GET /iclock/cdata)
app.get(['/iclock/cdata', '/iclock/cdata.aspx'], (req, res) => {
  const { SN, options } = req.query;
  console.log(`[ADMS] Handshake request from Serial Number: ${SN}`);

  // Respond with registry successful command configuration
  res.setHeader('Content-Type', 'text/plain');
  res.send('registry=ok\r\n');
});

// 2. ADMS Log Uploads (POST /iclock/cdata)
app.post(['/iclock/cdata', '/iclock/cdata.aspx'], async (req, res) => {
  const sn = (req.query.sn || req.query.SN) as string;
  const table = (req.query.table || req.query.TABLE) as string;
  const rawText = req.body as string;

  console.log(`[ADMS] Log upload received from SN: ${sn}, Table: ${table}`);

  if (table === 'ATTLOG') {
    try {
      const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
      let insertedCount = 0;

      for (const line of lines) {
        // ZKTeco/eSSL protocol data rows are separated by tabs (\t)
        const parts = line.split(/\t/);
        if (parts.length < 2) continue;

        const punchingCode = parts[0].trim(); // Pin/BiometricUID
        const timestampStr = parts[1].trim(); // Date/Time: "yyyy-MM-dd HH:mm:ss"

        // Find employee by biometric UID/punching code
        const employee = await prisma.employee.findFirst({
          where: { punchingCode }
        });

        if (!employee) {
          console.warn(`[ADMS] Punch logged for unknown BiometricUID: ${punchingCode}`);
          continue;
        }

        // Parse timestamp
        const dt = new Date(timestampStr.replace(' ', 'T'));
        if (isNaN(dt.getTime())) continue;

        const dateStr = `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
        const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;

        // Retrieve most recent log for this employee to pair check-in/check-out sequentially
        const lastLog = await prisma.attendance.findFirst({
          where: { employeeId: employee.employeeId },
          orderBy: { id: 'desc' }
        });

        let shouldPair = false;
        let targetLog = lastLog;

        if (lastLog) {
          const lastDateParts = lastLog.date.split('/').map(Number);
          const lastTimeParts = lastLog.checkIn.split(':').map(Number);
          const lastCheckInDate = new Date(lastDateParts[2], lastDateParts[0] - 1, lastDateParts[1], lastTimeParts[0], lastTimeParts[1], 0);

          const diffMs = dt.getTime() - lastCheckInDate.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);

          // If last log has no check-out, and the gap is less than 16 hours, we pair it
          if (lastLog.checkOut === '' && diffHours > 0 && diffHours < 16) {
            shouldPair = true;
          }
          // Double-scanning safeguard: update check-out if same/close shift within 2 hours
          else if (lastLog.checkOut !== '' && diffHours > 0 && diffHours < 2) {
            shouldPair = true;
          }
        }

        if (shouldPair && targetLog) {
          const checkIn = targetLog.checkIn;
          const checkOut = timeStr;
          const hours = calculateHours(checkIn, checkOut);

          let status = 'PRESENT';
          if (hours > 0.0 && hours < 4.0) {
            status = 'HALF_DAY';
          } else if (hours > 9.0) {
            status = 'OVERTIME';
          } else {
            // Re-evaluate if they were late on check-in
            const [inHour, inMin] = checkIn.split(':').map(Number);
            if (inHour >= 5 && inHour <= 11) {
              // Shift A: starts 06:45, late if check-in is after 07:00
              const isLate = inHour > 7 || (inHour === 7 && inMin > 0);
              if (isLate) status = 'LATE';
            } else if (inHour >= 13 && inHour <= 18) {
              // Shift B: starts 14:45, late if check-in is after 15:00
              const isLate = inHour > 15 || (inHour === 15 && inMin > 0);
              if (isLate) status = 'LATE';
            } else if (inHour >= 21 || inHour <= 2) {
              // Shift C: starts 22:45, late if check-in is after 23:00 (crossing midnight)
              const isLate = (inHour === 23 && inMin > 0) || (inHour >= 0 && inHour <= 2);
              if (isLate) status = 'LATE';
            }
          }

          await prisma.attendance.update({
            where: { id: targetLog.id },
            data: {
              checkOut,
              hoursWorked: hours,
              status
            }
          });
        } else {
          // Create new check-in for the day
          const checkIn = timeStr;
          const checkOut = '';
          const hours = 0.0;

          // Shift-aware Late Rule Configuration:
          // Shift A starts 06:00 -> Late after 06:15
          // Shift B starts 15:00 -> Late after 15:15
          // Shift C starts 23:00 -> Late after 23:15
          let status = 'PRESENT';
          const [inHour, inMin] = checkIn.split(':').map(Number);
          if (inHour >= 5 && inHour <= 11) {
            // Shift A: starts 06:45, late if check-in is after 07:00
            const isLate = inHour > 7 || (inHour === 7 && inMin > 0);
            if (isLate) status = 'LATE';
          } else if (inHour >= 13 && inHour <= 18) {
            // Shift B: starts 14:45, late if check-in is after 15:00
            const isLate = inHour > 15 || (inHour === 15 && inMin > 0);
            if (isLate) status = 'LATE';
          } else if (inHour >= 21 || inHour <= 2) {
            // Shift C: starts 22:45, late if check-in is after 23:00 (crossing midnight)
            const isLate = (inHour === 23 && inMin > 0) || (inHour >= 0 && inHour <= 2);
            if (isLate) status = 'LATE';
          }

          await prisma.attendance.create({
            data: {
              employeeId: employee.employeeId,
              date: dateStr,
              checkIn,
              checkOut,
              status,
              hoursWorked: hours
            }
          });
        }
        insertedCount++;
      }

      console.log(`[ADMS] Successfully synced ${insertedCount} biometric entries.`);
      res.setHeader('Content-Type', 'text/plain');
      // eSSL/ZKTeco machines clear their queue buffer only upon receiving OK/GBYTE
      res.send('OK\r\n');
    } catch (err) {
      console.error('[ADMS] Error parsing logs:', err);
      res.status(500).send('ERROR\r\n');
    }
  } else {
    // Return standard OK for config table/operation uploads
    res.setHeader('Content-Type', 'text/plain');
    res.send('OK\r\n');
  }
});

// 3. ADMS Heartbeat / Command Center (GET /iclock/getrequest)
app.get(['/iclock/getrequest', '/iclock/getrequest.aspx'], (req, res) => {
  // Device polls for command requests here
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK\r\n');
});

// -------------------------------------------------------------
// AUTHENTICATION ENDPOINT
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const { role, passcode, employeeId } = req.body;
  const adminPass = process.env.ADMIN_PASSCODE || 'admin';
  const supervisorPass = process.env.SUPERVISOR_PASSCODE || 'supervisor';
  const systemToken = process.env.API_ACCESS_KEY || 'default-secure-key-2106';

  if (role === 'admin') {
    if (passcode === adminPass) {
      return res.json({ success: true, token: systemToken });
    }
    return res.status(401).json({ error: 'Incorrect Admin passcode' });
  }

  if (role === 'supervisor') {
    if (passcode === supervisorPass) {
      return res.json({ success: true, token: systemToken });
    }
    return res.status(401).json({ error: 'Incorrect Supervisor passcode' });
  }

  if (role === 'employee') {
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    try {
      const employee = await prisma.employee.findUnique({
        where: { employeeId }
      });
      if (employee) {
        return res.json({ success: true, token: systemToken, employee });
      }
      return res.status(404).json({ error: 'Employee ID not found in database' });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  }

  return res.status(400).json({ error: 'Invalid login role' });
});

// Employee lookup (preview) route before login (safe, only returns name/dept for verified ID)
app.get('/api/auth/employee-preview/*', async (req, res) => {
  const employeeId = (req.params as any)[0];
  try {
    const employee = await prisma.employee.findUnique({
      where: { employeeId },
      select: {
        employeeId: true,
        name: true,
        department: true
      }
    });
    if (employee) {
      res.json(employee);
    } else {
      res.status(404).json({ error: 'Employee not found' });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// -------------------------------------------------------------
// REST API SYSTEM ENDPOINTS
// -------------------------------------------------------------

// Core Calculation Engine function matching Flutter logic
async function calculateEmployeeWages(employeeId: string, month: number, year: number, settings?: any) {
  const employee = await prisma.employee.findUnique({
    where: { employeeId }
  });

  if (!employee) throw new Error('Employee not found');

  const isLoadBasis = employee.salaryPerDay === 0.0;
  const shiftHours = settings?.shiftHours ? parseFloat(settings.shiftHours) : 9.0;

  // Retrieve attendance records for the month
  const matchPattern = `${month}/`;
  const attendance = await prisma.attendance.findMany({
    where: {
      employeeId,
      date: {
        startsWith: matchPattern
      }
    }
  });

  // Filter valid dates for the specific year
  const monthLogs = attendance.filter(log => {
    const parts = log.date.split('/');
    return parts.length === 3 && parseInt(parts[2]) === year;
  });

  let presentDays = 0;
  let lateDays = 0;
  let overtimeDays = 0;
  let halfDays = 0;
  let overtimeHours = 0.0;

  for (const log of monthLogs) {
    const status = log.status.toUpperCase();
    if (status.includes('PRESENT')) {
      presentDays++;
    } else if (status.includes('LATE')) {
      lateDays++;
    } else if (status.includes('OVERTIME')) {
      overtimeDays++;
    } else if (status.includes('HALF_DAY')) {
      halfDays++;
    }

    if (log.hoursWorked > shiftHours) {
      overtimeHours += (log.hoursWorked - shiftHours);
    } else if (status.includes('OVERTIME') && log.hoursWorked > 0.0) {
      overtimeHours += log.hoursWorked;
    }
  }

  const daysLogged = monthLogs.length;

  // Calculate missing weekdays as absent days (excl. weekends)
  // Generating weekdays in May 2026 (or custom month/year)
  const weekdays: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    if (dateObj.getDay() !== 0 && dateObj.getDay() !== 6) { // Exclude Sat (6) and Sun (0)
      weekdays.push(`${month}/${d}/${year}`);
    }
  }

  const loggedWeekdays = monthLogs
    .filter(log => weekdays.includes(log.date))
    .map(log => log.date);

  const absentDays = weekdays.length - new Set(loggedWeekdays).size;

  // Retrieve Supervisor Job Log Splits for this employee
  const jobAllocations = await prisma.jobLogEmployee.findMany({
    where: {
      employeeId,
      jobLog: {
        date: {
          startsWith: matchPattern
        }
      }
    },
    include: {
      jobLog: true
    }
  });

  // Filter by year
  const yearJobs = jobAllocations.filter(ja => {
    const parts = ja.jobLog.date.split('/');
    return parts.length === 3 && parseInt(parts[2]) === year;
  });

  const jobEarnings = yearJobs.reduce((sum, item) => sum + item.splitEarnings, 0.0);

  // Initialize values
  let basicPay = 0.0;
  let otPay = 0.0;
  let basicDa = 0.0;
  let hra = 0.0;
  let otherAllowance = 0.0;
  let pfDeduction = 0.0;
  let esicDeduction = 0.0;
  let ptDeduction = 0.0;
  let otherDeduction = 0.0;
  let totalDeductions = 0.0;
  let grossSalary = 0.0;
  let netSalary = 0.0;

  const mlwlDeduction = (month === 6 || month === 12) ? 25.0 : 0.0;
  const accountAdvance = employee.accountAdvance;

  if (!isLoadBasis) {
    const rate = employee.salaryPerDay > 0 ? employee.salaryPerDay : 636.0;
    const workedDays = (presentDays + lateDays) + (halfDays * 0.5);
    const otDays = overtimeDays;

    basicPay = workedDays * rate;
    otPay = otDays * rate;
    grossSalary = basicPay + otPay + jobEarnings;

    // BASIC+DA = workedDays * (15746 / 26)
    basicDa = Math.round(workedDays * (15746.0 / 26.0));

    // HRA = 5% of BASIC+DA
    hra = Math.round(basicDa * 0.05);

    // Other allowance = Gross - BASIC+DA - HRA
    otherAllowance = grossSalary - basicDa - hra;
    if (otherAllowance < 0.0) otherAllowance = 0.0;

    // Deductions
    pfDeduction = Math.round(basicDa * 0.12);
    esicDeduction = Math.round(grossSalary * 0.0075);

    // PT slabs
    if (grossSalary <= 7500.0) {
      ptDeduction = 0.0;
    } else if (grossSalary <= 10000.0) {
      ptDeduction = 175.0;
    } else {
      ptDeduction = 200.0;
    }

    // Canteen flat deduction
    if (grossSalary > 0.0) {
      otherDeduction = 500.0;
    }

    totalDeductions = pfDeduction + esicDeduction + ptDeduction + otherDeduction + accountAdvance + mlwlDeduction;
    netSalary = grossSalary - totalDeductions;
  } else {
    // Load Basis Employee
    basicPay = 0.0;
    otPay = 0.0;
    grossSalary = jobEarnings;

    basicDa = 0.0;
    hra = 0.0;
    otherAllowance = 0.0;
    pfDeduction = 0.0;
    esicDeduction = 0.0;
    ptDeduction = 0.0;
    otherDeduction = 0.0;

    totalDeductions = accountAdvance + mlwlDeduction;
    netSalary = grossSalary - totalDeductions;
  }

  return {
    employeeId,
    month,
    year,
    basicPay,
    otPay,
    basicDa,
    hra,
    otherAllowance,
    pfDeduction,
    esicDeduction,
    ptDeduction,
    otherDeduction,
    totalDeductions,
    accountAdvance,
    mlwlDeduction,
    grossSalary,
    netSalary: netSalary < 0 ? 0.0 : netSalary,
    workedDays: (presentDays + lateDays) + (halfDays * 0.5),
    overtimeHours,
    jobEarnings
  };
}

// Optimized In-Memory Calculation Engine matching calculateEmployeeWages
function calculateEmployeeWagesInMemory(
  employee: any,
  attendanceLogs: any[],
  jobAllocations: any[],
  month: number,
  year: number,
  settings?: any
) {
  const isLoadBasis = employee.salaryPerDay === 0.0;
  const shiftHours = settings?.shiftHours ? parseFloat(settings.shiftHours) : 9.0;

  // Retrieve attendance records for the month and year
  const monthLogs = attendanceLogs.filter(log => {
    const parts = log.date.split('/');
    return parts.length === 3 && parseInt(parts[0]) === month && parseInt(parts[2]) === year;
  });

  let presentDays = 0;
  let lateDays = 0;
  let overtimeDays = 0;
  let halfDays = 0;
  let overtimeHours = 0.0;

  for (const log of monthLogs) {
    const status = log.status.toUpperCase();
    if (status.includes('PRESENT')) {
      presentDays++;
    } else if (status.includes('LATE')) {
      lateDays++;
    } else if (status.includes('OVERTIME')) {
      overtimeDays++;
    } else if (status.includes('HALF_DAY')) {
      halfDays++;
    }

    if (log.hoursWorked > shiftHours) {
      overtimeHours += (log.hoursWorked - shiftHours);
    } else if (status.includes('OVERTIME') && log.hoursWorked > 0.0) {
      overtimeHours += log.hoursWorked;
    }
  }

  // Calculate missing weekdays as absent days (excl. weekends)
  const weekdays: string[] = [];
  const daysInMonth = new Date(year, month - 0, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    if (dateObj.getDay() !== 0 && dateObj.getDay() !== 6) { // Exclude Sat (6) and Sun (0)
      weekdays.push(`${month}/${d}/${year}`);
    }
  }

  const loggedWeekdays = monthLogs
    .filter(log => weekdays.includes(log.date))
    .map(log => log.date);

  const absentDays = weekdays.length - new Set(loggedWeekdays).size;

  // Retrieve Supervisor Job Log Splits for this employee from pre-fetched allocations
  const yearJobs = jobAllocations.filter(ja => {
    const parts = ja.jobLog.date.split('/');
    return parts.length === 3 && parseInt(parts[0]) === month && parseInt(parts[2]) === year;
  });

  const jobEarnings = yearJobs.reduce((sum, item) => sum + item.splitEarnings, 0.0);

  // Initialize values
  let basicPay = 0.0;
  let otPay = 0.0;
  let basicDa = 0.0;
  let hra = 0.0;
  let otherAllowance = 0.0;
  let pfDeduction = 0.0;
  let esicDeduction = 0.0;
  let ptDeduction = 0.0;
  let otherDeduction = 0.0;
  let totalDeductions = 0.0;
  let grossSalary = 0.0;
  let netSalary = 0.0;

  const mlwlDeduction = (month === 6 || month === 12) ? 25.0 : 0.0;
  const accountAdvance = employee.accountAdvance;

  if (!isLoadBasis) {
    const rate = employee.salaryPerDay > 0 ? employee.salaryPerDay : 636.0;
    const workedDays = (presentDays + lateDays) + (halfDays * 0.5);
    const otDays = overtimeDays;

    basicPay = workedDays * rate;
    otPay = otDays * rate;
    grossSalary = basicPay + otPay + jobEarnings;

    // BASIC+DA = workedDays * (15746 / 26)
    basicDa = Math.round(workedDays * (15746.0 / 26.0));

    // HRA = 5% of BASIC+DA
    hra = Math.round(basicDa * 0.05);

    // Other allowance = Gross - BASIC+DA - HRA
    otherAllowance = grossSalary - basicDa - hra;
    if (otherAllowance < 0.0) otherAllowance = 0.0;

    // Deductions
    pfDeduction = Math.round(basicDa * 0.12);
    esicDeduction = Math.round(grossSalary * 0.0075);

    // PT slabs
    if (grossSalary <= 7500.0) {
      ptDeduction = 0.0;
    } else if (grossSalary <= 10000.0) {
      ptDeduction = 175.0;
    } else {
      ptDeduction = 200.0;
    }

    // Canteen flat deduction
    if (grossSalary > 0.0) {
      otherDeduction = 500.0;
    }

    totalDeductions = pfDeduction + esicDeduction + ptDeduction + otherDeduction + accountAdvance + mlwlDeduction;
    netSalary = grossSalary - totalDeductions;
  } else {
    // Load Basis Employee
    basicPay = 0.0;
    otPay = 0.0;
    grossSalary = jobEarnings;

    basicDa = 0.0;
    hra = 0.0;
    otherAllowance = 0.0;
    pfDeduction = 0.0;
    esicDeduction = 0.0;
    ptDeduction = 0.0;
    otherDeduction = 0.0;

    totalDeductions = accountAdvance + mlwlDeduction;
    netSalary = grossSalary - totalDeductions;
  }

  return {
    basicPay,
    otPay,
    basicDa,
    hra,
    otherAllowance,
    pfDeduction,
    esicDeduction,
    ptDeduction,
    otherDeduction,
    totalDeductions,
    accountAdvance,
    mlwlDeduction,
    grossSalary,
    netSalary: netSalary < 0 ? 0.0 : netSalary,
    workedDays: !isLoadBasis ? ((presentDays + lateDays) + (halfDays * 0.5)) : 0.0,
    overtimeHours,
    jobEarnings
  };
}

// REST Route: Get all employees
app.get('/api/employees', async (req, res) => {
  try {
    const list = await prisma.employee.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// REST Route: Get attendance logs (supports filters by employeeId, month, year)
app.get('/api/attendance', async (req, res) => {
  const { employeeId, month, year } = req.query;
  try {
    const filter: any = {};
    if (employeeId) {
      filter.employeeId = employeeId as string;
    }

    // Database-level filtering using string prefix/suffix matching (e.g. "7/" and "/2026")
    if (month && year) {
      filter.date = {
        startsWith: `${month}/`,
        endsWith: `/${year}`
      };
    } else if (month) {
      filter.date = {
        startsWith: `${month}/`
      };
    } else if (year) {
      filter.date = {
        endsWith: `/${year}`
      };
    }

    const logs = await prisma.attendance.findMany({
      where: filter,
      orderBy: { date: 'asc' }
    });

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// REST Route: Sync pre-processed attendance logs from local eSSL AttendanceLogs table
app.post('/api/attendance/sync-processed', async (req, res) => {
  const { logs } = req.body;
  if (!Array.isArray(logs)) {
    return res.status(400).json({ error: 'logs parameter must be an array.' });
  }

  try {
    let upsertedCount = 0;
    for (const log of logs) {
      const { employeeId, date, checkIn, checkOut, status, hoursWorked } = log;
      if (!employeeId || !date) continue;

      // Find employee to make sure they exist
      const employee = await prisma.employee.findUnique({
        where: { employeeId }
      });
      if (!employee) continue;

      await prisma.attendance.upsert({
        where: {
          employeeId_date: {
            employeeId,
            date
          }
        },
        update: {
          checkIn: checkIn || '',
          checkOut: checkOut || '',
          hoursWorked: parseFloat(hoursWorked || 0.0),
          status: status || 'PRESENT'
        },
        create: {
          employeeId,
          date,
          checkIn: checkIn || '',
          checkOut: checkOut || '',
          hoursWorked: parseFloat(hoursWorked || 0.0),
          status: status || 'PRESENT'
        }
      });
      upsertedCount++;
    }

    res.json({ message: `Successfully synchronized ${upsertedCount} processed attendance records.` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// REST Route: Add new employee
app.post('/api/employees', async (req, res) => {
  try {
    const emp = await prisma.employee.create({
      data: req.body
    });
    res.json(emp);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// REST Route: Update general employee details
app.put('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await prisma.employee.update({
      where: { employeeId: id },
      data: req.body
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// REST Route: Create supervisor Job Log and distribute payouts
app.post('/api/jobs', async (req, res) => {
  const { id, date, jobName, totalTons, ratePerTon, unit, castingName, castingQty, employeeIds } = req.body;

  try {
    const totalPayout = totalTons * ratePerTon;
    const crewEmployees = await prisma.employee.findMany({
      where: {
        employeeId: { in: employeeIds }
      }
    });

    const loadBasisCrew = crewEmployees.filter(e => e.salaryPerDay === 0.0);
    const dayBasisCrew = crewEmployees.filter(e => e.salaryPerDay > 0.0);

    // Look up attendance logs for these employees on this date to know hours worked
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        employeeId: { in: employeeIds },
        date: date
      }
    });
    const attendanceMap = new Map(attendanceRecords.map(r => [r.employeeId, r]));

    // 1. Calculate Day-Basis Crew Deductions (Half-Day aware)
    let totalDayWagesToDeduct = 0.0;
    for (const de of dayBasisCrew) {
      const att = attendanceMap.get(de.employeeId);
      const baseRate = de.salaryPerDay > 0 ? de.salaryPerDay : 636.0;
      const isHalfDay = att ? (att.status === 'HALF_DAY' || att.hoursWorked < 4.0) : false;
      
      totalDayWagesToDeduct += isHalfDay ? (baseRate * 0.5) : baseRate;
    }

    const remainingPool = totalPayout - totalDayWagesToDeduct;
    const finalSplits = new Map<string, number>();

    // Set defaults: all day-basis crew get 0 split
    for (const de of dayBasisCrew) {
      finalSplits.set(de.employeeId, 0.0);
    }

    // 2. Distribute loader split earnings proportionally
    if (loadBasisCrew.length > 0 && remainingPool > 0) {
      const totalLoaders = loadBasisCrew.length;
      const idealShare = remainingPool / totalLoaders;

      // Calculate base splits
      const loaderInfoList = loadBasisCrew.map(le => {
        const att = attendanceMap.get(le.employeeId);
        const hours = att ? att.hoursWorked : 8.0; // default to 8.0/full day if not synced yet
        const fraction = Math.min(1.0, hours / 8.0);
        const baseSplit = idealShare * fraction;

        return {
          employeeId: le.employeeId,
          hours,
          baseSplit,
          isFullTime: hours >= 8.0
        };
      });

      const sumBaseSplits = loaderInfoList.reduce((sum, item) => sum + item.baseSplit, 0.0);
      const surplus = Math.max(0.0, remainingPool - sumBaseSplits);

      const fullTimeLoaders = loaderInfoList.filter(l => l.isFullTime);

      if (fullTimeLoaders.length > 0 && surplus > 0) {
        // Distribute surplus to full-time workers
        const extraShare = surplus / fullTimeLoaders.length;
        for (const l of loaderInfoList) {
          const finalVal = l.baseSplit + (l.isFullTime ? extraShare : 0.0);
          finalSplits.set(l.employeeId, finalVal);
        }
      } else if (surplus > 0) {
        // If no loader worked 8 hours or more, divide surplus equally among all loaders
        const extraShare = surplus / totalLoaders;
        for (const l of loaderInfoList) {
          finalSplits.set(l.employeeId, l.baseSplit + extraShare);
        }
      } else {
        // No surplus
        for (const l of loaderInfoList) {
          finalSplits.set(l.employeeId, l.baseSplit);
        }
      }
    } else {
      for (const le of loadBasisCrew) {
        finalSplits.set(le.employeeId, 0.0);
      }
    }

    // Create Job Log along with employee relations using finalSplits map
    const jobLog = await prisma.jobLog.create({
      data: {
        id,
        date,
        jobName,
        totalTons,
        ratePerTon,
        unit,
        castingName,
        castingQty,
        employees: {
          create: employeeIds.map((empId: string) => {
            return {
              employeeId: empId,
              splitEarnings: finalSplits.get(empId) || 0.0
            };
          })
        }
      },
      include: {
        employees: true
      }
    });

    res.json(jobLog);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// REST Route: Get all job logs (supports filters by month, year)
app.get('/api/jobs', async (req, res) => {
  const { month, year } = req.query;
  try {
    const filter: any = {};

    // Database-level filtering using string prefix/suffix matching (e.g. "7/" and "/2026")
    if (month && year) {
      filter.date = {
        startsWith: `${month}/`,
        endsWith: `/${year}`
      };
    } else if (month) {
      filter.date = {
        startsWith: `${month}/`
      };
    } else if (year) {
      filter.date = {
        endsWith: `/${year}`
      };
    }

    const list = await prisma.jobLog.findMany({
      where: filter,
      include: {
        employees: {
          include: {
            employee: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// REST Route: Delete a job log
app.delete('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.jobLog.delete({
      where: { id }
    });
    res.json({ message: 'Job log deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// REST Route: Trigger Monthly Payroll Calculation
app.post('/api/payroll/calculate', async (req, res) => {
  const { month, year, settings } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

  const parsedMonth = parseInt(month);
  const parsedYear = parseInt(year);

  try {
    const startTime = Date.now();

    // 1. Fetch all employees in one query
    const employees = await prisma.employee.findMany();

    // 2. Fetch all attendance logs for this month/year in one query
    const matchPattern = `${parsedMonth}/`;
    const allAttendance = await prisma.attendance.findMany({
      where: {
        date: {
          startsWith: matchPattern
        }
      }
    });

    // Filter by year in memory
    const monthLogs = allAttendance.filter(log => {
      const parts = log.date.split('/');
      return parts.length === 3 && parseInt(parts[2]) === parsedYear;
    });

    // Group attendance logs by employeeId for O(1) lookups
    const attendanceByEmployee: Record<string, any[]> = {};
    monthLogs.forEach(log => {
      if (!attendanceByEmployee[log.employeeId]) {
        attendanceByEmployee[log.employeeId] = [];
      }
      attendanceByEmployee[log.employeeId].push(log);
    });

    // 3. Fetch all job allocations for this month/year in one query
    const allJobAllocations = await prisma.jobLogEmployee.findMany({
      where: {
        jobLog: {
          date: {
            startsWith: matchPattern
          }
        }
      },
      include: {
        jobLog: true
      }
    });

    // Filter by year in memory
    const yearJobs = allJobAllocations.filter(ja => {
      const parts = ja.jobLog.date.split('/');
      return parts.length === 3 && parseInt(parts[2]) === parsedYear;
    });

    // Group job allocations by employeeId for O(1) lookups
    const jobsByEmployee: Record<string, any[]> = {};
    yearJobs.forEach(ja => {
      if (!jobsByEmployee[ja.employeeId]) {
        jobsByEmployee[ja.employeeId] = [];
      }
      jobsByEmployee[ja.employeeId].push(ja);
    });

    const runs: any[] = [];

    // 4. Compute payroll runs in-memory (0 database queries inside loop!)
    for (const emp of employees) {
      const empAttendance = attendanceByEmployee[emp.employeeId] || [];
      const empJobs = jobsByEmployee[emp.employeeId] || [];

      const calc = calculateEmployeeWagesInMemory(emp, empAttendance, empJobs, parsedMonth, parsedYear, settings);

      runs.push({
        employeeId: emp.employeeId,
        month: parsedMonth,
        year: parsedYear,
        ...calc
      });
    }

    // 5. Bulk write to database in a single transaction (Delete old, insert new)
    await prisma.$transaction([
      prisma.payrollRun.deleteMany({
        where: {
          month: parsedMonth,
          year: parsedYear
        }
      }),
      prisma.payrollRun.createMany({
        data: runs
      })
    ]);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[CALCULATE] Finished bulk payroll calculation in ${duration}s for ${runs.length} employees.`);

    // Fetch the inserted runs to return them
    const savedRuns = await prisma.payrollRun.findMany({
      where: {
        month: parsedMonth,
        year: parsedYear
      }
    });

    res.json({ message: `Successfully computed payroll for ${savedRuns.length} employees in ${duration}s.`, data: savedRuns });
  } catch (err) {
    console.error('[CALCULATE] Error in payroll calculation:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// REST Route: Get all payroll runs
app.get('/api/payroll/runs', async (req, res) => {
  const { month, year } = req.query;

  try {
    const filter: any = {};
    if (month) filter.month = parseInt(month as string);
    if (year) filter.year = parseInt(year as string);

    const list = await prisma.payrollRun.findMany({
      where: filter,
      include: {
        employee: true
      }
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// REST Route: Update employee advances and deductions
app.put('/api/employees/*/advances', async (req, res) => {
  const id = (req.params as any)[0];
  const { accountAdvance, remainingAdvance } = req.body;
  try {
    const updated = await prisma.employee.update({
      where: { employeeId: id },
      data: {
        accountAdvance: parseFloat(accountAdvance) || 0.0,
        remainingAdvance: parseFloat(remainingAdvance) || 0.0
      }
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// REST Route: Update employee basis (Day vs Load Basis)
app.put('/api/employees/*/basis', async (req, res) => {
  const id = (req.params as any)[0];
  const { isLoadBasis, rate } = req.body;
  try {
    const updated = await prisma.employee.update({
      where: { employeeId: id },
      data: {
        salaryPerDay: isLoadBasis ? 0.0 : (parseFloat(rate) || 636.0),
        deductionPerDay: isLoadBasis ? 0.0 : 0.0
      }
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// REST Route: Export Wages Register to Excel Sheet
app.get('/api/payroll/export', async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ error: 'Month and year are required' });
  }

  try {
    const m = parseInt(month as string);
    const y = parseInt(year as string);

    const list = await prisma.payrollRun.findMany({
      where: { month: m, year: y },
      include: { employee: true },
      orderBy: { employeeId: 'asc' }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Payroll ${MONTH_NAMES[m - 1] || m} ${y}`);

    // Setup columns
    worksheet.columns = [
      { header: 'Employee ID', key: 'id', width: 15 },
      { header: 'Employee Name', key: 'name', width: 25 },
      { header: 'Department', key: 'dept', width: 15 },
      { header: 'Payment Basis', key: 'basis', width: 15 },
      { header: 'Days Worked', key: 'days', width: 12 },
      { header: 'OT Hours', key: 'otHours', width: 12 },
      { header: 'Basic Pay', key: 'basic', width: 15 },
      { header: 'OT Pay', key: 'otPay', width: 15 },
      { header: 'Job Earnings', key: 'jobEarnings', width: 15 },
      { header: 'Gross Salary', key: 'gross', width: 15 },
      { header: 'PF Deduction (12%)', key: 'pf', width: 18 },
      { header: 'ESIC (0.75%)', key: 'esic', width: 15 },
      { header: 'Professional Tax', key: 'pt', width: 15 },
      { header: 'Canteen Charge', key: 'canteen', width: 15 },
      { header: 'Account Advance', key: 'advance', width: 15 },
      { header: 'MLWL (LWF)', key: 'mlwl', width: 15 },
      { header: 'Total Deductions', key: 'deductions', width: 18 },
      { header: 'Net Salary', key: 'net', width: 15 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' } // Slate 800
      };
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true,
        name: 'Arial',
        size: 10
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 25;

    // Add data rows
    list.forEach((run) => {
      const isLoad = run.employee.salaryPerDay === 0.0;
      const row = worksheet.addRow({
        id: run.employeeId,
        name: run.employee.name,
        dept: run.employee.department,
        basis: isLoad ? 'LOAD BASIS' : 'DAY BASIS',
        days: run.workedDays,
        otHours: run.overtimeHours,
        basic: run.basicPay,
        otPay: run.otPay,
        jobEarnings: run.jobEarnings,
        gross: run.grossSalary,
        pf: run.pfDeduction,
        esic: run.esicDeduction,
        pt: run.ptDeduction,
        canteen: run.otherDeduction,
        advance: run.accountAdvance,
        mlwl: run.mlwlDeduction,
        deductions: run.totalDeductions,
        net: run.netSalary
      });

      // Format number format cells
      ['basic', 'otPay', 'jobEarnings', 'gross', 'pf', 'esic', 'pt', 'canteen', 'advance', 'mlwl', 'deductions', 'net'].forEach((colKey) => {
        const cell = row.getCell(colKey);
        cell.numFmt = '#,##0.00';
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Payroll_${m}_${y}_Register.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Helper: Parse string date from DB ("m/d/yyyy") to JavaScript Date
function parseDBDate(dateStr: string): Date {
  const parts = dateStr.split('/');
  const month = parseInt(parts[0]) - 1; // 0-indexed in JS Date
  const day = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  return new Date(year, month, day);
}

// REST Route: Export Biometric Attendance logs for a custom date range to Excel
app.get('/api/attendance/export', async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate parameters are required.' });
  }

  try {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Fetch all attendance logs including employee relation
    const allLogs = await prisma.attendance.findMany({
      include: {
        employee: true
      }
    });

    // Filter by date range in-memory
    const filteredLogs = allLogs.filter(log => {
      try {
        const logDate = parseDBDate(log.date);
        return logDate >= start && logDate <= end;
      } catch (_) {
        return false;
      }
    });

    // Sort by Date ascending, then Employee Name ascending
    filteredLogs.sort((a, b) => {
      const dateA = parseDBDate(a.date).getTime();
      const dateB = parseDBDate(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.employee.name.localeCompare(b.employee.name);
    });

    // Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Logs');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Employee Name', key: 'name', width: 25 },
      { header: 'Department', key: 'dept', width: 15 },
      { header: 'Check-In', key: 'checkIn', width: 12 },
      { header: 'Check-Out', key: 'checkOut', width: 12 },
      { header: 'Hours Worked', key: 'hours', width: 15 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' } // Slate 800
      };
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true,
        name: 'Arial',
        size: 10
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 25;

    // Add data rows
    filteredLogs.forEach((log) => {
      worksheet.addRow({
        date: log.date,
        employeeId: log.employeeId,
        name: log.employee.name,
        dept: log.employee.department,
        checkIn: log.checkIn || '-',
        checkOut: log.checkOut || '-',
        hours: log.hoursWorked,
        status: log.status
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Attendance_Logs_${startDate}_to_${endDate}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 KFIL Solapur Backend running at http://localhost:${PORT}`);
});
