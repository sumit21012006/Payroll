import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/payroll_service.dart';
import '../models/employee.dart';
import '../models/job_log.dart';
import '../widgets/glowing_card.dart';
import 'login_screen.dart';

class CastingInfo {
  final String code;
  final String name;
  final double weightKg;

  const CastingInfo({required this.code, required this.name, required this.weightKg});

  String get displayName => '$code - $name ($weightKg kg)';
}

class SelectedCasting {
  final CastingInfo casting;
  int quantity;
  late final TextEditingController controller;

  SelectedCasting({required this.casting, this.quantity = 0}) {
    controller = TextEditingController(text: quantity > 0 ? quantity.toString() : '');
  }
}


const List<CastingInfo> _defaultCastings = [
  CastingInfo(code: '402', name: '4DI BLOCK', weightKg: 83.9),
  CastingInfo(code: '459', name: 'DHRUV 3DI BLOCK', weightKg: 74.2),
  CastingInfo(code: '745', name: 'DHRUV 4DI BLOCK', weightKg: 89.5),
  CastingInfo(code: '4011', name: 'D25 REIMAGINE', weightKg: 86.6),
  CastingInfo(code: '715', name: 'D25LCV', weightKg: 90.4),
  CastingInfo(code: '466', name: 'P-15 CYL BLOCK', weightKg: 46.4),
  CastingInfo(code: '467', name: 'ZD30 UPPER BLK', weightKg: 74.7),
  CastingInfo(code: '475', name: 'MHWAK REG', weightKg: 69.2),
  CastingInfo(code: '717', name: 'W109', weightKg: 72.0),
  CastingInfo(code: '718', name: 'D09 2CB', weightKg: 42.5),
  CastingInfo(code: '730', name: '3D15', weightKg: 55.6),
  CastingInfo(code: '731', name: '4D15', weightKg: 62.7),
  CastingInfo(code: '748', name: 'UPP BLK', weightKg: 53.4),
  CastingInfo(code: '476', name: '2CB TURBO CHARGER', weightKg: 42.0),
  CastingInfo(code: '719', name: 'HINO BLOCK', weightKg: 104.1),
  CastingInfo(code: '732', name: 'YANMAR BLOCK', weightKg: 40.8),
  CastingInfo(code: '729', name: '3R 1190 CYL BLOCK', weightKg: 106.4),
  CastingInfo(code: '4029', name: '3R 550 BLOCK', weightKg: 54.9),
  CastingInfo(code: '4026', name: 'EICHER -483', weightKg: 110.9),
  CastingInfo(code: '4046', name: 'EICHER TITAN BLOCK', weightKg: 87.0),
  CastingInfo(code: '495', name: 'EICHER 3CB', weightKg: 80.5),
  CastingInfo(code: '711', name: 'EICHER 4CB', weightKg: 96.3),
  CastingInfo(code: '4022', name: 'EICHER 110 HP', weightKg: 110.3),
  CastingInfo(code: '4068', name: 'ISUZU', weightKg: 73.0),
];


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
  final TextEditingController _qtyController = TextEditingController();
  final TextEditingController _dateController = TextEditingController();
  
  List<String> _selectedEmployeeIds = [];
  String _searchQuery = '';
  String _deptFilter = 'All'; // Default filter to show all crew first

  double _calculatedTotal = 0.0;
  double _calculatedSplit = 0.0;

  CastingInfo? _selectedCasting;
  List<SelectedCasting> _selectedCastingsList = [];

  final List<String> _defaultJobNames = [
    'HE Casting - ₹320/Ton',
    'Final Quality Inspection - ₹220/Ton',
    'Rework Sorting - ₹4.90/Piece',
    'Painting Job - ₹6.00/Piece',
    'AVG Inspection - ₹5.00/Piece',
    'Yanmark Line Assembly - ₹28.00/Piece',
    'Other (Write Custom Name)...'
  ];
  String _selectedJobName = 'HE Casting - ₹320/Ton';
  bool _isCustomJob = false;
  String _selectedUnit = 'Tons';
  String _crewRecommendation = 'HE Casting: Per Ton - ₹320/-';

  void _updateJobProperties(String jobName) {
    if (jobName == 'Other (Write Custom Name)...') {
      _isCustomJob = true;
      _selectedUnit = 'Tons';
      _rateController.text = '';
      _crewRecommendation = 'Custom Job - Enter Rate and Qty manually';
    } else {
      _isCustomJob = false;
      if (jobName.startsWith('HE Casting')) {
        _selectedUnit = 'Tons';
        _rateController.text = '320.0';
        _crewRecommendation = 'HE Casting: Per Ton - ₹320/-';
      } else if (jobName.startsWith('Final Quality')) {
        _selectedUnit = 'Tons';
        _rateController.text = '220.0';
        _crewRecommendation = 'Final Inspection: Per Ton - ₹220/-';
      } else if (jobName.startsWith('Rework Sorting')) {
        _selectedUnit = 'Pieces';
        _rateController.text = '4.90';
        _crewRecommendation = 'Rework: Per Piece - ₹4.90/- (Standard Crew: 2 Employees)';
      } else if (jobName.startsWith('Painting Job')) {
        _selectedUnit = 'Pieces';
        _rateController.text = '6.00';
        _crewRecommendation = 'Painter: Per Piece - ₹6/- (Standard Crew: 3 Shifts, 3 Employees per shift)';
      } else if (jobName.startsWith('AVG Inspection')) {
        _selectedUnit = 'Pieces';
        _rateController.text = '5.00';
        _crewRecommendation = 'AVG: Per Piece - ₹5/- (Standard Crew: 2 Shifts, 1 Employee per shift)';
      } else if (jobName.startsWith('Yanmark Line')) {
        _selectedUnit = 'Pieces';
        _rateController.text = '28.00';
        _crewRecommendation = 'Yanmark: Per Piece - ₹28/- (Standard Crew: 1 Shift, 3 Employees)';
      }
    }
  }

  void _onQtyChanged() {
    if (_selectedCasting != null) {
      final qty = int.tryParse(_qtyController.text) ?? 0;
      if (_selectedUnit == 'Tons') {
        final double calculatedTons = (_selectedCasting!.weightKg * qty) / 1000.0;
        _tonsController.text = calculatedTons.toStringAsFixed(3);
      } else {
        _tonsController.text = qty.toString();
      }
    }
  }

  void _addCastingToList(CastingInfo casting) {
    final exists = _selectedCastingsList.any((sc) => sc.casting.code == casting.code);
    if (!exists) {
      final newSc = SelectedCasting(casting: casting);
      newSc.controller.addListener(() {
        _recalculateTonsAndQtyFromCastings();
      });
      setState(() {
        _selectedCastingsList.add(newSc);
      });
      _recalculateTonsAndQtyFromCastings();
    }
  }

  void _removeCastingFromList(int index) {
    final sc = _selectedCastingsList[index];
    sc.controller.dispose();
    setState(() {
      _selectedCastingsList.removeAt(index);
    });
    _recalculateTonsAndQtyFromCastings();
  }

  void _recalculateTonsAndQtyFromCastings() {
    double totalTons = 0.0;
    int totalQty = 0;
    for (var entry in _selectedCastingsList) {
      final qty = int.tryParse(entry.controller.text) ?? 0;
      entry.quantity = qty;
      totalTons += (entry.casting.weightKg * qty) / 1000.0;
      totalQty += qty;
    }
    if (_selectedCastingsList.isNotEmpty) {
      if (_selectedUnit == 'Tons') {
        _tonsController.text = totalTons.toStringAsFixed(3);
      } else {
        _tonsController.text = totalQty.toString();
      }
      _qtyController.text = totalQty.toString();
    } else {
      _tonsController.clear();
      _qtyController.clear();
    }
  }

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _dateController.text = '${now.month}/${now.day}/${now.year}';
    _selectedJobName = _defaultJobNames.first;
    _updateJobProperties(_selectedJobName);
    _tonsController.addListener(_calculateSplits);
    _rateController.addListener(_calculateSplits);
    _qtyController.addListener(_onQtyChanged);
  }

  @override
  void dispose() {
    _jobNameController.dispose();
    _tonsController.dispose();
    _rateController.dispose();
    _qtyController.dispose();
    _dateController.dispose();
    for (var sc in _selectedCastingsList) {
      sc.controller.dispose();
    }
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
      
      String? finalCastingName;
      int? finalCastingQty;
      
      if (_selectedCastingsList.isNotEmpty) {
        finalCastingName = _selectedCastingsList
            .where((sc) => sc.quantity > 0)
            .map((sc) => '${sc.casting.code} (${sc.quantity} pcs)')
            .join(', ');
        if (finalCastingName.isEmpty) {
          finalCastingName = null;
        }
        finalCastingQty = _selectedCastingsList.fold<int>(0, (sum, sc) => sum + sc.quantity);
        if (finalCastingQty == 0) {
          finalCastingQty = null;
        }
      } else if (_selectedCasting != null) {
        finalCastingName = _selectedCasting!.displayName;
        finalCastingQty = int.tryParse(_qtyController.text);
      }

      final newJob = JobLog(
        id: 'JOB-${DateTime.now().millisecondsSinceEpoch.toString().substring(8)}',
        date: _dateController.text.trim(),
        jobName: jobName,
        totalTons: tons,
        ratePerTon: rate,
        employeeIds: List<String>.from(_selectedEmployeeIds),
        unit: _selectedUnit,
        castingName: finalCastingName,
        castingQty: finalCastingQty,
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
        _qtyController.clear();
        final now = DateTime.now();
        _dateController.text = '${now.month}/${now.day}/${now.year}';
        _selectedCasting = null;
        for (var sc in _selectedCastingsList) {
          sc.controller.dispose();
        }
        _selectedCastingsList.clear();
        _selectedEmployeeIds.clear();
        _selectedJobName = _defaultJobNames.first;
        _isCustomJob = false;
        _updateJobProperties(_selectedJobName);
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
            
            // Job Name (Full width dropdown)
            Column(
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
                            _updateJobProperties(val);
                            _calculateSplits();
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
            const SizedBox(height: 15.0),

            // Date Selection Field
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Date (M/D/YYYY)', style: TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8.0),
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.02),
                    borderRadius: BorderRadius.circular(10.0),
                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                  ),
                  child: TextFormField(
                    controller: _dateController,
                    style: const TextStyle(color: Colors.white, fontSize: 14.0),
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) return 'Required';
                      final regExp = RegExp(r'^\d{1,2}/\d{1,2}/\d{4}$');
                      if (!regExp.hasMatch(v.trim())) {
                        return 'Use format M/D/YYYY (e.g. 5/15/2026)';
                      }
                      return null;
                    },
                    decoration: InputDecoration(
                      hintText: 'e.g. 5/1/2026',
                      hintStyle: const TextStyle(color: Colors.white24, fontSize: 13.0),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 14.0),
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.calendar_month_outlined, color: Colors.cyanAccent, size: 18.0),
                        onPressed: () async {
                          DateTime initialDate;
                          try {
                            final parts = _dateController.text.split('/');
                            initialDate = DateTime(
                              int.parse(parts[2]),
                              int.parse(parts[0]),
                              int.parse(parts[1]),
                            );
                          } catch (_) {
                            initialDate = DateTime.now();
                          }

                          final DateTime? picked = await showDatePicker(
                            context: context,
                            initialDate: initialDate,
                            firstDate: DateTime(2020, 1, 1),
                            lastDate: DateTime(2035, 12, 31),
                            builder: (context, child) {
                              return Theme(
                                data: Theme.of(context).copyWith(
                                  colorScheme: const ColorScheme.dark(
                                    primary: Colors.cyanAccent,
                                    onPrimary: Colors.black,
                                    surface: const Color(0xFF1E293B),
                                    onSurface: Colors.white,
                                  ),
                                  dialogBackgroundColor: const Color(0xFF151D2A),
                                ),
                                child: child!,
                              );
                            },
                          );

                          if (picked != null) {
                            setState(() {
                              _dateController.text = '${picked.month}/${picked.day}/${picked.year}';
                            });
                          }
                        },
                      ),
                    ),
                  ),
                ),
              ],
            ),
            if (_isCustomJob) ...[
              const SizedBox(height: 15.0),
              Row(
                children: [
                  Expanded(
                    flex: 6,
                    child: Column(
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
                  ),
                  const SizedBox(width: 15.0),
                  Expanded(
                    flex: 4,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Unit Type', style: TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
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
                              value: _selectedUnit,
                              style: const TextStyle(color: Colors.white, fontSize: 14.0),
                              onChanged: (val) {
                                if (val != null) {
                                  setState(() {
                                    _selectedUnit = val;
                                    _calculateSplits();
                                  });
                                }
                              },
                              items: const [
                                DropdownMenuItem(value: 'Tons', child: Text('Tons')),
                                DropdownMenuItem(value: 'Pieces', child: Text('Pieces')),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 15.0),
            
            // Casting Selection Row
            Row(
              children: [
                Expanded(
                  flex: _selectedCastingsList.isEmpty ? 6 : 10,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Select Casting', style: TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8.0),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12.0),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.02),
                          borderRadius: BorderRadius.circular(10.0),
                          border: Border.all(color: Colors.white.withOpacity(0.08)),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<CastingInfo?>(
                            dropdownColor: const Color(0xFF1E293B),
                            isExpanded: true,
                            value: null,
                            hint: Row(
                              children: [
                                Icon(Icons.add_circle_outline, color: Colors.cyanAccent.withOpacity(0.8), size: 16.0),
                                const SizedBox(width: 8.0),
                                const Expanded(
                                  child: Text(
                                    'Add Casting...',
                                    style: TextStyle(color: Colors.cyanAccent, fontSize: 13.0),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                            style: const TextStyle(color: Colors.white, fontSize: 13.0),
                            onChanged: (val) {
                              if (val != null) {
                                _addCastingToList(val);
                              }
                            },
                            items: [
                              ..._defaultCastings.map((c) {
                                return DropdownMenuItem<CastingInfo?>(
                                  value: c,
                                  child: Text(c.displayName),
                                );
                              }),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_selectedCastingsList.isEmpty) ...[
                  const SizedBox(width: 15.0),
                  Expanded(
                    flex: 4,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Quantity (Pieces)', style: TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8.0),
                        Container(
                          decoration: BoxDecoration(
                            color: _selectedCasting == null ? Colors.white.withOpacity(0.01) : Colors.white.withOpacity(0.02),
                            borderRadius: BorderRadius.circular(10.0),
                            border: Border.all(
                              color: _selectedCasting == null ? Colors.white.withOpacity(0.03) : Colors.white.withOpacity(0.08),
                            ),
                          ),
                          child: TextFormField(
                            controller: _qtyController,
                            keyboardType: TextInputType.number,
                            enabled: _selectedCasting != null,
                            style: TextStyle(
                              color: _selectedCasting == null ? Colors.white30 : Colors.white, 
                              fontSize: 14.0,
                            ),
                            decoration: InputDecoration(
                              hintText: 'e.g. 150',
                              hintStyle: const TextStyle(color: Colors.white24, fontSize: 13.0),
                              border: InputBorder.none,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 12.0),
                              suffixIcon: _selectedCasting != null 
                                ? IconButton(
                                    icon: const Icon(Icons.clear, size: 16.0, color: Colors.white30),
                                    onPressed: () {
                                      _qtyController.clear();
                                      _onQtyChanged();
                                    },
                                  )
                                : null,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
            
            if (_selectedCastingsList.isNotEmpty) ...[
              const SizedBox(height: 15.0),
              const Text(
                'SELECTED CASTINGS & QUANTITIES',
                style: TextStyle(color: Colors.cyanAccent, fontSize: 11.0, fontWeight: FontWeight.bold, letterSpacing: 0.5),
              ),
              const SizedBox(height: 8.0),
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _selectedCastingsList.length,
                itemBuilder: (context, idx) {
                  final sc = _selectedCastingsList[idx];
                  final double castingTons = (sc.casting.weightKg * sc.quantity) / 1000.0;
                  return Container(
                    margin: const EdgeInsets.symmetric(vertical: 4.0),
                    padding: const EdgeInsets.all(12.0),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.02),
                      borderRadius: BorderRadius.circular(10.0),
                      border: Border.all(color: Colors.white.withOpacity(0.08)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          flex: 6,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${sc.casting.code} - ${sc.casting.name}',
                                style: const TextStyle(color: Colors.white, fontSize: 13.0, fontWeight: FontWeight.bold),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4.0),
                              Text(
                                '${sc.casting.weightKg} kg | ${castingTons.toStringAsFixed(3)} Tons',
                                style: const TextStyle(color: Colors.white38, fontSize: 11.0),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 15.0),
                        Expanded(
                          flex: 3,
                          child: Container(
                            height: 38.0,
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.02),
                              borderRadius: BorderRadius.circular(8.0),
                              border: Border.all(color: Colors.white.withOpacity(0.08)),
                            ),
                            child: TextFormField(
                              controller: sc.controller,
                              keyboardType: TextInputType.number,
                              style: const TextStyle(color: Colors.white, fontSize: 13.0),
                              textAlign: TextAlign.center,
                              decoration: const InputDecoration(
                                hintText: 'Qty',
                                hintStyle: TextStyle(color: Colors.white24, fontSize: 12.0),
                                border: InputBorder.none,
                                contentPadding: EdgeInsets.symmetric(vertical: 10.0),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8.0),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, color: Colors.redAccent, size: 20.0),
                          onPressed: () => _removeCastingFromList(idx),
                          tooltip: 'Remove',
                        ),
                      ],
                    ),
                  );
                },
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
                      Text(_selectedUnit == 'Tons' ? 'Total Tons Done' : 'Total Pieces Done', style: const TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
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
                          decoration: InputDecoration(
                            hintText: _selectedUnit == 'Tons' ? 'e.g. 150' : 'e.g. 1200',
                            hintStyle: const TextStyle(color: Colors.white24, fontSize: 13.0),
                            border: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12.0),
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
                      Text(_selectedUnit == 'Tons' ? 'Rate per Ton (₹)' : 'Rate per Piece (₹)', style: const TextStyle(color: Colors.white60, fontSize: 12.0, fontWeight: FontWeight.bold)),
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
                          decoration: InputDecoration(
                            hintText: _selectedUnit == 'Tons' ? 'e.g. 15' : 'e.g. 6',
                            hintStyle: const TextStyle(color: Colors.white24, fontSize: 13.0),
                            border: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12.0),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20.0),
            
            // Recommendation Helper Card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12.0),
              margin: const EdgeInsets.only(bottom: 4.0),
              decoration: BoxDecoration(
                color: Colors.cyan.withOpacity(0.05),
                borderRadius: BorderRadius.circular(10.0),
                border: Border.all(color: Colors.cyan.withOpacity(0.2)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: Colors.cyanAccent, size: 20.0),
                  const SizedBox(width: 10.0),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'STANDARD RATE & CREW DESIGNATION',
                          style: TextStyle(color: Colors.cyanAccent, fontSize: 10.0, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                        ),
                        const SizedBox(height: 4.0),
                        Text(
                          _crewRecommendation,
                          style: const TextStyle(color: Colors.white70, fontSize: 12.0),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
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

    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Colors.cyan.withOpacity(0.05),
        borderRadius: BorderRadius.circular(10.0),
        border: Border.all(color: Colors.cyan.withOpacity(0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
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
          if (_selectedEmployeeIds.isNotEmpty) ...[
            const Divider(color: Colors.white12, height: 24.0),
            const Text(
              'PAY DISTRIBUTION BREAKDOWN',
              style: TextStyle(color: Colors.cyanAccent, fontSize: 10.0, fontWeight: FontWeight.bold, letterSpacing: 0.5),
            ),
            const SizedBox(height: 8.0),
            if (dayCrew.isNotEmpty && loadCrew.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 8.0),
                child: Text(
                  'Note: Day Basis wages (Total ₹${totalDayWagesToDeduct.toStringAsFixed(0)}) are deducted from Total Job Value before dividing the remaining pool among Load Basis workers.',
                  style: const TextStyle(color: Colors.white38, fontSize: 11.0, fontStyle: FontStyle.italic),
                ),
              ),
            ],
            Column(
              children: _selectedEmployeeIds.map((empId) {
                final emp = widget.payrollService.employees.firstWhere(
                  (e) => e.employeeId == empId,
                  orElse: () => Employee(
                    employeeId: empId,
                    name: 'Unknown',
                    department: '',
                    salaryPerDay: 636.0,
                    deductionPerDay: 0.0,
                  ),
                );
                final isLoad = widget.payrollService.isEmployeeLoadBasis(empId);
                final double wage = isLoad 
                    ? _calculatedSplit 
                    : (emp.salaryPerDay > 0 ? emp.salaryPerDay : 636.0);
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(
                            isLoad ? Icons.fitness_center_outlined : Icons.calendar_today_outlined,
                            color: isLoad ? Colors.purpleAccent : Colors.cyanAccent,
                            size: 13.0,
                          ),
                          const SizedBox(width: 8.0),
                          Text(
                            '${emp.name} (${isLoad ? "Load" : "Day"})',
                            style: const TextStyle(color: Colors.white70, fontSize: 12.0),
                          ),
                        ],
                      ),
                      Text(
                        '₹${wage.toStringAsFixed(2)}',
                        style: TextStyle(
                          color: isLoad ? Colors.purpleAccent : Colors.cyanAccent,
                          fontSize: 12.0,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ],
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
                                  Text(
                                    job.unit == 'Tons'
                                        ? 'Load: ${job.totalTons.toStringAsFixed(3)} Tons @ ₹${job.ratePerTon.toStringAsFixed(0)}/T'
                                        : 'Qty: ${job.totalTons.toStringAsFixed(0)} Pieces @ ₹${job.ratePerTon.toStringAsFixed(2)}/Pc',
                                    style: const TextStyle(color: Colors.white54, fontSize: 11.0),
                                  ),
                                  if (job.castingName != null) ...[
                                    const SizedBox(height: 3.0),
                                    Text(
                                      'Casting: ${job.castingName} | Qty: ${job.castingQty} pcs',
                                      style: const TextStyle(color: Colors.cyanAccent, fontSize: 11.0, fontWeight: FontWeight.w500),
                                    ),
                                  ],
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
