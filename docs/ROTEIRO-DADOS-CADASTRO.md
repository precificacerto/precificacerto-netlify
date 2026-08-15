# Roteiro de dados — captação de leads e trial

**Versão 4 · 14/08/2026 · decidido por Cristiano**

> **v4 substitui inteiramente as versões anteriores.** A decisão do Cristiano é fazer
> uma **via paralela**: a captação de leads não entra no ecossistema de integrações do
> sistema. Some a tabela `leads` no Supabase, some o `lead_id`, some qualquer alteração
> de banco. O que sobra é muito menor — e é de propósito.

---

## 1. A decisão

Os dados preenchidos no início da landing page (nome, e-mail, WhatsApp, empresa,
segmento) servem a **um único propósito**: dar um caminho para a equipe entrar em
contato — remarketing com quem não comprou, e acompanhamento de quem comprou.

Eles vão **direto para uma planilha do Google. Ponto.**

Não alimentam o sistema. Não viram conta. Não entram no banco. Depois de pagar, a pessoa
preenche o onboarding normalmente, como já faz hoje — **redigitar empresa e segmento não
é problema** e foi aceito conscientemente, em troca de simplicidade.

---

## 2. As duas vias

```
VIA COMERCIAL (nova, isolada)
   formulário → planilha do Google → pessoa liga, acompanha, ajuda

VIA DO PRODUTO (já existe hoje, NÃO muda)
   escolha do plano → Stripe → pagamento → webhook → conta → convite por e-mail
```

A via do produto é **exatamente o que o sistema já faz**. Nada nela é alterado por este
roteiro.

---

## 3. O que muda no sistema

**Uma coisa só:** ao enviar o formulário da landing, o servidor também manda os dados
para a planilha. Depois disso, o fluxo segue como sempre seguiu.

O que **não** muda, e não deve ser tocado:

- O `webhook.ts` e a criação de tenant/conta.
- O `create-checkout-session.ts` e o fluxo do Stripe.
- O `auth.context.tsx`, o `_app.tsx` e o `logged-user.type.ts`.
- O onboarding.
- Qualquer tabela, coluna ou enum do Supabase. **Zero migrations.**

---

## 4. Destino de cada campo

| Campo | Planilha | Stripe | Supabase |
|---|:--:|:--:|:--:|
| Nome | ✔ | ✔ | ✔ *(pelo fluxo que já existe)* |
| E-mail | ✔ | ✔ | ✔ *(idem)* |
| WhatsApp | ✔ | — | — |
| Empresa | ✔ | — | *(digitado de novo no onboarding)* |
| Segmento | ✔ | — | *(idem)* |
| Consentimento + data | ✔ | — | — |
| UTMs | ✔ | — | — |
| Plano e qtd. de usuários | ✔ | ✔ | ✔ *(idem)* |
| Dados de cartão | — | ✔ | — |

A Stripe continua recebendo o que já recebia hoje. **Nada de empresa ou segmento.**

---

## 5. Regras

1. **A gravação na planilha nunca derruba o checkout.** Se a planilha falhar, registre o
   erro e siga para o pagamento. Perder uma venda por causa de uma planilha é pior que
   perder um lead.
2. **Nenhuma conta é criada antes do pagamento.** Continua como hoje.
3. **Não existe campo de senha no formulário.** A senha é definida em `/criar-senha`,
   pelo link do convite, depois do pagamento — como já funciona.
4. **Consentimento gravado com data e versão do texto** (LGPD).
5. **Nenhuma alteração de schema.** Se a implementação exigir uma migration, algo saiu
   do combinado: pare e avise.

---

## 6. Como a planilha é escrita

**Google Apps Script**, publicado como *Web App*, vinculado à planilha. O servidor do
site faz um POST para essa URL.

Escolhido por ser o mais simples: sem service account, sem arquivo de credencial JSON,
sem biblioteca nova no projeto. São ~15 linhas de script e uma URL.

Três condições:

1. A URL vive numa variável de ambiente (`SHEETS_WEBHOOK_URL`) — **nunca no navegador**.
2. A chamada sai do servidor, nunca do código da página.
3. O script exige um **token** (`SHEETS_WEBHOOK_TOKEN`) validado dentro dele. URL secreta
   não é segurança: URLs vazam em log, histórico e captura de tela.

---

## 7. Colunas da planilha

`criado_em` · `nome` · `email` · `whatsapp` · `empresa` · `segmento` ·
`plano_escolhido` · `qtd_usuarios` · `utm_source` · `utm_medium` · `utm_campaign` ·
`utm_content` · `consentimento` · `consentimento_em` · `status` · `observacoes`

`status` começa como `novo`. As demais mudanças são feitas **a mão**, por quem acompanha,
até que o item 8 seja implementado.

`observacoes` é campo livre, para anotar o que foi apurado em cada contato.

---

## 8. Melhoria futura (não implementar agora)

Hoje, quem paga continua marcado como `novo` na planilha — a pessoa do comercial precisa
conferir manualmente quem comprou antes de ligar.

Quando incomodar, a ponte é pequena: o `webhook.ts` acrescenta uma chamada à mesma URL da
planilha, marcando `pagou` **pelo e-mail** (não é preciso identificador nenhum — o e-mail
já é o mesmo nos dois lados).

Isso destrava o alerta mais valioso: **pagou e nunca acessou.** É a pessoa que passou o
cartão, não recebeu o convite (spam, e-mail digitado errado, falha de envio) e ficou sem
o produto — hoje você só descobre quando vem a reclamação.

**Deliberadamente fora do escopo agora.** Fica registrado para não se perder.

---

## 9. Ordem de implementação

| # | Etapa | Toca produção? |
|---|---|---|
| 1 | Limpeza: remover o código do modelo antigo (conta antes de pagar, senha na Etapa 1, `PENDING_PAYMENT`) | Não |
| 2 | Criar planilha + Apps Script com token + variáveis de ambiente | Não |
| 3 | Rota no servidor que recebe o formulário e grava na planilha | Não |
| 4 | Ligar o formulário da landing a essa rota | Não |
| 5 | Testar em Preview: preencher, conferir a linha na planilha, seguir para o checkout de teste | Não |
| 6 | Publicar | Sim — mas nenhuma alteração de banco |

Não há etapa de migration. Não há etapa irreversível. O pior caso em qualquer ponto é
uma linha a menos na planilha.

---

## 10. Pendências

- **Verificação C no Supabase** (o SQL do `PENDING_PAYMENT`): confirmar se o valor chegou
  a ser aplicado. Já confirmado que a tabela `leads` **não existe**. Se o C der `false`,
  os três arquivos de migration podem ser apagados sem consequência.
- **Variáveis de ambiente de Preview:** confirmar no painel da Vercel que o escopo
  *Preview* aponta para Supabase de teste e `sk_test_`. Menos crítico agora, já que nada
  aqui escreve no banco — mas o checkout de teste continua exigindo isso.
- **Preço em três lugares** (`signup-plans.ts`, HTML da landing, Stripe): fica como
  pendência conhecida. A landing é estática e não consulta a Stripe, então a proteção
  possível é um script que compare os valores e acuse divergência.
