/**
 * ordenar-ausencias.ts — futuras e em curso primeiro; passadas no fim, esmaecidas.
 *
 * Comando do PO de 08/10/2026, quarta rodada do dia.
 *
 * >>> `agora` É INJETADO, E ISSO NÃO É PREFERÊNCIA DE ESTILO <<<
 *
 * `new Date()` dentro da função poria o relógio na renderização: o mesmo dado produziria
 * resultados diferentes conforme o minuto, e o caso de teste passaria hoje e falharia na
 * virada do dia. É a mesma decisão de `horarios-disponiveis.ts`, e ela já tem portão lá.
 *
 * O dono do produto confirmou a forma nesta rodada: *"Utilitario puro com `agora` injetado,
 * igual a horarios-disponiveis.ts."*
 *
 * ── EM CURSO NÃO É PASSADA, E É A DISTINÇÃO QUE O ARQUIVO EXISTE PARA FAZER ─────────────
 *
 * `passada = ends_at < agora`. Uma ausência que COMEÇOU antes de agora e termina depois está
 * acontecendo — o profissional está fora HOJE, e esmaecê-la no fim da lista esconderia o
 * estado mais importante da tela.
 *
 * `passada = starts_at < agora` seria o erro natural de quem escreve rápido, e é a mutação
 * M14. O caso "em curso" existe para pegá-la, e nenhum outro caso desta suíte a distingue:
 * numa ausência inteiramente futura ou inteiramente passada os dois critérios coincidem.
 */

export type AusenciaParaOrdenar = {
  id: string
  starts_at: string
  ends_at: string
  reason?: string | null
}

export type AusenciaOrdenada = AusenciaParaOrdenar & {
  /** Terminou antes de `agora`. Em curso é `false`. */
  passada: boolean
}

export function ordenarAusencias(params: {
  ausencias: AusenciaParaOrdenar[]
  agora: Date
}): AusenciaOrdenada[] {
  const lista = params?.ausencias ?? []
  // `agora` ausente vira `NaN`, e `x < NaN` é `false`: nada é marcado como passada. É a
  // escolha correta para um dado que não se tem — `ausente-vs-falso.md`: sem relógio, afirmar
  // "já passou" seria afirmar o que não se apurou.
  const agoraMs = params?.agora ? params.agora.getTime() : NaN

  const comMarca: AusenciaOrdenada[] = lista
    .filter((a) => !!a)
    .map((a) => ({
      ...a,
      // >>> `ends_at`, NÃO `starts_at` <<< — ver a nota do cabeçalho e a mutação M14.
      passada: !Number.isNaN(agoraMs) && new Date(a.ends_at).getTime() < agoraMs,
    }))

  const inicio = (a: AusenciaOrdenada) => new Date(a.starts_at).getTime()

  // ── A ORDEM, E OS DOIS SENTIDOS SÃO DELIBERADOS ───────────────────────────────────────
  //
  // Não-passadas por `starts_at` CRESCENTE: a próxima a acontecer vem primeiro, porque é a que
  // o dono do salão precisa ver ao abrir a tela.
  //
  // Passadas por `starts_at` DECRESCENTE: entre as velhas, a mais recente primeiro. Elas estão
  // ali como histórico, e histórico se lê do mais novo para o mais antigo.
  //
  // Pôr as passadas primeiro é a mutação M15, e o caso da ordem existe para pegá-la.
  const naoPassadas = comMarca.filter((a) => !a.passada).sort((x, y) => inicio(x) - inicio(y))
  const passadas = comMarca.filter((a) => a.passada).sort((x, y) => inicio(y) - inicio(x))

  return [...naoPassadas, ...passadas]
}
