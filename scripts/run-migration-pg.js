/**
 * Executa qualquer migração SQL no Supabase via conexão direta ao PostgreSQL
 * Uso: node scripts/run-migration-pg.js <caminho-sql> <senha-do-banco>
 * 
 * A senha do banco é a senha do Supabase Postgres, NÃO a service role key.
 * Você encontra em: Supabase Dashboard > Settings > Database > Connection string
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Carrega .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const SUPABASE_PROJECT_ID = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? process.env.NEXT_PUBLIC_SUPABASE_URL.split('//')[1].split('.')[0]
    : null;

const DB_HOST = `db.${SUPABASE_PROJECT_ID}.supabase.co`;
const DB_PORT = 5432;
const DB_USER = 'postgres';
const DB_DATABASE = 'postgres';

// Pegar argumentos
const sqlFileArg = process.argv[2];
const password = process.env.DB_PASSWORD || process.argv[3];

if (!sqlFileArg) {
    console.error('❌ Uso: node scripts/run-migration-pg.js <arquivo.sql> <senha-do-banco>');
    console.error('   Ex:  node scripts/run-migration-pg.js supabase/migrations/20260219100000_item_type_product_type_pricing_context.sql "SuaSenha"');
    process.exit(1);
}

const sqlFile = path.resolve(sqlFileArg);
if (!fs.existsSync(sqlFile)) {
    console.error(`❌ Arquivo não encontrado: ${sqlFile}`);
    process.exit(1);
}

if (!password) {
    console.error('\n❌ Senha do banco não fornecida.');
    console.error('ℹ️  É a senha do Postgres, não a Service Role Key.');
    console.error('👉 Encontre em: Supabase Dashboard > Settings > Database');
    console.error(`\n   node scripts/run-migration-pg.js "${sqlFileArg}" "SUA_SENHA_AQUI"\n`);
    process.exit(1);
}

async function migrate() {
    console.log(`\n🚀 Executando: ${path.basename(sqlFile)}`);
    console.log(`📄 Arquivo: ${sqlFile}`);
    console.log(`🔌 Host: ${DB_HOST}\n`);

    const sql = fs.readFileSync(sqlFile, 'utf8');

    const client = new Client({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: password,
        database: DB_DATABASE,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 20000,
    });

    try {
        console.log('🔌 Conectando ao PostgreSQL...');
        await client.connect();
        console.log('✅ Conectado!\n');

        console.log('⏳ Executando SQL...');
        await client.query(sql);
        console.log('✅ Migration executada com sucesso!\n');

    } catch (err) {
        console.error('❌ Erro:', err.message);
        if (err.code === 'ENOTFOUND') {
            console.error('👉 Verifique se o PROJECT_ID está correto.');
        } else if (err.code === '28P01') {
            console.error('👉 Senha incorreta.');
        } else if (err.code === '42710') {
            console.error('👉 Tipo/enum já existe (isso pode ser normal com IF NOT EXISTS).');
        }
    } finally {
        await client.end();
    }
}

migrate();
