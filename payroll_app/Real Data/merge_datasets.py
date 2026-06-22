import os
import zipfile
import xml.etree.ElementTree as ET
import csv

def clean_name(n):
    n = n.upper()
    if n.startswith('MR.'): n = n[3:]
    if n.startswith('MR '): n = n[3:]
    if n.startswith('MRS.'): n = n[4:]
    if n.startswith('MRS '): n = n[4:]
    if n.startswith('MS.'): n = n[3:]
    if n.startswith('MS '): n = n[3:]
    return ''.join(n.split())

def parse_xlsx(file_path, start_row):
    rows = {}
    if not os.path.exists(file_path):
        print(f"Error: file {file_path} not found")
        return rows
        
    try:
        with zipfile.ZipFile(file_path, 'r') as zip_ref:
            workbook_xml = zip_ref.read('xl/workbook.xml')
            root = ET.fromstring(workbook_xml)
            
            sheets = []
            for elem in root.iter():
                if elem.tag.endswith('sheet'):
                    sheets.append((elem.attrib.get('name'), elem.attrib.get('sheetId')))
                    
            shared_strings = []
            if 'xl/sharedStrings.xml' in zip_ref.namelist():
                sst_xml = zip_ref.read('xl/sharedStrings.xml')
                sst_root = ET.fromstring(sst_xml)
                for si in sst_root.iter():
                    if si.tag.endswith('si'):
                        t_text = "".join(t.text for t in si.iter() if t.tag.endswith('t') and t.text)
                        shared_strings.append(t_text)
            
            sheet_file = f'xl/worksheets/sheet{sheets[0][1]}.xml'
            if sheet_file not in zip_ref.namelist():
                for name in zip_ref.namelist():
                    if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                        sheet_file = name
                        break
                        
            sheet_xml = zip_ref.read(sheet_file)
            sheet_root = ET.fromstring(sheet_xml)
            
            for row_elem in sheet_root.iter():
                if row_elem.tag.endswith('row'):
                    row_num = int(row_elem.attrib.get('r'))
                    if row_num < start_row:
                        continue
                    row_cells = []
                    # Keep track of column references to handle empty cells
                    cells_by_col = {}
                    for cell_elem in row_elem.iter():
                        if cell_elem.tag.endswith('c'):
                            cell_ref = cell_elem.attrib.get('r')
                            # Extract column letter
                            col_letter = "".join(c for c in cell_ref if c.isalpha())
                            cell_type = cell_elem.attrib.get('t')
                            val_elem = None
                            for child in cell_elem:
                                if child.tag.endswith('v'):
                                    val_elem = child
                                    break
                                    
                            val = ""
                            if val_elem is not None:
                                val = val_elem.text
                                if cell_type == 's' and val:
                                    idx = int(val)
                                    if 0 <= idx < len(shared_strings):
                                        val = shared_strings[idx]
                            cells_by_col[col_letter] = val
                    
                    # Convert to ordered list from A to the max column found
                    if cells_by_col:
                        max_col = max(cells_by_col.keys(), key=lambda x: (len(x), x))
                        # Helper to convert Excel col letter to index
                        def col_to_idx(col_str):
                            exp = 0
                            idx = 0
                            for c in reversed(col_str):
                                idx += (ord(c) - ord('A') + 1) * (26 ** exp)
                                exp += 1
                            return idx - 1
                            
                        ordered_vals = [""] * (col_to_idx(max_col) + 1)
                        for col, v in cells_by_col.items():
                            ordered_vals[col_to_idx(col)] = v
                        rows[row_num] = ordered_vals
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    return rows

# Paths
base_dir = "D:/DEEPTI_ANTIGRAVITY"
master_file = os.path.join(base_dir, "Real Data/Master KFIL.xlsx")
wages_file = os.path.join(base_dir, "Real Data/Demo File For Sallay Wages.xlsx")

print("Parsing Master KFIL.xlsx...")
master_rows = parse_xlsx(master_file, 2)
print("Parsing Demo File For Sallay Wages.xlsx...")
wages_rows = parse_xlsx(wages_file, 12)

print(f"Master rows found: {len(master_rows)}")
print(f"Wages rows found: {len(wages_rows)}")

# Master fields:
# index 2: Ticket No
# index 3: UAN
# index 4: ESIC
# index 5: Name (FULL NAME OF EMPLOYEE)
# index 6: Dept
# index 7: Punching Code
# index 12: Bank Name
# index 13: IFSC
# index 14: Bank Acc
# index 17: Mobile No

master_by_uan = {}
master_by_name = {}

for r_num, row in sorted(master_rows.items()):
    if len(row) > 5:
        ticket = row[2].strip()
        uan = row[3].strip()
        name = row[5].strip()
        clean_n = clean_name(name)
        
        # Build master dictionary
        emp_dict = {
            'ticket': ticket,
            'uan': uan,
            'esic': row[4].strip() if len(row) > 4 else '',
            'name': name,
            'dept': row[6].strip() if len(row) > 6 else 'GENERAL',
            'punch_code': row[7].strip() if len(row) > 7 else '',
            'bank_name': row[12].strip() if len(row) > 12 else '',
            'ifsc': row[13].strip() if len(row) > 13 else '',
            'bank_acc': row[14].strip() if len(row) > 14 else '',
            'mobile': row[17].strip() if len(row) > 17 else '',
        }
        
        if uan and uan != '#N/A':
            master_by_uan[uan] = emp_dict
        if clean_n:
            master_by_name[clean_n] = emp_dict

# Wages fields:
# index 1: UAN
# index 2: ESIC
# index 3: Name
# index 4: Rate Per Day
# index 5: Total Days worked
# index 6: Total OT Days
# index 7: Days Total

merged_employees = []
matched_master_tickets = set()
simulated_attendance = []

wages_index = 100
for r_num, row in sorted(wages_rows.items()):
    if len(row) > 7 and row[1]:
        uan = row[1].strip()
        esic = row[2].strip() if len(row) > 2 else ''
        name_wages = row[3].strip()
        clean_n = clean_name(name_wages)
        
        rate_per_day = float(row[4]) if len(row) > 4 and row[4] else 636.0
        days_worked = int(float(row[5])) if len(row) > 5 and row[5] else 0
        ot_days = int(float(row[6])) if len(row) > 6 and row[6] else 0
        
        # Match with master
        emp_details = None
        if uan and uan in master_by_uan:
            emp_details = master_by_uan[uan]
        elif clean_n in master_by_name:
            emp_details = master_by_name[clean_n]
            
        if emp_details:
            ticket = emp_details['ticket']
            name = emp_details['name']
            dept = emp_details['dept']
            punch_code = emp_details['punch_code']
            bank_name = emp_details['bank_name']
            ifsc = emp_details['ifsc']
            bank_acc = emp_details['bank_acc']
            mobile = emp_details['mobile']
            matched_master_tickets.add(ticket)
        else:
            # Generate fallback details
            ticket = f"KFIL/W-{wages_index}"
            wages_index += 1
            name = name_wages.replace("Mr. ", "").replace("Mr ", "").strip()
            dept = "LINE-1"
            punch_code = f"PC{wages_index}"
            bank_name = "Dummy Bank"
            ifsc = "DUMM0123456"
            bank_acc = "1234567890"
            mobile = ""
            
        merged_emp = {
            'employee_id': ticket,
            'name': name,
            'department': dept,
            'salary_per_day': rate_per_day,
            'deduction_per_day': 0.0,
            'uan': uan if uan and uan != '#N/A' and not uan.isalpha() else '',
            'esic': esic if esic and esic != '#N/A' else '',
            'bank_name': bank_name,
            'ifsc_code': ifsc,
            'bank_acc': bank_acc,
            'punching_code': punch_code if punch_code != '#N/A' and punch_code != '0' else '',
            'mobile_no': mobile if mobile != '#N/A' else '',
            'days_worked': days_worked,
            'ot_days': ot_days
        }
        merged_employees.append(merged_emp)

# Add unmatched active master records (employees who are active but didn't have wages logged this month)
for uan, emp_details in master_by_uan.items():
    if emp_details['ticket'] not in matched_master_tickets:
        merged_emp = {
            'employee_id': emp_details['ticket'],
            'name': emp_details['name'],
            'department': emp_details['dept'],
            'salary_per_day': 636.0,
            'deduction_per_day': 0.0,
            'uan': emp_details['uan'],
            'esic': emp_details['esic'],
            'bank_name': emp_details['bank_name'],
            'ifsc_code': emp_details['ifsc'],
            'bank_acc': emp_details['bank_acc'],
            'punching_code': emp_details['punch_code'] if emp_details['punch_code'] != '#N/A' and emp_details['punch_code'] != '0' else '',
            'mobile_no': emp_details['mobile'],
            'days_worked': 0,
            'ot_days': 0
        }
        merged_employees.append(merged_emp)

print(f"Total merged unique employees: {len(merged_employees)}")

# Save to CSV
# Columns: employee_id,name,department,salary_per_day,deduction_per_day,uan,esic,bank_name,ifsc_code,bank_acc,punching_code,mobile_no
csv_headers = ['employee_id', 'name', 'department', 'salary_per_day', 'deduction_per_day', 'uan', 'esic', 'bank_name', 'ifsc_code', 'bank_acc', 'punching_code', 'mobile_no']

def write_employees_csv(dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(csv_headers)
        for emp in merged_employees:
            writer.writerow([
                emp['employee_id'],
                emp['name'],
                emp['department'],
                emp['salary_per_day'],
                emp['deduction_per_day'],
                emp['uan'],
                emp['esic'],
                emp['bank_name'],
                emp['ifsc_code'],
                emp['bank_acc'],
                emp['punching_code'],
                emp['mobile_no']
            ])
    print(f"Saved employees list to {dest_path}")

write_employees_csv(os.path.join(base_dir, "assets/employees_100.csv"))
write_employees_csv(os.path.join(base_dir, "employees_100.csv"))

# Generate Simulated Biometric Attendance Logs for May 2026
# May 2026 has 31 days. Sundays are May 3, 10, 17, 24, 31.
non_sundays = []
for d in range(1, 32):
    # May 2026 weekdays check
    # 5/1/2026 is Friday, weekday = 5 (Mon=1, Sun=7)
    # python datetime: weekday() -> 0=Mon, 6=Sun
    import datetime
    dt = datetime.date(2026, 5, d)
    if dt.weekday() != 6: # Not Sunday
        non_sundays.append(d)

attendance_rows = []
for emp in merged_employees:
    w_days = emp['days_worked']
    ot_days = emp['ot_days']
    
    # Generate present logs
    for i in range(w_days):
        if i < len(non_sundays):
            day_num = non_sundays[i]
            # check-in around 9:00 AM, check-out around 6:00 PM (9 hours worked)
            # Add some minor random variation for realism (e.g. 9:02, 18:04)
            minute_var_in = (i * 3) % 15
            minute_var_out = (i * 7) % 20
            check_in = f"09:{minute_var_in:02d}"
            check_out = f"18:{minute_var_out:02d}"
            # Mark a few as LATE if they arrive after 9:15
            status = "PRESENT"
            if i % 10 == 0 and w_days > 5:
                check_in = "09:22"
                status = "LATE"
                
            attendance_rows.append([emp['employee_id'], f"5/{day_num}/2026", check_in, check_out, status])
            
    # Generate overtime logs
    for i in range(ot_days):
        idx = w_days + i
        if idx < len(non_sundays):
            day_num = non_sundays[idx]
            minute_var_in = (i * 2) % 10
            minute_var_out = (i * 4) % 15
            check_in = f"09:{minute_var_in:02d}"
            check_out = f"18:{minute_var_out:02d}"
            attendance_rows.append([emp['employee_id'], f"5/{day_num}/2026", check_in, check_out, "OVERTIME"])

print(f"Total simulated attendance logs generated: {len(attendance_rows)}")

att_headers = ['employee_id', 'date', 'check_in', 'check_out', 'status']

def write_attendance_csv(dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(att_headers)
        for log in attendance_rows:
            writer.writerow(log)
    print(f"Saved attendance logs to {dest_path}")

write_attendance_csv(os.path.join(base_dir, "assets/attendance_may_2026.csv"))
write_attendance_csv(os.path.join(base_dir, "attendance_may_2026.csv"))

print("Excel merge processing complete!")
