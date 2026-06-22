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
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [isDbOnline, setIsDbOnline] = useState(false);

  // Fetch employees on load to match against employee login
  useEffect(() => {
    fetch(`${API_URL}/api/employees`)
      .then(res => {
        if (res.ok) setIsDbOnline(true);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setEmployeesList(data);
        }
      })
      .catch(err => {
        console.error('Error fetching employees:', err);
        setIsDbOnline(false);
      });
  }, []);

  // Employee ID check logic
  useEffect(() => {
    if (selectedRole === 'employee' && employeeId.trim().length >= 4) {
      const match = employeesList.find(
        emp => emp.employeeId.toLowerCase() === employeeId.trim().toLowerCase()
      );
      if (match) {
        setMatchedEmployee(match);
        setErrorMessage('');
      } else {
        setMatchedEmployee(null);
        setErrorMessage('Employee ID not found in database');
      }
    } else {
      setMatchedEmployee(null);
      setErrorMessage('');
    }
  }, [employeeId, selectedRole, employeesList]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (selectedRole === 'employee') {
      if (matchedEmployee) {
        localStorage.setItem('employeeSession', JSON.stringify(matchedEmployee));
        router.push('/employee');
      } else {
        setErrorMessage('Please enter a valid Employee ID');
      }
    } else if (selectedRole === 'supervisor') {
      if (passcode.toLowerCase() === 'supervisor' || passcode === '123') {
        router.push('/supervisor');
      } else {
        setErrorMessage('Incorrect Supervisor passcode');
      }
    } else if (selectedRole === 'admin') {
      if (passcode.toLowerCase() === 'admin' || passcode === '123') {
        router.push('/admin');
      } else {
        setErrorMessage('Incorrect Admin passcode');
      }
    }
  };

  return (
    <main className="min-h-screen w-full flex bg-[#f8fafc] text-slate-800 font-sans">
      
      {/* LEFT PANEL: Premium Branding (Hidden on Mobile) */}
      <section className="hidden lg:flex w-1/2 flex-col justify-between p-16 border-r border-slate-200/80 bg-gradient-to-br from-slate-900 via-zinc-900 to-slate-950 text-white relative overflow-hidden">
        
        {/* Glow effect background */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-orange-600/5 blur-[100px] rounded-full pointer-events-none" />

        {/* Top Header */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shadow-md">
            <Fingerprint className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <span className="font-bold text-xs tracking-wider text-slate-200 uppercase font-mono">KFIL Solapur</span>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[8px] font-bold border border-emerald-500/25 uppercase tracking-widest font-mono">ADMS Live</span>
          </div>
        </div>

        {/* Hero Mid Description */}
        <div className="space-y-6 my-auto relative z-10">
          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight text-white leading-tight font-display">
              Enterprise Biometric <br />
              <span className="bg-gradient-to-r from-orange-500 to-amber-400 bg-clip-text text-transparent">Payroll System</span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md">
              A high-precision employee wages manager connecting biometric clock registers, shift calculations, and supervisor tonnage reports directly into your web browser.
            </p>
          </div>

          {/* Status Display Grid */}
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3 shadow-md backdrop-blur-sm">
              <div className={`w-3.5 h-3.5 rounded-full ${isDbOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'} shrink-0`} />
              <div>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Database Server</p>
                <p className="text-xs font-bold text-slate-200">{isDbOnline ? 'Connected' : 'Offline'}</p>
              </div>
            </div>

            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3 shadow-md backdrop-blur-sm">
              <Network className="w-5 h-5 text-orange-500 shrink-0" />
              <div>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Sync Mode</p>
                <p className="text-xs font-bold text-slate-200">ADMS Direct</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-[10px] text-slate-500 font-mono tracking-wider uppercase relative z-10">
          © 2026 Kirloskar Ferrous Industries Limited
        </div>
      </section>

      {/* RIGHT PANEL: Sleek White Card Form */}
      <section className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50/50">
        
        <div className="w-full max-w-[400px] space-y-6">
          
          {/* Logo on mobile */}
          <div className="lg:hidden flex flex-col items-center justify-center text-center space-y-2 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shadow-md">
              <Fingerprint className="w-7 h-7 text-orange-600" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">KFIL SOLAPUR</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold">Biometric Payroll Portal</p>
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 font-display">Sign In</h2>
            <p className="text-slate-400 text-xs">Enter credentials to access your payroll dashboard.</p>
          </div>

          {/* Form Card */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
            <form onSubmit={handleLogin} className="space-y-5">
              
              {/* Role Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
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
                    className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                      selectedRole === role
                        ? 'bg-white text-orange-600 shadow-sm border border-slate-200/60 font-black'
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
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Employee Badge ID</label>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Fingerprint className="w-4.5 h-4.5" />
                    </div>
                    <input
                      type="text"
                      required
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="e.g. KFIL/L1-406"
                      className="w-full h-11 bg-white border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 rounded-xl pl-10 pr-4 text-xs font-mono text-slate-800 focus:outline-none transition-all placeholder:text-slate-400"
                    />
                  </div>

                  {/* Profile match card */}
                  {matchedEmployee && (
                    <div className="flex items-center gap-3 bg-orange-50/50 border border-orange-100 rounded-2xl p-3 mt-3">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-700 text-xs border border-orange-200">
                        {matchedEmployee.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{matchedEmployee.name}</p>
                        <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold font-mono">{matchedEmployee.department} Department</p>
                      </div>
                      <CheckCircle className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Security Passcode</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4.5 h-4.5" />
                    </div>
                    <input
                      type="password"
                      required
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder={`Enter ${selectedRole} passcode`}
                      className="w-full h-11 bg-white border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 rounded-xl pl-10 pr-4 text-xs font-mono text-slate-800 focus:outline-none transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}

              {/* Error messages */}
              {errorMessage && (
                <div className="flex items-center gap-2 text-rose-600 text-[10px] font-bold bg-rose-50 border border-rose-100 p-3 rounded-xl">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={selectedRole === 'employee' && !matchedEmployee}
                className={`w-full h-11 rounded-xl flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-white transition-all duration-200 ${
                  selectedRole === 'employee' && !matchedEmployee
                    ? 'bg-slate-100 text-slate-400 border border-slate-200/50 cursor-not-allowed'
                    : 'bg-orange-600 hover:bg-orange-700 shadow-sm cursor-pointer shadow-orange-500/10'
                }`}
              >
                <span>Authorize & Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Cheatsheet Panel */}
          <div className="text-[9px] text-slate-400 leading-relaxed bg-slate-100/60 p-4 border border-slate-200/80 rounded-2xl font-medium">
            <p className="text-orange-600 font-bold mb-1 uppercase tracking-wider font-mono">Demo Credentials:</p>
            <p>Admin passcode: <strong className="text-slate-700 font-mono">"admin"</strong> | Supervisor: <strong className="text-slate-700 font-mono">"supervisor"</strong></p>
            <p className="mt-1">Employees: badge ID <strong className="text-slate-700 font-mono">"KFIL/L1-406"</strong> or <strong className="text-slate-700 font-mono">"KFIL/L1-410"</strong></p>
          </div>

        </div>
      </section>

    </main>
  );
}
