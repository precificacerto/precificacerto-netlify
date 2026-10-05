/**
 * aplicar-grade.ts — a cópia da grade de um funcionário para vários, destino por destino.
 *
 * Comando do PO de 05/10/2026, §3.
 *
 * >>> POR QUE A LÓGICA MORA AQUI E NÃO DENTRO DA ROTA <<<
 *
 * O §6 manda falsificar mostrando o caso vermelho na asserção de ESTADO FINAL DAS FAIXAS. Com a
 * sequência escrita dentro do handler, nenhum caso do jest a executaria: o jest não fala com o
 * Postgres, e o único portão possível seria afirmar o TEXTO do arquivo — que fica verde se
 * alguém trocar a ordem das operações preservando as palavras. É `portao-que-nao-alcanca.md`
 * exatamente: o portão existiria e não alcançaria o que diz proteger.
 *
 * Com o repositório injetado, o caso roda a sequência INTEIRA contra um armazém em memória e
 * afirma quais faixas sobraram. Desfazer o apagar deixa o destino com a grade velha MAIS a nova,
 * e a asserção de estado final fica vermelha.
 *
 * ── O QUE ESTA FUNÇÃO GARANTE, E O QUE ELA NÃO É ──────────────────────────────────────────
 *
 * O comando pede "ou todas as faixas do destino trocam, ou nenhuma". Isto é o que existe, e é
 * importante NÃO chamar de transação de banco o que não é:
 *
 * O PostgREST não expõe transação de múltiplos statements. Uma transação REAL exigiria uma
 * função `plpgsql` — ou seja DDL, ou seja MIGRAÇÃO, que o §5 desta rodada proíbe. O que existe é
 * uma SEQUÊNCIA COMPENSADA, por destino:
 *
 *   1. INSERE as faixas novas, guardando os ids que voltaram;
 *   2. APAGA as antigas, pelos ids lidos antes;
 *   3. se o passo 2 falhar, APAGA o que o passo 1 inseriu — o destino volta ao estado anterior e
 *      é marcado como NÃO aplicado.
 *
 * A ORDEM É INSERIR-DEPOIS-APAGAR, e é escolha: se o INSERT falha, o destino continua com a
 * grade inteira — nada foi perdido. Na ordem inversa, um INSERT que falhasse depois do DELETE
 * deixaria o destino VAZIO, que é o "pela metade" que o comando proíbe. O custo é uma janela
 * curta em que velhas e novas coexistem; o ganho é que nenhuma falha apaga grade sem repor.
 *
 * Cada destino é independente: um que falhe não impede nem corrompe os outros.
 */

export interface FaixaParaCopiar {
  weekday: number
  start_time: string
  end_time: string
  is_active?: boolean
}

export interface FaixaPersistida extends FaixaParaCopiar {
  id: string
  employee_id: string
}

/**
 * O que a sequência precisa do mundo. Três operações, e nenhuma delas sabe de HTTP ou de
 * Supabase — é o que permite o caso rodar a mesma sequência em memória.
 */
export interface RepositorioDaGrade {
  lerFaixas: (employee_id: string) => Promise<FaixaPersistida[]>
  /** Devolve os ids criados — a compensação depende deles. */
  inserirFaixas: (employee_id: string, faixas: FaixaParaCopiar[]) => Promise<string[]>
  apagarFaixas: (ids: string[]) => Promise<void>
}

export interface ResultadoPorDestino {
  destino_id: string
  aplicado: boolean
  apagadas: number
  criadas: number
  erro?: string
}

export async function aplicarGradeEmDestinos(
  repo: RepositorioDaGrade,
  origem_id: string,
  destino_ids: readonly string[],
): Promise<ResultadoPorDestino[]> {
  // A grade da origem é LIDA, nunca recebida: aceitar as faixas de quem chama deixaria gravar
  // faixa que nunca passou pela validação de sobreposição.
  const faixasDaOrigem = (await repo.lerFaixas(origem_id)).map((f) => ({
    weekday: f.weekday,
    start_time: f.start_time,
    end_time: f.end_time,
    is_active: f.is_active !== false,
  }))

  const resultados: ResultadoPorDestino[] = []

  for (const destino_id of destino_ids) {
    let idsAntigos: string[] = []
    let idsNovos: string[] = []
    try {
      idsAntigos = (await repo.lerFaixas(destino_id)).map((f) => f.id)

      // passo 1 — INSERE primeiro. Falha aqui não apaga nada.
      if (faixasDaOrigem.length > 0) {
        idsNovos = await repo.inserirFaixas(destino_id, faixasDaOrigem)
      }

      // passo 2 — APAGA as antigas
      if (idsAntigos.length > 0) {
        try {
          await repo.apagarFaixas(idsAntigos)
        } catch (e: any) {
          // passo 3 — COMPENSAÇÃO. Sem ela o destino ficaria com velhas MAIS novas, que é pior
          // que metade: faixas duplicadas e sobrepostas que a tela não recusou.
          if (idsNovos.length > 0) {
            try { await repo.apagarFaixas(idsNovos) } catch { /* nada a fazer além de reportar */ }
          }
          resultados.push({ destino_id, aplicado: false, apagadas: 0, criadas: 0, erro: String(e?.message ?? e) })
          continue
        }
      }

      resultados.push({ destino_id, aplicado: true, apagadas: idsAntigos.length, criadas: idsNovos.length })
    } catch (e: any) {
      resultados.push({ destino_id, aplicado: false, apagadas: 0, criadas: 0, erro: String(e?.message ?? e) })
    }
  }

  return resultados
}
