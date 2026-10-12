/**
 * A AUTORIZAÇÃO DO DESCONTO — ESPEC Parte VII.2, um componente para as três telas.
 *
 * >>> POR QUE ELE EXISTE: AS TRÊS CÓPIAS JÁ TINHAM DIVERGIDO <<<
 *
 * O bloco de Alert + Checkbox nasceu escrito três vezes — `orcamentos/index.tsx`,
 * `vendas/index.tsx` e `pedidos/index.tsx` — e a terceira cópia já saiu **sem o parágrafo do
 * modo de absorção**, o que a VII.5 manda exibir ("congelar AUMENTA o descoberto"). É
 * `copia-divergente.md` na forma exata que a regra descreve: o mesmo mapeamento escrito duas
 * vezes, uma esquecendo um campo, e nada falha — porque texto que falta não levanta erro.
 *
 * O remédio daquela regra é explícito e não é conferir as três: **é apagar duas.** Com um
 * componente só, acrescentar um parágrafo vale para as três telas, e a omissão deixa de ser
 * possível em vez de ser improvável.
 *
 * E é esta extração que torna o portão de COMPONENTE possível. Enquanto o bloco morava dentro
 * de três páginas de milhares de linhas, cada uma com dezenas de hooks, Supabase e router, o
 * Alert e o Checkbox só podiam ser afirmados por LEITURA DO FONTE (`expect(src).toContain`),
 * que é afirmar CAMINHO e não EFEITO — o que `teste-que-nao-exercita.md` nomeia na variante 3.
 * Aqui eles são renderizados, clicados e medidos.
 *
 * O `useAutorizacaoDoDesconto` mora neste arquivo, e não em `limite-de-desconto.ts`, porque
 * aquele módulo é puro e é consumido pelo motor; um `useState` ali o tornaria React-only.
 */

import React, { useEffect, useState } from 'react'
import { Alert, Checkbox } from 'antd'
import {
  ROTULO_DA_AUTORIZACAO,
  mensagemDoLimite,
  type EstadoDoDesconto,
} from '@/utils/limite-de-desconto'
import { formatBRL } from '@/utils/formatters'

/** Os três modos de absorção, com o rótulo que a VII.5 manda exibir. */
export type ModoDeAbsorcao = 'PROPORTIONAL' | 'SELLER_REDUCTION' | 'PROFIT_REDUCTION'

const ROTULO_DO_MODO: Record<ModoDeAbsorcao, string> = {
  PROPORTIONAL: 'Proporcional',
  SELLER_REDUCTION: 'Congela Comissão',
  PROFIT_REDUCTION: 'Congela Lucro',
}

/**
 * O estado da autorização, com o RESET na mudança do desconto.
 *
 * O reset é a regra, não conveniência: autorizar 40% **não é** autorizar 60%. A mensagem
 * nomeia o percentual, e a autorização vale para o número que foi lido. Autorização que
 * sobrevive à mudança do número autoriza o que ninguém leu.
 *
 * Ele mora aqui para que as três telas não o reimplementem — era o caminho da quarta cópia:
 * `orcamentos` e `vendas` resetavam no `onChange` de CADA input de desconto (dois cada), e
 * `pedidos` num `useEffect`. Cinco pontos de reset para uma regra só.
 */
export function useAutorizacaoDoDesconto(descontoPct: number): {
  autorizado: boolean
  setAutorizado: (v: boolean) => void
} {
  const [autorizado, setAutorizado] = useState(false)
  useEffect(() => { setAutorizado(false) }, [descontoPct])
  return { autorizado, setAutorizado }
}

export interface AutorizacaoDoDescontoProps {
  /** O estado da VII.2. `VERDE` não renderiza nada — e isso é requisito, não otimização. */
  estado: EstadoDoDesconto
  /** O desconto digitado, em FRAÇÃO. */
  descontoFracao: number
  /** O `d_máximo` da VII.3 em FRAÇÃO. `null` = não calculável, e aí não há bloco. */
  limiteFracao: number | null
  /** Tributos que a matriz manda somar e cuja alíquota não chegou ao motor. */
  limiteIncompleto?: readonly string[]
  /** O descoberto (R$). Abaixo de meio centavo a linha não é emitida. */
  descoberto?: number
  /** O modo de absorção vigente — decide o parágrafo da VII.5. */
  modo?: ModoDeAbsorcao
  /** Como o documento se chama na frase do descoberto: "esta venda", "este pedido". */
  nomeDoDocumento: string
  autorizado: boolean
  onAutorizadoChange: (v: boolean) => void
  style?: React.CSSProperties
}

/**
 * Renderiza o bloco dos estados AMARELO e VERMELHO_AUTORIZADO. No VERDE devolve `null`.
 *
 * O `#B54708` do aviso de limite incompleto é deliberado e CORRIGE as duas cópias antigas:
 * elas usavam `#facc15`, que é amarelo claro sobre o fundo claro do Alert `warning` do antd —
 * o aviso existia e não se lia. A terceira cópia já usava um tom escuro.
 */
export function AutorizacaoDoDesconto(props: AutorizacaoDoDescontoProps) {
  const { estado, limiteFracao } = props
  if (limiteFracao == null) return null
  if (estado === 'VERDE') return null

  const incompleto = props.limiteIncompleto ?? []
  const descoberto = Number(props.descoberto) || 0
  const modo = props.modo ?? 'PROPORTIONAL'

  return (
    <Alert
      type={estado === 'AMARELO' ? 'warning' : 'error'}
      showIcon
      style={props.style ?? { marginTop: 8 }}
      message={estado === 'AMARELO'
        ? 'Desconto acima do limite consolidado'
        : 'Desconto autorizado — operação em lucro zero'}
      description={
        <div>
          <p style={{ margin: '0 0 8px' }}>
            {mensagemDoLimite({
              descontoFracao: props.descontoFracao,
              limiteFracao,
            })}
          </p>
          {incompleto.length > 0 && (
            /* `ausente-vs-falso.md`: o limite está INCOMPLETO, e dizer isso é diferente de
               exibi-lo como apurado. Sem alíquota o tributo contribui zero, e o limite sai
               mais FROUXO que o real. */
            <p style={{ margin: '0 0 8px', color: '#B54708' }}>
              Limite calculado SEM {incompleto.join(', ')} — a alíquota não chegou ao motor,
              então o limite acima está mais frouxo que o real.
            </p>
          )}
          {descoberto > 0.005 && (
            <p style={{ margin: '0 0 8px' }}>
              <strong>Descoberto: {formatBRL(descoberto)}</strong>
              {' '}— o que {props.nomeDoDocumento} deixa de cobrir. No modo{' '}
              <strong>{ROTULO_DO_MODO[modo]}</strong>.
              {modo !== 'PROPORTIONAL'
                && ' Congelar AUMENTA o descoberto: a empresa paga o que congelou com dinheiro'
                 + ' que a operação não trouxe.'}
            </p>
          )}
          <Checkbox
            checked={props.autorizado}
            onChange={(e) => props.onAutorizadoChange(e.target.checked)}
          >
            {ROTULO_DA_AUTORIZACAO}
          </Checkbox>
        </div>
      }
    />
  )
}
