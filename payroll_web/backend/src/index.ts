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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
      return end > start ? Number((end - start).toFixed(2)) : 0.0;
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

        // Retrieve existing log for today
        const existingLog = await prisma.attendance.findUnique({
          where: {
            employeeId_date: {
              employeeId: employee.employeeId,
              date: dateStr
            }
          }
        });

        if (existingLog) {
          // Update check-out time (second punch becomes check-out, subsequent ones update check-out)
          const checkIn = existingLog.checkIn;
          const checkOut = timeStr;
          const hours = calculateHours(checkIn, checkOut);

          let status = 'PRESENT';
          if (hours > 9.0) {
            status = 'OVERTIME';
          }

          await prisma.attendance.update({
            where: { id: existingLog.id },
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

          // Simple rule: check-in after 09:15 is LATE
          const [inHour, inMin] = checkIn.split(':').map(Number);
          const isLate = inHour > 9 || (inHour === 9 && inMin > 15);
          const status = isLate ? 'LATE' : 'PRESENT';

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

    let logs = await prisma.attendance.findMany({
      where: filter,
      orderBy: { date: 'asc' }
    });

    if (month || year) {
      logs = logs.filter(log => {
        const parts = log.date.split('/');
        if (parts.length !== 3) return false;
        const m = parseInt(parts[0]);
        const y = parseInt(parts[2]);
        let matches = true;
        if (month) {
          matches = matches && m === parseInt(month as string);
        }
        if (year) {
          matches = matches && y === parseInt(year as string);
        }
        return matches;
      });
    }

    res.json(logs);
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

    let totalDayWagesToDeduct = 0.0;
    for (const de of dayBasisCrew) {
      totalDayWagesToDeduct += de.salaryPerDay > 0 ? de.salaryPerDay : 636.0;
    }

    const remainingPool = totalPayout - totalDayWagesToDeduct;
    const loadSplit = loadBasisCrew.length > 0 && remainingPool > 0
      ? remainingPool / loadBasisCrew.length
      : 0.0;

    // Create Job Log along with employee relations
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
            const isLoad = loadBasisCrew.some(e => e.employeeId === empId);
            return {
              employeeId: empId,
              splitEarnings: isLoad ? loadSplit : 0.0
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

// REST Route: Get all job logs
app.get('/api/jobs', async (req, res) => {
  try {
    const list = await prisma.jobLog.findMany({
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

  try {
    const employees = await prisma.employee.findMany();
    const runs = [];

    for (const emp of employees) {
      const calc = await calculateEmployeeWages(emp.employeeId, month, year, settings);

      const run = await prisma.payrollRun.upsert({
        where: {
          employeeId_month_year: {
            employeeId: emp.employeeId,
            month,
            year
          }
        },
        update: calc,
        create: calc
      });
      runs.push(run);
    }
    res.json({ message: `Successfully computed payroll for ${runs.length} employees.`, data: runs });
  } catch (err) {
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

app.listen(PORT, () => {
  console.log(`🚀 KFIL Solapur Backend running at http://localhost:${PORT}`);
});
