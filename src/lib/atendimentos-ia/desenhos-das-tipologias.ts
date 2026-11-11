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
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
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
    if (!NOME_ACEITO.test(arquivo) || arquivo.startsWith('.') || arquivo.includes('..')) {
        return { recusa: 'o nome tem caractere que o bucket não aceita com segurança (só letras sem acento, dígitos, ponto, hífen, sublinhado, espaço e parênteses)' }
    }
    if (tipoDaImagem(arquivo) === null) return { recusa: 'não é uma imagem (jpg, jpeg, png, gif, bmp ou webp)' }
    return { caminho: `${PASTA_DOS_DESENHOS}/${grupo}/${arquivo}` }
}

/** Uma entrada do zip como a biblioteca a entrega: o caminho dentro do zip e se é pasta. */
export type EntradaDoZip = { caminho: string; pasta: boolean }
export type DesenhoDoZip = { arquivo: string; caminhoNoZip: string }

/**
 * O que do zip sobe, e o que fica de fora, NOMEADO. Fica de fora: as pastas, o `indice.csv` (em qualquer pasta do zip), o lixo de sistema,
 * o que não é imagem ou tem nome que o bucket não aceita, e — nos dois lados — o nome que aparece em DUAS pastas do mesmo zip: os dois iriam
 * para o mesmo caminho, e escolher um seria decidir em silêncio.
 */
export function desenhosDoZip(entradas: readonly EntradaDoZip[], grupo: string): { desenhos: DesenhoDoZip[]; ignorados: Recusa[]; recusados: Recusa[] } {
    const ignorados: Recusa[] = []
    const recusados: Recusa[] = []
    const porNome = new Map<string, string[]>()
    for (const e of entradas) {
        if (e.pasta) continue
        if (LIXO_DO_SISTEMA.test(e.caminho)) { ignorados.push({ arquivo: e.caminho, motivo: 'arquivo de sistema, não é desenho' }); continue }
        const arquivo = e.caminho.split('/').pop() ?? e.caminho
        if (INDICE_DO_ZIP.test(arquivo)) { ignorados.push({ arquivo: e.caminho, motivo: 'o índice de dentro do zip não sobe' }); continue }
        const c = caminhoDoDesenho(grupo, arquivo)
        if ('recusa' in c) { recusados.push({ arquivo: e.caminho, motivo: c.recusa }); continue }
        porNome.set(arquivo, [...(porNome.get(arquivo) ?? []), e.caminho])
    }
    const desenhos: DesenhoDoZip[] = []
    for (const [arquivo, caminhos] of porNome) {
        if (caminhos.length === 1) desenhos.push({ arquivo, caminhoNoZip: caminhos[0] })
        else for (const c of caminhos) recusados.push({ arquivo: c, motivo: `o nome "${arquivo}" aparece em ${caminhos.length} pastas deste zip; nenhum dos dois sobe` })
    }
    desenhos.sort((a, b) => a.arquivo.localeCompare(b.arquivo))
    return { desenhos, ignorados, recusados }
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

/** O resultado de um envio inteiro, como a tela mostra ao fim. */
export type ResultadoDoEnvio = {
    grupo: string
    enviados: string[]
    /** já estavam no bucket (de uma rodada anterior): não subiram de novo e não foram tocados */
    jaExistiam: string[]
    /** o que falhou, arquivo a arquivo, com o motivo — rodar de novo tenta só estes */
    falhas: Recusa[]
    /** recusados antes de subir (nome, tipo, nome repetido no zip) */
    recusados: Recusa[]
    /** deixados de fora de propósito (o índice, o lixo de sistema) */
    ignorados: Recusa[]
}

/** O resumo de uma linha, sem esconder nada: os números de cada lista. */
export const resumoDoEnvio = (r: ResultadoDoEnvio) =>
    `Grupo ${r.grupo}: ${r.enviados.length} enviados, ${r.jaExistiam.length} já existiam, ${r.falhas.length} falharam, `
    + `${r.recusados.length} recusados, ${r.ignorados.length} ignorados.`
