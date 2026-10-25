# Precifica Certo — instruções do projeto

- **Idioma:** português, com acentuação correta, em código, commits, PRs e respostas.
- **Regras:**
  - `.claude/rules/indice.md` é carregado sempre e tem uma linha por classe.
  - O texto de cada classe mora em `docs/regras/`, e é lido quando a classe se aplica, ou em `.claude/rules/` com `paths:`, e então carrega ao editar o código do domínio.
  - O que não vale mais está em `docs/regras/arquivo/`.
  - O teste `paridade-regras-e-indice` mantém as três coisas alinhadas.
- **Portões antes de empurrar:**
  - `npm run test:ci`, conferindo `Test Suites` **e** `Tests`;
  - `npm run check-tsc`;
  - `npm run check-pricing-engine` e `npm run check-edge-imports`;
  - `npm run build`;
  - `next lint` comparado com a main por arquivo + regra + nível, nunca por contagem (`docs/regras/baseline-measurement.md`).
- **Commits:** convencionais (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Quando o comando pedir, o teste vermelho é commitado antes da correção.
- **Push** ao fim de cada etapa (`docs/regras/trabalho-que-vive-no-container.md`).
- **PR e merge** são do dono do produto.
- **Banco de produção:** só leitura. Migração nunca é aplicada pelo assistente, e o PR nomeia a migração que pressupõe (`.claude/rules/migracao.md`).
- **Estado externo** (schema, PR, deploy) é consultado na fonte antes de virar premissa.
- **O framework AIOS não é usado neste projeto:** agentes `@dev`/`@qa`, stories, `*comandos`, constitution. O texto antigo deste arquivo está em `docs/regras/arquivo/CLAUDE-aios.md`.
