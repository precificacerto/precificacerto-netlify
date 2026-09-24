/**
 * entrada-de-imposto.component.tsx — o campo de UMA linha de imposto, em % ou em R$.
 *
 * Comando do dono do produto de 22/09/2026, §4: *"Cada linha de imposto ganha um seletor
 * **% | R$**"*, e *"**Proibido** reimplementar a conta dentro da tela"*.
 *
 * >>> ESTE COMPONENTE NÃO CONVERTE NADA <<<
 *
 * Ele desenha o seletor e o input. Toda conversão vem de `entrada-de-imposto.ts`, que lê a
 * base em `baseDoTributo` — a mesma função que a conta do imposto usa. Se a conversão
 * morasse aqui, a base do PIS/COFINS seria a que quem escreveu o componente lembrasse, e o
 * número fecharia consigo mesmo (`copia-divergente.md`).
 *
 * >>> A ALÍQUOTA É SEMPRE O QUE SAI DAQUI <<<
 *
 * `onChange` devolve alíquota, em qualquer formato. O R$ é uma forma de ENTRADA, não um
 * segundo valor de verdade — é isso que faz a troca de formato não mexer no imposto
 * calculado, em vez de "não mexer porque os dois caminhos dão o mesmo número".
 */
import React from 'react'
import { Input, Select, Tooltip } from 'antd'
import PercentInput from '@/components/percent-input.component'
import {
  aliquotaAPartirDoValor,
  valorAPartirDaAliquota,
  converterFormato,
  baseDisponivel,
  MENSAGEM_SEM_BASE,
  CASAS_DO_VALOR,
  type FormatoDaEntrada,
} from '@/utils/entrada-de-imposto'

/**
 * `value`/`onChange` em vez de `aliquotaPct`/`onAliquota` porque é o contrato que o
 * `Form.Item` do AntD injeta. Sem ele, a alíquota precisaria de um segundo lugar para viver
 * fora do formulário — e dois lugares para o mesmo número é como a divergência começa.
 */
interface Props {
  /** A alíquota, em percentual. `null`/`undefined` = não informada, e ela some da conta. */
  value?: number | null
  onChange?: (pct: number | null) => void
  /** A base daquela linha — já resolvida por quem monta o bloco, nunca recomposta aqui. */
  base: number
  formato: FormatoDaEntrada
  onFormato: (f: FormatoDaEntrada) => void
  disabled?: boolean
  /**
   * O seletor sai da linha e vira um LINK de uma palavra.
   *
   * Comando de 24/09/2026, §3: *"O seletor % continua existindo para o caso raro, mas
   * recolhido: R$ é o que aparece."* O ICMS vem sempre destacado na nota, então a linha
   * dele é o campo em R$ e mais nada — e o caso raro continua alcançável em um clique.
   *
   * O link mostra o formato para o qual ele TROCA, nunca o atual: um link escrito "R$"
   * dentro de uma linha que já está em R$ seria lido como estado, e clicá-lo pareceria
   * não fazer nada.
   */
  seletorRecolhido?: boolean
}

/** O texto do campo em R$, no formato brasileiro e sem truncar dígito. */
const paraTexto = (v: number | null): string =>
  v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: CASAS_DO_VALOR, maximumFractionDigits: CASAS_DO_VALOR })

/** O inverso: aceita "1.800,00" e "1800.00", e devolve `null` para vazio. */
const doTexto = (s: string): number | null => {
  const limpo = s.replace(/[^\d,.-]/g, '')
  if (limpo.trim() === '') return null
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

export function EntradaDeImposto({ value, onChange, base, formato, onFormato, disabled, seletorRecolhido }: Props) {
  const aliquotaPct = value ?? null
  const onAliquota = (pct: number | null) => onChange?.(pct)
  const temBase = baseDisponivel(base)

  /**
   * O texto do campo em R$ vive em estado PRÓPRIO enquanto o usuário digita.
   *
   * Derivá-lo da alíquota a cada tecla faria "1.8" virar "1,80" no meio da digitação, e o
   * cursor pular. O estado só é ressincronizado quando a alíquota muda por FORA — troca de
   * formato, reabertura, mudança do valor total da nota.
   */
  const [texto, setTexto] = React.useState<string>(() => paraTexto(valorAPartirDaAliquota(aliquotaPct, base)))
  const ultimaAliquota = React.useRef<number | null>(aliquotaPct)
  const ultimaBase = React.useRef<number>(base)

  React.useEffect(() => {
    const mudouPorFora = ultimaAliquota.current !== aliquotaPct || ultimaBase.current !== base
    ultimaAliquota.current = aliquotaPct
    ultimaBase.current = base
    if (!mudouPorFora) return
    const atual = doTexto(texto)
    const esperado = valorAPartirDaAliquota(aliquotaPct, base)
    // Só reescreve quando o que está na tela JÁ não representa o número — assim digitar não
    // é interrompido, e a mudança do valor total da nota reflete no campo.
    if (atual != null && esperado != null && Math.abs(atual - esperado) < 0.005) return
    setTexto(paraTexto(esperado))
  }, [aliquotaPct, base, texto])

  const trocar = (novo: FormatoDaEntrada) => {
    if (novo === formato) return
    const r = converterFormato({
      de: formato,
      para: novo,
      aliquotaPct,
      valor: doTexto(texto),
      base,
    })
    if (novo === 'BRL') setTexto(paraTexto(r.valor))
    onAliquota(r.aliquotaPct)
    onFormato(novo)
  }

  const outro: FormatoDaEntrada = formato === 'BRL' ? 'PCT' : 'BRL'
  const seletor = seletorRecolhido ? (
    <Tooltip title={outro === 'PCT' ? 'informar a alíquota em vez do valor' : 'informar o valor destacado na nota'}>
      <a
        onClick={(ev) => { ev.preventDefault(); if (!disabled && !(outro === 'BRL' && !temBase)) trocar(outro) }}
        style={{
          fontSize: 11, color: '#64748b', textDecoration: 'underline',
          cursor: disabled || (outro === 'BRL' && !temBase) ? 'not-allowed' : 'pointer',
        }}
      >
        {outro === 'PCT' ? '%' : 'R$'}
      </a>
    </Tooltip>
  ) : (
    <Select<FormatoDaEntrada>
      value={formato}
      onChange={trocar}
      size="small"
      style={{ width: 62 }}
      disabled={disabled}
      options={[
        { value: 'PCT', label: '%' },
        {
          value: 'BRL',
          label: 'R$',
          // O comando manda desabilitar o CAMPO sem base. Desabilitar a OPÇÃO junto evita o
          // estado intermediário em que o usuário escolhe R$ e encontra um campo morto sem
          // saber por quê — a mensagem aparece no lugar do campo de qualquer forma.
          disabled: !temBase,
        },
      ]}
    />
  )

  if (formato === 'BRL' && !temBase) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {seletor}
        <Tooltip title={MENSAGEM_SEM_BASE}>
          <Input disabled style={{ width: 130 }} placeholder={MENSAGEM_SEM_BASE} />
        </Tooltip>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {seletor}
      {formato === 'PCT' ? (
        <PercentInput
          value={aliquotaPct}
          min={0}
          max={100}
          decimals={4}
          disabled={disabled}
          style={{ width: 110 }}
          onChange={(v) => onAliquota(v == null || Number.isNaN(v) ? null : v)}
        />
      ) : (
        <Input
          prefix="R$"
          value={texto}
          disabled={disabled}
          style={{ width: 130 }}
          placeholder="0,00"
          onChange={(e) => {
            setTexto(e.target.value)
            onAliquota(aliquotaAPartirDoValor(doTexto(e.target.value), base))
          }}
        />
      )}
    </div>
  )
}

export default EntradaDeImposto
