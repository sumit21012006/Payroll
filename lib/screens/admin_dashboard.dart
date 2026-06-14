import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:path_provider/path_provider.dart';
import 'package:file_picker/file_picker.dart';
import '../services/payroll_service.dart';
import '../services/excel_service.dart';
import '../models/employee.dart';
import '../widgets/glowing_card.dart';
import '../widgets/attendance_calendar.dart';
import '../utils/web_download.dart';
import 'login_screen.dart';

class AdminDashboard extends StatefulWidget {
  final PayrollService payrollService;

  const AdminDashboard({super.key, required this.payrollService});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  String _searchQuery = '';
  String _deptFilter = 'All';
  String _sortField = 'id'; // 'id', 'name', 'salary', 'ot', 'deduct'
  bool _sortAscending = true;

  @override
  Widget build(BuildContext context) {
    final Size size = MediaQuery.of(context).size;
    final isDesktop = size.width > 1000;
    const double paddingVal = 8.0;

    // Calculate aggregated metrics
    double totalPayroll = 0.0;
    double totalDeductions = 0.0;
    double totalOvertimePaid = 0.0;
    int totalEmployeesCount = widget.payrollService.employees.length;

    for (var emp in widget.payrollService.employees) {
      final calc = widget.payrollService.calculatePayroll(emp);
      totalPayroll += calc.netSalary;
      totalDeductions += (calc.lateDeductions + calc.absentDeductions);
      totalOvertimePaid += calc.overtimeEarnings;
    }

    // Filter & Sort Employee list
    final processedEmployees = widget.payrollService.employees.where((emp) {
      final matchesSearch = emp.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          emp.employeeId.contains(_searchQuery);
      final matchesDept = _deptFilter == 'All' || emp.department == _deptFilter;
      return matchesSearch && matchesDept;
    }).toList();

    processedEmployees.sort((a, b) {
      int cmp = 0;
      if (_sortField == 'id') {
        cmp = a.employeeId.compareTo(b.employeeId);
      } else if (_sortField == 'name') {
        cmp = a.name.compareTo(b.name);
      } else if (_sortField == 'salary') {
        final calcA = widget.payrollService.calculatePayroll(a);
        final calcB = widget.payrollService.calculatePayroll(b);
        cmp = calcA.netSalary.compareTo(calcB.netSalary);
      } else if (_sortField == 'ot') {
        final calcA = widget.payrollService.calculatePayroll(a);
        final calcB = widget.payrollService.calculatePayroll(b);
        cmp = calcA.overtimeHours.compareTo(calcB.overtimeHours);
      } else if (_sortField == 'deduct') {
        final calcA = widget.payrollService.calculatePayroll(a);
        final calcB = widget.payrollService.calculatePayroll(b);
        cmp = (calcA.lateDeductions + calcA.absentDeductions).compareTo(calcB.lateDeductions + calcB.absentDeductions);
      }
      return _sortAscending ? cmp : -cmp;
    });

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Row(
          children: [
            const Icon(Icons.admin_panel_settings, color: Colors.cyanAccent),
            const SizedBox(width: 10.0),
            Flexible(
              child: Text(
                'ADMINISTRATOR DASHBOARD',
                style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 18.0),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Export Excel Report',
            icon: const Icon(Icons.download_for_offline, color: Colors.greenAccent),
            onPressed: () => _handleExportExcel(context),
          ),
          IconButton(
            tooltip: 'Calculation Settings',
            icon: const Icon(Icons.settings, color: Colors.cyanAccent),
            onPressed: () => _showSettingsDialog(context),
          ),
          IconButton(
            tooltip: 'Logout',
            icon: const Icon(Icons.logout, color: Colors.redAccent),
            onPressed: () {
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => LoginScreen(payrollService: widget.payrollService)),
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
          padding: EdgeInsets.symmetric(horizontal: paddingVal, vertical: 24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome, General Administrator',
                style: GoogleFonts.outfit(fontSize: 22.0, fontWeight: FontWeight.w900, color: Colors.white),
              ),
              const Text(
                'Review corporate biometric metrics, customize multipliers, and calculate net distributions.',
                style: TextStyle(color: Colors.white38, fontSize: 13.0),
              ),
              const SizedBox(height: 24.0),
              
              // Metric cards
              _buildMetricsGrid(
                totalEmployeesCount, 
                totalPayroll, 
                totalDeductions, 
                totalOvertimePaid, 
                widget.payrollService.jobLogs.length,
                isDesktop,
              ),
              const SizedBox(height: 24.0),

              // Charts and Allocation block
              if (isDesktop)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 3, child: _buildDepartmentBudgetChart()),
                    const SizedBox(width: 20.0),
                    Expanded(flex: 3, child: _buildAttendanceRatioChart()),
                  ],
                )
              else
                Column(
                  children: [
                    _buildDepartmentBudgetChart(),
                    const SizedBox(height: 20.0),
                    _buildAttendanceRatioChart(),
                  ],
                ),
              const SizedBox(height: 24.0),
              
              // Employee database table
              _buildEmployeeTableCard(processedEmployees),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetricsGrid(
    int empCount, 
    double payroll, 
    double deduct, 
    double otPaid, 
    int jobsCount,
    bool isDesktop,
  ) {
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
                    style: GoogleFonts.outfit(fontSize: 18.0, fontWeight: FontWeight.bold, color: Colors.white),
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

    final List<Widget> cards = [
      metricCard('TOTAL PAYROLL', '₹${payroll.toStringAsFixed(0)}', Icons.payments_outlined, Colors.green),
      metricCard('TOTAL STAFF', '$empCount Employees', Icons.people_outline, Colors.cyanAccent),
      metricCard('TOTAL OVERTIME', '₹${otPaid.toStringAsFixed(0)}', Icons.bolt, Colors.purpleAccent),
      metricCard('TOTAL CUTTINGS', '-₹${deduct.toStringAsFixed(0)}', Icons.money_off, Colors.redAccent),
      metricCard('LOAD JOBS LOGGED', '$jobsCount Jobs', Icons.work_history_outlined, Colors.amber),
    ];

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

  Widget _buildDepartmentBudgetChart() {
    final budgets = widget.payrollService.getDepartmentBudgets();
    final List<Color> colors = [Colors.cyan, Colors.purple, Colors.green, Colors.amber, Colors.redAccent, Colors.orangeAccent];
    
    int colorIdx = 0;
    final List<PieChartSectionData> sections = budgets.entries.map((entry) {
      final col = colors[colorIdx % colors.length];
      colorIdx++;
      return PieChartSectionData(
        color: col,
        value: entry.value,
        title: '${entry.key}\n₹${entry.value.toStringAsFixed(0)}',
        radius: 60.0,
        titleStyle: const TextStyle(fontSize: 10.0, fontWeight: FontWeight.bold, color: Colors.white),
      );
    }).toList();

    return GlowingCard(
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '🍇 PAYROLL ALLOCATION BY DEPARTMENT',
            style: GoogleFonts.outfit(fontSize: 14.0, fontWeight: FontWeight.bold, color: Colors.cyanAccent),
          ),
          const SizedBox(height: 24.0),
          SizedBox(
            height: 180.0,
            child: sections.isEmpty
                ? const Center(child: Text('No data calculated', style: TextStyle(color: Colors.white24)))
                : PieChart(
                    PieChartData(
                      sections: sections,
                      centerSpaceRadius: 40.0,
                      sectionsSpace: 2.0,
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttendanceRatioChart() {
    // Count raw status occurrences
    int p = 0;
    int l = 0;
    int ot = 0;
    int h = 0;

    for (var log in widget.payrollService.attendanceLogs) {
      final status = log.status.toUpperCase();
      if (status.contains('PRESENT')) p++;
      if (status.contains('LATE')) l++;
      if (status.contains('OVERTIME')) ot++;
      if (status.contains('HALF_DAY')) h++;
    }

    final total = p + l + ot + h;

    BarChartGroupData barGroup(int x, double val, Color color) {
      return BarChartGroupData(
        x: x,
        barRods: [
          BarChartRodData(
            toY: val,
            color: color,
            width: 25.0,
            borderRadius: BorderRadius.circular(5.0),
          )
        ],
      );
    }

    return GlowingCard(
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '📊 BIOMETRIC STATUS RATIOS',
            style: GoogleFonts.outfit(fontSize: 14.0, fontWeight: FontWeight.bold, color: Colors.purpleAccent),
          ),
          const SizedBox(height: 24.0),
          SizedBox(
            height: 180.0,
            child: total == 0
                ? const Center(child: Text('No data loaded', style: TextStyle(color: Colors.white24)))
                : BarChart(
                    BarChartData(
                      alignment: BarChartAlignment.spaceAround,
                      maxY: [p, l, ot, h].reduce((a, b) => a > b ? a : b).toDouble() * 1.15,
                      barGroups: [
                        barGroup(0, p.toDouble(), Colors.green),
                        barGroup(1, l.toDouble(), Colors.amber),
                        barGroup(2, ot.toDouble(), Colors.purpleAccent),
                        barGroup(3, h.toDouble(), Colors.cyan),
                      ],
                      gridData: const FlGridData(show: false),
                      borderData: FlBorderData(show: false),
                      titlesData: FlTitlesData(
                        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            getTitlesWidget: (val, meta) {
                              String label = '';
                              if (val == 0) label = 'P ($p)';
                              if (val == 1) label = 'Late ($l)';
                              if (val == 2) label = 'OT ($ot)';
                              if (val == 3) label = 'Half ($h)';
                              return Padding(
                                padding: const EdgeInsets.only(top: 6.0),
                                child: Text(label, style: const TextStyle(color: Colors.white54, fontSize: 10.0, fontWeight: FontWeight.bold)),
                              );
                            },
                          ),
                        ),
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmployeeTableCard(List<Employee> crew) {
    const double paddingVal = 8.0;
    return GlowingCard(
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Filter search block
          _buildFilterSearchHeader(),
          const SizedBox(height: 20.0),
          
          // Table Layout
          crew.isEmpty
              ? const SizedBox(
                  height: 200.0,
                  child: Center(child: Text('No employees match your search criteria.', style: TextStyle(color: Colors.white38))),
                )
              : Container(
                  height: 480.0,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10.0),
                    border: Border.all(color: Colors.white.withOpacity(0.04)),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10.0),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.vertical,
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: SizedBox(
                          width: MediaQuery.of(context).size.width > 1000 
                              ? MediaQuery.of(context).size.width - paddingVal * 2 - 24.0 
                              : 950.0,
                          child: Table(
                            columnWidths: const {
                              0: FlexColumnWidth(1.2),
                              1: FlexColumnWidth(2.5),
                              2: FlexColumnWidth(2.0),
                              3: FlexColumnWidth(2.2),
                              4: FlexColumnWidth(1.5),
                              5: FlexColumnWidth(1.5),
                              6: FlexColumnWidth(1.8),
                              7: FlexColumnWidth(2.0),
                              8: FlexColumnWidth(1.2),
                            },
                            border: TableBorder.all(
                              color: Colors.white.withOpacity(0.03),
                              width: 1.0,
                            ),
                            children: [
                              // Table Header
                              TableRow(
                                decoration: const BoxDecoration(color: Color(0xFF1E293B)),
                                children: [
                                  _tableHeaderCell('ID', 'id'),
                                  _tableHeaderCell('Name', 'name'),
                                  _tableHeaderCell('Dept', 'dept'),
                                  _tableHeaderCell('Basis', 'basis'),
                                  _tableHeaderCell('Logs', 'logs'),
                                  _tableHeaderCell('OT Hrs', 'ot'),
                                  _tableHeaderCell('Cuttings', 'deduct'),
                                  _tableHeaderCell('Net Pay', 'salary'),
                                  _tableHeaderCell('Action', ''),
                                ],
                              ),
                              // Table Rows
                              ...crew.map((emp) {
                                final calc = widget.payrollService.calculatePayroll(emp);
                                final isLoad = widget.payrollService.isEmployeeLoadBasis(emp.employeeId);
                                final cuttings = calc.lateDeductions + calc.absentDeductions;

                                return TableRow(
                                  decoration: const BoxDecoration(color: Colors.transparent),
                                  children: [
                                    _tableTextCell(emp.employeeId),
                                    _tableTextCell(emp.name, isBold: true),
                                    _tableTextCell(emp.department),
                                    _tableTextCell(isLoad ? '🍇 Load (Tons)' : '🔋 Day Basis'),
                                    _tableTextCell('${calc.totalDaysLogged} Days'),
                                    _tableTextCell('${calc.overtimeHours.toStringAsFixed(1)} hrs'),
                                    _tableTextCell('₹${cuttings.toStringAsFixed(0)}', color: cuttings > 0 ? Colors.redAccent : Colors.white38),
                                    _tableTextCell('₹${calc.netSalary.toStringAsFixed(0)}', isBold: true, color: Colors.cyanAccent),
                                    TableCell(
                                      verticalAlignment: TableCellVerticalAlignment.middle,
                                      child: Center(
                                        child: IconButton(
                                          icon: const Icon(Icons.visibility, color: Colors.cyan, size: 18.0),
                                          onPressed: () => _showEmployeeDetailsModal(context, emp),
                                        ),
                                      ),
                                    ),
                                  ],
                                );
                              }),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
        ],
      ),
    );
  }

  Widget _tableHeaderCell(String label, String sortField) {
    final isSortingThis = _sortField == sortField;
    return TableCell(
      verticalAlignment: TableCellVerticalAlignment.middle,
      child: InkWell(
        onTap: sortField.isEmpty
            ? null
            : () {
                setState(() {
                  if (_sortField == sortField) {
                    _sortAscending = !_sortAscending;
                  } else {
                    _sortField = sortField;
                    _sortAscending = true;
                  }
                });
              },
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                label,
                style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold, fontSize: 12.0),
              ),
              if (sortField.isNotEmpty) ...[
                const SizedBox(width: 4.0),
                Icon(
                  isSortingThis
                      ? (_sortAscending ? Icons.arrow_upward : Icons.arrow_downward)
                      : Icons.swap_vert,
                  size: 12.0,
                  color: isSortingThis ? Colors.cyanAccent : Colors.white24,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _tableTextCell(String val, {bool isBold = false, Color? color}) {
    return TableCell(
      verticalAlignment: TableCellVerticalAlignment.middle,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10.0, horizontal: 6.0),
          child: Text(
            val,
            style: TextStyle(
              color: color ?? Colors.white70,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
              fontSize: 12.0,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }

  Widget _buildFilterSearchHeader() {
    final Set<String> uniqueDepts = widget.payrollService.employees.map((e) => e.department).toSet();
    final List<String> depts = ['All', ...uniqueDepts.where((d) => d.isNotEmpty)];
    if (!depts.contains(_deptFilter)) {
      _deptFilter = 'All';
    }
    final bool isMobile = MediaQuery.of(context).size.width < 600;

    final headerText = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '👥 EMPLOYEE DATABASE',
          style: GoogleFonts.outfit(fontSize: 16.0, fontWeight: FontWeight.bold, color: Colors.white),
        ),
        const Text('Search, filter, sort and toggle payroll parameters.', style: TextStyle(color: Colors.white38, fontSize: 11.0)),
      ],
    );

    final searchField = Container(
      height: 38.0,
      padding: const EdgeInsets.symmetric(horizontal: 8.0),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(8.0),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: TextField(
        style: const TextStyle(color: Colors.white, fontSize: 12.0),
        onChanged: (v) => setState(() => _searchQuery = v),
        decoration: const InputDecoration(
          hintText: 'Search by ID/Name...',
          hintStyle: TextStyle(color: Colors.white24, fontSize: 12.0),
          prefixIcon: Icon(Icons.search, color: Colors.white30, size: 16.0),
          border: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(vertical: 10.0),
        ),
      ),
    );

    final filterDropdown = Container(
      height: 38.0,
      padding: const EdgeInsets.symmetric(horizontal: 8.0),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(8.0),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          dropdownColor: const Color(0xFF1E293B),
          isExpanded: true,
          value: _deptFilter,
          style: const TextStyle(color: Colors.white, fontSize: 12.0),
          onChanged: (val) {
            if (val != null) setState(() => _deptFilter = val);
          },
          items: depts.map((d) {
            return DropdownMenuItem(value: d, child: Text(d));
          }).toList(),
        ),
      ),
    );

    if (isMobile) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          headerText,
          const SizedBox(height: 16.0),
          Row(
            children: [
              Expanded(flex: 3, child: searchField),
              const SizedBox(width: 8.0),
              Expanded(flex: 2, child: filterDropdown),
            ],
          ),
        ],
      );
    } else {
      return Row(
        children: [
          Expanded(flex: 6, child: headerText),
          const SizedBox(width: 10.0),
          Expanded(flex: 4, child: searchField),
          const SizedBox(width: 10.0),
          Expanded(flex: 3, child: filterDropdown),
        ],
      );
    }
  }

  void _showEmployeeDetailsModal(BuildContext context, Employee emp) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF151D2A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20.0)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final calc = widget.payrollService.calculatePayroll(emp);
            final isLoad = widget.payrollService.isEmployeeLoadBasis(emp.employeeId);
            final empLogs = widget.payrollService.attendanceLogs.where((l) => l.employeeId == emp.employeeId).toList();
            final employeeJobs = widget.payrollService.jobLogs
                .where((job) => job.employeeIds.contains(emp.employeeId))
                .toList();

            double totalTonsLogged = 0.0;
            for (var job in employeeJobs) {
              totalTonsLogged += job.totalTons / job.employeeIds.length;
            }

            return Container(
              height: MediaQuery.of(context).size.height * 0.85,
              padding: const EdgeInsets.all(24.0),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Modal Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              CircleAvatar(
                                backgroundColor: isLoad ? Colors.purpleAccent.withOpacity(0.2) : Colors.cyanAccent.withOpacity(0.2),
                                radius: 20.0,
                                child: Text(
                                  emp.name.substring(0, 1),
                                  style: TextStyle(
                                    color: isLoad ? Colors.purpleAccent : Colors.cyanAccent, 
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12.0),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      emp.name,
                                      style: GoogleFonts.outfit(color: Colors.white, fontSize: 18.0, fontWeight: FontWeight.bold),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    Text(
                                      'ID: ${emp.employeeId}  |  Dept: ${emp.department}',
                                      style: const TextStyle(color: Colors.white54, fontSize: 12.0),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16.0),
                        // Interactive Toggle Switch for Pay Basis!
                        Row(
                          children: [
                            const Text('Day Basis', style: TextStyle(color: Colors.white54, fontSize: 11.0)),
                            Switch(
                              value: isLoad,
                              activeColor: Colors.purpleAccent,
                              activeTrackColor: Colors.purpleAccent.withOpacity(0.3),
                              inactiveThumbColor: Colors.cyanAccent,
                              inactiveTrackColor: Colors.cyanAccent.withOpacity(0.3),
                              onChanged: (val) {
                                // 1. Toggle in service
                                widget.payrollService.toggleEmployeeLoadBasis(emp.employeeId);
                                // 2. Refresh local state
                                setModalState(() {});
                                // 3. Refresh main dashboard state
                                setState(() {});
                              },
                            ),
                            const Text('Load Basis', style: TextStyle(color: Colors.purpleAccent, fontSize: 11.0, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ],
                    ),
                    const Divider(color: Colors.white12, height: 24.0),

                    // Quick Stats grid in Modal (Responsive layout)
                    Builder(
                      builder: (context) {
                        final bool isMobile = MediaQuery.of(context).size.width < 600;
                        final statBoxes = isLoad
                            ? [
                                _modalStatBox('DAYS WORKED', '${calc.totalDaysLogged} Days', Colors.green),
                                _modalStatBox('LOAD EXECUTED', '${totalTonsLogged.toStringAsFixed(3)} Tons', Colors.purpleAccent),
                                _modalStatBox('CUTTINGS', '₹${(calc.lateDeductions + calc.absentDeductions).toStringAsFixed(0)}', Colors.redAccent),
                                _modalStatBox('LOAD BASIS PAY', '₹${calc.netSalary.toStringAsFixed(0)}', Colors.cyanAccent, isHighlight: true),
                              ]
                            : [
                                _modalStatBox('DAYS WORKED', '${calc.totalDaysLogged} Days', Colors.green),
                                _modalStatBox('OT HOURS', '${calc.overtimeHours.toStringAsFixed(1)} hrs', Colors.purpleAccent),
                                _modalStatBox('CUTTINGS', '₹${(calc.lateDeductions + calc.absentDeductions).toStringAsFixed(0)}', Colors.redAccent),
                                _modalStatBox('NET SALARY', '₹${calc.netSalary.toStringAsFixed(0)}', Colors.cyanAccent, isHighlight: true),
                              ];

                        if (isMobile) {
                          return Column(
                            children: [
                              Row(children: [statBoxes[0], statBoxes[1]]),
                              const SizedBox(height: 8.0),
                              Row(children: [statBoxes[2], statBoxes[3]]),
                            ],
                          );
                        } else {
                          return Row(children: statBoxes);
                        }
                      },
                    ),
                    const SizedBox(height: 24.0),

                    // Real Company Metadata Section
                    Builder(
                      builder: (context) {
                        Widget metadataRow(IconData icon, String label, String val) {
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6.0),
                            child: Row(
                              children: [
                                Icon(icon, size: 16.0, color: Colors.cyanAccent),
                                const SizedBox(width: 10.0),
                                Text(
                                  label,
                                  style: const TextStyle(color: Colors.white54, fontSize: 12.0, fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(width: 8.0),
                                Expanded(
                                  child: Text(
                                    val,
                                    style: const TextStyle(color: Colors.white, fontSize: 12.0),
                                    textAlign: TextAlign.right,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }

                        return Container(
                          padding: const EdgeInsets.all(16.0),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.01),
                            borderRadius: BorderRadius.circular(10.0),
                            border: Border.all(color: Colors.white.withOpacity(0.05)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'REAL COMPANY METADATA',
                                style: GoogleFonts.outfit(
                                  fontSize: 12.0, 
                                  fontWeight: FontWeight.bold, 
                                  color: Colors.cyanAccent,
                                  letterSpacing: 1.0,
                                ),
                              ),
                              const Divider(color: Colors.white12, height: 16.0),
                              metadataRow(Icons.pin, 'UAN Number', emp.uan.isNotEmpty ? emp.uan : 'N/A'),
                              metadataRow(Icons.security, 'ESIC Number', emp.esic.isNotEmpty ? emp.esic : 'N/A'),
                              metadataRow(Icons.account_balance, 'Bank Name', emp.bankName.isNotEmpty ? emp.bankName : 'N/A'),
                              metadataRow(Icons.code, 'IFSC Code', emp.ifscCode.isNotEmpty ? emp.ifscCode : 'N/A'),
                              metadataRow(Icons.numbers, 'Bank Account', emp.bankAcc.isNotEmpty ? emp.bankAcc : 'N/A'),
                              metadataRow(Icons.fingerprint, 'Biometric Punch Code', emp.punchingCode.isNotEmpty ? emp.punchingCode : 'N/A'),
                              metadataRow(Icons.phone, 'Mobile Number', emp.mobileNo.isNotEmpty ? emp.mobileNo : 'N/A'),
                            ],
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 24.0),

                    // Active custom calendar inside modal!
                    AttendanceCalendar(
                      employeeId: emp.employeeId,
                      logs: empLogs,
                      jobs: widget.payrollService.jobLogs,
                      getJobSplitOverride: (job, empId) => widget.payrollService.getEmployeeJobSplit(job, empId),
                    ),
                    const SizedBox(height: 24.0),

                    // Close Button
                    Center(
                      child: SizedBox(
                        width: 200.0,
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(context),
                          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E293B)),
                          child: const Text('Close Details', style: TextStyle(color: Colors.white)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _modalStatBox(String label, String value, Color color, {bool isHighlight = false}) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4.0),
        padding: const EdgeInsets.all(12.0),
        decoration: BoxDecoration(
          color: color.withOpacity(0.04),
          borderRadius: BorderRadius.circular(10.0),
          border: Border.all(color: isHighlight ? color.withOpacity(0.5) : color.withOpacity(0.15)),
        ),
        child: Column(
          children: [
            Text(label, style: const TextStyle(color: Colors.white38, fontSize: 9.0, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4.0),
            Text(
              value,
              style: TextStyle(color: isHighlight ? color : Colors.white, fontWeight: FontWeight.bold, fontSize: 13.0),
            ),
          ],
        ),
      ),
    );
  }

  void _showSettingsDialog(BuildContext context) {
    final TextEditingController shiftCtrl = TextEditingController(text: widget.payrollService.standardShiftHours.toString());
    final TextEditingController otCtrl = TextEditingController(text: widget.payrollService.overtimeMultiplier.toString());
    final TextEditingController leavesCtrl = TextEditingController(text: widget.payrollService.allowedPaidLeaves.toString());
    final TextEditingController graceCtrl = TextEditingController(text: widget.payrollService.lateGraceMinutes.toString());
    final TextEditingController rateCtrl = TextEditingController(text: widget.payrollService.defaultRatePerTon.toString());

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF151D2A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15.0)),
          title: Text(
            '⚙️ PAYROLL GLOBAL SETTINGS',
            style: GoogleFonts.outfit(color: Colors.cyanAccent, fontWeight: FontWeight.bold, fontSize: 16.0),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _settingsInput('Standard Shift Duration (Hours)', shiftCtrl),
                _settingsInput('Overtime Pay Rate Multiplier', otCtrl),
                _settingsInput('Allowed Monthly Paid Leaves', leavesCtrl),
                _settingsInput('Lateness Grace Period (Minutes)', graceCtrl),
                _settingsInput('Default Rate per Ton (₹)', rateCtrl),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Colors.white38)),
            ),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  widget.payrollService.standardShiftHours = double.tryParse(shiftCtrl.text) ?? 9.0;
                  widget.payrollService.overtimeMultiplier = double.tryParse(otCtrl.text) ?? 1.5;
                  widget.payrollService.allowedPaidLeaves = int.tryParse(leavesCtrl.text) ?? 2;
                  widget.payrollService.lateGraceMinutes = double.tryParse(graceCtrl.text) ?? 15.0;
                  widget.payrollService.defaultRatePerTon = double.tryParse(rateCtrl.text) ?? 15.0;
                });
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Settings saved & recalculated corporate payroll successfully!'), backgroundColor: Colors.green),
                );
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.cyan),
              child: const Text('Save Settings', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  Widget _settingsInput(String label, TextEditingController ctrl) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white54, fontSize: 11.0, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6.0),
          Container(
            height: 40.0,
            padding: const EdgeInsets.symmetric(horizontal: 10.0),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(8.0),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white, fontSize: 13.0),
              decoration: const InputDecoration(border: InputBorder.none),
            ),
          ),
        ],
      ),
    );
  }

  void _handleExportExcel(BuildContext context) async {
    try {
      final bytes = await ExcelService.generatePayrollReport(service: widget.payrollService);
      if (bytes != null) {
        if (kIsWeb) {
          downloadFile(bytes, 'Payroll_May_2026_Audit.xlsx');
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Excel Report downloaded successfully!'), backgroundColor: Colors.green),
          );
        } else {
          // Desktop / Mobile Saving via Native File Save Dialog
          final Uint8List uint8Bytes = Uint8List.fromList(bytes);
          final String? outputFile = await FilePicker.platform.saveFile(
            dialogTitle: 'Save Payroll Audit Report',
            fileName: 'Payroll_May_2026_Audit.xlsx',
            type: FileType.custom,
            allowedExtensions: ['xlsx'],
            bytes: uint8Bytes,
          );

          if (outputFile != null) {
            final file = File(outputFile);
            // On desktop, write the bytes manually if the plugin didn't write them
            if (!file.existsSync() || file.lengthSync() == 0) {
              await file.writeAsBytes(uint8Bytes);
            }

            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Successfully saved Excel report: $outputFile'),
                backgroundColor: Colors.green,
                duration: const Duration(seconds: 5),
                action: SnackBarAction(
                  label: 'OK',
                  textColor: Colors.white,
                  onPressed: () {},
                ),
              ),
            );
          } else {
            // User cancelled the save dialog
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Export cancelled.'), backgroundColor: Colors.orange),
            );
          }
        }
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error generating Excel: $e'), backgroundColor: Colors.red),
      );
    }
  }
}
