-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OFFICER', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('REPORTED', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'STANDARD', 'HIGH');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('UNSURE', 'ROAD_DAMAGE', 'WATER_LEAKAGE', 'WASTE', 'STREETLIGHTING');

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "headEmail" TEXT NOT NULL,
    "supervisorEmail" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "uid" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "StaffScope" (
    "staffUid" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "StaffScope_pkey" PRIMARY KEY ("staffUid","departmentId")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'REPORTED',
    "category" "Category" NOT NULL DEFAULT 'UNSURE',
    "priority" "Priority" NOT NULL DEFAULT 'STANDARD',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "trackingReference" TEXT NOT NULL,
    "trackingTokenHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" "Category" NOT NULL DEFAULT 'UNSURE',
    "photoObjectKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "incidentId" TEXT NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "actorUid" TEXT,
    "kind" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_jurisdiction_code_key" ON "Department"("jurisdiction", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Report_trackingReference_key" ON "Report"("trackingReference");

-- CreateIndex
CREATE INDEX "Report_incidentId_idx" ON "Report"("incidentId");

-- CreateIndex
CREATE INDEX "Assignment_departmentId_endedAt_idx" ON "Assignment"("departmentId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_incidentId_version_key" ON "Assignment"("incidentId", "version");

-- CreateIndex
CREATE INDEX "AuditEvent_incidentId_createdAt_idx" ON "AuditEvent"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffScope" ADD CONSTRAINT "StaffScope_staffUid_fkey" FOREIGN KEY ("staffUid") REFERENCES "Staff"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffScope" ADD CONSTRAINT "StaffScope_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Assignment_one_active_per_incident" ON "Assignment"("incidentId") WHERE "endedAt" IS NULL;
