import pyodbc
import requests
import datetime
import os
import sys

# --- CONFIGURATION ---
DB_CONFIG = {
    'server': r'DESKTOP-SK78QMO\SQLEXPRESS', # From your settings screen
    'database': 'eTimeTracklite1',           # From your settings screen
    'username': 'essl',                      # From your settings screen
    'password': 'essl'                       # Put the 'essl' user password here
}

# The URL of your deployed Render server ADMS endpoint
RENDER_BACKEND_URL = "https://payroll-backend-v55r.onrender.com/iclock/cdata?sn=ESSL_SYNC_AGENT&table=ATTLOG"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SYNC_STATE_FILE = os.path.join(SCRIPT_DIR, 'last_synced_time.txt')
LOG_FILE = os.path.join(SCRIPT_DIR, 'sync.log')

def log(message):
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] {message}"
    print(log_entry)
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(log_entry + '\n')
    except Exception as e:
        pass

def get_last_synced_time():
    if os.path.exists(SYNC_STATE_FILE):
        try:
            with open(SYNC_STATE_FILE, 'r') as f:
                ts_str = f.read().strip()
                if ts_str:
                    return datetime.datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S')
        except Exception as e:
            log(f"⚠️ Reading sync state file failed: {e}")
    # Default fallback: Start from 2026-08-21 00:00:00
    return datetime.datetime(2026, 8, 21, 0, 0, 0)

def save_last_synced_time(latest_dt):
    try:
        with open(SYNC_STATE_FILE, 'w') as f:
            f.write(latest_dt.strftime('%Y-%m-%d %H:%M:%S'))
        log(f"💾 Sync state updated: Last synced punch at {latest_dt.strftime('%Y-%m-%d %H:%M:%S')}")
    except Exception as e:
        log(f"⚠️ Could not save sync state file: {e}")

def get_tables_to_query(start_date):
    """
    Generates monthly table names (e.g., DeviceLogs_8_2026, DeviceLogs_08_2026)
    from start_date up to the current month/year.
    """
    now = datetime.datetime.now()
    curr_year = now.year
    curr_month = now.month
    
    start_year = start_date.year
    start_month = start_date.month
    
    tables = []
    y = start_year
    m = start_month
    while (y < curr_year) or (y == curr_year and m <= curr_month):
        tables.append(f"DeviceLogs_{m}_{y}")
        tables.append(f"DeviceLogs_{m:02d}_{y}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    tables.append("DeviceLogs")
    
    # Remove duplicates preserving order
    seen = set()
    deduped = []
    for t in tables:
        if t not in seen:
            seen.add(t)
            deduped.append(t)
    return deduped

def sync_punches():
    # Fetch pending punches starting from exact timestamp of last successful sync
    start_date = get_last_synced_time()
    
    start_date_str = start_date.strftime('%Y-%m-%d %H:%M:%S')
    log(f"Starting sync for pending punches since: {start_date_str}")
    
    drivers = [
        '{ODBC Driver 17 for SQL Server}',
        '{ODBC Driver 18 for SQL Server}',
        '{SQL Server Native Client 11.0}',
        '{SQL Server}'
    ]
    
    servers = [
        DB_CONFIG['server'],
        r'.\SQLEXPRESS',
        r'localhost\SQLEXPRESS',
        'localhost'
    ]
    
    conn = None
    last_errors = []
    
    for driver in drivers:
        for server in servers:
            # Attempt 1: SQL Server Authentication
            try:
                conn_str = (
                    f"DRIVER={driver};"
                    f"SERVER={server};"
                    f"DATABASE={DB_CONFIG['database']};"
                    f"UID={DB_CONFIG['username']};"
                    f"PWD={DB_CONFIG['password']};"
                    "TrustServerCertificate=yes;"
                )
                conn = pyodbc.connect(conn_str, timeout=3)
                log(f"✅ Connected to SQL Server ({server}) using SQL Auth with {driver}")
                break
            except Exception as e1:
                last_errors.append(f"SQL Auth ({server}, {driver}): {e1}")
                
            # Attempt 2: Windows Integrated Authentication (Trusted_Connection)
            try:
                conn_str = (
                    f"DRIVER={driver};"
                    f"SERVER={server};"
                    f"DATABASE={DB_CONFIG['database']};"
                    "Trusted_Connection=yes;"
                    "TrustServerCertificate=yes;"
                )
                conn = pyodbc.connect(conn_str, timeout=3)
                log(f"✅ Connected to SQL Server ({server}) using Windows Auth with {driver}")
                break
            except Exception as e2:
                last_errors.append(f"Windows Auth ({server}, {driver}): {e2}")
                
        if conn:
            break
            
    if conn is None:
        log("❌ Could not connect to SQL Server. Connection diagnostics:")
        for err in last_errors[:4]:
            log(f"  - {err}")
        return

    try:
        cursor = conn.cursor()
        
        # Determine which tables we need to query based on our start date
        tables_to_query = get_tables_to_query(start_date)
        log(f"Tables to inspect for date range: {tables_to_query}")
        
        all_records = []
        
        for table in tables_to_query:
            log(f"Querying table: [{table}]...")
            query = f"""
                SELECT UserId, LogDate 
                FROM [{table}] 
                WHERE LogDate >= ?
                ORDER BY LogDate ASC
            """
            try:
                cursor.execute(query, (start_date_str,))
                rows = cursor.fetchall()
                all_records.extend(rows)
                log(f"  Found {len(rows)} records in [{table}]")
            except Exception as e:
                # If table does not exist yet (e.g. new month just started and no device downloaded yet)
                log(f"  ⚠️ Could not read table [{table}]: {e}")
                
        if not all_records:
            log("No new punch records found in the database for the given period.")
            return

        total_records = len(all_records)
        batch_size = 50
        total_batches = (total_records + batch_size - 1) // batch_size
        log(f"Uploading {total_records} punch records in {total_batches} batch(es) of {batch_size}...")

        headers = { 'Content-Type': 'text/plain' }
        successful_batches = 0

        for i in range(0, total_records, batch_size):
            chunk = all_records[i : i + batch_size]
            payload_lines = []
            for userid, logdate in chunk:
                timestamp_str = logdate.strftime('%Y-%m-%d %H:%M:%S')
                row_str = f"{userid}\t{timestamp_str}\t1\t0\t1\t0"
                payload_lines.append(row_str)
                
            payload = "\r\n".join(payload_lines) + "\r\n"
            batch_num = (i // batch_size) + 1
            
            try:
                response = requests.post(RENDER_BACKEND_URL, data=payload, headers=headers, timeout=60)
                if response.status_code == 200 and 'OK' in response.text:
                    successful_batches += 1
                    log(f"  ✅ Batch {batch_num}/{total_batches} synced successfully ({len(chunk)} records).")
                else:
                    log(f"  ❌ Batch {batch_num}/{total_batches} failed. Status: {response.status_code}, Body: {response.text}")
            except Exception as err:
                log(f"  ⚠️ Batch {batch_num}/{total_batches} network error: {err}")

        cursor.close()
        conn.close()
        
        if successful_batches == total_batches:
            log(f"🎉 Complete! All {total_records} punch records successfully uploaded and synced to cloud.")
            # Save latest timestamp to state file so future runs only fetch newer punches
            max_logdate = max(logdate for userid, logdate in all_records)
            save_last_synced_time(max_logdate)
        else:
            log(f"⚠️ Completed with warnings: {successful_batches}/{total_batches} batches succeeded.")
        
    except Exception as err:
        log(f"❌ Error running sync script: {err}")

if __name__ == "__main__":
    try:
        sync_punches()
    except Exception as fatal_e:
        log(f"💥 Fatal exception in main: {fatal_e}")
