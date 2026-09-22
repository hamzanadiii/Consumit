-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('MEMBER', 'ADMIN');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "role" "MemberRole" NOT NULL DEFAULT 'MEMBER';

-- CreateTable
CREATE TABLE "AllowedDomain" (
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedDomain_pkey" PRIMARY KEY ("domain")
);
