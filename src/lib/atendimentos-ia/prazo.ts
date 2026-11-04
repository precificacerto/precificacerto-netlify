/**
 * O PRAZO de uma chamada externa (dono do produto, 04/11/2026): "hoje ela não tem limite e o turno inteiro morre em
 * silêncio". Em 04/11/2026 a 1ª chamada ao modelo ficou 49 s sem voltar e a Vercel matou a função aos 60 s, sem linha
 * de log e sem resposta ao vendedor.
 *
 * Um `AbortController` que dispara em `ms`. Quem chama passa o `signal` ao `fetch` (ele interrompe a conexão E a
 * leitura do corpo) e, no `catch`, pergunta `estourou()` para distinguir o prazo da falha de rede. `limpar()` cancela o
 * despertador quando a chamada volta a tempo — sem isso o timer segura o processo.
 *
 * Por que `setTimeout` e não `AbortSignal.timeout`: o Jest finge os timers globais, e é com eles que o teste adianta o
 * relógio; o timer interno do `AbortSignal.timeout` não é fingido.
 */
export type Prazo = { signal: AbortSignal; estourou: () => boolean; limpar: () => void }

export function prazo(ms: number): Prazo {
    const controlador = new AbortController()
    const despertador = setTimeout(() => controlador.abort(), ms)
    return { signal: controlador.signal, estourou: () => controlador.signal.aborted, limpar: () => clearTimeout(despertador) }
}
