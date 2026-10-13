import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/design-system";
import { listNews } from "@/server/queries/public";
import { formatLongDate } from "@/lib/format";

export const metadata: Metadata = { title: "Novidades" };

export default async function NewsPage() {
  const news = await listNews(50);
  return (
    <div className="container-page py-14 max-w-4xl">
      <PageHeader eyebrow="OUZ" title="Novidades" />
      {news.length === 0 ? (
        <EmptyState title="Sem novidades por enquanto" />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {news.map((n) => (
            <li key={n.id}>
              <Link href={`/novidades/${n.slug}`} className="block py-6 group">
                <p className="text-xs text-ink-mute mb-2">
                  {formatLongDate(n.published_at)} {n.is_demo && <Badge tone="warning" className="ml-2">Demonstrativo</Badge>}
                </p>
                <h2 className="font-display text-2xl group-hover:underline underline-offset-4">{n.title}</h2>
                {n.excerpt && <p className="text-ink-soft mt-2">{n.excerpt}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
