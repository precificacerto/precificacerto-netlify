/**
 * Injeta `data-label` em cada <td> das tabelas AntD lendo o <th> correspondente.
 * Alimenta as pseudo-classes CSS `::before { content: attr(data-label) }` que
 * exibem o rótulo da coluna acima de cada valor no modo mobile (≤ 640px).
 *
 * Ativação única via `initMobileTableLabels()` no _app.tsx.
 * Opt-out por tabela: adicione a classe `.no-mobile-stack` no wrapper `.ant-table-wrapper`.
 */

let observer: MutationObserver | null = null
let scheduled = false

function stampTable(wrapper: Element): void {
  if (wrapper.classList.contains('no-mobile-stack')) return

  const headers = wrapper.querySelectorAll<HTMLTableCellElement>('thead.ant-table-thead > tr > th')
  if (headers.length === 0) return

  const labels: string[] = Array.from(headers).map((th) => {
    const titleEl = th.querySelector('.ant-table-column-title') as HTMLElement | null
    const raw = (titleEl?.textContent || th.textContent || '').trim()
    return raw
  })

  const rows = wrapper.querySelectorAll<HTMLTableRowElement>(
    'tbody.ant-table-tbody > tr.ant-table-row'
  )
  rows.forEach((tr) => {
    const cells = tr.querySelectorAll<HTMLTableCellElement>(':scope > td')
    cells.forEach((td, idx) => {
      const label = labels[idx]
      if (!label || label.length === 0) {
        if (td.hasAttribute('data-label')) td.removeAttribute('data-label')
        return
      }
      if (td.getAttribute('data-label') !== label) {
        td.setAttribute('data-label', label)
      }
    })
  })
}

function stampAll(): void {
  scheduled = false
  if (typeof document === 'undefined') return
  const wrappers = document.querySelectorAll<HTMLElement>('.ant-table-wrapper')
  wrappers.forEach(stampTable)
}

function scheduleStamp(): void {
  if (scheduled) return
  scheduled = true
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(stampAll)
  } else {
    setTimeout(stampAll, 16)
  }
}

export function initMobileTableLabels(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (observer) return () => {}

  scheduleStamp()

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
        scheduleStamp()
        return
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  return () => {
    observer?.disconnect()
    observer = null
  }
}
