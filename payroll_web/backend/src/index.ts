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
    
    // Automatically allow local development and Vercel domains (including previews)
    const isLocalhost = incomingOrigin.startsWith('http://localhost') || incomingOrigin.startsWith('http://127.0.0.1');
    const isVercel = incomingOrigin.endsWith('.vercel.app');
    
    if (allowedOrigins.indexOf(incomingOrigin) !== -1 || isLocalhost || isVercel) {
      callback(null, true);
    } else {
      console.warn(`[CORS REJECT] Origin "${origin}" is not in allowed origins:`, allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Token-based API Authentication Middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Exclude public endpoints and biometric ADMS endpoints
  if (
    req.path === '/' ||
    req.path === '/favicon.ico' ||
    req.path === '/api/auth/login' ||
    req.path.startsWith('/api/auth/employee-preview/') ||
    req.path.startsWith('/iclock/') ||
    req.path === '/api/attendance/sync-processed' ||
    req.path === '/api/attendance/upload-essl-excel'
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

// Helper: Normalize employee punching codes (e.g. KFIL-L1-001 -> L1-001)
function normalizeBiometricCode(code: string): string {
  if (!code) return '';
  return code.replace(/^KFIL[\/-_]/i, '').trim().toUpperCase();
}

// Helper: Parse IST date & time strings into UTC Epoch Milliseconds
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

// Helper: Calculate hours worked from check-in and check-out using linear epoch math
function calculateHours(checkIn: string, checkOut: string, checkInDate?: string, checkOutDate?: string): number {
  if (!checkIn || !checkOut) return 0.0;
  try {
    const refDate = checkInDate || '2026-07-01';
    const inEpoch = parseISTEpoch(refDate, checkIn);
    
    let outDateStr = checkOutDate;
    if (!outDateStr) {
      const [inH] = checkIn.split(':').map(Number);
      const [outH] = checkOut.split(':').map(Number);
      if (outH < inH || (inH >= 20 && outH <= 12)) {
        if (inEpoch) {
          const dt = new Date(inEpoch);
          dt.setDate(dt.getDate() + 1);
          outDateStr = `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
        }
      } else {
        outDateStr = refDate;
      }
    }
    const outEpoch = parseISTEpoch(outDateStr || refDate, checkOut);
    if (inEpoch && outEpoch && outEpoch > inEpoch) {
      const diffHours = (outEpoch - inEpoch) / (1000 * 60 * 60);
      return Number(diffHours.toFixed(2));
    }
  } catch (_) {
    // Fail-safe
  }
  return 0.0;
}

/**
 * Determine Shift Status Code:
 * Shift 1 (Day / Morning Shift): Check-in between 05:00 and 12:59 -> P1, L1, HD1, OT1
 * Shift 2 (Evening / Night Shift): Check-in between 13:00 and 04:59 -> P2, L2, HD2, OT2
 * Absent -> A
 */
function determineShiftStatus(checkIn: string, hoursWorked: number): string {
  if (!checkIn || checkIn === '-' || checkIn === '' || checkIn === '00:00' || checkIn === '00:00:00') return 'A';
  if (hoursWorked === 0.0 && (!checkIn || checkIn === '00:00')) return 'A';

  const [inHour, inMin] = checkIn.split(':').map(Number);
  if (isNaN(inHour)) return 'A';

  const isShift1 = (inHour >= 5 && inHour <= 12);
  const shiftNum = isShift1 ? '1' : '2';

  let isLate = false;
  if (isShift1) {
    isLate = inHour > 7 || (inHour === 7 && inMin > 0);
  } else {
    if (inHour >= 13 && inHour <= 18) {
      isLate = inHour > 15 || (inHour === 15 && inMin > 0);
    } else if (inHour >= 21 || inHour <= 2) {
      isLate = (inHour === 23 && inMin > 0) || (inHour >= 0 && inHour <= 2);
    }
  }

  if (hoursWorked > 0.0 && hoursWorked < 4.0) {
    return `HD${shiftNum}`;
  } else if (hoursWorked > 9.0) {
    return `OT${shiftNum}`;
  } else if (isLate) {
    return `L${shiftNum}`;
  } else {
    return `P${shiftNum}`;
  }
}

/**
 * Auto Check-Out Unclosed Shifts (> 9 hours elapsed since checkIn)
 * Checkout time is formatted in IST (+05:30) to avoid UTC offset errors on Render.
 */
async function autoCheckoutUnclosedShifts() {
  try {
    const unclosed = await prisma.attendance.findMany({
      where: { checkOut: '' }
    });

    const nowEpoch = Date.now();
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in milliseconds

    for (const log of unclosed) {
      const inEpoch = parseISTEpoch(log.date, log.checkIn);
      if (!inEpoch) continue;

      const elapsedHours = (nowEpoch - inEpoch) / (1000 * 60 * 60);

      // Auto check-out if more than 9 hours passed since check-in
      if (elapsedHours >= 9.0) {
        const outEpoch = inEpoch + (8 * 60 * 60 * 1000);
        // FIX: Add IST offset before reading UTC fields so result is in IST, not UTC
        const outDtIST = new Date(outEpoch + IST_OFFSET_MS);
        const checkOut = `${String(outDtIST.getUTCHours()).padStart(2, '0')}:${String(outDtIST.getUTCMinutes()).padStart(2, '0')}`;
        const hoursWorked = 8.0;
        const status = determineShiftStatus(log.checkIn, hoursWorked);

        await prisma.attendance.update({
          where: { id: log.id },
          data: {
            checkOut,
            hoursWorked,
            status
          }
        });
      }
    }
  } catch (err) {
    console.error('[AUTO-CHECKOUT] Error auto-closing shifts:', err);
  }
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
      
      // 1. Fetch all employees in a single query to map punchingCode & employeeId -> Employee in-memory
      const dbEmployees = await prisma.employee.findMany();
      const employeeMap = new Map<string, typeof dbEmployees[0]>();
      dbEmployees.forEach(e => {
        if (e.punchingCode) {
          employeeMap.set(e.punchingCode, e);
          employeeMap.set(normalizeBiometricCode(e.punchingCode), e);
        }
        employeeMap.set(e.employeeId, e);
        employeeMap.set(normalizeBiometricCode(e.employeeId), e);
      });
      
      // 2. Parse all punches from the batch
      interface ParsedPunch {
        employee: typeof dbEmployees[0];
        timestamp: Date;
        punchEpoch: number;
        dateStr: string;
        timeStr: string;
      }
      const parsedPunches: ParsedPunch[] = [];

      for (const line of lines) {
        const parts = line.split(/\t/);
        if (parts.length < 2) continue;

        const rawCode = parts[0].trim();
        const timestampStr = parts[1].trim();
        const normCode = normalizeBiometricCode(rawCode);

        const employee = employeeMap.get(normCode) || employeeMap.get(rawCode);
        if (!employee) {
          console.warn(`[ADMS] Punch logged for unknown BiometricUID: ${rawCode}`);
          continue;
        }

        const dt = new Date(timestampStr.replace(' ', 'T'));
        if (isNaN(dt.getTime())) continue;

        const dateStr = `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
        const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        const punchEpoch = parseISTEpoch(dateStr, timeStr) || dt.getTime();

        parsedPunches.push({
          employee,
          timestamp: dt,
          punchEpoch,
          dateStr,
          timeStr
        });
      }

      // 3. Sort punches chronologically by linear epoch timestamp
      parsedPunches.sort((a, b) => a.punchEpoch - b.punchEpoch);

      // 4. Local cache for lastLog of each employee to avoid redundant findFirst queries
      const lastLogCache = new Map<string, any>();
      let insertedCount = 0;

      for (const punch of parsedPunches) {
        const { employee, punchEpoch, dateStr, timeStr } = punch;

        // Retrieve most recent log from cache or database
        let lastLog = lastLogCache.get(employee.employeeId);
        if (lastLog === undefined) {
          lastLog = await prisma.attendance.findFirst({
            where: { employeeId: employee.employeeId },
            orderBy: { id: 'desc' }
          });
          lastLogCache.set(employee.employeeId, lastLog);
        }

        let shouldPair = false;
        let targetLog = lastLog;
        let lastCheckInEpoch = 0;

        if (lastLog) {
          const epoch = parseISTEpoch(lastLog.date, lastLog.checkIn);
          if (epoch) {
            lastCheckInEpoch = epoch;
            const diffHours = (punchEpoch - lastCheckInEpoch) / (1000 * 60 * 60);

            // Pair as checkout if gap is 5 mins to 18 hours.
            // 18h window covers afternoon/evening shift workers (e.g. check-in 15:00, check-out 07:00 next day = 16h).
            if (lastLog.checkOut === '' && diffHours >= 0.083 && diffHours <= 18) {
              shouldPair = true;
            }
            // Double-scanning safeguard: update check-out if same/close shift within 2 hours
            else if (lastLog.checkOut !== '' && diffHours >= 0.083 && diffHours < 2) {
              shouldPair = true;
            }
          }
        }

        if (shouldPair && targetLog) {
          const checkIn = targetLog.checkIn;
          const checkOut = timeStr;
          const hours = Number(((punchEpoch - lastCheckInEpoch) / (1000 * 60 * 60)).toFixed(2));
          const status = determineShiftStatus(checkIn, hours);

          const updatedLog = await prisma.attendance.update({
            where: { id: targetLog.id },
            data: {
              checkOut,
              hoursWorked: hours,
              status
            }
          });
          lastLogCache.set(employee.employeeId, updatedLog);
        } else {
          // Check if an existing record already exists for this date to prevent unique constraint failures
          let existingRecord = null;
          if (lastLog && lastLog.date === dateStr) {
            existingRecord = lastLog;
          } else {
            existingRecord = await prisma.attendance.findUnique({
              where: {
                employeeId_date: {
                  employeeId: employee.employeeId,
                  date: dateStr
                }
              }
            });
          }

          if (existingRecord) {
            const inEpoch = parseISTEpoch(existingRecord.date, existingRecord.checkIn);
            if (inEpoch && punchEpoch > inEpoch) {
              const hours = Number(((punchEpoch - inEpoch) / (1000 * 60 * 60)).toFixed(2));
              const status = determineShiftStatus(existingRecord.checkIn, hours);

              const updatedLog = await prisma.attendance.update({
                where: { id: existingRecord.id },
                data: {
                  checkOut: timeStr,
                  hoursWorked: hours,
                  status
                }
              });
              lastLogCache.set(employee.employeeId, updatedLog);
            }
          } else {
            const checkIn = timeStr;
            const checkOut = '';
            const hours = 0.0;
            const status = determineShiftStatus(checkIn, hours);

            const newLog = await prisma.attendance.create({
              data: {
                employeeId: employee.employeeId,
                date: dateStr,
                checkIn,
                checkOut,
                status,
                hoursWorked: hours
              }
            });
            lastLogCache.set(employee.employeeId, newLog);
          }
        }
        insertedCount++;
      }

      console.log(`[ADMS] Successfully synced ${insertedCount} biometric entries.`);
      res.setHeader('Content-Type', 'text/plain');
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
      const cleanId = String(employeeId).trim();
      const normId = normalizeBiometricCode(cleanId);

      let employee = await prisma.employee.findUnique({
        where: { employeeId: cleanId }
      });

      if (!employee) {
        employee = await prisma.employee.findFirst({
          where: {
            OR: [
              { employeeId: { equals: cleanId, mode: 'insensitive' } },
              { employeeId: normId },
              { punchingCode: { equals: cleanId, mode: 'insensitive' } },
              { punchingCode: normId }
            ]
          }
        });
      }

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
  const rawId = (req.params as any)[0] || '';
  const cleanId = String(rawId).trim();
  const normId = normalizeBiometricCode(cleanId);

  try {
    let employee = await prisma.employee.findUnique({
      where: { employeeId: cleanId },
      select: {
        employeeId: true,
        name: true,
        department: true
      }
    });

    if (!employee) {
      employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { employeeId: { equals: cleanId, mode: 'insensitive' } },
            { employeeId: normId },
            { punchingCode: { equals: cleanId, mode: 'insensitive' } },
            { punchingCode: normId }
          ]
        },
        select: {
          employeeId: true,
          name: true,
          department: true
        }
      });
    }

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

  // Load Basis Employee idle day fallback calculation
  let idleFallbackWages = 0.0;
  let fallbackWorkedDays = 0.0;
  const loaderFallbackRate = employee.deductionPerDay > 0 ? employee.deductionPerDay : (employee.salaryPerDay > 0 ? employee.salaryPerDay : 0.0);
  
  if (isLoadBasis) {
    for (const log of monthLogs) {
      const status = log.status.toUpperCase();
      // Skip if absent
      if (status.includes('ABSENT') || log.hoursWorked <= 0.0) {
        continue;
      }
      // Check if loader was assigned to any job on this date
      const hasJobOnDate = yearJobs.some(ja => ja.jobLog.date === log.date);
      if (!hasJobOnDate) {
        // Idle loader! Give fallback day wage based on employee's stored rate
        const isHalfDay = status.includes('HALF_DAY') || log.hoursWorked < 4.0;
        const dayWage = isHalfDay ? (loaderFallbackRate * 0.5) : loaderFallbackRate;
        idleFallbackWages += dayWage;
        fallbackWorkedDays += isHalfDay ? 0.5 : 1.0;
      }
    }
  }

  const mlwlDeduction = (month === 6 || month === 12) ? 25.0 : 0.0;
  const accountAdvance = employee.accountAdvance;

  if (!isLoadBasis) {
    const rate = employee.salaryPerDay > 0 ? employee.salaryPerDay : (employee.deductionPerDay > 0 ? employee.deductionPerDay : 0.0);
    const workedDays = (presentDays + lateDays) + (halfDays * 0.5);
    const otDays = overtimeDays;

    basicPay = workedDays * rate;
    otPay = otDays * rate;
    grossSalary = basicPay + otPay + jobEarnings;

    basicDa = basicPay;
    hra = 0.0;
    otherAllowance = 0.0;

    // PF calculation disabled as requested
    pfDeduction = 0.0;
    esicDeduction = 0.0;

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
    basicPay = idleFallbackWages;
    otPay = 0.0;
    grossSalary = basicPay + jobEarnings;

    if (grossSalary > 0.0) {
      basicDa = basicPay;
      hra = 0.0;
      otherAllowance = 0.0;

      pfDeduction = 0.0;
      esicDeduction = 0.0;

      if (grossSalary <= 7500.0) {
        ptDeduction = 0.0;
      } else if (grossSalary <= 10000.0) {
        ptDeduction = 175.0;
      } else {
        ptDeduction = 200.0;
      }

      otherDeduction = 500.0; // Canteen flat deduction
    } else {
      basicDa = 0.0;
      hra = 0.0;
      otherAllowance = 0.0;
      pfDeduction = 0.0;
      esicDeduction = 0.0;
      ptDeduction = 0.0;
      otherDeduction = 0.0;
    }

    totalDeductions = pfDeduction + esicDeduction + ptDeduction + otherDeduction + accountAdvance + mlwlDeduction;
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

  // Load Basis Employee idle day fallback calculation
  let idleFallbackWages = 0.0;
  let fallbackWorkedDays = 0.0;
  const loaderFallbackRate = employee.deductionPerDay > 0 ? employee.deductionPerDay : (employee.salaryPerDay > 0 ? employee.salaryPerDay : 0.0);

  if (isLoadBasis) {
    for (const log of monthLogs) {
      const status = log.status.toUpperCase();
      // Skip if absent
      if (status.includes('ABSENT') || log.hoursWorked <= 0.0) {
        continue;
      }
      // Check if loader was assigned to any job on this date
      const hasJobOnDate = yearJobs.some(ja => ja.jobLog.date === log.date);
      if (!hasJobOnDate) {
        // Idle loader! Give fallback day wage based on employee's stored rate
        const isHalfDay = status.includes('HALF_DAY') || log.hoursWorked < 4.0;
        const dayWage = isHalfDay ? (loaderFallbackRate * 0.5) : loaderFallbackRate;
        idleFallbackWages += dayWage;
        fallbackWorkedDays += isHalfDay ? 0.5 : 1.0;
      }
    }
  }

  const mlwlDeduction = (month === 6 || month === 12) ? 25.0 : 0.0;
  const accountAdvance = employee.accountAdvance;

  if (!isLoadBasis) {
    const rate = employee.salaryPerDay > 0 ? employee.salaryPerDay : (employee.deductionPerDay > 0 ? employee.deductionPerDay : 0.0);
    const workedDays = (presentDays + lateDays) + (halfDays * 0.5);
    const otDays = overtimeDays;

    basicPay = workedDays * rate;
    otPay = otDays * rate;
    grossSalary = basicPay + otPay + jobEarnings;

    basicDa = basicPay;
    hra = 0.0;
    otherAllowance = 0.0;

    // PF calculation disabled as requested
    pfDeduction = 0.0;
    esicDeduction = 0.0;

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
    basicPay = idleFallbackWages;
    otPay = 0.0;
    grossSalary = basicPay + jobEarnings;

    if (grossSalary > 0.0) {
      basicDa = basicPay;
      hra = 0.0;
      otherAllowance = 0.0;

      pfDeduction = 0.0;
      esicDeduction = 0.0;

      if (grossSalary <= 7500.0) {
        ptDeduction = 0.0;
      } else if (grossSalary <= 10000.0) {
        ptDeduction = 175.0;
      } else {
        ptDeduction = 200.0;
      }

      otherDeduction = 500.0; // Canteen flat deduction
    } else {
      basicDa = 0.0;
      hra = 0.0;
      otherAllowance = 0.0;
      pfDeduction = 0.0;
      esicDeduction = 0.0;
      ptDeduction = 0.0;
      otherDeduction = 0.0;
    }

    totalDeductions = pfDeduction + esicDeduction + ptDeduction + otherDeduction + accountAdvance + mlwlDeduction;
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

// REST CRUD Routes: Castings specifications
app.get('/api/castings', async (req, res) => {
  try {
    const list = await prisma.casting.findMany({
      orderBy: { code: 'asc' }
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/castings', async (req, res) => {
  const { code, name, weightKg } = req.body;
  if (!code || !name || weightKg == null) {
    return res.status(400).json({ error: 'Code, name, and weightKg are required.' });
  }
  try {
    const record = await prisma.casting.upsert({
      where: { code },
      update: { name, weightKg: parseFloat(weightKg) },
      create: { code, name, weightKg: parseFloat(weightKg) }
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/castings/:code', async (req, res) => {
  const { code } = req.params;
  try {
    await prisma.casting.delete({ where: { code } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// REST CRUD Routes: Job templates standard rates
app.get('/api/job-templates', async (req, res) => {
  try {
    const list = await prisma.jobTemplate.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/job-templates', async (req, res) => {
  const { id, name, rate, unit } = req.body;
  if (!name || rate == null) {
    return res.status(400).json({ error: 'Name and rate are required.' });
  }
  try {
    if (id) {
      const record = await prisma.jobTemplate.update({
        where: { id },
        data: { name, rate: parseFloat(rate), unit }
      });
      return res.json(record);
    } else {
      const record = await prisma.jobTemplate.create({
        data: { name, rate: parseFloat(rate), unit }
      });
      return res.json(record);
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/job-templates/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.jobTemplate.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

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

// REST Route: Get attendance logs (supports filters by employeeId, month, year) - Rollback templates feature
app.get('/api/attendance', async (req, res) => {
  const { employeeId, month, year } = req.query;
  try {
    // Automatically check out any unclosed shifts older than 9 hours
    await autoCheckoutUnclosedShifts();

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

      const normId = normalizeBiometricCode(employeeId);

      // Find employee by employeeId OR punchingCode OR normalized code
      let employee = await prisma.employee.findUnique({
        where: { employeeId }
      });
      if (!employee) {
        employee = await prisma.employee.findFirst({
          where: {
            OR: [
              { employeeId: normId },
              { punchingCode: employeeId },
              { punchingCode: normId }
            ]
          }
        });
      }
      if (!employee) continue;

      const targetEmpId = employee.employeeId;
      const cIn = checkIn || '';
      const cOut = checkOut || '';

      // Use linear epoch calculation if hoursWorked is 0 or missing
      let computedHours = parseFloat(hoursWorked || 0.0);
      if ((!computedHours || computedHours === 0.0) && cIn && cOut) {
        computedHours = calculateHours(cIn, cOut, date);
      }

      const finalStatus = status || determineShiftStatus(cIn, computedHours);

      await prisma.attendance.upsert({
        where: {
          employeeId_date: {
            employeeId: targetEmpId,
            date
          }
        },
        update: {
          checkIn: cIn,
          checkOut: cOut,
          hoursWorked: computedHours,
          status: finalStatus
        },
        create: {
          employeeId: targetEmpId,
          date,
          checkIn: cIn,
          checkOut: cOut,
          hoursWorked: computedHours,
          status: finalStatus
        }
      });
      upsertedCount++;
    }

    res.json({ message: `Successfully synchronized ${upsertedCount} processed attendance records.` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// REST Route: Upload & Process ESSL Attendance Excel report (DailyAttendance_BasicReport.xlsx)
// Supports multi-date reports (e.g. Aug 1-11 DailyAttendance_BasicReport.xlsx)
app.post('/api/attendance/upload-essl-excel', async (req, res) => {
  const { fileBase64, customDate } = req.body;
  if (!fileBase64) {
    return res.status(400).json({ error: 'fileBase64 parameter is required.' });
  }

  try {
    const cleanBase64 = fileBase64.replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ error: 'Uploaded Excel file contains no worksheets.' });
    }

    // Fetch employee master map
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

    // Month map for ESSL date headers like "01-Aug-2026"
    const MM: Record<string, number> = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };

    const parseEsslDate = (raw: string): string | null => {
      const m = raw.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
      return (m && MM[m[2]]) ? `${MM[m[2]]}/${parseInt(m[1])}/${m[3]}` : null;
    };

    const extractTime = (v: any): string => {
      if (!v) return '';
      if (v instanceof Date) {
        const h = v.getHours(), mn = v.getMinutes();
        return (h===0 && mn===0) ? '' : `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
      }
      if (typeof v === 'number') {
        const tm = Math.round(v * 24 * 60);
        if (tm===0) return '';
        return `${String(Math.floor(tm/60)%24).padStart(2,'0')}:${String(tm%60).padStart(2,'0')}`;
      }
      const s = String(v).trim();
      return (/^\d{1,2}:\d{2}/.test(s) && s!=='00:00' && s!=='00:00:00') ? s.slice(0,5) : '';
    };

    // PASS 1: collect all dates found in section headers
    const allDates = new Set<string>();
    for (let r = 1; r <= worksheet.rowCount; r++) {
      if (String(worksheet.getRow(r).getCell(2).value||'').trim() === 'Attendance Date') {
        const p = parseEsslDate(String(worksheet.getRow(r).getCell(5).value||'').trim());
        if (p) allDates.add(p);
      }
    }
    // Fallback for single-day files
    if (allDates.size === 0) {
      const fb = customDate || (() => { const t=new Date(); return `${t.getMonth()+1}/${t.getDate()}/${t.getFullYear()}`; })();
      allDates.add(fb);
    }

    // Pre-fetch all existing records for all detected dates in ONE query
    const existingRecs = await prisma.attendance.findMany({ where: { date: { in: Array.from(allDates) } } });
    const existingMap = new Map(existingRecs.map(a => [`${a.employeeId}_${a.date}`, a]));

    const toCreate: any[] = [];
    const toUpdate: any[] = [];
    let skippedCount = 0;
    let currentDate: string = Array.from(allDates)[0] || (customDate || '');

    // PASS 2: process rows with correct per-section date
    for (let r = 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const c2 = String(row.getCell(2).value||'').trim();

      if (c2 === 'Attendance Date') {
        const p = parseEsslDate(String(row.getCell(5).value||'').trim());
        if (p) currentDate = p;
        continue;
      }
      if (c2 === 'SNo' || c2 === 'S.No') continue;

      const sno = row.getCell(2).value;
      if (!sno || isNaN(Number(sno))) continue;

      const rawCode = String(row.getCell(3).value||'').trim();
      if (!rawCode) continue;

      const employee = employeeMap.get(normalizeBiometricCode(rawCode)) || employeeMap.get(rawCode.toUpperCase());
      if (!employee) { skippedCount++; continue; }

      const cIn  = extractTime(row.getCell(8).value);
      const cOut = extractTime(row.getCell(9).value) || extractTime(row.getCell(10).value);
      const statusStr = String(row.getCell(14).value || row.getCell(13).value || '').trim();
      const hoursWorked = (cIn && cOut) ? calculateHours(cIn, cOut, currentDate) : 0.0;
      let finalStatus = determineShiftStatus(cIn, hoursWorked);
      if (!cIn && (/absent/i.test(statusStr) || statusStr === '')) finalStatus = 'A';

      const item = { employeeId: employee.employeeId, date: currentDate, checkIn: cIn, checkOut: cOut, hoursWorked, status: finalStatus };
      const mapKey = `${employee.employeeId}_${currentDate}`;
      const existing = existingMap.get(mapKey);
      if (existing) {
        toUpdate.push({ id: existing.id, ...item });
      } else {
        toCreate.push(item);
        existingMap.set(mapKey, { id: 'pending' } as any);
      }
    }

    if (toCreate.length > 0) await prisma.attendance.createMany({ data: toCreate, skipDuplicates: true });

    if (toUpdate.length > 0) {
      for (let i = 0; i < toUpdate.length; i += 25) {
        await Promise.all(toUpdate.slice(i, i+25).map(u =>
          prisma.attendance.update({ where: { id: u.id }, data: { checkIn: u.checkIn, checkOut: u.checkOut, hoursWorked: u.hoursWorked, status: u.status } })
        ));
      }
    }

    const datesProcessed = Array.from(allDates).sort();
    res.json({
      success: true,
      importedCount: toCreate.length + toUpdate.length,
      skippedCount,
      datesProcessed,
      message: `Successfully processed ESSL Excel. Updated ${toCreate.length + toUpdate.length} attendance records across ${datesProcessed.length} date(s): ${datesProcessed.join(', ')}.`
    });
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
        OR: [
          { employeeId: { in: employeeIds } },
          { punchingCode: { in: employeeIds } }
        ]
      }
    });

    const loadBasisCrew = crewEmployees.filter(e => e.salaryPerDay === 0.0);
    const dayBasisCrew = crewEmployees.filter(e => e.salaryPerDay > 0.0);

    // Look up attendance logs for these employees on this date to know hours worked
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        employeeId: { in: crewEmployees.map(e => e.employeeId) },
        date: date
      }
    });

    // Map for attendance by employeeId
    const attendanceMap = new Map<string, any>();
    attendanceRecords.forEach(r => {
      attendanceMap.set(r.employeeId, r);
    });

    // Distribute job split earnings among ALL assigned crew members proportionally
    const totalCrewCount = crewEmployees.length;
    const finalSplits = new Map<string, number>();

    if (totalCrewCount > 0 && totalPayout > 0) {
      const idealShare = totalPayout / totalCrewCount;

      const crewInfoList = crewEmployees.map(c => {
        const att = attendanceMap.get(c.employeeId) || attendanceMap.get(c.punchingCode);
        const hours = att ? (att.checkOut !== '' ? att.hoursWorked : 8.0) : 8.0;
        const fraction = Math.min(1.0, hours / 8.0);
        const baseSplit = idealShare * fraction;

        return {
          employeeId: c.employeeId,
          punchingCode: c.punchingCode,
          hours,
          baseSplit,
          isFullTime: hours >= 8.0
        };
      });

      const sumBaseSplits = crewInfoList.reduce((sum, item) => sum + item.baseSplit, 0.0);
      const surplus = Math.max(0.0, totalPayout - sumBaseSplits);
      const fullTimeCrew = crewInfoList.filter(c => c.isFullTime);

      if (fullTimeCrew.length > 0 && surplus > 0) {
        const extraShare = surplus / fullTimeCrew.length;
        for (const c of crewInfoList) {
          const finalVal = c.baseSplit + (c.isFullTime ? extraShare : 0.0);
          finalSplits.set(c.employeeId, finalVal);
          if (c.punchingCode) finalSplits.set(c.punchingCode, finalVal);
        }
      } else if (surplus > 0) {
        const extraShare = surplus / totalCrewCount;
        for (const c of crewInfoList) {
          const finalVal = c.baseSplit + extraShare;
          finalSplits.set(c.employeeId, finalVal);
          if (c.punchingCode) finalSplits.set(c.punchingCode, finalVal);
        }
      } else {
        for (const c of crewInfoList) {
          finalSplits.set(c.employeeId, c.baseSplit);
          if (c.punchingCode) finalSplits.set(c.punchingCode, c.baseSplit);
        }
      }
    } else {
      for (const c of crewEmployees) {
        finalSplits.set(c.employeeId, 0.0);
        if (c.punchingCode) finalSplits.set(c.punchingCode, 0.0);
      }
    }

    // Create Job Log along with employee relations using canonical employeeId
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
          create: crewEmployees.map(emp => {
            return {
              employeeId: emp.employeeId,
              splitEarnings: finalSplits.get(emp.employeeId) || finalSplits.get(emp.punchingCode) || 0.0
            };
          })
        }
      },
      include: {
        employees: {
          include: {
            employee: true
          }
        }
      }
    });

    res.json(jobLog);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// REST Route: Export operations logs as Weekly Calendar Excel
app.get('/api/jobs/export', async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ error: 'Month and Year required' });
  }

  const parsedMonth = parseInt(month as string);
  const parsedYear = parseInt(year as string);

  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Ops Calendar - ${parsedMonth}_${parsedYear}`);

    // Query job logs including employees and nested employee details
    const matchPattern = `${parsedMonth}/`;
    const jobs = await prisma.jobLog.findMany({
      where: {
        date: {
          startsWith: matchPattern
        }
      },
      include: {
        employees: {
          include: {
            employee: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Fetch all attendance logs for the month/year to check for Day-Basis half-day flags
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        date: {
          startsWith: matchPattern
        }
      }
    });

    // Group attendance by employeeId + date for O(1) lookups
    const attendanceMap = new Map<string, any>();
    attendanceRecords.forEach(r => {
      attendanceMap.set(`${r.employeeId}_${r.date}`, r);
    });

    // Filter by year in memory
    const monthJobs = jobs.filter(j => {
      const parts = j.date.split('/');
      return parts.length === 3 && parseInt(parts[2]) === parsedYear;
    });

    // Group jobs by date (e.g., "7/1/2026")
    const jobsByDate: Record<string, any[]> = {};
    monthJobs.forEach(job => {
      if (!jobsByDate[job.date]) {
        jobsByDate[job.date] = [];
      }
      jobsByDate[job.date].push(job);
    });

    // Generate days of the month (e.g., 1 to 31)
    const daysInMonth = new Date(parsedYear, parsedMonth, 0).getDate();
    
    // Config values
    const CARD_WIDTH = 4; // Employee ID, Name, Basis, Wage Share
    const CARD_GAP = 1;   // Spacer column

    // Configure columns for 6 side-by-side days
    // 6 cards * 5 cols/card = 30 columns.
    for (let c = 1; c <= 30; c++) {
      const col = worksheet.getColumn(c);
      const dayColIndex = (c - 1) % (CARD_WIDTH + CARD_GAP);
      if (dayColIndex === CARD_WIDTH) {
        col.width = 3; // Spacer column
      } else if (dayColIndex === 0) {
        col.width = 15; // Employee ID
      } else if (dayColIndex === 1) {
        col.width = 22; // Employee Name
      } else if (dayColIndex === 2) {
        col.width = 14; // Basis / Hours
      } else {
        col.width = 16; // Wage Received
      }
    }

    // Set page title
    worksheet.mergeCells('A1:AC1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `KFIL SOLAPUR - DAILY OPERATIONS ALLOCATION REPORT (${parsedMonth}/${parsedYear})`;
    titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF368A9A' } // Teal-Aqua background
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 40;

    let startRow = 3;
    let maxRowInWeek = 3;

    // Process day-by-day (1 to daysInMonth)
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${parsedMonth}/${d}/${parsedYear}`;
      const dayJobs = jobsByDate[dateStr] || [];

      // Grid index calculations (6 cards per row)
      const weekIndex = Math.floor((d - 1) / 6);
      const dayOfWeek = (d - 1) % 6;
      const startCol = 1 + dayOfWeek * (CARD_WIDTH + CARD_GAP);

      // If starting a new week block, move the startRow down
      if (dayOfWeek === 0 && d > 1) {
        startRow = maxRowInWeek + 3; // Leave 2 blank rows
        maxRowInWeek = startRow;
      }

      let currentRow = startRow;

      // Draw Date Header (Merged)
      worksheet.mergeCells(currentRow, startCol, currentRow, startCol + CARD_WIDTH - 1);
      const headerCell = worksheet.getCell(currentRow, startCol);
      headerCell.value = `DATE: ${dateStr}`;
      headerCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      headerCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF57C00' } // Bright Bauxite Amber
      };
      headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let c = 0; c < CARD_WIDTH; c++) {
        worksheet.getCell(currentRow, startCol + c).border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      }
      worksheet.getRow(currentRow).height = 25;
      currentRow++;

      // Placeholder if no jobs
      if (dayJobs.length === 0) {
        worksheet.mergeCells(currentRow, startCol, currentRow + 2, startCol + CARD_WIDTH - 1);
        const emptyCell = worksheet.getCell(currentRow, startCol);
        emptyCell.value = 'No operations logged.';
        emptyCell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
        emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
        emptyCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
        
        currentRow += 3;

        // Apply thin black outer border outline around empty card
        const boxStartRow = startRow;
        const boxEndRow = currentRow - 1;
        for (let r = boxStartRow; r <= boxEndRow; r++) {
          for (let c = 0; c < CARD_WIDTH; c++) {
            worksheet.getCell(r, startCol + c).border = {
              left: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } },
              top: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
        }

        if (currentRow > maxRowInWeek) {
          maxRowInWeek = currentRow;
        }
        continue;
      }

      // Track identical job counters for suffixing
      const jobCounts: Record<string, number> = {};
      const jobNameCounters: Record<string, number> = {};
      
      dayJobs.forEach(job => {
        jobCounts[job.jobName] = (jobCounts[job.jobName] || 0) + 1;
      });

      // Render job sections
      for (let jIdx = 0; jIdx < dayJobs.length; jIdx++) {
        const job = dayJobs[jIdx];
        let displayJobName = job.jobName;
        if (jobCounts[job.jobName] > 1) {
          const currentCount = (jobNameCounters[job.jobName] || 0) + 1;
          jobNameCounters[job.jobName] = currentCount;
          displayJobName = `${job.jobName} - ${currentCount}`;
        }

        // Job Title Banner (Merged)
        worksheet.mergeCells(currentRow, startCol, currentRow, startCol + CARD_WIDTH - 1);
        const jobTitleCell = worksheet.getCell(currentRow, startCol);
        
        const castingMeta = job.castingName ? ` (${job.castingName})` : '';
        const qtyFormatted = job.unit === 'Tons' ? `${job.totalTons.toFixed(2)} Tons` : `${job.totalTons} Pcs`;
        jobTitleCell.value = `🔨 ${displayJobName}${castingMeta}\n  ${qtyFormatted} @ ₹${job.ratePerTon}/${job.unit === 'Tons' ? 'Ton' : 'Pc'} (Total: ₹${(job.totalTons * job.ratePerTon).toLocaleString('en-IN')})`;
        
        jobTitleCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF4E342E' } };
        jobTitleCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEFEBE9' } // Gentle Warm Gray background
        };
        jobTitleCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        for (let c = 0; c < CARD_WIDTH; c++) {
          worksheet.getCell(currentRow, startCol + c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        worksheet.getRow(currentRow).height = 32;
        currentRow++;

        // Subheaders
        const colHeaders = ['Emp ID', 'Worker Name', 'Basis', 'Wage Paid'];
        for (let c = 0; c < CARD_WIDTH; c++) {
          const cell = worksheet.getCell(currentRow, startCol + c);
          cell.value = colHeaders[c];
          cell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: 'FF5D4037' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF3E0' } // Pale amber/orange
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        worksheet.getRow(currentRow).height = 18;
        currentRow++;

        // Crew Payout details
        for (let e = 0; e < job.employees.length; e++) {
          const rel = job.employees[e];
          const empObj = rel.employee;
          const isLoad = empObj.salaryPerDay === 0.0;
          const isLastRow = e === job.employees.length - 1;

          // Col 0: ID
          const cellId = worksheet.getCell(currentRow, startCol);
          cellId.value = empObj.employeeId;
          cellId.font = { name: 'Segoe UI', size: 8.5, color: { argb: 'FF475569' } };
          
          // Col 1: Name
          const cellName = worksheet.getCell(currentRow, startCol + 1);
          cellName.value = empObj.name;
          cellName.font = { name: 'Segoe UI', size: 8.5, color: { argb: 'FF1E293B' } };
          
          // Col 2: Basis
          const cellBasis = worksheet.getCell(currentRow, startCol + 2);
          cellBasis.value = isLoad ? 'Load Basis' : 'Day Basis';
          cellBasis.font = { name: 'Segoe UI', size: 8, color: { argb: 'FF64748B' } };
          
          // Col 3: Split Earnings
          const cellWage = worksheet.getCell(currentRow, startCol + 3);
          if (isLoad) {
            cellWage.value = rel.splitEarnings;
            cellWage.numFormat = '₹#,##0.00';
            cellWage.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: 'FFE65100' } };
          } else {
            const baseRate = empObj.salaryPerDay > 0 ? empObj.salaryPerDay : (empObj.deductionPerDay > 0 ? empObj.deductionPerDay : 0.0);
            const att = attendanceMap.get(`${empObj.employeeId}_${job.date}`);
            const isHalfDay = att ? (att.status === 'HALF_DAY' || att.hoursWorked < 4.0) : false;
            const finalWage = isHalfDay ? (baseRate * 0.5) : baseRate;

            cellWage.value = finalWage;
            cellWage.numFormat = '₹#,##0.00';
            cellWage.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: 'FF475569' } };
          }

          const rowBg = e % 2 === 0 ? 'FFFFFFFF' : 'FFFDFEFE';
          for (let c = 0; c < CARD_WIDTH; c++) {
            const cell = worksheet.getCell(currentRow, startCol + c);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: rowBg }
            };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
          worksheet.getRow(currentRow).height = 20;
          currentRow++;
        }

      }

      if (currentRow > maxRowInWeek) {
        maxRowInWeek = currentRow;
      }
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Operations_Report_${parsedMonth}_${parsedYear}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    // Automatically check out unclosed shifts older than 9 hours
    await autoCheckoutUnclosedShifts();

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
      const formattedStatus = determineShiftStatus(log.checkIn, log.hoursWorked) || log.status;
      worksheet.addRow({
        date: log.date,
        employeeId: log.employeeId,
        name: log.employee.name,
        dept: log.employee.department,
        checkIn: log.checkIn || '-',
        checkOut: log.checkOut || '-',
        hours: log.hoursWorked,
        status: formattedStatus
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
// REST Route: Export Statutory Wages Register (PF/ESIC) - 10th Sheet Format
app.get('/api/payroll/statutory-report', async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ error: 'Month and Year parameters are required.' });
  }

  const m = parseInt(month as string);
  const y = parseInt(year as string);

  if (isNaN(m) || isNaN(y) || m < 1 || m > 12) {
    return res.status(400).json({ error: 'Invalid month or year.' });
  }

  try {
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthPattern = `${m}/`;
    const yearPattern = `/${y}`;

    // Fetch master employees sorted alphabetically by name
    const employees = await prisma.employee.findMany({
      orderBy: { name: 'asc' }
    });

    // Helper for format-agnostic date parsing
    const parseMonthAndYear = (dateStr: string): { month: number; year: number } | null => {
      if (!dateStr) return null;
      if (dateStr.includes('-')) {
        const p = dateStr.split('-');
        if (p.length === 3) return { month: parseInt(p[1], 10), year: parseInt(p[0], 10) };
      }
      if (dateStr.includes('/')) {
        const p = dateStr.split('/');
        if (p.length === 3) {
          const v0 = parseInt(p[0], 10), v1 = parseInt(p[1], 10), v2 = parseInt(p[2], 10);
          if (v2 > 1000 && v0 >= 1 && v0 <= 12) return { month: v0, year: v2 };
          if (v0 > 1000) return { month: v1, year: v0 };
        }
      }
      return null;
    };

    // Fetch attendance logs
    const attendanceRecords = await prisma.attendance.findMany();

    // Group attendance logs by employeeId and punchingCode
    const attendanceMap = new Map<string, any[]>();
    attendanceRecords.forEach(att => {
      const pInfo = parseMonthAndYear(att.date);
      if (pInfo && pInfo.month === m && pInfo.year === y) {
        const list = attendanceMap.get(att.employeeId) || [];
        list.push(att);
        attendanceMap.set(att.employeeId, list);
      }
    });

    // Fetch supervisor job logs
    const jobs = await prisma.jobLog.findMany({
      include: {
        employees: {
          include: {
            employee: true
          }
        }
      }
    });

    // Group job allocations by employeeId / punchingCode and date
    const jobEmpMap = new Map<string, number>(); // employeeId_date -> splitEarnings
    const empTotalTonnagePayMap = new Map<string, number>(); // employeeId -> total job earnings
    const empJobDatesSet = new Map<string, Set<string>>(); // employeeId -> Set of dates worked on jobs

    jobs.forEach(j => {
      const pInfo = parseMonthAndYear(j.date);
      if (pInfo && pInfo.month === m && pInfo.year === y) {
        j.employees.forEach(je => {
          const keys = Array.from(new Set([
            je.employeeId,
            je.employee ? je.employee.punchingCode : '',
            je.employee ? je.employee.employeeId : ''
          ].filter(Boolean)));

          keys.forEach(k => {
            const key = `${k}_${j.date}`;
            jobEmpMap.set(key, (jobEmpMap.get(key) || 0) + je.splitEarnings);
            empTotalTonnagePayMap.set(k, (empTotalTonnagePayMap.get(k) || 0) + je.splitEarnings);

            const datesSet = empJobDatesSet.get(k) || new Set<string>();
            datesSet.add(j.date);
            empJobDatesSet.set(k, datesSet);
          });
        });
      }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Statutory Wages ${MONTH_NAMES[m - 1] || m} ${y}`);

    // Freeze first 3 rows (Top 3) and first 5 columns (A-E)
    worksheet.views = [{ state: 'frozen', xSplit: 5, ySplit: 3 }];

    // Title Row 1
    worksheet.mergeCells('A1:Y1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `KFIL SOLAPUR Wages Register for the Month of ${MONTH_NAMES[m - 1] || m}-${y}`;
    titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF000000' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    // Super-Header Row 2 (Group Headers)
    worksheet.mergeCells('A2:G2');
    worksheet.getCell('A2').value = 'EMPLOYEE DETAILS';

    worksheet.mergeCells('H2:O2');
    worksheet.getCell('H2').value = 'EARNINGS';

    worksheet.mergeCells('P2:U2');
    worksheet.getCell('P2').value = 'DEDUCTIONS';

    worksheet.mergeCells('V2:Y2');
    worksheet.getCell('V2').value = 'SUMMARY & NET PAY';

    const groupHeaderRow = worksheet.getRow(2);
    groupHeaderRow.height = 25;
    groupHeaderRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Sub-Header Row 3
    worksheet.getRow(3).values = [
      'Sr No',                      // A
      'UAN NO',                     // B
      'ESIC NO',                    // C
      'FULL NAME OF EMPLOYEE',      // D
      'Employee Type',              // E
      'Rate Per\nDay',              // F
      'Total Days\nWorked',         // G
      'BASIC\nPAY',                 // H
      'Tonnage\nPay',               // I
      'Daily Pay\n(Idle)',          // J
      'GROSS WAGES\nPAYABLE',       // K
      'BASIC + DA',                 // L
      'HRA',                        // M
      'OTHER\nALLOWANCE',           // N
      'LEGAL\nGROSS\nWAGES',        // O (3 Lines as requested)
      'PF Deduction\n(12%)',        // P
      'Professional\nTax (PT)',     // Q
      'ESIC\n(0.75%)',              // R
      'Canteen\nCharge',            // S
      'Account\nAdvance',           // T
      'MLWL\n(LWF)',                // U
      'Total\nDeductions',          // V
      'Net\nWages',                 // W
      'Other\nDeduction',           // X
      'FINAL\nPAY'                  // Y
    ];

    const subHeaderRow = worksheet.getRow(3);
    subHeaderRow.height = 36;
    subHeaderRow.eachCell((cell) => {
      cell.font = { color: { argb: 'FF000000' }, bold: true, name: 'Arial', size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    // Number format that hides 0 by formatting 0 as empty string
    const blankZeroFmt = '#,##0.00;-#,##0.00;""';

    let activeDataRowIdx = 4;

    employees.forEach((emp) => {
      const isLoadBasis = emp.salaryPerDay === 0.0;
      const empType = isLoadBasis ? 'Load basis' : 'Day basis';
      const ratePerDay = isLoadBasis ? (emp.deductionPerDay || 0.0) : emp.salaryPerDay;

      // Dual-key lookup for attendance logs
      const empAtt = attendanceMap.get(emp.employeeId) || attendanceMap.get(emp.punchingCode) || [];
      
      let pCount = 0, hdCount = 0, lateCount = 0;
      let idleDailyPay = 0.0;

      // Dual-key lookup for job dates & tonnage earnings (universal for ALL employees)
      const empJobDates = empJobDatesSet.get(emp.employeeId) || empJobDatesSet.get(emp.punchingCode) || new Set<string>();
      const tonnagePay = (empTotalTonnagePayMap.get(emp.employeeId) || empTotalTonnagePayMap.get(emp.punchingCode) || 0.0);

      empAtt.forEach(att => {
        const st = (att.status || '').toUpperCase();
        if (st.includes('PRESENT')) pCount++;
        else if (st.includes('HALF') || (att.hoursWorked > 0 && att.hoursWorked < 4.0)) hdCount++;
        else if (st.includes('LATE')) lateCount++;

        // For Load Basis: Check idle fallback days (present in attendance but no job assigned)
        if (isLoadBasis && !st.includes('ABSENT') && att.hoursWorked > 0) {
          if (!empJobDates.has(att.date)) {
            const isHalfDay = st.includes('HALF') || att.hoursWorked < 4.0;
            const dayWage = isHalfDay ? (ratePerDay * 0.5) : ratePerDay;
            idleDailyPay += dayWage;
          }
        }
      });

      const totalDaysWorked = pCount + lateCount + (hdCount * 0.5);

      // Skip employees who did not work at all and have no tonnage pay in this month
      if (totalDaysWorked === 0 && tonnagePay === 0 && !isLoadBasis) return;

      const r = activeDataRowIdx;
      const advanceDeduction = emp.accountAdvance || 0;
      const mlwlDeduction = (m === 6 || m === 12) ? 25 : 0;

      const row = worksheet.addRow([
        activeDataRowIdx - 3,               // A: Sr No
        emp.uan || '',                      // B: UAN NO
        emp.esic || '',                     // C: ESIC NO
        emp.name,                           // D: FULL NAME
        empType,                            // E: Employee Type
        ratePerDay,                         // F: Rate Per Day
        totalDaysWorked,                    // G: Total Days Worked
        isLoadBasis ? 0 : { formula: `ROUND(G${r}*F${r},0)` }, // H: BASIC PAY
        tonnagePay,                         // I: Tonnage Pay
        idleDailyPay,                       // J: Daily Pay (Idle)
        isLoadBasis ? { formula: `I${r}+J${r}` } : { formula: `H${r}+I${r}` }, // K: GROSS WAGES
        { formula: `ROUND(G${r}*550,0)` }, // L: BASIC + DA (Worked Days * 550)
        { formula: `ROUND(L${r}*0.05,0)` }, // M: HRA
        { formula: `MAX(0, K${r}-L${r}-M${r})` }, // N: OTHER ALLOWANCE
        { formula: `L${r}+M${r}+N${r}` },   // O: LEGAL GROSS WAGES
        { formula: `ROUND(L${r}*0.12,0)` }, // P: PF (12%)
        { formula: `IF(K${r}>10000, 200, IF(K${r}>7500, 175, 0))` }, // Q: PT
        { formula: `ROUND(O${r}*0.0075,0)` }, // R: ESIC (0.75%)
        { formula: `IF(K${r}>0, 500, 0)` }, // S: Canteen
        advanceDeduction,                   // T: Account Advance
        mlwlDeduction,                      // U: MLWL
        { formula: `P${r}+Q${r}+R${r}+S${r}+T${r}+U${r}` }, // V: Total Deductions
        { formula: `MAX(0, O${r}-V${r})` }, // W: Net Wages
        { formula: `IF(W${r}>0, 500, 0)` }, // X: Other Deduction
        { formula: `MAX(0, W${r}-X${r})` }  // Y: FINAL PAY
      ]);

      // Format currency cells with zero-hiding number format
      [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].forEach((colIdx) => {
        const cell = row.getCell(colIdx);
        cell.numFmt = blankZeroFmt;
      });

      activeDataRowIdx++;
    });

    const lastDataRow = activeDataRowIdx - 1;
    const totRowIdx = activeDataRowIdx;

    // Summary Row with Excel SUM Formulas
    const summaryRow = worksheet.addRow([
      'TOTAL', '', '', '', '', '', '',
      { formula: `SUM(H4:H${lastDataRow})` },
      { formula: `SUM(I4:I${lastDataRow})` },
      { formula: `SUM(J4:J${lastDataRow})` },
      { formula: `SUM(K4:K${lastDataRow})` },
      { formula: `SUM(L4:L${lastDataRow})` },
      { formula: `SUM(M4:M${lastDataRow})` },
      { formula: `SUM(N4:N${lastDataRow})` },
      { formula: `SUM(O4:O${lastDataRow})` },
      { formula: `SUM(P4:P${lastDataRow})` },
      { formula: `SUM(Q4:Q${lastDataRow})` },
      { formula: `SUM(R4:R${lastDataRow})` },
      { formula: `SUM(S4:S${lastDataRow})` },
      { formula: `SUM(T4:T${lastDataRow})` },
      { formula: `SUM(U4:U${lastDataRow})` },
      { formula: `SUM(V4:V${lastDataRow})` },
      { formula: `SUM(W4:W${lastDataRow})` },
      { formula: `SUM(X4:X${lastDataRow})` },
      { formula: `SUM(Y4:Y${lastDataRow})` }
    ]);
    summaryRow.font = { bold: true, name: 'Arial', size: 10 };
    summaryRow.height = 24;
    summaryRow.eachCell((cell) => {
      cell.numFmt = blankZeroFmt;
    });

    // Employer Contribution Summaries with Live Formulas
    const empPfRow = worksheet.addRow(['EMPLOYER PF CONTRIBUTION (13%)', '', '', '', '', '', '', '', '', '', '', { formula: `ROUND(L${totRowIdx}*0.13,0)` }]);
    empPfRow.font = { bold: true, color: { argb: 'FF000000' } };
    empPfRow.getCell(12).numFmt = blankZeroFmt;

    const empEsicRow = worksheet.addRow(['EMPLOYER ESIC CONTRIBUTION (3.75%)', '', '', '', '', '', '', '', '', '', '', { formula: `ROUND(O${totRowIdx}*0.0375,0)` }]);
    empEsicRow.font = { bold: true, color: { argb: 'FF000000' } };
    empEsicRow.getCell(12).numFmt = blankZeroFmt;

    // Apply crisp black borders around every cell
    for (let r = 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      for (let c = 1; c <= 25; c++) {
        const cell = row.getCell(c);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      }
    }

    // Set Column Widths to fit headers & content comfortably
    const colWidths = [
      8,  // A: Sr No
      16, // B: UAN NO
      14, // C: ESIC NO
      28, // D: FULL NAME
      14, // E: Employee Type
      12, // F: Rate Per Day
      12, // G: Total Days Worked
      14, // H: BASIC PAY
      14, // I: Tonnage Pay
      14, // J: Daily Pay (Idle)
      16, // K: GROSS WAGES PAYABLE
      14, // L: BASIC + DA
      12, // M: HRA
      14, // N: OTHER ALLOWANCE
      14, // O: LEGAL GROSS WAGES
      14, // P: PF Deduction (12%)
      14, // Q: Professional Tax (PT)
      12, // R: ESIC (0.75%)
      12, // S: Canteen Charge
      14, // T: Account Advance
      12, // U: MLWL (LWF)
      14, // V: Total Deductions
      14, // W: Net Wages
      14, // X: Other Deduction
      14  // Y: FINAL PAY
    ];

    colWidths.forEach((w, idx) => {
      worksheet.getColumn(idx + 1).width = w;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Statutory_Wages_Register_${m}_${y}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Helper: Convert 1-based column index to Excel column string (1='A', 2='B', 27='AA', etc.)
function getExcelColLetter(colIdx: number): string {
  let temp = 0;
  let letter = '';
  while (colIdx > 0) {
    temp = (colIdx - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colIdx = Math.floor((colIdx - temp - 1) / 26);
  }
  return letter;
}

// REST Route: Export Salary Report (Salary_Report.xlsx format)
app.get('/api/payroll/salary-report', async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ error: 'Month and Year parameters are required.' });
  }

  const m = parseInt(month as string);
  const y = parseInt(year as string);

  if (isNaN(m) || isNaN(y) || m < 1 || m > 12) {
    return res.status(400).json({ error: 'Invalid month or year.' });
  }

  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`MAIN TONNAGE (${m})`);
    worksheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 2 }];

    const daysInMonth = new Date(y, m, 0).getDate();
    const yearPattern = `/${y}`;

    // Fetch Job Logs, Attendance, Employees for selected year
    const jobs = await prisma.jobLog.findMany({
      where: { date: { endsWith: yearPattern } },
      include: { employees: { include: { employee: true } } }
    });

    const attendanceRecords = await prisma.attendance.findMany({
      where: { date: { endsWith: yearPattern } }
    });

    const allEmployees = await prisma.employee.findMany({
      select: {
        employeeId: true,
        name: true,
        punchingCode: true,
        salaryPerDay: true,
        department: true
      }
    });

    // Map attendance records by employeeId + date for exact month & year
    const attMap = new Map<string, any>();
    attendanceRecords.forEach(att => {
      const parts = att.date.split('/');
      if (parts.length === 3 && parseInt(parts[0]) === m && parseInt(parts[2]) === y) {
        attMap.set(`${att.employeeId}_${att.date}`, att);
      }
    });

    // Filter jobs for exact month & year
    const monthJobs = jobs.filter(j => {
      const parts = j.date.split('/');
      return parts.length === 3 && parseInt(parts[0]) === m && parseInt(parts[2]) === y;
    });

    // Determine shift for employee on date
    const getEmployeeShift = (empId: string, dateStr: string): string => {
      const att = attMap.get(`${empId}_${dateStr}`);
      if (!att || !att.checkIn || att.checkIn === '00:00' || att.checkIn === '00:00:00' || att.status === 'A') return 'Shift A';
      const parts = att.checkIn.split(':').map(Number);
      if (parts.length < 2) return 'Shift A';
      const hour = parts[0];
      if (hour >= 13 && hour <= 18) return 'Shift B';
      return 'Shift A';
    };

    // Column Index Mapping
    const startDayCol = 4;
    const endDayCol = 3 + daysInMonth;
    const totalColIdx = 4 + daysInMonth;
    const countColIdx = 5 + daysInMonth;

    const startDayColLetter = getExcelColLetter(startDayCol);
    const endDayColLetter = getExcelColLetter(endDayCol);
    const totalColLetter = getExcelColLetter(totalColIdx);

    // Set Column Widths
    worksheet.getColumn(1).width = 16; // PF NO.
    worksheet.getColumn(2).width = 16; // Punching Code
    worksheet.getColumn(3).width = 34; // Day / Name

    for (let d = 1; d <= daysInMonth; d++) {
      worksheet.getColumn(startDayCol + d - 1).width = 9;
    }
    worksheet.getColumn(totalColIdx).width = 14;
    worksheet.getColumn(countColIdx).width = 10;

    // Row 1: Month Date
    const row1 = worksheet.getRow(1);
    row1.getCell(2).value = new Date(y, m - 1, 1);

    // Row 2: Header Row
    const row2 = worksheet.getRow(2);
    row2.height = 26;
    row2.getCell(1).value = 'PF NO.';
    row2.getCell(2).value = 'Punching Code';
    row2.getCell(3).value = 'Day';

    for (let d = 1; d <= daysInMonth; d++) {
      row2.getCell(startDayCol + d - 1).value = d;
    }
    row2.getCell(totalColIdx).value = 'Total';
    row2.getCell(countColIdx).value = 'COUNT';

    // Style Header Row 2
    row2.eachCell((cell: any) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' } // Dark Slate 800
      };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF475569' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } }
      };
    });

    const teamRates: Record<string, number> = {
      'Final Team A': 220,
      'Final Team B': 220,
      'HE Team A': 320,
      'HE Team B': 320,
      'MP Team': 320
    };

    const teamStyles: Record<string, { fill: string; text: string }> = {
      'Final Team A': { fill: 'FF1E3A8A', text: 'FFFFFFFF' }, // Navy Blue
      'Final Team B': { fill: 'FF0F172A', text: 'FFFFFFFF' }, // Dark Slate
      'HE Team A':    { fill: 'FF065F46', text: 'FFFFFFFF' }, // Forest Emerald
      'HE Team B':    { fill: 'FF115E59', text: 'FFFFFFFF' }, // Dark Cyan
      'MP Team':      { fill: 'FF78350F', text: 'FFFFFFFF' }  // Bronze Amber
    };

    const teamDailyMT: Record<string, number[]> = {
      'Final Team A': new Array(daysInMonth + 1).fill(0),
      'Final Team B': new Array(daysInMonth + 1).fill(0),
      'HE Team A': new Array(daysInMonth + 1).fill(0),
      'HE Team B': new Array(daysInMonth + 1).fill(0),
      'MP Team': new Array(daysInMonth + 1).fill(0)
    };

    // Load-basis employees map: empId -> { emp, daily: (number|null)[] }
    const teamEmployees: Record<string, Map<string, { emp: any; daily: (number | null)[] }>> = {
      'Final Team A': new Map(),
      'Final Team B': new Map(),
      'HE Team A': new Map(),
      'HE Team B': new Map(),
      'MP Team': new Map()
    };

    // Day-basis employees NEW map: empId -> { emp, allocatedDays: boolean[], bonus: number[] }
    const teamNewEmployees: Record<string, Map<string, { emp: any; allocatedDays: boolean[]; bonus: number[] }>> = {
      'Final Team A': new Map(),
      'Final Team B': new Map(),
      'HE Team A': new Map(),
      'HE Team B': new Map(),
      'MP Team': new Map()
    };

    // Pre-populate MP Team list as per specification for inactive MP section
    const mpEmployeeNames = [
      'Mr. DEEPAK PAL',
      'SATYAM PATEL',
      'HARIOM THAKUR',
      'SURAJ THAKUR',
      'SHAKRAM GOUND',
      'ANKIT KUSHWAHA',
      'BHUPENDER PATEL',
      'NARENDRA PALEL',
      'DEVENDRA YADAV'
    ];

    mpEmployeeNames.forEach((name, idx) => {
      const foundEmp = allEmployees.find(e => e.name.toLowerCase() === name.toLowerCase()) || {
        employeeId: `MP_${idx + 1}`,
        name: name,
        punchingCode: '',
        salaryPerDay: 0,
        department: 'MP'
      };
      teamEmployees['MP Team'].set(foundEmp.employeeId, {
        emp: foundEmp,
        daily: new Array(daysInMonth + 1).fill(null)
      });
    });

    // Populate Job Logs into teams ONLY for employees with actual job history in this month!
    monthJobs.forEach(job => {
      const parts = job.date.split('/');
      const day = parseInt(parts[1]);
      if (day < 1 || day > daysInMonth) return;

      const isFinalJob = job.jobName.toLowerCase().includes('final');

      job.employees.forEach(je => {
        const emp = je.employee;
        const shift = getEmployeeShift(emp.employeeId, job.date);

        let targetTeam = '';
        if (isFinalJob) {
          targetTeam = shift === 'Shift B' ? 'Final Team B' : 'Final Team A';
        } else {
          targetTeam = shift === 'Shift B' ? 'HE Team B' : 'HE Team A';
        }

        teamDailyMT[targetTeam][day] += job.totalTons || 0;

        if (emp.salaryPerDay > 0) {
          // Day-basis employee added to load job -> Create individual NEW row for this employee
          if (!teamNewEmployees[targetTeam].has(emp.employeeId)) {
            teamNewEmployees[targetTeam].set(emp.employeeId, {
              emp,
              allocatedDays: new Array(daysInMonth + 1).fill(false),
              bonus: new Array(daysInMonth + 1).fill(0)
            });
          }
          const newRecord = teamNewEmployees[targetTeam].get(emp.employeeId)!;
          newRecord.allocatedDays[day] = true;
          newRecord.bonus[day] += je.splitEarnings || 0;
        } else {
          // Load-basis employee -> regular row under team
          if (!teamEmployees[targetTeam].has(emp.employeeId)) {
            teamEmployees[targetTeam].set(emp.employeeId, {
              emp,
              daily: new Array(daysInMonth + 1).fill(null)
            });
          }
          const empRecord = teamEmployees[targetTeam].get(emp.employeeId)!;
          empRecord.daily[day] = (empRecord.daily[day] || 0) + (je.splitEarnings || 0);
        }
      });
    });

    let currRow = 3;
    const teamRowReferences: Record<string, {
      headerRow: number;
      amtRow: number;
      mtRow: number;
      rateRow: number;
      manpowerRow: number;
      paidAmtRow: number;
      empStartRow: number;
      empEndRow: number;
      newStartRow: number;
      newEndRow: number;
      totalRow: number;
    }> = {};

    const teamsList = [
      { key: 'Final Team A', label: 'FINAL TEAM A' },
      { key: 'Final Team B', label: 'FINAL TEAM B' },
      { key: 'HE Team A', label: 'HE TEAM A' },
      { key: 'HE Team B', label: 'HE TEAM B' },
      { key: 'MP Team', label: 'MP' }
    ];

    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };

    teamsList.forEach((teamInfo, tIdx) => {
      const tKey = teamInfo.key;
      const tLabel = teamInfo.label;
      const rateVal = teamRates[tKey];
      const tStyle = teamStyles[tKey];

      // 1. Header Row / Diff Row
      const hRow = currRow;
      const rHeader = worksheet.getRow(hRow);
      rHeader.height = 24;
      rHeader.getCell(3).value = tLabel;

      if (tIdx > 0) {
        const prevTeamKey = teamsList[tIdx - 1].key;
        const prevRefs = teamRowReferences[prevTeamKey];
        if (prevRefs) {
          for (let d = 1; d <= daysInMonth; d++) {
            const colL = getExcelColLetter(startDayCol + d - 1);
            rHeader.getCell(startDayCol + d - 1).value = { formula: `IFERROR(${colL}${prevRefs.totalRow}-${colL}${prevRefs.amtRow}, 0)` };
          }
          rHeader.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${hRow}:${endDayColLetter}${hRow})` };
        }
      } else {
        for (let d = 1; d <= daysInMonth; d++) {
          rHeader.getCell(startDayCol + d - 1).value = d;
        }
        rHeader.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${hRow}:${endDayColLetter}${hRow})` };
      }

      // Style Header Row
      rHeader.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tStyle.fill } };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: tStyle.text } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = thinBorder;
      });
      rHeader.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
      currRow++;

      // 2. TOTAL AMOUNT Row
      const amtRow = currRow;
      const rAmt = worksheet.getRow(amtRow);
      rAmt.height = 20;
      rAmt.getCell(3).value = 'TOTAL AMOUNT';

      // 3. TOTAL MT Row
      const mtRow = currRow + 1;
      const rMT = worksheet.getRow(mtRow);
      rMT.height = 20;
      rMT.getCell(3).value = 'TOTAL MT';

      // 4. Rate Row
      const rateRow = currRow + 2;
      const rRate = worksheet.getRow(rateRow);
      rRate.height = 20;
      rRate.getCell(3).value = 'Rate';

      // 5. No.of Manpawar Row
      const manpowerRow = currRow + 3;
      const rManpower = worksheet.getRow(manpowerRow);
      rManpower.height = 20;
      rManpower.getCell(3).value = 'No.of Manpawar';

      // 6. Paid Amount Row
      const paidAmtRow = currRow + 4;
      const rPaidAmt = worksheet.getRow(paidAmtRow);
      rPaidAmt.height = 20;
      rPaidAmt.getCell(3).value = 'Paid Amount';

      for (let d = 1; d <= daysInMonth; d++) {
        const colL = getExcelColLetter(startDayCol + d - 1);
        const mtVal = teamDailyMT[tKey][d];
        if (tKey !== 'MP Team' && mtVal > 0) {
          rMT.getCell(startDayCol + d - 1).value = mtVal;
        }

        rRate.getCell(startDayCol + d - 1).value = rateVal;
        rAmt.getCell(startDayCol + d - 1).value = { formula: `${colL}${rateRow}*${colL}${mtRow}` };

        let mpCount = 0;
        teamEmployees[tKey].forEach(eData => {
          if (eData.daily[d] !== null && eData.daily[d]! > 0) mpCount++;
        });
        teamNewEmployees[tKey].forEach(nData => {
          if (nData.allocatedDays[d]) mpCount++;
        });

        if (mpCount > 0) {
          rManpower.getCell(startDayCol + d - 1).value = mpCount;
        }

        rPaidAmt.getCell(startDayCol + d - 1).value = { formula: `IFERROR(${colL}${amtRow}/${colL}${manpowerRow}, 0)` };
      }

      rAmt.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${amtRow}:${endDayColLetter}${amtRow})` };
      rMT.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${mtRow}:${endDayColLetter}${mtRow})` };
      rRate.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${rateRow}:${endDayColLetter}${rateRow})` };
      rManpower.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${manpowerRow}:${endDayColLetter}${manpowerRow})` };
      rPaidAmt.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${paidAmtRow}:${endDayColLetter}${paidAmtRow})` };

      // Style Rows 2 to 6
      rAmt.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; // Light blue fill
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.border = thinBorder;
        cell.numFmt = '#,##0.00';
      });
      rAmt.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };

      rMT.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF334155' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.border = thinBorder;
        cell.numFmt = '#,##0.000';
      });
      rMT.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };

      rRate.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF475569' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.border = thinBorder;
        cell.numFmt = '#,##0';
      });
      rRate.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };

      rManpower.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF166534' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = thinBorder;
      });
      rManpower.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };

      rPaidAmt.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF047857' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.border = thinBorder;
        cell.numFmt = '#,##0.00';
      });
      rPaidAmt.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };

      currRow += 5;

      // 7. Load-basis Employee Rows (Only employees with logged jobs!)
      const empStartRow = currRow;
      const empList = Array.from(teamEmployees[tKey].values());

      empList.forEach(eData => {
        const rEmp = worksheet.getRow(currRow);
        rEmp.height = 20;
        rEmp.getCell(1).value = '';
        rEmp.getCell(2).value = eData.emp.punchingCode || '';
        rEmp.getCell(3).value = eData.emp.name;

        // Apply styled fills for left 2 columns
        rEmp.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Light slate fill
        rEmp.getCell(1).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF475569' } };
        rEmp.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
        rEmp.getCell(1).border = thinBorder;

        rEmp.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }; // Light indigo fill
        rEmp.getCell(2).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
        rEmp.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
        rEmp.getCell(2).border = thinBorder;

        for (let d = 1; d <= daysInMonth; d++) {
          if (eData.daily[d] !== null) {
            rEmp.getCell(startDayCol + d - 1).value = Math.round(eData.daily[d]!);
          }
        }
        rEmp.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${currRow}:${endDayColLetter}${currRow})` };
        rEmp.getCell(countColIdx).value = { formula: `COUNT(${startDayColLetter}${currRow}:${endDayColLetter}${currRow})` };

        rEmp.eachCell((cell: any, colNumber: number) => {
          if (colNumber > 2) {
            cell.font = { name: 'Segoe UI', size: 10 };
            cell.border = thinBorder;
            if (colNumber === 3) {
              cell.alignment = { vertical: 'middle', horizontal: 'left' };
            } else {
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
              cell.numFmt = '#,##0';
            }
          }
        });

        currRow++;
      });
      const empEndRow = currRow - 1;

      // 8. Day-basis NEW Rows (1 dynamic NEW row for each day-basis employee added!)
      const newStartRow = currRow;
      const newList = Array.from(teamNewEmployees[tKey].values());

      if (newList.length > 0) {
        newList.forEach(nData => {
          const rNew = worksheet.getRow(currRow);
          rNew.height = 20;
          rNew.getCell(1).value = '';
          rNew.getCell(2).value = nData.emp.punchingCode || '';
          rNew.getCell(3).value = `NEW (${nData.emp.name})`;

          // Apply styled fills for left 2 columns
          rNew.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          rNew.getCell(1).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF475569' } };
          rNew.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
          rNew.getCell(1).border = thinBorder;

          rNew.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
          rNew.getCell(2).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
          rNew.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
          rNew.getCell(2).border = thinBorder;

          for (let d = 1; d <= daysInMonth; d++) {
            if (nData.allocatedDays[d]) {
              const dayWage = nData.emp.salaryPerDay || 0;
              const bonus = nData.bonus[d] || 0;
              const totalDaySalary = dayWage + bonus;
              rNew.getCell(startDayCol + d - 1).value = Math.round(totalDaySalary);
            }
          }
          rNew.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${currRow}:${endDayColLetter}${currRow})` };
          rNew.getCell(countColIdx).value = { formula: `COUNT(${startDayColLetter}${currRow}:${endDayColLetter}${currRow})` };

          rNew.eachCell((cell: any, colNumber: number) => {
            if (colNumber > 2) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Light Amber fill for NEW rows
              cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB45309' } };
              cell.border = thinBorder;
              if (colNumber === 3) {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
              } else {
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
                cell.numFmt = '#,##0';
              }
            }
          });

          currRow++;
        });
      } else {
        // Fallback NEW row if no day-basis worker added
        const rNew = worksheet.getRow(currRow);
        rNew.height = 20;
        rNew.getCell(3).value = 'NEW';
        rNew.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${currRow}:${endDayColLetter}${currRow})` };
        rNew.getCell(countColIdx).value = { formula: `COUNT(${startDayColLetter}${currRow}:${endDayColLetter}${currRow})` };

        rNew.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        rNew.getCell(1).border = thinBorder;
        rNew.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
        rNew.getCell(2).border = thinBorder;

        rNew.eachCell((cell: any, colNumber: number) => {
          if (colNumber > 2) {
            cell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF94A3B8' } };
            cell.border = thinBorder;
            if (colNumber === 3) cell.alignment = { vertical: 'middle', horizontal: 'left' };
            else cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }
        });

        currRow++;
      }
      const newEndRow = currRow - 1;

      // 9. Total Row for Team
      const totalRow = currRow;
      const rTotal = worksheet.getRow(totalRow);
      rTotal.height = 24;
      rTotal.getCell(3).value = 'Total';

      const sumFrom = empStartRow <= empEndRow ? empStartRow : newStartRow;
      for (let d = 1; d <= daysInMonth; d++) {
        const colL = getExcelColLetter(startDayCol + d - 1);
        rTotal.getCell(startDayCol + d - 1).value = { formula: `SUM(${colL}${sumFrom}:${colL}${newEndRow})` };
      }
      rTotal.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${totalRow}:${endDayColLetter}${totalRow})` };

      rTotal.eachCell((cell: any, colNumber: number) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; // Dark Slate fill for Total row
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF475569' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FF475569' } },
          right: { style: 'thin', color: { argb: 'FF475569' } }
        };
        if (colNumber === 3) cell.alignment = { vertical: 'middle', horizontal: 'left' };
        else {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0';
        }
      });

      currRow++;

      teamRowReferences[tKey] = {
        headerRow: hRow,
        amtRow,
        mtRow,
        rateRow,
        manpowerRow,
        paidAmtRow,
        empStartRow,
        empEndRow,
        newStartRow,
        newEndRow,
        totalRow
      };

      currRow++; // Spacer row between teams
    });

    // 10. Summary Footer Block
    const refFinalA = teamRowReferences['Final Team A'];
    const refFinalB = teamRowReferences['Final Team B'];
    const refHEA = teamRowReferences['HE Team A'];
    const refHEB = teamRowReferences['HE Team B'];
    const refMP = teamRowReferences['MP Team'];

    const rowFinalAmt = currRow;
    const rFinalAmt = worksheet.getRow(rowFinalAmt);
    rFinalAmt.height = 22;
    rFinalAmt.getCell(3).value = 'Final amount';
    for (let d = 1; d <= daysInMonth; d++) {
      const colL = getExcelColLetter(startDayCol + d - 1);
      rFinalAmt.getCell(startDayCol + d - 1).value = { formula: `${colL}${refFinalA.totalRow}+${colL}${refFinalB.totalRow}` };
    }
    rFinalAmt.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${rowFinalAmt}:${endDayColLetter}${rowFinalAmt})` };

    rFinalAmt.eachCell((cell: any, colNumber: number) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
      cell.border = thinBorder;
      if (colNumber === 3) cell.alignment = { vertical: 'middle', horizontal: 'left' };
      else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0.00';
      }
    });
    currRow++;

    const rowFinalMT = currRow;
    const rFinalMT = worksheet.getRow(rowFinalMT);
    rFinalMT.height = 22;
    rFinalMT.getCell(3).value = 'Final MT';
    for (let d = 1; d <= daysInMonth; d++) {
      const colL = getExcelColLetter(startDayCol + d - 1);
      rFinalMT.getCell(startDayCol + d - 1).value = { formula: `${colL}${refFinalA.mtRow}+${colL}${refFinalB.mtRow}` };
    }
    rFinalMT.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${rowFinalMT}:${endDayColLetter}${rowFinalMT})` };

    rFinalMT.eachCell((cell: any, colNumber: number) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF334155' } };
      cell.border = thinBorder;
      if (colNumber === 3) cell.alignment = { vertical: 'middle', horizontal: 'left' };
      else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0.000';
      }
    });
    currRow++;

    const rowHEAmt = currRow;
    const rHEAmt = worksheet.getRow(rowHEAmt);
    rHEAmt.height = 22;
    rHEAmt.getCell(3).value = 'HE amount';
    for (let d = 1; d <= daysInMonth; d++) {
      const colL = getExcelColLetter(startDayCol + d - 1);
      rHEAmt.getCell(startDayCol + d - 1).value = { formula: `${colL}${refHEA.totalRow}+${colL}${refHEB.totalRow}` };
    }
    rHEAmt.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${rowHEAmt}:${endDayColLetter}${rowHEAmt})` };
    rHEAmt.getCell(countColIdx + 1).value = { formula: `${totalColLetter}${rowFinalMT}*220` };

    rHEAmt.eachCell((cell: any, colNumber: number) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF047857' } };
      cell.border = thinBorder;
      if (colNumber === 3) cell.alignment = { vertical: 'middle', horizontal: 'left' };
      else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0.00';
      }
    });
    currRow++;

    const rowHEMT = currRow;
    const rHEMT = worksheet.getRow(rowHEMT);
    rHEMT.height = 22;
    rHEMT.getCell(3).value = 'HE MT';
    for (let d = 1; d <= daysInMonth; d++) {
      const colL = getExcelColLetter(startDayCol + d - 1);
      rHEMT.getCell(startDayCol + d - 1).value = { formula: `${colL}${refHEA.mtRow}+${colL}${refHEB.mtRow}` };
    }
    rHEMT.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${rowHEMT}:${endDayColLetter}${rowHEMT})` };
    rHEMT.getCell(countColIdx + 1).value = { formula: `${totalColLetter}${rowHEMT}*320` };

    rHEMT.eachCell((cell: any, colNumber: number) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF334155' } };
      cell.border = thinBorder;
      if (colNumber === 3) cell.alignment = { vertical: 'middle', horizontal: 'left' };
      else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0.000';
      }
    });
    currRow++;

    const rowMPAmt = currRow;
    const rMPAmt = worksheet.getRow(rowMPAmt);
    rMPAmt.height = 22;
    rMPAmt.getCell(3).value = 'MP amount';
    for (let d = 1; d <= daysInMonth; d++) {
      const colL = getExcelColLetter(startDayCol + d - 1);
      rMPAmt.getCell(startDayCol + d - 1).value = { formula: `${colL}${refMP.totalRow}` };
    }
    rMPAmt.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${rowMPAmt}:${endDayColLetter}${rowMPAmt})` };

    rMPAmt.eachCell((cell: any, colNumber: number) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB45309' } };
      cell.border = thinBorder;
      if (colNumber === 3) cell.alignment = { vertical: 'middle', horizontal: 'left' };
      else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0.00';
      }
    });
    currRow++;

    const rowMPMT = currRow;
    const rMPMT = worksheet.getRow(rowMPMT);
    rMPMT.height = 22;
    rMPMT.getCell(3).value = 'MP MT';
    for (let d = 1; d <= daysInMonth; d++) {
      const colL = getExcelColLetter(startDayCol + d - 1);
      rMPMT.getCell(startDayCol + d - 1).value = { formula: `${colL}${refMP.mtRow}` };
    }
    rMPMT.getCell(totalColIdx).value = { formula: `SUM(${startDayColLetter}${rowMPMT}:${endDayColLetter}${rowMPMT})` };

    rMPMT.eachCell((cell: any, colNumber: number) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF334155' } };
      cell.border = thinBorder;
      if (colNumber === 3) cell.alignment = { vertical: 'middle', horizontal: 'left' };
      else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0.000';
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Salary_Report_${m}_${y}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating Salary Report:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 KFIL Solapur Backend running at http://localhost:${PORT}`);
});
