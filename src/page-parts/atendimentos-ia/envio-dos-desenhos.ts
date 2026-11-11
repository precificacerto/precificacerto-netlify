/**
 * O ENVIO DOS DESENHOS, no navegador (dono do produto, 11/11/2026: "a página descompacta, pula o indice.csv e manda imagem por imagem com
 * URL assinada, em lotes"). Ver `src/lib/atendimentos-ia/desenhos-das-tipologias.ts` para as regras e
 * `src/pages/api/super-admin/atendimentos-ia/desenhos/url-de-envio.ts` para a assinatura.
 *
 * Um lote cuja assinatura falha não para o envio: os arquivos dele vão para as FALHAS, com o motivo, e o próximo lote segue. Ao fim,
 * tudo o que não subiu está nomeado. Rodar de novo tenta só o que falta (a rota devolve o que já existe como `existentes`).
 */
import JSZip from 'jszip'
import { ROTAS_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import {
    desenhosDoZip, emLotes, tipoDaImagem, type EntradaDoZip, type Recusa, type ResultadoDoEnvio,
} from '@/lib/atendimentos-ia/desenhos-das-tipologias'

export type LoteAssinado = { existentes: string[]; assinados: Array<{ arquivo: string; path: string; signedUrl: string }>; recusados: Recusa[] }
export type ZipLido = { entradas: EntradaDoZip[]; bytes: (caminhoNoZip: string) => Promise<Uint8Array> }

/** O que o envio usa de fora — trocado no teste. */
export type DependenciasDoEnvio = {
    lerZip: (zip: Blob) => Promise<ZipLido>
    assinarLote: (grupo: string, arquivos: string[]) => Promise<LoteAssinado>
    /** manda UM arquivo para a URL assinada; devolve o status e o corpo da resposta (para reconhecer o "já existe") */
    enviar: (signedUrl: string, conteudo: Blob) => Promise<{ ok: boolean; status: number; corpo: string }>
}

/** A resposta do Storage para o objeto que já existe (sem sobrescrita): outro envio o pôs ali entre a lista e o envio. */
const JA_EXISTE = /duplicate|already exists/i

export async function enviarDesenhosDoZip(zip: Blob, grupo: string, deps: DependenciasDoEnvio = DEPENDENCIAS_REAIS,
    aoAvancar?: (feitos: number, total: number) => void): Promise<ResultadoDoEnvio> {
    const lido = await deps.lerZip(zip)
    const { desenhos, ignorados, recusados } = desenhosDoZip(lido.entradas, grupo)
    const r: ResultadoDoEnvio = { grupo, enviados: [], jaExistiam: [], falhas: [], recusados: [...recusados], ignorados }
    const noZip = new Map(desenhos.map((d) => [d.arquivo, d.caminhoNoZip]))
    let feitos = 0
    for (const lote of emLotes(desenhos.map((d) => d.arquivo))) {
        let assinado: LoteAssinado
        try {
            assinado = await deps.assinarLote(grupo, lote)
        } catch (e) {
            for (const arquivo of lote) r.falhas.push({ arquivo, motivo: `a assinatura do lote falhou: ${(e as Error).message}` })
            feitos += lote.length
            aoAvancar?.(feitos, desenhos.length)
            continue
        }
        r.jaExistiam.push(...assinado.existentes)
        r.recusados.push(...assinado.recusados)
        // o que a rota não devolveu em lista nenhuma também é nomeado: nunca some
        const respondidos = new Set([...assinado.existentes, ...assinado.recusados.map((x) => x.arquivo), ...assinado.assinados.map((x) => x.arquivo)])
        for (const arquivo of lote) if (!respondidos.has(arquivo)) r.falhas.push({ arquivo, motivo: 'a rota não respondeu sobre este arquivo' })
        for (const a of assinado.assinados) {
            try {
                const bytes = await lido.bytes(noZip.get(a.arquivo) ?? a.arquivo)
                const res = await deps.enviar(a.signedUrl, new Blob([bytes as BlobPart], { type: tipoDaImagem(a.arquivo) ?? 'application/octet-stream' }))
                if (res.ok) r.enviados.push(a.arquivo)
                else if (JA_EXISTE.test(res.corpo)) r.jaExistiam.push(a.arquivo)
                else r.falhas.push({ arquivo: a.arquivo, motivo: `o envio falhou (${res.status})` })
            } catch (e) {
                r.falhas.push({ arquivo: a.arquivo, motivo: `o envio falhou: ${(e as Error).message}` })
            }
        }
        feitos += lote.length
        aoAvancar?.(feitos, desenhos.length)
    }
    return r
}

export const DEPENDENCIAS_REAIS: DependenciasDoEnvio = {
    async lerZip(zip) {
        const z = await JSZip.loadAsync(zip)
        const entradas: EntradaDoZip[] = []
        z.forEach((caminho, f) => { entradas.push({ caminho, pasta: f.dir }) })
        return { entradas, bytes: async (caminho) => {
            const f = z.file(caminho)
            if (!f) throw new Error(`"${caminho}" não está no zip`)
            return f.async('uint8array')
        } }
    },
    assinarLote: (grupo, arquivos) => chamarRota<LoteAssinado>(ROTAS_DO_CATALOGO.envioDeDesenhos, 'POST', { grupo, arquivos }),
    async enviar(signedUrl, conteudo) {
        // o mesmo formato de `enviarArquivo` (api.ts): sem o cliente do Supabase, sem sobrescrita
        const corpo = new FormData()
        corpo.append('cacheControl', '3600')
        corpo.append('', conteudo)
        const res = await fetch(signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: corpo })
        let texto = ''
        try { texto = await res.text() } catch { texto = '' }
        return { ok: res.ok, status: res.status, corpo: texto }
    },
}
