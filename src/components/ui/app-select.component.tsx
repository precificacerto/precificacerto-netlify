import { Select as AntSelect } from 'antd'
import type { RefSelectProps, SelectProps } from 'antd'
import React, { forwardRef, useCallback, useRef, useState } from 'react'

/**
 * AppSelect — Select base do sistema (PC-UI-DROPDOWN-MAXHEIGHT-007).
 *
 * Problema corrigido: os dropdowns do Ant Design usam um `listHeight` fixo
 * (padrão ~256px), exibindo apenas ~6 itens mesmo quando há muito espaço livre
 * na tela. Este wrapper substitui esse valor fixo por uma altura calculada
 * dinamicamente a cada abertura, em relação ao espaço real disponível entre o
 * campo e a borda da viewport.
 *
 * Regras (definidas pelo Product Owner):
 *  - Sem número arbitrário de itens: usa o MAIOR espaço vertical disponível.
 *  - O Ant Design já faz o auto-flip (abre para cima quando há mais espaço
 *    acima), então medimos `max(espaço abaixo, espaço acima)` e deixamos o
 *    posicionamento com a lib — nunca corta na borda da tela.
 *  - Rolagem interna permanece apenas como fallback, quando a lista excede o
 *    espaço disponível.
 *
 * A prop `listHeight` explícita, se informada, ainda tem precedência (permite
 * casos especiais), mas o padrão do sistema passa a ser o cálculo dinâmico.
 */

const MIN_DROPDOWN_HEIGHT = 240
const VIEWPORT_MARGIN = 24

const AppSelectBase = forwardRef<RefSelectProps, SelectProps>(function AppSelectBase(
  { listHeight, onOpenChange, ...rest },
  ref,
) {
  const [dynamicHeight, setDynamicHeight] = useState<number | undefined>(undefined)
  const innerRef = useRef<RefSelectProps | null>(null)

  const attachRef = useCallback(
    (node: RefSelectProps | null) => {
      innerRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as any).current = node
    },
    [ref],
  )

  const recomputeHeight = useCallback(() => {
    if (typeof window === 'undefined') return
    let available = window.innerHeight - VIEWPORT_MARGIN * 2
    const el = (innerRef.current as unknown as { nativeElement?: HTMLElement })?.nativeElement
    if (el && typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
      const spaceAbove = rect.top - VIEWPORT_MARGIN
      // Ant Design abre para o lado com mais espaço (auto-flip): usamos o maior.
      available = Math.max(spaceBelow, spaceAbove)
    }
    setDynamicHeight(Math.max(MIN_DROPDOWN_HEIGHT, Math.floor(available)))
  }, [])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) recomputeHeight()
      onOpenChange?.(open)
    },
    [onOpenChange, recomputeHeight],
  )

  return (
    <AntSelect
      {...rest}
      ref={attachRef}
      listHeight={listHeight ?? dynamicHeight}
      onOpenChange={handleOpenChange}
    />
  )
})

type AntSelectType = typeof AntSelect
const AppSelect = AppSelectBase as unknown as AntSelectType & {
  Option: typeof AntSelect.Option
  OptGroup: typeof AntSelect.OptGroup
}
AppSelect.Option = AntSelect.Option
AppSelect.OptGroup = AntSelect.OptGroup

export type { SelectProps }
export { AppSelect as Select }
export default AppSelect
