#!/usr/bin/env node
/**
 * check-no-legacy-discount-modes.js
 *
 * Story: MRM-V2-S2.1 — Remover modos legacy PROFIT_REDUCTION/SELLER_REDUCTION da UI
 *
 * CI guard que bloqueia a reintrodução das strings literais
 *   'PROFIT_REDUCTION' e 'SELLER_REDUCTION'
 * em código de produção, evitando que novos PRs adicionem suporte a modos
 * descontinuados pela Decisão R2 do Motor V2.
 *
 * Whitelist (paths onde as strings são PERMITIDAS):
 *   - src/utils/calculate-discount.ts     (implementação preservada — 1 sprint)
 *   - src/utils/distribute-discount.ts    (idem — preservada por rollback)
 *   - src/types/**                        (tipo `DiscountMode` ainda inclui legacy)
 *   - src/config/feature-flags.ts         (constante LEGACY_DISCOUNT_MODES)
 *   - scripts/check-no-legacy-discount-modes.js (este próprio arquivo)
 *   - docs/**                             (qualquer documentação)
 *   - tests/**                            (testes podem testar legacy)
 *   - supabase/migrations/**              (histórico imutável)
 *
 * Override por linha (sentinela):
 *   Qualquer linha terminada com  `// mrm-legacy-allowlist`
 *   é IGNORADA. Use isso APENAS em código pré-existente que ainda precisa
 *   referenciar o valor por compat (ex.: tooltip de rollback). NÃO use em
 *   código novo — abra exceção via revisão de @architect.
 *
 * Uso:
 *   node scripts/check-no-legacy-discount-modes.js
 *
 * Exit codes:
 *   0 — nenhuma violação encontrada
 *   1 — uma ou mais violações encontradas (impressas no stderr)
 */

'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const LEGACY_TOKENS = ['PROFIT_REDUCTION', 'SELLER_REDUCTION']
const ALLOWLIST_SENTINEL = 'mrm-legacy-allowlist'

// Diretórios para varrer (relativos a ROOT). Mantemos o scan amplo (src) e
// deixamos a whitelist filtrar o que é legítimo.
const SCAN_DIRS = ['src']

// Extensões consideradas "código de produção".
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

// Arquivos onde as strings podem aparecer (paths relativos ao ROOT, com
// separador `/`). Pastas terminadas com `/` ignoram tudo abaixo.
const WHITELIST_PATHS = new Set([
  'src/utils/calculate-discount.ts',
  'src/utils/distribute-discount.ts',
  'src/config/feature-flags.ts',
  'scripts/check-no-legacy-discount-modes.js',
])
const WHITELIST_DIRS = [
  'src/types/',
  'docs/',
  'tests/',
  'supabase/migrations/',
  'node_modules/',
  '.next/',
  '.git/',
]

function toPosix(p) {
  return p.split(path.sep).join('/')
}

function isWhitelisted(relPath) {
  if (WHITELIST_PATHS.has(relPath)) return true
  return WHITELIST_DIRS.some((dir) => relPath.startsWith(dir))
}

function walk(dir, acc) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return acc
    throw err
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel = toPosix(path.relative(ROOT, full))
    if (entry.isDirectory()) {
      if (WHITELIST_DIRS.some((d) => rel.startsWith(d.replace(/\/$/, '')))) {
        // diretório inteiro permitido — ainda precisamos visitar para tipos,
        // mas como qualquer match aqui é whitelisted, podemos pular o walk.
        continue
      }
      walk(full, acc)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name)
      if (!SCAN_EXTS.has(ext)) continue
      if (isWhitelisted(rel)) continue
      acc.push({ full, rel })
    }
  }
  return acc
}

function scanFile(file) {
  const content = fs.readFileSync(file.full, 'utf8')
  const lines = content.split(/\r?\n/)
  const violations = []
  lines.forEach((line, idx) => {
    if (line.includes(ALLOWLIST_SENTINEL)) return
    for (const token of LEGACY_TOKENS) {
      if (line.includes(token)) {
        violations.push({
          file: file.rel,
          line: idx + 1,
          token,
          snippet: line.trim().slice(0, 160),
        })
        // não dá break: queremos reportar ambos os tokens se ambos
        // estiverem na mesma linha.
      }
    }
  })
  return violations
}

function main() {
  const targets = []
  for (const dir of SCAN_DIRS) {
    walk(path.join(ROOT, dir), targets)
  }

  const violations = []
  for (const file of targets) {
    violations.push(...scanFile(file))
  }

  if (violations.length === 0) {
    process.stdout.write('[mrm-legacy-guard] OK — 0 violations found.\n')
    process.exit(0)
  }

  process.stderr.write(
    `[mrm-legacy-guard] FAIL — ${violations.length} violation(s) found.\n` +
      'Legacy discount mode strings detected outside whitelist.\n' +
      'If this usage is intentional and rollback-compatible, append the comment\n' +
      `\`// ${ALLOWLIST_SENTINEL}\` to the offending line.\n\n`,
  )
  for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line}  [${v.token}]  ${v.snippet}\n`)
  }
  process.exit(1)
}

main()
