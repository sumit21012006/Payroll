import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/payroll_service.dart';
import '../models/employee.dart';
import '../widgets/glowing_card.dart';
import 'admin_dashboard.dart';
import 'supervisor_dashboard.dart';
import 'employee_dashboard.dart';

class LoginScreen extends StatefulWidget {
  final PayrollService payrollService;

  const LoginScreen({super.key, required this.payrollService});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  int _selectedRoleIndex = 0; // 0 = Employee, 1 = Supervisor, 2 = Admin
  final TextEditingController _idController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  
  Employee? _matchedEmployee;
  String _errorMessage = '';

  @override
  void initState() {
    super.initState();
    _idController.addListener(_onIdChanged);
  }

  @override
  void dispose() {
    _idController.removeListener(_onIdChanged);
    _idController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _onIdChanged() {
    final text = _idController.text.trim();
    if (_selectedRoleIndex == 0) {
      if (text.length >= 4) {
        final emp = widget.payrollService.employees.firstWhere(
          (e) => e.employeeId == text,
          orElse: () => Employee(
            employeeId: '',
            name: '',
            department: '',
            salaryPerDay: 0.0,
            deductionPerDay: 0.0,
          ),
        );

        setState(() {
          if (emp.employeeId.isNotEmpty) {
            _matchedEmployee = emp;
            _errorMessage = '';
          } else {
            _matchedEmployee = null;
            _errorMessage = 'Employee ID not found';
          }
        });
      } else {
        setState(() {
          _matchedEmployee = null;
          _errorMessage = '';
        });
      }
    }
  }

  void _handleLogin() {
    setState(() {
      _errorMessage = '';
    });

    if (_selectedRoleIndex == 0) {
      // Employee
      if (_matchedEmployee != null) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => EmployeeDashboard(
              employee: _matchedEmployee!,
              payrollService: widget.payrollService,
            ),
          ),
        );
      } else {
        setState(() {
          _errorMessage = 'Please enter a valid Employee ID';
        });
      }
    } else if (_selectedRoleIndex == 1) {
      // Supervisor
      final pass = _passwordController.text;
      if (pass.toLowerCase() == 'supervisor' || pass == '123') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => SupervisorDashboard(
              payrollService: widget.payrollService,
            ),
          ),
        );
      } else {
        setState(() {
          _errorMessage = 'Incorrect Supervisor passcode';
        });
      }
    } else {
      // Admin
      final pass = _passwordController.text;
      if (pass.toLowerCase() == 'admin' || pass == '123') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => AdminDashboard(
              payrollService: widget.payrollService,
            ),
          ),
        );
      } else {
        setState(() {
          _errorMessage = 'Incorrect Admin passcode';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final Size size = MediaQuery.of(context).size;
    const double pagePadding = 8.0;
    const double cardPadding = 12.0;

    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF0F172A), // Deep Slate
              Color(0xFF020617), // Pure Dark Charcoal
              Color(0xFF1E1B4B), // Midnight Violet
            ],
          ),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Background decor elements (Glowing neon orbs)
            Positioned(
              top: size.height * 0.15,
              left: size.width * 0.15,
              child: Container(
                width: 250.0,
                height: 250.0,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.transparent,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.cyan.withOpacity(0.08),
                      blurRadius: 100.0,
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              bottom: size.height * 0.15,
              right: size.width * 0.15,
              child: Container(
                width: 300.0,
                height: 300.0,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.transparent,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.purple.withOpacity(0.06),
                      blurRadius: 120.0,
                    ),
                  ],
                ),
              ),
            ),
            // Login panel
            SingleChildScrollView(
              padding: EdgeInsets.symmetric(horizontal: pagePadding, vertical: 24.0),
              child: Center(
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 800.0), // Fills screens up to 800px wide, centers on ultra-wide screens
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Logo / Icon
                      Icon(
                        Icons.fingerprint,
                        size: 72.0,
                        color: Colors.cyanAccent.withOpacity(0.9),
                      ),
                      const SizedBox(height: 12.0),
                      Text(
                        'KFIL SOLAPUR PAYROLL',
                        style: GoogleFonts.outfit(
                          fontSize: 26.0,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          letterSpacing: 2.0,
                        ),
                      ),
                      Text(
                        'Biometric & Load-Basis Integration',
                        style: GoogleFonts.inter(
                          fontSize: 13.0,
                          color: Colors.white38,
                          letterSpacing: 1.0,
                        ),
                      ),
                      const SizedBox(height: 30.0),
                      // Card
                      GlowingCard(
                        glowRadius: 20.0,
                        glowColor: Colors.cyan,
                        padding: EdgeInsets.symmetric(horizontal: cardPadding, vertical: 30.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Select Login Portal',
                              style: GoogleFonts.outfit(
                                fontSize: 16.0,
                                fontWeight: FontWeight.bold,
                                color: Colors.white70,
                              ),
                            ),
                            const SizedBox(height: 12.0),
                            // Role Selector Tabs
                            _buildRoleTabs(),
                            const SizedBox(height: 30.0),
                            // Form inputs
                            if (_selectedRoleIndex == 0) ...[
                              _buildInputField(
                                label: 'Employee ID',
                                hint: 'Enter Employee ID (e.g. KFIL/L1-406)',
                                controller: _idController,
                                icon: Icons.badge_outlined,
                                keyboardType: TextInputType.text,
                              ),
                              _buildEmployeeDetailsDisplay(),
                            ] else ...[
                              _buildInputField(
                                label: _selectedRoleIndex == 1 
                                    ? 'Supervisor Passcode' 
                                    : 'Administrator Passcode',
                                hint: 'Enter passcode (demo: ${_selectedRoleIndex == 1 ? "supervisor" : "admin"})',
                                controller: _passwordController,
                                icon: Icons.lock_outline,
                                obscureText: true,
                              ),
                            ],
                            if (_errorMessage.isNotEmpty) ...[
                              const SizedBox(height: 10.0),
                              Text(
                                _errorMessage,
                                style: const TextStyle(
                                  color: Colors.redAccent,
                                  fontSize: 12.0,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                            const SizedBox(height: 30.0),
                            // Login Button
                            _buildLoginButton(),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20.0),
                      // Demo Helpers info
                      Opacity(
                        opacity: 0.6,
                        child: Container(
                          padding: const EdgeInsets.all(12.0),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.02),
                            borderRadius: BorderRadius.circular(10.0),
                          ),
                          child: const Column(
                            children: [
                              Text(
                                '💡 Quick Demo Login Helpers:',
                                style: TextStyle(color: Colors.cyanAccent, fontSize: 11.0, fontWeight: FontWeight.bold),
                              ),
                              SizedBox(height: 4.0),
                              Text(
                                'Admin: "admin"  |  Supervisor: "supervisor"',
                                style: TextStyle(color: Colors.white54, fontSize: 10.0),
                              ),
                              Text(
                                'Real Emp: "KFIL/L1-406" (ABHIJIT P WAGHMARE)  |  "KFIL/L1-410" (AKIB SADIK SHAIKH)',
                                style: TextStyle(color: Colors.white54, fontSize: 10.0),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRoleTabs() {
    final List<String> roles = ['Employee', 'Supervisor', 'Admin'];

    return Container(
      width: double.infinity,
      height: 45.0,
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(10.0),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: List.generate(3, (index) {
          final isSelected = _selectedRoleIndex == index;
          return Expanded(
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _selectedRoleIndex = index;
                  _errorMessage = '';
                  _matchedEmployee = null;
                  _idController.clear();
                  _passwordController.clear();
                });
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8.0),
                  gradient: isSelected
                      ? const LinearGradient(
                          colors: [Colors.cyan, Color(0xFF8B5CF6)],
                        )
                      : null,
                ),
                child: Text(
                  roles[index],
                  style: TextStyle(
                    fontSize: 12.0,
                    fontWeight: FontWeight.bold,
                    color: isSelected ? Colors.white : Colors.white38,
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildInputField({
    required String label,
    required String hint,
    required TextEditingController controller,
    required IconData icon,
    bool obscureText = false,
    TextInputType keyboardType = TextInputType.text,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 12.0,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8.0),
        Container(
          height: 50.0,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.02),
            borderRadius: BorderRadius.circular(10.0),
            border: Border.all(color: Colors.white.withOpacity(0.08)),
          ),
          child: TextField(
            controller: controller,
            obscureText: obscureText,
            keyboardType: keyboardType,
            style: const TextStyle(color: Colors.white, fontSize: 14.0),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(color: Colors.white24, fontSize: 13.0),
              prefixIcon: Icon(icon, color: Colors.cyan, size: 20.0),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 14.0),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildEmployeeDetailsDisplay() {
    if (_matchedEmployee == null) return const SizedBox.shrink();
    
    final isLoad = widget.payrollService.isEmployeeLoadBasis(_matchedEmployee!.employeeId);

    return Container(
      margin: const EdgeInsets.only(top: 15.0),
      padding: const EdgeInsets.all(12.0),
      decoration: BoxDecoration(
        color: Colors.cyan.withOpacity(0.05),
        borderRadius: BorderRadius.circular(10.0),
        border: Border.all(color: Colors.cyan.withOpacity(0.15)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: Colors.cyan.withOpacity(0.2),
            radius: 18.0,
            child: Text(
              _matchedEmployee!.name.substring(0, 1),
              style: const TextStyle(color: Colors.cyanAccent, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 12.0),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _matchedEmployee!.name,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13.0),
                ),
                Text(
                  '${_matchedEmployee!.department} Dept | ${isLoad ? "Load Basis (Tons)" : "Day Basis"}',
                  style: const TextStyle(color: Colors.white54, fontSize: 11.0),
                ),
              ],
            ),
          ),
          const Icon(Icons.check_circle, color: Colors.greenAccent, size: 18.0),
        ],
      ),
    );
  }

  Widget _buildLoginButton() {
    // Enabled only if credentials are met
    bool isEnabled = true;
    if (_selectedRoleIndex == 0 && _matchedEmployee == null) {
      isEnabled = false;
    }

    return Container(
      width: double.infinity,
      height: 50.0,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10.0),
        gradient: LinearGradient(
          colors: isEnabled 
              ? [const Color(0xFF06B6D4), const Color(0xFF8B5CF6)] 
              : [Colors.grey.withOpacity(0.1), Colors.grey.withOpacity(0.05)],
        ),
      ),
      child: ElevatedButton(
        onPressed: isEnabled ? _handleLogin : null,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10.0)),
        ),
        child: Text(
          'ACCESS PORTAL',
          style: GoogleFonts.outfit(
            color: isEnabled ? Colors.white : Colors.white24,
            fontWeight: FontWeight.w900,
            fontSize: 14.0,
            letterSpacing: 1.5,
          ),
        ),
      ),
    );
  }
}
