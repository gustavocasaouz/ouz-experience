/** Variáveis públicas (podem ir ao navegador). */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  termsVersion: process.env.NEXT_PUBLIC_TERMS_VERSION ?? "rascunho",
  privacyVersion: process.env.NEXT_PUBLIC_PRIVACY_VERSION ?? "rascunho",
};

export const isSupabaseConfigured = () => Boolean(publicEnv.supabaseUrl && publicEnv.supabaseKey);
