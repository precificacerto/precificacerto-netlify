/**
 * OS DESENHOS DAS TIPOLOGIAS NO STORAGE (dono do produto, 11/11/2026): os desenhos do WVetro chegam em zips; a PÁGINA descompacta no
 * navegador, pula o `indice.csv` de dentro e manda imagem por imagem, cada uma com uma URL assinada pela rota, em lotes. Nenhum objeto de
 * 60 MB chega a existir e nenhuma função carrega o zip.
 *
 * O caminho é `tipologias/<grupo>/<arquivo>`, nunca uma pasta só: 13 nomes COLIDEM entre zips (os mesmos ESQ_*.jpg em Alumínio e em Portas
 * revestidas — medição do dono do produto).
 *
 * AS TRÊS EXIGÊNCIAS:
 *   - LOTE COM RETOMADA: o que já está no bucket não sobe de novo — rodar outra vez continua de onde parou;
 *   - O QUE FALHOU É NOMEADO AO FIM, arquivo a arquivo, com o motivo — nunca pulado em silêncio. O que se ignora de propósito (o índice,
 *     pastas, lixo do sistema) também sai nomeado, em outra lista;
 *   - RODAR DUAS VEZES NÃO DUPLICA NEM APAGA: o envio é sem sobrescrita (`x-upsert: false`), e nada aqui apaga objeto.
 *
 * Este arquivo é PURO (a tela e a rota o usam): nada de rede nem de Storage.
 */

/** A pasta raiz dos desenhos no bucket do catálogo. */
export const PASTA_DOS_DESENHOS = 'tipologias'
/** Quantos arquivos a rota assina por chamada. */
export const TAMANHO_DO_LOTE = 25

/** O índice que vem DENTRO de cada zip: não sobe (o índice canônico é o CSV do repositório). */
const INDICE_DO_ZIP = /^indice\.csv$/i
/** Lixo de sistema que não é desenho e não se confunde com um. */
const LIXO_DO_SISTEMA = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i

const TIPO_DA_IMAGEM: Readonly<Record<string, string>> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
}
/** O tipo do conteúdo pela extensão, ou null quando o arquivo não é uma imagem que se aceita. */
export function tipoDaImagem(nome: string): string | null {
    const ext = /\.([a-z0-9]+)$/i.exec(nome)?.[1]?.toLowerCase()
    return ext ? TIPO_DA_IMAGEM[ext] ?? null : null
}

/**
 * O nome do arquivo NO BUCKET é o nome do arquivo no zip, sem mudar uma letra: o casamento com o índice (sem extensão, sem o prefixo
 * 00001__, sem caixa) é feito na importação do CSV, e renomear aqui o quebraria. Por isso o nome que o Storage não aceita com segurança
 * (fora de letras ASCII, dígitos, ponto, hífen, sublinhado, espaço e parênteses) é RECUSADO e nomeado — nunca reescrito.
 */
const NOME_ACEITO = /^[A-Za-z0-9._\- ()]+$/
/** O grupo no caminho: letras minúsculas sem acento, dígitos e hífen. */
const GRUPO_ACEITO = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** "Portas revestidas" → "portas-revestidas"; "Alumínio" → "aluminio". */
export function grupoNoCaminho(grupo: string): string {
    return grupo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export type Recusa = { arquivo: string; motivo: string }

/** O caminho de UM desenho no bucket, ou a recusa nomeada. */
export function caminhoDoDesenho(grupo: string, arquivo: string): { caminho: string } | { recusa: string } {
    if (!GRUPO_ACEITO.test(grupo)) return { recusa: `o grupo "${grupo}" não é um nome de pasta aceito (letras minúsculas sem acento, dígitos e hífen)` }
    // sem barra (o NOME_ACEITO não a aceita), o ".." no meio do nome não sai da pasta: "ESQ_386..jpg" existe no índice real e sobe
    if (!NOME_ACEITO.test(arquivo) || arquivo.startsWith('.')) {
        return { recusa: 'o nome tem caractere que o bucket não aceita com segurança (só letras sem acento, dígitos, ponto, hífen, sublinhado, espaço e parênteses)' }
    }
    if (tipoDaImagem(arquivo) === null) return { recusa: 'não é uma imagem (jpg, jpeg, jfif, png, gif, bmp ou webp)' }
    return { caminho: `${PASTA_DOS_DESENHOS}/${grupo}/${arquivo}` }
}

/** Uma entrada do zip como a biblioteca a entrega: o caminho dentro do zip e se é pasta. */
export type EntradaDoZip = { caminho: string; pasta: boolean }
/** Um desenho a subir: a pasta do grupo (já em forma de caminho), o nome no bucket e de onde ele sai no zip. */
export type DesenhoDoZip = { grupo: string; arquivo: string; caminhoNoZip: string }

// ── O ÍNDICE CANÔNICO (o CSV do dono do produto) ─────────────────────────────────────────────────────────────────────────────────
/** As colunas do índice, como o CSV as nomeia (medido em 11/11/2026, sha256 8c68a6d5…). */
export const COLUNAS_DO_INDICE = ['fonte', 'grupo', 'codigo', 'codigo_dp', 'descricao', 'liberado', 'condicao', 'arquivo_indice', 'zip', 'caminho_no_zip', 'url_wvetro'] as const
export type LinhaDoIndice = Record<(typeof COLUNAS_DO_INDICE)[number], string>

/** CSV (RFC 4180): vírgula, aspas dobradas dentro de campo entre aspas, CRLF ou LF. Campo entre aspas com quebra de linha também é lido. */
export function lerCsv(texto: string): string[][] {
    const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
    const linhas: string[][] = []
    let campo = ''
    let linha: string[] = []
    let aspas = false
    for (let i = 0; i < t.length; i++) {
        const ch = t[i]
        if (aspas) {
            if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++ }
            else if (ch === '"') aspas = false
            else campo += ch
        } else if (ch === '"' && campo === '') aspas = true
        else if (ch === ',') { linha.push(campo); campo = '' }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && t[i + 1] === '\n') i++
            linha.push(campo); campo = ''
            linhas.push(linha); linha = []
        } else campo += ch
    }
    if (campo !== '' || linha.length > 0) { linha.push(campo); linhas.push(linha) }
    return linhas
}

/** O índice lido: as linhas com as colunas pelo NOME, ou a recusa nomeando a coluna que falta ou a linha com outro número de campos. */
export function lerIndice(texto: string): { linhas: LinhaDoIndice[] } | { erro: string } {
    const [cabecalho, ...resto] = lerCsv(texto)
    if (!cabecalho) return { erro: 'o índice está vazio.' }
    const faltam = COLUNAS_DO_INDICE.filter((c) => !cabecalho.includes(c))
    if (faltam.length) return { erro: `o índice não tem a(s) coluna(s): ${faltam.join(', ')}.` }
    const linhas: LinhaDoIndice[] = []
    for (const [k, campos] of resto.entries()) {
        if (campos.length === 1 && campos[0] === '') continue
        if (campos.length !== cabecalho.length) return { erro: `a linha ${k + 2} do índice tem ${campos.length} campos; o cabeçalho tem ${cabecalho.length}.` }
        linhas.push(Object.fromEntries(COLUNAS_DO_INDICE.map((c) => [c, campos[cabecalho.indexOf(c)]])) as LinhaDoIndice)
    }
    return { linhas }
}

/**
 * O código DP normalizado: caixa alta, sem espaço, sem os zeros à esquerda do número ("dp-017" → "DP-17"). O código CRU fica guardado ao
 * lado, sempre: normalizar não é fundir (dono do produto, 11/11/2026: "Fundir agora apagaria a prova de qual veio de onde").
 */
export function codigoDpNormalizado(codigo: string): string | null {
    const c = codigo.trim().toUpperCase().replace(/\s+/g, '')
    if (c === '') return null
    return c.replace(/^DP-0*(\d)/, 'DP-$1')
}

/** As COLISÕES: códigos crus diferentes que caem no mesmo código normalizado ("DP-017 e DP-17 caem no mesmo código normalizado"). */
export function colisoesDoCodigo(codigos: readonly string[]): Array<{ normalizado: string; crus: string[]; frase: string }> {
    const por = new Map<string, Set<string>>()
    for (const c of codigos) {
        const n = codigoDpNormalizado(c)
        if (n !== null) por.set(n, new Set([...(por.get(n) ?? []), c.trim()]))
    }
    return [...por].filter(([, crus]) => crus.size > 1).map(([normalizado, crus]) => {
        const lista = [...crus].sort()
        return { normalizado, crus: lista, frase: `${lista.join(' e ')} caem no mesmo código normalizado (${normalizado})` }
    })
}

/**
 * O PLANO DE UM ZIP (dono do produto, 11/11/2026): a pasta de cada arquivo sai da coluna GRUPO do índice, nunca do nome do zip — 15 linhas do
 * Desenhos_Aluminio.zip são do grupo "Portas revestidas (ACM/lambri)", e 12 arquivos desse zip estão nos dois grupos (sobem para as duas pastas).
 * Fica de fora, NOMEADO: as pastas, o `indice.csv` de dentro, o lixo de sistema (ignorados); o arquivo que o índice não cita, o que não é
 * imagem ou tem nome que o bucket não aceita, e o nome que cairia duas vezes na mesma pasta (recusados); e a linha do índice que cita um
 * arquivo que o zip não tem (faltamNoZip).
 */
export function planoDoZip(entradas: readonly EntradaDoZip[], indice: readonly LinhaDoIndice[], nomeDoZip: string):
    { desenhos: DesenhoDoZip[]; ignorados: Recusa[]; recusados: Recusa[]; faltamNoZip: Recusa[] } | { erro: string } {
    const doZip = indice.filter((l) => l.zip === nomeDoZip && l.caminho_no_zip.trim() !== '')
    if (doZip.length === 0) return { erro: `o índice não cita o zip "${nomeDoZip}" (a coluna zip tem de ter o nome do arquivo, exato).` }
    const gruposDoCaminho = new Map<string, Set<string>>()
    for (const l of doZip) gruposDoCaminho.set(l.caminho_no_zip, new Set([...(gruposDoCaminho.get(l.caminho_no_zip) ?? []), l.grupo]))
    // ENTRE ZIPS: dois zips mandam para a mesma pasta (Desenhos_PVC e Desenhos_PVC_DP_fotos_por_variavel → tipologias/pvc). Um nome que o
    // índice dá a arquivos de zips diferentes na mesma pasta não sobe: o segundo apareceria como "já existia" sendo OUTRO desenho
    const deOutroZip = new Map<string, string>()
    for (const l of indice) {
        if (l.zip === nomeDoZip || l.caminho_no_zip.trim() === '') continue
        deOutroZip.set(`${grupoNoCaminho(l.grupo)}/${l.caminho_no_zip.split('/').pop()}`, l.zip)
    }

    const ignorados: Recusa[] = []
    const recusados: Recusa[] = []
    const noZip = new Set<string>()
    const naPasta = new Map<string, DesenhoDoZip[]>()
    for (const e of entradas) {
        if (e.pasta) continue
        noZip.add(e.caminho)
        if (LIXO_DO_SISTEMA.test(e.caminho)) { ignorados.push({ arquivo: e.caminho, motivo: 'arquivo de sistema, não é desenho' }); continue }
        const arquivo = e.caminho.split('/').pop() ?? e.caminho
        if (INDICE_DO_ZIP.test(arquivo)) { ignorados.push({ arquivo: e.caminho, motivo: 'o índice de dentro do zip não sobe' }); continue }
        const grupos = gruposDoCaminho.get(e.caminho)
        if (!grupos) { recusados.push({ arquivo: e.caminho, motivo: 'o índice não cita este arquivo: sem grupo, não sobe' }); continue }
        for (const g of [...grupos].sort()) {
            const grupo = grupoNoCaminho(g)
            const c = caminhoDoDesenho(grupo, arquivo)
            if ('recusa' in c) { recusados.push({ arquivo: e.caminho, motivo: `grupo "${g}": ${c.recusa}` }); continue }
            const chave = `${grupo}/${arquivo}`
            const outro = deOutroZip.get(chave)
            if (outro !== undefined) { recusados.push({ arquivo: e.caminho, motivo: `o índice também põe um arquivo do zip "${outro}" em tipologias/${chave}; nenhum dos dois sobe por este zip` }); continue }
            naPasta.set(chave, [...(naPasta.get(chave) ?? []), { grupo, arquivo, caminhoNoZip: e.caminho }])
        }
    }
    const desenhos: DesenhoDoZip[] = []
    for (const [chave, lista] of naPasta) {
        if (lista.length === 1) desenhos.push(lista[0])
        else for (const d of lista) recusados.push({ arquivo: d.caminhoNoZip, motivo: `${lista.length} arquivos do zip cairiam em tipologias/${chave}; nenhum sobe` })
    }
    desenhos.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.arquivo.localeCompare(b.arquivo))
    const faltamNoZip = [...gruposDoCaminho.keys()].filter((c) => !noZip.has(c)).sort().map((c) => ({ arquivo: c, motivo: 'o índice cita e o zip não tem' }))
    return { desenhos, ignorados, recusados, faltamNoZip }
}

/** A lista em lotes do tamanho dado, na ordem. */
export function emLotes<T>(lista: readonly T[], tamanho = TAMANHO_DO_LOTE): T[][] {
    const lotes: T[][] = []
    for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho))
    return lotes
}

/** O pedido de assinatura de um lote, conferido: o grupo e de 1 a TAMANHO_DO_LOTE nomes, sem repetição. */
export function lerPedidoDoLote(corpo: unknown): { grupo: string; arquivos: string[] } | { erro: string } {
    const c = (corpo ?? {}) as { grupo?: unknown; arquivos?: unknown }
    if (typeof c.grupo !== 'string' || !GRUPO_ACEITO.test(c.grupo)) return { erro: 'grupo: obrigatório, letras minúsculas sem acento, dígitos e hífen.' }
    if (!Array.isArray(c.arquivos) || c.arquivos.length === 0 || c.arquivos.length > TAMANHO_DO_LOTE) {
        return { erro: `arquivos: de 1 a ${TAMANHO_DO_LOTE} nomes por lote.` }
    }
    if (!c.arquivos.every((a): a is string => typeof a === 'string')) return { erro: 'arquivos: só nomes de arquivo (texto).' }
    if (new Set(c.arquivos).size !== c.arquivos.length) return { erro: 'arquivos: nome repetido no mesmo lote.' }
    return { grupo: c.grupo, arquivos: c.arquivos }
}

/** O resultado do envio de UM zip, como a tela mostra ao fim. Os nomes são "grupo/arquivo": o mesmo arquivo pode ir para dois grupos. */
export type ResultadoDoEnvio = {
    zip: string
    enviados: string[]
    /** já estavam no bucket (de uma rodada anterior): não subiram de novo e não foram tocados */
    jaExistiam: string[]
    /** o que falhou, arquivo a arquivo, com o motivo — rodar de novo tenta só estes */
    falhas: Recusa[]
    /** recusados antes de subir (nome, tipo, nome repetido no zip) */
    recusados: Recusa[]
    /** deixados de fora de propósito (o índice, o lixo de sistema) */
    ignorados: Recusa[]
    /** citados pelo índice e ausentes do zip */
    faltamNoZip: Recusa[]
}

/** O resumo de uma linha, sem esconder nada: os números de cada lista. */
export const resumoDoEnvio = (r: ResultadoDoEnvio) =>
    `${r.zip}: ${r.enviados.length} enviados, ${r.jaExistiam.length} já existiam, ${r.falhas.length} falharam, `
    + `${r.recusados.length} recusados, ${r.ignorados.length} ignorados, ${r.faltamNoZip.length} citados no índice e ausentes do zip.`

// ── A IMPORTAÇÃO DO ÍNDICE (a função superadmin_importar_desenhos, migração 20261111000001) ───────────────────────────────────────
/** Uma linha como a função a recebe: as 8 colunas, vazio NULO (o cabeçalho da migração: "nunca zero, nunca ''"). */
export type LinhaParaImportar = {
    fonte: string | null; grupo: string | null; codigo: string | null; codigo_dp: string | null; descricao: string | null
    liberado_para_venda: boolean | null; condicao: string | null; caminho_no_storage: string | null
}
const nuloSeVazio = (v: string): string | null => (v === '' ? null : v)
const LIBERADO: Readonly<Record<string, boolean>> = { Sim: true, 'Não': false }

/**
 * As linhas do índice no formato da importação. O CAMINHO no Storage sai de `caminhoDoDesenho` — A MESMA função do envio dos zips (o slug
 * do grupo é `grupoNoCaminho`, num lugar só): se os dois calculassem o slug cada um à sua maneira, os dois passariam na CHECK da forma e o
 * PDF ficaria sem desenho, em silêncio (dono do produto, 11/11/2026). O código CRU vai como veio; o codigo_dp vai normalizado, ao lado.
 * Recusa a importação INTEIRA (nunca uma linha pulada), nomeando cada linha: fonte fora das duas, liberado fora de Sim/Não/vazio, código DP
 * que não normaliza, caminho que o bucket não aceita. Devolve também, NOMEADAS, as linhas sem arquivo nos zips e as colisões de código.
 */
export function linhasParaImportar(indice: readonly LinhaDoIndice[]):
    { linhas: LinhaParaImportar[]; semArquivo: string[]; colisoes: string[] } | { recusas: string[] } {
    const recusas: string[] = []
    const semArquivo: string[] = []
    const linhas: LinhaParaImportar[] = []
    indice.forEach((l, k) => {
        const n = k + 2 // a linha no CSV (o cabeçalho é a 1)
        if (l.fonte !== 'principal' && l.fonte !== 'por_variavel') recusas.push(`linha ${n}: fonte "${l.fonte}" não é principal nem por_variavel`)
        let liberado: boolean | null = null
        if (l.liberado !== '') {
            if (!(l.liberado in LIBERADO)) recusas.push(`linha ${n}: liberado "${l.liberado}" não é Sim, Não nem vazio`)
            else liberado = LIBERADO[l.liberado]
        }
        let codigoDp: string | null = null
        if (l.codigo_dp !== '') {
            codigoDp = codigoDpNormalizado(l.codigo_dp)
            if (codigoDp === null || !/^DP-[1-9][0-9]*$/.test(codigoDp)) recusas.push(`linha ${n}: codigo_dp "${l.codigo_dp}" não é um código DP`)
        }
        let caminho: string | null = null
        if (l.caminho_no_zip.trim() === '') semArquivo.push(`linha ${n}: ${l.codigo}${l.condicao ? ` ${l.condicao}` : ''} (${l.arquivo_indice || 'sem arquivo no índice'})`)
        else {
            const c = caminhoDoDesenho(grupoNoCaminho(l.grupo), l.caminho_no_zip.split('/').pop() ?? '')
            if ('recusa' in c) recusas.push(`linha ${n}: ${c.recusa}`)
            else caminho = c.caminho
        }
        linhas.push({
            fonte: nuloSeVazio(l.fonte), grupo: nuloSeVazio(l.grupo), codigo: nuloSeVazio(l.codigo), codigo_dp: codigoDp,
            descricao: nuloSeVazio(l.descricao), liberado_para_venda: liberado, condicao: nuloSeVazio(l.condicao), caminho_no_storage: caminho,
        })
    })
    if (recusas.length) return { recusas }
    const colisoes = colisoesDoCodigo(indice.map((l) => l.codigo)).map((c) => c.frase)
    return { linhas, semArquivo, colisoes }
}

// ── A CONFERÊNCIA DEPOIS DA IMPORTAÇÃO: a prova de que o slug casou ────────────────────────────────────────────────────────────
/**
 * Os dois lados, NOMEADOS (dono do produto, 11/11/2026): os caminhos que a tabela aponta e o bucket não tem, e os objetos do bucket que
 * nenhuma linha aponta. Zero dos dois: o slug casou de fato. Qualquer um: aparece antes de o cliente receber PDF sem desenho.
 */
export function conferirDesenhos(caminhosDaTabela: Iterable<string>, objetosDoBucket: Iterable<string>):
    { semObjeto: string[]; semLinha: string[]; caminhos: number; objetos: number } {
    const tabela = new Set(caminhosDaTabela)
    const bucket = new Set(objetosDoBucket)
    return {
        semObjeto: [...tabela].filter((c) => !bucket.has(c)).sort(),
        semLinha: [...bucket].filter((o) => !tabela.has(o)).sort(),
        caminhos: tabela.size, objetos: bucket.size,
    }
}

/** A migração do índice ainda não aplicada: a importação e a conferência dizem isso, nunca 500. */
export const FRASE_SEM_A_MIGRACAO = 'A tabela do índice dos desenhos ainda não existe no banco: a migração 20261111000001 não está aplicada.'
