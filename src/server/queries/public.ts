import "server-only";
import { createSupabasePublicClient } from "@/server/db/supabase-public";
import type { DevelopmentStage } from "@/lib/labels";

export type PublicDevelopment = {
  id: string;
  slug: string;
  name: string;
  city: string;
  stage: DevelopmentStage;
  is_demo: boolean;
  content: {
    headline: string | null;
    summary: string | null;
    body: string | null;
    neighborhood: string | null;
    highlights: string[];
    cover_image_path: string | null;
    gallery: Array<{ path: string; alt?: string }>;
  } | null;
};

const DEV_SELECT =
  "id, slug, name, city, stage, is_demo, content:development_public_content(headline, summary, body, neighborhood, highlights, cover_image_path, gallery)";

export async function listPublishedDevelopments(): Promise<PublicDevelopment[]> {
  const db = createSupabasePublicClient();
  if (!db) return [];
  const { data, error } = await db.from("developments").select(DEV_SELECT).eq("is_published", true).order("sort_order");
  if (error) throw new Error("Falha ao carregar empreendimentos");
  return (data ?? []) as unknown as PublicDevelopment[];
}

export async function getPublishedDevelopment(slug: string): Promise<PublicDevelopment | null> {
  const db = createSupabasePublicClient();
  if (!db) return null;
  const { data, error } = await db.from("developments").select(DEV_SELECT).eq("slug", slug).eq("is_published", true).maybeSingle();
  if (error) throw new Error("Falha ao carregar empreendimento");
  return data as unknown as PublicDevelopment | null;
}

export type NewsPost = { id: string; slug: string; title: string; excerpt: string | null; body: string | null; cover_image_path: string | null; published_at: string; is_demo: boolean };

export async function listNews(limit = 12): Promise<NewsPost[]> {
  const db = createSupabasePublicClient();
  if (!db) return [];
  const { data, error } = await db
    .from("news_posts")
    .select("id, slug, title, excerpt, body, cover_image_path, published_at, is_demo")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Falha ao carregar novidades");
  return (data ?? []) as NewsPost[];
}

export async function getNews(slug: string): Promise<NewsPost | null> {
  const db = createSupabasePublicClient();
  if (!db) return null;
  const { data } = await db
    .from("news_posts")
    .select("id, slug, title, excerpt, body, cover_image_path, published_at, is_demo")
    .eq("slug", slug)
    .maybeSingle();
  return data as NewsPost | null;
}

export type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  cover_image_path: string | null;
  location_text: string | null;
  online_url: string | null;
  starts_at: string;
  ends_at: string | null;
  is_demo: boolean;
};

export async function listPublicEvents(): Promise<{ upcoming: PublicEvent[]; past: PublicEvent[] }> {
  const db = createSupabasePublicClient();
  if (!db) return { upcoming: [], past: [] };
  const { data, error } = await db
    .from("events")
    .select("id, title, description, cover_image_path, location_text, online_url, starts_at, ends_at, is_demo")
    .order("starts_at", { ascending: true });
  if (error) throw new Error("Falha ao carregar eventos");
  const now = Date.now();
  const all = (data ?? []) as PublicEvent[];
  return {
    upcoming: all.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= now),
    past: all.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() < now).reverse(),
  };
}

export type SiteSection = {
  key: "hero" | "sobre" | "atuacao" | "diferenciais";
  eyebrow: string | null;
  title: string;
  body: string | null;
  items: Array<{ title: string; text: string }>;
  image_path: string | null;
  is_placeholder: boolean;
};

export async function getSiteSections(): Promise<Partial<Record<SiteSection["key"], SiteSection>>> {
  const db = createSupabasePublicClient();
  if (!db) return {};
  const { data } = await db.from("site_sections").select("key, eyebrow, title, body, items, image_path, is_placeholder");
  return Object.fromEntries(((data ?? []) as SiteSection[]).map((s) => [s.key, s]));
}
