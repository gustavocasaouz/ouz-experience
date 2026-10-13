import type { Metadata } from "next";
import { Badge, EmptyState, PageHeader, SectionTitle } from "@/design-system";
import { listPublicEvents, type PublicEvent } from "@/server/queries/public";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Eventos" };

function EventItem({ e }: { e: PublicEvent }) {
  return (
    <li className="py-6 grid gap-2 md:grid-cols-[14rem_1fr]">
      <p className="text-sm text-ink-mute">{formatDateTime(e.starts_at)}</p>
      <div>
        <h3 className="font-display text-2xl">
          {e.title} {e.is_demo && <Badge tone="warning" className="ml-2 align-middle">Demonstrativo</Badge>}
        </h3>
        {e.location_text && <p className="text-sm text-ink-soft mt-1">{e.location_text}</p>}
        {e.description && <p className="text-ink-soft mt-3">{e.description}</p>}
      </div>
    </li>
  );
}

export default async function EventsPage() {
  const { upcoming, past } = await listPublicEvents();
  return (
    <div className="container-page py-14 max-w-5xl">
      <PageHeader
        eyebrow="Agenda"
        title="Eventos"
        description="Eventos abertos ao público. Clientes e corretores veem também os eventos exclusivos em seus portais."
      />
      <SectionTitle title="Próximos" />
      {upcoming.length === 0 ? (
        <EmptyState title="Nenhum evento público agendado" />
      ) : (
        <ul className="divide-y divide-line border-y border-line mb-16">{upcoming.map((e) => <EventItem key={e.id} e={e} />)}</ul>
      )}
      {past.length > 0 && (
        <>
          <SectionTitle title="Anteriores" className="mt-16" />
          <ul className="divide-y divide-line border-y border-line opacity-80">{past.map((e) => <EventItem key={e.id} e={e} />)}</ul>
        </>
      )}
    </div>
  );
}
