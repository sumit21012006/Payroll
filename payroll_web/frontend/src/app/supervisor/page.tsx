"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Plus, LogOut, ClipboardList, RefreshCw, UserCheck, Search, Trash2, Info, Calendar, Check, ChevronLeft, ChevronRight
} from 'lucide-react';
import { API_URL } from '@/config';

interface Employee {
  employeeId: string;
  name: string;
  department: string;
  salaryPerDay: number;
}

interface JobLogEmployee {
  employeeId: string;
  splitEarnings: number;
  employee: Employee;
}

interface JobLog {
  id: string;
  date: string;
  jobName: string;
  totalTons: number;
  ratePerTon: number;
  unit: string;
  castingName: string | null;
  castingQty: number | null;
  employees: JobLogEmployee[];
}

interface CastingInfo {
  code: string;
  name: string;
  weightKg: number;
}

interface SelectedCasting {
  casting: CastingInfo;
  quantity: number;
}

const DEFAULT_JOB_NAMES = [
  'HE Casting - ₹320/Ton',
  'Final Quality Inspection - ₹220/Ton',
  'Rework Sorting - ₹4.90/Piece',
  'Painting Job - ₹6.00/Piece',
  'AVG Inspection - ₹5.00/Piece',
  'Yanmark Line Assembly - ₹28.00/Piece',
  'Other (Write Custom Name)...'
];

const DEFAULT_CASTINGS: CastingInfo[] = [
  { code: '402', name: '4DI BLOCK', weightKg: 83.9 },
  { code: '459', name: 'DHRUV 3DI BLOCK', weightKg: 74.2 },
  { code: '745', name: 'DHRUV 4DI BLOCK', weightKg: 89.5 },
  { code: '4011', name: 'D25 REIMAGINE', weightKg: 86.6 },
  { code: '715', name: 'D25LCV', weightKg: 90.4 },
  { code: '466', name: 'P-15 CYL BLOCK', weightKg: 46.4 },
  { code: '467', name: 'ZD30 UPPER BLK', weightKg: 74.7 },
  { code: '475', name: 'MHWAK REG', weightKg: 69.2 },
  { code: '717', name: 'W109', weightKg: 72.0 },
  { code: '718', name: 'D09 2CB', weightKg: 42.5 },
  { code: '730', name: '3D15', weightKg: 55.6 },
  { code: '731', name: '4D15', weightKg: 62.7 },
  { code: '748', name: 'UPP BLK', weightKg: 53.4 },
  { code: '476', name: '2CB TURBO CHARGER', weightKg: 42.0 },
  { code: '719', name: 'HINO BLOCK', weightKg: 104.1 },
  { code: '732', name: 'YANMAR BLOCK', weightKg: 40.8 },
  { code: '729', name: '3R 1190 CYL BLOCK', weightKg: 106.4 },
  { code: '4029', name: '3R 550 BLOCK', weightKg: 54.9 },
  { code: '4026', name: 'EICHER -483', weightKg: 110.9 },
  { code: '4046', name: 'EICHER TITAN BLOCK', weightKg: 87.0 },
  { code: '495', name: 'EICHER 3CB', weightKg: 80.5 },
  { code: '711', name: 'EICHER 4CB', weightKg: 96.3 },
  { code: '4022', name: 'EICHER 110 HP', weightKg: 110.3 },
  { code: '4068', name: 'ISUZU', weightKg: 73.0 },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function SupervisorDashboard() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('sessionToken');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [recentJobs, setRecentJobs] = useState<JobLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Form Fields
  const [jobId, setJobId] = useState('');
  const [date, setDate] = useState('');
  const [selectedJobName, setSelectedJobName] = useState('HE Casting - ₹320/Ton');
  const [customJobName, setCustomJobName] = useState('');
  const [isCustomJob, setIsCustomJob] = useState(false);
  const [totalTons, setTotalTons] = useState('');
  const [ratePerTon, setRatePerTon] = useState('320.0');
  const [unit, setUnit] = useState('Tons');
  const [crewRecommendation, setCrewRecommendation] = useState('HE Casting: Per Ton - ₹320/-');
  
  // Custom Calendar Popover states
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const calendarRef = useRef<HTMLDivElement>(null);

  // Castings Fields
  const [selectedCastings, setSelectedCastings] = useState<SelectedCasting[]>([]);

  // Crew Selector & Filters
  const [selectedCrew, setSelectedCrew] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');

  const [formMessage, setFormMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default date on client mount
  useEffect(() => {
    const now = new Date();
    setDate(`${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`);
    setJobId(`JOB-${Math.floor(100000 + Math.random() * 900000)}`);
  }, []);

  // Sync calendar picker month/year with form date
  useEffect(() => {
    if (date) {
      const parts = date.split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[0]) - 1;
        const y = parseInt(parts[2]);
        if (!isNaN(m) && !isNaN(y)) {
          setCalendarMonth(m);
          setCalendarYear(y);
        }
      }
    }
  }, [date, showCalendar]);

  // Click outside listener for calendar popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch monthly attendance logs for the supervisor
  const fetchAttendanceLogs = async (month: number, year: number) => {
    try {
      const res = await fetch(`${API_URL}/api/attendance?month=${month}&year=${year}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAttendanceLogs(data);
      }
    } catch (err) {
      console.error('Error fetching attendance logs:', err);
    }
  };

  // Sync attendance logs when date changes
  useEffect(() => {
    if (date) {
      const parts = date.split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[0]);
        const y = parseInt(parts[2]);
        if (!isNaN(m) && !isNaN(y)) {
          fetchAttendanceLogs(m, y);
        }
      }
    }
  }, [date]);

  // Fetch active employee list
  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_URL}/api/employees`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setEmployees(data);
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  };

  // Fetch recorded job logs
  const fetchRecentJobs = async () => {
    setIsHistoryLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/jobs`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecentJobs(data);
      }
    } catch (err) {
      console.error('Error fetching recent jobs:', err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchEmployees();
      await fetchRecentJobs();
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Listen to Job Name selection to update properties
  const handleJobNameChange = (val: string) => {
    setSelectedJobName(val);
    if (val === 'Other (Write Custom Name)...') {
      setIsCustomJob(true);
      setUnit('Tons');
      setRatePerTon('');
      setCrewRecommendation('Custom Job - Enter Rate and Qty manually');
    } else {
      setIsCustomJob(false);
      if (val.startsWith('HE Casting')) {
        setUnit('Tons');
        setRatePerTon('320.0');
        setCrewRecommendation('HE Casting: Per Ton - ₹320/-');
      } else if (val.startsWith('Final Quality')) {
        setUnit('Tons');
        setRatePerTon('220.0');
        setCrewRecommendation('Final Inspection: Per Ton - ₹220/-');
      } else if (val.startsWith('Rework Sorting')) {
        setUnit('Pieces');
        setRatePerTon('4.90');
        setCrewRecommendation('Rework: Per Piece - ₹4.90/- (Standard Crew: 2 Employees)');
      } else if (val.startsWith('Painting Job')) {
        setUnit('Pieces');
        setRatePerTon('6.00');
        setCrewRecommendation('Painter: Per Piece - ₹6/- (Standard Crew: 3 Shifts, 3 Employees per shift)');
      } else if (val.startsWith('AVG Inspection')) {
        setUnit('Pieces');
        setRatePerTon('5.00');
        setCrewRecommendation('AVG: Per Piece - ₹5/- (Standard Crew: 2 Shifts, 1 Employee per shift)');
      } else if (val.startsWith('Yanmark Line')) {
        setUnit('Pieces');
        setRatePerTon('28.00');
        setCrewRecommendation('Yanmark: Per Piece - ₹28/- (Standard Crew: 1 Shift, 3 Employees)');
      }
    }
  };

  // Add a casting to the list
  const handleAddCasting = (castingCode: string) => {
    if (!castingCode) return;
    const casting = DEFAULT_CASTINGS.find(c => c.code === castingCode);
    if (!casting) return;
    
    const exists = selectedCastings.some(sc => sc.casting.code === castingCode);
    if (!exists) {
      setSelectedCastings(prev => [...prev, { casting, quantity: 0 }]);
    }
  };

  // Remove casting from list
  const handleRemoveCasting = (code: string) => {
    setSelectedCastings(prev => prev.filter(sc => sc.casting.code !== code));
  };

  // Update quantity of selected casting
  const handleCastingQtyChange = (code: string, qty: number) => {
    setSelectedCastings(prev => 
      prev.map(sc => sc.casting.code === code ? { ...sc, quantity: Math.max(0, qty) } : sc)
    );
  };

  // Recalculate tons or pieces based on castings list
  useEffect(() => {
    if (selectedCastings.length === 0) return;
    
    if (unit === 'Tons') {
      const totalWeightKg = selectedCastings.reduce((sum, sc) => sum + (sc.casting.weightKg * sc.quantity), 0);
      const computedTons = totalWeightKg / 1000.0;
      setTotalTons(computedTons.toFixed(3));
    } else {
      const totalPieces = selectedCastings.reduce((sum, sc) => sum + sc.quantity, 0);
      setTotalTons(totalPieces.toString());
    }
  }, [selectedCastings, unit]);

  const handleCrewToggle = (empId: string) => {
    setSelectedCrew(prev => 
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  // Dynamic Split Payout Summary Logic
  const splitCalculations = useMemo(() => {
    const tons = parseFloat(totalTons) || 0.0;
    const rate = parseFloat(ratePerTon) || 0.0;
    const totalJobValue = tons * rate;

    const crewEmployees = employees.filter(emp => selectedCrew.includes(emp.employeeId));
    const loadCrew = crewEmployees.filter(emp => emp.salaryPerDay === 0.0);
    const dayCrew = crewEmployees.filter(emp => emp.salaryPerDay > 0.0);

    // Map to find attendance hours for the current selected date
    const attendanceMap = new Map(
      attendanceLogs
        .filter(log => log.date === date)
        .map(log => [log.employeeId, log])
    );

    // 1. Calculate Day-Basis Crew Deductions (Half-Day aware)
    let totalDayWagesToDeduct = 0.0;
    for (const de of dayCrew) {
      const att = attendanceMap.get(de.employeeId);
      const baseRate = de.salaryPerDay > 0 ? de.salaryPerDay : 636.0;
      const isHalfDay = att ? (att.status === 'HALF_DAY' || att.hoursWorked < 4.0) : false;
      totalDayWagesToDeduct += isHalfDay ? (baseRate * 0.5) : baseRate;
    }

    const remainingPool = totalJobValue - totalDayWagesToDeduct;
    const finalSplits = new Map<string, number>();

    // Set defaults: all day-basis crew get 0 split
    for (const de of dayCrew) {
      finalSplits.set(de.employeeId, 0.0);
    }

    // 2. Distribute loader splits proportionally
    if (loadCrew.length > 0 && remainingPool > 0) {
      const totalLoaders = loadCrew.length;
      const idealShare = remainingPool / totalLoaders;

      const loaderInfoList = loadCrew.map(le => {
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
        const extraShare = surplus / fullTimeLoaders.length;
        for (const l of loaderInfoList) {
          finalSplits.set(l.employeeId, l.baseSplit + (l.isFullTime ? extraShare : 0.0));
        }
      } else if (surplus > 0) {
        const extraShare = surplus / totalLoaders;
        for (const l of loaderInfoList) {
          finalSplits.set(l.employeeId, l.baseSplit + extraShare);
        }
      } else {
        for (const l of loaderInfoList) {
          finalSplits.set(l.employeeId, l.baseSplit);
        }
      }
    } else {
      for (const le of loadCrew) {
        finalSplits.set(le.employeeId, 0.0);
      }
    }

    // Display loader split as average of loader split values or just ideal splits for header
    const individualSplitPay = loadCrew.length > 0 && remainingPool > 0
      ? remainingPool / loadCrew.length
      : 0.0;

    return {
      totalJobValue,
      crewSize: selectedCrew.length,
      individualSplitPay,
      dayCrew,
      loadCrew,
      totalDayWagesToDeduct,
      crewBreakdown: crewEmployees.map(emp => {
        const isLoad = emp.salaryPerDay === 0.0;
        const att = attendanceMap.get(emp.employeeId);
        const hours = att ? att.hoursWorked : 8.0;
        return {
          employeeId: emp.employeeId,
          name: emp.name,
          isLoad,
          hours,
          wage: isLoad ? (finalSplits.get(emp.employeeId) || 0.0) : (
            (emp.salaryPerDay > 0 ? emp.salaryPerDay : 636.0) * (att && (att.status === 'HALF_DAY' || att.hoursWorked < 4.0) ? 0.5 : 1.0)
          )
        };
      })
    };
  }, [totalTons, ratePerTon, selectedCrew, employees, date, attendanceLogs]);

  // Log job operation submit
  const handleSubmitJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage('');
    setIsSubmitting(true);

    if (selectedCrew.length === 0) {
      setFormMessage('Error: Crew must contain at least 1 employee.');
      setIsSubmitting(false);
      return;
    }

    const tonsVal = parseFloat(totalTons);
    if (isNaN(tonsVal) || tonsVal <= 0) {
      setFormMessage('Error: Please enter a valid quantity of tons/pieces worked.');
      setIsSubmitting(false);
      return;
    }

    const rateVal = parseFloat(ratePerTon);
    if (isNaN(rateVal) || rateVal <= 0) {
      setFormMessage('Error: Please enter a valid rate per ton/piece.');
      setIsSubmitting(false);
      return;
    }

    // Format castings metadata if selected
    let castingName: string | null = null;
    let castingQty: number | null = null;

    if (selectedCastings.length > 0) {
      castingName = selectedCastings
        .filter(sc => sc.quantity > 0)
        .map(sc => `${sc.casting.code} (${sc.quantity} pcs)`)
        .join(', ');
      
      if (!castingName) castingName = null;
      
      castingQty = selectedCastings.reduce((sum, sc) => sum + sc.quantity, 0);
      if (castingQty === 0) castingQty = null;
    }

    const jobName = isCustomJob ? customJobName.trim() : selectedJobName;

    const payload = {
      id: jobId,
      date,
      jobName,
      totalTons: tonsVal,
      ratePerTon: rateVal,
      unit,
      castingName,
      castingQty,
      employeeIds: selectedCrew
    };

    try {
      const res = await fetch(`${API_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setFormMessage(`Success: Job ${jobId} successfully logged with crew splits!`);
        // Reset form inputs
        setCustomJobName('');
        setTotalTons('');
        setSelectedCastings([]);
        setSelectedCrew([]);
        setJobId(`JOB-${Math.floor(100000 + Math.random() * 900000)}`);
        // Refresh history list
        await fetchRecentJobs();
      } else {
        setFormMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setFormMessage('Request to log job failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete recorded job log
  const handleDeleteJob = async (id: string) => {
    if (!confirm(`Are you sure you want to delete job log ${id}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/jobs/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchRecentJobs();
      } else {
        alert('Failed to delete job log.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('employeeSession');
    router.push('/login');
  };

  // Filter employees based on search & department
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = deptFilter === 'All' || emp.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [employees, searchQuery, deptFilter]);

  // Unique departments for filtering
  const uniqueDepartments = useMemo(() => {
    const depts = new Set(employees.map(e => e.department).filter(Boolean));
    return ['All', ...Array.from(depts)];
  }, [employees]);

  // Calendar rendering math helpers
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay(); // day of week (0-6)
    
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  }, [calendarMonth, calendarYear]);

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(prev => prev - 1);
    } else {
      setCalendarMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(prev => prev + 1);
    } else {
      setCalendarMonth(prev => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    setDate(`${calendarMonth + 1}/${day}/${calendarYear}`);
    setShowCalendar(false);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 flex flex-col font-sans selection:bg-orange-100 selection:text-orange-950">
      
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shadow-sm">
            <ClipboardList className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight font-display text-slate-900 uppercase">KFIL SUPERVISOR HUB</h1>
            <p className="text-[9px] text-orange-600 font-bold uppercase tracking-widest font-mono">Operations Tracker</p>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all duration-300 text-slate-500 hover:text-rose-600 shadow-sm cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </header>

      {/* Content Grid */}
      <main className="flex-1 p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Form Controls (7 columns wide) */}
        <section className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-8 relative overflow-hidden shadow-sm hover:border-orange-500/20 transition-all duration-300">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-orange-500" />
            
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2 font-display">
              <Plus className="w-5 h-5 text-orange-600" />
              <span>Log Daily Job Operation</span>
            </h2>

            <form onSubmit={handleSubmitJob} className="space-y-6">
              <div className="space-y-5 font-mono text-xs text-slate-600">
                
                {/* ID & Date Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Job Reference ID</label>
                    <input
                      type="text"
                      required
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                      className="w-full h-11 bg-slate-50/50 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-4 text-slate-800 focus:outline-none transition-all font-bold"
                    />
                  </div>

                  {/* Gorgeous Calendar Picker Field */}
                  <div className="space-y-1.5 relative" ref={calendarRef}>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Work Date</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        readOnly
                        value={date}
                        onClick={() => setShowCalendar(prev => !prev)}
                        className="w-full h-11 bg-slate-50/50 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl pl-4 pr-10 text-slate-800 focus:outline-none transition-all font-bold cursor-pointer hover:bg-slate-100/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCalendar(prev => !prev)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-orange-600 transition-colors"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Floating Premium Calendar Popover */}
                    {showCalendar && (
                      <div className="absolute right-0 md:left-0 mt-2 z-50 p-4 w-[280px] bg-white border border-slate-200/90 shadow-xl rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200 font-sans">
                        
                        {/* Month/Year Controller Header */}
                        <div className="flex justify-between items-center mb-4">
                          <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="font-bold text-slate-800 text-xs font-display">
                            {MONTH_NAMES[calendarMonth]} {calendarYear}
                          </span>
                          <button
                            type="button"
                            onClick={handleNextMonth}
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Days of Week Header */}
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-2">
                          <span>Su</span>
                          <span>Mo</span>
                          <span>Tu</span>
                          <span>We</span>
                          <span>Th</span>
                          <span>Fr</span>
                          <span>Sa</span>
                        </div>

                        {/* Days Grid */}
                        <div className="grid grid-cols-7 gap-1 text-center text-xs">
                          {calendarDays.map((day, idx) => {
                            if (day === null) {
                              return <div key={`empty-${idx}`} />;
                            }
                            
                            const dayStr = `${calendarMonth + 1}/${day}/${calendarYear}`;
                            const isSelected = date === dayStr;
                            
                            return (
                              <button
                                key={`day-${day}`}
                                type="button"
                                onClick={() => handleSelectDay(day)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-semibold transition-all ${
                                  isSelected
                                    ? 'bg-orange-600 text-white shadow-sm font-bold scale-105'
                                    : 'text-slate-700 hover:bg-orange-50 hover:text-orange-700 hover:scale-105'
                                }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Job Selection Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Job Name / Description</label>
                  <select
                    value={selectedJobName}
                    onChange={(e) => handleJobNameChange(e.target.value)}
                    className="w-full h-11 bg-slate-50/50 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-4 text-slate-800 focus:outline-none cursor-pointer font-bold font-sans text-xs"
                  >
                    {DEFAULT_JOB_NAMES.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Conditional Custom Job Fields */}
                {isCustomJob && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-orange-50/20 border border-orange-100 rounded-2xl p-4">
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest font-mono">Custom Job Name</label>
                      <input
                        type="text"
                        required
                        value={customJobName}
                        onChange={(e) => setCustomJobName(e.target.value)}
                        placeholder="e.g. Loading Bauxite Cargo Shift B"
                        className="w-full h-11 bg-white border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-4 text-slate-800 focus:outline-none font-sans text-xs transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Unit Type</label>
                      <select
                        value={unit}
                        onChange={(e) => {
                          setUnit(e.target.value);
                          setSelectedCastings([]);
                          setTotalTons('');
                        }}
                        className="w-full h-11 bg-white border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-4 text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="Tons">Tons</option>
                        <option value="Pieces">Pieces</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Casting Selection Dropdown */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Casting Specifications (Auto-Calculator)</label>
                      <span className="text-[8px] bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded font-bold">Auto-Tonnage</span>
                    </div>
                    
                    <select
                      value=""
                      onChange={(e) => handleAddCasting(e.target.value)}
                      className="w-full h-11 bg-slate-50/50 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-4 text-slate-800 focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled>-- Select a Casting model to add to list --</option>
                      {DEFAULT_CASTINGS.map(c => (
                        <option key={c.code} value={c.code}>{c.code} - {c.name} ({c.weightKg} kg)</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Render Selected Castings list */}
                {selectedCastings.length > 0 && (
                  <div className="space-y-2 border border-slate-100 bg-slate-50/30 p-4 rounded-2xl">
                    <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Selected Castings & Quantities</p>
                    <div className="space-y-2">
                      {selectedCastings.map(sc => {
                        const calculatedWeight = (sc.casting.weightKg * sc.quantity) / 1000.0;
                        return (
                          <div key={sc.casting.code} className="flex items-center justify-between gap-3 bg-white p-3 border border-slate-200/60 rounded-xl">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800 font-sans">{sc.casting.code} - {sc.casting.name}</p>
                              <p className="text-[9px] text-slate-400">{sc.casting.weightKg} kg | {unit === 'Tons' ? `${calculatedWeight.toFixed(3)} Tons` : `${sc.quantity} Pieces`}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                placeholder="Qty"
                                value={sc.quantity || ''}
                                onChange={(e) => handleCastingQtyChange(sc.casting.code, parseInt(e.target.value) || 0)}
                                className="w-20 h-9 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-lg px-2 text-center text-slate-800 font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveCasting(sc.casting.code)}
                                className="p-2 border border-rose-100 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tons & Rate Input Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {unit === 'Tons' ? 'Total Tons Processed' : 'Total Pieces Processed'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={totalTons}
                      disabled={selectedCastings.length > 0}
                      onChange={(e) => setTotalTons(e.target.value)}
                      placeholder={unit === 'Tons' ? 'e.g. 120.00' : 'e.g. 2400'}
                      className={`w-full h-11 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-4 text-slate-800 focus:outline-none transition-all font-bold ${
                        selectedCastings.length > 0 ? 'bg-slate-100 cursor-not-allowed text-slate-500' : 'bg-slate-50/50'
                      }`}
                    />
                    {selectedCastings.length > 0 && (
                      <p className="text-[8px] text-orange-600 font-bold font-sans">Locked: Value calculated from selected castings above.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {unit === 'Tons' ? 'Rate per Ton (₹)' : 'Rate per Piece (₹)'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={ratePerTon}
                      onChange={(e) => setRatePerTon(e.target.value)}
                      placeholder="e.g. 320.0"
                      className="w-full h-11 bg-slate-50/50 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-4 text-slate-800 focus:outline-none transition-all font-bold"
                    />
                  </div>
                </div>

                {/* Recommendation Helper Card */}
                <div className="bg-orange-50/40 border border-orange-100 rounded-2xl p-4 flex gap-3 items-start">
                  <Info className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-orange-600 uppercase tracking-widest">Standard Rate & Crew Suggestion</p>
                    <p className="text-slate-600 text-xs font-sans font-medium">{crewRecommendation}</p>
                  </div>
                </div>

              </div>

              {/* Crew Multi-Selection Block */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-orange-600" />
                    <span>Select Shift Crew ({selectedCrew.length} Selected)</span>
                  </h3>
                </div>

                {/* Filter Controls */}
                <div className="flex gap-2 text-xs font-mono">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search crew by name or ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-10 bg-slate-50/50 border border-slate-200 rounded-xl pl-9 pr-4 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20"
                    />
                  </div>
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="w-36 h-10 bg-slate-50/50 border border-slate-200 rounded-xl px-2 focus:outline-none cursor-pointer"
                  >
                    {uniqueDepartments.map(d => (
                      <option key={d} value={d}>{d} Dept</option>
                    ))}
                  </select>
                </div>

                {/* Crew Selection Checklist Box */}
                <div className="h-64 overflow-y-auto border border-slate-200 rounded-2xl p-2 bg-slate-50/20 divide-y divide-slate-100">
                  {filteredEmployees.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
                      No crew matches filters.
                    </div>
                  ) : (
                    filteredEmployees.map(emp => {
                      const isChecked = selectedCrew.includes(emp.employeeId);
                      const isLoad = emp.salaryPerDay === 0.0;
                      
                      return (
                        <div 
                          key={emp.employeeId}
                          onClick={() => handleCrewToggle(emp.employeeId)}
                          className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                            isChecked 
                              ? 'bg-orange-50/40 border-l-4 border-l-orange-500' 
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 truncate font-sans">{emp.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] text-slate-400 font-mono font-bold">
                                {emp.employeeId} | {emp.department}
                              </span>
                              {(() => {
                                const log = attendanceLogs.find(l => l.employeeId === emp.employeeId && l.date === date);
                                if (log) {
                                  const hours = log.hoursWorked;
                                  const isHalf = log.status === 'HALF_DAY' || hours < 4.0;
                                  return (
                                    <span className={`text-[8px] px-1 py-0.2 rounded font-mono font-bold leading-none ${
                                      isHalf 
                                        ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                                        : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                    }`}>
                                      {hours.toFixed(1)} hrs {isHalf ? '(Half)' : '(Full)'}
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span className="text-[8px] bg-slate-100 text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded font-mono font-bold leading-none">
                                      No Punch (Default 8h)
                                    </span>
                                  );
                                }
                              })()}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded border font-mono ${
                              isLoad ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-orange-50 text-orange-600 border-orange-100'
                            }`}>
                              {isLoad ? 'LOAD' : 'DAY'}
                            </span>
                            <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                              isChecked 
                                ? 'bg-orange-600 border-orange-500 text-white' 
                                : 'border-slate-200 bg-white'
                            }`}>
                              {isChecked && <Check className="w-3.5 h-3.5" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Dynamic Split Payout Summary Card */}
              {selectedCrew.length > 0 && (
                <div className="bg-orange-50/30 border border-orange-100 rounded-3xl p-5 font-mono text-xs text-slate-600 space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center divide-x divide-orange-100">
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Job Value</p>
                      <p className="text-sm font-extrabold text-slate-900 mt-1">₹{splitCalculations.totalJobValue.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Crew Size</p>
                      <p className="text-sm font-extrabold text-slate-900 mt-1">{splitCalculations.crewSize} Workers</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-orange-600 font-bold uppercase">Split Pay</p>
                      <p className="text-sm font-extrabold text-orange-600 mt-1">₹{splitCalculations.individualSplitPay.toFixed(1)}</p>
                    </div>
                  </div>

                  <div className="border-t border-orange-100 pt-3 space-y-2">
                    <p className="text-[9px] font-bold text-orange-600 uppercase tracking-widest">Calculated Share Breakdown</p>
                    {splitCalculations.dayCrew.length > 0 && splitCalculations.loadCrew.length > 0 && (
                      <p className="text-[8px] text-slate-400 leading-relaxed italic">
                        Note: Day-Basis salaries (₹{splitCalculations.totalDayWagesToDeduct.toFixed(0)} total) are paid first; the remaining pool is split equally among Load-Basis workers.
                      </p>
                    )}
                    
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-2">
                      {splitCalculations.crewBreakdown.map(worker => (
                        <div key={worker.employeeId} className="flex justify-between items-center font-sans text-xs">
                          <span className="text-slate-600 font-medium flex items-center gap-1.5">
                            <span>{worker.name}</span>
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                              {worker.isLoad ? 'Load' : 'Day'} • {worker.hours.toFixed(1)}h
                            </span>
                          </span>
                          <span className={`font-mono font-bold ${worker.isLoad ? 'text-orange-600' : 'text-slate-700'}`}>
                            ₹{worker.wage.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {formMessage && (
                <div className={`p-4 rounded-xl text-xs font-mono font-bold border ${
                  formMessage.startsWith('Success')
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    : 'bg-rose-50 border-rose-100 text-rose-700'
                }`}>
                  {formMessage}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 bg-gradient-to-r from-orange-600 to-amber-500 hover:shadow-md text-white font-mono text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-300 shadow-orange-500/10 cursor-pointer disabled:opacity-55"
              >
                {isSubmitting ? 'Saving Job Splits...' : 'Log Operation & Allocate Splits'}
              </button>
            </form>
          </div>
        </section>

        {/* Right Column: Recorded History (5 columns wide) */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 h-[720px] flex flex-col relative overflow-hidden shadow-sm hover:border-orange-500/20 transition-all duration-300">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-orange-500" />
            
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-md font-bold text-slate-900 font-display">Recent Jobs Recorded</h2>
                <p className="text-[9px] text-orange-600 font-bold font-mono uppercase tracking-widest mt-1">Audit Ledger</p>
              </div>
              <button 
                onClick={fetchRecentJobs}
                disabled={isHistoryLoading}
                className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isHistoryLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {isHistoryLoading && recentJobs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw className="w-7 h-7 text-orange-500 animate-spin" />
                <p className="text-xs font-mono uppercase tracking-widest text-orange-500 font-bold">Syncing job logs...</p>
              </div>
            ) : recentJobs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 font-mono text-xs text-center p-8">
                <ClipboardList className="w-8 h-8 text-slate-300 mb-1" />
                <p>No job logs have been registered in this system yet.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {recentJobs.map(job => {
                  const totalPayout = job.totalTons * job.ratePerTon;
                  const loadEmployees = job.employees.filter(je => je.employee.salaryPerDay === 0.0);
                  const splitVal = loadEmployees.length > 0 ? job.employees.find(je => je.employee.salaryPerDay === 0.0)?.splitEarnings || 0 : 0;
                  
                  return (
                    <div key={job.id} className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 space-y-2 relative overflow-hidden group">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 font-sans truncate">{job.jobName}</p>
                          <p className="text-[8px] text-slate-400 font-mono font-bold">{job.date} | Ref: {job.id}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteJob(job.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 font-mono text-[9px] text-slate-500 bg-white p-2.5 border border-slate-100 rounded-xl">
                        <div>
                          <p className="text-slate-400 font-bold uppercase">Volume</p>
                          <p className="font-extrabold text-slate-800 mt-0.5">
                            {job.unit === 'Tons' ? `${job.totalTons.toFixed(3)} Tons` : `${job.totalTons.toFixed(0)} Pcs`}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-bold uppercase">Rate</p>
                          <p className="font-extrabold text-slate-800 mt-0.5">₹{job.ratePerTon.toFixed(2)}</p>
                        </div>
                        <div className="col-span-2 border-t border-slate-100 pt-1.5 mt-0.5">
                          <p className="text-slate-400 font-bold uppercase">Total Job Payout</p>
                          <p className="font-extrabold text-orange-600 text-xs mt-0.5">₹{totalPayout.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        </div>
                      </div>

                      {/* Castings Metadata */}
                      {job.castingName && (
                        <div className="bg-orange-50/30 border border-orange-100/50 p-2 rounded-xl text-[9px] text-orange-700 font-bold">
                          <p className="uppercase tracking-widest text-[8px] text-slate-400 font-bold">Castings Processed</p>
                          <p className="mt-0.5 font-sans">{job.castingName}</p>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono font-bold bg-slate-100/50 p-2 rounded-xl">
                        <span>Crew: {job.employees.length} workers</span>
                        {loadEmployees.length > 0 && (
                          <span className="text-orange-600">Loader share: ₹{splitVal.toFixed(1)} each</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
