import 'package:excel/excel.dart';
import '../services/payroll_service.dart';
import '../models/employee.dart';

class ExcelService {
  static List<int>? generatePayrollReport({required PayrollService service}) {
    final excel = Excel.createExcel();
    
    // Rename default sheet
    final String defaultSheet = excel.getDefaultSheet() ?? 'Sheet1';
    excel.rename(defaultSheet, 'Payroll Summary');
    
    final Sheet summarySheet = excel['Payroll Summary'];
    final Sheet attendanceSheet = excel['Attendance Logs'];
    final Sheet jobsSheet = excel['Supervisor Jobs'];

    // 1. STYLE HEADERS
    final CellStyle headerStyle = CellStyle(
      bold: true,
      fontColorHex: ExcelColor.fromHexString('#FFFFFF'),
      backgroundColorHex: ExcelColor.fromHexString('#1E293B'), // Dark charcoal/slate
      horizontalAlign: HorizontalAlign.Center,
    );

    // ----------------------------------------------------
    // SHEET 1: PAYROLL SUMMARY
    // ----------------------------------------------------
    final List<String> summaryHeaders = [
      'Employee ID',
      'Name',
      'Department',
      'Pay Basis',
      'Base Rate/Day',
      'Days Logged',
      'Overtime Hours',
      'Overtime Pay',
      'Late Days',
      'Late Penalty',
      'Absent Days',
      'Absent Penalty',
      'Load Job Pay',
      'Gross Salary',
      'Net Salary',
      'UAN NO',
      'ESIC NO',
      'Bank Name',
      'IFSC Code',
      'Bank Acc',
      'Punching Code',
      'Mobile No',
      'BASIC+DA',
      'HRA',
      'Other Allowances',
      'PF Deduction',
      'ESIC Deduction',
      'PT Deduction',
      'Other Deductions',
      'Total Deductions'
    ];

    for (int col = 0; col < summaryHeaders.length; col++) {
      final cell = summarySheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: 0));
      cell.value = TextCellValue(summaryHeaders[col]);
      cell.cellStyle = headerStyle;
    }

    int rowIdx = 1;
    for (var emp in service.employees) {
      final calc = service.calculatePayroll(emp);
      final isLoad = service.isEmployeeLoadBasis(emp.employeeId);

      final List<dynamic> rowValues = [
        emp.employeeId,
        emp.name,
        emp.department,
        isLoad ? 'Load Basis (Tons)' : 'Day Basis',
        isLoad ? 0.0 : emp.salaryPerDay,
        calc.totalDaysLogged,
        calc.overtimeHours.toStringAsFixed(2),
        calc.overtimeEarnings,
        calc.lateDays,
        calc.lateDeductions,
        calc.absentDays,
        calc.absentDeductions,
        calc.jobEarnings,
        calc.grossSalary,
        calc.netSalary,
        emp.uan,
        emp.esic,
        emp.bankName,
        emp.ifscCode,
        emp.bankAcc,
        emp.punchingCode,
        emp.mobileNo,
        calc.basicDa,
        calc.hra,
        calc.otherAllowance,
        calc.pfDeduction,
        calc.esicDeduction,
        calc.ptDeduction,
        calc.otherDeduction,
        calc.totalDeductions
      ];

      for (int col = 0; col < rowValues.length; col++) {
        final cell = summarySheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: rowIdx));
        final val = rowValues[col];
        if (val is double) {
          cell.value = DoubleCellValue(val);
        } else if (val is int) {
          cell.value = IntCellValue(val);
        } else {
          cell.value = TextCellValue(val.toString());
        }
      }
      rowIdx++;
    }

    // ----------------------------------------------------
    // SHEET 2: DETAILED ATTENDANCE LOGS
    // ----------------------------------------------------
    final List<String> attHeaders = [
      'Employee ID',
      'Name',
      'Date',
      'Check-In',
      'Check-Out',
      'Hours Worked',
      'Biometric Status'
    ];

    for (int col = 0; col < attHeaders.length; col++) {
      final cell = attendanceSheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: 0));
      cell.value = TextCellValue(attHeaders[col]);
      cell.cellStyle = headerStyle;
    }

    rowIdx = 1;
    for (var log in service.attendanceLogs) {
      final emp = service.employees.firstWhere(
        (e) => e.employeeId == log.employeeId,
        orElse: () => Employee(
          employeeId: log.employeeId,
          name: 'Unknown',
          department: 'Unknown',
          salaryPerDay: 0.0,
          deductionPerDay: 0.0,
        ),
      );

      final List<dynamic> rowValues = [
        log.employeeId,
        emp.name,
        log.date,
        log.checkIn,
        log.checkOut,
        log.hoursWorked.toStringAsFixed(2),
        log.status
      ];

      for (int col = 0; col < rowValues.length; col++) {
        final cell = attendanceSheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: rowIdx));
        final val = rowValues[col];
        if (val is double) {
          cell.value = DoubleCellValue(val);
        } else {
          cell.value = TextCellValue(val.toString());
        }
      }
      rowIdx++;
    }

    // ----------------------------------------------------
    // SHEET 3: SUPERVISOR JOB LOGS
    // ----------------------------------------------------
    final List<String> jobHeaders = [
      'Job ID',
      'Date',
      'Job Name',
      'Total Tons',
      'Rate per Ton',
      'Total Payout',
      'Crew Size',
      'Payout per Member',
      'Participating Crew IDs'
    ];

    for (int col = 0; col < jobHeaders.length; col++) {
      final cell = jobsSheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: 0));
      cell.value = TextCellValue(jobHeaders[col]);
      cell.cellStyle = headerStyle;
    }

    rowIdx = 1;
    for (var log in service.jobLogs) {
      final List<dynamic> rowValues = [
        log.id,
        log.date,
        log.jobName,
        log.totalTons,
        log.ratePerTon,
        log.totalPayout,
        log.employeeIds.length,
        log.splitPayout,
        log.employeeIds.join(', ')
      ];

      for (int col = 0; col < rowValues.length; col++) {
        final cell = jobsSheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: rowIdx));
        final val = rowValues[col];
        if (val is double) {
          cell.value = DoubleCellValue(val);
        } else if (val is int) {
          cell.value = IntCellValue(val);
        } else {
          cell.value = TextCellValue(val.toString());
        }
      }
      rowIdx++;
    }

    // Return the excel bytes
    return excel.save();
  }
}
