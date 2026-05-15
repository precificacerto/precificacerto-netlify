/**
 * Wrapper para exports (PDF/Excel) — captura erros e exibe ao usuário.
 *
 * @example
 * await safeExport(
 *   async () => { ... pdf/excel logic ... },
 *   messageApi.error,
 *   'Erro ao exportar relatório',
 * )
 */
export async function safeExport(
  fn: () => Promise<void> | void,
  onError: (msg: string) => void,
  label = 'Erro ao exportar',
): Promise<void> {
  try {
    await fn()
  } catch (e: any) {
    const detail = e?.message || 'Erro desconhecido'
    console.error(label, e)
    onError(`${label}: ${detail}`)
  }
}
