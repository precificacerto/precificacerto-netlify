import { useEffect, useState } from 'react'

/**
 * Retorna uma chave incrementada sempre que a aba volta a ficar visível
 * (visibilitychange) ou a janela ganha foco. Útil para revalidar dados
 * sem exigir reload manual quando o usuário edita o HUB em outra aba.
 *
 * Sprint Mai/2026 — MO Administrativa reativa (espelho HUB → Produtos/Serviços).
 */
export function useRevalidateOnFocus(): number {
  const [revalidationKey, setRevalidationKey] = useState(0)

  useEffect(() => {
    const trigger = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setRevalidationKey((k) => k + 1)
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', trigger)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', trigger)
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', trigger)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', trigger)
      }
    }
  }, [])

  return revalidationKey
}
