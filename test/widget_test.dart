import 'package:flutter_test/flutter_test.dart';
import 'package:payroll_app/main.dart';
import 'package:payroll_app/services/payroll_service.dart';

void main() {
  testWidgets('Payroll App Splash Initialization Test', (WidgetTester tester) async {
    final payrollService = PayrollService();
    
    // Build our app and trigger a frame.
    await tester.pumpWidget(PayrollApp(payrollService: payrollService));

    // Verify that the splash initializer screen is shown.
    expect(find.text('KFIL SOLAPUR PAYROLL'), findsOneWidget);
  });
}
