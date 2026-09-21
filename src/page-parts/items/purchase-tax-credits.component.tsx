/**
 * purchase-tax-credits.component.tsx — o bloco "Impostos da compra", uma linha por tributo.
 *
 * Cada tributo tem alíquota, o botão "gera crédito", e a AJUDA que diz duas coisas que o
 * usuário não tem como adivinhar: a base legal da regra e ONDE ACHAR O NÚMERO na NF-e de
 * compra. Sem o segundo, o botão vira palpite — e o palpite entra no numerador do preço.
 *
 * O bloco NÃO calcula nada. Ele exibe o que `custo-liquido-do-item.ts` resolveu: as
 * bandeiras (ligada, desligada, vedada e por quê) e os três números do rodapé. Uma segunda
 * conta aqui seria a cópia que `copia-divergente.md` cataloga, e ela fecharia consigo mesma.
 */
import React from 'react'
import { Checkbox, Form, Select, Switch, Tooltip } from 'antd'
import { InfoCircleOutlined, LockOutlined } from '@ant-design/icons'
import PercentInput from '@/components/percent-input.component'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import type {
  BandeirasDeCredito, CustoDoItem, DestinacaoItem, TributoCreditavel,
} from '@/utils/custo-liquido-do-item'

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : `R$ ${getMonetaryValue(v)}`

export const DESTINACOES: { value: DestinacaoItem; label: string; ajuda: string }[] = [
  { value: 'REVENDA', label: 'Revenda', ajuda: 'Mercadoria comprada para revender, sem industrialização.' },
  { value: 'INSUMO', label: 'Insumo / matéria-prima', ajuda: 'Entra ou se consome no produto fabricado. É o que abre o crédito de IPI.' },
  { value: 'USO_CONSUMO', label: 'Uso e consumo', ajuda: 'Material de escritório, limpeza, manutenção. O crédito de ICMS está adiado para 2033.' },
  { value: 'ATIVO_IMOBILIZADO', label: 'Ativo imobilizado', ajuda: 'Bem que vai para o imobilizado. ICMS por CIAP e PIS/COFINS sobre depreciação são fase 2.' },
]

/**
 * A ajuda de cada tributo: a regra e o campo da NF-e.
 *
 * As listas de CST são as do comando do PO de 20/09/2026, e estão aqui como TEXTO porque é
 * aqui que o usuário lê. A decisão que elas governam mora em `custo-liquido-do-item.ts` —
 * este texto descreve aquela regra, não a reimplementa.
 */
const AJUDA: Record<TributoCreditavel, { rotulo: string; regra: string; naNota: string }> = {
  ICMS: {
    rotulo: 'ICMS',
    regra: 'Credita para contribuinte, em mercadoria para revenda ou insumo que se consome no processo, com entrada tributada. Uso e consumo está adiado para 2033. LC 87/1996 arts. 19, 20 e 33.',
    naNota: 'Na NF-e: vICMS e o CST/CSOSN. CST 00, 10, 20 e 70 têm crédito; 40, 41, 50 e 60 não — e o 60 (ST) vira custo.',
  },
  PIS_COFINS: {
    rotulo: 'PIS/COFINS',
    regra: 'Credita no regime NÃO CUMULATIVO, para bem ou serviço usado como insumo ou mercadoria para revenda. No cumulativo não há crédito. Leis 10.637/2002 e 10.833/2003 art. 3º.',
    naNota: 'Na NF-e: CST 50 a 56 têm crédito; 70 a 75, 98 e 99 não.',
  },
  IPI: {
    rotulo: 'IPI',
    regra: 'Credita em estabelecimento INDUSTRIAL ou equiparado, para insumo, matéria-prima ou embalagem que integra ou se consome no produto. Revenda sem industrialização, uso e consumo e ativo não creditam. RIPI/2010 arts. 226 e 227.',
    naNota: 'Na NF-e: vIPI e o CST-IPI. Entradas 00 e 49 têm crédito; 01, 02, 03 e 05 não.',
  },
  CBS: {
    rotulo: 'CBS',
    regra: 'Regra geral: toda aquisição para a atividade gera crédito, desde que destacada em documento fiscal válido. Não credita uso e consumo pessoal, nem fornecedor do Simples que não optou pelo regime regular. LC 214/2025 arts. 47, 48 e 57.',
    naNota: 'Na NF-e: grupo gIBSCBS, campo vCBS, com o CST de IBS/CBS e o cClassTrib.',
  },
  IBS: {
    rotulo: 'IBS',
    regra: 'Mesma regra da CBS — aquisição para a atividade, com destaque em documento fiscal válido. LC 214/2025 arts. 47, 48 e 57.',
    naNota: 'Na NF-e: grupo gIBSCBS, campo vIBS, com o CST de IBS/CBS e o cClassTrib.',
  },
}

/** ST, DIFAL e FCP: sem botão, porque não há caso em que creditem. */
const SEMPRE_CUSTO: { rotulo: string; regra: string; naNota: string }[] = [
  {
    rotulo: 'ICMS-ST',
    regra: 'A substituição tributária encerra a cadeia: o imposto já foi recolhido pelo substituto e o adquirente não credita. Sempre custo.',
    naNota: 'Na NF-e: vICMSST.',
  },
  {
    rotulo: 'DIFAL',
    regra: 'Diferencial de alíquota na entrada interestadual. Não gera crédito ao adquirente. Sempre custo. Convênio ICMS 142/2018.',
    naNota: 'Na NF-e: vICMSUFDest.',
  },
  {
    rotulo: 'FCP',
    regra: 'Fundo de Combate à Pobreza. Não gera crédito. Sempre custo.',
    naNota: 'Na NF-e: vFCPUFDest. A captura automática vem com a importação do XML (fase 2) — hoje ele entra no valor da compra.',
  },
]

interface Props {
  bandeiras: BandeirasDeCredito | null
  custo: CustoDoItem | null
  /** Liga/desliga a bandeira daquele tributo. `null` volta ao padrão da destinação. */
  onToggle: (tributo: TributoCreditavel, valor: boolean) => void
  /** Chamado quando a destinação ou uma alíquota nova muda, para recalcular. */
  onRecalc: () => void
  /** O bloco não existe em Simples e MEI. */
  visivel: boolean
  /** Rótulo da unidade de medida escolhida — "metro", "ml", "kg". Para o quarto número. */
  unidadeLabel?: string
  /**
   * O input de ALÍQUOTA de cada tributo, quando quem monta o bloco precisa fornecê-lo.
   *
   * >>> POR QUE UMA COSTURA, E NÃO UM SEGUNDO COMPONENTE <<<
   * No cadastro de item as alíquotas de ICMS, PIS/COFINS e IPI já têm campo próprio fora
   * deste bloco, e só CBS e IBS entram por aqui. No lançamento de DESPESA não há nenhum campo
   * fora — os cinco precisam entrar no bloco. Duplicar o componente para atender os dois
   * seria `copia-divergente.md` com a pior das assinaturas: as duas cópias exibiriam o mesmo
   * número por caminhos diferentes, e a divergência só apareceria como crédito errado.
   *
   * Ausente, o bloco mantém o comportamento do cadastro de item.
   */
  extras?: Partial<Record<TributoCreditavel, React.ReactNode>>
  /** Cabeçalho do bloco. O lançamento de despesa diz de qual despesa se trata. */
  titulo?: string
  /** Esconde o seletor de destinação — no lançamento ele vem da natureza da despesa. */
  semDestinacao?: boolean
}

export function PurchaseTaxCredits({ bandeiras, custo, onToggle, onRecalc, visivel, unidadeLabel, extras, titulo, semDestinacao }: Props) {
  if (!visivel) return null

  const linha = (t: TributoCreditavel, valor: number | null | undefined, extra?: React.ReactNode) => {
    const b = bandeiras?.[t]
    const a = AJUDA[t]
    return (
      <div
        key={t}
        style={{
          display: 'grid', gridTemplateColumns: '140px 1fr 150px 130px', gap: 12, alignItems: 'center',
          padding: '10px 0', borderBottom: '1px solid rgba(148,163,184,0.12)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          {a.rotulo}
          <Tooltip title={<><div>{a.regra}</div><div style={{ marginTop: 8, opacity: 0.85 }}>{a.naNota}</div></>}>
            <InfoCircleOutlined style={{ color: '#64748b' }} />
          </Tooltip>
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {extra}
          <span style={{ color: '#94a3b8', fontSize: 13, minWidth: 92 }}>{fmt(valor)}</span>
        </div>

        {/*
          VEDAÇÃO DE REGIME NÃO TEM BOTÃO — e a distinção é deliberada.
          Naquele regime o tributo NUNCA credita, para item nenhum: um botão desabilitado
          convidaria a perguntar "o que preciso mudar para habilitar?", e a resposta seria
          "nada — mude de regime". A linha diz onde o tributo está, e isso é a informação.
          As outras vedações (CST, fornecedor, sem destaque) dependem DAQUELA COMPRA: ali o
          botão existe, desabilitado, porque o usuário pode mudar o dado que o bloqueia.
        */}
        {b?.tipoVedacao === 'REGIME' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 12, color: '#fca5a5' }}>dentro do DAS — compõe o custo</span>
            {b.motivo && (
              <Tooltip title={b.motivo}>
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <Switch
              size="small"
              checked={!!b?.ativo}
              disabled={!!b?.vedado}
              onChange={(v) => onToggle(t, v)}
            />
            <span style={{ fontSize: 12, color: b?.vedado ? '#fca5a5' : '#94a3b8' }}>gera crédito</span>
            {/*
              O MOTIVO É VISÍVEL, e não só o botão cinza. Um botão desabilitado sem explicação
              faz o usuário achar que o sistema está quebrado; com o motivo, ele aprende a
              regra. É a mesma razão do rótulo "% médio" em `decomposicao-na-tela.md`.
            */}
            {b?.vedado && b.motivo && (
              <Tooltip title={b.motivo}>
                <LockOutlined style={{ color: '#fca5a5' }} />
              </Tooltip>
            )}
          </div>
        )}

        {/*
          EFEITO NO CUSTO — a coluna que responde a pergunta que o usuário de fato tem.
          "Gera crédito" é a causa; "sai do custo" é a consequência, e é ela que explica por
          que o número do rodapé mudou. Sem esta coluna o usuário liga um botão e vê o total
          mexer sem saber qual linha o moveu.
        */}
        <span style={{
          fontSize: 12, textAlign: 'right',
          color: b?.ativo ? '#22C55E' : '#94a3b8',
        }}>
          {b?.ativo ? 'sai do custo' : 'soma no custo'}
        </span>
      </div>
    )
  }

  const creditos = custo?.creditos
  const v = custo?.valores

  return (
    <div style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
        {titulo ?? 'Impostos da compra'}
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
        O custo bruto é o valor da compra. O custo líquido — que é o que a precificação usa —
        é o bruto menos o que gera crédito.
      </div>

      {!semDestinacao && (
      <Form.Item
        name="destination"
        label={
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Destinação
            <Tooltip title="Para que o item foi comprado. É ela que define o padrão dos botões abaixo — e os padrões são sugestão: você pode ligar ou desligar, exceto onde a lei veda.">
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
          </span>
        }
        initialValue="REVENDA"
        style={{ marginBottom: 16 }}
      >
        <Select
          options={DESTINACOES.map((d) => ({
            value: d.value,
            label: <Tooltip title={d.ajuda}><span>{d.label}</span></Tooltip>,
          }))}
          onChange={() => setTimeout(onRecalc, 50)}
        />
      </Form.Item>
      )}

      {/* O cabeçalho da tabela — as seis colunas do §6. */}
      <div style={{
        display: 'grid', gridTemplateColumns: '140px 1fr 150px 130px', gap: 12,
        fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4,
        paddingBottom: 6, borderBottom: '1px solid rgba(148,163,184,0.2)', marginTop: 8,
      }}>
        <span>Imposto</span>
        <span>Alíquota · regra específica · valor</span>
        <span style={{ textAlign: 'right' }}>Crédito</span>
        <span style={{ textAlign: 'right' }}>Efeito no custo</span>
      </div>

      {/*
        AS TRÊS LINHAS APARECEM SEMPRE, inclusive no Simples Híbrido — decisão do PO de
        20/09/2026, seção 4. Antes elas SUMIAM ali, e sumir afirma que o tributo não existe
        na compra: ele existe, compõe o custo, e o que não existe é o crédito. É a mesma
        distinção de `ausente-vs-falso.md` — a linha some, o usuário conclui que não pagou.
      */}
      {linha('ICMS', v?.icms, extras?.ICMS)}
      {linha('PIS_COFINS', v?.pisCofins, extras?.PIS_COFINS)}
      {linha('IPI', v?.ipi, extras?.IPI)}

      {linha('CBS', v?.cbs, extras?.CBS ?? (
        <Form.Item name="cbs_rate" noStyle initialValue={0}>
          <PercentInput min={0} max={100} style={{ width: 110 }} onChange={() => setTimeout(onRecalc, 50)} />
        </Form.Item>
      ))}
      {linha('IBS', v?.ibs, extras?.IBS ?? (
        <Form.Item name="ibs_rate" noStyle initialValue={0}>
          <PercentInput min={0} max={100} style={{ width: 110 }} onChange={() => setTimeout(onRecalc, 50)} />
        </Form.Item>
      ))}

      {/*
        O FORNECEDOR DO SIMPLES — LC 214/2025 art. 47 §9º II.
        Fica junto de CBS/IBS porque é só deles que ele trata, e é propriedade DA COMPRA:
        outra nota do mesmo item, de outro fornecedor, credita normalmente.
      */}
      <Form.Item
        name="supplier_simples_sem_regime_regular"
        valuePropName="checked"
        style={{ marginTop: 10, marginBottom: 0 }}
      >
        <Checkbox onChange={() => setTimeout(onRecalc, 50)}>
          <span style={{ fontSize: 12 }}>
            Fornecedor do Simples sem regime regular&nbsp;
            <Tooltip title="Optante do Simples que NÃO aderiu ao regime regular de IBS/CBS: o crédito do adquirente fica limitado ao recolhido dentro do DAS, que a nota não destaca. Marcado, o crédito de CBS e IBS é bloqueado — bloquear é mais honesto que estimar um número que ninguém apurou. LC 214/2025 art. 47 §9º II.">
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
          </span>
        </Checkbox>
      </Form.Item>

      {/* SEMPRE CUSTO — sem botão, porque não há caso em que creditem. */}
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed rgba(148,163,184,0.25)' }}>
        {SEMPRE_CUSTO.map((s) => (
          <div key={s.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: '#94a3b8' }}>
            <span style={{ fontWeight: 600, minWidth: 140 }}>{s.rotulo}</span>
            <Tooltip title={<><div>{s.regra}</div><div style={{ marginTop: 8, opacity: 0.85 }}>{s.naNota}</div></>}>
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
            <span style={{ color: '#fca5a5' }}>sempre custo</span>
          </div>
        ))}
      </div>

      {/* RODAPÉ — os três números, e o do meio é o que explica a diferença entre os outros. */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(148,163,184,0.2)', display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: '#94a3b8' }}>Custo bruto</span>
          <span style={{ fontWeight: 600 }}>{fmt(custo?.custoBruto)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: '#94a3b8' }}>
            Crédito recuperado
            {creditos && (
              <Tooltip
                title={(Object.keys(AJUDA) as TributoCreditavel[])
                  .filter((t) => creditos[t] > 0)
                  .map((t) => `${AJUDA[t].rotulo}: R$ ${getMonetaryValue(creditos[t])}`)
                  .join(' · ') || 'Nenhum tributo desta compra gera crédito.'}
              >
                <InfoCircleOutlined style={{ color: '#64748b', marginLeft: 6 }} />
              </Tooltip>
            )}
          </span>
          <span style={{ fontWeight: 600, color: '#22C55E' }}>
            − {fmt(custo?.creditoTotal ?? 0)}
            {/*
              O % DO QUE FOI PAGO — §3 do comando de 21/09/2026.
              O valor sozinho não diz se o crédito é relevante: R$ 319,38 numa compra de mil
              é um terço, e numa de cem mil é ruído. Travessão quando o bruto é zero: uma
              divisão por zero exibida como 0,00% afirmaria que nada creditou.
            */}
            {custo && custo.custoBruto > 0 && (
              <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>
                ({getMonetaryValue((custo.creditoTotal / custo.custoBruto) * 100)}% do que foi pago)
              </span>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 6, borderTop: '1px solid rgba(148,163,184,0.15)' }}>
          <span style={{ fontWeight: 700 }}>Custo líquido <span style={{ fontWeight: 400, color: '#94a3b8' }}>(unidade comprada)</span></span>
          <span style={{ fontWeight: 700, color: '#22C55E' }}>{fmt(custo?.custoLiquido)}</span>
        </div>

        {/*
          O QUARTO NÚMERO — e é ele que a receita do produto consome.
          A compra é de uma unidade; o produto usa uma FRAÇÃO dela. Travessão quando não há
          QTD. medida: `null` ali é "não há fração a apurar", e exibir o próprio líquido
          afirmaria uma divisão por 1 que ninguém fez (`ausente-vs-falso.md`).
        */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: '#94a3b8' }}>
            Custo líquido por {unidadeLabel || 'fração da unidade'}
          </span>
          <span style={{ fontWeight: 600, color: custo?.custoPorFracao == null ? '#94a3b8' : '#22C55E' }}>
            {fmt(custo?.custoPorFracao)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default PurchaseTaxCredits
