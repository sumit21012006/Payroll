class Employee {
  final String employeeId;
  final String name;
  final String department;
  final double salaryPerDay;
  final double deductionPerDay;
  final String uan;
  final String esic;
  final String bankName;
  final String ifscCode;
  final String bankAcc;
  final String punchingCode;
  final String mobileNo;

  Employee({
    required this.employeeId,
    required this.name,
    required this.department,
    required this.salaryPerDay,
    required this.deductionPerDay,
    this.uan = '',
    this.esic = '',
    this.bankName = '',
    this.ifscCode = '',
    this.bankAcc = '',
    this.punchingCode = '',
    this.mobileNo = '',
  });

  bool get isLoadBasis => salaryPerDay == 0.0;

  factory Employee.fromCsvRow(List<dynamic> row) {
    // Expected header: employee_id,name,department,salary_per_day,deduction_per_day
    // Plus new fields: uan,esic,bank_name,ifsc_code,bank_acc,punching_code,mobile_no
    final String id = row[0].toString().trim();
    final String empName = row[1].toString().trim();
    final String dept = row[2].toString().trim();
    final double sal = double.tryParse(row[3].toString()) ?? 0.0;
    final double ded = double.tryParse(row[4].toString()) ?? 0.0;

    final String uanVal = row.length > 5 ? row[5].toString().trim() : '';
    final String esicVal = row.length > 6 ? row[6].toString().trim() : '';
    final String bankNameVal = row.length > 7 ? row[7].toString().trim() : '';
    final String ifscCodeVal = row.length > 8 ? row[8].toString().trim() : '';
    final String bankAccVal = row.length > 9 ? row[9].toString().trim() : '';
    final String punchingCodeVal = row.length > 10 ? row[10].toString().trim() : '';
    final String mobileNoVal = row.length > 11 ? row[11].toString().trim() : '';

    return Employee(
      employeeId: id,
      name: empName,
      department: dept,
      salaryPerDay: sal,
      deductionPerDay: ded,
      uan: uanVal,
      esic: esicVal,
      bankName: bankNameVal,
      ifscCode: ifscCodeVal,
      bankAcc: bankAccVal,
      punchingCode: punchingCodeVal,
      mobileNo: mobileNoVal,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'employee_id': employeeId,
      'name': name,
      'department': department,
      'salary_per_day': salaryPerDay,
      'deduction_per_day': deductionPerDay,
      'uan': uan,
      'esic': esic,
      'bank_name': bankName,
      'ifsc_code': ifscCode,
      'bank_acc': bankAcc,
      'punching_code': punchingCode,
      'mobile_no': mobileNo,
    };
  }
}
