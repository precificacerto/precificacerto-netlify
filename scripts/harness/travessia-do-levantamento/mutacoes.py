#!/usr/bin/env python3
"""
As MUTAÇÕES da travessia do levantamento para o orçamento I.A. e do aviso da tabela congelada (dono do produto, 10/11/2026). Cada uma estraga
UMA coisa no arquivo de verdade (às vezes em dois pontos, quando a defesa é dupla de propósito), roda as suítes e DESFAZ (o arquivo volta byte a
byte, também se o processo cair). Morta = alguma suíte vermelha. M0 é o controle. Roda SOZINHO ou numa worktree
(`docs/regras/mutacao-na-arvore-de-trabalho.md`), e confere TODAS as mutações antes de rodar qualquer suíte
(`docs/regras/mutacao-que-nao-se-aplica.md`).

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py P1 S3      (só estas — o trecho único é conferido em todas, mesmo assim)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
PLANO = 'src/lib/atendimentos-ia/travessia-do-levantamento-plano.ts'
SERV = 'src/lib/atendimentos-ia/travessia-do-levantamento.ts'
ROTA = 'src/pages/api/atendimentos-ia/orcamentos/atravessar.ts'
UM = 'src/pages/api/atendimentos-ia/orcamentos/[id].ts'
CONV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
TELA = 'src/pages/atendimentos-ia/orcamentos-ia/index.tsx'
EDICAO = 'src/pages/atendimentos-ia/orcamentos-ia/[id].tsx'
DIV = 'src/lib/atendimentos-ia/divergencia-da-tabela.ts'
CALC = 'src/lib/atendimentos-ia/orcamento-calculado.ts'
SUITES = ['src/utils/__tests__/atendimentos-ia-travessia-do-levantamento.test.ts', 'src/utils/__tests__/atendimentos-ia-orcamento-calculado.test.ts',
          'src/utils/__tests__/atendimentos-ia-orcamentos-ia-tela.test.tsx', 'src/utils/__tests__/atendimentos-ia-orcamentos-ia.test.ts',
          'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']

# (ident, descrição, [(arquivo, de, para), ...])
MUTACOES = [
    # ── o plano (puro)
    ('P1', 'o levantamento não completo atravessa', [(PLANO, 'if (lev.estado !== ESTADO_COMPLETO) recusas.push', 'if (false) recusas.push')]),
    ('P2', 'o nome com um caractere a mais passa', [(PLANO, '[...nome].length > LIMITE_DO_NOME)', '[...nome].length > LIMITE_DO_NOME + 1)')]),
    ('P3', 'o levantamento sem esquadria atravessa', [(PLANO, 'if (itens.length === 0) recusas.push', 'if (false) recusas.push')]),
    ('P4', 'quantidade zero passa', [(PLANO, '|| q < 1) recusas.push', '|| q < 0) recusas.push')]),
    ('P5', 'quantidade fracionária passa', [(PLANO, '!Number.isInteger(q) || q < 1', 'q < 1')]),
    ('P6', 'o orçamento nasce manual', [(PLANO, "tenant_id: lev.tenant_id, origem: 'agente',", "tenant_id: lev.tenant_id, origem: 'manual',")]),
    ('P7', 'o orçamento do agente ganha autor', [(PLANO, 'obs: null, criado_por: null,', 'obs: null, criado_por: lev.tenant_id,')]),
    ('P13', 'o modo da base ganha motivo', [(PLANO, "aproveitamento_origem: 'base_de_conhecimento', aproveitamento_motivo: null", "aproveitamento_origem: 'base_de_conhecimento', aproveitamento_motivo: MOTIVO_DO_FALLBACK")]),
    ('P14', 'sem a base, nada de fallback', [(PLANO, 'if (daBase !== null) return', 'if (true) return')]),
    ('P15', 'o texto vazio da base vira zero', [(PLANO, "if (v === null || v === undefined || v === '') return null", 'if (v === null || v === undefined) return null')]),
    ('P16', 'os itens fora da ordem', [(PLANO, 'const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem)', 'const ordenados = [...itens]')]),
    ('P17', 'o item sem o vínculo de origem', [(PLANO, 'levantamento_item_id: i.id,', 'levantamento_item_id: null,')]),
    ('P18', 'as escolhas não atravessam', [(PLANO, 'escolhas: i.escolhas ?? null,', 'escolhas: null,')]),
    ('P19', 'os ambientes não atravessam', [(PLANO, 'ambientes: i.ambientes ?? null,', 'ambientes: null,')]),
    ('P20', 'o nome não é aparado', [(PLANO, "v.trim() !== '' ? v.trim() : null", "v.trim() !== '' ? v : null")]),
    # ── a REGRA DO ZERO (dono do produto, 11/11/2026)
    ('Z1', 'a base vence o levantamento', [(PLANO, "if (l !== null) return { valor: l, origem: 'levantamento' }", "if (l !== null && false) return { valor: l, origem: 'levantamento' }")]),
    ('Z2', 'a ausência vira nulo, não zero', [(PLANO, "return { valor: 0, origem: 'zero_por_ausencia' }", "return { valor: null as unknown as number, origem: 'zero_por_ausencia' }")]),
    ('Z3', 'a pré-definição é ignorada (o zero vem primeiro)', [(PLANO, "    if (b !== null) return { valor: b, origem: 'base_de_conhecimento' }\n", '')]),
    ('Z4', 'a origem da base diz levantamento', [(PLANO, "return { valor: b, origem: 'base_de_conhecimento' }", "return { valor: b, origem: 'levantamento' }")]),
    ('Z5', 'a comissão lê o lucro da pré-definição', [(PLANO, 'resolverPercentual(lev.comissao_percentual, doVendedor?.comissao_percentual)', 'resolverPercentual(lev.comissao_percentual, doVendedor?.lucro_projetado_percentual)')]),
    ('Z6', 'o modo não cai na pré-definição', [(PLANO, ' ?? textoOuNulo(doVendedor?.comissao_modo)', '')]),
    ('Z7', 'o modo vazio não é falta', [(PLANO, 'o.comissao_modo === null ? [FALTA_DO_MODO_DA_COMISSAO] : []', '[]')]),
    ('Z8', 'a pré-definição não é a do vendedor do levantamento', [(SERV, 'lerPerfilDoVendedor(tenantId, textoOuNulo(lev.vendedor_employee_id))\n    const plano', 'lerPerfilDoVendedor(tenantId, null)\n    const plano')]),
    ('Z9', 'a tela não vê a alteração sobre o levantamento', [(PLANO, "if (l !== null) return o === l ? 'levantamento' : 'alterado_no_orcamento'", "if (l !== null) return 'levantamento'")]),
    ('Z10', 'a tela chama de zero por ausência um valor alterado', [(PLANO, "return o === 0 ? 'zero_por_ausencia' : 'alterado_no_orcamento'", "return 'zero_por_ausencia'")]),
    ('Z11', 'a tela inverte a comparação com a base', [(PLANO, "if (b !== null) return o === b ? 'base_de_conhecimento'", "if (b !== null) return o !== b ? 'base_de_conhecimento'")]),
    ('Z12', 'o manual ganha percentuais com origem', [(SERV, "if (!orc || orc.origem !== 'agente' || !orc.levantamento_id) return []", 'if (!orc) return []')]),
    ('Z13', 'os percentuais de outra empresa', [(SERV, "${PERCENTUAIS_COM_ZERO.join(', ')}`)\n        .eq('tenant_id', tenantId).eq('id', id)", "${PERCENTUAIS_COM_ZERO.join(', ')}`)\n        .eq('id', id)")]),
    ('Z14', 'o zero por ausência sem destaque', [(EDICAO, "color={p.origem === 'zero_por_ausencia' ? 'gold' : undefined}", 'color={undefined}')]),
    # ── o "sim" ENCADEIA (dono do produto, 11/11/2026)
    ('E1', 'o sim não calcula', [(SERV, 'const c = await calcularOrcamento(tenantId, r.orcamento.id)', 'const c = { valor_total_liquido: 0 }')]),
    ('E2', 'a falha do cálculo derruba a conversa', [(SERV, '        return `${travessia} calculo=falhou parou=calculo', '        throw e\n        return `${travessia} calculo=falhou parou=calculo')]),
    ('E3', 'a recusa do cálculo vira falha', [(SERV, 'if (e instanceof ErroDoCalculo) return', 'if (false) return')]),
    ('E4', 'o rastro não diz que parou na precificação', [(SERV, 'parou=precificacao motivo=', 'parou=calculo motivo=')]),
    # ── o servidor
    ('S1', 'o levantamento de outra empresa é lido (as duas defesas)', [
        (SERV, ".select(COLUNAS_DO_LEVANTAMENTO).eq('tenant_id', tenantId).eq('id', levantamentoId)", ".select(COLUNAS_DO_LEVANTAMENTO).eq('id', levantamentoId)"),
        (SERV, 'if (!lev || lev.tenant_id !== tenantId) throw', 'if (!lev) throw')]),
    ('S2', 'o já atravessado ganha um segundo', [(SERV, 'if (existente && existente.itens > 0) throw', 'if (false) throw')]),
    ('S3', 'a retomada não grava os itens', [(SERV, '        await gravarItens(tenantId, existente.id, plano.itens)\n', '')]),
    ('S4', 'o número pula um', [(SERV, "?.numero ?? 0) + 1\n        const { data: criado", "?.numero ?? 0) + 2\n        const { data: criado")]),
    ('S5', 'a corrida no índice único não vira já atravessado', [(SERV, 'if (outro) throw new ErroJaAtravessado', 'if (false) throw new ErroJaAtravessado')]),
    ('S6', 'a corrida no número não tenta de novo', [(SERV, "if (e2.code === '23505' && tentativa < TENTATIVAS_DO_NUMERO) continue", 'if (false) continue')]),
    ('S7', 'os itens sem o tenant', [(SERV, '({ ...i, tenant_id: tenantId, orcamento_id: orcamentoId })', '({ ...i, orcamento_id: orcamentoId })')]),
    ('S8', 'o gatilho do sim lança', [(SERV, '        return `falhou parou=travessia motivo=', '        throw e\n        return `falhou parou=travessia motivo=')]),
    ('S9', 'o já existe diz o número do levantamento', [(SERV, 'return `ja_existe=${e.orcamentoNumero} parou=travessia`', 'return `ja_existe=${e.levantamentoNumero} parou=travessia`')]),
    ('S10', 'a lista oferece o não completo', [(SERV, ".eq('estado', ESTADO_COMPLETO).order('numero', { ascending: false })", ".order('numero', { ascending: false })")]),
    ('S11', 'o cliente de outra empresa é lido', [(SERV, ".select(COLUNAS_DO_CLIENTE).eq('tenant_id', tenantId)", '.select(COLUNAS_DO_CLIENTE)')]),
    ('S12', 'o manual ganha faltas', [(SERV, "if (!data || data.origem !== 'agente') return []", 'if (!data) return []')]),
    ('S13', 'o orçamento existente de outra empresa conta', [(SERV, ".select('id, numero').eq('tenant_id', tenantId).eq('levantamento_id', levantamentoId)", ".select('id, numero').eq('levantamento_id', levantamentoId)")]),
    ('S14', 'o cliente perde o número do levantamento', [(SERV, 'return { levantamento_numero: numero, ...resto }', 'return { levantamento_numero: null, ...resto }')]),
    # ── as rotas
    ('R1', 'atravessar só com permissão de ver', [(ROTA, "req.method === 'GET' ? 'ver' : 'editar'", "'ver'")]),
    ('R2', 'o tenant vem do corpo', [(ROTA, 'atravessarLevantamento(caller.tenant_id, id.trim())', 'atravessarLevantamento(String(corpo.tenant_id ?? caller.tenant_id), id.trim())')]),
    ('R3', 'o já atravessado não é 409', [(ROTA, 'return res.status(409)', 'return res.status(422)')]),
    ('R4', 'o id em branco passa', [(ROTA, "if (typeof id !== 'string' || id.trim() === '') return res.status(400)", "if (typeof id !== 'string') return res.status(400)")]),
    ('R5', 'o GET do orçamento sem o cliente', [(UM, 'return res.status(200).json({ orcamento, cliente, faltas, percentuais })', 'return res.status(200).json({ orcamento, faltas, percentuais })')]),
    ('R6', 'o GET do orçamento sem os percentuais', [(UM, 'return res.status(200).json({ orcamento, cliente, faltas, percentuais })', 'return res.status(200).json({ orcamento, cliente, faltas })')]),
    # ── o gatilho do sim
    ('C1', 'o sim não atravessa', [(CONV, 'travessia=${await atravessarNoSim(c.tenantId, rastro.levantamento)}', 'travessia=nao')]),
    # C2 é EQUIVALENTE, medido em 10/11/2026: todo caminho que dá EM_MONTAGEM (pendência, vendedor pendente, falta o vendedor, faltam condições)
    # RETORNA antes do gatilho, então ali o estado é sempre COMPLETO. A condição fica como defesa explícita (e o plano recusa o não completo: P1).
    ('C2', 'o sim atravessa o levantamento não completo (EQUIVALENTE)', [(CONV, "levantamento.desfecho === 'levantou' && estado === COMPLETO && rastro.levantamento", "levantamento.desfecho === 'levantou' && rastro.levantamento")]),
    # ── as telas
    ('T1', 'atravessar sem escolher', [(TELA, 'disabled: escolhido === null }}', 'disabled: false }}')]),
    ('T2', 'a lista oferece o que já tem orçamento', [(TELA, '(levantamentos ?? []).filter((l) => l.orcamento === null)', '(levantamentos ?? [])')]),
    ('T3', 'o 409 vira sucesso', [(TELA, 'if (!r.ok || !corpo.orcamento || r.status === 409)', 'if (!corpo.orcamento)')]),
    ('T4', 'o cartão mostra o vazio', [(EDICAO, "typeof l[1] === 'string' && l[1].trim() !== ''", "typeof l[1] === 'string'")]),
    ('T5', 'a data de entrega sem a forma brasileira', [(EDICAO, "c.data_entrega ? c.data_entrega.split('-').reverse().join('/') : null", 'c.data_entrega')]),
    # ── o aviso da tabela congelada
    ('D1', 'a congelada igual à vigente avisa', [(DIV, 'if (it.tabelaCongelada === null || it.tabelasVigentes.includes(it.tabelaCongelada)) continue', 'if (it.tabelaCongelada === null) continue')]),
    ('D2', 'a congelada nula avisa', [(DIV, 'if (it.tabelaCongelada === null || it.tabelasVigentes', 'if (it.tabelasVigentes')]),
    ('D3', 'o bruto da congelada sem a quantidade', [(DIV, 'bruto += unidade * unidades', 'bruto += unidade')]),
    ('D4', 'o líquido da congelada é o bruto', [(DIV, 'liquido += u.liquido * unidades', 'liquido += unidade * unidades')]),
    ('D5', 'a diferença com o sinal trocado', [(DIV, 'comSinal(vigenteLiquido - c.liquido)', 'comSinal(c.liquido - vigenteLiquido)')]),
    ('D6', 'o código ausente some calado', [(DIV, "(c.ausentes.length ? `; sem preço", "(false ? `; sem preço")]),
    ('D7', 'lê a tabela mesmo sem divergência', [(CALC, '    if (divergentes.length === 0) return []\n', '')]),
    ('D8', 'as vigentes da família se perdem', [(CALC, "tabelasVigentes: vigentesDa.get(String(origem?.familia ?? '')) ?? []", 'tabelasVigentes: []')]),
]

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
_textos = {}
def _texto(a):
    if a not in _textos: _textos[a] = open(os.path.join(RAIZ, a), encoding='utf-8').read()
    return _textos[a]
exigir_trecho_unico((i, [(a, _texto(a), de, para) for a, de, para in trocas]) for i, _d, trocas in MUTACOES)


def jest():
    return subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True).returncode


EQUIVALENTES = {'C2'}


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda", flush=True)
        vivas += 0 if verde else 1
    for ident, descricao, trocas in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        originais = {a: open(os.path.join(RAIZ, a), encoding='utf-8').read() for a, _de, _para in trocas}
        try:
            novos = dict(originais)
            for a, de, para in trocas:
                novos[a] = novos[a].replace(de, para)
            for a, t in novos.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
            morta = jest() != 0
        finally:
            for a, t in originais.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
        if ident in EQUIVALENTES:
            print(f"{'morta   ' if morta else 'equival.'} {ident}: {descricao}", flush=True)
            continue
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}", flush=True)
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}", flush=True)
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
