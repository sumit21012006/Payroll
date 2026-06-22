import 'dart:typed_data';
import 'dart:isolate';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart' show rootBundle;
import 'package:excel/excel.dart';
import '../services/payroll_service.dart';
import '../models/employee.dart';

class ExcelService {
  static Future<List<int>?> generatePayrollReport({required PayrollService service}) async {
    try {
      // 1. Load the template Excel file bytes on the main thread (platform channels)
      final ByteData data = await rootBundle.load('assets/Demo File For Sallay Wages.xlsx');
      final List<int> bytes = data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);

      // Actual Excel generation logic
      List<int>? runGeneration() {
        final excel = Excel.decodeBytes(bytes);

        if (excel.tables.keys.isEmpty) {
          throw Exception("Invalid template Excel file: No sheets found.");
        }

        final String templateSheetName = excel.tables.keys.first;
        final Sheet initialSheet = excel.tables[templateSheetName]!;

        // Extract template cell styles before we rename or modify anything
        // Row index 11 is row 12 of the template (employee data row style)
        final List<CellStyle?> templateStyles = List.generate(27, (col) {
          return initialSheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: 11)).cellStyle;
        });

        // Row index 121 is row 122 of the template (totals row style)
        final List<CellStyle?> totalRowStyles = List.generate(27, (col) {
          return initialSheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: 121)).cellStyle;
        });

        // Rename the first sheet to Day Basis Wages Register
        excel.rename(templateSheetName, 'Day Basis Wages Register');
        final Sheet dayBasisSheet = excel['Day Basis Wages Register'];

        // Create the Load Basis Wages Register sheet and copy style/structure
        final Sheet loadBasisSheet = excel['Load Basis Wages Register'];
        _copySheet(dayBasisSheet, loadBasisSheet);

        // Partition employees
        final dayBasisEmployees = service.employees.where((e) => !service.isEmployeeLoadBasis(e.employeeId)).toList();
        final loadBasisEmployees = service.employees.where((e) => service.isEmployeeLoadBasis(e.employeeId)).toList();

        // Populate registers
        _populateWagesRegisterSheet(
          sheet: dayBasisSheet,
          employees: dayBasisEmployees,
          service: service,
          isLoadBasis: false,
          templateStyles: templateStyles,
          totalRowStyles: totalRowStyles,
          titleText: 'KFIL SOLAPUR Wages Register for the Month of MAY-26 (Day Basis)',
        );

        _populateWagesRegisterSheet(
          sheet: loadBasisSheet,
          employees: loadBasisEmployees,
          service: service,
          isLoadBasis: true,
          templateStyles: templateStyles,
          totalRowStyles: totalRowStyles,
          titleText: 'KFIL SOLAPUR Wages Register for the Month of MAY-26 (Load Basis)',
        );

        // Create and populate Load Basis Work Database sheet
        final Sheet dbSheet = excel['Load Basis Work Database'];
        _populateLoadDatabaseSheet(
          sheet: dbSheet,
          employees: loadBasisEmployees,
          service: service,
        );

        // Create and populate Attendance Logs sheet
        final Sheet attendanceSheet = excel['Attendance Logs'];
        _populateAttendanceSheet(
          sheet: attendanceSheet,
          employees: service.employees,
          service: service,
        );

        // Return saved bytes
        return excel.save();
      }

      if (kIsWeb) {
        // Run on the main thread for Web (Javascript environment is single-threaded)
        return runGeneration();
      } else {
        // Offload to a background Isolate for native platforms (Desktop, Mobile)
        return await Isolate.run(runGeneration);
      }
    } catch (e) {
      print("Error in generatePayrollReport: $e");
      rethrow;
    }
  }

  static void _copySheet(Sheet source, Sheet dest) {
    // 1. Copy all cell values and cell styles
    for (int r = 0; r < source.maxRows; r++) {
      for (int c = 0; c < source.maxColumns; c++) {
        final srcCell = source.cell(CellIndex.indexByColumnRow(columnIndex: c, rowIndex: r));
        if (srcCell.value != null || srcCell.cellStyle != null) {
          final destCell = dest.cell(CellIndex.indexByColumnRow(columnIndex: c, rowIndex: r));
          destCell.value = srcCell.value;
          destCell.cellStyle = srcCell.cellStyle;
        }
      }
    }

    // 2. Copy merged cell spans (merges)
    for (final span in source.spannedItems) {
      final parts = span.split(':');
      if (parts.length == 2) {
        dest.merge(
          CellIndex.indexByString(parts[0]),
          CellIndex.indexByString(parts[1]),
        );
      }
    }

    // 3. Copy column widths
    source.getColumnWidths.forEach((colIndex, width) {
      dest.setColumnWidth(colIndex, width);
    });

    // 4. Copy row heights
    source.getRowHeights.forEach((rowIndex, height) {
      dest.setRowHeight(rowIndex, height);
    });
  }

  static void _populateWagesRegisterSheet({
    required Sheet sheet,
    required List<Employee> employees,
    required PayrollService service,
    required bool isLoadBasis,
    required List<CellStyle?> templateStyles,
    required List<CellStyle?> totalRowStyles,
    required String titleText,
  }) {
    // Update title in cell A5
    sheet.cell(CellIndex.indexByString('A5')).value = TextCellValue(titleText);

    // If it is a bi-annual MLWL month, rename the 'Cupan' column to 'MLWL' in the header row (row index 10)
    if (service.activePayCycleMonth == 6 || service.activePayCycleMonth == 12) {
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 21, rowIndex: 10)).value = TextCellValue('MLWL');
    } else {
      sheet.cell(CellIndex.indexByColumnRow(columnIndex: 21, rowIndex: 10)).value = TextCellValue('Cupan');
    }

    // Helper to get column letter
    String colLetter(int colIndex) {
      final cellId = CellIndex.indexByColumnRow(columnIndex: colIndex, rowIndex: 0).cellId;
      return cellId.replaceAll('1', '');
    }

    int rowIdx = 11; // rowIndex 11 is row 12 (0-indexed)
    int srNo = 1;

    for (int i = 0; i < employees.length; i++) {
      final emp = employees[i];
      final calc = service.calculatePayroll(emp);
      final workedDays = (calc.presentDays + calc.lateDays).toDouble() + (calc.halfDays * 0.5);
      final otDays = calc.overtimeDays;

      double rate = 0.0;
      if (isLoadBasis) {
        if (workedDays > 0) {
          rate = (calc.jobEarnings / workedDays);
        }
      } else {
        rate = emp.salaryPerDay > 0 ? emp.salaryPerDay : 636.0;
      }

      // 1-based row number for Excel formulas
      final excelRow = rowIdx + 1;

      final List<CellValue?> rowValues = [
        IntCellValue(srNo),
        emp.uan.isNotEmpty ? TextCellValue(emp.uan) : null,
        emp.esic.isNotEmpty ? TextCellValue(emp.esic) : null,
        TextCellValue(emp.name),
        DoubleCellValue(rate),
        DoubleCellValue(workedDays),
        otDays > 0 ? IntCellValue(otDays) : null,
        FormulaCellValue(otDays > 0 ? '=F$excelRow+G$excelRow' : '=F$excelRow'),
        FormulaCellValue('=ROUND(F$excelRow*E$excelRow,0)'),
        FormulaCellValue(otDays > 0 ? '=ROUND(E$excelRow*G$excelRow,0)' : '0'),
        FormulaCellValue('=I$excelRow+J$excelRow'),
        FormulaCellValue('=ROUND(\$L\$4*F$excelRow,0)'),
        FormulaCellValue('=ROUND(\$L$excelRow*5%,0)'),
        FormulaCellValue('=K$excelRow-L$excelRow-M$excelRow'),
        FormulaCellValue('=N$excelRow+M$excelRow+L$excelRow'),
        FormulaCellValue('=ROUND(L$excelRow*12%,0)'),
        FormulaCellValue('=IF(O$excelRow<=7500,0,IF(O$excelRow<=10000,175,200))'),
        FormulaCellValue('=ROUND(O$excelRow*0.75%,0)'),
        emp.remainingAdvance > 0 ? DoubleCellValue(emp.remainingAdvance) : null, // Remaining Adv (Dif)
        null, // Advance Jamadar
        null, // Canteen
        calc.mlwlDeduction > 0 ? DoubleCellValue(calc.mlwlDeduction) : null, // Cupan / MLWL
        emp.accountAdvance > 0 ? DoubleCellValue(emp.accountAdvance) : null, // Account Adv
        FormulaCellValue('=SUM(P$excelRow:W$excelRow)'),
        FormulaCellValue('=O$excelRow-X$excelRow'),
        workedDays > 0 ? IntCellValue(500) : null, // Canteen Other / Other Deduction
        FormulaCellValue('=Y$excelRow-Z$excelRow'),
      ];

      for (int c = 0; c < rowValues.length; c++) {
        final cell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: c, rowIndex: rowIdx));
        cell.value = rowValues[c];
        if (templateStyles[c] != null) {
          cell.cellStyle = templateStyles[c];
        }
      }

      srNo++;
      rowIdx++;
    }

    // Write TOTAL Row
    sheet.cell(CellIndex.indexByColumnRow(columnIndex: 3, rowIndex: rowIdx)).value = TextCellValue('TOTAL');

    // Total columns list:
    // 5 (F), 6 (G), 7 (H), 8 (I), 9 (J), 10 (K), 11 (L), 12 (M), 13 (N), 14 (O), 15 (P), 16 (Q), 17 (R), 23 (X), 24 (Y), 25 (Z), 26 (AA)
    final Set<int> totalCols = {5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 23, 24, 25, 26};
    for (int c = 0; c < 27; c++) {
      final cell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: c, rowIndex: rowIdx));
      if (totalCols.contains(c)) {
        final colL = colLetter(c);
        cell.value = FormulaCellValue('=SUM(${colL}12:$colL$rowIdx)');
      }
      if (totalRowStyles[c] != null) {
        cell.cellStyle = totalRowStyles[c];
      }
    }

    // Clear any extra template rows after the totals row (from rowIdx + 1 up to sheet.maxRows)
    final int origMaxRows = sheet.maxRows;
    for (int r = rowIdx + 1; r < origMaxRows; r++) {
      for (int c = 0; c < 27; c++) {
        final cell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: c, rowIndex: r));
        cell.value = null;
        cell.cellStyle = null;
      }
    }
  }

  static void _populateLoadDatabaseSheet({
    required Sheet sheet,
    required List<Employee> employees,
    required PayrollService service,
  }) {
    final List<String> dbHeaders = [
      'Sr No',
      'Ticket No',
      'UAN NO',
      'Employee Name',
      'Department',
      'Unit Type',
      'Rate per Unit (₹)',
      'Total Qty Processed',
      'Calculated Load Earnings (₹)',
      'Days Worked'
    ];

    final CellStyle headerStyle = CellStyle(
      bold: true,
      fontColorHex: ExcelColor.fromHexString('#FFFFFF'),
      backgroundColorHex: ExcelColor.fromHexString('#1F2937'),
      horizontalAlign: HorizontalAlign.Center,
      verticalAlign: VerticalAlign.Center,
    );

    final CellStyle cellStyleCenter = CellStyle(
      horizontalAlign: HorizontalAlign.Center,
    );
    
    final CellStyle cellStyleRight = CellStyle(
      horizontalAlign: HorizontalAlign.Right,
    );

    // Write headers
    for (int col = 0; col < dbHeaders.length; col++) {
      final cell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: 0));
      cell.value = TextCellValue(dbHeaders[col]);
      cell.cellStyle = headerStyle;
    }

    int rowIdx = 1;
    for (int i = 0; i < employees.length; i++) {
      final emp = employees[i];
      final calc = service.calculatePayroll(emp);
      final workedDays = (calc.presentDays + calc.lateDays).toDouble() + (calc.halfDays * 0.5);

      final config = service.getDeptConfig(emp.department);
      final double rate = config['rate'] ?? 0.0;
      final String unit = config['unit'] ?? 'Tons';
      final double qty = rate > 0 ? (calc.jobEarnings / rate) : 0.0;
      final excelRow = rowIdx + 1;

      final List<CellValue?> rowValues = [
        IntCellValue(i + 1),
        TextCellValue(emp.employeeId),
        emp.uan.isNotEmpty ? TextCellValue(emp.uan) : null,
        TextCellValue(emp.name),
        TextCellValue(emp.department),
        TextCellValue(unit),
        DoubleCellValue(rate),
        DoubleCellValue(qty),
        FormulaCellValue('=G$excelRow*H$excelRow'),
        DoubleCellValue(workedDays),
      ];

      for (int c = 0; c < rowValues.length; c++) {
        final cell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: c, rowIndex: rowIdx));
        cell.value = rowValues[c];
        if (c == 0 || c == 1 || c == 2 || c == 4 || c == 5 || c == 9) {
          cell.cellStyle = cellStyleCenter;
        } else if (c == 6 || c == 7 || c == 8) {
          cell.cellStyle = cellStyleRight;
        }
      }
      rowIdx++;
    }

    // Auto-fit column widths
    for (int c = 0; c < dbHeaders.length; c++) {
      sheet.setColumnAutoFit(c);
    }
  }

  static void _populateAttendanceSheet({
    required Sheet sheet,
    required List<Employee> employees,
    required PayrollService service,
  }) {
    final List<String> attHeaders = [
      'Employee ID',
      'Name',
      'Date',
      'Check-In',
      'Check-Out',
      'Hours Worked',
      'Biometric Status'
    ];

    final CellStyle headerStyle = CellStyle(
      bold: true,
      fontColorHex: ExcelColor.fromHexString('#FFFFFF'),
      backgroundColorHex: ExcelColor.fromHexString('#1E293B'),
      horizontalAlign: HorizontalAlign.Center,
    );

    for (int col = 0; col < attHeaders.length; col++) {
      final cell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: col, rowIndex: 0));
      cell.value = TextCellValue(attHeaders[col]);
      cell.cellStyle = headerStyle;
    }

    int rowIdx = 1;
    for (final log in service.attendanceLogs) {
      final emp = employees.firstWhere(
        (e) => e.employeeId == log.employeeId,
        orElse: () => Employee(
          employeeId: log.employeeId,
          name: 'Unknown',
          department: 'Unknown',
          salaryPerDay: 0.0,
          deductionPerDay: 0.0,
        ),
      );

      final List<CellValue> rowValues = [
        TextCellValue(log.employeeId),
        TextCellValue(emp.name),
        TextCellValue(log.date),
        TextCellValue(log.checkIn),
        TextCellValue(log.checkOut),
        DoubleCellValue(log.hoursWorked),
        TextCellValue(log.status),
      ];

      for (int c = 0; c < rowValues.length; c++) {
        final cell = sheet.cell(CellIndex.indexByColumnRow(columnIndex: c, rowIndex: rowIdx));
        cell.value = rowValues[c];
      }
      rowIdx++;
    }

    // Auto-fit column widths
    for (int c = 0; c < attHeaders.length; c++) {
      sheet.setColumnAutoFit(c);
    }
  }
}
