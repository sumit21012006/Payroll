"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  User, Calendar, Printer, LogOut, CheckCircle, AlertCircle, RefreshCw, Landmark, ShieldCheck
} from 'lucide-react';
import { API_URL } from '@/config';

interface Employee {
  employeeId: string;
  name: string;
  department: string;
  uan: string;
  esic: string;
  bankName: string;
  bankAcc: string;
  ifscCode: string;
  mobileNo: string;
  salaryPerDay: number;
}

interface Attendance {
  id: number;
  date: string;
  checkIn: string;
  checkOut: string;
  status: string;
  hoursWorked: number;
}

interface JobLogEmployeeRelation {
  employeeId: string;
  splitEarnings: number;
}

interface JobLog {
  id: string;
  date: string;
  jobName: string;
  totalTons: number;
  ratePerTon: number;
  unit: string;
  employees: JobLogEmployeeRelation[];
}

interface PayrollRun {
  month: number;
  year: number;
  basicPay: number;
  otPay: number;
  basicDa: number;
  hra: number;
  otherAllowance: number;
  pfDeduction: number;
  esicDeduction: number;
  ptDeduction: number;
  otherDeduction: number;
  totalDeductions: number;
  accountAdvance: number;
  mlwlDeduction: number;
  grossSalary: number;
  netSalary: number;
  workedDays: number;
  overtimeHours: number;
  jobEarnings: number;
}

export default function EmployeeDashboard() {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payroll, setPayroll] = useState<PayrollRun | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(5);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const session = localStorage.getItem('employeeSession');
    if (!session) {
      router.push('/login');
      return;
    }
    const emp = JSON.parse(session) as Employee;
    setEmployee(emp);
  }, [router]);

  useEffect(() => {
    if (!employee) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const prRes = await fetch(`${API_URL}/api/payroll/runs?month=${selectedMonth}&year=${selectedYear}`);
        const prData = await prRes.json();
        
        if (Array.isArray(prData)) {
          const matchedPayroll = prData.find(run => run.employeeId === employee.employeeId);
          setPayroll(matchedPayroll || null);
        }

        // Fetch real attendance logs
        const attRes = await fetch(`${API_URL}/api/attendance?employeeId=${encodeURIComponent(employee.employeeId)}&month=${selectedMonth}&year=${selectedYear}`);
        const attData = await attRes.json();
        if (Array.isArray(attData)) {
          setAttendance(attData);
        }

        // Fetch recent jobs logs
        const jobsRes = await fetch(`${API_URL}/api/jobs`);
        const jobsData = await jobsRes.json();
        if (Array.isArray(jobsData)) {
          setJobs(jobsData);
        }

      } catch (err) {
        console.error('Error fetching employee details:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [employee, selectedMonth, selectedYear]);

  const handleLogout = () => {
    localStorage.removeItem('employeeSession');
    router.push('/login');
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculate jobs worked by this employee during selected month
  const workedJobsThisMonth = useMemo(() => {
    if (!employee) return [];
    return jobs.filter(job => {
      const isPart = job.employees && job.employees.some((je: any) => je.employeeId.toLowerCase() === employee.employeeId.toLowerCase());
      const parts = job.date.split('/');
      if (parts.length !== 3) return false;
      const m = parseInt(parts[0]);
      const y = parseInt(parts[2]);
      return isPart && m === selectedMonth && y === selectedYear;
    });
  }, [jobs, employee, selectedMonth, selectedYear]);

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (!employee) return null;

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 flex flex-col font-sans selection:bg-orange-100 selection:text-orange-950 print:bg-white print:text-black">
      
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-xl px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shadow-sm">
            <User className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight font-display text-slate-900 uppercase">Employee Portal</h1>
            <p className="text-[9px] text-orange-600 font-bold uppercase tracking-widest font-mono">KFIL SOLAPUR</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Period Dropdowns */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-mono">
            <Calendar className="w-4 h-4 text-orange-600" />
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent border-none text-slate-800 focus:outline-none cursor-pointer pr-4 font-bold"
            >
              <option value={5}>May 2026</option>
              <option value={6}>June 2026</option>
              <option value={12}>December 2026</option>
            </select>
          </div>

          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50 rounded-xl text-xs font-bold transition-all duration-300 text-slate-500 hover:text-orange-600 shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Payslip</span>
          </button>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all duration-300 text-slate-500 hover:text-rose-600 shadow-sm cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-8 max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-8 print:p-0">
        
        {/* Left / Top: Profile & Payslip Details */}
        <section className="md:col-span-2 space-y-6">
          
          {/* Profile Card */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 relative overflow-hidden shadow-sm hover:border-orange-500/20 transition-all duration-300 print:border-none print:bg-transparent print:p-0 print:rounded-none print:overflow-visible">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-orange-500 print:hidden" />
            
            <h2 className="text-[10px] font-bold text-orange-600 uppercase tracking-widest font-mono mb-4 print:text-black">EMPLOYEE PROFILE</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 font-mono text-xs text-slate-600">
              <div>
                <p className="text-slate-400 uppercase text-[9px] font-bold">Full Name</p>
                <p className="text-sm font-bold mt-1 text-slate-900 print:text-black font-sans">{employee.name}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase text-[9px] font-bold">Employee ID</p>
                <p className="text-sm font-bold mt-1 text-slate-900 print:text-black">{employee.employeeId}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase text-[9px] font-bold">Department</p>
                <p className="text-sm font-bold mt-1 text-slate-900 print:text-black font-sans">{employee.department}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase text-[9px] font-bold">Bank Name</p>
                <p className="text-slate-800 mt-1 print:text-black font-sans">{employee.bankName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase text-[9px] font-bold">Account Number</p>
                <p className="text-slate-800 mt-1 print:text-black">{employee.bankAcc || 'N/A'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase text-[9px] font-bold">IFSC Code</p>
                <p className="text-slate-800 mt-1 print:text-black">{employee.ifscCode || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Load basis jobs logged record section */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 relative overflow-hidden shadow-sm hover:border-orange-500/20 transition-all duration-300 print:hidden">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-orange-500" />
            <h2 className="text-[10px] font-bold text-orange-600 uppercase tracking-widest font-mono mb-4">
              🍇 Loading Jobs History (This Month)
            </h2>
            {workedJobsThisMonth.length === 0 ? (
              <p className="text-xs text-slate-400 italic font-mono">No supervisor loading jobs recorded for this period.</p>
            ) : (
              <div className="space-y-3 font-mono text-xs max-h-60 overflow-y-auto pr-1">
                {workedJobsThisMonth.map(job => {
                  const mySplit = job.employees.find((je: any) => je.employeeId === employee.employeeId)?.splitEarnings || 0.0;
                  return (
                    <div key={job.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-orange-200 transition-colors">
                      <div>
                        <p className="font-bold text-slate-800 font-sans">{job.jobName}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">Date: {job.date} | Tons: {job.totalTons} | Crew: {job.employees.length}</p>
                      </div>
                      <span className="text-emerald-600 font-bold">₹{mySplit.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payslip Panel */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-8 relative overflow-hidden shadow-sm hover:border-orange-500/20 transition-all duration-300 print:border-none print:bg-transparent print:p-0 print:rounded-none print:overflow-visible">
            <h2 className="text-[10px] font-bold text-orange-600 uppercase tracking-widest font-mono mb-6 print:text-black print:text-center print:text-sm print:font-bold">
              WAGES PAYSLIP REGISTER | {MONTH_NAMES[selectedMonth - 1]?.toUpperCase()} {selectedYear}
            </h2>
            
            {isLoading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
                <p className="text-xs font-mono uppercase tracking-widest text-orange-500">Fetching Payslip...</p>
              </div>
            ) : payroll ? (
              <div className="space-y-8 font-mono text-xs text-slate-600">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Earnings Column */}
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-emerald-600 border-b border-slate-200 pb-2 uppercase tracking-widest print:text-black print:border-black/20">EARNINGS</h3>
                    <div className="space-y-2.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">Basic Pay</span>
                        <span className="text-slate-800 print:text-black font-bold">₹{payroll.basicPay.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">Overtime Pay (OT)</span>
                        <span className="text-slate-800 print:text-black font-bold">₹{payroll.otPay.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">BASIC + DA</span>
                        <span className="text-slate-800 print:text-black font-bold">₹{payroll.basicDa.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">HRA Allowance</span>
                        <span className="text-slate-800 print:text-black font-bold">₹{payroll.hra.toFixed(2)}</span>
                      </div>
                      {payroll.jobEarnings > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400 print:text-slate-600">Supervisor Job Splits</span>
                          <span className="text-slate-800 print:text-black font-bold">₹{payroll.jobEarnings.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-100 pt-2 font-bold print:border-black/20">
                        <span className="text-slate-700 print:text-black">Gross Salary</span>
                        <span className="text-slate-900 print:text-black font-bold">₹{payroll.grossSalary.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Deductions Column */}
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-rose-600 border-b border-slate-200 pb-2 uppercase tracking-widest print:text-black print:border-black/20">DEDUCTIONS</h3>
                    <div className="space-y-2.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">Provident Fund (PF - 12%)</span>
                        <span className="text-slate-800 print:text-black font-bold">₹{payroll.pfDeduction.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">State Insurance (ESIC)</span>
                        <span className="text-slate-800 print:text-black font-bold">₹{payroll.esicDeduction.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">Professional Tax (PT)</span>
                        <span className="text-slate-800 print:text-black font-bold">₹{payroll.ptDeduction.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">Canteen Charge</span>
                        <span className="text-slate-800 print:text-black font-bold">₹{payroll.otherDeduction.toFixed(2)}</span>
                      </div>
                      {payroll.accountAdvance > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400 print:text-slate-600">Account Advance</span>
                          <span className="text-slate-800 print:text-black font-bold">₹{payroll.accountAdvance.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-100 pt-2 font-bold print:border-black/20">
                        <span className="text-slate-700 print:text-black">Total Deductions</span>
                        <span className="text-slate-900 print:text-black font-bold">₹{payroll.totalDeductions.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Net Pay Box */}
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl flex items-center justify-between print:border-none print:bg-slate-100">
                  <span className="text-xs font-bold text-slate-500 print:text-black">NET TAKE-HOME WAGES</span>
                  <span className="text-lg font-bold text-orange-600 print:text-black">₹{payroll.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 border border-slate-200 border-dashed rounded-3xl flex flex-col items-center justify-center gap-3">
                <AlertCircle className="w-8 h-8 text-amber-500" />
                <p className="text-sm font-semibold">Wages for the selected pay cycle have not been finalized yet.</p>
              </div>
            )}
          </div>
        </section>

        {/* Right: Attendance Calendar */}
        <section className="print:hidden">
          <AttendanceCalendar 
            employeeId={employee.employeeId}
            attendanceLogs={attendance}
            jobs={jobs}
            month={selectedMonth}
            year={selectedYear}
          />
        </section>

      </main>
    </div>
  );
}

function AttendanceCalendar({ employeeId, attendanceLogs, jobs, month, year }: {
  employeeId: string;
  attendanceLogs: any[];
  jobs: any[];
  month: number;
  year: number;
}) {
  const [selectedDayDetails, setSelectedDayDetails] = useState<any | null>(null);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const totalDays = new Date(year, month, 0).getDate();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const empLogsMap = useMemo(() => {
    const map: { [key: string]: any } = {};
    attendanceLogs
      .filter(log => log.employeeId.toLowerCase() === employeeId.toLowerCase())
      .forEach(log => {
        map[log.date] = log;
      });
    return map;
  }, [attendanceLogs, employeeId]);

  const empJobsMap = useMemo(() => {
    const map: { [key: string]: any[] } = {};
    jobs.forEach(job => {
      const isPart = job.employees && job.employees.some((je: any) => je.employeeId.toLowerCase() === employeeId.toLowerCase());
      if (isPart) {
        map[job.date] = (map[job.date] || []).concat(job);
      }
    });
    return map;
  }, [jobs, employeeId]);

  const daysGrid = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    daysGrid.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    daysGrid.push(d);
  }

  const getJobSplit = (job: any) => {
    const match = job.employees.find((je: any) => je.employeeId.toLowerCase() === employeeId.toLowerCase());
    return match ? match.splitEarnings : 0.0;
  };

  return (
    <div className="space-y-4 border border-slate-200/80 bg-white p-6 rounded-3xl font-mono text-xs relative overflow-hidden shadow-sm hover:border-orange-500/20 transition-all duration-300">
      <div className="absolute top-0 left-0 w-full h-[3px] bg-orange-500" />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200/60 pb-3 mt-1">
        <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest">
          📅 Attendance Grid
        </h4>
        <div className="flex flex-wrap gap-2 text-[8px] font-bold text-slate-400 uppercase tracking-wider">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500 inline-block" />P</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500 inline-block" />L</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-500 inline-block" />OT</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-500 inline-block" />H</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500 inline-block" />A</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center font-bold text-[9px] text-slate-400">
        {weekDays.map(wd => (
          <div key={wd}>{wd}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {daysGrid.map((dayNum, index) => {
          if (dayNum === null) {
            return <div key={`empty-${index}`} />;
          }

          const dateStr = `${month}/${dayNum}/${year}`;
          const dateObj = new Date(year, month - 1, dayNum);
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

          const log = empLogsMap[dateStr];
          const workedJobs = empJobsMap[dateStr] || [];
          const hasJob = workedJobs.length > 0;

          let cellClass = "bg-slate-100/50 text-slate-400 border-slate-100";
          let badgeText = "";
          let textColor = "text-slate-400";

          if (log) {
            const status = log.status.toUpperCase();
            if (status.includes('PRESENT')) {
              cellClass = "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm";
              textColor = "text-emerald-700";
              badgeText = "P";
            } else if (status.includes('LATE')) {
              cellClass = "bg-amber-50 text-amber-700 border-amber-200 shadow-sm";
              textColor = "text-amber-700";
              badgeText = "L";
            } else if (status.includes('OVERTIME')) {
              cellClass = "bg-purple-50 text-purple-700 border-purple-200 shadow-sm";
              textColor = "text-purple-700";
              badgeText = "OT";
            } else if (status.includes('HALF_DAY')) {
              cellClass = "bg-cyan-50 text-cyan-700 border-cyan-200 shadow-sm";
              textColor = "text-cyan-700";
              badgeText = "H";
            }
          } else if (!isWeekend) {
            cellClass = "bg-rose-50 text-rose-700 border-rose-200 shadow-sm";
            textColor = "text-rose-700";
            badgeText = "A";
          } else {
            cellClass = "bg-slate-100/20 text-slate-300 border-slate-100/40";
            textColor = "text-slate-300";
          }

          return (
            <button
              type="button"
              key={`day-${dayNum}`}
              onClick={() => setSelectedDayDetails({ dayNum, log, workedJobs, isWeekend })}
              className={`h-11 border rounded-xl flex flex-col justify-between p-1 text-left relative transition-all hover:scale-105 active:scale-95 cursor-pointer ${cellClass} ${
                hasJob ? 'ring-1 ring-cyan-500/50 border-cyan-400 bg-cyan-50/20' : ''
              }`}
            >
              <span className={`text-[9px] font-bold ${textColor}`}>{dayNum}</span>
              
              <div className="flex items-center justify-between w-full mt-auto">
                <span className="text-[8px] font-extrabold tracking-tighter opacity-80">{badgeText}</span>
                {hasJob && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" title="Load jobs logged" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDayDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-3xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h5 className="font-bold text-slate-950 font-sans">
                Date: {monthNames[month - 1]} {selectedDayDetails.dayNum}, {year}
              </h5>
              <button 
                type="button"
                onClick={() => setSelectedDayDetails(null)} 
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 font-mono text-xs text-slate-600">
              <div className="space-y-2">
                <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Biometric Time Clock</p>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-1.5">
                  <div className="flex justify-between">
                    <span>Status:</span> 
                    <strong className={`font-bold ${
                      selectedDayDetails.log?.status === 'PRESENT' ? 'text-emerald-600' :
                      selectedDayDetails.log?.status === 'LATE' ? 'text-amber-600' :
                      selectedDayDetails.log?.status === 'OVERTIME' ? 'text-purple-600' :
                      selectedDayDetails.log?.status === 'HALF_DAY' ? 'text-cyan-600' :
                      !selectedDayDetails.isWeekend ? 'text-rose-600' : 'text-slate-400'
                    }`}>
                      {selectedDayDetails.log ? selectedDayDetails.log.status : (selectedDayDetails.isWeekend ? 'WEEKEND REST DAY' : 'ABSENT')}
                    </strong>
                  </div>
                  {selectedDayDetails.log && (
                    <>
                      <div className="flex justify-between"><span>Check In:</span> <strong className="text-slate-700">{selectedDayDetails.log.checkIn}</strong></div>
                      <div className="flex justify-between"><span>Check Out:</span> <strong className="text-slate-700">{selectedDayDetails.log.checkOut || 'Active'}</strong></div>
                      <div className="flex justify-between"><span>Hours Worked:</span> <strong className="text-slate-700">{selectedDayDetails.log.hoursWorked.toFixed(2)} hrs</strong></div>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-cyan-600 uppercase tracking-widest">Supervisor Loading Jobs</p>
                {selectedDayDetails.workedJobs.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic bg-slate-50/50 p-2 rounded-xl border border-slate-100">No loading jobs recorded on this day.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedDayDetails.workedJobs.map((job: any) => (
                      <div key={job.id} className="bg-cyan-50/20 border border-cyan-100 p-2.5 rounded-xl space-y-1">
                        <div className="font-bold text-slate-800 font-sans truncate">{job.jobName}</div>
                        <div className="flex justify-between text-[10px]">
                          <span>Tonnage:</span> <span className="text-slate-600">{job.totalTons} {job.unit}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span>Rate per Unit:</span> <span className="text-slate-600">₹{job.ratePerTon}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span>Crew Size:</span> <span className="text-slate-600">{job.employees.length} members</span>
                        </div>
                        <div className="flex justify-between text-[10px] border-t border-cyan-100/60 pt-1 mt-1 font-bold">
                          <span className="text-cyan-700">Split Earnings:</span> 
                          <span className="text-cyan-700">₹{getJobSplit(job).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedDayDetails(null)}
                className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase text-[10px] rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
