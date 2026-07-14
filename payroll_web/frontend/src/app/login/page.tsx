"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, Lock, ShieldAlert, CheckCircle, ArrowRight, Network } from 'lucide-react';
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
    <main className="min-h-screen w-full flex bg-slate-50 text-slate-900 font-sans">
      
      {/* LEFT PANEL: Professional Branding (Hidden on Mobile) */}
      <section className="hidden lg:flex w-1/2 flex-col justify-between p-16 border-r border-slate-200 bg-slate-900 text-white relative overflow-hidden">
        
        {/* Top Header */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shadow-sm">
            <Fingerprint className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <span className="font-bold text-xs tracking-wider text-slate-200 uppercase">KFIL SOLAPUR</span>
            <span className="ml-2 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold border border-emerald-500/20 uppercase tracking-widest">ADMS LIVE</span>
          </div>
        </div>

        {/* Hero Mid Description */}
        <div className="space-y-6 my-auto relative z-10">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
              Enterprise Biometric <br />
              <span className="text-indigo-400">Payroll Portal</span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md">
              A high-precision employee wages manager connecting biometric clock registers, shift calculations, and supervisor tonnage reports directly into your web browser.
            </p>
          </div>

          {/* Status Display Grid */}
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="p-4 bg-slate-800/50 border border-slate-800 rounded-xl flex items-center gap-3 shadow-xs">
              <div className={`w-3 h-3 rounded-full ${isDbOnline ? 'bg-emerald-500' : 'bg-rose-500'} shrink-0`} />
              <div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Database Server</p>
                <p className="text-xs font-bold text-slate-200">{isDbOnline ? 'Connected' : 'Offline'}</p>
              </div>
            </div>

            <div className="p-4 bg-slate-800/50 border border-slate-800 rounded-xl flex items-center gap-3 shadow-xs">
              <Network className="w-5 h-5 text-indigo-500 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Sync Mode</p>
                <p className="text-xs font-bold text-slate-200">ADMS Direct</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-[10px] text-slate-500 font-medium tracking-wider uppercase relative z-10">
          © 2026 Kirloskar Ferrous Industries Limited
        </div>
      </section>

      {/* RIGHT PANEL: Sleek White Card Form */}
      <section className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        
        <div className="w-full max-w-[400px] space-y-6">
          
          {/* Logo on mobile */}
          <div className="lg:hidden flex flex-col items-center justify-center text-center space-y-2 mb-6">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shadow-xs">
              <Fingerprint className="w-7 h-7 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">KFIL SOLAPUR</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Biometric Payroll Portal</p>
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign In</h2>
            <p className="text-slate-500 text-xs">Enter credentials to access your payroll dashboard.</p>
          </div>

          {/* Form Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <form onSubmit={handleLogin} className="space-y-5">
              
              {/* Role Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
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
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                      selectedRole === role
                        ? 'bg-white text-indigo-600 shadow-xs border border-slate-200'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>

              {/* Input fields */}
              {selectedRole === 'employee' ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-700">Employee Badge ID</label>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Fingerprint className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="e.g. KFIL/L1-406"
                      className="w-full h-10 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-10 pr-4 text-xs text-slate-850 focus:outline-none transition-all placeholder:text-slate-400"
                    />
                  </div>

                  {/* Profile match card */}
                  {matchedEmployee && (
                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 mt-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center font-bold text-indigo-700 text-xs border border-indigo-100">
                        {matchedEmployee.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{matchedEmployee.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">{matchedEmployee.department} Department</p>
                      </div>
                      <CheckCircle className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">Security Passcode</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      required
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder={`Enter ${selectedRole} passcode`}
                      className="w-full h-10 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-10 pr-4 text-xs text-slate-850 focus:outline-none transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}

              {/* Error messages */}
              {errorMessage && (
                <div className="flex items-center gap-2 text-rose-600 text-xs bg-rose-50 border border-rose-100 p-3 rounded-lg">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={selectedRole === 'employee' && !matchedEmployee}
                className={`w-full h-10 rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-white transition-all duration-150 ${
                  selectedRole === 'employee' && !matchedEmployee
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-xs cursor-pointer'
                }`}
              >
                <span>Authorize & Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Cheatsheet Panel */}
          <div className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 p-4 border border-slate-200 rounded-lg">
            <p className="text-indigo-600 font-bold mb-1 uppercase tracking-wider">Demo Credentials:</p>
            <p>Admin passcode: <strong className="text-slate-700">"admin"</strong> | Supervisor: <strong className="text-slate-700">"supervisor"</strong></p>
            <p className="mt-1">Employees: badge ID <strong className="text-slate-700">"KFIL/L1-406"</strong> or <strong className="text-slate-700">"KFIL/L1-410"</strong></p>
          </div>

        </div>
      </section>

    </main>
  );
}
