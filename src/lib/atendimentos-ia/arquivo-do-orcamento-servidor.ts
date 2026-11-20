/**
 * O ARQUIVO "ORÇAMENTO" do orçamento I.A., do lado do servidor (dono do produto, 11/11/2026): lê o que o arquivo imprime, gera o PDF
 * (`arquivo-do-orcamento.ts`), sobe o objeto no bucket e grava a linha em `orcamentista_orcamento_arquivo` (20261109000005: só inserção, com
 * histórico — gerar de novo é outra linha). Toda leitura e escrita leva o `tenant_id` do chamador.
 *
 * OS ITENS são montados UMA vez (`itensDoArquivo`), e a faixa da tela de precificação (os itens com as variáveis, precificados um a um) e o PDF
 * leem a mesma montagem: o que a pessoa vê antes de salvar é o que o cliente recebe.
 *
 * DE ONDE VEM CADA CAMPO (o que não tem coluna sai em branco — "vazio é vazio", 11/11/2026):
 *   - empresa: `tenants` (razão social, CNPJ, e-mail, telefone, endereço, CEP, cidade/UF, logo) e `tenant_settings` (I.E., logo); NÃO HÁ coluna
 *     para telefone 2 nem site;
 *   - cliente: o LEVANTAMENTO de origem (nome, telefone, e-mail, endereço), lido pelo `levantamento_id` no mesmo tenant; o telefone vai a TEL.
 *     FIXO ou a CELULAR pela FORMA do número (o celular brasileiro tem 9 dígitos começando por 9); NÃO HÁ coluna para TEL2, IE/RG, CEP nem
 *     CNPJ/CPF do cliente;
 *   - vendedor: o nome gravado no levantamento e o e-mail do funcionário dele; o "Contato" não tem fonte;
 *   - OBSERVAÇÕES gerais (prazos, validade, exclusões): `tenant_settings.orcamento_observacoes` (16/11/2026), o texto
 *     fixo que a base de conhecimento da empresa grava; sem ele, o bloco sai vazio, como saía antes;
 *   - as FALTAS (12/11/2026): `orcamentista_orcamento_falta` do cálculo vigente de cada item (sem a migração 20261112000006, nenhuma);
 *   - PARA O VENDEDOR: o bloco SAIU em 16/11/2026, por decisão do dono do produto — o arquivo não traz mais as barras por código, o
 *     aproveitamento, os minutos nem o "o que este preço cobre".
 */
import { createHash, randomUUID } from 'crypto'
import { supabaseAdmin } from '@/supabase/admin'
import { BUCKET_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'
import { contextoDaFolhaDaEmpresa } from './conversa-da-ia'
import { corDoAcessorio, variaveisDitas } from './arquivo-do-levantamento'
import { desenhoDaTipologia, linhaDosAmbientes, variavelNaFolha } from './folha-do-levantamento'
import { escolhasDescritas, lerEscolhasDoItem, paraOAgente } from './escolhas-da-tipologia'
import { ARREMATE_NAO_DEFINIDO } from './apanhado'
import { traduzirPolitica, type PoliticaDaEmpresa } from './politica-da-empresa'
import { lerPoliticaDaEmpresa } from './politica-da-empresa-servidor'
import { valoresDoDesenho } from './desenho-do-catalogo'
import { lerCamposDasObservacoes, linhasDasCondicoesComerciais, linhasDasObservacoes, SEM_CAMPOS, type CamposDasObservacoes } from './campos-das-observacoes'
import { comAsFiguras, type CatalogoDeDesenhos, type ItemComDesenho } from './desenho-do-catalogo-servidor'
import {
    gerarArquivoDoOrcamento, VERSAO_DO_ARQUIVO,
    type ClienteDoArquivo, type DadosDoArquivoDoOrcamento, type EmpresaDoArquivo, type FaltaDoArquivo, type ItemDoArquivo,
} from './arquivo-do-orcamento'
import type { ItemRateado } from './rateio-do-orcamento'
import type { AmbienteDaFolha } from './folha-do-levantamento'

export const TABELA_DO_ARQUIVO = 'orcamentista_orcamento_arquivo'
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any
type Linha = Record<string, unknown>

async function ler(onde: string, p: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<unknown> {
    const { data, error } = await p
    if (error) throw new Error(`${onde}: ${error.message ?? 'erro'}`)
    return data
}
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const numero = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

/** TEL. FIXO ou CELULAR, pela forma do número: com o DDD, 11 dígitos e o terceiro 9; sem ele, 9 dígitos começando por 9. O resto é fixo. */
export function tipoDoTelefone(telefone: string): 'celular' | 'fixo' {
    let d = telefone.replace(/\D/g, '')
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
    return (d.length === 11 && d[2] === '9') || (d.length === 9 && d[0] === '9') ? 'celular' : 'fixo'
}

/**
 * As definições de instalação e arremate de um item (4.2): a efetiva de cada variável capturada — a do vendedor ou, sem ela, a da POLÍTICA DA
 * EMPRESA, com "(política da empresa)" (20/11/2026: o padrão do motor nunca é o que se diz que vale; a que ninguém definiu sai como não definida).
 */
export function definicoesDoItem(def: Parameters<typeof escolhasDescritas>[0], escolhas: Parameters<typeof escolhasDescritas>[1], politica: PoliticaDaEmpresa = {}, codigo = ''): string[] {
    const semPadrao = paraOAgente(def)
    const daPolitica: Record<string, number> = {}
    const naoUsa = new Set<string>()
    for (const v of semPadrao.variaveis) {
        if (escolhas[v.variavel] !== undefined) continue
        const t = traduzirPolitica(codigo, v, politica)
        if (t && 'valor' in t) daPolitica[v.variavel] = t.valor
        else if (t && 'semAPeca' in t) naoUsa.add(v.variavel)
    }
    return escolhasDescritas(semPadrao, { ...daPolitica, ...escolhas }).map((e) =>
        `${e.descricao}: ${e.rotulo ?? (naoUsa.has(e.variavel) ? 'não usa' : ARREMATE_NAO_DEFINIDO)}${e.doVendedor ? (daPolitica[e.variavel] !== undefined ? ' (política da empresa)' : '') : naoUsa.has(e.variavel) ? ' (política da empresa)' : ''}`)
}

// ── OS ITENS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const COLUNAS_DO_ITEM = 'id, ordem, levantamento_item_id, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, obs, ambientes, escolhas, calculo_id, custo_liquido_total, tempo_fabricacao_min'

/** Os itens do orçamento como o arquivo (e a faixa da tela) os mostra. A família vem do item do levantamento de origem; o manual não tem. */
/** O que a escolha do desenho precisa de cada item: o mesmo contrato do módulo do catálogo, sem cópia. */
export type ItemParaODesenho = ItemComDesenho
export async function itensDoArquivo(tenantId: string, orcamentoId: string):
    Promise<{ itens: ItemDoArquivo[]; linhas: Linha[]; paraODesenho: ItemParaODesenho[] } | { recusa: string }> {
    const linhas = ((await ler('orcamentista_orcamento_item', db().from('orcamentista_orcamento_item').select(COLUNAS_DO_ITEM)
        // só os itens que VALEM: o removido (a marca `removido_em`, 20261113000002) fica no banco e sai de toda conta e de todo arquivo
        .eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId).is('removido_em', null).order('ordem', { ascending: true }))) ?? []) as Linha[]
    const ids = linhas.map((l) => texto(l.levantamento_item_id)).filter((x): x is string => x !== null)
    const familias = new Map<string, string | null>()
    if (ids.length) {
        const doLev = ((await ler('orcamentista_levantamento_item', db().from('orcamentista_levantamento_item').select('id, familia')
            .eq('tenant_id', tenantId).in('id', ids))) ?? []) as Linha[]
        for (const l of doLev) familias.set(String(l.id), texto(l.familia))
    }
    const [contexto, politica] = await Promise.all([contextoDaFolhaDaEmpresa(tenantId), lerPoliticaDaEmpresa(tenantId)])
    if ('recusa' in contexto) return { recusa: contexto.recusa }
    const paraODesenho: ItemParaODesenho[] = []
    const itens = linhas.map((l): ItemDoArquivo => {
        const familia = familias.get(String(l.levantamento_item_id)) ?? null
        const tipologia = texto(l.tipologia)
        const escolhas = l.escolhas ? lerEscolhasDoItem(l.escolhas) : null
        const base = { escolhas, tipologia, familia } as Parameters<typeof variaveisDitas>[0]
        const variaveis = variaveisDitas(base, contexto.definicao)
        const d = tipologia ? contexto.detalhe(tipologia, familia) : null
        // as definições de instalação e arremate (4.2): a efetiva de cada variável capturada, e "(padrão)" na que o vendedor não disse
        const def = tipologia ? contexto.definicao(base) : null
        const definicoes = def ? definicoesDoItem(def, escolhas ?? {}, politica, tipologia ?? '') : []
        const largura = numero(l.largura_mm)
        const altura = numero(l.altura_mm)
        const ambientes = Array.isArray(l.ambientes) && l.ambientes.length ? linhaDosAmbientes({ ambientes: l.ambientes as AmbienteDaFolha[] }) : null
        // o DESENHO IMPORTADO (16/11/2026): a condição do catálogo fala a língua do motor (N, UT, HI, LT), e os valores
        // são as escolhas gravadas mais o padrão NUMÉRICO da aba Variáveis desta tipologia
        paraODesenho.push({ tipologia: tipologia ?? '', descricao: d?.descricao ?? tipologia, familia, valores: valoresDoDesenho(def, escolhas ?? {}) })
        return {
            ordem: Number(l.ordem), quantidade: Number(l.quantidade), largura_mm: largura, altura_mm: altura, tipologia,
            descricao: d?.descricao ?? tipologia, tipo: d?.tipo ?? null, fornecedor: d?.fornecedor ?? null, linha: d?.linha ?? null,
            ambientes, corPerfil: texto(l.cor_perfil), corAcessorio: tipologia ? texto(corDoAcessorio(base, contexto.definicao)) : null, vidro: texto(l.vidro),
            variaveis: variaveis.map(variavelNaFolha), obs: texto(l.obs), definicoes,
            desenho: largura && altura && largura > 0 && altura > 0 ? desenhoDaTipologia({ descricao: d?.descricao ?? '', largura_mm: largura, altura_mm: altura, variaveis }) : null,
            // a figura e a falta entram em `comOsDesenhos`: a escolha é do catálogo, e é UMA SÓ para os três lugares
            figura: null, semFigura: null,
        }
    })
    return { itens, linhas, paraODesenho }
}

/**
 * OS DESENHOS IMPORTADOS nos itens (dono do produto, 11/11/2026, implementado em 16/11/2026): a figura do catálogo
 * (`orcamentista_tipologia_desenho`) no lugar do esquema de traços gerado por código. Quem não resolve sai SEM FIGURA,
 * com a frase da falta nas observações do item — nunca a figura mais parecida.
 *
 * O item SEM TIPOLOGIA (o manual) não tem desenho de catálogo e não ganha frase: não há tipologia a nomear.
 */
export async function comOsDesenhos(itens: readonly ItemDoArquivo[], paraODesenho: readonly ItemParaODesenho[], catalogo?: CatalogoDeDesenhos): Promise<ItemDoArquivo[]> {
    return comAsFiguras(
        itens,
        paraODesenho.map((x) => (x.tipologia === '' ? null : x)),
        (i, d): ItemDoArquivo => ('imagem' in d ? { ...i, figura: d.imagem, semFigura: null } : { ...i, figura: null, semFigura: d.frase }),
        catalogo,
    )
}

// ── A EMPRESA, O CLIENTE E O VENDEDOR ─────────────────────────────────────────────────────────────────────────────────────────────
/** O logo, lido da URL do cadastro: só PNG ou JPEG, em até 4 s; qualquer falha deixa o lugar em branco (nunca um logo inventado). */
export async function lerLogo(url: string | null): Promise<EmpresaDoArquivo['logo']> {
    if (!url) return null
    const dados = /^data:image\/(png|jpe?g);base64,/i.exec(url)
    if (dados) return { dados: url, formato: dados[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG' }
    if (!/^https:\/\//i.test(url)) return null
    try {
        const controle = new AbortController()
        const prazo = setTimeout(() => controle.abort(), 4000)
        const r = await fetch(url, { signal: controle.signal }).finally(() => clearTimeout(prazo))
        const tipo = (r.headers.get('content-type') ?? '').toLowerCase()
        if (!r.ok || !/image\/(png|jpe?g)/.test(tipo)) return null
        const b64 = Buffer.from(await r.arrayBuffer()).toString('base64')
        const formato = tipo.includes('png') ? 'PNG' : 'JPEG'
        return { dados: `data:image/${formato === 'PNG' ? 'png' : 'jpeg'};base64,${b64}`, formato }
    } catch {
        return null
    }
}

/**
 * A empresa e as OBSERVAÇÕES do arquivo, na mesma leitura (16/11/2026): o bloco "OBSERVAÇÕES" do rodapé imprime o
 * texto fixo da base de conhecimento — prazos, validade, exclusões. Sem a migração 20261116000004 (coluna ausente,
 * 42703/PGRST204), as observações saem NULAS e o bloco sai vazio, como saía antes.
 */
async function lerEmpresa(tenantId: string): Promise<{ empresa: EmpresaDoArquivo; observacoes: string | null; campos: CamposDasObservacoes }> {
    const t = ((await ler('tenants', db().from('tenants').select('name, cnpj_cpf, email, phone, cep, street, number, complement, neighborhood, city, state_code, logo_url')
        .eq('id', tenantId).maybeSingle())) ?? {}) as Linha
    const comObservacoes = await db().from('tenant_settings').select('inscricao_estadual, logo_url, orcamento_observacoes, orcamento_observacoes_campos').eq('tenant_id', tenantId).maybeSingle()
    const semColuna = comObservacoes.error && semMigracao(comObservacoes.error)
    const lido = semColuna
        ? await db().from('tenant_settings').select('inscricao_estadual, logo_url').eq('tenant_id', tenantId).maybeSingle()
        : comObservacoes
    if (lido.error) throw new Error(`tenant_settings: ${lido.error.message ?? 'erro'}`)
    const s = (lido.data ?? {}) as Linha
    const rua = [texto(t.street), texto(t.number)].filter(Boolean).join(', ')
    const endereco = [rua, texto(t.complement), texto(t.neighborhood)].filter(Boolean).join(' - ')
    const cidadeUf = [texto(t.city), texto(t.state_code)].filter(Boolean).join('/')
    return {
        empresa: {
            razaoSocial: texto(t.name) ?? '', endereco: endereco || null, cidadeUf: cidadeUf || null, cep: texto(t.cep), telefone: texto(t.phone), telefone2: null,
            cnpj: texto(t.cnpj_cpf), ie: texto(s.inscricao_estadual), site: null, email: texto(t.email), logo: await lerLogo(texto(s.logo_url) ?? texto(t.logo_url)),
        },
        observacoes: texto(s.orcamento_observacoes),
        // AS VARIÁVEIS do bloco (16/11/2026): o que não passa na leitura NÃO entra — um campo com lixo no banco não
        // imprime linha torta no orçamento do cliente; ele some, e o resto sai
        campos: s.orcamento_observacoes_campos ? lerCamposDasObservacoes(s.orcamento_observacoes_campos).campos : SEM_CAMPOS,
    }
}

async function lerClienteEVendedor(tenantId: string, levantamentoId: string | null, nomeDoOrcamento: string) {
    const vazio: Omit<ClienteDoArquivo, 'nome'> = { telFixo: null, celular: null, email: null, tel2: null, endereco: null, ieRg: null, cep: null, cnpjCpf: null }
    if (!levantamentoId) return { cliente: { nome: nomeDoOrcamento, ...vazio } as ClienteDoArquivo, vendedor: null, emailDoVendedor: null, dataEntrega: null }
    const l = ((await ler('orcamentista_levantamento', db().from('orcamentista_levantamento').select('nome, telefone, email, endereco, data_entrega, vendedor_nome, vendedor_employee_id')
        .eq('tenant_id', tenantId).eq('id', levantamentoId).maybeSingle())) ?? {}) as Linha
    const telefone = texto(l.telefone)
    const tipo = telefone ? tipoDoTelefone(telefone) : null
    let emailDoVendedor: string | null = null
    const funcionario = texto(l.vendedor_employee_id)
    if (funcionario) {
        const e = ((await ler('employees', db().from('employees').select('email').eq('tenant_id', tenantId).eq('id', funcionario).maybeSingle())) ?? {}) as Linha
        emailDoVendedor = texto(e.email)
    }
    return {
        cliente: { ...vazio, nome: texto(l.nome) ?? nomeDoOrcamento, telFixo: tipo === 'fixo' ? telefone : null, celular: tipo === 'celular' ? telefone : null, email: texto(l.email), endereco: texto(l.endereco) },
        vendedor: texto(l.vendedor_nome), emailDoVendedor, dataEntrega: texto(l.data_entrega),
    }
}

/**
 * O CLIENTE do orçamento para o TOPO da tela (dono do produto, 11/11/2026): as credenciais lidas do levantamento de origem, por
 * `levantamento_id`, no tenant do chamador — as mesmas que o PDF imprime. Nulo quando o orçamento não é achado.
 */
export async function lerClienteDoOrcamento(tenantId: string, orcamentoId: string): Promise<ClienteDoArquivo | null> {
    const orc = ((await ler('orcamentista_orcamento', db().from('orcamentista_orcamento').select('nome, levantamento_id').eq('tenant_id', tenantId).eq('id', orcamentoId).maybeSingle())) ?? null) as Linha | null
    if (!orc) return null
    return (await lerClienteEVendedor(tenantId, texto(orc.levantamento_id), String(orc.nome ?? ''))).cliente
}

/** Os dados do arquivo, lidos no tenant do chamador, com a interna, a venda e o rateio que a gravação acabou de conferir. */
export async function lerDadosDoArquivo(tenantId: string, orcamentoId: string, a: { operacaoInterna: number; valorVenda: number; rateio: readonly ItemRateado[]; geradoEm: Date }):
    Promise<{ dados: DadosDoArquivoDoOrcamento; calculoId: string | null } | { recusa: string }> {
    const orc = ((await ler('orcamentista_orcamento', db().from('orcamentista_orcamento').select('numero, nome, levantamento_id').eq('tenant_id', tenantId).eq('id', orcamentoId).maybeSingle())) ?? null) as Linha | null
    if (!orc) return { recusa: 'o orçamento não foi achado' }
    const itens = await itensDoArquivo(tenantId, orcamentoId)
    if ('recusa' in itens) return itens
    const [daEmpresa, cv] = await Promise.all([lerEmpresa(tenantId), lerClienteEVendedor(tenantId, texto(orc.levantamento_id), String(orc.nome ?? ''))])
    const calculos = [...new Set(itens.linhas.map((l) => texto(l.calculo_id)))]
    const faltas = await lerFaltasDoArquivo(tenantId, itens.linhas)
    return {
        calculoId: calculos.length === 1 ? calculos[0] : null,
        dados: {
            empresa: daEmpresa.empresa, numero: Number(orc.numero), vendedor: cv.vendedor, contato: null, emailDoVendedor: cv.emailDoVendedor, cliente: cv.cliente, dataEntrega: cv.dataEntrega,
            itens: await comOsDesenhos(itens.itens, itens.paraODesenho),
            // O BLOCO É MONTADO das variáveis, e o texto livre vai por último (16/11/2026, o modelo 1154). As parcelas
            // do pagamento saem do VALOR DE VENDA deste orçamento, nunca de um valor gravado
            observacoesGerais: linhasDasObservacoes(daEmpresa.campos, { textoLivre: daEmpresa.observacoes }).join('\n') || null,
            condicoesComerciais: linhasDasCondicoesComerciais(daEmpresa.campos, a.valorVenda).join('\n') || null, operacaoInterna: a.operacaoInterna, valorVenda: a.valorVenda, rateio: a.rateio, geradoEm: a.geradoEm,
            faltas,
        },
    }
}

/** Tabela ou coluna ausente (a 20261112000006 pendente): 42P01/PGRST205 e 42703/PGRST204. */
const semMigracao = (e: { code?: string } | null | undefined) => ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(e?.code ?? '')
/** O cálculo VIGENTE de cada item: o `calculo_id` gravado nele. Item sem cálculo não tem falta nem material. */
const vigentes = (linhas: readonly Linha[]) => linhas.flatMap((l) => (texto(l.id) && texto(l.calculo_id) ? [{ id: String(l.id), calculo: String(l.calculo_id), ordem: Number(l.ordem) }] : []))

/** As faltas do cálculo vigente, uma por código, com os itens (pela ordem). Sem a tabela, nenhuma. */
export async function lerFaltasDoArquivo(tenantId: string, linhas: readonly Linha[]): Promise<FaltaDoArquivo[]> {
    const v = vigentes(linhas)
    if (v.length === 0) return []
    const { data, error } = await db().from('orcamentista_orcamento_falta').select('orcamento_item_id, calculo_id, ordem, codigo_do_motor, frase')
        .eq('tenant_id', tenantId).in('orcamento_item_id', v.map((x) => x.id)).order('ordem', { ascending: true })
    if (error && semMigracao(error)) return []
    if (error) throw new Error(`orcamentista_orcamento_falta: ${error.message}`)
    const doItem = new Map(v.map((x) => [x.id, x]))
    const porCodigo = new Map<string, FaltaDoArquivo>()
    for (const f of (data ?? []) as Linha[]) {
        const it = doItem.get(String(f.orcamento_item_id))
        if (!it || String(f.calculo_id) !== it.calculo) continue
        const codigo = String(f.codigo_do_motor)
        const x = porCodigo.get(codigo) ?? { codigo, frase: String(f.frase), itens: [] }
        if (!x.itens.includes(it.ordem)) x.itens.push(it.ordem)
        porCodigo.set(codigo, x)
    }
    return [...porCodigo.values()].map((x) => ({ ...x, itens: [...x.itens].sort((a, b) => a - b) }))
}


export type ArquivoGravado = { id: string; caminho: string; sha256: string; tamanho_bytes: number; paginas: number; nomeDoArquivo: string }

/**
 * GERA o PDF, SOBE o objeto e GRAVA a linha do arquivo. A ordem é a que não deixa linha sem objeto: o objeto primeiro (o caminho é novo a cada
 * geração, então nunca sobrescreve outro), a linha depois. Falha no meio deixa, no pior caso, um objeto sem linha — nunca uma linha apontando
 * para nada. Com autor, `gerado_origem` é 'manual' e o autor é quem salvou; sem autor (a cadeia do "sim"), 'agente' e `gerado_por` nulo (a CHECK
 * `gerado_por_amarrado`).
 */
export async function gerarEGravarArquivo(tenantId: string, orcamentoId: string, autor: string | null, dados: DadosDoArquivoDoOrcamento, calculoId: string | null):
    Promise<{ ok: true; arquivo: ArquivoGravado } | { ok: false; recusas: string[] }> {
    const gerado = gerarArquivoDoOrcamento(dados)
    if ('recusas' in gerado) return { ok: false, recusas: gerado.recusas }
    const id = randomUUID()
    const caminho = `orcamentos/${tenantId}/${orcamentoId}/${id}.pdf`
    const sha256 = createHash('sha256').update(gerado.pdf).digest('hex')
    const { error: eUp } = await supabaseAdmin.storage.from(BUCKET_DO_CATALOGO).upload(caminho, Buffer.from(gerado.pdf), { contentType: 'application/pdf', upsert: false })
    if (eUp) throw new Error(`storage ${BUCKET_DO_CATALOGO}: ${eUp.message}`)
    const linha = {
        id, tenant_id: tenantId, orcamento_id: orcamentoId, calculo_id: calculoId, bucket: BUCKET_DO_CATALOGO, caminho, sha256,
        tamanho_bytes: gerado.pdf.byteLength, valor_venda: dados.valorVenda, gerado_origem: autor ? 'manual' : 'agente', gerado_por: autor, gerado_em: dados.geradoEm.toISOString(),
    }
    // A VERSÃO DO DESENHO (16/11/2026): sem a coluna (a 20261116000005 pendente), a linha é gravada sem ela — a versão
    // fica nula, que lê como "de outra versão", e o arquivo é regerado no próximo pedido. É o lado seguro da falta.
    let { error } = await db().from(TABELA_DO_ARQUIVO).insert({ ...linha, arquivo_versao: VERSAO_DO_ARQUIVO })
    if (error && semMigracao(error) && (error.message ?? '').includes('arquivo_versao')) {
        ;({ error } = await db().from(TABELA_DO_ARQUIVO).insert(linha))
    }
    if (error) throw new Error(`${TABELA_DO_ARQUIVO}: ${error.message}`)
    return { ok: true, arquivo: { id, caminho, sha256, tamanho_bytes: gerado.pdf.byteLength, paginas: gerado.paginas, nomeDoArquivo: gerado.nomeDoArquivo } }
}

/**
 * O último arquivo gerado do orçamento (o mais novo), no tenant do chamador — os bytes, para a tela abrir; nulo quando
 * ainda não há. `versao` é a do DESENHO com que ele foi gerado: nula = de antes de a versão existir, logo de OUTRA
 * versão. Quem reenvia compara com `VERSAO_DO_ARQUIVO` e rege quando difere (16/11/2026).
 */
export async function lerUltimoArquivo(tenantId: string, orcamentoId: string): Promise<{ pdf: Buffer; caminho: string; versao: string | null } | null> {
    const comVersao = await db().from(TABELA_DO_ARQUIVO).select('bucket, caminho, gerado_em, arquivo_versao').eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId)
        .order('gerado_em', { ascending: false }).limit(1)
    const semColuna = comVersao.error && semMigracao(comVersao.error)
    const lido = semColuna
        ? await db().from(TABELA_DO_ARQUIVO).select('bucket, caminho, gerado_em').eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId)
            .order('gerado_em', { ascending: false }).limit(1)
        : comVersao
    if (lido.error) throw new Error(`${TABELA_DO_ARQUIVO}: ${lido.error.message ?? 'erro'}`)
    const a = ((lido.data ?? []) as Linha[])[0]
    if (!a) return null
    const { data, error } = await supabaseAdmin.storage.from(String(a.bucket)).download(String(a.caminho))
    if (error || !data) throw new Error(`storage ${String(a.bucket)}: ${error?.message ?? 'objeto ausente'}`)
    return { pdf: Buffer.from(await data.arrayBuffer()), caminho: String(a.caminho), versao: texto(a.arquivo_versao) }
}
