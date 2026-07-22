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
      
      // 1. Fetch all employees in a single query to map punchingCode -> Employee in-memory
      const dbEmployees = await prisma.employee.findMany();
      const employeeMap = new Map(dbEmployees.map(e => [e.punchingCode, e]));
      
      // 2. Parse all punches from the batch
      interface ParsedPunch {
        employee: typeof dbEmployees[0];
        timestamp: Date;
        dateStr: string;
        timeStr: string;
      }
      const parsedPunches: ParsedPunch[] = [];

      for (const line of lines) {
        const parts = line.split(/\t/);
        if (parts.length < 2) continue;

        const punchingCode = parts[0].trim();
        const timestampStr = parts[1].trim();

        const employee = employeeMap.get(punchingCode);
        if (!employee) {
          console.warn(`[ADMS] Punch logged for unknown BiometricUID: ${punchingCode}`);
          continue;
        }

        const dt = new Date(timestampStr.replace(' ', 'T'));
        if (isNaN(dt.getTime())) continue;

        const dateStr = `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
        const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;

        parsedPunches.push({
          employee,
          timestamp: dt,
          dateStr,
          timeStr
        });
      }

      // 3. Sort punches chronologically to ensure pairing logic processes check-ins before check-outs
      parsedPunches.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // 4. Local cache for lastLog of each employee to avoid redundant findFirst queries
      const lastLogCache = new Map<string, any>();
      let insertedCount = 0;

      for (const punch of parsedPunches) {
        const { employee, timestamp, dateStr, timeStr } = punch;

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

        if (lastLog) {
          const lastDateParts = lastLog.date.split('/').map(Number);
          const lastTimeParts = lastLog.checkIn.split(':').map(Number);
          const lastCheckInDate = new Date(lastDateParts[2], lastDateParts[0] - 1, lastDateParts[1], lastTimeParts[0], lastTimeParts[1], 0);

          const diffMs = timestamp.getTime() - lastCheckInDate.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);

          // If last log has no check-out, and the gap is less than 16 hours (and at least 5 minutes), we pair it
          if (lastLog.checkOut === '' && diffHours > 0.083 && diffHours < 16) {
            shouldPair = true;
          }
          // Double-scanning safeguard: update check-out if same/close shift within 2 hours
          else if (lastLog.checkOut !== '' && diffHours > 0.083 && diffHours < 2) {
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
            const [inHour, inMin] = checkIn.split(':').map(Number);
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
          // Check if a record already exists for this date to prevent unique constraint failures
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
            if (existingRecord.checkOut === '') {
              const [inH, inM] = existingRecord.checkIn.split(':').map(Number);
              const [newH, newM] = timeStr.split(':').map(Number);
              const inMin = inH * 60 + inM;
              const newMin = newH * 60 + newM;
              
              if (newMin > inMin) {
                const checkOut = timeStr;
                const hours = calculateHours(existingRecord.checkIn, checkOut);
                
                let status = 'PRESENT';
                if (hours > 0.0 && hours < 4.0) {
                  status = 'HALF_DAY';
                } else if (hours > 9.0) {
                  status = 'OVERTIME';
                } else {
                  if (inH >= 5 && inH <= 11) {
                    const isLate = inH > 7 || (inH === 7 && inM > 0);
                    if (isLate) status = 'LATE';
                  } else if (inH >= 13 && inH <= 18) {
                    const isLate = inH > 15 || (inH === 15 && inM > 0);
                    if (isLate) status = 'LATE';
                  } else if (inH >= 21 || inH <= 2) {
                    const isLate = (inH === 23 && inM > 0) || (inH >= 0 && inH <= 2);
                    if (isLate) status = 'LATE';
                  }
                }

                const updatedLog = await prisma.attendance.update({
                  where: { id: existingRecord.id },
                  data: {
                    checkOut,
                    hoursWorked: hours,
                    status
                  }
                });
                lastLogCache.set(employee.employeeId, updatedLog);
              }
            } else {
              const [outH, outM] = existingRecord.checkOut.split(':').map(Number);
              const [newH, newM] = timeStr.split(':').map(Number);
              const outMin = outH * 60 + outM;
              const newMin = newH * 60 + newM;
              
              if (newMin > outMin) {
                const checkOut = timeStr;
                const hours = calculateHours(existingRecord.checkIn, checkOut);
                
                let status = 'PRESENT';
                if (hours > 0.0 && hours < 4.0) {
                  status = 'HALF_DAY';
                } else if (hours > 9.0) {
                  status = 'OVERTIME';
                } else {
                  const [inH, inM] = existingRecord.checkIn.split(':').map(Number);
                  if (inH >= 5 && inH <= 11) {
                    const isLate = inH > 7 || (inH === 7 && inM > 0);
                    if (isLate) status = 'LATE';
                  } else if (inH >= 13 && inH <= 18) {
                    const isLate = inH > 15 || (inH === 15 && inM > 0);
                    if (isLate) status = 'LATE';
                  } else if (inH >= 21 || inH <= 2) {
                    const isLate = (inH === 23 && inM > 0) || (inH >= 0 && inH <= 2);
                    if (isLate) status = 'LATE';
                  }
                }

                const updatedLog = await prisma.attendance.update({
                  where: { id: existingRecord.id },
                  data: {
                    checkOut,
                    hoursWorked: hours,
                    status
                  }
                });
                lastLogCache.set(employee.employeeId, updatedLog);
              }
            }
          } else {
            const checkIn = timeStr;
            const checkOut = '';
            const hours = 0.0;

            let status = 'PRESENT';
            const [inHour, inMin] = checkIn.split(':').map(Number);
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

  // Load Basis Employee idle day fallback calculation
  let idleFallbackWages = 0.0;
  let fallbackWorkedDays = 0.0;
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
        // Idle loader! Give fallback day wage
        const isHalfDay = status.includes('HALF_DAY') || log.hoursWorked < 4.0;
        const dayWage = isHalfDay ? (636.0 * 0.5) : 636.0;
        idleFallbackWages += dayWage;
        fallbackWorkedDays += isHalfDay ? 0.5 : 1.0;
      }
    }
  }

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
    basicPay = idleFallbackWages;
    otPay = 0.0;
    grossSalary = basicPay + jobEarnings;

    if (basicPay > 0.0) {
      // Calculate benefits/deductions since they received standard basic daily salaries for those idle days
      basicDa = Math.round(fallbackWorkedDays * (15746.0 / 26.0));
      hra = Math.round(basicDa * 0.05);
      otherAllowance = grossSalary - basicDa - hra;
      if (otherAllowance < 0.0) otherAllowance = 0.0;

      pfDeduction = Math.round(basicDa * 0.12);
      esicDeduction = Math.round(grossSalary * 0.0075);

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
        // Idle loader! Give fallback day wage
        const isHalfDay = status.includes('HALF_DAY') || log.hoursWorked < 4.0;
        const dayWage = isHalfDay ? (636.0 * 0.5) : 636.0;
        idleFallbackWages += dayWage;
        fallbackWorkedDays += isHalfDay ? 0.5 : 1.0;
      }
    }
  }

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
    basicPay = idleFallbackWages;
    otPay = 0.0;
    grossSalary = basicPay + jobEarnings;

    if (basicPay > 0.0) {
      // Calculate benefits/deductions since they received standard basic daily salaries for those idle days
      basicDa = Math.round(fallbackWorkedDays * (15746.0 / 26.0));
      hra = Math.round(basicDa * 0.05);
      otherAllowance = grossSalary - basicDa - hra;
      if (otherAllowance < 0.0) otherAllowance = 0.0;

      pfDeduction = Math.round(basicDa * 0.12);
      esicDeduction = Math.round(grossSalary * 0.0075);

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
      const isHalfDay = att ? (att.status === 'HALF_DAY' || (att.checkOut !== '' && att.hoursWorked < 4.0)) : false;
      
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
        const hours = att ? (att.checkOut !== '' ? att.hoursWorked : 8.0) : 8.0; // default to 8.0/full day if not synced/checked out yet
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
            const baseRate = empObj.salaryPerDay > 0 ? empObj.salaryPerDay : 636.0;
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
    const worksheet = workbook.addWorksheet(`MANE TANNAGE (${m})`);
    worksheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 2 }];

    const daysInMonth = new Date(y, m, 0).getDate();
    const matchPattern = `${m}/`;

    // Fetch Job Logs, Attendance, Employees
    const jobs = await prisma.jobLog.findMany({
      where: { date: { startsWith: matchPattern } },
      include: { employees: { include: { employee: true } } }
    });

    const attendanceRecords = await prisma.attendance.findMany({
      where: { date: { startsWith: matchPattern } }
    });

    const allEmployees = await prisma.employee.findMany();

    // Map attendance records by employeeId + date
    const attMap = new Map<string, any>();
    attendanceRecords.forEach(att => {
      attMap.set(`${att.employeeId}_${att.date}`, att);
    });

    // Filter jobs for month & year
    const monthJobs = jobs.filter(j => {
      const parts = j.date.split('/');
      return parts.length === 3 && parseInt(parts[2]) === y;
    });

    // Determine shift for employee on date
    const getEmployeeShift = (empId: string, dateStr: string): string => {
      const att = attMap.get(`${empId}_${dateStr}`);
      if (!att || !att.checkIn) return 'Shift A';
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
