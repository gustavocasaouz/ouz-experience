# App iOS — OUZ Experience

App para iPhone feito com [Capacitor](https://capacitorjs.com) 8. Ele abre o site **https://ouz.app.br** dentro de uma tela nativa. Toda publicação na Vercel já aparece no app, sem mandar versão nova para a Apple. Só mudanças nativas (ícone, permissões, plugins) exigem um build novo.

| Item | Valor |
|---|---|
| Bundle ID | `br.com.ouzgroup.experience` |
| Nome na tela de início | OUZ Experience |
| Aparelhos | Somente iPhone, em retrato |
| iOS mínimo | 15 |
| Início | `https://ouz.app.br/` (fotos + Área do cliente / Portal do corretor) |
| Sem internet | `www/offline.html` (página local) |
| Identificação | o app adiciona `OUZExperienceApp` ao user agent. O site usa isso para não mostrar o convite "instale o app" |

## Estrutura

- `capacitor.config.json`: URL do site, cores e comportamento da WebView.
- `www/`: páginas locais (redirecionamento e "sem conexão").
- `ios/App/App.xcodeproj`: projeto do Xcode (esquema **App**). As dependências usam Swift Package Manager, então não precisa de CocoaPods.

Esta pasta fica fora do build da Vercel, do ESLint e do TypeScript do site.

## Desenvolvimento

```bash
cd mobile
npm install
npx cap sync ios   # depois de mudar capacitor.config.json ou www/
npx cap open ios   # abre no Xcode
```

No Xcode, escolha um simulador e aperte ▶︎.

## Publicar no TestFlight (primeira vez)

1. **Identificador:** em [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list), vá em Identifiers › **+** › App IDs › App e use o Bundle ID `br.com.ouzgroup.experience`. Por enquanto, nenhum recurso extra (push entra na fase 2).
2. **App Store Connect:** em [appstoreconnect.apple.com](https://appstoreconnect.apple.com), vá em Apps › **+** › Novo app. Plataforma iOS, nome "OUZ Experience", idioma principal português (Brasil), o Bundle ID acima e um SKU (por exemplo `ouz-experience`).
3. **Assinatura no Xcode:** abra o projeto, selecione o alvo **App**, vá em *Signing & Capabilities*, marque *Automatically manage signing* e escolha o **Team**. Atenção: escolha o time da conta da OUZ, não o da outra empresa.
4. **Enviar o build:** no topo do Xcode, escolha o destino *Any iOS Device (arm64)*. Depois vá em **Product › Archive**, e no Organizer clique em **Distribute App › App Store Connect › Upload**.
5. **TestFlight:** em uns 10 a 30 minutos o build aparece em App Store Connect › TestFlight. Adicione testadores internos (até 100, sem revisão da Apple) ou crie um grupo externo (precisa de uma revisão rápida).

A cada novo envio, aumente o **Build** (alvo App › General › Identity). Aumente a **Version** (1.0 → 1.1) só quando for uma versão nova na loja.

## Antes de mandar para a revisão da App Store

A Apple recusa apps que são "só o site embrulhado" (diretriz 4.2). Antes da revisão, precisamos entregar:

- **Fase 2 — notificações push** (APNs): avisos de parcela, obra, documentos e mensagens da administração chegando como notificação do iPhone. O site já tem notificações, então falta ligar o APNs.
- **Fase 3 — Face ID** para entrar sem digitar a senha toda vez.
- **Fase 4 — documentos nativos:** abrir e compartilhar PDFs e fotos pelo visualizador do iPhone.
- **Exclusão de conta dentro do app:** a Apple exige isso quando o app tem login.
- Política de privacidade publicada, prints do iPhone (6,9") e uma **conta de demonstração** para o revisor.
