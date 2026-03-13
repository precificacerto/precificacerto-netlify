const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Carrega variáveis de ambiente (prioridade para .env.local)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

// Configuração padrão do Supabase
// A URL padrão é: postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
// db.[ref].supabase.co

const SUPABASE_PROJECT_ID = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? process.env.NEXT_PUBLIC_SUPABASE_URL.split('//')[1].split('.')[0]
    : null;

const DB_HOST = `db.${SUPABASE_PROJECT_ID}.supabase.co`;
const DB_PORT = 5432;
const DB_USER = `postgres`;
const DB_DATABASE = `postgres`;
const MIGRATION_FILE_PATH = path.join(__dirname, '../supabase/migrations/20260212000000_initial_schema.sql');

async function migrate() {
    console.log('👑 Orion Migration Orchestrator Iniciado...');
    console.log(`ℹ️  Project ID detectado: ${SUPABASE_PROJECT_ID}`);

    if (!SUPABASE_PROJECT_ID) {
        console.error('❌ Erro: NEXT_PUBLIC_SUPABASE_URL não encontrada no .env.local');
        // Para debug, vamos imprimir o env
        // console.log('ENV:', process.env);
        process.exit(1);
    }

    // Tenta pegar a senha do ambiente ou argumentos
    const password = process.env.DB_PASSWORD || process.argv[2];

    if (!password) {
        console.error('\n❌ Erro Crítico: Senha do Banco de Dados não fornecida.');
        console.error('ℹ️  A "Service Role Key" não permite criar tabelas (DDL). É necessário acesso direto ao Postgres.');
        console.error('\n👉 Para executar, rode: node scripts/deploy-schema.js "SUA_SENHA_DO_BANCO_AQUI"');
        process.exit(1);
    }

    const client = new Client({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: password,
        database: DB_DATABASE,
        ssl: { rejectUnauthorized: false }, // Necessário para Supabase
        connectionTimeoutMillis: 20000,
    });

    try {
        console.log(`🔌 Conectando ao Banco de Dados (${DB_HOST})...`);
        await client.connect();
        console.log('✅ Conectado com sucesso!');

        if (!fs.existsSync(MIGRATION_FILE_PATH)) {
            console.error(`❌ Arquivo de migração não encontrado: ${MIGRATION_FILE_PATH}`);
            process.exit(1);
        }

        console.log(`📂 Lendo arquivo de migração: ${MIGRATION_FILE_PATH}`);
        const sql = fs.readFileSync(MIGRATION_FILE_PATH, 'utf8');

        console.log('🚀 Executando migração de 31 tabelas... (Isso pode levar alguns segundos)');

        // Executa o SQL
        await client.query(sql);

        console.log('✅ Migração Concluída com Sucesso!');
        console.log('🎉 Todas as 31 tabelas e políticas de segurança foram criadas.');

    } catch (err) {
        console.error('❌ Erro durante a migração:', err);
        if (err.code === 'ENOTFOUND') {
            console.error('👉 Verifique se o PROJECT_ID está correto e se o banco está acessível.');
            console.error('👉 Host tentado:', DB_HOST);
        } else if (err.code === '28P01') {
            console.error('👉 Senha incorreta ou usuário bloqueado.');
        }
    } finally {
        await client.end();
    }
}

migrate();
