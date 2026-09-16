/**
 * Classificação fiscal — CST do IBS/CBS e cClassTrib, em duas etapas.
 *
 * ── O que este bloco faz, e por que ele existe ───────────────────────────────
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > O fator de redução NÃO é escolha do usuário. Ele DECORRE do cClassTrib.
 *   > É como o NCM: ninguém digita a alíquota do IPI, classifica o produto e a
 *   > alíquota vem.
 *
 * O usuário escolhe o CST (18 opções) e depois o cClassTrib DENTRO dele. A
 * redução de IBS e a de CBS são DERIVADAS do código e exibidas em leitura apenas,
 * com a origem à vista — o código e a publicação de onde vieram.
 *
 * ── UM COMPONENTE, DOIS CADASTROS ───────────────────────────────────────────
 *
 * Produto e serviço têm as MESMAS seis colunas e a mesma regra. Escrever o bloco
 * duas vezes seria `copia-divergente.md` nascendo na tela, logo depois de a
 * migração ter evitado exatamente isso no schema. Ele mora em `shared/` para que
 * acrescentar um campo valha para os dois.
 *
 * ── OS TRÊS ESTADOS QUE A TELA PRECISA DISTINGUIR ───────────────────────────
 *
 *   TABELA ............ classificado. Os dois percentuais vêm do código, em
 *                       leitura apenas, com a publicação ao lado.
 *   MANUAL ............ o código não está na tabela. A decisão do dono do produto
 *                       é deixar passar — e AÍ, e só aí, o usuário informa os dois
 *                       percentuais à mão. É o caminho de EXCEÇÃO.
 *   PAR_INCOMPATIVEL .. o código existe sob OUTRO CST. NÃO grava e NÃO deixa
 *                       salvar, e a mensagem diz sob qual CST ele existe: o
 *                       usuário provavelmente errou o CST, não o código.
 *
 * E um quarto, que é de transição: um cadastro anterior à classificação, com
 * `iva_dual_reduction_factor` preenchido. A tela mostra esse valor EM LEITURA
 * APENAS, rotulado como anterior à classificação fiscal. Decisão do dono do
 * produto: *"Não é entrada — o caminho para mudá-lo é classificar. Isso evita
 * três estados convivendo: o legado, os dois derivados e os dois manuais."*
 */
import { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { AutoComplete, Alert, Spin, Tooltip } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import { PercentInput } from '@/components/percent-input.component'
import { InfoCircleOutlined } from '@ant-design/icons'
import { supabase } from '@/supabase/client'
import {
  resolveClassificacaoFiscal,
  type CClassTribOrigem,
  type CClassTribRow,
} from '@/utils/classificacao-fiscal'

export interface ClassificacaoFiscalValue {
  cstIbsCbsCode: string | null
  cclassTrib: string | null
  cclassTribOrigem: CClassTribOrigem | null
  cclassTribSourcePublishedAt: string | null
  ivaReductionIbsPct: number | null
  ivaReductionCbsPct: number | null
}

interface CstRow {
  cst: string
  descricao: string
  ind_gred: boolean
}

interface Props {
  value: ClassificacaoFiscalValue
  onChange: (next: ClassificacaoFiscalValue) => void
  /**
   * O `iva_dual_reduction_factor` do cadastro. Só é EXIBIDO — e só enquanto não
   * houver classificação. Nunca é editável aqui.
   */
  fatorLegado?: number | null
  /**
   * Avisa o pai que o save deve ficar bloqueado, com o motivo. `null` libera.
   * O par incompatível é rejeitado pela SEFAZ; deixar salvar seria gravar um
   * documento que a nota recusa.
   */
  onBloqueioChange?: (motivo: string | null) => void
}

const COLUNAS_CCLASS =
  'cst, codigo, nome, p_red_ibs, p_red_cbs, d_ini_vig, d_fim_vig, source_published_at'

const hojeISO = (): string => new Date().toISOString().slice(0, 10)

const rotulo = { display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 } as const
const caixaLeitura = {
  padding: '6px 10px',
  borderRadius: 6,
  background: '#111c2e',
  border: '1px solid rgba(255,255,255,0.06)',
  fontSize: 13,
  color: '#e2e8f0',
} as const

export const ClassificacaoFiscalBlock: FC<Props> = ({
  value,
  onChange,
  fatorLegado = null,
  onBloqueioChange,
}) => {
  const [csts, setCsts] = useState<CstRow[]>([])
  const [codigos, setCodigos] = useState<CClassTribRow[]>([])
  const [carregandoCsts, setCarregandoCsts] = useState(false)
  const [carregandoCodigos, setCarregandoCodigos] = useState(false)
  const [publicacao, setPublicacao] = useState<string | null>(null)
  const [erroDoPar, setErroDoPar] = useState<string | null>(null)

  // Os 18 CST cabem inteiros num Select — não há busca a fazer.
  useEffect(() => {
    let vivo = true
    setCarregandoCsts(true)
    ;(supabase as any)
      .from('cst_ibs_cbs')
      .select('cst, descricao, ind_gred, source_published_at')
      .order('cst', { ascending: true })
      .then(({ data }: { data: any[] | null }) => {
        if (!vivo) return
        setCsts((data ?? []) as CstRow[])
        setPublicacao(data?.[0]?.source_published_at ?? null)
        setCarregandoCsts(false)
      })
    return () => { vivo = false }
  }, [])

  // O cClassTrib FILTRADO pelo CST. É o filtro que o NCM não tem: a mediana é 3
  // códigos por CST, e o maior é 54. Carregar os 164 e filtrar no cliente traria
  // os textos legais junto, que são a maior parte do payload.
  useEffect(() => {
    if (!value.cstIbsCbsCode) { setCodigos([]); return }
    let vivo = true
    setCarregandoCodigos(true)
    ;(supabase as any)
      .from('cclass_trib')
      .select(COLUNAS_CCLASS)
      .eq('cst', value.cstIbsCbsCode)
      .order('codigo', { ascending: true })
      .then(({ data }: { data: any[] | null }) => {
        if (!vivo) return
        setCodigos((data ?? []) as CClassTribRow[])
        setCarregandoCodigos(false)
      })
    return () => { vivo = false }
  }, [value.cstIbsCbsCode])

  const avisaBloqueio = useCallback((motivo: string | null) => {
    setErroDoPar(motivo)
    onBloqueioChange?.(motivo)
  }, [onBloqueioChange])

  /**
   * O ponto em que a derivação acontece. A consulta é UMA — todas as linhas com
   * este código, em qualquer CST — e é ela que distingue par errado de código
   * inexistente. `resolveClassificacaoFiscal` decide o resto.
   */
  const classificar = useCallback(async (codigo: string) => {
    const cst = value.cstIbsCbsCode
    if (!cst || !codigo) return

    const { data } = await (supabase as any)
      .from('cclass_trib')
      .select(COLUNAS_CCLASS)
      .eq('codigo', codigo)

    const r = resolveClassificacaoFiscal({
      cst,
      codigo,
      porCodigo: (data ?? []) as CClassTribRow[],
      publicacaoConsultada: publicacao ?? hojeISO(),
      hoje: hojeISO(),
    })

    if (r.status === 'PAR_INCOMPATIVEL') {
      avisaBloqueio(
        `O código ${codigo} não existe no CST ${cst}. Ele existe em ${r.cstDoCodigo.join(', ')} — ` +
        'confira o CST antes do código.',
      )
      // NÃO grava. O par incompatível é rejeitado pela SEFAZ, e gravá-lo com o
      // carimbo de MANUAL diria que o usuário quis assim.
      onChange({
        ...value,
        cclassTrib: codigo,
        cclassTribOrigem: null,
        cclassTribSourcePublishedAt: null,
        ivaReductionIbsPct: null,
        ivaReductionCbsPct: null,
      })
      return
    }

    avisaBloqueio(null)
    onChange({
      cstIbsCbsCode: r.gravar.cst_ibs_cbs,
      cclassTrib: r.gravar.cclass_trib,
      cclassTribOrigem: r.gravar.cclass_trib_origem,
      cclassTribSourcePublishedAt: r.gravar.cclass_trib_source_published_at,
      ivaReductionIbsPct: r.gravar.iva_reduction_ibs_pct,
      ivaReductionCbsPct: r.gravar.iva_reduction_cbs_pct,
    })
  }, [value, publicacao, onChange, avisaBloqueio])

  const opcoesDeCodigo = useMemo(
    () => codigos.map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.nome}` })),
    [codigos],
  )

  const classificado = value.cclassTribOrigem != null
  const manual = value.cclassTribOrigem === 'MANUAL'
  const mostraLegado = !classificado && fatorLegado != null

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div>
          <label style={rotulo}>
            CST do IBS/CBS&nbsp;
            <Tooltip title="Código de Situação Tributária do IBS e da CBS. Ele diz quais grupos a operação leva na nota. São 18, da tabela oficial do Portal DF-e SVRS.">
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
          </label>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            loading={carregandoCsts}
            placeholder="Selecionar CST"
            style={{ width: '100%' }}
            value={value.cstIbsCbsCode ?? undefined}
            options={csts.map((c) => ({ value: c.cst, label: `${c.cst} — ${c.descricao}` }))}
            onChange={(cst: string | undefined) => {
              // Trocar o CST invalida o código escolhido: o cClassTrib só vale
              // DENTRO do seu CST. Manter o código antigo produziria justamente o
              // par incompatível que este bloco existe para impedir.
              avisaBloqueio(null)
              onChange({
                cstIbsCbsCode: cst ?? null,
                cclassTrib: null,
                cclassTribOrigem: null,
                cclassTribSourcePublishedAt: null,
                ivaReductionIbsPct: null,
                ivaReductionCbsPct: null,
              })
            }}
          />
        </div>

        <div>
          <label style={rotulo}>
            cClassTrib&nbsp;
            <Tooltip title="Código de Classificação Tributária. Vincula o item ao dispositivo da LC 214/2025 que lhe dá o tratamento — e é ele que determina a redução de IBS e CBS. Se o código ainda não estiver na tabela, digite: a tela sugere, o cadastro aceita.">
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
          </label>
          <AutoComplete
            allowClear
            disabled={!value.cstIbsCbsCode}
            options={opcoesDeCodigo}
            filterOption={(termo, opcao) =>
              String(opcao?.label ?? '').toLowerCase().includes(termo.toLowerCase())
            }
            notFoundContent={carregandoCodigos ? <Spin size="small" /> : null}
            placeholder={value.cstIbsCbsCode ? 'Selecionar ou digitar o código' : 'Escolha o CST primeiro'}
            style={{ width: '100%' }}
            value={value.cclassTrib ?? undefined}
            onSelect={(codigo: string) => { void classificar(codigo) }}
            onBlur={() => { if (value.cclassTrib) void classificar(value.cclassTrib) }}
            onChange={(codigo: string | undefined) => {
              onChange({ ...value, cclassTrib: codigo ?? null })
              if (!codigo) avisaBloqueio(null)
            }}
          />
        </div>
      </div>

      {erroDoPar && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message="Par CST × cClassTrib incompatível"
          description={erroDoPar}
        />
      )}

      {/* ── Classificado pela TABELA: os dois percentuais são DERIVADOS ───────── */}
      {classificado && !manual && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label style={rotulo}>Redução do IBS</label>
              <div style={caixaLeitura}>
                {value.ivaReductionIbsPct != null
                  ? `${value.ivaReductionIbsPct.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`
                  : '—'}
              </div>
            </div>
            <div>
              <label style={rotulo}>Redução da CBS</label>
              <div style={caixaLeitura}>
                {value.ivaReductionCbsPct != null
                  ? `${value.ivaReductionCbsPct.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`
                  : '—'}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            Derivado do cClassTrib <strong>{value.cclassTrib}</strong>
            {value.cclassTribSourcePublishedAt
              ? <> · tabela oficial de {value.cclassTribSourcePublishedAt.split('-').reverse().join('/')}</>
              : null}
            . Para mudar, troque a classificação.
          </div>
        </div>
      )}

      {/* ── MANUAL: o caminho de EXCEÇÃO, e é o único em que se digita ───────── */}
      {manual && (
        <div style={{ marginTop: 12 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="Código fora da tabela oficial"
            description={
              `O código ${value.cclassTrib} não consta na tabela de ${value.cclassTribSourcePublishedAt ?? 'referência'}. ` +
              'O cadastro aceita — informe as duas reduções, porque não há de onde derivá-las.'
            }
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label style={rotulo}>Redução do IBS</label>
              <PercentInput
                min={0}
                max={100}
                style={{ width: '100%' }}
                value={value.ivaReductionIbsPct ?? undefined}
                onChange={(v) => onChange({ ...value, ivaReductionIbsPct: v ?? null })}
              />
            </div>
            <div>
              <label style={rotulo}>Redução da CBS</label>
              <PercentInput
                min={0}
                max={100}
                style={{ width: '100%' }}
                value={value.ivaReductionCbsPct ?? undefined}
                onChange={(v) => onChange({ ...value, ivaReductionCbsPct: v ?? null })}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Ainda não classificado, com valor anterior ───────────────────────── */}
      {mostraLegado && (
        <div style={{ marginTop: 12 }}>
          <label style={rotulo}>Fator de redução — valor anterior à classificação fiscal</label>
          <div style={{ ...caixaLeitura, color: '#94a3b8' }}>
            {Number(fatorLegado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%
            &nbsp;— aplicado a IBS e CBS
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            Somente leitura. Este cadastro é anterior à classificação fiscal, quando a redução
            era um número só para os dois tributos. <strong>Para mudá-lo, classifique</strong> —
            ao escolher o cClassTrib, as duas reduções assumem e este valor fica como histórico.
          </div>
        </div>
      )}
    </div>
  )
}

export default ClassificacaoFiscalBlock
