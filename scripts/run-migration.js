/**
 * Script para executar migration SQL no Supabase via API
 * Usa o endpoint /rest/v1/rpc para funções e split de statements para DDL
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://jvthwpkwzpangnwhuyvj.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fs.readFileSync(
    path.join(__dirname, '..', '.env.local'), 'utf-8'
).split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')).split('=').slice(1).join('=').trim();

const sqlFile = path.join(__dirname, '..', 'supabase', 'migrations', '20260213000000_fiscal_tax_engine.sql');
const sqlContent = fs.readFileSync(sqlFile, 'utf-8');

// Split SQL into individual statements, handling multi-line statements
function splitStatements(sql) {
    const statements = [];
    let current = '';
    let inDollarQuote = false;
    let dollarTag = '';

    const lines = sql.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('--')) {
            if (inDollarQuote) current += line + '\n';
            continue;
        }

        current += line + '\n';

        // Check for dollar-quoted strings ($$)
        const dollarMatches = line.match(/\$\$|\$[a-zA-Z_]+\$/g);
        if (dollarMatches) {
            for (const m of dollarMatches) {
                if (!inDollarQuote) {
                    inDollarQuote = true;
                    dollarTag = m;
                } else if (m === dollarTag) {
                    inDollarQuote = false;
                    dollarTag = '';
                }
            }
        }

        if (!inDollarQuote && trimmed.endsWith(';')) {
            const stmt = current.trim();
            if (stmt.length > 1) {
                statements.push(stmt);
            }
            current = '';
        }
    }

    if (current.trim()) statements.push(current.trim());
    return statements;
}

async function executeSQL(sql) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);

        const postData = JSON.stringify({ query: sql });

        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Prefer': 'return=minimal',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ ok: true, status: res.statusCode });
                } else {
                    resolve({ ok: false, status: res.statusCode, error: data });
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Try executing via the pg-meta SQL endpoint instead
async function executeSQLDirect(sql) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ query: sql });
        const url = new URL(`${SUPABASE_URL}/pg/query`);

        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: data });
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function main() {
    console.log('🚀 Executando migration fiscal no Supabase...\n');

    // Try sending the entire SQL at once via pg endpoint
    console.log('Tentando via /pg/query...');
    const result = await executeSQLDirect(sqlContent);

    if (result.ok) {
        console.log('✅ Migration executada com sucesso via /pg/query!');
        return;
    }

    console.log(`⚠️ /pg/query retornou status ${result.status}: ${result.body?.substring(0, 200)}`);
    console.log('\nTentando via /rest/v1/rpc/exec_sql...');

    const result2 = await executeSQL(sqlContent);
    if (result2.ok) {
        console.log('✅ Migration executada com sucesso via rpc!');
        return;
    }

    console.log(`⚠️ rpc retornou status ${result2.status}: ${result2.error?.substring(0, 200)}`);
    console.log('\n❌ Não foi possível executar automaticamente.');
    console.log('📋 Copie o conteúdo do arquivo SQL e execute manualmente no SQL Editor do Supabase:');
    console.log(`   https://supabase.com/dashboard/project/jvthwpkwzpangnwhuyvj/sql/new`);
}

main().catch(console.error);
