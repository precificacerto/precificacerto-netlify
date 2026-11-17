"""Mutações do código das regras do WVetro (17/11/2026): cada uma tem de deixar vermelho o portão `avaliador-regras-do-wvetro.test.ts`.
Rodar da raiz do repositório, sozinho (mutacao-na-arvore-de-trabalho.md): python3 scripts/harness/regras-do-wvetro-no-motor/mutacoes-codigo.py"""
import subprocess, sys
A = 'src/lib/atendimentos-ia/avaliador-de-formulas.ts'
E = 'src/lib/atendimentos-ia/escolhas-da-tipologia.ts'
M = [
    ('R1 inativa ignorada', A, "if (!ativa(variavel, pilha)) return racional(Z)", "if (false) return racional(Z)"),
    ('R1 &VAR inativo usa a opcao', A, "if (variavel && !ativa(variavel, [nome])) return racional(Z)", "if (false) return racional(Z)"),
    ('R1 nome inexistente vira recusa', A, "&& !ctx.formulas.has(e.variavel) && CONSTANTES_DO_LEIA_ME[e.variavel] === undefined) return true", "&& false) return true"),
    ('R1 nome existente vira ativa', A, "e.variavel !== undefined && !ctx.variaveis.has(e.variavel)", "e.variavel !== undefined"),
    ('R2 escolha invalida aceita', A, "if (validas && !validas.includes(escolha)) {", "if (false) {"),
    ('R2 padrao invalido aceito', A, "if (validas && !validas.some((x) => compara(deNumero(x) as Q, valor) === 0)) {", "if (false) {"),
    ('R2 opcao sem condicao some', A, "return c === undefined ? true : condicaoDe(", "return c === undefined ? false : condicaoDe("),
    ('R3/R4 sem filtro', A, "        return ns.includes(esp)\n", "        return true\n"),
    ('R3/R4 sem espessura entra', A, "if (esp === null) { falta(`a linha depende", "if (false) { falta(`a linha depende"),
    ('R5 arredonda em vez de cortar', A, "comprimento_mm: aoMilimetroCortado(medida), quantidade", "comprimento_mm: Math.round(aoMicrometro(medida)), quantidade"),
    ('R5 abaixo de 1 mm passa', A, "if (medida.n <= Z || aoMilimetroCortado(medida) === 0) {", "if (medida.n <= Z) {"),
    ('leitura sem condicao_opcoes', A, "condicao_opcoes: texto(l['Condição das opções']),", "condicao_opcoes: null,"),
    ('leitura sem esp do insumo', A, "            esp_vidro: texto(l['Esp. vidro']),\n        })) : [],", "            esp_vidro: null,\n        })) : [],"),
    ('conversa oferece todas', E, "        return 'recusa' in r ? true : r.valor === true", "        return true"),
]
vivas = []
for nome, arq, de, para in M:
    t = open(arq, encoding='utf-8').read()
    if t.count(de) != 1: print('ABORTA (o trecho nao aparece uma vez):', nome); sys.exit(3)
    open(arq, 'w', encoding='utf-8').write(t.replace(de, para))
    try:
        r = subprocess.run(['npx', 'jest', '--ci', 'src/utils/__tests__/avaliador-regras-do-wvetro.test.ts'], capture_output=True, text=True)
    finally:
        open(arq, 'w', encoding='utf-8').write(t)
    morta = r.returncode != 0
    print(('morta ' if morta else 'VIVA  ') + nome)
    if not morta: vivas.append(nome)
print(f'{len(M) - len(vivas)} de {len(M)} mortas')
sys.exit(1 if vivas else 0)
