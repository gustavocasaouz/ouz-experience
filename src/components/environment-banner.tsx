/** Faixa visível fora de produção, para ninguém confundir dados demonstrativos com reais. */
export function EnvironmentBanner() {
  const env = process.env.APP_ENV ?? "development";
  if (env === "production") return null;
  return (
    <div className="bg-warning-soft text-warning text-xs text-center py-1.5 px-4">
      Ambiente {env === "preview" ? "de homologação" : "de desenvolvimento"} — dados marcados como demonstrativos são fictícios.
    </div>
  );
}
