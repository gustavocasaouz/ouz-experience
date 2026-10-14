import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Renova a sessão do Supabase (cookies) a cada requisição.
 * NÃO é a camada de autorização: layouts, actions e RLS fazem as verificações.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = publicEnv.supabaseUrl;
  const key = publicEnv.supabaseKey;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|pwa-icon/|icon|apple-icon|offline|brand/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp|avif)$).*)"],
};
