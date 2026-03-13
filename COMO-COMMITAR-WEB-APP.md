# Como conseguir commitar (web-app e web-app-merge)

O Git está mostrando `web-app` e `web-app-merge` como modificados porque são **pastas com repositório Git dentro**. Para conseguir commitar no repositório principal, siga um dos caminhos abaixo.

---

## Opção A: Manter as duas pastas e só desbloquear o commit

**Forma rápida:** abra o **Terminal** no Cursor (raiz do projeto) e rode:

```powershell
.\fazer-commit-web-app.ps1
```

**Ou** execute na ordem, manualmente:

```bash
# 1) Entrar em web-app, adicionar tudo e commitar
cd web-app
git add .
git status
git commit -m "chore: recurrence, recalc and expense config updates"
cd ..

# 2) Entrar em web-app-merge, adicionar tudo e commitar
cd web-app-merge
git add .
git status
git commit -m "chore: recurrence options and generation logic"
cd ..

# 3) No repositório principal: registrar as duas pastas e commitar
git add web-app web-app-merge
git add src
git status
git commit -m "feat: fluxo recorrência, recalc 12 meses e auto-recalc"
```

Assim o repositório principal passa a apontar para os novos commits de cada pasta e o commit da raiz é aceito.

---

## Opção B: Unificar em uma pasta só (merge de conteúdo)

Se o objetivo é **ter um único app** (por exemplo só `web-app`) e jogar as mudanças de `web-app-merge` para dentro dele:

1. As alterações de recorrência e recalc já foram aplicadas em **ambas** as pastas.
2. Se em `web-app-merge` existir algo que não está em `web-app`, copie manualmente os arquivos que quiser manter.
3. Depois de decidir qual pasta é a “fonte da verdade”:
   - Se for **web-app**: pode remover a pasta `web-app-merge` do projeto (e do Git, se estiver versionada) e seguir usando só `web-app`.
   - Se for **web-app-merge**: renomeie/ajuste e use só essa, e remova a outra.

Para o Git parar de reclamar das pastas com `.git` dentro, você precisa ou:
- seguir a **Opção A** (commitar dentro de cada uma e depois `git add web-app web-app-merge` na raiz), ou
- remover o `.git` de dentro da pasta que **não** for mais usada (ex.: `web-app-merge/.git`), aí ela vira pasta normal e o pai passa a listar os arquivos normalmente.

---

## Erro "Unable to open 'web-app (Working Tree)'" / "The editor could not be opened"

Esse erro aparece quando você clica em `web-app` ou `web-app-merge` no Source Control: o Cursor/VS Code tenta abrir a **pasta** como se fosse um arquivo (e dá "that is actually a directory"). **Não dá para incluir essas pastas clicando no painel** — o Git as trata como sub-repositórios.

**O que fazer:** ignore o clique nessas entradas e use **só o terminal** (aba Terminal do Cursor, já na raiz do projeto). Rode os comandos da Opção A acima. Não é preciso abrir nem "incluir" as pastas pelo painel de mudanças.
