"""
===============================================================================
eSSL Biometric Attendance Client PC Sync Script
===============================================================================
This script runs on the Client PC where eSSL (eTimeTrackLite) is installed.
It reads processed attendance logs from the local eSSL database and posts them
to your Payroll Web Cloud Server (/api/attendance/sync-processed).

Supported Local DB Types:
 1. MS Access (.mdb / .accdb - eTimeTrackLite.mdb)
 2. MS SQL Server (eTimeTrackLiteDB)
 3. MySQL / SQLite

Requirements on Client PC:
  pip install requests pyodbc
===============================================================================
"""

import os
import sys
import datetime
import requests

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
# Web Payroll API Endpoint URL (Replace with your live production Vercel/Render URL)
SERVER_URL = "https://payroll-api.onrender.com/api/attendance/sync-processed"

# Authorization Token (matches API_ACCESS_KEY or SYNC_API_TOKEN in backend .env)
API_TOKEN = "kfil_solapur_secure_api_access_key_2026"

# eSSL Database Connection String (Choose your setup):
# Option A: MS Access (.mdb)
DB_PATH = r"C:\Program Files (x86)\eTimeTrackLite\eTimeTrackLite.mdb"
CONN_STR = f"DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={DB_PATH};"

# Option B: MS SQL Server (if eSSL is connected to SQL Server)
# CONN_STR = "DRIVER={SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=eTimeTrackLiteDB;UID=sa;PWD=yourpassword;"


def fetch_essl_attendance(days_back=2):
    """
    Fetch attendance records from local eSSL database for the last N days.
    """
    try:
        import pyodbc
    except ImportError:
        print("[ERROR] pyodbc library not found. Install via: pip install pyodbc")
        return []

    if not os.path.exists(DB_PATH) and "DRIVER={SQL Server}" not in CONN_STR:
        print(f"[ERROR] eSSL Database file not found at: {DB_PATH}")
        return []

    print(f"[INFO] Connecting to local eSSL database...")
    conn = pyodbc.connect(CONN_STR)
    cursor = conn.cursor()

    # Calculate date threshold
    start_date = (datetime.date.today() - datetime.timedelta(days=days_back)).strftime('%Y-%m-%d 00:00:00')

    # Query Attendance logs joined with Employee details
    query = """
    SELECT 
        e.EmpCode AS EmployeeId,
        e.EmployeeName AS EmployeeName,
        a.AttendanceDate AS AttDate,
        a.InTime AS CheckIn,
        a.OutTime AS CheckOut,
        a.Duration AS WorkDuration,
        a.Status AS Status
    FROM AttendanceLogs a
    INNER JOIN Employees e ON a.EmployeeId = e.EmployeeId
    WHERE a.AttendanceDate >= ?
    ORDER BY a.AttendanceDate ASC
    """

    cursor.execute(query, (start_date,))
    rows = cursor.fetchall()

    logs = []
    for r in rows:
        emp_code = str(r.EmployeeId).strip() if r.EmployeeId else ""
        att_date = r.AttDate.strftime('%m/%d/%Y') if hasattr(r.AttDate, 'strftime') else str(r.AttDate)
        check_in = str(r.CheckIn).strip() if r.CheckIn else ""
        check_out = str(r.CheckOut).strip() if r.CheckOut else ""
        status = str(r.Status).strip() if r.Status else "PRESENT"

        if emp_code and check_in:
            logs.append({
                "employeeId": emp_code,
                "date": att_date,
                "checkIn": check_in,
                "checkOut": check_out,
                "status": status,
                "hoursWorked": 0.0  # Server will automatically calculate linear epoch hours
            })

    conn.close()
    print(f"[INFO] Extracted {len(logs)} attendance logs from eSSL.")
    return logs


def sync_to_cloud_server(logs):
    """
    Send attendance logs to the Web Payroll API endpoint in batches.
    """
    if not logs:
        print("[INFO] No logs to sync.")
        return

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_TOKEN}"
    }

    # Send in batches of 100
    batch_size = 100
    total_synced = 0

    for i in range(0, len(logs), batch_size):
        batch = logs[i:i + batch_size]
        payload = {"logs": batch}

        try:
            res = requests.post(SERVER_URL, json=payload, headers=headers, timeout=30)
            if res.status_code == 200:
                data = res.json()
                print(f"[SUCCESS] Batch {i//batch_size + 1}: {data.get('message')}")
                total_synced += len(batch)
            else:
                print(f"[FAIL] Batch {i//batch_size + 1} returned status {res.status_code}: {res.text}")
        except Exception as e:
            print(f"[ERROR] Failed to send batch to cloud server: {e}")

    print(f"[DONE] Successfully synchronized {total_synced} logs to Cloud Server.")


if __name__ == "__main__":
    print("==================================================")
    print("  eSSL CLIENT PC ATTENDANCE SYNC AGENT")
    print("==================================================")
    logs = fetch_essl_attendance(days_back=3)
    sync_to_cloud_server(logs)
