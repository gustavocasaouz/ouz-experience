import { notFound } from "next/navigation";
import { getNews } from "@/server/queries/public";
import { formatLongDate } from "@/lib/format";
import { Badge } from "@/design-system";

export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getNews((await params).slug);
  if (!post) notFound();
  return (
    <article className="container-page py-14 max-w-3xl">
      <p className="eyebrow mb-3">
        {formatLongDate(post.published_at)} {post.is_demo && <Badge tone="warning" className="ml-2">Demonstrativo</Badge>}
      </p>
      <h1 className="font-display text-4xl md:text-5xl">{post.title}</h1>
      {post.excerpt && <p className="text-xl text-ink-soft mt-6">{post.excerpt}</p>}
      {post.body && <div className="mt-8 leading-relaxed whitespace-pre-line">{post.body}</div>}
    </article>
  );
}
