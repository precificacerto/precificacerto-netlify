# App único — Precifica Certo

Este repositório foi unificado para ter **uma única aplicação** em uso, sem perder lógica, estratégia nem código.

## Qual app usar

- **Aplicação oficial:** a pasta **raiz** do repositório (onde estão `src/`, `package.json`, `next.config.js`).
- Comandos: na raiz do projeto:
  - `npm run dev` — desenvolvimento
  - `npm run build` — build de produção
  - `npm run start` — rodar produção

## Pastas `web-app` e `web-app-merge`

- **`web-app/`** e **`web-app-merge/`** são cópias/variações antigas do mesmo front.
- A base de código ativa e corrigida (conflitos de merge resolvidos, lembretes WhatsApp, agenda, cron) está na **raiz** (`src/`).
- Os arquivos críticos de WhatsApp e agenda foram alinhados entre raiz e `web-app` para evitar divergência, mas **não é necessário rodar ou fazer deploy a partir de `web-app`**.

## O que foi feito no merge

1. **Conflitos de merge resolvidos na raiz (`src/`):**
   - `src/pages/api/whatsapp/send-reminder.ts` — handler único, `runReminderCycle`, throttle, envio por variantes de telefone.
   - `src/pages/api/cron/whatsapp-reminders.ts` — chamada direta a `runReminderCycle(null)` com `checkCronAuth`.
   - `src/pages/agenda/index.tsx` — polling 30s de lembretes, `hoursUntilEvent` para `reminder_send_at` (< 24h → 10 min; ≥ 24h → 24h antes), `serviceInputMode` no serviço, mensagem de sucesso do lembrete.

2. **Lógica preservada:**
   - Lembretes WhatsApp: 60s de throttle, claim atômico (`whatsapp_reminder_sent`), variantes de telefone (9º dígito), modo OWN/SHARED, template `{{nome_cliente}}`.
   - Agenda: grade 0–24h, layout em faixas para conflitos, botão Concluir, status em verde (Agendado), fluxo de pagamento/conclusão e produtos extras.

3. **Sincronização com `web-app`:**
   - `web-app/src/pages/api/whatsapp/send-reminder.ts` e `web-app/src/pages/api/cron/whatsapp-reminders.ts` foram atualizados para o mesmo conteúdo da raiz, para manter consistência caso alguém abra `web-app`.

## Próximos passos (opcional)

- Se quiser **apenas uma pasta de código:** pode remover ou renomear `web-app` e `web-app-merge` (por exemplo, para `_web-app-backup`) e seguir usando só a raiz para desenvolvimento e deploy.
- Deploy (Vercel etc.): configurar o **root** do repositório como diretório do projeto; não usar `web-app` como root de build.
