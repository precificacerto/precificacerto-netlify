/**
 * Seed ncm_codes no Supabase a partir de um CSV (ex.: exportado da Tabela NCM em PDF).
 * Uso: node scripts/seed-ncm-from-csv.js
 *      NCM_CSV_PATH="Tabela NCM/Tabela_ncm_completa.csv" node scripts/seed-ncm-from-csv.js
 *
 * CSV: colunas code/codigo/código e description/descricao/descrição; separador , ou ;
 */
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env.local') });
require('dotenv').config({ path: path.join(root, '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const defaultCsvPath = path.join(__dirname, '..', 'Tabela NCM', 'Tabela_ncm_completa.csv');
const csvPath = process.env.NCM_CSV_PATH || defaultCsvPath;

function normalizeCode(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  }
  if (digits.length >= 6) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  }
  return digits.length ? digits : raw;
}

function parseCsvLine(line, sep) {
  const parts = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === sep) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur.trim());
  return parts;
}

function detectSeparator(headerLine) {
  if (headerLine.includes(';')) return ';';
  return ',';
}

function findColumnIndex(headers, names) {
  const lower = headers.map((h) => h.toLowerCase().replace(/\s/g, ''));
  for (const name of names) {
    const n = name.toLowerCase().replace(/\s/g, '');
    const i = lower.findIndex((h) => h === n || h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou .env.local)');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error('CSV não encontrado:', csvPath);
    console.error('Coloque o arquivo em Tabela NCM/Tabela_ncm_completa.csv ou defina NCM_CSV_PATH');
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error('CSV precisa de cabeçalho e ao menos uma linha de dados');
    process.exit(1);
  }

  const sep = detectSeparator(lines[0]);
  const headers = parseCsvLine(lines[0], sep);
  const codeIdx = findColumnIndex(headers, ['code', 'codigo', 'código', 'cod']);
  const descIdx = findColumnIndex(headers, ['description', 'descricao', 'descrição', 'desc', 'descricao resumida']);
  if (codeIdx < 0 || descIdx < 0) {
    console.error('CSV deve ter colunas de código e descrição. Cabeçalho:', headers);
    process.exit(1);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i], sep);
    const code = parts[codeIdx];
    const description = parts[descIdx];
    if (!code) continue;
    const normalized = normalizeCode(code);
    if (normalized.length < 4) continue;
    rows.push({
      code: normalized,
      description: (description || '').slice(0, 1000),
      chapter: normalized.replace(/\D/g, '').slice(0, 2) || null,
      updated_by: 'SEED_CSV',
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const BATCH = 200;
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const row of batch) {
      const { data: existing } = await supabase
        .from('ncm_codes')
        .select('id')
        .eq('code', row.code)
        .maybeSingle();
      if (existing) {
        await supabase.from('ncm_codes').update({
          description: row.description,
          chapter: row.chapter,
          updated_at: new Date().toISOString(),
          updated_by: row.updated_by,
        }).eq('code', row.code);
        updated++;
      } else {
        await supabase.from('ncm_codes').insert(row);
        inserted++;
      }
    }
    console.log(`Processados ${Math.min(i + BATCH, rows.length)} / ${rows.length} (inseridos: ${inserted}, atualizados: ${updated})`);
  }
  console.log('Concluído. Total inseridos:', inserted, 'atualizados:', updated);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
