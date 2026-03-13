/**
 * Script para executar migration SQL no Supabase via API
 * Reutiliza a lógica do run-migration.js, mas aceita qualquer arquivo SQL
 * Uso: node scripts/run-any-migration.js <caminho-do-arquivo-sql>
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// Ler o arquivo .env ou .env.local para pegar a service role key
let SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envFiles = ['.env', '.env.local'];
for (const envFile of envFiles) {
    if (SERVICE_ROLE_KEY) break;
    const envPath = path.join(__dirname, '..', envFile);
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const line = envContent.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
        if (line) {
            SERVICE_ROLE_KEY = line.split('=').slice(1).join('=').trim();
            console.log(`🔑 Chave encontrada em ${envFile}`);
        }
    }
}

if (!SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada no .env.local');
    process.exit(1);
}

const SUPABASE_URL = 'https://jvthwpkwzpangnwhuyvj.supabase.co';

// Pegar o arquivo SQL a executar
const sqlFileArg = process.argv[2];
if (!sqlFileArg) {
    console.error('❌ Uso: node scripts/run-any-migration.js <caminho-do-arquivo-sql>');
    process.exit(1);
}

const sqlFile = path.resolve(sqlFileArg);
if (!fs.existsSync(sqlFile)) {
    console.error(`❌ Arquivo não encontrado: ${sqlFile}`);
    process.exit(1);
}

const sqlContent = fs.readFileSync(sqlFile, 'utf-8');

// Split SQL into individual statements
function splitStatements(sql) {
    const statements = [];
    let current = '';
    let inDollarQuote = false;
    let dollarTag = '';

    const lines = sql.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('--')) {
            if (inDollarQuote) current += line + '\n';
            continue;
        }
        current += line + '\n';

        const dollarMatches = line.match(/\$\$|\$[a-zA-Z_]+\$/g);
        if (dollarMatches) {
            for (const m of dollarMatches) {
                if (!inDollarQuote) { inDollarQuote = true; dollarTag = m; }
                else if (m === dollarTag) { inDollarQuote = false; dollarTag = ''; }
            }
        }

        if (!inDollarQuote && trimmed.endsWith(';')) {
            const stmt = current.trim();
            if (stmt.length > 1) statements.push(stmt);
            current = '';
        }
    }
    if (current.trim()) statements.push(current.trim());
    return statements;
}

function executeSQL(sql) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ query: sql });
        const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);
        const options = {
            hostname: url.hostname, path: url.pathname, method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Prefer': 'return=minimal',
                'Content-Length': Buffer.byteLength(postData),
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, error: data }));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function executeSQLDirect(sql) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ query: sql });
        const url = new URL(`${SUPABASE_URL}/pg/query`);
        const options = {
            hostname: url.hostname, path: url.pathname, method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Length': Buffer.byteLength(postData),
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function main() {
    console.log(`\n🚀 Executando migration: ${path.basename(sqlFile)}`);
    console.log(`📄 Arquivo: ${sqlFile}\n`);

    // Tentar enviar tudo de uma vez via /pg/query
    console.log('1️⃣  Tentando via /pg/query...');
    const result = await executeSQLDirect(sqlContent);

    if (result.ok) {
        console.log('✅ Migration executada com sucesso via /pg/query!\n');
        return;
    }
    console.log(`⚠️  /pg/query retornou status ${result.status}`);
    console.log(`   Body: ${(result.body || '').substring(0, 300)}`);

    // Fallback: via RPC
    console.log('2️⃣  Tentando via /rest/v1/rpc/exec_sql...');
    const result2 = await executeSQL(sqlContent);
    if (result2.ok) {
        console.log('✅ Migration executada com sucesso via rpc!\n');
        return;
    }
    console.log(`⚠️  rpc retornou status ${result2.status}`);

    // Fallback: statement por statement
    console.log('3️⃣  Executando statement por statement...\n');
    const statements = splitStatements(sqlContent);
    let success = 0, fail = 0;

    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
        process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}... `);

        const r = await executeSQL(stmt);
        if (r.ok) {
            console.log('✅');
            success++;
        } else {
            // Verificar se é erro de "já existe" (aceitável com IF NOT EXISTS)
            const errStr = String(r.error || '');
            if (errStr.includes('already exists') || errStr.includes('duplicate')) {
                console.log('⏭️  (já existe)');
                success++;
            } else {
                console.log(`❌ ${errStr.substring(0, 120)}`);
                fail++;
            }
        }
    }

    console.log(`\n📊 Resultado: ${success} sucesso, ${fail} falha(s)`);
    if (fail > 0) {
        console.log(`\n📋 Execute manualmente no SQL Editor do Supabase:`);
        console.log(`   https://supabase.com/dashboard/project/jvthwpkwzpangnwhuyvj/sql/new\n`);
    }
}

main().catch(console.error);
