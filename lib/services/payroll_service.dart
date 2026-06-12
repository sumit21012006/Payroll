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

  // New real statutory fields
  final double basicPay;
  final double otPay;
  final double basicDa;
  final double hra;
  final double otherAllowance;
  final double pfDeduction;
  final double esicDeduction;
  final double ptDeduction;
  final double otherDeduction;
  final double totalDeductions;

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
    this.basicPay = 0.0,
    this.otPay = 0.0,
    this.basicDa = 0.0,
    this.hra = 0.0,
    this.otherAllowance = 0.0,
    this.pfDeduction = 0.0,
    this.esicDeduction = 0.0,
    this.ptDeduction = 0.0,
    this.otherDeduction = 0.0,
    this.totalDeductions = 0.0,
  });
}

class PayrollService {
  List<Employee> employees = [];
  List<Attendance> attendanceLogs = [];
  List<JobLog> jobLogs = [];
  
  // Custom load-basis overrides (set of employee IDs designated as load basis)
  Set<String> loadBasisEmployeeIds = {};

  // Department-specific configurations: units, default rates, and shift recommendations
  static const Map<String, Map<String, dynamic>> departmentConfigs = {
    'HE': {
      'unit': 'Tons',
      'rate': 320.0,
      'recommendation': 'Per Ton - ₹320/-',
    },
    'FINAL': {
      'unit': 'Tons',
      'rate': 220.0,
      'recommendation': 'Per Ton - ₹220/-',
    },
    'REWORK': {
      'unit': 'Pieces',
      'rate': 4.90,
      'recommendation': 'Per Piece - ₹4.90/- (2 Employees)',
    },
    'PAINTER': {
      'unit': 'Pieces',
      'rate': 6.00,
      'recommendation': 'Per Piece - ₹6/- (3 Shifts, 3 Employees per shift)',
    },
    'AVG': {
      'unit': 'Pieces',
      'rate': 5.00,
      'recommendation': 'Per Piece - ₹5/- (2 Shifts, 1 Employee per shift)',
    },
    'YANMAR LINE': {
      'unit': 'Pieces',
      'rate': 28.00,
      'recommendation': 'Per Piece - ₹28/- (1 Shift, 3 Employees)',
    },
  };

  Map<String, dynamic> getDeptConfig(String deptName) {
    final key = deptName.toUpperCase().trim();
    if (key.contains('YANMAR')) {
      return departmentConfigs['YANMAR LINE']!;
    }
    if (key.contains('PAINTER')) {
      return departmentConfigs['PAINTER']!;
    }
    if (departmentConfigs.containsKey(key)) {
      return departmentConfigs[key]!;
    }
    // Fallback default
    return {
      'unit': 'Tons',
      'rate': defaultRatePerTon,
      'recommendation': 'Custom Job',
    };
  }

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
      // Designate "Painter", "Yanmar Line" ("yanmarkline"), "Rework", "Final", and "Avg" departments as Load-Basis by default
      final loadBasisDepts = {'painter', 'yanmar line', 'yanmarkline', 'rework', 'final', 'avg'};
      for (var emp in employees) {
        final dept = emp.department.toLowerCase().replaceAll(' ', '').trim();
        if (loadBasisDepts.contains(dept) || dept.contains('yanmar') || dept.contains('painter')) {
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
    final loadBasisDepts = {'painter', 'yanmar line', 'yanmarkline', 'rework', 'final', 'avg'};
    final loadBasisEmpIds = employees
        .where((e) {
          final dept = e.department.toLowerCase().replaceAll(' ', '').trim();
          return loadBasisDepts.contains(dept) || dept.contains('yanmar') || dept.contains('painter');
        })
        .map((e) => e.employeeId)
        .toList();

    final prodEmpIds = loadBasisEmpIds; // Keep local name for compatibility with other methods
    if (prodEmpIds.isEmpty) return;

    final heEmpIds = employees.where((e) => e.department.toUpperCase() == 'HE').map((e) => e.employeeId).toList();
    final finalEmpIds = employees.where((e) => e.department.toUpperCase() == 'FINAL').map((e) => e.employeeId).toList();
    final reworkEmpIds = employees.where((e) => e.department.toUpperCase() == 'REWORK').map((e) => e.employeeId).toList();
    final painterEmpIds = employees.where((e) => e.department.toUpperCase().contains('PAINTER')).map((e) => e.employeeId).toList();
    final avgEmpIds = employees.where((e) => e.department.toUpperCase() == 'AVG').map((e) => e.employeeId).toList();
    final yanmarEmpIds = employees.where((e) => e.department.toUpperCase().contains('YANMAR')).map((e) => e.employeeId).toList();

    // Helper to get subset of employees
    List<String> getSubset(List<String> list, int start, int count) {
      if (list.isEmpty) return [];
      final List<String> result = [];
      for (int i = 0; i < count; i++) {
        result.add(list[(start + i) % list.length]);
      }
      return result;
    }

    List<String> getDeptCrew(List<String> deptList) {
      return deptList.isNotEmpty ? deptList : prodEmpIds;
    }

    jobLogs = [
      JobLog(
        id: 'JOB-101',
        date: '5/4/2026',
        jobName: 'HE Casting Operation',
        totalTons: 120.0,
        ratePerTon: 320.0,
        unit: 'Tons',
        employeeIds: getSubset(getDeptCrew(heEmpIds), 0, 4),
      ),
      JobLog(
        id: 'JOB-102',
        date: '5/6/2026',
        jobName: 'Final Warehouse Loadout',
        totalTons: 95.0,
        ratePerTon: 220.0,
        unit: 'Tons',
        employeeIds: getSubset(getDeptCrew(finalEmpIds), 0, 3),
      ),
      JobLog(
        id: 'JOB-103',
        date: '5/8/2026',
        jobName: 'Rework Area Jobs',
        totalTons: 3200.0,
        ratePerTon: 4.90,
        unit: 'Pieces',
        employeeIds: getSubset(getDeptCrew(reworkEmpIds), 0, 2),
      ),
      JobLog(
        id: 'JOB-104',
        date: '5/11/2026',
        jobName: 'Painting Platform Shift 1',
        totalTons: 1800.0,
        ratePerTon: 6.00,
        unit: 'Pieces',
        employeeIds: getSubset(getDeptCrew(painterEmpIds), 0, 3),
      ),
      JobLog(
        id: 'JOB-105',
        date: '5/15/2026',
        jobName: 'Painting Platform Shift 2',
        totalTons: 2100.0,
        ratePerTon: 6.00,
        unit: 'Pieces',
        employeeIds: getSubset(getDeptCrew(painterEmpIds), 3, 3),
      ),
      JobLog(
        id: 'JOB-106',
        date: '5/20/2026',
        jobName: 'AVG Sorting Line',
        totalTons: 1500.0,
        ratePerTon: 5.00,
        unit: 'Pieces',
        employeeIds: getSubset(getDeptCrew(avgEmpIds), 0, 1),
      ),
      JobLog(
        id: 'JOB-107',
        date: '5/25/2026',
        jobName: 'Yanmar Line Assembly',
        totalTons: 450.0,
        ratePerTon: 28.00,
        unit: 'Pieces',
        employeeIds: getSubset(getDeptCrew(yanmarEmpIds), 0, 3),
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

  double getEmployeeJobSplit(JobLog job, String employeeId) {
    if (!isEmployeeLoadBasis(employeeId)) {
      return 0.0;
    }

    final crew = job.employeeIds;
    final loadBasisCrew = crew.where((id) => isEmployeeLoadBasis(id)).toList();
    final dayBasisCrew = crew.where((id) => !isEmployeeLoadBasis(id)).toList();

    if (loadBasisCrew.isEmpty) {
      return 0.0;
    }

    double totalDayWagesToDeduct = 0.0;
    for (var dayEmpId in dayBasisCrew) {
      final emp = employees.firstWhere(
        (e) => e.employeeId == dayEmpId,
        orElse: () => Employee(
          employeeId: dayEmpId,
          name: '',
          department: '',
          salaryPerDay: 636.0,
          deductionPerDay: 0.0,
        ),
      );
      totalDayWagesToDeduct += emp.salaryPerDay > 0 ? emp.salaryPerDay : 636.0;
    }

    final double remainingPool = job.totalPayout - totalDayWagesToDeduct;
    if (remainingPool <= 0.0) {
      return 0.0;
    }

    return remainingPool / loadBasisCrew.length;
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

      final double duration = log.hoursWorked;
      if (duration > standardShiftHours) {
        otHours += (duration - standardShiftHours);
      } else if (status.contains('OVERTIME') && duration > 0.0) {
        otHours += duration;
      }
    }

    final int daysLogged = empLogs.length;

    // Calculate absent days (unpaid leaves)
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

    // Load-basis and Day-basis employees both get their share of supervisor Job splits!
    double jobEarn = 0.0;
    for (var job in jobLogs) {
      if (job.employeeIds.contains(employee.employeeId)) {
        jobEarn += getEmployeeJobSplit(job, employee.employeeId);
      }
    }

    // Run real company statutory math
    double basicPay = 0.0;
    double otPay = 0.0;
    double basicDa = 0.0;
    double hra = 0.0;
    double otherAllowance = 0.0;
    double pfDeduction = 0.0;
    double esicDeduction = 0.0;
    double ptDeduction = 0.0;
    double otherDeduction = 0.0;
    double totalDeductions = 0.0;

    double gross = 0.0;
    double net = 0.0;

    if (!isLoadBasis) {
      // Day-basis employee calculations
      final double rate = employee.salaryPerDay > 0 ? employee.salaryPerDay : 636.0;
      
      final double workedDays = (present + lates).toDouble() + (halfDays.toDouble() * 0.5);
      final double otDays = overtimes.toDouble();
      
      basicPay = workedDays * rate;
      otPay = otDays * rate;
      gross = basicPay + otPay + jobEarn;

      // BASIC+DA = workedDays * (15746 / 26) = workedDays * 605.61538
      basicDa = (workedDays * (15746.0 / 26.0)).roundToDouble();
      
      // HRA = 5% of BASIC+DA
      hra = (basicDa * 0.05).roundToDouble();
      
      // Other Allowance = Gross - BASIC+DA - HRA
      otherAllowance = gross - basicDa - hra;
      if (otherAllowance < 0.0) otherAllowance = 0.0;

      // Deductions
      // PF = 12% of BASIC+DA
      pfDeduction = (basicDa * 0.12).roundToDouble();

      // ESIC = 0.75% of Gross Wages
      esicDeduction = (gross * 0.0075).roundToDouble();

      // PT = Maharashtra Slab based on Gross Wages
      if (gross <= 7500.0) {
        ptDeduction = 0.0;
      } else if (gross <= 10000.0) {
        ptDeduction = 175.0;
      } else {
        ptDeduction = 200.0;
      }

      // Other deduction (Mess/Canteen charge = 500 flat)
      if (gross > 0.0) {
        otherDeduction = 500.0;
      } else {
        otherDeduction = 0.0;
      }

      totalDeductions = pfDeduction + esicDeduction + ptDeduction + otherDeduction;
      net = gross - totalDeductions;
    } else {
      // Load-basis calculations
      basicPay = 0.0;
      otPay = 0.0;
      gross = jobEarn;
      
      basicDa = 0.0;
      hra = 0.0;
      otherAllowance = 0.0;
      pfDeduction = 0.0;
      esicDeduction = 0.0;
      ptDeduction = 0.0;
      otherDeduction = 0.0;
      totalDeductions = 0.0;
      
      net = gross;
    }

    return PayrollCalculation(
      employee: employee,
      totalDaysLogged: daysLogged,
      presentDays: present,
      lateDays: lates,
      overtimeDays: overtimes,
      halfDays: halfDays,
      absentDays: rawAbsentWeekdays,
      overtimeHours: otHours,
      
      baseEarnings: basicPay,
      overtimeEarnings: otPay,
      lateDeductions: totalDeductions, // mapped to totalDeductions for backward compatibility
      absentDeductions: 0.0,
      jobEarnings: jobEarn,
      grossSalary: gross,
      netSalary: net < 0.0 ? 0.0 : net,

      basicPay: basicPay,
      otPay: otPay,
      basicDa: basicDa,
      hra: hra,
      otherAllowance: otherAllowance,
      pfDeduction: pfDeduction,
      esicDeduction: esicDeduction,
      ptDeduction: ptDeduction,
      otherDeduction: otherDeduction,
      totalDeductions: totalDeductions,
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
