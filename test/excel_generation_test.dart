import 'package:flutter_test/flutter_test.dart';
import 'package:excel/excel.dart';
import 'package:payroll_app/services/payroll_service.dart';
import 'package:payroll_app/services/excel_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('Dynamic Excel Report Generation Test', () async {
    final payrollService = PayrollService();
    await payrollService.init();

    expect(payrollService.employees.isNotEmpty, true, reason: 'Employees list should not be empty');
    expect(payrollService.attendanceLogs.isNotEmpty, true, reason: 'Attendance logs list should not be empty');

    final bytes = await ExcelService.generatePayrollReport(service: payrollService);
    expect(bytes, isNotNull, reason: 'Generated Excel report bytes should not be null');

    final excel = Excel.decodeBytes(bytes!);
    final sheets = excel.tables.keys.toList();

    expect(sheets.contains('Day Basis Wages Register'), true, reason: 'Day Basis Wages Register sheet is missing');
    expect(sheets.contains('Load Basis Wages Register'), true, reason: 'Load Basis Wages Register sheet is missing');
    expect(sheets.contains('Load Basis Work Database'), true, reason: 'Load Basis Work Database sheet is missing');
    expect(sheets.contains('Attendance Logs'), true, reason: 'Attendance Logs sheet is missing');

    // Check Day Basis Sheet
    final daySheet = excel['Day Basis Wages Register'];
    expect(daySheet.maxRows >= 12, true, reason: 'Day Basis Register should have header rows and employee data');

    // Check Load Basis Sheet
    final loadSheet = excel['Load Basis Wages Register'];
    expect(loadSheet.maxRows >= 12, true, reason: 'Load Basis Register should have header rows and employee data');

    // Check Load Basis Work Database Sheet
    final dbSheet = excel['Load Basis Work Database'];
    expect(dbSheet.maxRows > 1, true, reason: 'Load Basis Work Database should have headers and rows');

    // Check Attendance Logs Sheet
    final attSheet = excel['Attendance Logs'];
    expect(attSheet.maxRows > 1, true, reason: 'Attendance Logs should have headers and rows');
  });
}
