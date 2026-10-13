import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const isProd = process.env.APP_ENV === "production";
  return {
    rules: isProd
      ? [{ userAgent: "*", allow: "/", disallow: ["/admin", "/cliente", "/corretor", "/conta", "/entrar", "/arquivos", "/api"] }]
      : [{ userAgent: "*", disallow: "/" }],
  };
}
