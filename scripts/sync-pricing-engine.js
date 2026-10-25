#!/usr/bin/env node
/**
 * sync-pricing-engine.js — espelha o GRAFO do motor de preço para a edge function.
 *
 * Uso:
 *   node scripts/sync-pricing-engine.js                 # espelha o grafo
 *   node scripts/sync-pricing-engine.js --check         # igualdade + resolução (CI)
 *   node scripts/sync-pricing-engine.js --check-imports # só a resolução (CI, passo próprio)
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * >>> POR QUE ELE PASSOU A SINCRONIZAR UM GRAFO, E NÃO UM ARQUIVO <<<
 *
 * Até 12/10/2026 este script copiava UM arquivo e comparava o checksum dele. Isso bastava
 * enquanto `pricing-engine.ts` era puro — e o cabeçalho dele avisava, com todas as letras:
 * *"Todo import novo neste arquivo quebra o espelho."*
 *
 * O aviso foi desobedecido pelo próprio PR que o escreveu: a inversão de dependência da matriz
 * (`f2db6ce`) acrescentou `import { colocacaoVigente } from './matriz-fiscal'`, e o gate ficou
 * VERMELHO com `DRIFT DETECTED`. O gate funcionou — e o remédio óbvio, rodar o sync de um
 * arquivo, teria sido PIOR que o defeito: os checksums bateriam e o espelho iria para produção
 * apontando para um módulo que não existe na pasta da função.
 *
 * É a aparição 2 de `docs/regras/portao-que-nao-alcanca.md`, literal: *"o check da cópia
 * prova IGUALDADE entre os dois arquivos, nunca que qualquer um dos dois resolve seus
 * imports"*. E o corolário dela é o desenho deste arquivo: *"um portão de igualdade precisa de
 * um portão de sanidade ao lado, ou a cópia propaga o defeito com o carimbo de conforme."*
 *
 * ── A COMPARAÇÃO FICOU TOTAL ───────────────────────────────────────────────────────────────
 *
 * A versão antiga comparava o "conteúdo lógico" — o arquivo menos o primeiro bloco JSDoc —
 * porque o cabeçalho do espelho era outro. Agora o `--check` RECALCULA o que o modo de escrita
 * produziria e compara BYTE A BYTE, cabeçalho incluído. Editar o cabeçalho do espelho à mão
 * passava antes; não passa mais.
 *
 * ── A RESOLUÇÃO É AUTOMÁTICA, E É POR ISSO QUE ELA NÃO ENVELHECE ───────────────────────────
 *
 * Preferida a uma lista explícita porque a DESCOBERTA e a REESCRITA passam a ser a mesma
 * regra: o especificador que o fechamento transitivo achou é o mesmo que a reescrita aponta
 * para `./<basename>`. Com lista à mão, acrescentar um import exigiria lembrar de editar a
 * lista — exatamente a omissão que `copia-divergente.md` descreve.
 *
 * ── O QUE A REESCRITA FAZ, e ela é a parte que uma cópia crua não podia fazer ──────────────
 *
 * O Deno exige a EXTENSÃO no especificador (`./x.ts`), e o Next/Node a omite (`./x`). Então
 * nem o arquivo presente bastaria: `from './matriz-fiscal'` quebra no Deno mesmo com
 * `matriz-fiscal.ts` ao lado. O `index.ts` da função já importava `"./pricing-engine.ts"`,
 * com extensão — era o único arquivo da pasta escrito no dialeto certo.
 *
 * O alias `@/` também não existe lá: não há `deno.json`, `import_map.json` nem tsconfig
 * próprio na pasta (medido). A reescrita o resolve para o vizinho espelhado.
 *
 * ── O PREÇO DA REESCRITA, MEDIDO E ACEITO ──────────────────────────────────────────────────
 *
 * Os dois instrumentos discordam por desenho, e a discordância é antiga: o `tsconfig.json` do
 * repositório inclui todo arquivo `.ts` da árvore e exclui só `node_modules`, então o `tsc`
 * ALCANÇA esta pasta —
 * e ele não tem `allowImportingTsExtensions`, logo acusa `TS5097` em todo especificador com
 * extensão. O `index.ts` já carregava esse erro em `main` (linha 3), desde sempre.
 *
 * O espelho acrescenta UM: `pricing-engine.ts`, no `from './matriz-fiscal.ts'`. A baseline do
 * `tsc` vai de 363 para 364 por causa dele, e a troca é consciente — sem a extensão o espelho
 * não roda no Deno, que é o defeito que esta rodada corrige. Os `import type` de
 * `matriz-fiscal.ts` NÃO acusam: TS5097 não vale para import só de tipo.
 *
 * O que NÃO se faz para zerar esse 1: excluir `supabase/functions/` do tsconfig. Isso
 * removeria o ÚNICO instrumento do repositório que enxerga esta pasta — o contrário exato do
 * que esta rodada existe para fazer.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const RAIZ_DO_REPO = path.resolve(__dirname, '..')
/** A raiz do grafo. Tudo que ela alcança é espelhado. */
const RAIZ = path.join(RAIZ_DO_REPO, 'src', 'utils', 'pricing-engine.ts')
const PASTA_DA_FUNCAO = path.join(RAIZ_DO_REPO, 'supabase', 'functions', 'calc-tax-engine')
/** Espelha o `paths` do `tsconfig.json`. Se um alias novo aparecer lá, aparece aqui. */
const ALIAS = { '@/': 'src/' }
/** Arquivos da pasta que NÃO são espelho — escritos à mão, fora do grafo. */
const NAO_ESPELHADOS = new Set(['index.ts'])

const rel = (p) => path.relative(RAIZ_DO_REPO, p).split(path.sep).join('/')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

/** Todos os especificadores de `import`/`export … from '…'` do arquivo. */
function especificadoresDe(conteudo) {
  const achados = []
  const re = /\bfrom\s+['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(conteudo)) !== null) achados.push(m[1])
  return achados
}

/**
 * Resolve um especificador para um caminho de ARQUIVO-FONTE, ou `null` quando ele é externo.
 *
 * Externo é tudo que não é relativo nem alias — `react`, `https://…`, `jsr:…`. Eles ficam
 * intocados: o Deno os resolve por conta própria, e reescrevê-los seria quebrar o `index.ts`.
 */
function resolverParaFonte(especificador, arquivoQueImporta) {
  let base
  if (especificador.startsWith('./') || especificador.startsWith('../')) {
    base = path.resolve(path.dirname(arquivoQueImporta), especificador)
  } else {
    const alias = Object.keys(ALIAS).find((a) => especificador.startsWith(a))
    if (!alias) return null
    base = path.join(RAIZ_DO_REPO, ALIAS[alias], especificador.slice(alias.length))
  }
  for (const candidato of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) return candidato
  }
  return null
}

/**
 * O fechamento transitivo a partir da raiz, em ordem determinística.
 *
 * Aborta em COLISÃO DE BASENAME: dois módulos de pastas diferentes com o mesmo nome de arquivo
 * virariam um só no espelho, e o segundo sobrescreveria o primeiro — um defeito silencioso
 * pior que o que este script existe para impedir.
 */
function fecharGrafo(raiz) {
  const vistos = new Map() // basename → caminho da fonte
  const ordem = []
  const fila = [raiz]
  while (fila.length > 0) {
    const atual = fila.shift()
    const nome = path.basename(atual)
    if (vistos.has(nome)) {
      if (vistos.get(nome) !== atual) {
        console.error(`COLISÃO DE NOME no espelho: "${nome}" viria de dois lugares:`)
        console.error(`  ${rel(vistos.get(nome))}`)
        console.error(`  ${rel(atual)}`)
        console.error('Renomeie um dos dois antes de espelhá-los.')
        process.exit(1)
      }
      continue
    }
    vistos.set(nome, atual)
    ordem.push(atual)
    const conteudo = fs.readFileSync(atual, 'utf-8')
    for (const esp of especificadoresDe(conteudo)) {
      const fonte = resolverParaFonte(esp, atual)
      if (fonte) fila.push(fonte)
    }
  }
  return ordem
}

/** O conteúdo que o espelho de `fonte` deve ter — cabeçalho e reescrita incluídos. */
function conteudoEsperado(fonte) {
  const cru = fs.readFileSync(fonte, 'utf-8')
  const semCabecalho = cru.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '').trim()
  const reescrito = semCabecalho.replace(/(\bfrom\s+['"])([^'"]+)(['"])/g, (todo, pre, esp, pos) => {
    const alvo = resolverParaFonte(esp, fonte)
    if (!alvo) return todo // externo: intocado
    return `${pre}./${path.basename(alvo)}${pos}` // o Deno exige a extensão
  })
  const cabecalho = `/**
 * ESPELHO GERADO — NÃO EDITE ESTE ARQUIVO.
 *
 * Fonte: ${rel(fonte)}
 * Gerado por: npm run sync-pricing-engine
 *
 * O grafo inteiro de ${path.basename(RAIZ)} é espelhado aqui, e os especificadores são
 * reescritos para \`./<arquivo>.ts\` porque o Deno exige a extensão. O gate
 * \`npm run check-pricing-engine\` compara byte a byte E verifica que cada import resolve
 * dentro desta pasta.
 */`
  return `${cabecalho}\n\n${reescrito}\n`
}

/**
 * O PORTÃO DE SANIDADE: cada import relativo dos arquivos DA PASTA resolve dentro dela?
 *
 * Ele olha a pasta, não a lista do grafo — assim ele alcança também o `index.ts`, que é
 * escrito à mão e importa `./pricing-engine.ts`. Um import morto ali quebraria a função em
 * produção e nenhum outro portão do repositório o veria: o jest não importa esta pasta, o
 * `next build` não a compila, e o `tsc` completo, que a alcança, roda com `continue-on-error`.
 *
 * É grosseiro de propósito — existência de arquivo, não type-check. `deno` não está instalado
 * no runner (medido), e não há `deno.json` nem tsconfig próprio na pasta.
 */
function verificarResolucao() {
  if (!fs.existsSync(PASTA_DA_FUNCAO)) {
    console.error(`Pasta da função não encontrada: ${rel(PASTA_DA_FUNCAO)}`)
    return 1
  }
  const arquivos = fs.readdirSync(PASTA_DA_FUNCAO).filter((f) => f.endsWith('.ts'))
  let quebrados = 0
  let conferidos = 0
  for (const arquivo of arquivos) {
    const caminho = path.join(PASTA_DA_FUNCAO, arquivo)
    for (const esp of especificadoresDe(fs.readFileSync(caminho, 'utf-8'))) {
      // Só os relativos: um bare specifier (`jsr:`, `https://`) é o Deno que resolve.
      if (!esp.startsWith('./') && !esp.startsWith('../')) continue
      conferidos++
      const alvo = path.resolve(path.dirname(caminho), esp)
      if (!fs.existsSync(alvo)) {
        console.error(`IMPORT MORTO: ${arquivo} importa "${esp}", que não existe na pasta.`)
        quebrados++
      }
    }
  }
  if (quebrados > 0) {
    console.error(`${quebrados} de ${conferidos} imports relativos não resolvem em ${rel(PASTA_DA_FUNCAO)}.`)
    return 1
  }
  console.log(`resolução: ${conferidos} imports relativos conferidos em ${arquivos.length} arquivos, todos resolvem.`)
  return 0
}

// ─────────────────────────────────── modos ───────────────────────────────────

const soResolucao = process.argv.includes('--check-imports')
const soConferir = process.argv.includes('--check') || soResolucao

if (!fs.existsSync(RAIZ)) {
  console.error(`Raiz do grafo não encontrada: ${rel(RAIZ)}`)
  process.exit(1)
}

if (soResolucao) {
  process.exit(verificarResolucao())
}

const grafo = fecharGrafo(RAIZ)

if (soConferir) {
  let falhas = 0

  // (a) IGUALDADE — todos os arquivos do grafo, byte a byte, não só o primeiro.
  for (const fonte of grafo) {
    const alvo = path.join(PASTA_DA_FUNCAO, path.basename(fonte))
    if (!fs.existsSync(alvo)) {
      console.error(`FALTA NO ESPELHO: ${path.basename(fonte)} (de ${rel(fonte)})`)
      falhas++
      continue
    }
    const esperado = conteudoEsperado(fonte)
    const lido = fs.readFileSync(alvo, 'utf-8')
    if (esperado !== lido) {
      console.error(`DRIFT DETECTED: ${path.basename(fonte)} difere da fonte.`)
      console.error(`  Fonte (esperado): ${sha256(esperado).slice(0, 12)}...`)
      console.error(`  Espelho (atual):  ${sha256(lido).slice(0, 12)}...`)
      falhas++
    }
  }

  // (b) ÓRFÃOS — espelho que sobrou de um import removido. Sem isto, apagar um import deixaria
  // o arquivo velho na pasta para sempre, e o `--check` ficaria verde com ele lá.
  const esperados = new Set([...grafo.map((f) => path.basename(f)), ...NAO_ESPELHADOS])
  for (const arquivo of fs.readdirSync(PASTA_DA_FUNCAO).filter((f) => f.endsWith('.ts'))) {
    if (!esperados.has(arquivo)) {
      console.error(`ÓRFÃO NO ESPELHO: ${arquivo} não está no grafo e não é escrito à mão.`)
      falhas++
    }
  }

  if (falhas > 0) {
    console.error('Rode "npm run sync-pricing-engine" para corrigir.')
    process.exit(1)
  }
  console.log(`igualdade: ${grafo.length} arquivos do grafo conferidos, todos iguais à fonte.`)
  process.exit(verificarResolucao())
}

// ─────────────────────────────── modo de escrita ───────────────────────────────

fs.mkdirSync(PASTA_DA_FUNCAO, { recursive: true })
for (const fonte of grafo) {
  const alvo = path.join(PASTA_DA_FUNCAO, path.basename(fonte))
  fs.writeFileSync(alvo, conteudoEsperado(fonte), 'utf-8')
  console.log(`espelhado: ${rel(fonte)} → ${rel(alvo)}`)
}
const esperados = new Set([...grafo.map((f) => path.basename(f)), ...NAO_ESPELHADOS])
for (const arquivo of fs.readdirSync(PASTA_DA_FUNCAO).filter((f) => f.endsWith('.ts'))) {
  if (!esperados.has(arquivo)) {
    fs.unlinkSync(path.join(PASTA_DA_FUNCAO, arquivo))
    console.log(`removido (órfão): ${arquivo}`)
  }
}
console.log(`grafo de ${grafo.length} arquivos a partir de ${rel(RAIZ)}.`)
process.exit(verificarResolucao())
