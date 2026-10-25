#!/usr/bin/env node
/**
 * tsc-linha-de-base.js — o PORTÃO DE TIPO: o `tsc` fica vermelho só quando aparece erro NOVO.
 *
 * Uso:
 *   node scripts/tsc-linha-de-base.js              # compara com a linha de base (CI, bloqueante)
 *   node scripts/tsc-linha-de-base.js --atualizar  # regrava a linha de base com a árvore atual
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * >>> POR QUE ELE EXISTE <<<
 *
 * `docs/regras/portao-que-nao-alcanca.md`, aparição 7: o `typecheck` da CI roda em
 * `diagnostics`, com `continue-on-error`, e com 363 erros herdados na `main` ele fica vermelho em
 * TODO PR — com ou sem regressão. Um instrumento vermelho sempre informa tanto quanto um verde
 * sempre. O que de fato pegava regressão de tipo era a comparação por ARQUIVO + CÓDIGO de
 * `baseline-measurement.md`, regra (c), feita à mão. Este script é essa comparação, na CI.
 *
 * CONGELA, NÃO LIMPA. Os erros herdados ficam em `scripts/tsc-linha-de-base.json`, com a
 * contagem e a data. Nenhum deles foi corrigido nem suprimido para o portão nascer.
 *
 * ── O QUE ELE COMPARA ──────────────────────────────────────────────────────────────────────
 *
 * A chave é `arquivo + código` (`src/x.ts TS2345`), com a QUANTIDADE — nunca a linha: acrescentar
 * linhas num arquivo desloca a linha de todos os erros abaixo (regra (c)). Fica VERMELHO quando
 * uma chave aparece, ou quando a quantidade de uma chave sobe. Um erro a menos é avisado, não
 * recusado: corrigir erro herdado não pode quebrar o build de ninguém.
 *
 * ── O QUE ELE NÃO VÊ — e está escrito para não ser lido além do que diz ────────────────────
 *
 *  1. TROCA DENTRO DA MESMA CHAVE. Corrigir um `TS2345` em `x.ts` e criar outro `TS2345` em
 *     `x.ts` na mesma mudança deixa a contagem igual. É o limite da regra (c), e o mesmo da
 *     comparação à mão. Mitigação: atualizar a linha de base quando a contagem CAIR (o aviso
 *     pede), para a folga não ficar disponível.
 *  2. ARQUIVO RENOMEADO com erros herdados: os erros aparecem sob o caminho novo e o portão fica
 *     vermelho. É correto — a chave mudou — e se resolve com `--atualizar` no mesmo PR, que o
 *     revisor vê no diff do JSON.
 *
 * ── AS DUAS SALVAGUARDAS DO INSTRUMENTO (`instrumento-que-nao-enxerga.md`) ─────────────────
 *
 *  - Toda linha da saída que contém `error TS` tem de ter sido CONTADA. Se o formato da saída
 *    mudar e o leitor deixar de reconhecer um erro, o portão falha dizendo isso — em vez de
 *    contar zero e ficar verde.
 *  - O `tsc` que sai com erro e não produz erro reconhecível também falha.
 *  O leitor tem fixture própria em `src/utils/__tests__/o-portao-de-tipo.test.ts`.
 *
 * `--incremental false`: o `tsconfig` tem `incremental: true`, e o cache muda a contagem do
 * `TS2589` (`baseline-measurement.md`, regra (b)). Sem cache, a mesma árvore dá o mesmo número.
 */
'use strict'

const { spawnSync, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const RAIZ = path.resolve(__dirname, '..')
const ARQUIVO_DA_BASE = path.join(__dirname, 'tsc-linha-de-base.json')

const COM_ARQUIVO = /^(.+?)\((\d+),(\d+)\): error (TS\d+):/
const SEM_ARQUIVO = /^error (TS\d+):/

/**
 * Lê a saída do `tsc` e devolve as ocorrências, uma por erro, com a chave `arquivo código`.
 * `naoReconhecidas` são linhas que dizem `error TS` e o leitor não soube ler — é o sinal de que o
 * instrumento parou de enxergar, e o portão as trata como falha.
 */
function lerSaida(saida) {
    const ocorrencias = []
    const naoReconhecidas = []
    for (const bruta of saida.split(/\r?\n/)) {
        const linha = bruta.replace(/\x1b\[[0-9;]*m/g, '')
        const comArquivo = linha.match(COM_ARQUIVO)
        if (comArquivo) {
            const arquivo = comArquivo[1].replace(/\\/g, '/')
            ocorrencias.push({ chave: `${arquivo} ${comArquivo[4]}`, linha })
            continue
        }
        const semArquivo = linha.match(SEM_ARQUIVO)
        if (semArquivo) {
            ocorrencias.push({ chave: `(sem arquivo) ${semArquivo[1]}`, linha })
            continue
        }
        if (/error TS\d+/.test(linha) && !/^\s/.test(linha)) naoReconhecidas.push(linha)
    }
    return { ocorrencias, naoReconhecidas }
}

function contar(ocorrencias) {
    const contagem = {}
    for (const o of ocorrencias) contagem[o.chave] = (contagem[o.chave] || 0) + 1
    return contagem
}

/** Chaves que surgiram ou cresceram (vermelho), e as que caíram (aviso). */
function comparar(base, atual) {
    const novos = []
    const caidos = []
    for (const chave of Object.keys(atual).sort()) {
        const antes = base[chave] || 0
        if (atual[chave] > antes) novos.push({ chave, antes, agora: atual[chave] })
    }
    for (const chave of Object.keys(base).sort()) {
        const agora = atual[chave] || 0
        if (agora < base[chave]) caidos.push({ chave, antes: base[chave], agora })
    }
    return { novos, caidos }
}

const total = (contagem) => Object.values(contagem).reduce((a, b) => a + b, 0)

function rodarTsc() {
    const tsc = require.resolve('typescript/bin/tsc', { paths: [RAIZ] })
    const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.json', '--incremental', 'false', '--pretty', 'false'], {
        cwd: RAIZ,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
    })
    if (r.error) throw r.error
    return { codigo: r.status, saida: `${r.stdout || ''}${r.stderr || ''}` }
}

function ordenado(contagem) {
    return Object.fromEntries(Object.keys(contagem).sort().map((k) => [k, contagem[k]]))
}

function principal() {
    const atualizar = process.argv.includes('--atualizar')
    const { codigo, saida } = rodarTsc()
    const { ocorrencias, naoReconhecidas } = lerSaida(saida)

    if (naoReconhecidas.length > 0) {
        console.error(`PORTÃO DE TIPO: ${naoReconhecidas.length} linha(s) com "error TS" que o leitor não reconheceu.`)
        console.error('O formato da saída do tsc mudou ou o leitor está cego — não conto zero e fico verde.')
        for (const l of naoReconhecidas.slice(0, 20)) console.error(`  ${l}`)
        process.exit(1)
    }
    if (codigo !== 0 && ocorrencias.length === 0) {
        console.error(`PORTÃO DE TIPO: o tsc saiu com código ${codigo} sem nenhum erro reconhecível.`)
        console.error(saida.slice(0, 4000))
        process.exit(1)
    }

    const atual = contar(ocorrencias)

    if (atualizar) {
        let commit = null
        try { commit = execSync('git rev-parse --short HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim() } catch { commit = null }
        const base = {
            leia: 'Linha de base do portão de tipo (scripts/tsc-linha-de-base.js). Erros HERDADOS, congelados — não é lista de permissão para erro novo. Regravar só com --atualizar, e o diff deste arquivo é parte da revisão.',
            medido_em: new Date().toISOString().slice(0, 10),
            commit,
            total: ocorrencias.length,
            chaves: Object.keys(atual).length,
            erros: ordenado(atual),
        }
        fs.writeFileSync(ARQUIVO_DA_BASE, `${JSON.stringify(base, null, 2)}\n`)
        console.log(`linha de base regravada: ${base.total} erros em ${base.chaves} chaves (arquivo + código), commit ${commit}.`)
        return
    }

    if (!fs.existsSync(ARQUIVO_DA_BASE)) {
        console.error(`PORTÃO DE TIPO: linha de base ausente (${path.relative(RAIZ, ARQUIVO_DA_BASE)}).`)
        process.exit(1)
    }
    const base = JSON.parse(fs.readFileSync(ARQUIVO_DA_BASE, 'utf8'))
    const { novos, caidos } = comparar(base.erros, atual)

    console.log(`tsc: ${total(atual)} erros agora · linha de base: ${base.total}, medida em ${base.medido_em} (commit ${base.commit}).`)

    if (caidos.length > 0) {
        console.log(`\n${caidos.length} chave(s) com MENOS erros que a linha de base — avise e atualize (npm run tsc-linha-de-base:atualizar):`)
        for (const c of caidos) console.log(`  ${c.chave}: ${c.antes} → ${c.agora}`)
    }

    if (novos.length > 0) {
        console.error(`\nPORTÃO DE TIPO VERMELHO: ${novos.length} chave(s) com erro NOVO (arquivo + código):`)
        for (const n of novos) {
            console.error(`\n  ${n.chave}: ${n.antes} na linha de base → ${n.agora} agora`)
            for (const o of ocorrencias.filter((x) => x.chave === n.chave)) console.error(`    ${o.linha}`)
        }
        console.error('\nOs erros herdados da linha de base não são listados: só o que é novo.')
        process.exit(1)
    }

    console.log('\nnenhum erro novo contra a linha de base.')
}

module.exports = { lerSaida, contar, comparar }

if (require.main === module) principal()
