import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'services/payroll_service.dart';
import 'screens/login_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  final payrollService = PayrollService();
  
  runApp(PayrollApp(payrollService: payrollService));
}

class PayrollApp extends StatelessWidget {
  final PayrollService payrollService;

  const PayrollApp({super.key, required this.payrollService});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Antigravity Payroll',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.cyan,
          brightness: Brightness.dark,
          primary: Colors.cyan,
          secondary: const Color(0xFF8B5CF6),
          background: const Color(0xFF0F172A),
          surface: const Color(0xFF1E293B),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1E293B),
          foregroundColor: Colors.white,
          elevation: 0,
        ),
      ),
      home: PayrollInitializer(payrollService: payrollService),
    );
  }
}

class PayrollInitializer extends StatefulWidget {
  final PayrollService payrollService;

  const PayrollInitializer({super.key, required this.payrollService});

  @override
  State<PayrollInitializer> createState() => _PayrollInitializerState();
}

class _PayrollInitializerState extends State<PayrollInitializer> {
  bool _isLoading = true;
  String _loadingMessage = 'Loading Corporate Databases...';

  @override
  void initState() {
    super.initState();
    _startInitialization();
  }

  Future<void> _startInitialization() async {
    try {
      await widget.payrollService.init();
      setState(() {
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _loadingMessage = 'Initialization failed. Please check asset configurations.';
      });
      print('Initialization failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
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
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.fingerprint,
                  size: 80.0,
                  color: Colors.cyanAccent,
                ),
                const SizedBox(height: 24.0),
                Text(
                  'ANTIGRAVITY PAYROLL',
                  style: GoogleFonts.outfit(
                    fontSize: 24.0,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: 2.0,
                  ),
                ),
                const SizedBox(height: 12.0),
                SizedBox(
                  width: 200.0,
                  child: LinearProgressIndicator(
                    backgroundColor: Colors.white10,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.cyanAccent.withOpacity(0.8)),
                    borderRadius: BorderRadius.circular(4.0),
                  ),
                ),
                const SizedBox(height: 16.0),
                Text(
                  _loadingMessage,
                  style: const TextStyle(
                    color: Colors.white38,
                    fontSize: 12.0,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return LoginScreen(payrollService: widget.payrollService);
  }
}
