"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, DollarSign, Cpu, Settings, LogOut, Calculator, 
  Landmark, Layers, Calendar, Sliders, RefreshCw, Activity,
  Eye, Edit3, Plus, Search, Building, CreditCard, Phone, Shield, X, Download
} from 'lucide-react';
import { API_URL } from '@/config';

interface Employee {
  employeeId: string;
  name: string;
  department: string;
  salaryPerDay: number;
  deductionPerDay: number;
  uan: string;
  esic: string;
  bankName: string;
  ifscCode: string;
  bankAcc: string;
  punchingCode: string;
  mobileNo: string;
  accountAdvance: number;
  remainingAdvance: number;
}

interface PayrollRun {
  employeeId: string;
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

export default function AdminDashboard() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('sessionToken');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('employeeSession');
    router.push('/login');
  };
  const [employees, setEmployees] = useState<Employee[]>([]);
  const autoCalcTracker = useRef<string>('');
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [jobs, setJobs] = useState<JobLog[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(true);
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'profiles' | 'deductions'>('profiles');
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  
  // Sort state
  const [sortField, setSortField] = useState<'id' | 'name' | 'netSalary' | 'workedDays' | 'overtimeHours' | 'totalDeductions'>('id');
  const [sortAscending, setSortAscending] = useState(true);
  
  // Modals state
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  const [employeeForAdvance, setEmployeeForAdvance] = useState<Employee | null>(null);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advFormAcc, setAdvFormAcc] = useState('');
  const [advFormRem, setAdvFormRem] = useState('');
  const [advMessage, setAdvMessage] = useState('');
  const [isSavingAdv, setIsSavingAdv] = useState(false);
  
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [addEmpId, setAddEmpId] = useState('');
  const [addEmpName, setAddEmpName] = useState('');
  const [addEmpDept, setAddEmpDept] = useState('HE');
  const [addEmpCustomDept, setAddEmpCustomDept] = useState('');
  const [addEmpMobile, setAddEmpMobile] = useState('');
  const [addEmpPunchCode, setAddEmpPunchCode] = useState('');
  const [addEmpBasis, setAddEmpBasis] = useState<'Day Basis' | 'Load Basis'>('Day Basis');
  const [addEmpRate, setAddEmpRate] = useState('636.0');
  const [addEmpDeduct, setAddEmpDeduct] = useState('0.0');
  const [addEmpUan, setAddEmpUan] = useState('');
  const [addEmpEsic, setAddEmpEsic] = useState('');
  const [addEmpBankName, setAddEmpBankName] = useState('');
  const [addEmpBankAcc, setAddEmpBankAcc] = useState('');
  const [addEmpIfsc, setAddEmpIfsc] = useState('');
  const [addEmpMessage, setAddEmpMessage] = useState('');
  const [isAddingEmp, setIsAddingEmp] = useState(false);

  // Edit Employee State
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpDept, setEditEmpDept] = useState('HE');
  const [editEmpCustomDept, setEditEmpCustomDept] = useState('');
  const [editEmpMobile, setEditEmpMobile] = useState('');
  const [editEmpPunchCode, setEditEmpPunchCode] = useState('');
  const [editEmpBasis, setEditEmpBasis] = useState<'Day Basis' | 'Load Basis'>('Day Basis');
  const [editEmpRate, setEditEmpRate] = useState('636.0');
  const [editEmpDeduct, setEditEmpDeduct] = useState('0.0');
  const [editEmpUan, setEditEmpUan] = useState('');
  const [editEmpEsic, setEditEmpEsic] = useState('');
  const [editEmpBankName, setEditEmpBankName] = useState('');
  const [editEmpBankAcc, setEditEmpBankAcc] = useState('');
  const [editEmpIfsc, setEditEmpIfsc] = useState('');
  const [editEmpMessage, setEditEmpMessage] = useState('');
  const [isEditingEmp, setIsEditingEmp] = useState(false);

  // Attendance Export State
  const [showAttExportModal, setShowAttExportModal] = useState(false);
  const [attExportStartDate, setAttExportStartDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });
  const [attExportEndDate, setAttExportEndDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [isExportingAtt, setIsExportingAtt] = useState(false);
  const [attExportMessage, setAttExportMessage] = useState('');

  const handleDownloadAttendance = async () => {
    setIsExportingAtt(true);
    setAttExportMessage('');
    try {
      const res = await fetch(`${API_URL}/api/attendance/export?startDate=${attExportStartDate}&endDate=${attExportEndDate}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Attendance_Logs_${attExportStartDate}_to_${attExportEndDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setShowAttExportModal(false);
    } catch (err) {
      console.error('Error downloading attendance:', err);
      setAttExportMessage((err as Error).message || 'Export failed.');
    } finally {
      setIsExportingAtt(false);
    }
  };

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settShiftHours, setSettShiftHours] = useState('9.0');
  const [settOtMultiplier, setSettOtMultiplier] = useState('1.5');
  const [settGraceMin, setSettGraceMin] = useState('15.0');
  const [settAllowedLeaves, setSettAllowedLeaves] = useState('2');
  const [settDefaultRate, setSettDefaultRate] = useState('15.0');

  const [isCalculating, setIsCalculating] = useState(false);
  const [calcMessage, setCalcMessage] = useState('');

  // Load custom settings from localStorage on mount
  useEffect(() => {
    setSettShiftHours(localStorage.getItem('settings_shiftHours') || '9.0');
    setSettOtMultiplier(localStorage.getItem('settings_otMultiplier') || '1.5');
    setSettGraceMin(localStorage.getItem('settings_graceMin') || '15.0');
    setSettAllowedLeaves(localStorage.getItem('settings_allowedLeaves') || '2');
    setSettDefaultRate(localStorage.getItem('settings_defaultRate') || '15.0');
  }, []);

  // Fetch initial workforce databases
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

  // Fetch recent jobs logs
  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/jobs`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setJobs(data);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  // Fetch monthly payroll calculations
  const fetchPayrollRuns = async () => {
    try {
      const res = await fetch(`${API_URL}/api/payroll/runs?month=${selectedMonth}&year=${selectedYear}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPayrollRuns(data);
        
        // Auto-calculate if no records exist for the selected period
        if (data.length === 0 && !isCalculating && autoCalcTracker.current !== `${selectedMonth}-${selectedYear}`) {
          autoCalcTracker.current = `${selectedMonth}-${selectedYear}`;
          setTimeout(() => {
            handleCalculatePayroll();
          }, 50);
        }
      }
    } catch (err) {
      console.error('Error fetching payroll runs:', err);
    }
  };

  // Fetch monthly attendance logs
  const fetchAttendanceLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/attendance?month=${selectedMonth}&year=${selectedYear}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAttendanceLogs(data);
      }
    } catch (err) {
      console.error('Error fetching attendance logs:', err);
    }
  };

  const refreshAllData = async () => {
    setIsLoading(true);
    await fetchEmployees();
    await fetchJobs();
    await fetchPayrollRuns();
    await fetchAttendanceLogs();
    setIsLoading(false);
  };

  useEffect(() => {
    refreshAllData();
  }, [selectedMonth, selectedYear]);

  // Handle run calculations API
  const handleCalculatePayroll = async () => {
    setIsCalculating(true);
    setCalcMessage('');
    
    // Retrieve global settings from localStorage or fallback to defaults
    const settings = {
      shiftHours: parseFloat(localStorage.getItem('settings_shiftHours') || '9.0'),
      otMultiplier: parseFloat(localStorage.getItem('settings_otMultiplier') || '1.5'),
      graceMin: parseFloat(localStorage.getItem('settings_graceMin') || '15.0'),
      allowedLeaves: parseInt(localStorage.getItem('settings_allowedLeaves') || '2'),
      defaultRate: parseFloat(localStorage.getItem('settings_defaultRate') || '15.0')
    };

    try {
      const res = await fetch(`${API_URL}/api/payroll/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear, settings })
      });
      const data = await res.json();
      if (res.ok) {
        setCalcMessage(data.message || 'Wages calculated successfully!');
        await fetchPayrollRuns();
      } else {
        setCalcMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setCalcMessage('Calculation request failed');
    } finally {
      setIsCalculating(false);
    }
  };

  // Trigger Excel download
  const handleExportExcel = () => {
    window.open(`${API_URL}/api/payroll/export?month=${selectedMonth}&year=${selectedYear}`, '_blank');
  };

  // Toggle Pay Basis API (salaryPerDay = 0.0 for Load basis, or rate input for Day basis)
  const handleTogglePayBasis = async (empId: string, currentlyLoad: boolean) => {
    try {
      const rate = currentlyLoad ? 636.0 : 0.0; // Day rate set back to default if toggling back to Day-Basis
      const res = await fetch(`${API_URL}/api/employees/${empId}/basis`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLoadBasis: !currentlyLoad, rate })
      });
      if (res.ok) {
        const updated = await res.json();
        // Update local state
        setEmployees(prev => prev.map(e => e.employeeId === empId ? { ...e, salaryPerDay: updated.salaryPerDay } : e));
        if (selectedEmployee && selectedEmployee.employeeId === empId) {
          setSelectedEmployee(prev => prev ? { ...prev, salaryPerDay: updated.salaryPerDay } : null);
        }
        await handleCalculatePayroll(); // Trigger auto-recalculate
      } else {
        alert('Failed to update payment basis');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Submit advances edit API
  const handleSaveAdvances = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdvMessage('');
    if (!employeeForAdvance) return;

    setIsSavingAdv(true);
    try {
      const res = await fetch(`${API_URL}/api/employees/${employeeForAdvance.employeeId}/advances`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountAdvance: parseFloat(advFormAcc) || 0.0,
          remainingAdvance: parseFloat(advFormRem) || 0.0
        })
      });
      if (res.ok) {
        setAdvMessage('Advances updated successfully! Recalculating...');
        await fetchEmployees();
        await handleCalculatePayroll();
        setTimeout(() => {
          setShowAdvanceModal(false);
          setEmployeeForAdvance(null);
          setAdvMessage('');
        }, 1200);
      } else {
        setAdvMessage('Failed to update advances');
      }
    } catch (err) {
      setAdvMessage('Server request failed');
    } finally {
      setIsSavingAdv(false);
    }
  };

  // Submit new employee profile API
  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddEmpMessage('');
    setIsAddingEmp(true);

    const isLoad = addEmpBasis === 'Load Basis';
    const deptStr = addEmpDept === 'Other' ? addEmpCustomDept.trim().toUpperCase() : addEmpDept;

    const payload = {
      employeeId: addEmpId.trim(),
      name: addEmpName.trim(),
      department: deptStr,
      salaryPerDay: isLoad ? 0.0 : parseFloat(addEmpRate) || 0.0,
      deductionPerDay: isLoad ? 0.0 : parseFloat(addEmpDeduct) || 0.0,
      uan: addEmpUan.trim(),
      esic: addEmpEsic.trim(),
      bankName: addEmpBankName.trim(),
      bankAcc: addEmpBankAcc.trim(),
      ifscCode: addEmpIfsc.trim(),
      punchingCode: addEmpPunchCode.trim(),
      mobileNo: addEmpMobile.trim(),
      accountAdvance: 0.0,
      remainingAdvance: 0.0
    };

    try {
      const res = await fetch(`${API_URL}/api/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setAddEmpMessage('Employee added successfully! recalculating...');
        await fetchEmployees();
        await handleCalculatePayroll();
        setTimeout(() => {
          setShowAddEmployeeModal(false);
          // Reset form fields
          setAddEmpId('');
          setAddEmpName('');
          setAddEmpCustomDept('');
          setAddEmpMobile('');
          setAddEmpPunchCode('');
          setAddEmpUan('');
          setAddEmpEsic('');
          setAddEmpBankName('');
          setAddEmpBankAcc('');
          setAddEmpIfsc('');
          setAddEmpMessage('');
        }, 1200);
      } else {
        const errorData = await res.json();
        setAddEmpMessage(`Error: ${errorData.error || 'Failed to save employee'}`);
      }
    } catch (err) {
      setAddEmpMessage('Server request failed');
    } finally {
      setIsAddingEmp(false);
    }
  };

  // Open Edit Employee Modal
  const openEditEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setEditEmpName(emp.name);
    const standardDepts = ['HE', 'FINAL', 'REWORK', 'PAINTER', 'AVG', 'YANMAR LINE'];
    const matchedDept = standardDepts.includes(emp.department) ? emp.department : 'Other';
    setEditEmpDept(matchedDept);
    setEditEmpCustomDept(matchedDept === 'Other' ? emp.department : '');
    setEditEmpMobile(emp.mobileNo || '');
    setEditEmpPunchCode(emp.punchingCode || '');
    const isLoad = emp.salaryPerDay === 0.0;
    setEditEmpBasis(isLoad ? 'Load Basis' : 'Day Basis');
    setEditEmpRate(emp.salaryPerDay.toString());
    setEditEmpDeduct(emp.deductionPerDay.toString());
    setEditEmpUan(emp.uan || '');
    setEditEmpEsic(emp.esic || '');
    setEditEmpBankName(emp.bankName || '');
    setEditEmpBankAcc(emp.bankAcc || '');
    setEditEmpIfsc(emp.ifscCode || '');
    setEditEmpMessage('');
    setShowEditEmployeeModal(true);
  };

  // Submit edit employee profile API
  const handleEditEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setEditEmpMessage('');
    setIsEditingEmp(true);

    const isLoad = editEmpBasis === 'Load Basis';
    const deptStr = editEmpDept === 'Other' ? editEmpCustomDept.trim().toUpperCase() : editEmpDept;

    const payload = {
      name: editEmpName.trim(),
      department: deptStr,
      salaryPerDay: isLoad ? 0.0 : parseFloat(editEmpRate) || 0.0,
      deductionPerDay: isLoad ? 0.0 : parseFloat(editEmpDeduct) || 0.0,
      uan: editEmpUan.trim(),
      esic: editEmpEsic.trim(),
      bankName: editEmpBankName.trim(),
      bankAcc: editEmpBankAcc.trim(),
      ifscCode: editEmpIfsc.trim(),
      punchingCode: editEmpPunchCode.trim(),
      mobileNo: editEmpMobile.trim()
    };

    try {
      const res = await fetch(`${API_URL}/api/employees/${selectedEmployee.employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setEditEmpMessage('Employee updated successfully! Recalculating...');
        await fetchEmployees();
        await handleCalculatePayroll();
        setTimeout(() => {
          setShowEditEmployeeModal(false);
          setSelectedEmployee(null);
          setEditEmpMessage('');
        }, 1200);
      } else {
        const errorData = await res.json();
        setEditEmpMessage(`Error: ${errorData.error || 'Failed to update employee'}`);
      }
    } catch (err) {
      setEditEmpMessage('Server request failed');
    } finally {
      setIsEditingEmp(false);
    }
  };

  // Save Settings to Local Storage
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('settings_shiftHours', settShiftHours);
    localStorage.setItem('settings_otMultiplier', settOtMultiplier);
    localStorage.setItem('settings_graceMin', settGraceMin);
    localStorage.setItem('settings_allowedLeaves', settAllowedLeaves);
    localStorage.setItem('settings_defaultRate', settDefaultRate);
    
    setShowSettingsModal(false);
    alert('Settings saved successfully! Recalculating payroll variables...');
    handleCalculatePayroll();
  };

  // Open Edit Advances Modal
  const openEditAdvance = (emp: Employee) => {
    setEmployeeForAdvance(emp);
    setAdvFormAcc(emp.accountAdvance.toString());
    setAdvFormRem(emp.remainingAdvance.toString());
    setShowAdvanceModal(true);
  };

  // Calculate high-precision analytics metrics
  const calculatedMetrics = useMemo(() => {
    const totalStaff = employees.length;
    const totalPayroll = payrollRuns.reduce((sum, run) => sum + run.netSalary, 0.0);
    const totalOvertime = payrollRuns.reduce((sum, run) => sum + run.otPay, 0.0);
    const totalDeductions = payrollRuns.reduce((sum, run) => sum + run.totalDeductions, 0.0);
    
    const loadCount = employees.filter(e => e.salaryPerDay === 0.0).length;
    const dayCount = totalStaff - loadCount;

    // Calculate department budgets
    const deptMap: { [key: string]: number } = {};
    employees.forEach(emp => {
      const matchedRun = payrollRuns.find(r => r.employeeId === emp.employeeId);
      const wage = matchedRun ? matchedRun.netSalary : 0.0;
      deptMap[emp.department] = (deptMap[emp.department] || 0.0) + wage;
    });

    const deptAllocations = Object.entries(deptMap).map(([name, budget]) => ({
      name,
      budget,
      percentage: totalPayroll > 0 ? (budget / totalPayroll) * 100 : 0
    })).sort((a, b) => b.budget - a.budget);

    return {
      totalStaff,
      totalPayroll,
      totalOvertime,
      totalDeductions,
      loadCount,
      dayCount,
      deptAllocations
    };
  }, [employees, payrollRuns]);

  // Unique departments for filter lists
  const departmentsList = useMemo(() => {
    const list = new Set(employees.map(e => e.department).filter(Boolean));
    return ['All', ...Array.from(list)];
  }, [employees]);

  // Dynamic Biometric status ratios
  const biometricRatios = useMemo(() => {
    let present = 0;
    let late = 0;
    let overtime = 0;
    let halfDay = 0;

    attendanceLogs.forEach(log => {
      const status = log.status.toUpperCase();
      if (status.includes('PRESENT')) present++;
      else if (status.includes('LATE')) late++;
      else if (status.includes('OVERTIME')) overtime++;
      else if (status.includes('HALF_DAY')) halfDay++;
    });

    const total = present + late + overtime + halfDay;
    if (total === 0) {
      return { present: 0, late: 0, overtime: 0, halfDay: 0, total: 0 };
    }

    return {
      present: Math.round((present / total) * 100),
      late: Math.round((late / total) * 100),
      overtime: Math.round((overtime / total) * 100),
      halfDay: Math.round((halfDay / total) * 100),
      total
    };
  }, [attendanceLogs]);

  // Sort & Filter Employee Lists
  const filteredEmployeesList = useMemo(() => {
    const list = employees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = deptFilter === 'All' || emp.department === deptFilter;
      return matchesSearch && matchesDept;
    });

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'id') {
        comparison = a.employeeId.localeCompare(b.employeeId);
      } else if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'netSalary') {
        const runA = payrollRuns.find(r => r.employeeId === a.employeeId)?.netSalary || 0.0;
        const runB = payrollRuns.find(r => r.employeeId === b.employeeId)?.netSalary || 0.0;
        comparison = runA - runB;
      } else if (sortField === 'workedDays') {
        const runA = payrollRuns.find(r => r.employeeId === a.employeeId)?.workedDays || 0.0;
        const runB = payrollRuns.find(r => r.employeeId === b.employeeId)?.workedDays || 0.0;
        comparison = runA - runB;
      } else if (sortField === 'overtimeHours') {
        const runA = payrollRuns.find(r => r.employeeId === a.employeeId)?.overtimeHours || 0.0;
        const runB = payrollRuns.find(r => r.employeeId === b.employeeId)?.overtimeHours || 0.0;
        comparison = runA - runB;
      } else if (sortField === 'totalDeductions') {
        const runA = payrollRuns.find(r => r.employeeId === a.employeeId)?.totalDeductions || 0.0;
        const runB = payrollRuns.find(r => r.employeeId === b.employeeId)?.totalDeductions || 0.0;
        comparison = runA - runB;
      }
      return sortAscending ? comparison : -comparison;
    });

    return list;
  }, [employees, payrollRuns, searchQuery, deptFilter, sortField, sortAscending]);

  const handleSort = (field: 'id' | 'name' | 'netSalary' | 'workedDays' | 'overtimeHours' | 'totalDeductions') => {
    if (sortField === field) {
      setSortAscending(prev => !prev);
    } else {
      setSortField(field);
      setSortAscending(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 flex flex-col font-sans selection:bg-orange-100 selection:text-orange-950">
      
      {/* Navigation Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shadow-sm">
            <Sliders className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight font-display text-slate-900 uppercase">KFIL ADMIN CORE</h1>
            <p className="text-[9px] text-orange-600 font-bold uppercase tracking-widest font-mono">Operations Console</p>
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
              <option value={1}>Jan</option>
              <option value={2}>Feb</option>
              <option value={3}>Mar</option>
              <option value={4}>Apr</option>
              <option value={5}>May</option>
              <option value={6}>Jun</option>
              <option value={7}>Jul</option>
              <option value={8}>Aug</option>
              <option value={9}>Sep</option>
              <option value={10}>Oct</option>
              <option value={11}>Nov</option>
              <option value={12}>Dec</option>
            </select>
            <span className="text-slate-300">|</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent border-none text-slate-800 focus:outline-none cursor-pointer pr-4 font-bold"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
              <option value={2028}>2028</option>
              <option value={2029}>2029</option>
              <option value={2030}>2030</option>
            </select>
          </div>

          {/* Settings button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2.5 border border-slate-200 hover:border-orange-200 hover:bg-orange-50 rounded-xl transition-all shadow-sm text-slate-500 hover:text-orange-600 cursor-pointer"
            title="Global settings"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>

          {/* Excel Export button */}
          <button
            onClick={handleExportExcel}
            className="p-2.5 border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 rounded-xl transition-all shadow-sm text-slate-500 hover:text-emerald-600 cursor-pointer"
            title="Export wages register to Excel"
          >
            <Download className="w-4.5 h-4.5" />
          </button>

          {/* Biometric Attendance Export button */}
          <button
            onClick={() => setShowAttExportModal(true)}
            className="p-2.5 border border-slate-200 hover:border-blue-200 hover:bg-blue-50 rounded-xl transition-all shadow-sm text-slate-500 hover:text-blue-600 cursor-pointer"
            title="Export biometric attendance logs to Excel"
          >
            <Calendar className="w-4.5 h-4.5" />
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
      <main className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8">
        
        {/* Statistics Metric Cards */}
        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          
          <div className="bg-white border border-slate-200/85 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
            <div className="absolute top-3 right-3 text-orange-600/10"><Users className="w-8 h-8" /></div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Workforce Total</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1 font-display">{calculatedMetrics.totalStaff} Staff</h3>
            <p className="text-[8px] text-orange-600 font-mono font-bold mt-1 uppercase tracking-wider">{calculatedMetrics.loadCount} Load | {calculatedMetrics.dayCount} Day</p>
          </div>

          <div className="bg-white border border-slate-200/85 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
            <div className="absolute top-3 right-3 text-emerald-600/10"><DollarSign className="w-8 h-8" /></div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Net Salary Payout</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1 font-display">₹{calculatedMetrics.totalPayroll.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
            <p className="text-[8px] text-emerald-600 font-mono font-bold mt-1 uppercase tracking-wider">Net take-home pool</p>
          </div>

          <div className="bg-white border border-slate-200/85 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
            <div className="absolute top-3 right-3 text-purple-600/10"><Layers className="w-8 h-8" /></div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total Overtime</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1 font-display">₹{calculatedMetrics.totalOvertime.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
            <p className="text-[8px] text-purple-600 font-mono font-bold mt-1 uppercase tracking-wider">Hourly OT payments</p>
          </div>

          <div className="bg-white border border-slate-200/85 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
            <div className="absolute top-3 right-3 text-rose-600/10"><Activity className="w-8 h-8" /></div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total Deductions</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1 font-display">₹{calculatedMetrics.totalDeductions.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
            <p className="text-[8px] text-rose-500 font-mono font-bold mt-1 uppercase tracking-wider">PF, ESIC, Advances</p>
          </div>

          <div className="bg-white border border-slate-200/85 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
            <div className="absolute top-3 right-3 text-amber-600/10"><Calculator className="w-8 h-8" /></div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Supervisor Jobs</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1 font-display">{jobs.length} Operations</h3>
            <p className="text-[8px] text-amber-600 font-mono font-bold mt-1 uppercase tracking-wider">Shift tonnage logs</p>
          </div>
        </section>

        {/* Visual Analytics Row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Department Budget Progress bars */}
          <div className="bg-white border border-slate-200/85 rounded-3xl p-6 shadow-sm hover:border-orange-500/20 transition-all duration-300">
            <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <Building className="w-4 h-4 text-orange-600" />
              <span>Payroll Allocation by Department</span>
            </h3>
            
            {calculatedMetrics.deptAllocations.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-xs font-mono">
                No wages computed yet.
              </div>
            ) : (
              <div className="space-y-4 max-h-56 overflow-y-auto pr-1">
                {calculatedMetrics.deptAllocations.map(dept => (
                  <div key={dept.name} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800 font-sans">{dept.name} Department</span>
                      <span className="font-mono text-slate-500">
                        ₹{dept.budget.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({dept.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-orange-500 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${dept.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Biometric Ratios representation */}
          <div className="bg-white border border-slate-200/85 rounded-3xl p-6 shadow-sm hover:border-orange-500/20 transition-all duration-300">
            <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-orange-600" />
              <span>Biometric Punch Ratios</span>
            </h3>
            <div className="grid grid-cols-4 gap-2 text-center h-48 items-end border-b border-slate-100 pb-2">
              <div className="space-y-2 h-full flex flex-col justify-end">
                <div 
                  className="bg-emerald-500 rounded-t-lg mx-auto w-8 transition-all duration-500" 
                  style={{ height: `${biometricRatios.total > 0 ? biometricRatios.present : 0}%` }}
                />
                <p className="text-[10px] font-bold text-slate-600">Present</p>
                <p className="text-[9px] text-slate-400 font-mono">{biometricRatios.total > 0 ? `${biometricRatios.present}%` : '0%'}</p>
              </div>
              <div className="space-y-2 h-full flex flex-col justify-end">
                <div 
                  className="bg-amber-500 rounded-t-lg mx-auto w-8 transition-all duration-500" 
                  style={{ height: `${biometricRatios.total > 0 ? biometricRatios.late : 0}%` }}
                />
                <p className="text-[10px] font-bold text-slate-600">Late</p>
                <p className="text-[9px] text-slate-400 font-mono">{biometricRatios.total > 0 ? `${biometricRatios.late}%` : '0%'}</p>
              </div>
              <div className="space-y-2 h-full flex flex-col justify-end">
                <div 
                  className="bg-purple-500 rounded-t-lg mx-auto w-8 transition-all duration-500" 
                  style={{ height: `${biometricRatios.total > 0 ? biometricRatios.overtime : 0}%` }}
                />
                <p className="text-[10px] font-bold text-slate-600">Overtime</p>
                <p className="text-[9px] text-slate-400 font-mono">{biometricRatios.total > 0 ? `${biometricRatios.overtime}%` : '0%'}</p>
              </div>
              <div className="space-y-2 h-full flex flex-col justify-end">
                <div 
                  className="bg-cyan-500 rounded-t-lg mx-auto w-8 transition-all duration-500" 
                  style={{ height: `${biometricRatios.total > 0 ? biometricRatios.halfDay : 0}%` }}
                />
                <p className="text-[10px] font-bold text-slate-600">Half Day</p>
                <p className="text-[9px] text-slate-400 font-mono">{biometricRatios.total > 0 ? `${biometricRatios.halfDay}%` : '0%'}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Calculation Control Banner */}
        <section className="bg-white border border-slate-200/85 rounded-3xl p-8 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm hover:border-orange-500/20 transition-all duration-300">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-orange-500 to-amber-500" />
          
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 font-display">
              <Calculator className="w-5 h-5 text-orange-600" />
              <span>Trigger Wages Processing</span>
            </h2>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              Run calculations on the biometric attendance logs and supervisor work entries. Computes base pay, overtime, and ESIC/PF deductions.
            </p>
            {calcMessage && (
              <p className="text-xs font-bold text-orange-700 mt-2 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100 inline-block font-mono">
                {calcMessage}
              </p>
            )}
          </div>

          <button
            onClick={handleCalculatePayroll}
            disabled={isCalculating}
            className="px-6 h-11 bg-orange-600 hover:bg-orange-700 text-white font-mono text-xs font-bold uppercase tracking-widest rounded-xl flex items-center gap-2 shrink-0 transition-all duration-300 disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer shadow-sm shadow-orange-500/10"
          >
            <RefreshCw className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
            <span>{isCalculating ? 'Processing...' : 'Run Calculations'}</span>
          </button>
        </section>

        {/* Ledger Section with Tabs */}
        <section className="bg-white border border-slate-200/85 rounded-3xl overflow-hidden shadow-sm">
          
          {/* Tab Switcher Headers */}
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 w-full md:w-80">
              <button
                onClick={() => setActiveTab('profiles')}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  activeTab === 'profiles'
                    ? 'bg-white text-orange-600 shadow-sm border border-slate-200/60 font-black'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                👥 Workforce Profiles
              </button>
              <button
                onClick={() => setActiveTab('deductions')}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  activeTab === 'deductions'
                    ? 'bg-white text-orange-600 shadow-sm border border-slate-200/60 font-black'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                💰 Advances & Deductions
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl pl-9 pr-4 text-xs font-mono focus:outline-none"
                />
              </div>

              {/* Department filter */}
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-32 h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-2 text-xs font-mono focus:outline-none cursor-pointer"
              >
                {departmentsList.map(dept => (
                  <option key={dept} value={dept}>{dept} Dept</option>
                ))}
              </select>

              {/* Add Employee Button */}
              {activeTab === 'profiles' && (
                <button
                  onClick={() => setShowAddEmployeeModal(true)}
                  className="h-10 px-4 bg-orange-600 hover:bg-orange-700 text-white font-mono text-[10px] font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-sm shadow-orange-500/10 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Employee</span>
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-7 h-7 text-orange-500 animate-spin" />
              <p className="text-xs font-mono uppercase tracking-widest text-orange-500">Syncing database entries...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs text-slate-600">
                <thead>
                  <tr className="border-b border-slate-200 text-[9px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50/20">
                    <th onClick={() => handleSort('id')} className="px-6 py-4 cursor-pointer hover:text-slate-600">ID {sortField === 'id' && (sortAscending ? '▲' : '▼')}</th>
                    <th onClick={() => handleSort('name')} className="px-6 py-4 cursor-pointer hover:text-slate-600">Name {sortField === 'name' && (sortAscending ? '▲' : '▼')}</th>
                    <th className="px-6 py-4">Department</th>
                    
                    {activeTab === 'profiles' ? (
                      <>
                        <th className="px-6 py-4 text-center">Basis</th>
                        <th onClick={() => handleSort('workedDays')} className="px-6 py-4 text-right cursor-pointer hover:text-slate-600">Days worked {sortField === 'workedDays' && (sortAscending ? '▲' : '▼')}</th>
                        <th onClick={() => handleSort('overtimeHours')} className="px-6 py-4 text-right cursor-pointer hover:text-slate-600">OT Hours {sortField === 'overtimeHours' && (sortAscending ? '▲' : '▼')}</th>
                        <th onClick={() => handleSort('totalDeductions')} className="px-6 py-4 text-right cursor-pointer hover:text-slate-600">Deductions {sortField === 'totalDeductions' && (sortAscending ? '▲' : '▼')}</th>
                        <th onClick={() => handleSort('netSalary')} className="px-6 py-4 text-right cursor-pointer hover:text-slate-600">Net Wage {sortField === 'netSalary' && (sortAscending ? '▲' : '▼')}</th>
                        <th className="px-6 py-4 text-center">Actions</th>
                      </>
                    ) : (
                      <>
                        <th className="px-6 py-4 text-right">Account Adv</th>
                        <th className="px-6 py-4 text-right">Remaining Adv</th>
                        <th className="px-6 py-4 text-right">MLWL (LWF)</th>
                        <th onClick={() => handleSort('netSalary')} className="px-6 py-4 text-right cursor-pointer hover:text-slate-600">Net Wage {sortField === 'netSalary' && (sortAscending ? '▲' : '▼')}</th>
                        <th className="px-6 py-4 text-center">Actions</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployeesList.map(emp => {
                    const isLoad = emp.salaryPerDay === 0.0;
                    const calculatedRun = payrollRuns.find(r => r.employeeId === emp.employeeId);
                    
                    return (
                      <tr key={emp.employeeId} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-400">{emp.employeeId}</td>
                        <td className="px-6 py-4 text-slate-800 font-bold font-sans">{emp.name}</td>
                        <td className="px-6 py-4 text-slate-500">{emp.department}</td>
                        
                        {activeTab === 'profiles' ? (
                          <>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold ${
                                isLoad 
                                  ? 'bg-slate-100 text-slate-600 border border-slate-200' 
                                  : 'bg-orange-50 text-orange-600 border border-orange-100'
                              }`}>
                                {isLoad ? 'LOAD BASIS' : 'DAY BASIS'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-slate-500">{calculatedRun ? `${calculatedRun.workedDays} Days` : '-'}</td>
                            <td className="px-6 py-4 text-right text-slate-500">{calculatedRun ? `${calculatedRun.overtimeHours.toFixed(1)} hrs` : '-'}</td>
                            <td className="px-6 py-4 text-right text-rose-500 font-medium">{calculatedRun ? `₹${calculatedRun.totalDeductions.toFixed(0)}` : '-'}</td>
                            <td className="px-6 py-4 text-right text-emerald-600 font-bold">
                              {calculatedRun ? `₹${calculatedRun.netSalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : 'Not Run'}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedEmployee(emp);
                                    setShowDetailsModal(true);
                                  }}
                                  className="p-1 text-orange-600 hover:bg-orange-50 border border-transparent hover:border-orange-100 rounded-lg transition-colors cursor-pointer"
                                  title="View biometric employee sheet"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    openEditEmployee(emp);
                                  }}
                                  className="p-1 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded-lg transition-colors cursor-pointer"
                                  title="Edit employee profile"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-4 text-right text-slate-500">₹{emp.accountAdvance.toFixed(0)}</td>
                            <td className="px-6 py-4 text-right text-slate-500">₹{emp.remainingAdvance.toFixed(0)}</td>
                            <td className="px-6 py-4 text-right text-rose-500">
                              {calculatedRun && calculatedRun.mlwlDeduction > 0 ? `₹${calculatedRun.mlwlDeduction.toFixed(0)}` : '₹0'}
                            </td>
                            <td className="px-6 py-4 text-right text-emerald-600 font-bold">
                              {calculatedRun ? `₹${calculatedRun.netSalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : 'Not Run'}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => openEditAdvance(emp)}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-100 rounded-lg transition-colors cursor-pointer"
                                title="Edit Advances"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>

      {/* ------------------------------------------------------------- */}
      {/* DETAILED EMPLOYEE PROFILE SHEET MODAL */}
      {/* ------------------------------------------------------------- */}
      {showDetailsModal && selectedEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-3xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-600" />
                <span>Employee Biometric & Wages Sheet</span>
              </h3>
              <button 
                onClick={() => {
                  setSelectedEmployee(null);
                  setShowDetailsModal(false);
                }} 
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              
              {/* Header profile details */}
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <h4 className="text-md font-bold text-slate-900 font-sans truncate">{selectedEmployee.name}</h4>
                  <p className="text-xs text-slate-400 font-mono font-bold mt-0.5">{selectedEmployee.employeeId} | {selectedEmployee.department} Dept</p>
                </div>
                
                {/* Pay Basis toggle input */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 shrink-0 font-mono text-[9px] font-bold">
                  <span className={`px-2 py-1 rounded-lg transition-all ${selectedEmployee.salaryPerDay > 0 ? 'bg-orange-600 text-white font-black' : 'text-slate-400'}`}>DAY</span>
                  <button
                    onClick={() => handleTogglePayBasis(selectedEmployee.employeeId, selectedEmployee.salaryPerDay === 0.0)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-all relative ${
                      selectedEmployee.salaryPerDay === 0.0 ? 'bg-orange-600' : 'bg-slate-200'
                    }`}
                  >
                    <div 
                      className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all transform ${
                        selectedEmployee.salaryPerDay === 0.0 ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`px-2 py-1 rounded-lg transition-all ${selectedEmployee.salaryPerDay === 0.0 ? 'bg-orange-600 text-white font-black' : 'text-slate-400'}`}>LOAD</span>
                </div>
              </div>

              {/* Statutory details box */}
              <div className="border border-slate-100 bg-slate-50/50 p-4 rounded-2xl font-mono text-xs text-slate-600 space-y-2">
                <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Statutory & Bank Credentials</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-2.5">
                  <div>
                    <span className="text-slate-400">UAN:</span> <strong className="text-slate-700">{selectedEmployee.uan || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">ESIC:</span> <strong className="text-slate-700">{selectedEmployee.esic || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Bank:</span> <strong className="text-slate-700 font-sans">{selectedEmployee.bankName || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Account:</span> <strong className="text-slate-700">{selectedEmployee.bankAcc || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">IFSC:</span> <strong className="text-slate-700">{selectedEmployee.ifscCode || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Punch Code:</span> <strong className="text-slate-700">{selectedEmployee.punchingCode || 'N/A'}</strong>
                  </div>
                </div>
              </div>

              {/* Interactive wage breakdown calculation values */}
              {(() => {
                const run = payrollRuns.find(r => r.employeeId === selectedEmployee.employeeId);
                if (!run) return <p className="text-xs font-mono text-slate-400 italic">No wage logs run for this employee in selected period.</p>;
                return (
                  <div className="space-y-4 font-mono text-xs text-slate-600">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-[9px] font-black text-emerald-600 border-b border-emerald-100 pb-1 uppercase tracking-widest">Earnings</p>
                        <div className="space-y-1.5 text-[11px]">
                          <div className="flex justify-between"><span>Basic Pay:</span> <strong>₹{run.basicPay.toFixed(1)}</strong></div>
                          <div className="flex justify-between"><span>Overtime:</span> <strong>₹{run.otPay.toFixed(1)}</strong></div>
                          <div className="flex justify-between"><span>Job splits:</span> <strong>₹{run.jobEarnings.toFixed(1)}</strong></div>
                          <div className="flex justify-between border-t border-slate-100 pt-1 font-bold text-slate-800">
                            <span>Gross Pay:</span> <span>₹{run.grossSalary.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[9px] font-black text-rose-500 border-b border-rose-100 pb-1 uppercase tracking-widest">Deductions</p>
                        <div className="space-y-1.5 text-[11px]">
                          <div className="flex justify-between"><span>Provident Fund:</span> <strong>₹{run.pfDeduction.toFixed(1)}</strong></div>
                          <div className="flex justify-between"><span>State Insur:</span> <strong>₹{run.esicDeduction.toFixed(1)}</strong></div>
                          <div className="flex justify-between"><span>Prof Tax:</span> <strong>₹{run.ptDeduction.toFixed(1)}</strong></div>
                          <div className="flex justify-between"><span>Advance paid:</span> <strong>₹{run.accountAdvance.toFixed(1)}</strong></div>
                          <div className="flex justify-between border-t border-slate-100 pt-1 font-bold text-rose-600">
                            <span>Total Deduct:</span> <span>₹{run.totalDeductions.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 flex justify-between items-center text-xs font-bold">
                      <span className="text-emerald-700">NET TAKE-HOME WAGES:</span>
                      <span className="text-emerald-700 text-sm">₹{run.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Dynamic Attendance Calendar */}
              <AttendanceCalendar 
                employeeId={selectedEmployee.employeeId}
                attendanceLogs={attendanceLogs}
                jobs={jobs}
                month={selectedMonth}
                year={selectedYear}
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* EDIT ADVANCES MODAL */}
      {/* ------------------------------------------------------------- */}
      {showAdvanceModal && employeeForAdvance && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-3xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2">
                <Landmark className="w-5 h-5 text-orange-600" />
                <span>Edit Advances & Deductions</span>
              </h3>
              <button onClick={() => { setShowAdvanceModal(false); setEmployeeForAdvance(null); }} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSaveAdvances} className="p-6 space-y-4">
              <p className="text-xs text-slate-500 font-mono">Employee: <strong>{employeeForAdvance.name}</strong> ({employeeForAdvance.employeeId})</p>
              
              <div className="space-y-1.5 font-mono text-xs">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Advance (₹)</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={advFormAcc}
                  onChange={(e) => setAdvFormAcc(e.target.value)}
                  className="w-full h-11 bg-slate-50/50 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-4 text-slate-850 font-bold focus:outline-none"
                />
              </div>

              <div className="space-y-1.5 font-mono text-xs">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remaining Advance Ledger (₹)</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={advFormRem}
                  onChange={(e) => setAdvFormRem(e.target.value)}
                  className="w-full h-11 bg-slate-50/50 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-4 text-slate-850 font-bold focus:outline-none"
                />
              </div>

              {advMessage && (
                <p className={`text-xs font-mono font-bold mt-2 p-3 border rounded-xl ${advMessage.startsWith('Success') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>{advMessage}</p>
              )}

              <button
                type="submit"
                disabled={isSavingAdv}
                className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-mono text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-300 shadow-orange-500/10 cursor-pointer disabled:opacity-55"
              >
                {isSavingAdv ? 'Saving changes...' : 'Save Advances Ledger'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ADD NEW EMPLOYEE MODAL */}
      {/* ------------------------------------------------------------- */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-3xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2">
                <Plus className="w-5 h-5 text-orange-600" />
                <span>Add New Employee Profile</span>
              </h3>
              <button onClick={() => setShowAddEmployeeModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleAddEmployeeSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto font-mono text-xs text-slate-600">
              <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Primary Info</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Employee ID *</label>
                  <input type="text" required value={addEmpId} onChange={(e) => setAddEmpId(e.target.value)} placeholder="e.g. KFIL/L1-502" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Full Name *</label>
                  <input type="text" required value={addEmpName} onChange={(e) => setAddEmpName(e.target.value)} placeholder="e.g. AMIT RATHOD" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-sans" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Department *</label>
                  <select value={addEmpDept} onChange={(e) => setAddEmpDept(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-2 focus:outline-none cursor-pointer">
                    <option value="HE">HE</option>
                    <option value="FINAL">FINAL</option>
                    <option value="REWORK">REWORK</option>
                    <option value="PAINTER">PAINTER</option>
                    <option value="AVG">AVG</option>
                    <option value="YANMAR LINE">YANMAR LINE</option>
                    <option value="Other">Other (Custom...)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Mobile Number</label>
                  <input type="text" value={addEmpMobile} onChange={(e) => setAddEmpMobile(e.target.value)} placeholder="Mobile No" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                {addEmpDept === 'Other' && (
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[9px] font-bold text-orange-600 uppercase">Custom Department Name *</label>
                    <input type="text" required value={addEmpCustomDept} onChange={(e) => setAddEmpCustomDept(e.target.value)} placeholder="e.g. FOUNDRY LINE C" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Biometric Punch Code</label>
                  <input type="text" value={addEmpPunchCode} onChange={(e) => setAddEmpPunchCode(e.target.value)} placeholder="e.g. FOU190" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Payment Basis *</label>
                  <select value={addEmpBasis} onChange={(e) => setAddEmpBasis(e.target.value as any)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-2 focus:outline-none cursor-pointer">
                    <option value="Day Basis">Day Basis</option>
                    <option value="Load Basis">Load Basis</option>
                  </select>
                </div>
                {addEmpBasis === 'Day Basis' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Salary Per Day (₹) *</label>
                      <input type="number" step="any" required value={addEmpRate} onChange={(e) => setAddEmpRate(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Deduction Per Day (₹) *</label>
                      <input type="number" step="any" required value={addEmpDeduct} onChange={(e) => setAddEmpDeduct(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" />
                    </div>
                  </>
                )}
              </div>

              <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest pt-2">Statutory & Bank Credentials</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">UAN Number</label>
                  <input type="text" value={addEmpUan} onChange={(e) => setAddEmpUan(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">ESIC Number</label>
                  <input type="text" value={addEmpEsic} onChange={(e) => setAddEmpEsic(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Bank Name</label>
                  <input type="text" value={addEmpBankName} onChange={(e) => setAddEmpBankName(e.target.value)} placeholder="State Bank" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-sans" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">IFSC Code</label>
                  <input type="text" value={addEmpIfsc} onChange={(e) => setAddEmpIfsc(e.target.value)} placeholder="IFSC" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Bank Account Number</label>
                  <input type="text" value={addEmpBankAcc} onChange={(e) => setAddEmpBankAcc(e.target.value)} placeholder="Acc No" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
              </div>

              {addEmpMessage && (
                <p className={`text-xs font-mono font-bold mt-2 p-3 border rounded-xl ${addEmpMessage.startsWith('Success') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>{addEmpMessage}</p>
              )}

              <button
                type="submit"
                disabled={isAddingEmp}
                className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-mono text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-300 shadow-orange-500/10 cursor-pointer disabled:opacity-55"
              >
                {isAddingEmp ? 'Saving profile...' : 'Save Employee Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* EDIT EMPLOYEE MODAL */}
      {/* ------------------------------------------------------------- */}
      {showEditEmployeeModal && selectedEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-3xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-orange-600" />
                <span>Edit Employee Profile</span>
              </h3>
              <button onClick={() => { setShowEditEmployeeModal(false); setSelectedEmployee(null); }} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleEditEmployeeSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto font-mono text-xs text-slate-600">
              <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Primary Info</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Employee ID (Static)</label>
                  <input type="text" disabled value={selectedEmployee.employeeId} className="w-full h-10 border border-slate-200 bg-slate-50 text-slate-400 rounded-xl px-3 focus:outline-none cursor-not-allowed font-bold" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Full Name *</label>
                  <input type="text" required value={editEmpName} onChange={(e) => setEditEmpName(e.target.value)} placeholder="e.g. AMIT RATHOD" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-sans" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Department *</label>
                  <select value={editEmpDept} onChange={(e) => setEditEmpDept(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-2 focus:outline-none cursor-pointer">
                    <option value="HE">HE</option>
                    <option value="FINAL">FINAL</option>
                    <option value="REWORK">REWORK</option>
                    <option value="PAINTER">PAINTER</option>
                    <option value="AVG">AVG</option>
                    <option value="YANMAR LINE">YANMAR LINE</option>
                    <option value="Other">Other (Custom...)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Mobile Number</label>
                  <input type="text" value={editEmpMobile} onChange={(e) => setEditEmpMobile(e.target.value)} placeholder="Mobile No" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                {editEmpDept === 'Other' && (
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[9px] font-bold text-orange-600 uppercase">Custom Department Name *</label>
                    <input type="text" required value={editEmpCustomDept} onChange={(e) => setEditEmpCustomDept(e.target.value)} placeholder="e.g. FOUNDRY LINE C" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Biometric Punch Code</label>
                  <input type="text" value={editEmpPunchCode} onChange={(e) => setEditEmpPunchCode(e.target.value)} placeholder="e.g. FOU190" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Payment Basis *</label>
                  <select value={editEmpBasis} onChange={(e) => setEditEmpBasis(e.target.value as any)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-2 focus:outline-none cursor-pointer">
                    <option value="Day Basis">Day Basis</option>
                    <option value="Load Basis">Load Basis</option>
                  </select>
                </div>
                {editEmpBasis === 'Day Basis' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Salary Per Day (₹) *</label>
                      <input type="number" step="any" required value={editEmpRate} onChange={(e) => setEditEmpRate(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Deduction Per Day (₹) *</label>
                      <input type="number" step="any" required value={editEmpDeduct} onChange={(e) => setEditEmpDeduct(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" />
                    </div>
                  </>
                )}
              </div>

              <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest pt-2">Statutory & Bank Credentials</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">UAN Number</label>
                  <input type="text" value={editEmpUan} onChange={(e) => setEditEmpUan(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">ESIC Number</label>
                  <input type="text" value={editEmpEsic} onChange={(e) => setEditEmpEsic(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Bank Name</label>
                  <input type="text" value={editEmpBankName} onChange={(e) => setEditEmpBankName(e.target.value)} placeholder="State Bank" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-sans" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">IFSC Code</label>
                  <input type="text" value={editEmpIfsc} onChange={(e) => setEditEmpIfsc(e.target.value)} placeholder="IFSC" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Bank Account Number</label>
                  <input type="text" value={editEmpBankAcc} onChange={(e) => setEditEmpBankAcc(e.target.value)} placeholder="Acc No" className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none" />
                </div>
              </div>

              {editEmpMessage && (
                <p className={`text-xs font-mono font-bold mt-2 p-3 border rounded-xl ${editEmpMessage.startsWith('Success') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>{editEmpMessage}</p>
              )}

              <button
                type="submit"
                disabled={isEditingEmp}
                className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-mono text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-300 shadow-orange-500/10 cursor-pointer disabled:opacity-55"
              >
                {isEditingEmp ? 'Saving profile...' : 'Save Employee Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* GLOBAL SETTINGS MODAL */}
      {/* ------------------------------------------------------------- */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-3xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2">
                <Settings className="w-5 h-5 text-orange-600" />
                <span>Global Calculation Settings</span>
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-6 space-y-4 font-mono text-xs text-slate-600">
              
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Standard Shift Duration (Hours)</label>
                <input type="number" step="any" required value={settShiftHours} onChange={(e) => setSettShiftHours(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Overtime Pay Multiplier</label>
                <input type="number" step="any" required value={settOtMultiplier} onChange={(e) => setSettOtMultiplier(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Lateness Grace Period (Minutes)</label>
                <input type="number" step="any" required value={settGraceMin} onChange={(e) => setSettGraceMin(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Allowed Monthly Paid Leaves</label>
                <input type="number" required value={settAllowedLeaves} onChange={(e) => setSettAllowedLeaves(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Default Rate per Ton (₹)</label>
                <input type="number" step="any" required value={settDefaultRate} onChange={(e) => setSettDefaultRate(e.target.value)} className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" />
              </div>

              <button
                type="submit"
                className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-mono text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-300 shadow-orange-500/10 cursor-pointer"
              >
                Save Settings & Recalculate
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BIOMETRIC ATTENDANCE EXPORT MODAL */}
      {/* ------------------------------------------------------------- */}
      {showAttExportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-3xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 font-display flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-600" />
                <span>Export Attendance Logs</span>
              </h3>
              <button onClick={() => setShowAttExportModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4 font-mono text-xs text-slate-600">
              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                Select a custom date range to export all employee check-in/check-out logs downloaded from the biometric devices.
              </p>
              
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Start Date</label>
                <input 
                  type="date" 
                  value={attExportStartDate} 
                  onChange={(e) => setAttExportStartDate(e.target.value)} 
                  className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase">End Date</label>
                <input 
                  type="date" 
                  value={attExportEndDate} 
                  onChange={(e) => setAttExportEndDate(e.target.value)} 
                  className="w-full h-10 border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-xl px-3 focus:outline-none font-bold" 
                />
              </div>

              {attExportMessage && (
                <p className="text-[10px] font-mono font-bold text-rose-600 bg-rose-50 border border-rose-100 p-2.5 rounded-xl">{attExportMessage}</p>
              )}

              <button
                onClick={handleDownloadAttendance}
                disabled={isExportingAtt}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-300 shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-55"
              >
                {isExportingAtt ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Excel...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Attendance Logs</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

interface AttendanceCalendarProps {
  employeeId: string;
  attendanceLogs: any[];
  jobs: JobLog[];
  month: number;
  year: number;
}

function AttendanceCalendar({ employeeId, attendanceLogs, jobs, month, year }: AttendanceCalendarProps) {
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
    const map: { [key: string]: JobLog[] } = {};
    jobs.forEach(job => {
      const isPart = job.employees && job.employees.some(je => je.employeeId.toLowerCase() === employeeId.toLowerCase());
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

  const getJobSplit = (job: JobLog) => {
    const match = job.employees.find(je => je.employeeId.toLowerCase() === employeeId.toLowerCase());
    return match ? match.splitEarnings : 0.0;
  };

  return (
    <div className="space-y-4 border border-slate-100 bg-slate-50/50 p-4 rounded-2xl font-mono text-xs mt-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
        <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest">
          📅 {monthNames[month - 1]} {year} Attendance Calendar
        </h4>
        <div className="flex flex-wrap gap-2 text-[8px] font-bold text-slate-400 uppercase tracking-wider">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />P</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" />L</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-500 inline-block" />OT</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-cyan-500 inline-block" />H</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" />A</span>
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
              <h5 className="font-bold text-slate-950">
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
                    {selectedDayDetails.workedJobs.map((job: JobLog) => (
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
