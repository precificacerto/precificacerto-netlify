# Supabase Auth – URLs de convite e redefinição de senha

Os links que vêm nos e-mails de **convite** (“Definir minha senha”) e de **redefinição de senha** são montados pelo Supabase. Se o link levar para um domínio antigo (ex.: `app.precificacerto.com.br`) em vez do atual (ex.: `https://precificav2.netlify.app`), ajuste as configurações abaixo.

## 1. Site URL (obrigatório)

No **Supabase Dashboard**:

1. Abra o projeto → **Authentication** → **URL Configuration**.
2. Em **Site URL**, coloque exatamente o domínio do app em produção, com **https**:
   - Ex.: `https://precificav2.netlify.app`
   - **Não** use `http://` nem o domínio antigo (`app.precificacerto.com.br`) aqui.

O Supabase usa a **Site URL** como base para os links que vão nos e-mails. Se ela estiver com o domínio antigo, o botão “Definir minha senha” ou “Redefinir senha” vai abrir o domínio errado.

## 2. Redirect URLs (permitidas)

Na mesma tela (**Redirect URLs**), inclua as URLs do **mesmo domínio** (com **https**), por exemplo:

- `https://precificav2.netlify.app/criar-senha`
- `https://precificav2.netlify.app/reset-password`
- `https://precificav2.netlify.app/**` (wildcard, se o projeto permitir)

Use **https** em produção. Ter só `http://precificav2.netlify.app/...` pode fazer o link do e-mail não funcionar corretamente.

## 3. Variável de ambiente (opcional mas recomendado)

No Netlify (ou no `.env` local), defina:

```bash
NEXT_PUBLIC_APP_URL=https://precificav2.netlify.app
```

O código do app usa essa variável para montar o `redirectTo` nas chamadas de convite e redefinição. O domínio deve ser o **mesmo** da **Site URL** do Supabase.

## Resumo

| Onde | O que colocar |
|------|----------------|
| **Supabase → Auth → URL Configuration → Site URL** | `https://precificav2.netlify.app` |
| **Redirect URLs** | `https://precificav2.netlify.app/criar-senha`, `https://precificav2.netlify.app/reset-password`, etc. |
| **Netlify / .env** | `NEXT_PUBLIC_APP_URL=https://precificav2.netlify.app` |

Depois de salvar a **Site URL** no Supabase, os **novos** e-mails de convite e de redefinição de senha passarão a apontar para `https://precificav2.netlify.app`.
