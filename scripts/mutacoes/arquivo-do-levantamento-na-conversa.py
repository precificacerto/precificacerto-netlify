#!/usr/bin/env python3
"""Mutações do PR B (o arquivo do levantamento na conversa e a coleta dos dados novos). Cada mutação troca um trecho de um arquivo; as suítes
têm de ficar vermelhas (a rápida primeiro; a da conversa só se as rápidas passarem). Os arquivos voltam ao original no fim, sempre.
Uso: python3 -B scripts/mutacoes/arquivo-do-levantamento-na-conversa.py"""
import subprocess, sys
D = 'src/lib/atendimentos-ia/dados-do-levantamento.ts'
A = 'src/lib/atendimentos-ia/arquivo-do-levantamento.ts'
C = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
G = 'src/lib/atendimentos-ia/levantamento-em-montagem.ts'
P = 'src/lib/atendimentos-ia/pergunta-em-aberto.ts'
RAPIDAS = ['src/utils/__tests__/dados-do-levantamento.test.ts', 'src/utils/__tests__/arquivo-do-levantamento.test.ts', 'src/utils/__tests__/levantamento-em-montagem.test.ts']
CONVERSA = ['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
M = [
 ('D1 texto: basta uma palavra', D, 'return ps.length > 0 && ps.every((p) => naMensagem.has(p)) ? t : null', 'return ps.length > 0 && ps.some((p) => naMensagem.has(p)) ? t : null'),
 ('D2 telefone não conferido na mensagem', D, "    return mensagem.replace(/\\D/g, '').includes(digitos) ? t : null", '    return t'),
 ('D3 e-mail não conferido na mensagem', D, '    return mensagem.toLowerCase().includes(t) ? t : null', '    return t'),
 ('D4 data sem o dia e o mês ditos', D, '    return pares.some(([dia, mes]) => dia === Number(m[3]) && mes === Number(m[2])) ? v.trim() : null', '    return v.trim()'),
 ('D5 data impossível aceita', D, '    if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null\n    const pares', '    const pares'),
 ('D6 percentual inventado aceito', D, '    return numerosDaMensagem(mensagem).some((n) => n === v) ? v : null', '    return v'),
 ('D7 percentual acima de 100 aceito', D, "if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return null", "if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null"),
 ('D8 modo sem a palavra', D, "if (v === 'PROPORCIONAL' && /\\bproporciona/.test(m)) return 'PROPORCIONAL'", "if (v === 'PROPORCIONAL') return 'PROPORCIONAL'"),
 ('D9 ambiente repetido aceito', D, "        if (lidos.some((x) => x.ambiente.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) return null\n", ''),
 ('D10 quantidade do ambiente não dita', D, ' || q < 1 || !numeros.includes(q)) return null', ' || q < 1) return null'),
 ('D11 o cadastro passa por cima do dito', D, '        if (condicoes[campo] !== null) continue\n', ''),
 ('D12 a falta vira zero', D, '        else faltam.push(NOME_DO_CAMPO[campo])', '        else (condicoes as Record<string, unknown>)[campo] = 0'),
 ('D13 a obs do item sem validar', D, "const o = conta(i.obs, textoDito(i.obs, mensagem, LIMITES_DE_TEXTO.obs))", "const o = conta(i.obs, typeof i.obs === 'string' ? i.obs : null)"),
 ('A1 toda variável na linha VARIÁVEIS', A, 'semPadrao: sem.has(codigo)', 'semPadrao: true'),
 ('A2 pré-definição com o que difere', A, 'const unico = (xs: readonly string[]) => (new Set(xs).size === 1 ? xs[0] : null)', 'const unico = (xs: readonly string[]) => xs[0] ?? null'),
 ('A3 percentual no resumo do modelo', A, "        `Vendedor: ${d.condicoes.vendedor ?? '-'}.`,", "        `Vendedor: ${d.condicoes.vendedor ?? '-'}; comissão ${d.condicoes.comissaoPercentual}%.`,"),
 ('A4 o resumo de comparação sem a comissão', A, "comissão ${k.comissaoPercentual ?? '-'}% (", "comissão ("),
 ('A5 a cor reescrita em minúscula', A, '        const cor = i.cor_perfil\n', "        const cor = i.cor_perfil ? i.cor_perfil.toLocaleLowerCase('pt-BR') : null\n"),
 ('A6 o cadastro do vendedor nunca lido', A, '    if (!employeeId) return null\n    const { data, error } = await supabaseAdmin.from(\'orcamentista_vendedor_perfil\')', "    return null\n    const { data, error } = await supabaseAdmin.from('orcamentista_vendedor_perfil')"),
 ('C1 o documento não é enviado', C, 'const envio = await enviarDocumento(c.wuzapiToken, c.telefone, folha.nomeDoArquivo, folha.pdf)', 'const envio = { ok: true, id: null, status: 200, prazoEsgotado: false }'),
 ('C2 o mesmo arquivo reenviado', C, "                if (aberta !== null && aberta.texto === resumo) return await falar(FRASE_O_ARQUIVO_NAO_MUDOU, 'nao-avancou')\n", ''),
 ('C3 a recusa do gerador vira sucesso', C, "if ('recusas' in folha) return await responder(fraseDoArquivoRecusado(folha.recusas), 'arquivo-recusado')", "if ('recusas' in folha) return await responder(textoDoEnvioDoArquivo(0, nome), 'arquivo')"),
 ('C4 completo sem as condições', C, 'const estado = pendencia || faltamCondicoes.length ? EM_MONTAGEM : COMPLETO', 'const estado = pendencia ? EM_MONTAGEM : COMPLETO'),
 ('C5 o cadastro não é congelado', C, '{ ...colunasQueMudam, ...congelar }', '{ ...colunasQueMudam }'),
 ('C6 entre dois vendedores, o primeiro', C, "            if (achados.length > 1) return await falar(fraseDoVendedorRepetido(dadosDaMensagem.vendedor, achados.length), 'vendedor-nao-achado')\n", ''),
 ('C7 outro vendedor mantém os percentuais do anterior', C, "                for (const k of ['comissao_percentual', 'comissao_modo', 'reserva_tecnica_percentual', 'lucro_projetado_percentual'] as const) if (!(k in dadosDaMensagem.condicoes)) colunas[k] = null\n", ''),
 ('C8 sem vendedor padrão', C, '            if (doDono.nome !== null) { colunas.vendedor_nome = doDono.nome; colunas.vendedor_employee_id = doDono.employeeId }\n', ''),
 ('C9 a pergunta das condições fora do prompt', C, ': perguntaDasCondicoesAberta ?? aberta?.paraOPrompt', ': aberta?.paraOPrompt'),
 ('C10 o resumo com percentual ao modelo', C, 'texto: resumoDoArquivo(dados), paraOPrompt: resumoDoArquivoParaOPrompt(dados) }', 'texto: resumoDoArquivo(dados) }'),
 ('C11 os ambientes da IA sem validar', C, 'const daMensagemBrutas = semFornecedorInventado(dadosDaMensagem.proposta.itens)', 'const daMensagemBrutas = semFornecedorInventado(proposta.itens)'),
 ('C12 a falha do documento calada', C, "                if (!envio.ok) return await responder(FALHA_NO_ENVIO_DO_ARQUIVO, 'arquivo-nao-enviado', doArquivo, false)\n", ''),
 ('C13 os ambientes não gravados', C, '    ambientes: i.ambientes && i.ambientes.length ? i.ambientes : null, obs: i.obs ?? null,\n})', '    ambientes: null, obs: null,\n})'),
 ('C14 a busca do vendedor fora da empresa', A, "const { data, error } = await supabaseAdmin.from('employees').select('id, name').eq('tenant_id', tenantId)\n", "const { data, error } = await supabaseAdmin.from('employees').select('id, name')\n"),
 ('G1 o ambiente dito não aplicado', G, '        if (ambientes !== null) { propostos += 1; alvo.ambientes = ambientes }\n', ''),
 ('G2 a fusão substitui em vez de somar', G, '            if (igual) igual.quantidade += a.quantidade', '            if (igual) igual.quantidade = a.quantidade'),
 ('G3 a gravada igual não recebe os ambientes ditos', G, 'if (gravada) { if (i.ambientes) gravada.ambientes = i.ambientes; if (i.obs) gravada.obs = i.obs;', 'if (gravada) {'),
 ('P1 a retida perde os ambientes', P, "[...CAMPOS_DA_ESQUADRIA, 'vidro_padrao', 'ambientes', 'obs']", "[...CAMPOS_DA_ESQUADRIA, 'vidro_padrao']"),
]
originais = {f: open(f, encoding='utf-8').read() for f in {m[1] for m in M}}
def roda(suites):
    return subprocess.run(['npx', 'jest', *suites], capture_output=True, text=True).returncode != 0
vivas = []
try:
    for nome, arq, de, para in M:
        o = originais[arq]
        if o.count(de) != 1:
            print(f'NAO APLICOU {nome}: o trecho aparece {o.count(de)} vez(es)'); vivas.append(nome); continue
        open(arq, 'w', encoding='utf-8').write(o.replace(de, para))
        morta = roda(RAPIDAS) or roda(CONVERSA)
        open(arq, 'w', encoding='utf-8').write(o)
        print(f"{'morta' if morta else 'VIVA '}  {nome}", flush=True)
        if not morta: vivas.append(nome)
finally:
    for f, o in originais.items(): open(f, 'w', encoding='utf-8').write(o)
controle = not roda(RAPIDAS + CONVERSA)
print('controle (sem mutação):', 'verde' if controle else 'VERMELHO')
print(f'{len(M) - len(vivas)} de {len(M)} mortas' + (f'; vivas: {vivas}' if vivas else ''))
sys.exit(1 if vivas or not controle else 0)
