# Configurar SMTP no Supabase (envio de emails)

O Supabase usa um serviço de email padrão com **limite de mensagens por hora**. Quando esse limite é atingido, aparece o erro **"email rate limit exceeded"** (429). Para evitar isso e enviar emails de recuperação de senha, convites etc., configure um **SMTP customizado**.

## Onde configurar

- **Projeto hospedado (supabase.com):** no **Dashboard** do Supabase.
- **Supabase local** (`supabase start`): no arquivo `supabase/config.toml` (veja seção no final deste guia).

---

## 1. Projeto hospedado – Dashboard

1. Acesse [Supabase Dashboard](https://supabase.com/dashboard) e abra seu projeto.
2. No menu lateral: **Authentication** → **Email** (ou **Providers** → **Email**).
3. Role até **Custom SMTP** (ou **SMTP Settings**).
4. Ative **Enable Custom SMTP** e preencha:

| Campo | Exemplo | Descrição |
|-------|---------|-----------|
| **Sender email** | `noreply@seudominio.com` | Email que aparece como remetente. |
| **Sender name** | `Precifica Certo` | Nome exibido como remetente. |
| **Host** | Depende do provedor (veja abaixo) | Servidor SMTP. |
| **Port** | `587` (TLS) ou `465` (SSL) | Porta do servidor. |
| **Username** | Seu usuário SMTP | Login do provedor. |
| **Password** | Sua senha ou API key | Senha ou chave de API. |

5. Salve. A partir daí os emails de auth (recuperação de senha, confirmação, convite) saem pelo seu SMTP.

---

## 2. Provedores de email (SMTP)

Escolha um provedor, crie conta se precisar e use os dados na tabela ou no Dashboard.

### Gmail (conta pessoal ou Google Workspace)

- **Host:** `smtp.gmail.com`  
- **Port:** `587` (TLS)  
- **User:** seu email completo (ex: `voce@gmail.com`)  
- **Senha:** use uma **Senha de app** (não a senha normal):
  1. Ative verificação em 2 etapas na conta Google.
  2. Acesse [Senhas de app](https://myaccount.google.com/apppasswords), crie uma senha para “Mail” e use esse valor no campo **Password** do SMTP.

### Resend

- Crie conta em [resend.com](https://resend.com).
- **Host:** `smtp.resend.com`  
- **Port:** `465` (SSL) ou `587` (TLS)  
- **User:** `resend`  
- **Password:** sua API Key (em Resend → API Keys).

### SendGrid

- Crie conta em [sendgrid.com](https://sendgrid.com).
- Crie uma **API Key** em Settings → API Keys.
- **Host:** `smtp.sendgrid.net`  
- **Port:** `587`  
- **User:** `apikey` (literalmente a palavra "apikey")  
- **Password:** a API Key gerada.

### Brevo (ex-Sendinblue)

- **Host:** `smtp-relay.brevo.com`  
- **Port:** `587`  
- **User:** seu email de login Brevo.  
- **Password:** senha da conta ou chave SMTP (em SMTP & API).

---

## 3. URLs de redirecionamento

Para o link de **redefinição de senha** funcionar, a URL de destino precisa estar permitida:

1. No Dashboard: **Authentication** → **URL Configuration**.
2. Em **Redirect URLs**, inclua:
   - Desenvolvimento: `http://localhost:3000/reset-password`
   - Produção: `https://seu-dominio.com/reset-password`

---

## 4. Supabase local – config.toml

Se você roda Supabase localmente (`supabase start`), pode usar SMTP customizado no `supabase/config.toml`.

1. Abra `web-app/supabase/config.toml`.
2. Procure a seção `[auth.email.smtp]` (pode estar comentada).
3. Descomente e preencha com seus dados (para senha, use variável de ambiente):

```toml
[auth.email.smtp]
enabled = true
host = "smtp.gmail.com"
port = 587
user = "seu-email@gmail.com"
pass = "env(SMTP_PASSWORD)"
admin_email = "noreply@seudominio.com"
sender_name = "Precifica Certo"
```

4. Crie um arquivo `.env` na pasta `supabase` (ou use o `.env` do projeto) com:

```env
SMTP_PASSWORD=sua_senha_de_app_aqui
```

5. Reinicie o Supabase: `supabase stop && supabase start`.

---

## Resumo

- **Hospedado:** configurar SMTP em **Authentication → Email** no Dashboard.
- **Local:** configurar em `supabase/config.toml` em `[auth.email.smtp]` e variável de ambiente para a senha.
- Sempre adicionar as URLs de redirect em **URL Configuration** para o fluxo de redefinição de senha.

Depois de salvar o SMTP, aguarde alguns minutos e teste novamente o “Esqueci minha senha”; o limite do SMTP padrão deixa de ser usado.
