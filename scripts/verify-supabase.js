require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Helper to get env vars manually if dotenv fails
function getEnv(key) {
    if (process.env[key]) return process.env[key];
    try {
        const envPath = path.join(__dirname, '..', '.env');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const line = envContent.split('\n').find(l => l.startsWith(`${key}=`));
        return line ? line.split('=').slice(1).join('=').trim() : '';
    } catch (e) {
        return '';
    }
}

const SUPABASE_URL = getEnv('SUPABASE_URL');
const SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function verify() {
    console.log('🔍 Verificando conexão com o Supabase...\n');

    // 1. Verificar tabela Employees
    console.log('1️⃣ Testando tabela "employees"...');
    const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('*')
        .limit(1);

    if (empError) {
        console.error('❌ Erro ao acessar "employees":', empError.message);
    } else {
        console.log('✅ Tabela "employees" encontrada e acessível!');
    }

    // 2. Verificar tabela Customers
    console.log('\n2️⃣ Testando tabela "customers"...');
    const { data: customers, error: custError } = await supabase
        .from('customers')
        .select('*')
        .limit(1);

    if (custError) {
        console.error('❌ Erro ao acessar "customers":', custError.message);
    } else {
        console.log('✅ Tabela "customers" encontrada e acessível!');
    }
}

verify();
