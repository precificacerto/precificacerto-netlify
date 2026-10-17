/**
 * tela-da-parcela.component.tsx — a parcela em LEITURA, largura inteira, endereço próprio.
 *
 * NÃO É POP-UP. O endereço é `?parcela=<id>` na própria ficha, e a escolha é do dono do
 * produto: a ficha já tem o mecanismo de URL montado (`?aba=`, `?editar=1`, `?mais=1`), e
 * uma rota aninhada (`/clientes/[id]/parcela/[parcelaId]`) obrigaria a recarregar o cliente
 * inteiro para mostrar uma parcela dele.
 *
 * A BAIXA DE UMA PARCELA ENTRA AQUI (5b) — E O VALOR DIFERENTE (5c.3)
 * --------------------------------------------------------------------
 * Um botão, UMA parcela. NÃO há seleção múltipla: baixa de várias é a 5c.2, que exige uma
 * segunda RPC (N chamadas seriam N transações), e há caso no portão afirmando a ausência.
 *
 * O VALOR DIFERENTE SÓ EXISTE QUANDO HÁ OUTRA PARCELA EM ABERTO NA MESMA VENDA. Na última em
 * aberto o checkbox não renderiza — e a RPC recusa com `PC005` de todo modo: são duas
 * camadas, e a de cima não substitui a de baixo. NÃO HÁ PRÉVIA dos novos valores: refazer a
 * conta proporcional aqui seria uma segunda aritmética sobre dinheiro. A confirmação nomeia o
 * valor pago, a parcela, a venda, a diferença e quais parcelas absorvem; os valores que
 * ficaram aparecem DEPOIS, na lista das irmãs, relida do banco pela ficha.
 *
 * `paid_date` É HOJE, PRÉ-PREENCHIDA E VISÍVEL ANTES DE CONFIRMAR. Vem de `hoje`, que a
 * ficha resolve por `dia-de-hoje.ts` no fuso do negócio — nunca do relógio do navegador,
 * que daria um dia a mais ou a menos conforme onde a pessoa estiver. Ela NÃO é editável
 * nesta etapa: baixa retroativa não foi pedida, e um campo de data aberto criaria um
 * caminho sem regra escrita.
 *
 * QUEM DEU A BAIXA NÃO É RASTREÁVEL. `cash_entries` não tem `paid_by` nem `updated_at` —
 * a coluna exige migração, e migração é rodada própria. A tela não finge o contrário.
 */

import React, { useState } from 'react'
import { Alert, Button, Checkbox, InputNumber, Modal, Select, Tag } from 'antd'
import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons'

import { formatBRL } from '@/utils/formatters'
import { diaBR } from '@/utils/dia-de-hoje'
import type { LinhaDeVencimento } from '@/utils/vencimentos-da-ficha'
import {
    FORMAS_DA_BAIXA,
    ROTULO_CONFIRMAR_BAIXA,
    ROTULO_DAR_BAIXA,
    TITULO_DA_CONFIRMACAO,
    textoDaConfirmacaoDaBaixa,
} from '@/utils/baixa-de-parcela'
import {
    diferencaEmCentavos,
    outrasEmAbertoDaSerie,
    textoDaConfirmacaoComValorDiferente,
} from '@/utils/baixa-pela-rota'

export const ROTULO_VALOR_DIFERENTE = 'Pagar valor diferente do combinado'

export const TEXTO_PARCELA_NAO_ENCONTRADA = 'Parcela não encontrada.'
export const TITULO_DA_TELA_DA_PARCELA = 'Parcela'
export const TITULO_DAS_IRMAS = 'As outras parcelas desta venda'

const TRAVESSAO = '—'

const SELO: Record<LinhaDeVencimento['estado'], { cor: string; rotulo: string }> = {
    PAGA: { cor: 'green', rotulo: 'Paga' },
    VENCIDA: { cor: 'red', rotulo: 'Vencida' },
    A_VENCER: { cor: 'orange', rotulo: 'Em aberto' },
    SEM_VENCIMENTO: { cor: 'default', rotulo: 'Sem vencimento' },
}

/** O que a tela mostra da VENDA. Tudo opcional: a parcela órfã não tem venda nenhuma. */
export interface VendaDaParcela {
    codigo?: string | null
    /** `sales.sale_date` — a data de efetivação. */
    efetivadaEm?: string | null
    vendedor?: string | null
    /** `cash_entries.payment_method` — a forma COMBINADA, que vive na parcela. */
    formaCombinada?: string | null
}

export interface TelaDaParcelaProps {
    /** `null` quando o `?parcela=` não resolve: a ficha NÃO cai, mostra o estado. */
    linha: LinhaDeVencimento | null
    venda: VendaDaParcela
    irmas: LinhaDeVencimento[]
    aoFechar: () => void
    /**
     * `YYYY-MM-DD` no fuso do negócio, resolvido pela ficha com `hojeNoFusoDoNegocio`.
     * É o `paid_date` que vai ser gravado, e é exibido antes de confirmar.
     */
    hoje: string
    /**
     * `canEdit(MODULES.CASH_FLOW)`. Sem ela o botão NÃO renderiza.
     *
     * Botão novo atrás de permissão não tira capacidade de ninguém. Os 13 pontos do fluxo
     * de caixa que hoje gravam sem checar `canEdit` ficam como estão — é decisão do dono
     * do produto, e está registrada.
     */
    podeDarBaixa: boolean
    /**
     * Executa a baixa e devolve o que aconteceu. Ausente = tela em leitura pura.
     *
     * A ficha é quem conhece o cliente de escrita e o tenant; o componente só sabe que
     * confirmou. Depois que isto resolve, a ficha RECARREGA — é o que faz a parcela virar
     * PAGA, a autossoma cair e o VENCIDO do cabeçalho diminuir.
     */
    aoDarBaixa?: (entrada: { pagoEm: string; forma: string | null; valorPago?: number }) => Promise<void>
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ minWidth: 190, color: 'var(--color-neutral-400)', fontSize: 13 }}>{rotulo}</span>
            <span style={{ fontSize: 13 }}>{valor}</span>
        </div>
    )
}

export function TelaDaParcela({
    linha, venda, irmas, aoFechar, hoje, podeDarBaixa, aoDarBaixa,
}: TelaDaParcelaProps) {
    const [confirmando, setConfirmando] = useState(false)
    const [gravando, setGravando] = useState(false)
    // A forma começa na COMBINADA, que é o que está gravado na parcela. Trocar aqui muda
    // a forma DESTA parcela, nunca a da venda.
    const [forma, setForma] = useState<string | null>(venda.formaCombinada ?? null)
    const [valorDiferente, setValorDiferente] = useState(false)
    const [valorPago, setValorPago] = useState<number | null>(null)

    if (linha === null) {
        return (
            <div data-testid="tela-da-parcela" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{TEXTO_PARCELA_NAO_ENCONTRADA}</div>
                <Button icon={<ArrowLeftOutlined />} onClick={aoFechar}>Voltar para a ficha</Button>
            </div>
        )
    }

    // As TRÊS condições, e todas as três precisam valer. Parcela PAGA não tem o que
    // baixar: ela já mostra "Paga em dd/mm" e a forma no selo do topo.
    const podeBaixar = podeDarBaixa && aoDarBaixa !== undefined && linha.estado !== 'PAGA'

    // A CAMADA DE CIMA da regra 5: sem outra em aberto, o campo de valor diferente não existe.
    const outras = outrasEmAbertoDaSerie(irmas, linha)
    const ofereceValorDiferente = outras.length > 0
    const comValorDiferente = ofereceValorDiferente && valorDiferente
    const valorValido = valorPago !== null && Number.isFinite(valorPago) && valorPago > 0
    const delta = comValorDiferente && valorValido ? diferencaEmCentavos(linha.valor, valorPago) : 0

    const selo = SELO[linha.estado]
    const textoDoSelo = linha.estado === 'VENCIDA' && linha.diasDeAtraso !== null
        ? (linha.diasDeAtraso === 1 ? 'Vencida há 1 dia' : `Vencida há ${linha.diasDeAtraso} dias`)
        : linha.estado === 'PAGA' && linha.pagaEm !== null
            ? `Paga em ${diaBR(linha.pagaEm)}`
            : selo.rotulo

    return (
        // LARGURA INTEIRA: a tela da parcela ocupa a ficha, não um painel ao lado.
        <div data-testid="tela-da-parcela" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={aoFechar}>Voltar</Button>
                <span style={{ fontSize: 18, fontWeight: 800 }}>
                    {TITULO_DA_TELA_DA_PARCELA} {linha.numero} de {linha.de}
                </span>
                <Tag color={selo.cor}>{textoDoSelo}</Tag>
            </div>

            <div style={{ maxWidth: 720 }}>
                <Campo rotulo="Código da venda" valor={venda.codigo ?? TRAVESSAO} />
                <Campo rotulo="Efetivada em" valor={diaBR(venda.efetivadaEm)} />
                <Campo rotulo="Vendedor" valor={venda.vendedor ?? TRAVESSAO} />
                <Campo rotulo="Vencimento" valor={diaBR(linha.vencimento)} />
                <Campo rotulo="Valor" valor={formatBRL(linha.valor)} />
                {/* A forma vive na PARCELA (`cash_entries.payment_method`), não na venda —
                    medido: a coluna existe e o fluxo de caixa já a altera na baixa. Aqui
                    ela é só exibida; alterá-la é a 5b. */}
                <Campo rotulo="Forma combinada" valor={venda.formaCombinada ?? TRAVESSAO} />
            </div>

            {/* A BAIXA. Só aparece com permissão, com callback, e com a parcela EM ABERTO:
                parcela paga mostra o selo "Paga em dd/mm" no topo e nada mais. */}
            {podeBaixar && (
                <div
                    data-testid="bloco-da-baixa"
                    style={{ marginTop: 20, padding: 14, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, maxWidth: 720 }}
                >
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{ROTULO_DAR_BAIXA}</div>
                    {/* A data É VISÍVEL ANTES DE CONFIRMAR, e não é campo: ver o cabeçalho. */}
                    <Campo rotulo="Data da baixa (hoje)" valor={<span data-testid="data-da-baixa">{diaBR(hoje)}</span>} />
                    <div style={{ display: 'flex', gap: 8, padding: '6px 0', alignItems: 'center' }}>
                        <span style={{ minWidth: 190, color: 'var(--color-neutral-400)', fontSize: 13 }}>Forma de pagamento</span>
                        <Select
                            data-testid="forma-da-baixa"
                            style={{ minWidth: 240 }}
                            value={forma ?? undefined}
                            placeholder="Selecione a forma"
                            onChange={(v) => setForma(v ?? null)}
                            options={FORMAS_DA_BAIXA.map((f) => ({ value: f, label: f }))}
                        />
                    </div>
                    {ofereceValorDiferente && (
                        <div data-testid="opcao-valor-diferente" style={{ padding: '6px 0' }}>
                            <Checkbox
                                checked={valorDiferente}
                                onChange={(e) => { setValorDiferente(e.target.checked); if (!e.target.checked) setValorPago(null) }}
                            >
                                {ROTULO_VALOR_DIFERENTE}
                            </Checkbox>
                        </div>
                    )}
                    {comValorDiferente && (
                        <div style={{ display: 'flex', gap: 8, padding: '6px 0', alignItems: 'center' }}>
                            <span style={{ minWidth: 190, color: 'var(--color-neutral-400)', fontSize: 13 }}>Valor pago</span>
                            <InputNumber
                                data-testid="valor-da-baixa"
                                style={{ minWidth: 240 }}
                                min={0.01}
                                precision={2}
                                decimalSeparator=","
                                value={valorPago ?? undefined}
                                onChange={(v) => setValorPago(typeof v === 'number' ? v : null)}
                            />
                        </div>
                    )}
                    <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        style={{ marginTop: 10 }}
                        disabled={comValorDiferente && !valorValido}
                        onClick={() => setConfirmando(true)}
                    >
                        {ROTULO_DAR_BAIXA}
                    </Button>
                </div>
            )}

            {/* CONFIRMAÇÃO QUE NOMEIA O QUE VAI SER GRAVADO. Escrita em dinheiro não
                acontece por um clique só. */}
            <Modal
                open={confirmando}
                title={TITULO_DA_CONFIRMACAO}
                okText={ROTULO_CONFIRMAR_BAIXA}
                cancelText="Cancelar"
                confirmLoading={gravando}
                onCancel={() => setConfirmando(false)}
                onOk={async () => {
                    if (!aoDarBaixa) return
                    setGravando(true)
                    try {
                        await aoDarBaixa(comValorDiferente && valorValido
                            ? { pagoEm: hoje, forma, valorPago }
                            : { pagoEm: hoje, forma })
                        setConfirmando(false)
                        setValorDiferente(false)
                        setValorPago(null)
                    } finally {
                        setGravando(false)
                    }
                }}
            >
                <div data-testid="texto-da-confirmacao">
                    {comValorDiferente && valorValido
                        ? textoDaConfirmacaoComValorDiferente({
                            valorPago: formatBRL(valorPago),
                            valorCombinado: formatBRL(linha.valor),
                            parcela: `${linha.numero} de ${linha.de}`,
                            codigoDaVenda: venda.codigo ?? null,
                            forma,
                            pagoEm: diaBR(hoje),
                            diferenca: formatBRL(Math.abs(delta) / 100),
                            sentido: delta > 0 ? 'A_MENOS' : delta < 0 ? 'A_MAIS' : 'SEM_DIFERENCA',
                            reajustaveis: outras.map((o) => `${o.numero} de ${o.de} (vence ${o.vencimento === null ? 'sem vencimento' : diaBR(o.vencimento)})`),
                        })
                        : textoDaConfirmacaoDaBaixa({
                            valor: formatBRL(linha.valor),
                            codigoDaVenda: venda.codigo ?? null,
                            vencimento: linha.vencimento === null ? null : diaBR(linha.vencimento),
                            forma,
                            pagoEm: diaBR(hoje),
                        })}
                </div>
                {forma === null && (
                    <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        message="Sem forma de pagamento escolhida — a parcela vai ficar sem forma registrada."
                    />
                )}
            </Modal>

            {irmas.length > 1 && (
                <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{TITULO_DAS_IRMAS}</div>
                    {irmas.map((i) => {
                        const s = SELO[i.estado]
                        return (
                            <div
                                key={i.id}
                                style={{
                                    display: 'flex', gap: 12, padding: '6px 0', alignItems: 'center',
                                    opacity: i.id === linha.id ? 1 : 0.75,
                                    fontWeight: i.id === linha.id ? 700 : 400,
                                }}
                            >
                                <span style={{ minWidth: 70 }}>{i.numero} de {i.de}</span>
                                <span style={{ minWidth: 110 }}>{diaBR(i.vencimento)}</span>
                                <span style={{ minWidth: 120, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(i.valor)}</span>
                                <Tag color={s.cor}>{s.rotulo}</Tag>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
