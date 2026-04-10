# Epic: Melhorias UX/Financeiro — Abril 2026

**ID:** MELHORIAS-ABR2026
**Status:** Ready
**Data:** 2026-04-10
**Regime:** Todos os regimes (SN, LP, LR, MEI)

---

## Objetivo

Cinco melhorias em áreas distintas do sistema: configuração de cálculo, produtos/serviços, agenda (ordem de campos, reagendamento WhatsApp e pagamento parcelado).

---

## Histórias do Epic

| ID | Título | Status | Prioridade |
|----|--------|--------|------------|
| MELHORIAS-ABR2026-001 | Config de Cálculo: salvar sem popup | Ready | Alta |
| MELHORIAS-ABR2026-002 | Produtos/Serviços: bloquear criação sem tabela de comissão | Ready | Alta |
| MELHORIAS-ABR2026-003 | Agenda: reordenar campo Cliente no novo serviço | Ready | Média |
| MELHORIAS-ABR2026-004 | Agenda: tracking de disparo WhatsApp no reagendamento | Ready | Alta |
| MELHORIAS-ABR2026-005 | Agenda: corrigir cálculo e integração do pagamento parcelado | Ready | Alta |

---

---

# Story MELHORIAS-ABR2026-001
## Config de Cálculo: Salvar Sem Popup

**Status:** Ready
**Arquivo principal:** `src/pages/configuracoes/index.tsx`

---

### Contexto de Negócio

Na aba "Configurações de Cálculo", ao clicar em "Salvar Configurações", aparece um popup "Defina o cálculo da aplicação" (componente `ChooseCalcModal`). O usuário já está configurando o cálculo, portanto esse popup é redundante — precisa salvar direto.

---

### Critérios de Aceitação

- [ ] Ao clicar em "Salvar Configurações" na aba de configuração de cálculo, o sistema salva diretamente sem abrir o modal `ChooseCalcModal`
- [ ] O toast/notificação de sucesso continua sendo exibido após salvar
- [ ] Nenhuma outra aba ou fluxo é afetado

---

### Tarefas de Implementação

- [ ] **T1** — Localizar em `handleSaveCalc()` (por volta das linhas 533-595 de `configuracoes/index.tsx`) onde o `ChooseCalcModal` é aberto ou onde o fluxo é redirecionado para ele
- [ ] **T2** — Remover/bypassar a abertura do modal nesse fluxo específico (apenas no save da aba de cálculo)
- [ ] **T3** — Garantir que o save continua funcionando: atualiza `tenant_settings` e `tenant_expense_config` corretamente
- [ ] **T4** — Testar: salvar com dados válidos → sem modal → toast de sucesso exibido

---

### Arquivos Afetados

- `src/pages/configuracoes/index.tsx`
- `src/components/choose-calc-modal.component.tsx` (apenas leitura para entender o fluxo)

---

---

# Story MELHORIAS-ABR2026-002
## Produtos/Serviços: Bloquear Criação Sem Tabela de Comissão

**Status:** Ready
**Arquivos principais:** `src/pages/produtos/index.tsx`, `src/pages/servicos/index.tsx`

---

### Contexto de Negócio

Quando o usuário ainda não criou nenhuma Tabela de Comissão (tabela `commission_tables`), não é possível associar comissão a produtos/serviços. Para guiar o usuário, o sistema deve bloquear a criação e sinalizar visualmente o botão "Criar Tabela de Comissão".

---

### Critérios de Aceitação

- [ ] Ao carregar a aba de produtos (ou serviços) sem nenhuma tabela de comissão cadastrada (`commission_tables` com `type='PRODUCT'` vazia, ou `type='SERVICE'` vazia), exibir um banner/aviso no topo da lista informando: _"Para criar um produto, primeiro crie uma Tabela de Comissão."_ (análogo para serviços)
- [ ] Se o usuário clicar em "Adicionar Produto" (ou "Adicionar Serviço") sem ter tabela criada, exibir mensagem de erro/modal bloqueando a ação e orientando a criar a tabela
- [ ] O botão "Criar Tabela de Comissão" deve pulsar em verde quando não houver nenhuma tabela cadastrada (animação CSS `pulse` verde)
- [ ] Quando ao menos uma tabela existir, o comportamento volta ao normal (sem aviso, sem pulse, criação liberada)

---

### Tarefas de Implementação

- [ ] **T1** — Em `produtos/index.tsx` e `servicos/index.tsx`, ao carregar `commission_tables`, verificar se o array está vazio (`hasNoCommissionTable`)
- [ ] **T2** — Adicionar banner condicional de aviso no topo da lista de produtos/serviços quando `hasNoCommissionTable === true`
- [ ] **T3** — No handler de "Adicionar Produto/Serviço", verificar `hasNoCommissionTable` e bloquear a abertura do modal de criação, exibindo `message.warning(...)` ou modal informativo
- [ ] **T4** — Adicionar animação CSS de pulse verde no botão "Criar Tabela de Comissão" quando `hasNoCommissionTable === true`

```css
/* Animação a adicionar (pode ser inline style ou classe global) */
@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
  50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
}
.pulse-green {
  animation: pulse-green 1.5s infinite;
  background-color: #16a34a !important;
  border-color: #16a34a !important;
  color: white !important;
}
```

- [ ] **T5** — Testar: sem tabela → aviso visível + pulse + criação bloqueada; com tabela → tudo normal

---

### Arquivos Afetados

- `src/pages/produtos/index.tsx`
- `src/pages/servicos/index.tsx`
- `src/styles/globals.css` (ou equivalente, para a animação pulse)

---

---

# Story MELHORIAS-ABR2026-003
## Agenda: Reordenar Campo Cliente no Novo Serviço

**Status:** Ready
**Arquivo principal:** `src/pages/agenda/index.tsx`

---

### Contexto de Negócio

No formulário de "Novo Serviço" da agenda, o campo "Cliente" aparece depois de Funcionário, Tabela de Serviços, Tipo de Serviço, Serviço, Data, Hora e Duração. Para melhorar o fluxo de cadastro, o Cliente deve ser selecionado logo após o Funcionário.

---

### Ordem Atual dos Campos

1. Funcionário (employee_id)
2. Tabela de Serviços
3. Tipo de Serviço (radio: cadastrado / manual)
4. Serviço Cadastrado (service_id)
5. Serviço / Título (manual)
6. Data
7. Horário
8. Duração
9. **Cliente (customer_id)** ← está aqui
10. Observações
11. Recorrência

---

### Ordem Desejada dos Campos

1. Funcionário (employee_id)
2. **Cliente (customer_id)** ← mover para cá
3. Tabela de Serviços
4. Tipo de Serviço
5. Serviço Cadastrado
6. Serviço / Título
7. Data
8. Horário
9. Duração
10. Observações
11. Recorrência

---

### Critérios de Aceitação

- [ ] No formulário de criação de novo serviço na agenda, o campo "Cliente" aparece imediatamente após o campo "Funcionário"
- [ ] A funcionalidade do campo (busca, seleção, criação de cliente) permanece intacta
- [ ] Nenhum outro campo é removido ou alterado

---

### Tarefas de Implementação

- [ ] **T1** — Em `agenda/index.tsx`, localizar o bloco JSX do `Form.Item` referente ao `customer_id` (por volta da linha 1729 do drawer de novo serviço)
- [ ] **T2** — Mover o bloco `Form.Item name="customer_id"` para logo abaixo do bloco `Form.Item name="employee_id"`
- [ ] **T3** — Testar: abrir drawer de novo serviço → campos na nova ordem → funcionalidade preservada

---

### Arquivos Afetados

- `src/pages/agenda/index.tsx`

---

---

# Story MELHORIAS-ABR2026-004
## Agenda: Tracking de Disparo WhatsApp no Reagendamento

**Status:** Ready
**Arquivos principais:** `src/pages/agenda/index.tsx`, `src/pages/api/whatsapp/send-reminder.ts`, Supabase

---

### Contexto de Negócio

Quando um agendamento é reagendado (data/hora alterada), o cliente precisa ser notificado. Atualmente o disparo WhatsApp é feito manualmente via ícone, sem controle de histórico por agendamento. Precisamos:
1. Controlar automaticamente o disparo no reagendamento
2. Mostrar visualmente no balão do agendamento se a mensagem foi enviada, com sucesso ou falha

A tabela `whatsapp_dispatches` já existe com o campo `calendar_event_id` para vincular disparos a agendamentos.

---

### Critérios de Aceitação

- [ ] Quando um agendamento existente tem sua data/hora alterada (reagendamento):
  - Se ainda NÃO foi enviado nenhum disparo (`SENT`/`DELIVERED`/`READ`) para aquele `calendar_event_id` → atualizar o disparo `PENDING` existente com o novo horário (ou criar um novo `PENDING` se não houver nenhum)
  - Se JÁ foi enviado um disparo → criar automaticamente um novo registro `PENDING` em `whatsapp_dispatches` com o novo horário, para notificar o cliente do novo horário
- [ ] No balão/card do agendamento na agenda:
  - Se houver disparo com status `SENT`, `DELIVERED` ou `READ` → exibir ícone/badge verde com tooltip "Mensagem enviada ao cliente"
  - Se houver disparo com status `FAILED` → exibir ícone/badge vermelho com tooltip contendo a mensagem de erro
  - Se houver disparo `PENDING` → exibir ícone/badge cinza com tooltip "Envio agendado"
  - Se não houver nenhum disparo → não exibir nada (comportamento atual)

---

### Tarefas de Implementação

#### SQL — Migration Supabase

- [ ] **T1** — Verificar se `whatsapp_dispatches` já tem os campos necessários:
  - `calendar_event_id UUID REFERENCES calendar_events(id)`
  - `status TEXT` (PENDING | SENT | DELIVERED | READ | FAILED)
  - `error_message TEXT`
  - `sent_at TIMESTAMPTZ`
  - Se faltar algum campo, criar migration `add_whatsapp_dispatch_tracking.sql`

```sql
-- Migration: garantir campos de tracking (rodar apenas se não existirem)
ALTER TABLE whatsapp_dispatches
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Index para busca por calendar_event_id
CREATE INDEX IF NOT EXISTS idx_whatsapp_dispatches_calendar_event
  ON whatsapp_dispatches(calendar_event_id);
```

#### Frontend — Lógica de Reagendamento

- [ ] **T2** — Em `agenda/index.tsx`, no handler de salvar edição de evento (onde data/hora é alterada), após o update do `calendar_event`, executar:
  ```typescript
  // 1. Verificar se existe disparo já enviado para este evento
  const { data: dispatches } = await supabase
    .from('whatsapp_dispatches')
    .select('id, status')
    .eq('calendar_event_id', eventId)
    .in('status', ['SENT', 'DELIVERED', 'READ']);

  if (dispatches && dispatches.length > 0) {
    // Já foi enviado → criar novo PENDING com novo horário
    await supabase.from('whatsapp_dispatches').insert({
      tenant_id: tenantId,
      calendar_event_id: eventId,
      customer_id: event.customer_id,
      status: 'PENDING',
      type: 'REMINDER',
      phone: customer.phone,
      message_body: `Seu agendamento foi remarcado para ${newDate} às ${newTime}.`
    });
  } else {
    // Ainda não enviado → atualizar o PENDING existente ou criar um
    const { data: pending } = await supabase
      .from('whatsapp_dispatches')
      .select('id')
      .eq('calendar_event_id', eventId)
      .eq('status', 'PENDING')
      .single();

    if (pending) {
      await supabase.from('whatsapp_dispatches')
        .update({ message_body: `Seu agendamento foi remarcado para ${newDate} às ${newTime}.` })
        .eq('id', pending.id);
    } else {
      await supabase.from('whatsapp_dispatches').insert({ /* novo PENDING */ });
    }
  }
  ```

#### Frontend — Status no Balão do Agendamento

- [ ] **T3** — Ao carregar eventos da agenda, fazer join/fetch de `whatsapp_dispatches` por `calendar_event_id` para cada evento visível na semana atual
- [ ] **T4** — No componente de renderização do balão/card de evento, adicionar badge de status:
  ```tsx
  {dispatch?.status === 'SENT' || dispatch?.status === 'DELIVERED' || dispatch?.status === 'READ' ? (
    <Tooltip title="Mensagem enviada ao cliente">
      <CheckCircleOutlined style={{ color: '#16a34a', fontSize: 12 }} />
    </Tooltip>
  ) : dispatch?.status === 'FAILED' ? (
    <Tooltip title={`Falha no envio: ${dispatch.error_message}`}>
      <ExclamationCircleOutlined style={{ color: '#dc2626', fontSize: 12 }} />
    </Tooltip>
  ) : dispatch?.status === 'PENDING' ? (
    <Tooltip title="Envio agendado">
      <ClockCircleOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
    </Tooltip>
  ) : null}
  ```
- [ ] **T5** — Testar: reagendar evento sem disparo anterior → PENDING atualizado; reagendar com disparo enviado → novo PENDING criado; balão mostra ícone correto para cada status

---

### Arquivos Afetados

- `src/pages/agenda/index.tsx`
- `src/pages/api/whatsapp/send-reminder.ts` (possível atualização do status após envio)
- Supabase: migration SQL em `supabase/migrations/`

---

---

# Story MELHORIAS-ABR2026-005
## Agenda: Corrigir Cálculo e Integração do Pagamento Parcelado

**Status:** Ready
**Arquivo principal:** `src/pages/agenda/index.tsx`
**Arquivos secundários:** `src/pages/relatorio-vendas/index.tsx`, `src/pages/comissao-vendedor/index.tsx`, `src/pages/fluxo-de-caixa/index.tsx`

---

### Contexto de Negócio

Quando o usuário escolhe "Pagamento Parcelado / Dividido" ao concluir um agendamento, o display de "Total a Lançar" está incorreto — mostra o valor total no "Pago agora" e R$ 0 no "Restante", independente do valor parcial inserido.

Além disso, o valor restante precisa:
- Aparecer no fluxo de caixa em amarelo (pendente) na data de vencimento, aguardando lançamento manual
- Alimentar o relatório de vendas com valor pago e valor pendente
- Alimentar a comissão do vendedor de forma proporcional (parte da comissão liberada agora, parte quando o restante for lançado)

---

### Comportamento Atual (Errado)

```
Total a Lançar
R$ 85,00
Pago agora: R$ 85,00 · Restante: R$ 0,00
```
_Mesmo que o usuário tenha digitado R$ 50 no campo "Valor pago agora"._

---

### Comportamento Esperado (Correto)

```
Total a Lançar
R$ 50,00
Pago agora: R$ 50,00 · Restante: R$ 35,00
```

---

### Critérios de Aceitação

#### Display na Agenda
- [ ] O campo "Total a Lançar" exibe o valor digitado em "Valor pago agora" (não o total da venda)
- [ ] "Pago agora" exibe o valor parcial inserido
- [ ] "Restante" exibe `total - amountPaid` corretamente em tempo real enquanto o usuário digita

#### Fluxo de Caixa
- [ ] O valor pago agora (R$ 50) entra no caixa como lançamento normal (status confirmado, cor padrão)
- [ ] O valor restante (R$ 35) aparece no fluxo de caixa na data de vencimento preenchida, com status `PENDING` visual em **amarelo**
- [ ] O valor pendente fica em amarelo até que um usuário vá ao fluxo de caixa e faça o lançamento manual daquele valor
- [ ] Ao lançar o valor pendente, o status muda para confirmado (cor padrão)

#### Relatório de Vendas
- [ ] Na listagem de vendas (`/relatorio-vendas`), exibir duas colunas ou sub-linha para vendas parceladas:
  - "Valor Pago": R$ 50,00
  - "Valor Pendente": R$ 35,00 (com data de vencimento)
- [ ] Filtros e totais do relatório devem considerar separadamente os valores pagos e pendentes

#### Comissão de Vendedor
- [ ] A comissão é calculada proporcionalmente:
  - Comissão liberada agora = `comissao_pct × amountPaid` (ex: 10% de R$50 = R$5)
  - Comissão pendente = `comissao_pct × remaining` (ex: 10% de R$35 = R$3,50) — liberada quando o restante for lançado
- [ ] Na aba de Comissão do Vendedor, mostrar:
  - Comissão paga/confirmada: R$ 5,00
  - Comissão pendente: R$ 3,50 (vinculada ao valor pendente no fluxo de caixa)

---

### Tarefas de Implementação

#### Fix do Display (agenda/index.tsx)

- [ ] **T1** — Localizar o bloco de "Total a Lançar" (por volta da linha 2130 de `agenda/index.tsx`) e corrigir:

**Atual:**
```tsx
<div style={{ fontWeight: 700, fontSize: 18 }}>
  {fmt(calcFinalPrice())}  {/* ← BUG: usa o total, não o amountPaid */}
</div>
{isSplitPay && (
  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
    Pago agora: {fmt(Number(payForm.getFieldValue('amount_paid')) || 0)} ·
    Restante: {fmt(Math.max(0, calcFinalPrice() - (Number(payForm.getFieldValue('amount_paid')) || 0)))}
  </div>
)}
```

**Corrigido:**
```tsx
<div style={{ fontWeight: 700, fontSize: 18 }}>
  {isSplitPay
    ? fmt(Number(payForm.getFieldValue('amount_paid')) || 0)
    : fmt(calcFinalPrice())}
</div>
{isSplitPay && (
  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
    Pago agora: {fmt(Number(payForm.getFieldValue('amount_paid')) || 0)} ·
    Restante: {fmt(Math.max(0, calcFinalPrice() - (Number(payForm.getFieldValue('amount_paid')) || 0)))}
  </div>
)}
```

- [ ] **T2** — Garantir que o campo `amount_paid` dispara re-render do display (usando `onValuesChange` no Form ou `watch`)

#### Fix das Entradas de Caixa (agenda/index.tsx)

- [ ] **T3** — Verificar como o segundo lançamento (valor restante) é criado nas linhas 760-856. Garantir que seja criado com um campo de status `PENDING` ou equivalente:
  ```typescript
  // Entrada do valor restante — deve ser criada com status pendente
  await supabase.from('cash_entries').insert({
    tenant_id: tenantId,
    amount: remaining,
    due_date: remainingDate,
    type: 'INCOME',
    status: 'PENDING',  // ← adicionar este campo se não existir
    description: `Parcela restante - ${eventTitle}`,
    calendar_event_id: eventId,
    // ... demais campos
  });
  ```

- [ ] **T4** — Se `cash_entries` não tiver o campo `status`, criar migration SQL:
  ```sql
  ALTER TABLE cash_entries
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'CONFIRMED'
    CHECK (status IN ('CONFIRMED', 'PENDING'));
  ```

#### Fluxo de Caixa — Visual Pendente (fluxo-de-caixa/index.tsx)

- [ ] **T5** — Em `src/pages/fluxo-de-caixa/index.tsx`, identificar onde as entradas de caixa são renderizadas
- [ ] **T6** — Para entradas com `status === 'PENDING'`, aplicar estilo amarelo:
  ```tsx
  <Tag color={entry.status === 'PENDING' ? 'warning' : 'success'}>
    {entry.status === 'PENDING' ? 'Pendente' : 'Confirmado'}
  </Tag>
  ```
- [ ] **T7** — Ao clicar em uma entrada pendente, permitir "Confirmar lançamento" → atualiza `status` para `'CONFIRMED'` no banco

#### Relatório de Vendas (relatorio-vendas/index.tsx)

- [ ] **T8** — Em `src/pages/relatorio-vendas/index.tsx`, buscar dados de `calendar_events` incluindo `amount_paid`, `remaining_amount`, `remaining_due_date`
- [ ] **T9** — Adicionar colunas/sub-linha nas vendas parceladas mostrando:
  - Valor pago e valor pendente (com data de vencimento)
  - Tag "Parcelado" para identificar esses registros

#### Comissão do Vendedor (comissao-vendedor/index.tsx)

- [ ] **T10** — Em `src/pages/comissao-vendedor/index.tsx`, para vendas parceladas:
  - Calcular comissão sobre `amount_paid` (comissão liberada)
  - Calcular comissão sobre `remaining_amount` (comissão pendente)
- [ ] **T11** — Exibir separadamente na listagem de comissões:
  - Comissão confirmada (sobre valor já pago)
  - Comissão pendente (sobre valor restante — vinculada ao status da entrada de caixa)
- [ ] **T12** — Quando a entrada de caixa do valor restante for confirmada, a comissão pendente passa a ser confirmada também

#### Migration SQL Final

- [ ] **T13** — Criar arquivo `supabase/migrations/YYYYMMDDHHMMSS_add_cash_entry_status_and_dispatch_tracking.sql` com todos os SQLs desta story e da story 004

---

### Arquivos Afetados

- `src/pages/agenda/index.tsx`
- `src/pages/fluxo-de-caixa/index.tsx`
- `src/pages/relatorio-vendas/index.tsx`
- `src/pages/comissao-vendedor/index.tsx`
- `supabase/migrations/` (nova migration)

---

## Definição de Pronto (DoD) do Epic

- [ ] Todas as 5 stories com status `Done`
- [ ] Nenhum erro de lint (`npm run lint`)
- [ ] Build sem erros (`npm run build`)
- [ ] Migrations SQL aplicadas no Supabase
- [ ] Testado manualmente nos fluxos descritos em cada story
