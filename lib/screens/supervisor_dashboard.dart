import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/payroll_service.dart';
import '../models/employee.dart';
import '../models/job_log.dart';
import '../widgets/glowing_card.dart';
import 'login_screen.dart';

class SupervisorDashboard extends StatefulWidget {
  final PayrollService payrollService;

  const SupervisorDashboard({super.key, required this.payrollService});

  @override
  State<SupervisorDashboard> createState() => _SupervisorDashboardState();
}

class _SupervisorDashboardState extends State<SupervisorDashboard> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _jobNameController = TextEditingController();
  final TextEditingController _tonsController = TextEditingController();
  final TextEditingController _rateController = TextEditingController();
  
  String _selectedDate = '5/1/2026';
  List<String> _selectedEmployeeIds = [];
  String _searchQuery = '';
  String _deptFilter = 'All'; // Default filter to show all crew first

  double _calculatedTotal = 0.0;
  double _calculatedSplit = 0.0;

  final List<String> _defaultJobNames = [
    'Loading Bauxite',
    'Casting',
    'Shafting',
    'Scraping',
    'Other (Write Custom Name)...'
  ];
  String _selectedJobName = 'Loading Bauxite';
  bool _isCustomJob = false;

  @override
  void initState() {
    super.initState();
    _selectedJobName = _defaultJobNames.first;
    _rateController.text = widget.payrollService.defaultRatePerTon.toString();
    _tonsController.addListener(_calculateSplits);
    _rateController.addListener(_calculateSplits);
  }

  @override
  void dispose() {
    _jobNameController.dispose();
    _tonsController.dispose();
    _rateController.dispose();
    super.dispose();
  }

  void _calculateSplits() {
    final tons = double.tryParse(_tonsController.text) ?? 0.0;
    final rate = double.tryParse(_rateController.text) ?? 0.0;

    final loadCrew = _selectedEmployeeIds.where((id) => widget.payrollService.isEmployeeLoadBasis(id)).toList();
    final dayCrew = _selectedEmployeeIds.where((id) => !widget.payrollService.isEmployeeLoadBasis(id)).toList();

    double totalDayWagesToDeduct = 0.0;
    for (var dayEmpId in dayCrew) {
      final emp = widget.payrollService.employees.firstWhere(
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

    final totalValue = tons * rate;
    final remaining = totalValue - totalDayWagesToDeduct;

    setState(() {
      _calculatedTotal = totalValue;
      _calculatedSplit = loadCrew.isNotEmpty && remaining > 0.0 ? remaining / loadCrew.length : 0.0;
    });
  }

  void _toggleEmployeeSelection(String empId) {
    setState(() {
      if (_selectedEmployeeIds.contains(empId)) {
        _selectedEmployeeIds.remove(empId);
      } else {
        _selectedEmployeeIds.add(empId);
      }
      _calculateSplits();
    });
  }

  void _handleSubmitJob() {
    if (_formKey.currentState!.validate()) {
      if (_selectedEmployeeIds.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Error: Please select at least one crew member!'),
            backgroundColor: Colors.redAccent,
          ),
        );
        return;
      }

      final tons = double.tryParse(_tonsController.text) ?? 0.0;
      final rate = double.tryParse(_rateController.text) ?? 0.0;
      final jobName = _isCustomJob ? _jobNameController.text.trim() : _selectedJobName;
      
      final newJob = JobLog(
        id: 'JOB-${DateTime.now().millisecondsSinceEpoch.toString().substring(8)}',
        date: _selectedDate,
        jobName: jobName,
        totalTons: tons,
        ratePerTon: rate,
        employeeIds: List<String>.from(_selectedEmployeeIds),
      );

      widget.payrollService.addJobLog(newJob);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Successfully logged ${newJob.jobName} (₹${newJob.totalPayout.toStringAsFixed(0)})'),
          backgroundColor: Colors.green,
        ),
      );

      // Reset Form
      setState(() {
        _jobNameController.clear();
        _tonsController.clear();
        _selectedEmployeeIds.clear();
        _selectedJobName = _defaultJobNames.first;
        _isCustomJob = false;
        _calculateSplits();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final Size size = MediaQuery.of(context).size;
    final isDesktop = size.width > 900;
    const double paddingVal = 8.0;

    // Filter employees based on search & department
    final filteredEmployees = widget.payrollService.employees.where((emp) {
      final matchesSearch = emp.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          emp.employeeId.contains(_searchQuery);
      final matchesDept = _deptFilter == 'All' || emp.department == _deptFilter;
      return matchesSearch && matchesDept;
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Row(
          children: [
            const Icon(Icons.engineering, color: Colors.cyanAccent),
            const SizedBox(width: 10.0),
            Flexible(
              child: Text(
                'SUPERVISOR PORTAL',
                style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 18.0),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
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
                'Welcome, Shift Supervisor',
                style: GoogleFonts.outfit(fontSize: 22.0, fontWeight: FontWeight.w900, color: Colors.white),
              ),
              const Text(
                'Record daily tons and split job payments among your crew.',
                style: TextStyle(color: Colors.white38, fontSize: 13.0),
              ),
              const SizedBox(height: 24.0),
              
              if (isDesktop)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Form Side
                    Expanded(flex: 5, child: _buildJobLogForm(filteredEmployees)),
                    const SizedBox(width: 24.0),
                    // History Side
                    Expanded(flex: 4, child: _buildJobHistoryList()),
                  ],
                )
              else
                Column(
                  children: [
                    _buildJobLogForm(filteredEmployees),
                    const SizedBox(height: 24.0),
                    _buildJobHistoryList(),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildJobLogForm(List<Employee> filteredCrew) {
    final List<String> availableDates = List.generate(31, (i) => '5/${i + 1}/2026');

    return GlowingCard(
      margin: EdgeInsets.zero,
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '➕ LOG DAILY LOAD JOB',
              style: GoogleFonts.outfit(fontSize: 16.0, fontWeight: FontWeight.bold, color: Colors.cyanAccent),
            ),
            const Divider(color: Colors.white12, height: 24.0),
            
            // Date & Job Name Rows
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Date', style: TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8.0),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12.0),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.02),
                          borderRadius: BorderRadius.circular(10.0),
                          border: Border.all(color: Colors.white.withOpacity(0.08)),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            dropdownColor: const Color(0xFF1E293B),
                            isExpanded: true,
                            value: _selectedDate,
                            style: const TextStyle(color: Colors.white, fontSize: 14.0),
                            onChanged: (val) {
                              if (val != null) setState(() => _selectedDate = val);
                            },
                            items: availableDates.map((d) {
                              return DropdownMenuItem(value: d, child: Text(d));
                            }).toList(),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 15.0),
                Expanded(
                  flex: 7,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Job Name / Description', style: TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8.0),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12.0),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.02),
                          borderRadius: BorderRadius.circular(10.0),
                          border: Border.all(color: Colors.white.withOpacity(0.08)),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            dropdownColor: const Color(0xFF1E293B),
                            isExpanded: true,
                            value: _selectedJobName,
                            style: const TextStyle(color: Colors.white, fontSize: 14.0),
                            onChanged: (val) {
                              if (val != null) {
                                setState(() {
                                  _selectedJobName = val;
                                  _isCustomJob = val == 'Other (Write Custom Name)...';
                                });
                              }
                            },
                            items: _defaultJobNames.map((n) {
                              return DropdownMenuItem(value: n, child: Text(n));
                            }).toList(),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (_isCustomJob) ...[
              const SizedBox(height: 15.0),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Enter Custom Job Name', style: TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8.0),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.02),
                      borderRadius: BorderRadius.circular(10.0),
                      border: Border.all(color: Colors.white.withOpacity(0.08)),
                    ),
                    child: TextFormField(
                      controller: _jobNameController,
                      style: const TextStyle(color: Colors.white, fontSize: 14.0),
                      validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                      decoration: const InputDecoration(
                        hintText: 'e.g. Loading Bauxite Cargo B',
                        hintStyle: TextStyle(color: Colors.white24, fontSize: 13.0),
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(horizontal: 12.0),
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 20.0),
            
            // Tons & Rate per ton rows
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Total Tons Done', style: TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8.0),
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.02),
                          borderRadius: BorderRadius.circular(10.0),
                          border: Border.all(color: Colors.white.withOpacity(0.08)),
                        ),
                        child: TextFormField(
                          controller: _tonsController,
                          keyboardType: TextInputType.number,
                          style: const TextStyle(color: Colors.white, fontSize: 14.0),
                          validator: (v) => v == null || double.tryParse(v) == null ? 'Invalid' : null,
                          decoration: const InputDecoration(
                            hintText: 'e.g. 150',
                            hintStyle: TextStyle(color: Colors.white24, fontSize: 13.0),
                            border: InputBorder.none,
                            contentPadding: EdgeInsets.symmetric(horizontal: 12.0),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 15.0),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Rate per Ton (₹)', style: TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8.0),
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.02),
                          borderRadius: BorderRadius.circular(10.0),
                          border: Border.all(color: Colors.white.withOpacity(0.08)),
                        ),
                        child: TextFormField(
                          controller: _rateController,
                          keyboardType: TextInputType.number,
                          style: const TextStyle(color: Colors.white, fontSize: 14.0),
                          validator: (v) => v == null || double.tryParse(v) == null ? 'Invalid' : null,
                          decoration: const InputDecoration(
                            hintText: 'e.g. 15',
                            hintStyle: TextStyle(color: Colors.white24, fontSize: 13.0),
                            border: InputBorder.none,
                            contentPadding: EdgeInsets.symmetric(horizontal: 12.0),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24.0),
            
            // Crew Multi-Selection Block
            Text(
              '👥 SELECT CREW MEMBERS (${_selectedEmployeeIds.length} Selected)',
              style: GoogleFonts.outfit(fontSize: 13.0, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 12.0),
            _buildCrewFilters(),
            const SizedBox(height: 10.0),
            Container(
              height: 250.0,
              padding: const EdgeInsets.all(8.0),
              decoration: BoxDecoration(
                color: Colors.black12,
                borderRadius: BorderRadius.circular(10.0),
                border: Border.all(color: Colors.white.withOpacity(0.05)),
              ),
              child: filteredCrew.isEmpty
                  ? const Center(child: Text('No crew matches filter', style: TextStyle(color: Colors.white38)))
                  : ListView.builder(
                      itemCount: filteredCrew.length,
                      itemBuilder: (context, idx) {
                        final emp = filteredCrew[idx];
                        final isSelected = _selectedEmployeeIds.contains(emp.employeeId);
                        final isLoad = widget.payrollService.isEmployeeLoadBasis(emp.employeeId);

                        return Container(
                          margin: const EdgeInsets.symmetric(vertical: 4.0),
                          decoration: BoxDecoration(
                            color: isSelected 
                                ? Colors.cyan.withOpacity(0.08) 
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(8.0),
                            border: Border.all(
                              color: isSelected ? Colors.cyan.withOpacity(0.3) : Colors.transparent,
                            ),
                          ),
                          child: Material(
                            color: Colors.transparent,
                            child: CheckboxListTile(
                              activeColor: Colors.cyan,
                              checkColor: Colors.white,
                              value: isSelected,
                              onChanged: (_) => _toggleEmployeeSelection(emp.employeeId),
                              title: Text(
                                emp.name,
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13.0),
                              ),
                              subtitle: Text(
                                'ID: ${emp.employeeId} | ${emp.department} | ${isLoad ? "Load Basis" : "Day Basis"}',
                                style: const TextStyle(color: Colors.white38, fontSize: 11.0),
                              ),
                              secondary: CircleAvatar(
                                radius: 14.0,
                                backgroundColor: isLoad ? Colors.purple.withOpacity(0.3) : Colors.blue.withOpacity(0.3),
                                child: Text(
                                  emp.name.substring(0, 1),
                                  style: const TextStyle(color: Colors.white, fontSize: 11.0, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
            const SizedBox(height: 24.0),
            
            // Dynamic Split Payout Summary
            _buildPayoutSplitSummary(),
            const SizedBox(height: 24.0),
            
            // Submit Button
            SizedBox(
              width: double.infinity,
              height: 48.0,
              child: ElevatedButton.icon(
                onPressed: _handleSubmitJob,
                icon: const Icon(Icons.save_outlined, color: Colors.white),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.cyan,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10.0)),
                ),
                label: Text(
                  'LOG JOB & ALLOCATE SPLITS',
                  style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13.0, letterSpacing: 1.0, color: Colors.white),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCrewFilters() {
    final Set<String> uniqueDepts = widget.payrollService.employees.map((e) => e.department).toSet();
    final List<String> depts = ['All', ...uniqueDepts.where((d) => d.isNotEmpty)];
    if (!depts.contains(_deptFilter)) {
      _deptFilter = 'All';
    }

    return Row(
      children: [
        // Search textfield
        Expanded(
          flex: 4,
          child: Container(
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
                hintText: 'Search crew...',
                hintStyle: TextStyle(color: Colors.white24, fontSize: 12.0),
                prefixIcon: Icon(Icons.search, color: Colors.white30, size: 16.0),
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(vertical: 10.0),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8.0),
        // Dropdown filter
        Expanded(
          flex: 3,
          child: Container(
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
          ),
        ),
      ],
    );
  }

  Widget _buildPayoutSplitSummary() {
    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Colors.cyan.withOpacity(0.05),
        borderRadius: BorderRadius.circular(10.0),
        border: Border.all(color: Colors.cyan.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('TOTAL JOB VALUE', style: TextStyle(color: Colors.white54, fontSize: 10.0, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4.0),
                Text(
                  '₹${_calculatedTotal.toStringAsFixed(0)}',
                  style: const TextStyle(color: Colors.white, fontSize: 18.0, fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Container(width: 1.0, height: 35.0, color: Colors.white12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Text('CREW SIZE', style: TextStyle(color: Colors.white54, fontSize: 10.0, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4.0),
                Text(
                  '${_selectedEmployeeIds.length} Workers',
                  style: const TextStyle(color: Colors.white, fontSize: 18.0, fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Container(width: 1.0, height: 35.0, color: Colors.white12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Text('INDIVIDUAL SPLIT PAY', style: TextStyle(color: Colors.cyanAccent, fontSize: 10.0, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4.0),
                Text(
                  '₹${_calculatedSplit.toStringAsFixed(2)}',
                  style: const TextStyle(color: Colors.cyanAccent, fontSize: 18.0, fontWeight: FontWeight.bold),
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

  Widget _buildJobHistoryList() {
    final jobs = widget.payrollService.jobLogs;

    return GlowingCard(
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '📋 RECENT JOBS RECORDED',
                style: GoogleFonts.outfit(fontSize: 16.0, fontWeight: FontWeight.bold, color: Colors.purpleAccent),
              ),
              Text(
                '${jobs.length} Total',
                style: const TextStyle(color: Colors.white38, fontSize: 12.0),
              ),
            ],
          ),
          const Divider(color: Colors.white12, height: 24.0),
          
          jobs.isEmpty
              ? const SizedBox(
                  height: 200.0,
                  child: Center(
                    child: Text('No load jobs recorded yet.', style: TextStyle(color: Colors.white24)),
                  ),
                )
              : SizedBox(
                  height: 580.0,
                  child: ListView.builder(
                    itemCount: jobs.length,
                    itemBuilder: (context, index) {
                      // Reverse order to show newest job first
                      final job = jobs[jobs.length - 1 - index];
                      return Container(
                        margin: const EdgeInsets.symmetric(vertical: 6.0),
                        padding: const EdgeInsets.all(12.0),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.02),
                          borderRadius: BorderRadius.circular(10.0),
                          border: Border.all(color: Colors.white.withOpacity(0.05)),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Expanded(
                                        child: Text(
                                          job.jobName,
                                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13.0),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 8.0),
                                      Text(
                                        job.date,
                                        style: const TextStyle(color: Colors.cyanAccent, fontSize: 11.0, fontWeight: FontWeight.bold),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6.0),
                                  Text(
                                    'Load: ${job.totalTons.toStringAsFixed(0)} Tons @ ₹${job.ratePerTon.toStringAsFixed(0)}/T',
                                    style: const TextStyle(color: Colors.white54, fontSize: 11.0),
                                  ),
                                  Builder(
                                    builder: (context) {
                                      final loadCrew = job.employeeIds.where((id) => widget.payrollService.isEmployeeLoadBasis(id)).toList();
                                      final double dynamicShare = widget.payrollService.getEmployeeJobSplit(job, loadCrew.isNotEmpty ? loadCrew.first : '');
                                      return Text(
                                        'Crew: ${job.employeeIds.length} members | Loader Share: ₹${dynamicShare.toStringAsFixed(1)} each',
                                        style: const TextStyle(color: Colors.white38, fontSize: 11.0),
                                      );
                                    },
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 10.0),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, color: Colors.redAccent, size: 18.0),
                              onPressed: () {
                                setState(() {
                                  widget.payrollService.deleteJobLog(job.id);
                                });
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Job log deleted successfully')),
                                );
                              },
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
        ],
      ),
    );
  }
}
