import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../models/employee.dart';
import '../models/job_log.dart';
import 'payroll_service.dart';

class PdfService {
  static Future<Uint8List> generatePayslipPdf({
    required Employee employee,
    required PayrollCalculation calc,
    required List<JobLog> workedJobs,
    required double totalTons,
    required bool isLoad,
  }) async {
    final pdf = pw.Document();

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(40.0),
        build: (pw.Context context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              // Header
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        'KFIL SOLAPUR',
                        style: pw.TextStyle(
                          fontSize: 22.0,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                      pw.Text(
                        'MONTHLY PAYSLIP | MAY 2026',
                        style: const pw.TextStyle(
                          fontSize: 12.0,
                          color: PdfColors.grey700,
                        ),
                      ),
                    ],
                  ),
                  pw.Container(
                    padding: const pw.EdgeInsets.symmetric(horizontal: 10.0, vertical: 5.0),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: isLoad ? PdfColors.purple : PdfColors.cyan),
                      borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4.0)),
                    ),
                    child: pw.Text(
                      isLoad ? 'LOAD WORKER' : 'SALARIED STAFF',
                      style: pw.TextStyle(
                        color: isLoad ? PdfColors.purple : PdfColors.cyan,
                        fontSize: 10.0,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              pw.SizedBox(height: 15.0),
              pw.Divider(thickness: 1.0, color: PdfColors.grey300),
              pw.SizedBox(height: 15.0),

              // Employee Profile Section Title
              pw.Text(
                'EMPLOYEE PROFILE',
                style: pw.TextStyle(
                  fontSize: 12.0,
                  fontWeight: pw.FontWeight.bold,
                  color: PdfColors.blue900,
                ),
              ),
              pw.SizedBox(height: 8.0),

              // Employee Details Table
              pw.Table(
                border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
                children: [
                  _profileRow('Employee Name', employee.name, 'Employee ID', employee.employeeId),
                  _profileRow('UAN NO', employee.uan.isNotEmpty ? employee.uan : 'N/A', 'ESIC NO', employee.esic.isNotEmpty ? employee.esic : 'N/A'),
                  _profileRow('Department', employee.department, 'Mobile No', employee.mobileNo.isNotEmpty ? employee.mobileNo : 'N/A'),
                  _profileRow('Bank Name', employee.bankName.isNotEmpty ? employee.bankName : 'N/A', 'Bank Account', employee.bankAcc.isNotEmpty ? employee.bankAcc : 'N/A'),
                  _profileRow('IFSC Code', employee.ifscCode.isNotEmpty ? employee.ifscCode : 'N/A', 'Payment Model', isLoad ? 'Load Basis' : 'Day Basis'),
                ],
              ),
              pw.SizedBox(height: 25.0),

              // Salary Breakdown section side-by-side
              pw.Row(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  // Earnings Column
                  pw.Expanded(
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.Text(
                          'EARNINGS',
                          style: pw.TextStyle(
                            fontSize: 12.0,
                            fontWeight: pw.FontWeight.bold,
                            color: PdfColors.green900,
                          ),
                        ),
                        pw.SizedBox(height: 8.0),
                        pw.Table(
                          border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
                          children: [
                            if (!isLoad) ...[
                              _detailRow('Daily Rate', 'Rs. ${employee.salaryPerDay.toStringAsFixed(2)}'),
                              _detailRow('Base Days Worked (${calc.presentDays + calc.lateDays} d)', 'Rs. ${calc.basicPay.toStringAsFixed(2)}'),
                              _detailRow('OT Days Worked (${calc.overtimeDays} d)', 'Rs. ${calc.otPay.toStringAsFixed(2)}'),
                              if (calc.jobEarnings > 0)
                                _detailRow('Load Job Split Share', 'Rs. ${calc.jobEarnings.toStringAsFixed(2)}'),
                              _detailRow('Gross Payable', 'Rs. ${calc.grossSalary.toStringAsFixed(2)}', isBold: true),
                              _detailRow('BASIC + DA', 'Rs. ${calc.basicDa.toStringAsFixed(2)}'),
                              _detailRow('House Rent Allowance', 'Rs. ${calc.hra.toStringAsFixed(2)}'),
                              _detailRow('Other Allowances', 'Rs. ${calc.otherAllowance.toStringAsFixed(2)}'),
                            ] else ...[
                              _detailRow('Load Tons Done (${totalTons.toStringAsFixed(1)} Tons)', 'Rs. ${calc.jobEarnings.toStringAsFixed(2)}'),
                              _detailRow('Total Load Jobs Worked', '${workedJobs.length} Jobs'),
                              _detailRow('Gross Payable', 'Rs. ${calc.grossSalary.toStringAsFixed(2)}', isBold: true),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  pw.SizedBox(width: 20.0),
                  // Deductions Column
                  pw.Expanded(
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.Text(
                          'STATUTORY DEDUCTIONS',
                          style: pw.TextStyle(
                            fontSize: 12.0,
                            fontWeight: pw.FontWeight.bold,
                            color: PdfColors.red900,
                          ),
                        ),
                        pw.SizedBox(height: 8.0),
                        pw.Table(
                          border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
                          children: [
                            if (!isLoad) ...[
                              _detailRow('Provident Fund (PF - 12%)', 'Rs. ${calc.pfDeduction.toStringAsFixed(2)}'),
                              _detailRow('State Insurance (ESIC)', 'Rs. ${calc.esicDeduction.toStringAsFixed(2)}'),
                              _detailRow('Professional Tax (PT)', 'Rs. ${calc.ptDeduction.toStringAsFixed(2)}'),
                              _detailRow('Other Deduction (Canteen)', 'Rs. ${calc.otherDeduction.toStringAsFixed(2)}'),
                              if (calc.accountAdvance > 0)
                                _detailRow('Account Advance Deduction', 'Rs. ${calc.accountAdvance.toStringAsFixed(2)}'),
                              if (calc.mlwlDeduction > 0)
                                _detailRow('Labour Welfare Fund (MLWL)', 'Rs. ${calc.mlwlDeduction.toStringAsFixed(2)}'),
                              _detailRow('Total Deductions', 'Rs. ${calc.totalDeductions.toStringAsFixed(2)}', isBold: true),
                            ] else ...[
                              if (calc.totalDeductions > 0) ...[
                                if (calc.accountAdvance > 0)
                                  _detailRow('Account Advance Deduction', 'Rs. ${calc.accountAdvance.toStringAsFixed(2)}'),
                                if (calc.mlwlDeduction > 0)
                                  _detailRow('Labour Welfare Fund (MLWL)', 'Rs. ${calc.mlwlDeduction.toStringAsFixed(2)}'),
                                _detailRow('Total Deductions', 'Rs. ${calc.totalDeductions.toStringAsFixed(2)}', isBold: true),
                              ] else ...[
                                _detailRow('Deductions', 'No biometric cuttings for Load Basis.'),
                                _detailRow('Total Deductions', 'Rs. 0.00', isBold: true),
                              ],
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              pw.SizedBox(height: 30.0),

              // Final Take Home Pay Summary
              pw.Container(
                padding: const pw.EdgeInsets.all(12.0),
                decoration: const pw.BoxDecoration(
                  color: PdfColors.grey100,
                  borderRadius: pw.BorderRadius.all(pw.Radius.circular(4.0)),
                ),
                child: pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  children: [
                    pw.Text(
                      'NET TAKE-HOME PAY',
                      style: pw.TextStyle(
                        fontSize: 14.0,
                        fontWeight: pw.FontWeight.bold,
                        color: PdfColors.grey800,
                      ),
                    ),
                    pw.Text(
                      'Rs. ${calc.netSalary.toStringAsFixed(2)}',
                      style: pw.TextStyle(
                        fontSize: 16.0,
                        fontWeight: pw.FontWeight.bold,
                        color: PdfColors.blue800,
                      ),
                    ),
                  ],
                ),
              ),

              pw.Spacer(),
              pw.Divider(thickness: 0.5, color: PdfColors.grey400),
              pw.SizedBox(height: 8.0),
              pw.Center(
                child: pw.Text(
                  'This is a computer-generated payslip and does not require a signature.',
                  style: const pw.TextStyle(
                    fontSize: 8.0,
                    color: PdfColors.grey500,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );

    return pdf.save();
  }

  static pw.TableRow _profileRow(String key1, String val1, String key2, String val2) {
    return pw.TableRow(
      children: [
        pw.Padding(
          padding: const pw.EdgeInsets.all(6.0),
          child: pw.Text(key1, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9.0)),
        ),
        pw.Padding(
          padding: const pw.EdgeInsets.all(6.0),
          child: pw.Text(val1, style: const pw.TextStyle(fontSize: 9.0)),
        ),
        pw.Padding(
          padding: const pw.EdgeInsets.all(6.0),
          child: pw.Text(key2, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9.0)),
        ),
        pw.Padding(
          padding: const pw.EdgeInsets.all(6.0),
          child: pw.Text(val2, style: const pw.TextStyle(fontSize: 9.0)),
        ),
      ],
    );
  }

  static pw.TableRow _detailRow(String label, String value, {bool isBold = false}) {
    return pw.TableRow(
      children: [
        pw.Padding(
          padding: const pw.EdgeInsets.all(6.0),
          child: pw.Text(
            label,
            style: pw.TextStyle(
              fontSize: 9.0,
              fontWeight: isBold ? pw.FontWeight.bold : pw.FontWeight.normal,
            ),
          ),
        ),
        pw.Padding(
          padding: const pw.EdgeInsets.all(6.0),
          child: pw.Align(
            alignment: pw.Alignment.centerRight,
            child: pw.Text(
              value,
              style: pw.TextStyle(
                fontSize: 9.0,
                fontWeight: isBold ? pw.FontWeight.bold : pw.FontWeight.normal,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
