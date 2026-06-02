import 'package:flutter/material.dart';
import '../models/attendance.dart';
import '../models/job_log.dart';

class AttendanceCalendar extends StatelessWidget {
  final String employeeId;
  final List<Attendance> logs;
  final List<JobLog> jobs;
  final double itemSize;

  const AttendanceCalendar({
    super.key,
    required this.employeeId,
    required this.logs,
    required this.jobs,
    this.itemSize = 45.0,
  });

  @override
  Widget build(BuildContext context) {
    // May 2026 begins on a Friday (Day of week = 5, where Mon = 1, Sun = 7)
    // If our calendar starts on Sunday (where Sun = 0, Mon = 1 ... Sat = 6)
    // Then Friday is index 5, so we need 5 empty spaces at the beginning.
    const int startOffset = 5; 
    const int totalDays = 31;

    final weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Map logs by date string
    final Map<String, Attendance> logsMap = {
      for (var log in logs) log.date: log
    };

    // Map jobs by date string (if employee participated)
    final Map<String, List<JobLog>> jobsMap = {};
    for (var job in jobs) {
      if (job.employeeIds.contains(employeeId)) {
        jobsMap[job.date] = (jobsMap[job.date] ?? [])..add(job);
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Builder(
          builder: (context) {
            final bool isMobile = MediaQuery.of(context).size.width < 600;
            final titleWidget = const Text(
              'May 2026 Attendance Calendar',
              style: TextStyle(
                fontSize: 15.0,
                fontWeight: FontWeight.bold,
                color: Colors.cyanAccent,
              ),
            );
            final legendWidget = _buildLegendRow();

            return isMobile
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      titleWidget,
                      const SizedBox(height: 8.0),
                      legendWidget,
                    ],
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      titleWidget,
                      legendWidget,
                    ],
                  );
          },
        ),
        const SizedBox(height: 15.0),
        // Week headers
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisSpacing: 4.0,
            crossAxisSpacing: 4.0,
            childAspectRatio: 1.2,
          ),
          itemCount: 7,
          itemBuilder: (context, index) {
            return Center(
              child: Text(
                weekDays[index],
                style: const TextStyle(
                  color: Colors.white54,
                  fontSize: 12.0,
                  fontWeight: FontWeight.bold,
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 5.0),
        // Days Grid
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisSpacing: 8.0,
            crossAxisSpacing: 8.0,
          ),
          itemCount: startOffset + totalDays,
          itemBuilder: (context, index) {
            if (index < startOffset) {
              return const SizedBox.shrink(); // Empty space before Friday May 1st
            }

            final dayNum = index - startOffset + 1;
            final dateStr = '5/$dayNum/2026';
            final dt = DateTime(2026, 5, dayNum);
            final isWeekend = dt.weekday == DateTime.saturday || dt.weekday == DateTime.sunday;
            
            final attendance = logsMap[dateStr];
            final workedJobs = jobsMap[dateStr] ?? [];
            final hasJob = workedJobs.isNotEmpty;

            Color cellColor = Colors.white.withOpacity(0.04);
            Color textColor = Colors.white70;
            Color glowColor = Colors.transparent;
            String badgeText = '';

            if (attendance != null) {
              final status = attendance.status.toUpperCase();
              if (status.contains('PRESENT')) {
                cellColor = const Color(0xFF0F5132); // Emerald dark green
                glowColor = Colors.green;
                textColor = Colors.greenAccent;
                badgeText = 'P';
              } else if (status.contains('LATE')) {
                cellColor = const Color(0xFF664D03); // Dark amber/brown
                glowColor = Colors.amber;
                textColor = Colors.amberAccent;
                badgeText = 'L';
              } else if (status.contains('OVERTIME')) {
                cellColor = const Color(0xFF381A5D); // Deep purple
                glowColor = Colors.purpleAccent;
                textColor = const Color(0xFFE8D3FF);
                badgeText = 'OT';
              } else if (status.contains('HALF_DAY')) {
                cellColor = const Color(0xFF055160); // Dark teal/cyan
                glowColor = Colors.cyan;
                textColor = Colors.cyanAccent;
                badgeText = 'H';
              }
            } else if (!isWeekend) {
              // Weekday with no log = Absent
              cellColor = const Color(0xFF58151C); // Dark blood red
              glowColor = Colors.red;
              textColor = const Color(0xFFFFB3B7);
              badgeText = 'A';
            } else {
              // Weekend with no log
              cellColor = Colors.white.withOpacity(0.02);
              textColor = Colors.white24;
            }

            // Overlay indicator if they have supervisor jobs worked
            return Tooltip(
              message: _getTooltipMessage(dayNum, attendance, workedJobs, isWeekend),
              child: GestureDetector(
                onTap: () => _showDayDetails(context, dayNum, attendance, workedJobs, isWeekend),
                child: Container(
                  decoration: BoxDecoration(
                    color: cellColor,
                    borderRadius: BorderRadius.circular(10.0),
                    border: Border.all(
                      color: hasJob 
                          ? Colors.cyanAccent.withOpacity(0.8) 
                          : glowColor != Colors.transparent 
                              ? glowColor.withOpacity(0.2) 
                              : Colors.white.withOpacity(0.05),
                      width: hasJob ? 1.5 : 1.0,
                    ),
                    boxShadow: glowColor != Colors.transparent
                        ? [
                            BoxShadow(
                              color: glowColor.withOpacity(0.1),
                              blurRadius: 4.0,
                              spreadRadius: 1.0,
                            )
                          ]
                        : null,
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      // Day number
                      Positioned(
                        top: 4.0,
                        left: 6.0,
                        child: Text(
                          dayNum.toString(),
                          style: TextStyle(
                            color: textColor,
                            fontSize: 11.0,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      // Status Badge Text
                      if (badgeText.isNotEmpty)
                        Positioned(
                          bottom: 4.0,
                          right: 6.0,
                          child: Text(
                            badgeText,
                            style: TextStyle(
                              color: textColor,
                              fontSize: 9.0,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      // Job load indicator
                      if (hasJob)
                        const Positioned(
                          top: 4.0,
                          right: 4.0,
                          child: Icon(
                            Icons.layers,
                            size: 10.0,
                            color: Colors.cyanAccent,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  String _getTooltipMessage(int day, Attendance? log, List<JobLog> workedJobs, bool isWeekend) {
    String msg = 'May $day, 2026';
    if (log != null) {
      msg += '\nStatus: ${log.status}';
      msg += '\nHours: ${log.checkIn} - ${log.checkOut} (${log.hoursWorked.toStringAsFixed(2)} hrs)';
    } else if (!isWeekend) {
      msg += '\nStatus: Absent';
    } else {
      msg += '\nWeekend (Rest Day)';
    }

    if (workedJobs.isNotEmpty) {
      msg += '\nJobs Worked (${workedJobs.length}):';
      for (var job in workedJobs) {
        msg += '\n• ${job.jobName} (+₹${job.splitPayout.toStringAsFixed(0)})';
      }
    }
    return msg;
  }

  Widget _buildLegendRow() {
    Widget badge(String label, Color color) {
      return Row(
        children: [
          Container(
            width: 8.0,
            height: 8.0,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(2.0),
            ),
          ),
          const SizedBox(width: 4.0),
          Text(
            label,
            style: const TextStyle(fontSize: 10.0, color: Colors.white54),
          ),
        ],
      );
    }

    return Wrap(
      spacing: 8.0,
      children: [
        badge('Present', Colors.green),
        badge('Late', Colors.amber),
        badge('OT', Colors.purpleAccent),
        badge('Half', Colors.cyan),
        badge('Absent', Colors.red),
      ],
    );
  }

  void _showDayDetails(BuildContext context, int day, Attendance? log, List<JobLog> workedJobs, bool isWeekend) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF151D2A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15.0)),
          title: Text(
            'Date details: May $day, 2026',
            style: const TextStyle(color: Colors.cyanAccent, fontWeight: FontWeight.bold),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Biometric details
              const Text(
                'BIOMETRIC TIME CLOCK:',
                style: TextStyle(color: Colors.white54, fontSize: 11.0, fontWeight: FontWeight.bold, letterSpacing: 1.0),
              ),
              const SizedBox(height: 8.0),
              if (log != null) ...[
                _detailRow('Status', log.status, Colors.white),
                _detailRow('Check In', log.checkIn, Colors.greenAccent),
                _detailRow('Check Out', log.checkOut, Colors.orangeAccent),
                _detailRow('Hours Worked', '${log.hoursWorked.toStringAsFixed(2)} hours', Colors.cyanAccent),
              ] else if (!isWeekend) ...[
                _detailRow('Status', 'ABSENT', Colors.redAccent),
                const SizedBox(height: 4.0),
                const Text(
                  'No biometric time clock logs found for this weekday.',
                  style: TextStyle(color: Colors.white30, fontSize: 11.0, fontStyle: FontStyle.italic),
                ),
              ] else ...[
                _detailRow('Status', 'WEEKEND (Rest Day)', Colors.white38),
              ],
              const Divider(color: Colors.white12, height: 24.0),
              // Supervisor Load Jobs details
              const Text(
                'SUPERVISOR LOAD-BASIS JOBS:',
                style: TextStyle(color: Colors.white54, fontSize: 11.0, fontWeight: FontWeight.bold, letterSpacing: 1.0),
              ),
              const SizedBox(height: 8.0),
              if (workedJobs.isEmpty)
                const Text(
                  'No loading jobs recorded on this day.',
                  style: TextStyle(color: Colors.white30, fontSize: 11.0, fontStyle: FontStyle.italic),
                )
              else
                ...workedJobs.map((job) {
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10.0),
                    padding: const EdgeInsets.all(8.0),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.03),
                      borderRadius: BorderRadius.circular(8.0),
                      border: Border.all(color: Colors.cyanAccent.withOpacity(0.15)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          job.jobName,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12.0),
                        ),
                        const SizedBox(height: 4.0),
                        _detailRow('Total Load', '${job.totalTons.toStringAsFixed(0)} Tons', Colors.white70),
                        _detailRow('Rate per Ton', '₹${job.ratePerTon.toStringAsFixed(0)}', Colors.white70),
                        _detailRow('Total Payout', '₹${job.totalPayout.toStringAsFixed(0)}', Colors.white70),
                        _detailRow('Crew Size', '${job.employeeIds.length} members', Colors.white70),
                        _detailRow('Your Split Pay', '₹${job.splitPayout.toStringAsFixed(2)}', Colors.cyanAccent),
                      ],
                    ),
                  );
                }),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close', style: TextStyle(color: Colors.cyanAccent)),
            ),
          ],
        );
      },
    );
  }

  Widget _detailRow(String label, String value, Color valueColor) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white38, fontSize: 12.0)),
          Text(
            value,
            style: TextStyle(color: valueColor, fontWeight: FontWeight.bold, fontSize: 12.0),
          ),
        ],
      ),
    );
  }
}
