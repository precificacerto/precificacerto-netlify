/**
 * Executa migração SQL no Supabase via Management API
 * Usa o access token (do dashboard) para executar DDL
 * 
 * Uso: node scripts/run-migration-api.js <arquivo.sql> [access-token]
 * 
 * O access token é gerado em: https://supabase.com/dashboard/account/tokens
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const PROJECT_REF = 'jvthwpkwzpangnwhuyvj';

// Pegar argumentos
const sqlFileArg = process.argv[2];
const accessToken = process.argv[3] || process.env.SUPABASE_ACCESS_TOKEN;

if (!sqlFileArg) {
    console.error('❌ Uso: node scripts/run-migration-api.js <arquivo.sql> <access-token>');
    process.exit(1);
}

const sqlFile = path.resolve(sqlFileArg);
if (!fs.existsSync(sqlFile)) {
    console.error(`❌ Arquivo não encontrado: ${sqlFile}`);
    process.exit(1);
}

if (!accessToken) {
    console.error('\n❌ Access token não fornecido.');
    console.error('👉 Gere em: https://supabase.com/dashboard/account/tokens');
    console.error(`\n   node scripts/run-migration-api.js "${sqlFileArg}" "sbp_seu_token_aqui"\n`);
    process.exit(1);
}

const sqlContent = fs.readFileSync(sqlFile, 'utf-8');

function executeSQLViaManagementAPI(sql) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ query: sql });

        const options = {
            hostname: 'api.supabase.com',
            path: `/v1/projects/${PROJECT_REF}/database/query`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    body: data,
                });
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function main() {
    console.log(`\n🚀 Executando: ${path.basename(sqlFile)}`);
    console.log(`📄 Arquivo: ${sqlFile}`);
    console.log(`🎯 Projeto: ${PROJECT_REF}\n`);

    console.log('⏳ Enviando SQL via Management API...');
    const result = await executeSQLViaManagementAPI(sqlContent);

    if (result.ok) {
        console.log('✅ Migration executada com sucesso!\n');
        // Mostrar resultado se houver
        try {
            const parsed = JSON.parse(result.body);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log('📊 Resultado:', JSON.stringify(parsed, null, 2).substring(0, 500));
            }
        } catch { }
    } else {
        console.log(`❌ Erro (status ${result.status}):`);
        console.log(result.body.substring(0, 600));
        console.log('\n📋 Alternativa: cole o SQL manualmente no SQL Editor:');
        console.log(`   https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`);
    }
}

main().catch(console.error);
