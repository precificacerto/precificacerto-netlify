# Revisão de Lógicas — Lembrete de Agendamento e Permissões de Funcionário

**Data:** 2026-03-05  
**Revisor:** Quinn (QA Agent)  
**Escopo:** Lógica 1 (disparo de lembrete) e Lógica 2 (permissões zerando ao editar)

---

## Lógica 1: Disparo de lembrete de agendamento — depende de alguém logado?

### Pergunta
Quando um usuário está agendado na agenda e recebe o disparo de lembrete, esse disparo acontece **só quando tem alguém logado** na tenant (admin/user que agendou) ou **acontece sempre**, mesmo com ninguém logado?

### Conclusão: **O disparo acontece mesmo com ninguém logado**

### Evidência no código

1. **Cron na Vercel (servidor)**  
   - `vercel.json` define um cron que chama `/api/cron/whatsapp-reminders` **a cada minuto** (`* * * * *`).  
   - Esse cron é executado pela infraestrutura da Vercel, **independente de sessão ou de alguém na aplicação**.

2. **Handler do cron**  
   - `src/pages/api/cron/whatsapp-reminders.ts` chama `runReminderCycle(null)`, processando **todos os tenants**.  
   - Não há verificação de usuário logado; a execução é puramente server-side.

3. **Polling na agenda (complementar)**  
   - Em `src/pages/agenda/index.tsx` há um `useEffect` que chama `POST /api/whatsapp/send-reminder` ao abrir a agenda e a cada 30s **enquanto a página estiver aberta**.  
   - Isso é um **reforço** para processar lembretes quando alguém está na agenda; **não** é a única forma de disparo.

4. **Fluxo do lembrete**  
   - `runReminderCycle` em `src/pages/api/whatsapp/send-reminder.ts` consulta `calendar_events` (por `reminder_send_at`, `whatsapp_reminder_sent`, etc.) e envia o WhatsApp.  
   - Tudo ocorre no servidor (Supabase admin, API), sem depender de sessão no front.

### Resposta direta

- **Sim:** o lembrete é disparado **mesmo quando ninguém está logado** na tenant ou no admin/user que agendou.  
- O mecanismo principal é o **cron da Vercel (a cada minuto)**.  
- O polling na tela da agenda apenas **acelera** o processamento quando alguém está com a agenda aberta.

---

## Lógica 2: Permissões do funcionário “zerando” ao editar

### Sintoma relatado
Ao criar um funcionário, enviar convite e, depois, entrar como admin para editar as permissões desse usuário, as permissões aparecem **zeradas** na tela.

### Conclusão: **As permissões não são perdidas no banco; a tela fica vazia por RLS**

As permissões são gravadas corretamente quando o convite é processado (via `supabaseAdmin`, que ignora RLS). O que falha é a **leitura no front**: o admin usa o cliente Supabase (JWT do usuário), e as políticas RLS atuais **não permitem que o admin veja as linhas de permissão do funcionário**.

### Evidência

1. **Fluxo de gravação (send-invite)**  
   - Em `src/pages/api/employees/send-invite.ts`, quando o convite é enviado e já existe `userId`, o código lê `pending_permissions` do employee, aplica em `user_module_permissions` e `user_item_access` via **supabaseAdmin** e depois zera `pending_permissions` no employee.  
   - Gravação é server-side com service role, então **não** é afetada por RLS.

2. **Fluxo de leitura (tela de permissões)**  
   - Em `src/pages/funcionarios/[id]/permissoes.tsx`, a tela carrega as permissões com o **cliente Supabase** (sessão do admin), fazendo:  
     - `user_module_permissions` filtrado por `user_id` do funcionário e `tenant_id`  
     - `user_item_access` idem  
   - Com o JWT do admin, **RLS é aplicado**.

3. **Políticas RLS atuais (banco)**  
   - Para `user_module_permissions` e `user_item_access` a política é:  
     - `(tenant_id = get_my_tenant_id()) AND (is_super_admin() OR (user_id = auth.uid()))`  
   - Ou seja: o usuário só vê linhas do **próprio** `user_id` (ou se for super_admin).  
   - Um **admin de tenant** não é super_admin e está consultando linhas cujo `user_id` é o do **funcionário**. Essas linhas são **ocultadas** pelo RLS, então a query retorna vazio e a tela mostra permissões “zeradas”.

### Correção recomendada

É necessário permitir que **admin da tenant** (e, se desejado, super_admin) possa **ver e gerenciar** permissões de outros usuários **da mesma tenant** nessas duas tabelas.

Sugestão: alterar as políticas para algo na linha de:

- **Condição de acesso:**  
  `tenant_id = get_my_tenant_id()` e  
  `(is_super_admin() OR user_id = auth.uid() OR is_tenant_admin())`

Assim:

- O usuário continua vendo apenas dados da própria tenant.
- Super_admin continua com acesso total (se já estiver na condição).
- Cada usuário continua vendo suas próprias permissões.
- **Admin da tenant** passa a ver e editar permissões de qualquer usuário da mesma tenant (incluindo o funcionário convidado).

Implementação prática: criar uma migration que:

1. Remove as políticas atuais de `user_module_permissions` e `user_item_access` que restringem a `user_id = auth.uid()` (ou equivalente).
2. Cria novas políticas (SELECT/INSERT/UPDATE/DELETE conforme necessário) usando a condição acima, garantindo que `is_tenant_admin()` exista e esteja definida como “admin da tenant” (por exemplo, `role = 'ADMIN'` no `users` do mesmo tenant).

Após aplicar a migration, a tela de edição de permissões do funcionário deve exibir e salvar corretamente as permissões quando acessada pelo admin.

---

## Resumo

| Lógica | Pergunta / Problema | Conclusão |
|--------|----------------------|-----------|
| **1** | Lembrete de agendamento depende de alguém logado? | **Não.** Disparo é feito pelo cron (Vercel) a cada minuto; acontece mesmo com ninguém logado. O polling na agenda só complementa. |
| **2** | Permissões do funcionário zeram ao editar? | **Não se perdem no banco.** Aparecem zeradas na tela porque RLS não permite ao admin da tenant ver linhas de `user_module_permissions` / `user_item_access` de outros usuários. Solução: ajustar RLS para incluir `is_tenant_admin()` na condição de acesso. |

— Quinn, guardião da qualidade
