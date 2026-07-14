"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, Lock, ShieldAlert, CheckCircle, ArrowRight, Network, Sun, Moon } from 'lucide-react';
import { API_URL } from '@/config';

interface Employee {
  employeeId: string;
  name: string;
  department: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<'employee' | 'supervisor' | 'admin'>('employee');
  const [employeeId, setEmployeeId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [matchedEmployee, setMatchedEmployee] = useState<Employee | null>(null);
  const [isDbOnline, setIsDbOnline] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Load theme preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('loginTheme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('loginTheme', nextTheme);
  };

  // Check database online status
  useEffect(() => {
    fetch(`${API_URL}/`)
      .then(res => {
        if (res.ok) setIsDbOnline(true);
      })
      .catch(err => {
        console.error('Database connection error:', err);
        setIsDbOnline(false);
      });
  }, []);

  // Employee ID check logic via preview API endpoint (with debouncing & abort controllers)
  useEffect(() => {
    if (selectedRole === 'employee' && employeeId.trim().length >= 4) {
      const controller = new AbortController();
      const delayDebounceFn = setTimeout(() => {
        const id = employeeId.trim();
        fetch(`${API_URL}/api/auth/employee-preview/${encodeURIComponent(id)}`, {
          signal: controller.signal
        })
          .then(res => {
            if (!res.ok) throw new Error('Employee not found');
            return res.json();
          })
          .then(data => {
            setMatchedEmployee(data);
            setErrorMessage('');
          })
          .catch(err => {
            if (err.name !== 'AbortError') {
              setMatchedEmployee(null);
              setErrorMessage('Employee ID not found in database');
            }
          });
      }, 300);

      return () => {
        clearTimeout(delayDebounceFn);
        controller.abort();
      };
    } else {
      setMatchedEmployee(null);
      setErrorMessage('');
    }
  }, [employeeId, selectedRole]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (selectedRole === 'employee') {
      if (matchedEmployee) {
        // Authenticate employee against backend and get the token
        fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'employee', employeeId: matchedEmployee.employeeId })
        })
          .then(async (res) => {
            const data = await res.json();
            if (res.ok && data.success) {
              localStorage.setItem('sessionToken', data.token);
              localStorage.setItem('employeeSession', JSON.stringify(data.employee));
              router.push('/employee');
            } else {
              setErrorMessage(data.error || 'Authentication failed');
            }
          })
          .catch((err) => {
            console.error('Employee auth error:', err);
            setErrorMessage('Failed to connect to authentication server');
          });
      } else {
        setErrorMessage('Please enter a valid Employee ID');
      }
    } else if (selectedRole === 'supervisor' || selectedRole === 'admin') {
      // Authenticate admin or supervisor against backend
      fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, passcode })
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok && data.success) {
            localStorage.setItem('sessionToken', data.token);
            router.push(selectedRole === 'admin' ? '/admin' : '/supervisor');
          } else {
            setErrorMessage(data.error || `Incorrect ${selectedRole} passcode`);
          }
        })
        .catch((err) => {
          console.error('Auth error:', err);
          setErrorMessage('Failed to connect to authentication server');
        });
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center font-sans relative overflow-hidden bg-zinc-950 text-slate-100">

      <div
        className="absolute inset-0 bg-cover bg-center opacity-50 brightness-50"
        style={{ backgroundImage: 'url("/industrial_background.jpg")' }}
      />

      {/* Background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-zinc-700/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-zinc-700/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Floating Theme Toggler Button */}
      <button
        onClick={toggleTheme}
        type="button"
        className={`absolute top-6 right-6 p-2.5 rounded-xl border transition-all shadow-xs cursor-pointer z-20 ${theme === 'dark'
          ? 'bg-zinc-900/60 border-zinc-800 text-amber-400 hover:bg-zinc-800/60'
          : 'bg-white/80 border-slate-200 text-slate-650 hover:bg-slate-100'
          }`}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <div className={`w-full max-w-[420px] p-8 border rounded-2xl shadow-2xl relative z-10 space-y-6 transition-all duration-300 ${
        theme === 'dark' 
          ? 'bg-zinc-900 border-zinc-800 shadow-zinc-950/50' 
          : 'bg-white border-slate-200 shadow-slate-200/50'
      }`}>

        {/* Card Header & Brand */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shadow-inner ${theme === 'dark' ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-indigo-50 border-indigo-100'
              }`}>
              <Fingerprint className={`w-5 h-5 ${theme === 'dark' ? 'text-zinc-400' : 'text-indigo-600'}`} />
            </div>
            <div>
              <h1 className={`text-sm font-black tracking-widest leading-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>FOUNDTECH</h1>
              <p className={`text-[9px] font-mono font-bold uppercase tracking-widest leading-none ${theme === 'dark' ? 'text-zinc-400' : 'text-indigo-600'}`}>ENGINEERING</p>
            </div>
          </div>

          {/* Database Status Dot */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-bold uppercase tracking-wider ${theme === 'dark'
            ? (isDbOnline ? 'border-emerald-500/20 text-emerald-400 bg-zinc-950/40' : 'border-rose-500/20 text-rose-400 bg-zinc-950/40')
            : (isDbOnline ? 'border-emerald-200 text-emerald-600 bg-emerald-50' : 'border-rose-200 text-rose-600 bg-rose-50')
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isDbOnline
              ? 'bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse'
              : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
              }`} />
            <span>{isDbOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        <div className="space-y-1 text-center">
          <h2 className={`text-base font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>Biometric Payroll Portal</h2>
          <p className={`${theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'} text-[11px]`}>Authorize credentials to access payroll registry.</p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleLogin} className="space-y-5">

          {/* Role Tabs */}
          <div className={`flex p-0.5 rounded-xl border ${theme === 'dark' ? 'bg-zinc-950/60 border-zinc-800/80' : 'bg-slate-100 border-slate-200'
            }`}>
            {(['employee', 'supervisor', 'admin'] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  setSelectedRole(role);
                  setErrorMessage('');
                  setEmployeeId('');
                  setPasscode('');
                  setMatchedEmployee(null);
                }}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${selectedRole === role
                  ? (theme === 'dark'
                    ? 'bg-zinc-800 text-white border border-zinc-700 font-black'
                    : 'bg-white text-indigo-600 shadow-xs border border-slate-200 font-black')
                  : (theme === 'dark' ? 'text-zinc-450 hover:text-zinc-300' : 'text-slate-500 hover:text-slate-700')
                  }`}
              >
                {role}
              </button>
            ))}
          </div>

          {/* Input fields */}
          {selectedRole === 'employee' ? (
            <div className="space-y-2">
              <label className={`text-[10px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-450' : 'text-slate-500'}`}>Employee Badge ID</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Fingerprint className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="e.g. KFIL/L1-406"
                  className={`w-full h-10 border rounded-lg pl-10 pr-4 text-xs focus:outline-none transition-all ${theme === 'dark'
                    ? 'bg-zinc-950/50 border-zinc-850 text-white placeholder:text-zinc-600 focus:border-indigo-505 focus:ring-indigo-505/20'
                    : 'bg-white border-slate-300 text-slate-850 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500/10'
                    }`}
                />
              </div>

              {/* Profile match card */}
              {matchedEmployee && (
                <div className={`flex items-center gap-3 border rounded-xl p-3 mt-3 ${theme === 'dark' ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${theme === 'dark' ? 'bg-zinc-800/50 border-zinc-700 text-zinc-400' : 'bg-indigo-50 border-indigo-100 text-indigo-750'
                    }`}>
                    {matchedEmployee.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-zinc-200' : 'text-slate-850'}`}>{matchedEmployee.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">{matchedEmployee.department} Department</p>
                  </div>
                  <CheckCircle className="w-4.5 h-4.5 text-emerald-500 shrink-0 animate-in zoom-in duration-200" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className={`text-[10px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-450' : 'text-slate-500'}`}>Security Passcode</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder={`Enter ${selectedRole} passcode`}
                  className={`w-full h-10 border rounded-lg pl-10 pr-4 text-xs focus:outline-none transition-all ${theme === 'dark'
                    ? 'bg-zinc-950/50 border-zinc-850 text-white placeholder:text-zinc-650 focus:border-indigo-505 focus:ring-indigo-505/20'
                    : 'bg-white border-slate-300 text-slate-850 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500/10'
                    }`}
                />
              </div>
            </div>
          )}

          {/* Error messages */}
          {errorMessage && (
            <div className={`flex items-center gap-2 text-xs p-3 rounded-lg animate-in fade-in slide-in-from-top-1 duration-150 ${theme === 'dark' ? 'text-rose-400 bg-rose-950/20 border border-rose-900/45' : 'text-rose-600 bg-rose-50 border border-rose-100'
              }`}>
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={selectedRole === 'employee' && !matchedEmployee}
            className={`w-full h-10 rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-white transition-all duration-150 cursor-pointer ${selectedRole === 'employee' && !matchedEmployee
              ? (theme === 'dark'
                ? 'bg-zinc-950/45 text-zinc-600 border border-zinc-900 cursor-not-allowed'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed')
              : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-md shadow-indigo-500/10 border border-indigo-500/20 hover:scale-[1.01]'
              }`}
          >
            <span>Authorize & Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Cheatsheet Panel */}
        <div className={`text-[10px] leading-relaxed p-4 border rounded-xl space-y-1 ${theme === 'dark' ? 'bg-zinc-950/30 border-zinc-850 text-zinc-450' : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
          <p className={`font-bold uppercase tracking-wider font-mono ${theme === 'dark' ? 'text-zinc-400' : 'text-indigo-600'}`}>Demo Credentials:</p>
          <p>Admin passcode: <strong className={theme === 'dark' ? 'text-zinc-350' : 'text-slate-700'}>"admin"</strong> | Supervisor: <strong className={theme === 'dark' ? 'text-zinc-350' : 'text-slate-700'}>"supervisor"</strong></p>
          <p>Employees: Badge ID <strong className={theme === 'dark' ? 'text-zinc-350' : 'text-slate-700'}>"KFIL/L1-406"</strong> or <strong className={theme === 'dark' ? 'text-zinc-350' : 'text-slate-700'}>"KFIL/L1-410"</strong></p>
        </div>

        {/* Footer */}
        <p className={`text-[8px] font-mono uppercase tracking-widest text-center ${theme === 'dark' ? 'text-zinc-550' : 'text-slate-400'}`}>
          © 2026 FOUNDTECH ENGINEERING
        </p>

      </div>

    </main>
  );
}
