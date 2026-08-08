import nodemailer from "nodemailer";
import type { NotificationStatus } from "@/lib/types";

export async function sendCompletionEmail(input: { username: string; batchId: string; fileCount: number; totalBytes: number; completedAt: Date; driveUrl: string }) : Promise<NotificationStatus> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, NOTIFICATION_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) return "not_configured";
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASSWORD } });
  await transport.sendMail({ from: SMTP_FROM, to: NOTIFICATION_EMAIL ?? "mmoptibuilds@gmail.com", subject: `Upload complete · ${input.username}`, text: `mmoptibuilds upload complete\n\nUser: ${input.username}\nBatch: ${input.batchId}\nCompleted: ${input.completedAt.toISOString()}\nFiles: ${input.fileCount}\nSize: ${input.totalBytes} bytes\nStatus: Completed\nDrive: ${input.driveUrl}` });
  return "sent";
}
