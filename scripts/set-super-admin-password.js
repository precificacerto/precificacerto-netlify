/**
 * Define a senha do super_admin precificacerto@gmail.com.
 * Uso único: node scripts/set-super-admin-password.js
 * Requer .env com SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.
 */
const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')

function getEnv(key) {
  if (process.env[key]) return process.env[key]
  try {
    const envPath = path.join(__dirname, '..', '.env')
    const envContent = fs.readFileSync(envPath, 'utf-8')
    const line = envContent.split('\n').find((l) => l.startsWith(`${key}=`))
    return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : ''
  } catch (e) {
    return ''
  }
}

const SUPABASE_URL = getEnv('SUPABASE_URL') || getEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')

const SUPER_ADMIN_EMAIL = 'precificacerto@gmail.com'
const SUPER_ADMIN_PASSWORD = '#Precificacerto02'

const AUTH_USER_ID = '7a32fbd1-2b58-4e12-89f1-6604d086f1a0'

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Defina SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('Atualizando senha do super_admin', SUPER_ADMIN_EMAIL, '...')
  const { error } = await supabase.auth.admin.updateUserById(AUTH_USER_ID, {
    password: SUPER_ADMIN_PASSWORD,
  })

  if (error) {
    console.error('Erro:', error.message)
    process.exit(1)
  }
  console.log('Senha definida com sucesso. Faça login em /super-admin/login com:', SUPER_ADMIN_EMAIL)
}

main()
