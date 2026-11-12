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
 *   - OBSERVAÇÕES gerais (prazos, validade, exclusões): NÃO HÁ, hoje, de onde lê-las — o bloco sai vazio;
 *   - as FALTAS (12/11/2026): `orcamentista_orcamento_falta` do cálculo vigente de cada item (sem a migração 20261112000006, nenhuma);
 *   - PARA O VENDEDOR: as barras de cada perfil saem do MATERIAL gravado (Σ bruto do material ÷ bruto da barra — o rateio soma a barra inteira),
 *     o aproveitamento, do consumo e da medida da barra, e os minutos, do item; nada é recalculado aqui.
 */
import { createHash, randomUUID } from 'crypto'
import { supabaseAdmin } from '@/supabase/admin'
import { BUCKET_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'
import { contextoDaFolhaDaEmpresa } from './conversa-da-ia'
import { corDoAcessorio, variaveisDitas } from './arquivo-do-levantamento'
import { desenhoDaTipologia, linhaDosAmbientes, variavelNaFolha } from './folha-do-levantamento'
import { escolhasDescritas, lerEscolhasDoItem } from './escolhas-da-tipologia'
import {
    gerarArquivoDoOrcamento, type ClienteDoArquivo, type DadosDoArquivoDoOrcamento, type EmpresaDoArquivo, type FaltaDoArquivo, type ItemDoArquivo, type ParaOVendedor,
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

/** As definições de instalação e arremate de um item (4.2): a efetiva de cada variável capturada, com "(padrão)" na que o vendedor não disse. */
export function definicoesDoItem(def: Parameters<typeof escolhasDescritas>[0], escolhas: Parameters<typeof escolhasDescritas>[1]): string[] {
    return escolhasDescritas(def, escolhas).map((e) => `${e.descricao}: ${e.rotulo ?? 'padrão da tipologia'}${e.doVendedor ? '' : ' (padrão)'}`)
}

// ── OS ITENS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const COLUNAS_DO_ITEM = 'id, ordem, levantamento_item_id, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, obs, ambientes, escolhas, calculo_id, custo_liquido_total, tempo_fabricacao_min'

/** Os itens do orçamento como o arquivo (e a faixa da tela) os mostra. A família vem do item do levantamento de origem; o manual não tem. */
export async function itensDoArquivo(tenantId: string, orcamentoId: string): Promise<{ itens: ItemDoArquivo[]; linhas: Linha[] } | { recusa: string }> {
    const linhas = ((await ler('orcamentista_orcamento_item', db().from('orcamentista_orcamento_item').select(COLUNAS_DO_ITEM)
        .eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId).order('ordem', { ascending: true }))) ?? []) as Linha[]
    const ids = linhas.map((l) => texto(l.levantamento_item_id)).filter((x): x is string => x !== null)
    const familias = new Map<string, string | null>()
    if (ids.length) {
        const doLev = ((await ler('orcamentista_levantamento_item', db().from('orcamentista_levantamento_item').select('id, familia')
            .eq('tenant_id', tenantId).in('id', ids))) ?? []) as Linha[]
        for (const l of doLev) familias.set(String(l.id), texto(l.familia))
    }
    const contexto = await contextoDaFolhaDaEmpresa(tenantId)
    if ('recusa' in contexto) return { recusa: contexto.recusa }
    const itens = linhas.map((l): ItemDoArquivo => {
        const familia = familias.get(String(l.levantamento_item_id)) ?? null
        const tipologia = texto(l.tipologia)
        const escolhas = l.escolhas ? lerEscolhasDoItem(l.escolhas) : null
        const base = { escolhas, tipologia, familia } as Parameters<typeof variaveisDitas>[0]
        const variaveis = variaveisDitas(base, contexto.definicao)
        const d = tipologia ? contexto.detalhe(tipologia, familia) : null
        // as definições de instalação e arremate (4.2): a efetiva de cada variável capturada, e "(padrão)" na que o vendedor não disse
        const def = tipologia ? contexto.definicao(base) : null
        const definicoes = def ? definicoesDoItem(def, escolhas ?? {}) : []
        const largura = numero(l.largura_mm)
        const altura = numero(l.altura_mm)
        const ambientes = Array.isArray(l.ambientes) && l.ambientes.length ? linhaDosAmbientes({ ambientes: l.ambientes as AmbienteDaFolha[] }) : null
        return {
            ordem: Number(l.ordem), quantidade: Number(l.quantidade), largura_mm: largura, altura_mm: altura, tipologia,
            descricao: d?.descricao ?? tipologia, tipo: d?.tipo ?? null, fornecedor: d?.fornecedor ?? null, linha: d?.linha ?? null,
            ambientes, corPerfil: texto(l.cor_perfil), corAcessorio: tipologia ? texto(corDoAcessorio(base, contexto.definicao)) : null, vidro: texto(l.vidro),
            variaveis: variaveis.map(variavelNaFolha), obs: texto(l.obs), definicoes,
            desenho: largura && altura && largura > 0 && altura > 0 ? desenhoDaTipologia({ descricao: d?.descricao ?? '', largura_mm: largura, altura_mm: altura, variaveis }) : null,
        }
    })
    return { itens, linhas }
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

async function lerEmpresa(tenantId: string): Promise<EmpresaDoArquivo> {
    const t = ((await ler('tenants', db().from('tenants').select('name, cnpj_cpf, email, phone, cep, street, number, complement, neighborhood, city, state_code, logo_url')
        .eq('id', tenantId).maybeSingle())) ?? {}) as Linha
    const s = ((await ler('tenant_settings', db().from('tenant_settings').select('inscricao_estadual, logo_url').eq('tenant_id', tenantId).maybeSingle())) ?? {}) as Linha
    const rua = [texto(t.street), texto(t.number)].filter(Boolean).join(', ')
    const endereco = [rua, texto(t.complement), texto(t.neighborhood)].filter(Boolean).join(' - ')
    const cidadeUf = [texto(t.city), texto(t.state_code)].filter(Boolean).join('/')
    return {
        razaoSocial: texto(t.name) ?? '', endereco: endereco || null, cidadeUf: cidadeUf || null, cep: texto(t.cep), telefone: texto(t.phone), telefone2: null,
        cnpj: texto(t.cnpj_cpf), ie: texto(s.inscricao_estadual), site: null, email: texto(t.email), logo: await lerLogo(texto(s.logo_url) ?? texto(t.logo_url)),
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
    const [empresa, cv] = await Promise.all([lerEmpresa(tenantId), lerClienteEVendedor(tenantId, texto(orc.levantamento_id), String(orc.nome ?? ''))])
    const calculos = [...new Set(itens.linhas.map((l) => texto(l.calculo_id)))]
    const [faltas, paraOVendedor] = await Promise.all([lerFaltasDoArquivo(tenantId, itens.linhas), lerParaOVendedor(tenantId, itens.linhas)])
    return {
        calculoId: calculos.length === 1 ? calculos[0] : null,
        dados: {
            empresa, numero: Number(orc.numero), vendedor: cv.vendedor, contato: null, emailDoVendedor: cv.emailDoVendedor, cliente: cv.cliente, dataEntrega: cv.dataEntrega,
            itens: itens.itens, observacoesGerais: null, operacaoInterna: a.operacaoInterna, valorVenda: a.valorVenda, rateio: a.rateio, geradoEm: a.geradoEm,
            faltas, paraOVendedor,
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

/**
 * O que vai ao vendedor, do MATERIAL gravado no cálculo vigente: por perfil, as barras (Σ bruto do material ÷ bruto da barra — no modo barra
 * inteira, a soma das partes é a barra inteira) e o aproveitamento (o consumo ÷ as barras × a medida). Nulo quando nenhum item tem cálculo.
 */
export async function lerParaOVendedor(tenantId: string, linhas: readonly Linha[]): Promise<ParaOVendedor | null> {
    const v = vigentes(linhas)
    if (v.length === 0) return null
    const ler = (colunas: string) => db().from('orcamentista_orcamento_item_material').select(colunas).eq('tenant_id', tenantId).in('orcamento_item_id', v.map((x) => x.id))
    let r = await ler('orcamento_item_id, calculo_id, codigo, descricao, caminho, medida_unidade, consumo_item, custo_bruto_unidade, custo_bruto_material')
    if (r.error && semMigracao(r.error)) r = await ler('orcamento_item_id, calculo_id, codigo, descricao, medida_unidade, consumo_item, custo_bruto_unidade, custo_bruto_material')
    if (r.error) throw new Error(`orcamentista_orcamento_item_material: ${r.error.message}`)
    const doItem = new Map(v.map((x) => [x.id, x.calculo]))
    const porCodigo = new Map<string, { descricao: string | null; medida: number | null; bruto: number; unidade: number; consumo: number }>()
    for (const m of (r.data ?? []) as Linha[]) {
        if (doItem.get(String(m.orcamento_item_id)) !== String(m.calculo_id)) continue
        if ((texto(m.caminho) ?? 'perfil') !== 'perfil') continue
        const codigo = String(m.codigo)
        const x = porCodigo.get(codigo) ?? { descricao: texto(m.descricao), medida: numero(m.medida_unidade), bruto: 0, unidade: numero(m.custo_bruto_unidade) ?? 0, consumo: 0 }
        x.bruto += numero(m.custo_bruto_material) ?? 0
        x.consumo += numero(m.consumo_item) ?? 0
        porCodigo.set(codigo, x)
    }
    const barras = [...porCodigo.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).flatMap(([codigo, x]) =>
        (x.unidade > 0 ? [{ codigo, descricao: x.descricao, n_barras: Math.round(x.bruto / x.unidade), comprimento_m: x.medida, consumo: x.consumo }] : []))
    const uteis = barras.reduce((t, b) => t + b.consumo, 0)
    const comprados = barras.reduce((t, b) => t + b.n_barras * (b.comprimento_m ?? 0), 0)
    return {
        barras: barras.map(({ consumo: _c, ...b }) => { void _c; return b }),
        aproveitamento: comprados > 0 ? { pct: (uteis / comprados) * 100, metros_uteis: uteis, metros_comprados: comprados } : null,
        minutos: linhas.map((l) => ({ ordem: Number(l.ordem), minutos: numero(l.tempo_fabricacao_min) })),
    }
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
    const { error } = await db().from(TABELA_DO_ARQUIVO).insert({
        id, tenant_id: tenantId, orcamento_id: orcamentoId, calculo_id: calculoId, bucket: BUCKET_DO_CATALOGO, caminho, sha256,
        tamanho_bytes: gerado.pdf.byteLength, valor_venda: dados.valorVenda, gerado_origem: autor ? 'manual' : 'agente', gerado_por: autor, gerado_em: dados.geradoEm.toISOString(),
    })
    if (error) throw new Error(`${TABELA_DO_ARQUIVO}: ${error.message}`)
    return { ok: true, arquivo: { id, caminho, sha256, tamanho_bytes: gerado.pdf.byteLength, paginas: gerado.paginas, nomeDoArquivo: gerado.nomeDoArquivo } }
}

/** O último arquivo gerado do orçamento (o mais novo), no tenant do chamador — os bytes, para a tela abrir; nulo quando ainda não há. */
export async function lerUltimoArquivo(tenantId: string, orcamentoId: string): Promise<{ pdf: Buffer; caminho: string } | null> {
    const linhas = ((await ler(TABELA_DO_ARQUIVO, db().from(TABELA_DO_ARQUIVO).select('bucket, caminho, gerado_em').eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId)
        .order('gerado_em', { ascending: false }).limit(1))) ?? []) as Linha[]
    const a = linhas[0]
    if (!a) return null
    const { data, error } = await supabaseAdmin.storage.from(String(a.bucket)).download(String(a.caminho))
    if (error || !data) throw new Error(`storage ${String(a.bucket)}: ${error?.message ?? 'objeto ausente'}`)
    return { pdf: Buffer.from(await data.arrayBuffer()), caminho: String(a.caminho) }
}
