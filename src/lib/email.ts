import nodemailer from "nodemailer";
import { promiseWithTimeout } from "@/lib/async-timeouts";
import type { CompletionNotificationInput, NotificationStatus } from "@/lib/types";

const SMTP_TIMEOUT_MS = 20_000;

export function buildCompletionEmailText(input: CompletionNotificationInput) {
  return `mmoptibuilds upload complete\n\nUser: ${input.username}\nBatch: ${input.batchId}\nCompleted: ${input.completedAt.toISOString()}\nFiles: ${input.fileCount}\nSize: ${input.totalBytes} bytes\nStatus: Completed`;
}

export async function sendCompletionEmail(input: CompletionNotificationInput): Promise<NotificationStatus> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, NOTIFICATION_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) return "not_configured";
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASSWORD }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: SMTP_TIMEOUT_MS });
  try {
    await promiseWithTimeout(transport.sendMail({ from: SMTP_FROM, to: NOTIFICATION_EMAIL ?? "mmoptibuilds@gmail.com", subject: `Upload complete · ${input.username}`, text: buildCompletionEmailText(input) }), SMTP_TIMEOUT_MS, "SMTP delivery");
  } finally {
    transport.close();
  }
  return "sent";
}
