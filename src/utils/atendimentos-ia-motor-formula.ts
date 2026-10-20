/**
 * Atendimentos I.A. — o AVALIADOR RESTRITO das fórmulas do motor do fornecedor.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * NADA DE `eval`, `Function` ou string avaliada como código (dono do produto, 20/10/2026). A
 * fórmula é lida por um analisador próprio, que conhece SÓ o que foi medido nas 4.055 regras da
 * Wolff (sessão de verificação, 20/10/2026):
 *   - números, com VÍRGULA decimal ("4,2"); o ponto NÃO é decimal — em pt-BR ele seria milhar,
 *     e adivinhar qual dos dois é afirmar um número que ninguém escreveu;
 *   - variáveis conhecidas (o chamador as resolve — `resolver`);
 *   - `+`, `-` e `−` (o sinal de menos tipográfico); `*` e `·` (o ponto médio); `/`; parênteses;
 *   - na CONDIÇÃO: `=`, `>`, `<`, `and`, `or`. NÃO existem `<>`, `>=` nem `<=` no arquivo; se um
 *     dia aparecerem, a regra vai para pendentes — não são lidos "do jeito óbvio";
 *   - na QUANTIDADE: `IIF(condição; a; b)`, `ARREDMAIOR(x)` (arredonda para cima) e
 *     `ROUND(x; casas)`. A aridade de cada uma é a declarada aqui; outra aridade é pendente.
 *
 * QUALQUER COISA FORA DISSO NÃO É ADIVINHADA: devolve `ok: false` com o motivo, e quem chamou põe a
 * fórmula, COMO ESTÁ ESCRITA, em pendentes.
 *
 * ══ A VÍRGULA DENTRO DE FUNÇÃO É AMBÍGUA, e por isso é pendente ══
 * A vírgula é decimal em "4,2" e pode ser separador de argumento em "IIF(N=1,2,1)". Fora de
 * função, vírgula entre dígitos é decimal. DENTRO dos argumentos de uma função, vírgula colada
 * entre dígitos pode ser as duas coisas — "ARREDMAIOR(NF/2,5)" é 2,5 ou dois argumentos? —, e a
 * fórmula vai para pendentes em vez de escolher. Separador sem ambiguidade: `;`, ou a vírgula
 * seguida de espaço ("IIF(N = 1, 2, 1)").
 *
 * ══ VARIÁVEL QUE FALTA NÃO VIRA ZERO (`ausente-vs-falso.md`) ══
 * O resolver devolve a falta, e ela sobe com o NOME da variável. A avaliação é PREGUIÇOSA: o ramo
 * do IIF que não é escolhido não é avaliado, e uma variável que só aparece nele não faz falta —
 * ela não foi usada, e nenhum número saiu dela.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-motor-de-calculo.test.ts`.
 */

export type Avaliacao<T> = { ok: true; valor: T } | { ok: false; motivo: string; variavel?: string }

/** Resolve uma variável. `ok: false` com `variavel` = ninguém informou. */
export type Resolver = (nome: string) => Avaliacao<number>

/** As funções medidas, com a aridade aceita. */
export const FUNCOES_ACEITAS = { IIF: 3, ARREDMAIOR: 1, ROUND: 2 } as const

/** Os operadores de comparação medidos na condição. */
export const COMPARACOES_ACEITAS = ['=', '>', '<'] as const

export const avaliarNumero = (_texto: string, _resolver: Resolver): Avaliacao<number> => { throw new Error('não implementado') }
export const avaliarCondicao = (_texto: string, _resolver: Resolver): Avaliacao<boolean> => { throw new Error('não implementado') }
