-- CreateTable
CREATE TABLE "Employee" (
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "salaryPerDay" DOUBLE PRECISION NOT NULL,
    "deductionPerDay" DOUBLE PRECISION NOT NULL,
    "uan" TEXT NOT NULL DEFAULT '',
    "esic" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "ifscCode" TEXT NOT NULL DEFAULT '',
    "bankAcc" TEXT NOT NULL DEFAULT '',
    "punchingCode" TEXT NOT NULL DEFAULT '',
    "mobileNo" TEXT NOT NULL DEFAULT '',
    "accountAdvance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "remainingAdvance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" SERIAL NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "checkIn" TEXT NOT NULL,
    "checkOut" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "hoursWorked" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "totalTons" DOUBLE PRECISION NOT NULL,
    "ratePerTon" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Tons',
    "castingName" TEXT,
    "castingQty" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLogEmployee" (
    "employeeId" TEXT NOT NULL,
    "jobLogId" TEXT NOT NULL,
    "splitEarnings" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "JobLogEmployee_pkey" PRIMARY KEY ("employeeId","jobLogId")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "basicPay" DOUBLE PRECISION NOT NULL,
    "otPay" DOUBLE PRECISION NOT NULL,
    "basicDa" DOUBLE PRECISION NOT NULL,
    "hra" DOUBLE PRECISION NOT NULL,
    "otherAllowance" DOUBLE PRECISION NOT NULL,
    "pfDeduction" DOUBLE PRECISION NOT NULL,
    "esicDeduction" DOUBLE PRECISION NOT NULL,
    "ptDeduction" DOUBLE PRECISION NOT NULL,
    "otherDeduction" DOUBLE PRECISION NOT NULL,
    "totalDeductions" DOUBLE PRECISION NOT NULL,
    "accountAdvance" DOUBLE PRECISION NOT NULL,
    "mlwlDeduction" DOUBLE PRECISION NOT NULL,
    "grossSalary" DOUBLE PRECISION NOT NULL,
    "netSalary" DOUBLE PRECISION NOT NULL,
    "workedDays" DOUBLE PRECISION NOT NULL,
    "overtimeHours" DOUBLE PRECISION NOT NULL,
    "jobEarnings" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_date_key" ON "Attendance"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_employeeId_month_year_key" ON "PayrollRun"("employeeId", "month", "year");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("employeeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLogEmployee" ADD CONSTRAINT "JobLogEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("employeeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLogEmployee" ADD CONSTRAINT "JobLogEmployee_jobLogId_fkey" FOREIGN KEY ("jobLogId") REFERENCES "JobLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("employeeId") ON DELETE CASCADE ON UPDATE CASCADE;
