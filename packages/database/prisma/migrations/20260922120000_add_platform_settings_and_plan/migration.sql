-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('trial', 'unlimited');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'trial',
ADD COLUMN     "trialInterviewLimit" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");

