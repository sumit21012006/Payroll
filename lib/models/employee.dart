class Employee {
  final String employeeId;
  final String name;
  final String department;
  final double salaryPerDay;
  final double deductionPerDay;

  Employee({
    required this.employeeId,
    required this.name,
    required this.department,
    required this.salaryPerDay,
    required this.deductionPerDay,
  });

  bool get isLoadBasis => salaryPerDay == 0.0;

  factory Employee.fromCsvRow(List<dynamic> row) {
    // Expected header: employee_id,name,department,salary_per_day,deduction_per_day
    final String id = row[0].toString().trim();
    final String empName = row[1].toString().trim();
    final String dept = row[2].toString().trim();
    final double sal = double.tryParse(row[3].toString()) ?? 0.0;
    final double ded = double.tryParse(row[4].toString()) ?? 0.0;

    return Employee(
      employeeId: id,
      name: empName,
      department: dept,
      salaryPerDay: sal,
      deductionPerDay: ded,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'employee_id': employeeId,
      'name': name,
      'department': department,
      'salary_per_day': salaryPerDay,
      'deduction_per_day': deductionPerDay,
    };
  }
}
