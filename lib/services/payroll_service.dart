import 'package:flutter/services.dart' show rootBundle;
import 'package:csv/csv.dart';
import '../models/employee.dart';
import '../models/attendance.dart';
import '../models/job_log.dart';

class PayrollCalculation {
  final Employee employee;
  final int totalDaysLogged;
  final int presentDays;
  final int lateDays;
  final int overtimeDays;
  final int halfDays;
  final int absentDays;
  final double overtimeHours;
  
  final double baseEarnings;
  final double overtimeEarnings;
  final double lateDeductions;
  final double absentDeductions;
  final double jobEarnings;
  
  final double grossSalary;
  final double netSalary;

  PayrollCalculation({
    required this.employee,
    required this.totalDaysLogged,
    required this.presentDays,
    required this.lateDays,
    required this.overtimeDays,
    required this.halfDays,
    required this.absentDays,
    required this.overtimeHours,
    required this.baseEarnings,
    required this.overtimeEarnings,
    required this.lateDeductions,
    required this.absentDeductions,
    required this.jobEarnings,
    required this.grossSalary,
    required this.netSalary,
  });
}

class PayrollService {
  List<Employee> employees = [];
  List<Attendance> attendanceLogs = [];
  List<JobLog> jobLogs = [];
  
  // Custom load-basis overrides (set of employee IDs designated as load basis)
  Set<String> loadBasisEmployeeIds = {};

  // Customizable settings
  double standardShiftHours = 9.0;
  double overtimeMultiplier = 1.5;
  int allowedPaidLeaves = 2;
  double lateGraceMinutes = 15.0; // e.g. check-in after 9:15 AM is late
  double defaultRatePerTon = 15.0;

  bool isInitialized = false;

  Future<void> init() async {
    if (isInitialized) return;
    try {
      // 1. Parse Employees CSV
      final employeesCsvString = await rootBundle.loadString('assets/employees_100.csv');
      final List<List<dynamic>> employeeRows = csv.decode(employeesCsvString);
      
      // Skip header row
      if (employeeRows.isNotEmpty) {
        employees = employeeRows.skip(1)
            .where((row) => row.length >= 5 && row[0] != null && row[0].toString().isNotEmpty)
            .map((row) => Employee.fromCsvRow(row))
            .toList();
      }

      // 2. Parse Attendance CSV
      final attendanceCsvString = await rootBundle.loadString('assets/attendance_may_2026.csv');
      final List<List<dynamic>> attendanceRows = csv.decode(attendanceCsvString);
      
      // Skip header row
      if (attendanceRows.isNotEmpty) {
        attendanceLogs = attendanceRows.skip(1)
            .where((row) => row.length >= 5 && row[0] != null && row[0].toString().isNotEmpty)
            .map((row) => Attendance.fromCsvRow(row))
            .toList();
      }

      // 3. Designate default Load-Basis Employees
      // We will designate all "Production" department employees as Load-Basis by default!
      for (var emp in employees) {
        if (emp.department.toLowerCase() == 'production') {
          loadBasisEmployeeIds.add(emp.employeeId);
        }
      }

      // 4. Prepopulate realistic Supervisor Job Logs for May 2026
      _prepopulateJobLogs();

      isInitialized = true;
    } catch (e) {
      // Log errors or handle fallback gracefully
      print("Error initializing PayrollService: $e");
    }
  }

  void _prepopulateJobLogs() {
    final prodEmpIds = employees
        .where((e) => e.department.toLowerCase() == 'production')
        .map((e) => e.employeeId)
        .toList();

    if (prodEmpIds.isEmpty) return;

    // Helper to get subset of employees
    List<String> getSubset(List<String> list, int start, int count) {
      final List<String> result = [];
      for (int i = 0; i < count; i++) {
        result.add(list[(start + i) % list.length]);
      }
      return result;
    }

    jobLogs = [
      JobLog(
        id: 'JOB-101',
        date: '5/4/2026',
        jobName: 'Loading Steel Rails (Platform A)',
        totalTons: 120.0,
        ratePerTon: 15.0,
        employeeIds: getSubset(prodEmpIds, 0, 4),
      ),
      JobLog(
        id: 'JOB-102',
        date: '5/6/2026',
        jobName: 'Unloading Coal Cargo (Bay 3)',
        totalTons: 210.0,
        ratePerTon: 12.0,
        employeeIds: getSubset(prodEmpIds, 2, 5),
      ),
      JobLog(
        id: 'JOB-103',
        date: '5/8/2026',
        jobName: 'Iron Ore Sorting & Washing',
        totalTons: 85.0,
        ratePerTon: 20.0,
        employeeIds: getSubset(prodEmpIds, 5, 4),
      ),
      JobLog(
        id: 'JOB-104',
        date: '5/11/2026',
        jobName: 'Bauxite Heavy Transfer',
        totalTons: 160.0,
        ratePerTon: 16.0,
        employeeIds: getSubset(prodEmpIds, 1, 6),
      ),
      JobLog(
        id: 'JOB-105',
        date: '5/13/2026',
        jobName: 'Scrap Metal Compacting',
        totalTons: 95.0,
        ratePerTon: 18.0,
        employeeIds: getSubset(prodEmpIds, 4, 4),
      ),
      JobLog(
        id: 'JOB-106',
        date: '5/15/2026',
        jobName: 'Loading Finished Girders',
        totalTons: 150.0,
        ratePerTon: 15.0,
        employeeIds: getSubset(prodEmpIds, 0, 5),
      ),
      JobLog(
        id: 'JOB-107',
        date: '5/18/2026',
        jobName: 'Raw Materials Bin Stacking',
        totalTons: 110.0,
        ratePerTon: 14.0,
        employeeIds: getSubset(prodEmpIds, 3, 4),
      ),
      JobLog(
        id: 'JOB-108',
        date: '5/20/2026',
        jobName: 'Coke Fuel Loading',
        totalTons: 180.0,
        ratePerTon: 13.0,
        employeeIds: getSubset(prodEmpIds, 6, 5),
      ),
      JobLog(
        id: 'JOB-109',
        date: '5/22/2026',
        jobName: 'Steel Slag Extraction',
        totalTons: 75.0,
        ratePerTon: 25.0,
        employeeIds: getSubset(prodEmpIds, 2, 4),
      ),
      JobLog(
        id: 'JOB-110',
        date: '5/26/2026',
        jobName: 'Heavy Machinery Lubrication Load',
        totalTons: 140.0,
        ratePerTon: 15.0,
        employeeIds: getSubset(prodEmpIds, 5, 5),
      ),
      JobLog(
        id: 'JOB-111',
        date: '5/28/2026',
        jobName: 'Final Monthly Warehouse Loadout',
        totalTons: 250.0,
        ratePerTon: 12.0,
        employeeIds: prodEmpIds.sublist(0, prodEmpIds.length > 8 ? 8 : prodEmpIds.length),
      ),
    ];
  }

  // Toggle load basis mode for employee
  void toggleEmployeeLoadBasis(String id) {
    if (loadBasisEmployeeIds.contains(id)) {
      loadBasisEmployeeIds.remove(id);
    } else {
      loadBasisEmployeeIds.add(id);
    }
  }

  bool isEmployeeLoadBasis(String id) {
    return loadBasisEmployeeIds.contains(id);
  }

  // Add new supervisor Job Log
  void addJobLog(JobLog log) {
    jobLogs.add(log);
  }

  // Delete job log
  void deleteJobLog(String id) {
    jobLogs.removeWhere((log) => log.id == id);
  }

  // Main calculation engine
  PayrollCalculation calculatePayroll(Employee employee) {
    final empLogs = attendanceLogs.where((log) => log.employeeId == employee.employeeId).toList();
    final isLoadBasis = isEmployeeLoadBasis(employee.employeeId);

    int present = 0;
    int lates = 0;
    int overtimes = 0;
    int halfDays = 0;
    double otHours = 0.0;

    // Process biometric logs
    for (var log in empLogs) {
      final status = log.status.toUpperCase();
      if (status.contains('PRESENT')) {
        present++;
      } else if (status.contains('LATE')) {
        lates++;
      } else if (status.contains('OVERTIME')) {
        overtimes++;
      } else if (status.contains('HALF_DAY')) {
        halfDays++;
      }

      // Overtime hours calculation:
      // If check_out is 13:00 (which we see in some half-days/overtimes), hours might be short.
      // But standard overtime is calculated for hours exceeding the standard shift hours (e.g. 9 hours)
      final double duration = log.hoursWorked;
      if (duration > standardShiftHours) {
        otHours += (duration - standardShiftHours);
      } else if (status.contains('OVERTIME') && duration > 0.0) {
        // If status is OVERTIME but duration <= 9 (e.g. weekend or holiday short shift),
        // we pay all hours worked as overtime!
        otHours += duration;
      }
    }

    final int daysLogged = empLogs.length;

    // Calculate absent days (unpaid leaves)
    // May 2026 has 21 weekdays (Mon-Fri)
    // We check how many of those 21 weekdays the employee has any biometric record
    final List<String> weekdays = [];
    for (int d = 1; d <= 31; d++) {
      final dt = DateTime(2026, 5, d);
      if (dt.weekday != DateTime.saturday && dt.weekday != DateTime.sunday) {
        weekdays.add('5/$d/2026');
      }
    }

    final loggedWeekdays = empLogs
        .where((log) => weekdays.contains(log.date))
        .map((log) => log.date)
        .toSet();

    final int rawAbsentWeekdays = weekdays.length - loggedWeekdays.length;
    final int netUnpaidAbsents = rawAbsentWeekdays > allowedPaidLeaves 
        ? rawAbsentWeekdays - allowedPaidLeaves 
        : 0;

    // Calculate earnings components
    double baseEarn = 0.0;
    double otEarn = 0.0;
    double lateDeduct = 0.0;
    double absentDeduct = 0.0;

    if (!isLoadBasis) {
      // Day-basis employee calculations
      // PRESENT, LATE, and OVERTIME get full day rate. HALF_DAY gets 50%
      final double activeFullDays = (present + lates + overtimes).toDouble();
      final double activeHalfDays = halfDays.toDouble();
      
      baseEarn = (activeFullDays * employee.salaryPerDay) + (activeHalfDays * employee.salaryPerDay * 0.5);

      // Overtime Pay
      final double hourlyRate = employee.salaryPerDay / 8.0; // assuming 8 working hours per shift
      otEarn = otHours * hourlyRate * overtimeMultiplier;

      // Cuttings / Deductions
      lateDeduct = lates * employee.deductionPerDay;
      absentDeduct = netUnpaidAbsents * employee.salaryPerDay;
    } else {
      // Load-basis employee calculations
      // Base pay is 0. Overtime is 0. Absent deductions are 0.
      baseEarn = 0.0;
      otEarn = 0.0;
      lateDeduct = 0.0;
      absentDeduct = 0.0;
    }

    // Load-basis and Day-basis employees both get their share of supervisor Job splits!
    // Total job earnings = sum of split payouts for all jobs this employee worked on
    double jobEarn = 0.0;
    for (var job in jobLogs) {
      if (job.employeeIds.contains(employee.employeeId)) {
        jobEarn += job.splitPayout;
      }
    }

    // Gross and Net salary
    final double gross = baseEarn + otEarn + jobEarn;
    final double net = gross - lateDeduct - absentDeduct;

    return PayrollCalculation(
      employee: employee,
      totalDaysLogged: daysLogged,
      presentDays: present,
      lateDays: lates,
      overtimeDays: overtimes,
      halfDays: halfDays,
      absentDays: rawAbsentWeekdays,
      overtimeHours: otHours,
      baseEarnings: baseEarn,
      overtimeEarnings: otEarn,
      lateDeductions: lateDeduct,
      absentDeductions: absentDeduct,
      jobEarnings: jobEarn,
      grossSalary: gross,
      netSalary: net < 0.0 ? 0.0 : net, // net pay cannot be negative
    );
  }

  // Get department allocations breakdown
  Map<String, double> getDepartmentBudgets() {
    final Map<String, double> budgets = {};
    for (var emp in employees) {
      final calc = calculatePayroll(emp);
      budgets[emp.department] = (budgets[emp.department] ?? 0.0) + calc.netSalary;
    }
    return budgets;
  }

  // Update employee info
  void updateEmployee(Employee updated) {
    final index = employees.indexWhere((emp) => emp.employeeId == updated.employeeId);
    if (index != -1) {
      employees[index] = updated;
    }
  }

  // Import dynamic CSV data from files
  void importEmployeesFromList(List<List<dynamic>> rows) {
    if (rows.isNotEmpty) {
      employees = rows.skip(1)
          .where((row) => row.length >= 5 && row[0] != null && row[0].toString().isNotEmpty)
          .map((row) => Employee.fromCsvRow(row))
          .toList();
    }
  }

  void importAttendanceFromList(List<List<dynamic>> rows) {
    if (rows.isNotEmpty) {
      attendanceLogs = rows.skip(1)
          .where((row) => row.length >= 5 && row[0] != null && row[0].toString().isNotEmpty)
          .map((row) => Attendance.fromCsvRow(row))
          .toList();
    }
  }
}
