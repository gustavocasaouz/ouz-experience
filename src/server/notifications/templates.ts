import { BROKER_STATUS_LABELS, type BrokerStatus } from "@/server/auth/permissions";

export type RenderedEmail = { subject: string; text: string; html: string };

const wrap = (title: string, paragraphs: string[], cta?: { label: string; url: string }) => {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f2f0eb;font-family:Helvetica,Arial,sans-serif;color:#000000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dcd8cf">
<tr><td style="padding:32px 40px 8px;letter-spacing:.3em;font-size:13px">OUZ</td></tr>
<tr><td style="padding:8px 40px 32px"><h1 style="font-size:22px;font-weight:500;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${esc(p)}</p>`).join("")}
${cta ? `<p style="margin:24px 0 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#000000;color:#fff;text-decoration:none;padding:12px 24px;font-size:14px">${esc(cta.label)}</a></p>` : ""}
</td></tr></table>
<p style="font-size:12px;color:#64625c;margin-top:16px">Mensagem automática do OUZ Experience.</p>
</td></tr></table></body></html>`;
  const text = [title, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.url}`] : [])].join("\n");
  return { subject: title, text, html };
};

type Payload = Record<string, unknown>;

export function renderTemplate(template: string, payload: Payload, appUrl: string): RenderedEmail {
  switch (template) {
    case "convite_staff":
      return wrap(
        "Convite para a equipe do OUZ Experience",
        ["Você foi convidado para acessar a administração do OUZ Experience.", "O convite expira em 72 horas. Será necessário configurar a verificação em duas etapas."],
        { label: "Aceitar convite", url: String(payload.secret_link) },
      );
    case "convite_cliente":
      return wrap(
        "Seu acesso ao OUZ Experience",
        [
          "A OUZ preparou sua área de cliente, com informações da sua unidade.",
          "Use este mesmo e-mail para criar sua senha ou entrar. O convite expira em 7 dias.",
        ],
        { label: "Acessar minha área", url: String(payload.secret_link) },
      );
    case "corretor_status": {
      const status = payload.status as BrokerStatus;
      return wrap(
        `Cadastro de corretor: ${BROKER_STATUS_LABELS[status] ?? "atualizado"}`,
        ["O status do seu cadastro no OUZ Experience foi atualizado.", "Acesse o portal para ver os detalhes."],
        { label: "Abrir portal do corretor", url: `${appUrl}/corretor` },
      );
    }
    case "corretor_cadastro_recebido":
      return wrap("Recebemos seu cadastro", [
        "Seu cadastro de corretor foi recebido e será analisado pela equipe da OUZ.",
        "Você receberá um aviso quando houver atualização.",
      ]);
    case "aviso_generico": {
      const link = typeof payload.link === "string" && payload.link.startsWith("/") ? `${appUrl}${payload.link}` : appUrl;
      return wrap(String(payload.title ?? "Atualização no OUZ Experience"), [String(payload.body ?? "Há uma nova atualização na sua conta.")], {
        label: "Abrir no OUZ Experience",
        url: link,
      });
    }
    default:
      return wrap("Atualização no OUZ Experience", ["Há uma nova atualização na sua conta."], { label: "Abrir", url: appUrl });
  }
}
