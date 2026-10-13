import Image from "next/image";
import Link from "next/link";
import { Badge, ImagePlaceholder } from "@/design-system";
import { STAGE_LABELS, type DevelopmentStage } from "@/lib/labels";
import { publicMediaUrl } from "@/server/db/supabase-public";

export function DevelopmentCard({
  href,
  name,
  stage,
  summary,
  coverPath,
  isDemo,
  extraBadge,
}: {
  href: string;
  name: string;
  stage: DevelopmentStage;
  summary?: string | null;
  coverPath?: string | null;
  isDemo?: boolean;
  extraBadge?: React.ReactNode;
}) {
  const url = publicMediaUrl(coverPath);
  return (
    <Link href={href} className="group flex flex-col gap-4">
      <div className="relative aspect-[4/5] overflow-hidden bg-sand">
        {url ? (
          <Image src={url} alt={`Imagem do empreendimento ${name}`} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
        ) : (
          <ImagePlaceholder label={`${name} — imagem a definir`} className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.03]" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{STAGE_LABELS[stage]}</Badge>
          {isDemo && <Badge tone="warning">Demonstrativo</Badge>}
          {extraBadge}
        </div>
        <h3 className="font-display text-3xl tracking-wide">{name}</h3>
        {summary && <p className="text-sm text-ink-soft line-clamp-2">{summary}</p>}
      </div>
    </Link>
  );
}
