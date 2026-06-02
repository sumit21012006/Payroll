import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/payroll_service.dart';
import '../models/employee.dart';
import '../models/attendance.dart';
import '../models/job_log.dart';
import '../widgets/glowing_card.dart';
import '../widgets/attendance_calendar.dart';
import 'login_screen.dart';

class EmployeeDashboard extends StatelessWidget {
  final Employee employee;
  final PayrollService payrollService;

  const EmployeeDashboard({
    super.key,
    required this.employee,
    required this.payrollService,
  });

  @override
  Widget build(BuildContext context) {
    final Size size = MediaQuery.of(context).size;
    final isDesktop = size.width > 900;

    final calculation = payrollService.calculatePayroll(employee);
    final isLoadBasis = payrollService.isEmployeeLoadBasis(employee.employeeId);

    // Filter jobs this employee participated in
    final employeeJobs = payrollService.jobLogs
        .where((job) => job.employeeIds.contains(employee.employeeId))
        .toList();

    // Sum of tons logged for this employee (Total tons split evenly by crew size)
    double totalTonsLogged = 0.0;
    for (var job in employeeJobs) {
      totalTonsLogged += job.totalTons / job.employeeIds.length;
    }

    final empLogs = payrollService.attendanceLogs
        .where((log) => log.employeeId == employee.employeeId)
        .toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Row(
          children: [
            CircleAvatar(
              backgroundColor: isLoadBasis ? Colors.purpleAccent.withOpacity(0.2) : Colors.cyanAccent.withOpacity(0.2),
              radius: 16.0,
              child: Text(
                employee.name.substring(0, 1),
                style: TextStyle(
                  color: isLoadBasis ? Colors.purpleAccent : Colors.cyanAccent, 
                  fontWeight: FontWeight.bold,
                  fontSize: 14.0,
                ),
              ),
            ),
            const SizedBox(width: 10.0),
            Text(
              'EMPLOYEE PORTAL',
              style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 16.0),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Download Payslip',
            icon: const Icon(Icons.receipt_long, color: Colors.cyanAccent),
            onPressed: () => _showPayslipDialog(context, calculation, employeeJobs, totalTonsLogged, isLoadBasis),
          ),
          IconButton(
            tooltip: 'Logout',
            icon: const Icon(Icons.logout, color: Colors.redAccent),
            onPressed: () {
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => LoginScreen(payrollService: payrollService)),
              );
            },
          ),
        ],
      ),
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFF0F172A),
              Color(0xFF020617),
            ],
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Welcome Header
              _buildHeader(isLoadBasis),
              const SizedBox(height: 24.0),
              
              // Metric Grid
              _buildMetricGrid(calculation, employeeJobs.length, totalTonsLogged, isLoadBasis, isDesktop),
              const SizedBox(height: 24.0),
              
              // Main content (Interactive Calendar + Attendance Table)
              if (isDesktop)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Calendar Block
                    Expanded(
                      flex: 5,
                      child: GlowingCard(
                        margin: EdgeInsets.zero,
                        child: AttendanceCalendar(
                          employeeId: employee.employeeId,
                          logs: empLogs,
                          jobs: payrollService.jobLogs,
                        ),
                      ),
                    ),
                    const SizedBox(width: 24.0),
                    // Logs Table Block
                    Expanded(
                      flex: 4,
                      child: _buildDetailsLists(empLogs, employeeJobs, isLoadBasis),
                    ),
                  ],
                )
              else
                Column(
                  children: [
                    GlowingCard(
                      margin: EdgeInsets.zero,
                      child: AttendanceCalendar(
                        employeeId: employee.employeeId,
                        logs: empLogs,
                        jobs: payrollService.jobLogs,
                      ),
                    ),
                    const SizedBox(height: 24.0),
                    _buildDetailsLists(empLogs, employeeJobs, isLoadBasis),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(bool isLoad) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Welcome Back, ${employee.name}',
              style: GoogleFonts.outfit(
                fontSize: 22.0,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
            Text(
              'Department: ${employee.department}   |   ID: ${employee.employeeId}   |   Type: ${isLoad ? "Load-Basis (Per Ton)" : "Day-Basis"}',
              style: const TextStyle(color: Colors.white38, fontSize: 12.0),
            ),
          ],
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 6.0),
          decoration: BoxDecoration(
            color: isLoad ? Colors.purple.withOpacity(0.1) : Colors.cyan.withOpacity(0.1),
            borderRadius: BorderRadius.circular(20.0),
            border: Border.all(color: isLoad ? Colors.purpleAccent.withOpacity(0.3) : Colors.cyanAccent.withOpacity(0.3)),
          ),
          child: Text(
            isLoad ? '🍇 LOAD WORKER' : '🔋 SALARIED STAFF',
            style: TextStyle(
              color: isLoad ? Colors.purpleAccent : Colors.cyanAccent, 
              fontSize: 11.0, 
              fontWeight: FontWeight.bold,
              letterSpacing: 1.0,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMetricGrid(
    PayrollCalculation calc, 
    int jobsCount, 
    double tonsCount, 
    bool isLoad,
    bool isDesktop,
  ) {
    // We will show 4 summary cards based on role
    final List<Widget> cards = [];

    Widget metricCard(String label, String value, IconData icon, Color color) {
      return GlowingCard(
        margin: const EdgeInsets.symmetric(horizontal: 4.0),
        glowColor: color,
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: color.withOpacity(0.1),
              radius: 20.0,
              child: Icon(icon, color: color, size: 20.0),
            ),
            const SizedBox(width: 14.0),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label, 
                    style: const TextStyle(color: Colors.white38, fontSize: 11.0, fontWeight: FontWeight.bold),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4.0),
                  Text(
                    value,
                    style: GoogleFonts.outfit(
                      fontSize: 18.0,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    if (!isLoad) {
      // Day-basis
      cards.addAll([
        metricCard('DAYS WORKED', '${calc.totalDaysLogged} Days', Icons.calendar_month_outlined, Colors.green),
        metricCard('OVERTIME PAY', '₹${calc.overtimeEarnings.toStringAsFixed(0)}', Icons.bolt, Colors.purpleAccent),
        metricCard('CUTTINGS (LATE/ABS)', '-₹${(calc.lateDeductions + calc.absentDeductions).toStringAsFixed(0)}', Icons.money_off, Colors.redAccent),
        metricCard('NET PAYABLE', '₹${calc.netSalary.toStringAsFixed(0)}', Icons.payments_outlined, Colors.cyanAccent),
      ]);
    } else {
      // Load-basis
      cards.addAll([
        metricCard('JOBS WORKED', '$jobsCount Jobs', Icons.layers_outlined, Colors.purpleAccent),
        metricCard('TONS ALLOCATED', '${tonsCount.toStringAsFixed(1)} Tons', Icons.fitness_center_outlined, Colors.green),
        metricCard('AVG SPLIT / JOB', '₹${jobsCount > 0 ? (calc.jobEarnings / jobsCount).toStringAsFixed(1) : "0"}', Icons.analytics_outlined, Colors.amber),
        metricCard('TOTAL LOAD PAY', '₹${calc.netSalary.toStringAsFixed(0)}', Icons.payments_outlined, Colors.cyanAccent),
      ]);
    }

    if (isDesktop) {
      return Row(
        children: cards.map((c) => Expanded(child: c)).toList(),
      );
    } else {
      return Column(
        children: cards.map((c) => Padding(
          padding: const EdgeInsets.only(bottom: 12.0),
          child: c,
        )).toList(),
      );
    }
  }

  Widget _buildDetailsLists(List<Attendance> logs, List<JobLog> workedJobs, bool isLoad) {
    return Column(
      children: [
        // Biometric Logs List
        GlowingCard(
          margin: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '🕒 BIOMETRIC ATTENDANCE RECORD',
                style: TextStyle(fontSize: 14.0, fontWeight: FontWeight.bold, color: Colors.cyanAccent),
              ),
              const Divider(color: Colors.white12, height: 20.0),
              logs.isEmpty
                  ? const SizedBox(
                      height: 150.0,
                      child: Center(
                        child: Text('No biometric logs recorded.', style: TextStyle(color: Colors.white24)),
                      ),
                    )
                  : SizedBox(
                      height: 250.0,
                      child: ListView.builder(
                        itemCount: logs.length,
                        itemBuilder: (context, idx) {
                          final log = logs[logs.length - 1 - idx];
                          Color badgeCol = Colors.grey;
                          final status = log.status.toUpperCase();
                          if (status.contains('PRESENT')) badgeCol = Colors.green;
                          if (status.contains('LATE')) badgeCol = Colors.amber;
                          if (status.contains('OVERTIME')) badgeCol = Colors.purpleAccent;
                          if (status.contains('HALF_DAY')) badgeCol = Colors.cyan;

                          return Container(
                            margin: const EdgeInsets.symmetric(vertical: 4.0),
                            padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.01),
                              borderRadius: BorderRadius.circular(8.0),
                              border: Border.all(color: Colors.white.withOpacity(0.04)),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      log.date,
                                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12.0),
                                    ),
                                    Text(
                                      'Hours: ${log.checkIn} - ${log.checkOut} (${log.hoursWorked.toStringAsFixed(2)} hrs)',
                                      style: const TextStyle(color: Colors.white38, fontSize: 11.0),
                                    ),
                                  ],
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                                  decoration: BoxDecoration(
                                    color: badgeCol.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(10.0),
                                    border: Border.all(color: badgeCol.withOpacity(0.3)),
                                  ),
                                  child: Text(
                                    log.status,
                                    style: TextStyle(color: badgeCol, fontSize: 10.0, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
            ],
          ),
        ),
        
        const SizedBox(height: 24.0),
        
        // Supervisor Load Jobs list
        GlowingCard(
          margin: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '🍇 LOAD-BASIS JOBS LOGGED',
                style: TextStyle(fontSize: 14.0, fontWeight: FontWeight.bold, color: Colors.purpleAccent),
              ),
              const Divider(color: Colors.white12, height: 20.0),
              workedJobs.isEmpty
                  ? const SizedBox(
                      height: 150.0,
                      child: Center(
                        child: Text('No loader job logs logged.', style: TextStyle(color: Colors.white24)),
                      ),
                    )
                  : SizedBox(
                      height: 220.0,
                      child: ListView.builder(
                        itemCount: workedJobs.length,
                        itemBuilder: (context, idx) {
                          final job = workedJobs[workedJobs.length - 1 - idx];
                          return Container(
                            margin: const EdgeInsets.symmetric(vertical: 4.0),
                            padding: const EdgeInsets.all(10.0),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.01),
                              borderRadius: BorderRadius.circular(8.0),
                              border: Border.all(color: Colors.white.withOpacity(0.04)),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        job.jobName,
                                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12.0),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      Text(
                                        'Tons: ${job.totalTons.toStringAsFixed(0)} (Crew size: ${job.employeeIds.length})',
                                        style: const TextStyle(color: Colors.white38, fontSize: 11.0),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      job.date,
                                      style: const TextStyle(color: Colors.purpleAccent, fontWeight: FontWeight.bold, fontSize: 11.0),
                                    ),
                                    Text(
                                      '+₹${job.splitPayout.toStringAsFixed(0)}',
                                      style: const TextStyle(color: Colors.cyanAccent, fontWeight: FontWeight.bold, fontSize: 13.0),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
            ],
          ),
        ),
      ],
    );
  }

  void _showPayslipDialog(
    BuildContext context, 
    PayrollCalculation calc, 
    List<JobLog> employeeJobs, 
    double totalTons,
    bool isLoad,
  ) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF151D2A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15.0)),
          title: Center(
            child: Column(
              children: [
                const Icon(Icons.receipt_long, color: Colors.cyanAccent, size: 40.0),
                const SizedBox(height: 8.0),
                Text(
                  'MONTHLY PAYSLIP',
                  style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 18.0),
                ),
                Text(
                  'Month of May 2026',
                  style: GoogleFonts.inter(color: Colors.white38, fontSize: 11.0),
                ),
              ],
            ),
          ),
          content: SizedBox(
            width: 400.0,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Divider(color: Colors.white24, height: 16.0),
                  // Employee details
                  _payslipRow('Employee Name', employee.name, isBold: true),
                  _payslipRow('Employee ID', employee.employeeId),
                  _payslipRow('Department', employee.department),
                  _payslipRow('Payment Model', isLoad ? 'Load Basis (Per Ton)' : 'Day Basis'),
                  const Divider(color: Colors.white12, height: 24.0),
                  
                  // Earnings breakdown
                  const Text('EARNINGS', style: TextStyle(color: Colors.cyanAccent, fontSize: 11.0, fontWeight: FontWeight.bold, letterSpacing: 1.0)),
                  const SizedBox(height: 8.0),
                  if (!isLoad) ...[
                    _payslipRow('Base Days Worked (${calc.presentDays + calc.lateDays + calc.overtimeDays} days)', '₹${calc.baseEarnings.toStringAsFixed(2)}'),
                    _payslipRow('Half Days Worked (${calc.halfDays} days)', '₹${(calc.halfDays * employee.salaryPerDay * 0.5).toStringAsFixed(2)}'),
                    _payslipRow('Overtime Pay (${calc.overtimeHours.toStringAsFixed(2)} hrs)', '₹${calc.overtimeEarnings.toStringAsFixed(2)}'),
                  ] else ...[
                    _payslipRow('Load Tons Done (${totalTons.toStringAsFixed(1)} Tons)', '₹${calc.jobEarnings.toStringAsFixed(2)}'),
                    _payslipRow('Total Load Jobs Worked', '${employeeJobs.length} Jobs'),
                  ],
                  if (calc.jobEarnings > 0 && !isLoad) ...[
                    _payslipRow('Additional Load Job Payout', '₹${calc.jobEarnings.toStringAsFixed(2)}'),
                  ],
                  const Divider(color: Colors.white12, height: 24.0),
                  
                  // Deductions breakdown
                  const Text('CUTTINGS & DEDUCTIONS', style: TextStyle(color: Colors.redAccent, fontSize: 11.0, fontWeight: FontWeight.bold, letterSpacing: 1.0)),
                  const SizedBox(height: 8.0),
                  if (!isLoad) ...[
                    _payslipRow('Late Penalties (${calc.lateDays} occurrences)', '-₹${calc.lateDeductions.toStringAsFixed(2)}'),
                    _payslipRow('Unpaid Leaves (${calc.absentDays} days)', '-₹${calc.absentDeductions.toStringAsFixed(2)}'),
                  ] else ...[
                    const Text('No biometric cuttings/deductions for Load Basis staff.', style: TextStyle(color: Colors.white24, fontSize: 11.0, fontStyle: FontStyle.italic)),
                  ],
                  const Divider(color: Colors.white24, height: 24.0),
                  
                  // Final Net Payout
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'NET TAKE-HOME PAY',
                        style: GoogleFonts.outfit(color: Colors.white70, fontSize: 14.0, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        '₹${calc.netSalary.toStringAsFixed(2)}',
                        style: GoogleFonts.outfit(color: Colors.cyanAccent, fontSize: 18.0, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close', style: TextStyle(color: Colors.white54)),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Payslip receipt downloaded successfully!'), backgroundColor: Colors.green),
                );
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.cyan),
              child: const Text('Download PDF', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  Widget _payslipRow(String label, String value, {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12.0)),
          Text(
            value,
            style: TextStyle(
              color: isBold ? Colors.white : Colors.white.withOpacity(0.8), 
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
              fontSize: 12.0,
            ),
          ),
        ],
      ),
    );
  }
}
