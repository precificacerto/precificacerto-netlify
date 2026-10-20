/**
 * Atendimentos I.A. — o que a TELA chama. Só `fetch` para as rotas de `ROTAS_DO_CATALOGO`; NUNCA
 * o cliente do Supabase: as quatro tabelas não dão privilégio nenhum ao navegador, e a lista
 * chegaria vazia em vez de dar erro (portão `atendimentos-ia-a-tela-nao-fala-com-o-banco.test.ts`).
 *
 * O ARQUIVO vai em dois passos (`enviarArquivo`): a rota assina o envio para um caminho que ELA
 * escolhe, e o navegador manda os bytes para essa URL. Ver o cabeçalho de
 * `src/pages/api/super-admin/atendimentos-ia/tabelas/url-de-envio.ts`.
 */
import { ROTAS_DO_CATALOGO, fraseDaTabela, fraseDoArquivo, type TipoDeArquivo } from '@/utils/atendimentos-ia-catalogo'

export class ErroDaRota extends Error {
    status: number
    constructor(status: number, mensagem: string) { super(mensagem); this.status = status }
}

/** Chama a rota e devolve o JSON; resposta não-OK vira `ErroDaRota` com a frase da rota. */
export async function chamarRota<T>(url: string, metodo = 'GET', corpo?: unknown): Promise<T> {
    const res = await fetch(url, {
        method: metodo,
        headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    let json: unknown = null
    try { json = await res.json() } catch { json = null }
    if (!res.ok) throw new ErroDaRota(res.status, (json as { error?: string } | null)?.error ?? `Erro ${res.status}`)
    return json as T
}

export interface ArquivoEnviado { path: string; nome: string }

/**
 * Pede à rota a URL assinada e manda o arquivo para ela. Devolve o caminho no bucket e o nome original.
 * Toda falha sai com o NOME do arquivo (`fraseDoArquivo`): com dois arquivos no modal, um motivo
 * sem nome não diz qual dos dois foi recusado.
 */
export async function enviarArquivo(fornecedorId: string, tipo: TipoDeArquivo, arquivo: File): Promise<ArquivoEnviado> {
    let assinado: { path: string; signedUrl: string }
    try {
        assinado = await chamarRota<{ path: string; signedUrl: string }>(ROTAS_DO_CATALOGO.urlDeEnvio, 'POST', {
            fornecedor_id: fornecedorId, tipo, nome: arquivo.name,
        })
    } catch (e) {
        throw new ErroDaRota(e instanceof ErroDaRota ? e.status : 0, fraseDoArquivo(arquivo.name, (e as Error).message))
    }
    const { path, signedUrl } = assinado
    // O mesmo formato que `uploadToSignedUrl` do storage-js manda — sem o cliente.
    const corpo = new FormData()
    corpo.append('cacheControl', '3600')
    corpo.append('', arquivo)
    const res = await fetch(signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: corpo })
    if (!res.ok) throw new ErroDaRota(res.status, fraseDoArquivo(arquivo.name, `o envio falhou (${res.status}).`))
    return { path, nome: arquivo.name }
}

/** Uma tabela ainda no navegador: os dois arquivos e a vigência, antes de qualquer envio. */
export interface TabelaPendente { arquivo: File | null; motor: File | null; vigencia: string }

/**
 * Envia os dois arquivos e grava a tabela. Arquivo primeiro, motor depois — a ordem do modal.
 * Toda falha nomeia UM arquivo, uma vez: o envio, pelo arquivo enviado (`enviarArquivo`); a
 * gravação, pela tabela (`fraseDaTabela`). Quem chama não acrescenta nome.
 */
export async function gravarTabelaNova(fornecedorId: string, t: TabelaPendente): Promise<void> {
    const arquivo = await enviarArquivo(fornecedorId, 'arquivo', t.arquivo as File)
    const motor = await enviarArquivo(fornecedorId, 'motor', t.motor as File)
    try {
        await chamarRota(ROTAS_DO_CATALOGO.tabelas, 'POST', {
            fornecedor_id: fornecedorId,
            arquivo_path: arquivo.path, arquivo_nome: arquivo.nome,
            motor_path: motor.path, motor_nome: motor.nome,
            vigencia: t.vigencia,
        })
    } catch (e) {
        throw new ErroDaRota(e instanceof ErroDaRota ? e.status : 0, fraseDaTabela(arquivo.nome, (e as Error).message))
    }
}
