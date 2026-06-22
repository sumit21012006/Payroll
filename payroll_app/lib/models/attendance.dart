class Attendance {
  final String employeeId;
  final String date;
  final String checkIn;
  final String checkOut;
  final String status;

  Attendance({
    required this.employeeId,
    required this.date,
    required this.checkIn,
    required this.checkOut,
    required this.status,
  });

  factory Attendance.fromCsvRow(List<dynamic> row) {
    // Expected header: employee_id,date,check_in,check_out,status
    return Attendance(
      employeeId: row[0].toString().trim(),
      date: row[1].toString().trim(),
      checkIn: row[2].toString().trim(),
      checkOut: row[3].toString().trim(),
      status: row[4].toString().trim(),
    );
  }

  DateTime get dateTime {
    // Formats: 5/3/2026
    final parts = date.split('/');
    if (parts.length == 3) {
      final month = int.tryParse(parts[0]) ?? 5;
      final day = int.tryParse(parts[1]) ?? 1;
      final year = int.tryParse(parts[2]) ?? 2026;
      return DateTime(year, month, day);
    }
    return DateTime(2026, 5, 1);
  }

  bool get isWeekend {
    final dayOfWeek = dateTime.weekday;
    return dayOfWeek == DateTime.saturday || dayOfWeek == DateTime.sunday;
  }

  double get hoursWorked {
    if (checkIn.isEmpty || checkOut.isEmpty) return 0.0;
    try {
      final checkInParts = checkIn.split(':');
      final checkOutParts = checkOut.split(':');
      if (checkInParts.length >= 2 && checkOutParts.length >= 2) {
        final inHour = int.parse(checkInParts[0]);
        final inMin = int.parse(checkInParts[1]);
        final outHour = int.parse(checkOutParts[0]);
        final outMin = int.parse(checkOutParts[1]);

        final double start = inHour + (inMin / 60.0);
        final double end = outHour + (outMin / 60.0);
        return end > start ? end - start : 0.0;
      }
    } catch (_) {
      // Gracefully handle parsing failures
    }
    return 0.0;
  }
}
