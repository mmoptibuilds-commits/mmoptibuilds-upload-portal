import { z } from "zod";

const optionalString = z.preprocess((value) => value === "" ? undefined : value, z.string().optional());
const optionalEmail = z.preprocess((value) => value === "" ? undefined : value, z.string().email().optional());
const optionalPort = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().positive().optional());

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1),
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPort,
  SMTP_USER: optionalEmail,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: optionalEmail,
  NOTIFICATION_EMAIL: z.preprocess((value) => value === "" ? undefined : value, z.string().email().default("mmoptibuilds@gmail.com")),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function getEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Server configuration is incomplete: ${fields}. Check .env.local.`);
  }
  return parsed.data;
}

export function getOptionalConfig() {
  const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
  return {
    database: Boolean(process.env.DATABASE_URL),
    auth: Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32),
    storage: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_STORAGE_BUCKET),
    email: smtpReady,
  };
}
