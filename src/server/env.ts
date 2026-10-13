import "server-only";

export type AppEnv = "development" | "preview" | "production";

function appEnv(): AppEnv {
  const v = process.env.APP_ENV;
  return v === "production" || v === "preview" ? v : "development";
}

export const serverEnv = {
  appEnv: appEnv(),
  secretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  /** E-mail só sai de verdade com EMAIL_MODE=resend E APP_ENV=production. */
  emailMode: process.env.EMAIL_MODE === "resend" && appEnv() === "production" ? ("resend" as const) : ("log" as const),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
};

export function requireServerSecret(name: keyof typeof serverEnv): string {
  const v = serverEnv[name];
  if (typeof v !== "string" || !v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}
