class JobLog {
  final String id;
  final String date;
  final String jobName;
  final double totalTons; // Acts as units done (either tons or pieces)
  final double ratePerTon; // Acts as rate per unit (either per ton or per piece)
  final List<String> employeeIds;
  final String unit; // 'Tons' or 'Pieces'

  JobLog({
    required this.id,
    required this.date,
    required this.jobName,
    required this.totalTons,
    required this.ratePerTon,
    required this.employeeIds,
    this.unit = 'Tons',
  });

  double get totalPayout => totalTons * ratePerTon;
  double get splitPayout => employeeIds.isEmpty ? 0.0 : totalPayout / employeeIds.length;

  factory JobLog.fromJson(Map<String, dynamic> json) {
    return JobLog(
      id: json['id'].toString(),
      date: json['date'].toString(),
      jobName: json['jobName'].toString(),
      totalTons: double.tryParse(json['totalTons'].toString()) ?? 0.0,
      ratePerTon: double.tryParse(json['ratePerTon'].toString()) ?? 0.0,
      employeeIds: List<String>.from(json['employeeIds'] ?? []),
      unit: json['unit']?.toString() ?? 'Tons',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'date': date,
      'jobName': jobName,
      'totalTons': totalTons,
      'ratePerTon': ratePerTon,
      'employeeIds': employeeIds,
      'unit': unit,
    };
  }
}
