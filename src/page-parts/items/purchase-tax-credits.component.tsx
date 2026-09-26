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
import { TRIBUTOS_CREDITAVEIS } from '@/utils/custo-liquido-do-item'
import { ROTULO_DO_BLOCO, tributosPorBloco } from '@/utils/posicao-do-tributo'

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
  /**
   * COMO A DECISÃO DE CRÉDITO É TOMADA.
   *
   * `'switch'` é o que existia: uma tabela, um botão por linha. `'posicao'` é o comando do
   * PO de 23/09/2026 — DUAS metades, e a POSIÇÃO da linha é a decisão.
   *
   * O default é `'switch'` para que quem não passa a prop não mude de comportamento. Não é
   * hesitação: é o que permite a mudança entrar tela a tela, com o mesmo componente, em vez
   * de um arquivo copiado "para o bloco novo" — que seria `copia-divergente.md` nascendo no
   * mesmo dia.
   */
  modo?: 'switch' | 'posicao'
  /** As linhas do bloco de custo, em R$. Só no modo `'posicao'`. */
  blocoDeCusto?: React.ReactNode
  /**
   * QUAIS LINHAS RENDERIZAR. Ausente = os cinco, que é o comportamento de sempre.
   *
   * >>> POR QUE UMA PROP, E NÃO UMA SEGUNDA TABELA NA PÁGINA <<<
   *
   * A tela de despesa precisa de DOIS blocos — por fora e por dentro — porque essa é a
   * hierarquia fiscal: os por fora saem da base, os por dentro incidem sobre ela. Escrever
   * a segunda tabela na página seria `copia-divergente.md` nascendo: as duas exibiriam o
   * mesmo tributo por caminhos diferentes, e a divergência só apareceria como crédito
   * errado.
   *
   * Com a prop, é o MESMO componente duas vezes. Acrescentar um tributo, mudar um tooltip ou
   * corrigir a ajuda da NF-e vale para os dois blocos e para o cadastro de item.
   */
  tributos?: readonly TributoCreditavel[]
  /**
   * Não renderizar o bloco interno "Não gera crédito — compõe o custo".
   *
   * Na tela de despesa ele virou o BLOCO 1A, com CAMPOS: ICMS-ST, DIFAL e FCP são digitados
   * lá. Repeti-los aqui como texto "sempre custo" ensinaria que não são editáveis — e
   * duplicaria linhas que já existem na tela.
   */
  semBlocoB?: boolean
  /**
   * Não renderizar o rodapé de três cards — TOTAL DO ITEM / CRÉDITO DO IMPOSTO /
   * CUSTO LÍQUIDO.
   *
   * A tela de despesa tem o rodapé próprio — "Crédito total / CUSTO LÍQUIDO" —, que é o do
   * descascamento. Dois rodapés com números de origens diferentes na mesma tela é o convite
   * para alguém conferir um contra o outro e achar que discordam.
   */
  semRodape?: boolean
  /**
   * A linha de apoio sob o título. SEM TEXTO PADRÃO quando ausente.
   *
   * O texto que estava fixo aqui — "O custo bruto é o valor da compra…" — descrevia o
   * desenho ANTERIOR. Um default novo teria o mesmo destino: descrever um desenho que muda.
   * Quem tem o que dizer, diz.
   */
  subtitulo?: string
  /**
   * O que vem LOGO DEPOIS das linhas de tributo, dentro do bloco.
   *
   * Chamava-se `rodapeDoIpi` até 24/09/2026, quando a tela de despesa passou a ter um
   * segundo uso: no bloco POR FORA ele é o seletor do IPI e o IS; no bloco POR DENTRO é a
   * linha da base manual. Um nome que dissesse IPI faria o segundo uso parecer erro, e o
   * conteúdo já é decidido por quem monta o bloco.
   */
  depoisDasLinhas?: React.ReactNode
  /**
   * A LEITURA de cada linha — em vez do valor apurado de `custo`.
   *
   * O bloco tem `custo: CustoDoItem | null`, e a tela de despesa não tem um `CustoDoItem`:
   * ela tem um descascamento da NOTA. Montar um `CustoDoItem` parcial ali seria
   * `construtor-empobrecido.md` — um segundo produtor do mesmo contrato, com menos campos,
   * e nada falharia. Com esta prop quem tem a leitura a entrega pronta, e o bloco continua
   * sem calcular.
   *
   * Ausente para um tributo, a linha volta a mostrar `fmt(valor)`, que é `—` sem `custo`.
   */
  leitura?: Partial<Record<TributoCreditavel, React.ReactNode>>
  /**
   * A LEGENDA de cada linha, sob o rótulo — na PRIMEIRA coluna, nunca na da entrada.
   *
   * "destacado, já dentro do preço", "base após o ICMS: R$ 928,00", "por fora, sobre o
   * valor do item": é o que distingue um tributo que já está no preço de um que se soma a
   * ele, e é a informação que faz o usuário entender por que dois números iguais creditam
   * diferente.
   *
   * Ela vai na coluna do rótulo de propósito: posta ao lado da entrada, deslocaria a coluna
   * e as linhas deixariam de parecer a mesma linha.
   */
  legenda?: Partial<Record<TributoCreditavel, React.ReactNode>>
  /**
   * Não renderizar o check "Fornecedor do Simples sem regime regular".
   *
   * `supplier_simples_sem_regime_regular` é coluna de `items`, e só o cadastro de item a
   * grava. Na tela de despesa o check aparecia, o usuário o marcava e o valor NÃO chegava
   * ao banco — um controle que não persiste é pior que controle ausente, porque afirma uma
   * escolha que se perde no salvar.
   */
  semFornecedorDoSimples?: boolean
}

export function PurchaseTaxCredits({
  bandeiras, custo, onToggle, onRecalc, visivel, unidadeLabel, extras, titulo, semDestinacao,
  modo = 'switch', blocoDeCusto, depoisDasLinhas, tributos, semBlocoB, semRodape, subtitulo,
  leitura, legenda, semFornecedorDoSimples,
}: Props) {
  if (!visivel) return null

  const porPosicao = modo === 'posicao'
  /**
   * QUEM VAI PARA CADA BLOCO — lido de `posicao-do-tributo.ts`, nunca decidido aqui.
   *
   * Se a tela decidisse, ela teria a sua própria ideia de quem credita, e a divergência com
   * `resolverFlagsDoItem` apareceria como crédito errado, sem nada falhar.
   */
  /**
   * QUEM VAI PARA CADA BLOCO — e, antes disso, QUEM ESTE COMPONENTE desenha.
   *
   * `tributos` filtra; `tributosPorBloco` decide a posição dentro do que sobrou. A ordem
   * importa: filtrar depois faria um tributo vedado sumir do bloco de custo de um render e
   * aparecer no do outro.
   */
  const desenhaveis = tributos ?? TRIBUTOS_CREDITAVEIS
  const todos = tributosPorBloco(bandeiras)
  const blocos = {
    credito: todos.credito.filter((t) => desenhaveis.includes(t)),
    custo: todos.custo.filter((t) => desenhaveis.includes(t)),
  }

  const linha = (t: TributoCreditavel, valor: number | null | undefined, extra?: React.ReactNode) => {
    const b = bandeiras?.[t]
    const a = AJUDA[t]
    return (
      <div
        key={t}
        style={{
          display: 'grid', gridTemplateColumns: '140px 1fr 150px', gap: 12, alignItems: 'center',
          padding: '10px 0', borderBottom: '1px solid rgba(148,163,184,0.12)',
        }}
      >
        <div style={{ display: 'grid', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            {a.rotulo}
            <Tooltip title={<><div>{a.regra}</div><div style={{ marginTop: 8, opacity: 0.85 }}>{a.naNota}</div></>}>
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
          </span>
          {legenda?.[t] && (
            <span style={{ fontSize: 11, color: '#64748b', lineHeight: 1.3 }}>{legenda[t]}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {extra}
          {/*
            A LEITURA DE QUEM MONTA O BLOCO VENCE — e, sem ela, `fmt(valor)` de sempre.
            Quem passa `leitura` tem o número e não tem um `CustoDoItem`; quem não passa
            continua vendo o apurado, ou `—` quando não há (`ausente-vs-falso.md`).
          */}
          <span style={{ color: '#94a3b8', fontSize: 13, minWidth: 92 }}>
            {leitura?.[t] ?? fmt(valor)}
          </span>
        </div>

        {/*
          VEDAÇÃO DE REGIME NÃO TEM BOTÃO — e a distinção é deliberada.
          Naquele regime o tributo NUNCA credita, para item nenhum: um botão desabilitado
          convidaria a perguntar "o que preciso mudar para habilitar?", e a resposta seria
          "nada — mude de regime". A linha diz onde o tributo está, e isso é a informação.
          As outras vedações (CST, fornecedor, sem destaque) dependem DAQUELA COMPRA: ali o
          botão existe, desabilitado, porque o usuário pode mudar o dado que o bloqueia.
        */}
        {/*
          NO MODO 'posicao' NÃO HÁ SWITCH — e é por isso que a coluna some em vez de virar
          um botão desabilitado. Um botão cinza afirmaria que a ação existe ali e está
          bloqueada; o que existe é a POSIÇÃO, e ela já está dita pelo bloco em que a linha
          está. Tributo VEDADO nem chega nesta função no modo 'posicao': ele é renderizado
          pelo bloco de custo, em leitura, com cadeado e motivo.
        */}
        {porPosicao ? (
          <span style={{ fontSize: 12, color: '#22C55E', textAlign: 'right' }}>crédito</span>
        ) : b?.tipoVedacao === 'REGIME' ? (
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
      {/*
        O SUBTÍTULO SÓ EXISTE SE ALGUÉM O PASSAR.

        Até 24/09/2026 este texto era fixo e descrevia o desenho ANTERIOR — "o custo bruto é
        o valor da compra…" — numa tela que já não mostra custo bruto. Um default novo teria
        o mesmo destino: descrever um desenho que muda. O cadastro de item continua com o
        texto de sempre, passado por ele.
      */}
      {subtitulo && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
          {subtitulo}
        </div>
      )}

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

      {/*
        O CABEÇALHO — três colunas, e a quarta SAIU em 22/09/2026 (§3 do comando).

        "Efeito no custo" dizia "sai do custo" / "soma no custo" ao lado de um botão que já
        diz a mesma coisa: ligado credita, desligado ou vedado compõe o custo. Duas colunas
        para uma informação treinam o leitor a ignorar uma delas, e o rodapé é quem mostra o
        efeito em R$ — que é o número, e não o rótulo.

        As linhas sem botão (ICMS-ST, DIFAL, FCP) continuam dizendo "sempre custo", logo
        abaixo: ali a informação NÃO está no botão, porque botão não há.
      */}
      {porPosicao && (
        <div style={{ fontSize: 12, fontWeight: 700, color: '#22C55E', marginTop: 12, marginBottom: 2 }}>
          {ROTULO_DO_BLOCO.CREDITO}
        </div>
      )}
      <div style={{
        display: 'grid', gridTemplateColumns: '140px 1fr 150px', gap: 12,
        fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4,
        paddingBottom: 6, borderBottom: '1px solid rgba(148,163,184,0.2)', marginTop: 8,
      }}>
        <span>Imposto</span>
        <span>Alíquota · regra específica · valor</span>
        <span style={{ textAlign: 'right' }}>{porPosicao ? 'Efeito' : 'Crédito'}</span>
      </div>

      {/*
        AS TRÊS LINHAS APARECEM SEMPRE, inclusive no Simples Híbrido — decisão do PO de
        20/09/2026, seção 4. Antes elas SUMIAM ali, e sumir afirma que o tributo não existe
        na compra: ele existe, compõe o custo, e o que não existe é o crédito. É a mesma
        distinção de `ausente-vs-falso.md` — a linha some, o usuário conclui que não pagou.

        NO MODO 'posicao' elas continuam aparecendo SEMPRE — o que muda é ONDE: a vedação
        manda a linha para o bloco de baixo, e é `tributosPorBloco` quem decide, lendo as
        mesmas bandeiras de `resolverFlagsDoItem`. A tela não tem opinião sobre quem credita.
      */}
      {(porPosicao ? blocos.credito : desenhaveis).map((t) => linha(
        t,
        { ICMS: v?.icms, PIS_COFINS: v?.pisCofins, IPI: v?.ipi, CBS: v?.cbs, IBS: v?.ibs }[t],
        extras?.[t] ?? (t === 'CBS' || t === 'IBS' ? (
          <Form.Item name={t === 'CBS' ? 'cbs_rate' : 'ibs_rate'} noStyle initialValue={0}>
            <PercentInput min={0} max={100} style={{ width: 110 }} onChange={() => setTimeout(onRecalc, 50)} />
          </Form.Item>
        ) : undefined),
      ))}

      {/*
        O BLOCO A VAZIO NÃO É UM BLOCO AUSENTE. No Simples os cinco descem, e um espaço em
        branco ali faria o usuário procurar o campo que sumiu. A frase diz por quê.
      */}
      {porPosicao && blocos.credito.length === 0 && (
        <div style={{ fontSize: 12, color: '#94a3b8', padding: '10px 0' }}>
          Nenhum tributo desta compra gera crédito — todos aparecem abaixo, compondo o custo.
        </div>
      )}

      {porPosicao && depoisDasLinhas}

      {/*
        O FORNECEDOR DO SIMPLES — LC 214/2025 art. 47 §9º II.
        Fica junto de CBS/IBS porque é só deles que ele trata, e é propriedade DA COMPRA:
        outra nota do mesmo item, de outro fornecedor, credita normalmente.
      */}
      {/*
        SÓ APARECE ONDE ELE ATINGE — e é por isso que a condição é sobre CBS e IBS, não sobre
        o bloco. Com a tela de despesa renderizando o componente duas vezes, um check fixo
        apareceria nos DOIS e o usuário veria a mesma pergunta em lugares que tratam de
        tributos diferentes.
      */}
      {!semFornecedorDoSimples && (desenhaveis.includes('CBS') || desenhaveis.includes('IBS')) && (
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
      )}

      {/*
        BLOCO B — "Não gera crédito — compõe o custo".

        No modo 'switch' esta seção é o que sempre foi: ICMS-ST, DIFAL e FCP, sem botão,
        porque não há caso em que creditem. No modo 'posicao' ela ganha duas coisas:

        1. os tributos CREDITÁVEIS que desceram — em LEITURA, com cadeado e motivo quando a
           vedação é da lei. Um campo editável ali convidaria a digitar um crédito que o
           regime não dá;
        2. os campos em R$ que quem monta o bloco fornece (`blocoDeCusto`) — e eles são SÓ
           R$ na nota: ST e FCP vêm em valor no documento (vICMSST, vFCPUFDest), o DIFAL é
           resultado de base dupla, e a parcela não creditável do IPI não tem base própria.
           Um seletor de % ali convidaria a digitar "4%" e produziria um número que a nota
           não tem.
      */}
      {porPosicao && !semBlocoB && (
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', marginTop: 18, marginBottom: 6 }}>
          {ROTULO_DO_BLOCO.CUSTO}
        </div>
      )}
      {porPosicao && !semBlocoB && blocos.custo.map((t) => {
        const b = bandeiras?.[t]
        const a = AJUDA[t]
        return (
          <div key={t} style={{
            display: 'grid', gridTemplateColumns: '140px 1fr 150px', gap: 12, alignItems: 'center',
            padding: '8px 0', borderBottom: '1px solid rgba(148,163,184,0.12)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {a.rotulo}
              {/* A AJUDA ACOMPANHA A LINHA para onde ela for: o "onde achar na NF-e" é a
                  informação que o usuário não tem como adivinhar, e ela não depende de o
                  tributo creditar ou não. */}
              <Tooltip title={<><div>{a.regra}</div><div style={{ marginTop: 8, opacity: 0.85 }}>{a.naNota}</div></>}>
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>
              {fmt({ ICMS: v?.icms, PIS_COFINS: v?.pisCofins, IPI: v?.ipi, CBS: v?.cbs, IBS: v?.ibs }[t])}
              {b?.vedado && b.motivo && (
                <Tooltip title={b.motivo}>
                  <LockOutlined style={{ color: '#fca5a5', marginLeft: 8 }} />
                </Tooltip>
              )}
            </span>
            <span style={{ fontSize: 12, color: '#fca5a5', textAlign: 'right' }}>
              {b?.vedado ? 'vedado — custo' : 'custo'}
            </span>
          </div>
        )
      })}

      {porPosicao && blocoDeCusto}

      {/*
        AS TRÊS LINHAS DE TEXTO — ICMS-ST, DIFAL e FCP — SÃO PARTE DO BLOCO B.

        No cadastro de item elas continuam: ali esses tributos não têm campo próprio no
        bloco, e dizer "sempre custo" é a informação. Na tela de despesa eles TÊM campo, no
        bloco 1A — e repeti-los aqui como texto ensinaria que não são editáveis.
      */}
      {!semBlocoB && (
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
      )}

      {/*
        ════ O RODAPÉ EM TRÊS CARDS — §5 do comando de 27/09/2026 ════

        Eram quatro linhas numa lista. Viraram três cards lado a lado, e a ordem é a leitura:
        o que saiu do caixa, o que volta, e o que sobra para formar o preço.

        "Custo bruto" virou TOTAL DO ITEM. O rótulo antigo descrevia a conta; o novo descreve
        a coisa — é UM ITEM, e não uma nota com vários. O card do meio traz o percentual,
        porque o valor sozinho não diz se o crédito é relevante: R$ 422,84 numa compra de mil
        e quatrocentos é quase um terço, e numa de cem mil é ruído.
      */}
      {!semRodape && (
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(148,163,184,0.2)', display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <div style={{ padding: '10px 12px', background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 0.3 }}>TOTAL DO ITEM</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{fmt(custo?.custoBruto)}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>valor bruto</div>
          </div>

          <div style={{ padding: '10px 12px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 6 }}>
              CRÉDITO DO IMPOSTO
              {creditos && (
                <Tooltip
                  title={(Object.keys(AJUDA) as TributoCreditavel[])
                    .filter((t) => creditos[t] > 0)
                    .map((t) => `${AJUDA[t].rotulo}: R$ ${getMonetaryValue(creditos[t])}`)
                    .join(' · ') || 'Nenhum tributo desta compra gera crédito.'}
                >
                  <InfoCircleOutlined style={{ color: '#64748b' }} />
                </Tooltip>
              )}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#22C55E' }}>− {fmt(custo?.creditoTotal ?? 0)}</div>
            {/*
              Travessão quando o bruto é zero: uma divisão por zero exibida como 0,00%
              afirmaria que nada creditou (`ausente-vs-falso.md`).
            */}
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {custo && custo.custoBruto > 0
                ? `${getMonetaryValue((custo.creditoTotal / custo.custoBruto) * 100)}% do que foi pago`
                : '— do que foi pago'}
            </div>
          </div>

          <div style={{ padding: '10px 12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 0.3 }}>CUSTO LÍQUIDO</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#22C55E' }}>{fmt(custo?.custoLiquido)}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>é ele que forma o preço</div>
          </div>
        </div>

        {/*
          O QUARTO NÚMERO, abaixo dos cards — e é ele que a receita do produto consome.
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
      )}
    </div>
  )
}

export default PurchaseTaxCredits
