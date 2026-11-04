# Precifica Certo — instruções do projeto

- **Idioma:** português, com acentuação correta, em código, commits, PRs e respostas.
- **Regras:**
  - `.claude/rules/indice.md` é carregado sempre e tem uma linha por classe.
  - O texto de cada classe mora em `docs/regras/`, e é lido quando a classe se aplica, ou em `.claude/rules/` com `paths:`, e então carrega ao editar o código do domínio.
  - O que não vale mais está em `docs/regras/arquivo/`.
  - O teste `paridade-regras-e-indice` mantém as três coisas alinhadas.
- **Portões antes de empurrar — regime graduado (dono do produto, 04/11/2026).** Classifique a mudança
  e use só o rigor daquele nível; diga no começo de cada PR qual nível escolheu e por quê. Na dúvida
  entre dois níveis, suba. O CI do GitHub roda os portões completos de qualquer jeito: ele é a rede de
  segurança; o que muda é o que se roda localmente antes de abrir o PR.
  - **Nível 1** — texto, prompt, frase, rótulo, regra em `.md`: só as suítes dos arquivos tocados + `npm run check-tsc`.
    Sem mutações, sem harness, sem lint comparado, sem build.
  - **Nível 2** — código sem migração e sem tocar em preço, imposto ou gravação: suítes dos módulos
    afetados + `check-tsc` + lint dos arquivos tocados. Mutações só do trecho novo. Sem suíte completa.
  - **Nível 3** — migração, dinheiro (preço, custo, crédito, imposto), gravação de dado de conta, ou
    mudança que apaga algo: tudo:
    - `npm run test:ci`, conferindo `Test Suites` **e** `Tests`;
    - `npm run check-tsc`;
    - `npm run check-pricing-engine` e `npm run check-edge-imports`;
    - `npm run build`;
    - `next lint` comparado com a main por arquivo + regra + nível, nunca por contagem (`docs/regras/baseline-measurement.md`);
    - mutações do código e harness da migração.
- **Commits:** convencionais (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Quando o comando pedir, o teste vermelho é commitado antes da correção.
- **Push** ao fim de cada etapa (`docs/regras/trabalho-que-vive-no-container.md`).
- **PR e merge** são do dono do produto.
- **Banco de produção:** só leitura. Migração nunca é aplicada pelo assistente, e o PR nomeia a migração que pressupõe (`.claude/rules/migracao.md`).
- **Estado externo** (schema, PR, deploy) é consultado na fonte antes de virar premissa.
- **O framework AIOS não é usado neste projeto:** agentes `@dev`/`@qa`, stories, `*comandos`, constitution. O texto antigo deste arquivo está em `docs/regras/arquivo/CLAUDE-aios.md`.
