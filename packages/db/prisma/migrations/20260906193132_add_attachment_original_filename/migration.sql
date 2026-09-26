/*
  Warnings:

  - Added the required column `original_filename` to the `attachments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "original_filename" TEXT NOT NULL;
