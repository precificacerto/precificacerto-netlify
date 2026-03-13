require('dotenv').config();
const { Pool } = require('pg');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1];
if (!ref) { console.log('Cannot extract ref from URL'); process.exit(1); }

// Try direct PostgreSQL connection via Supabase pooler
const connectionString = `postgresql://postgres.${ref}:${process.env.SUPABASE_SERVICE_ROLE_KEY}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;

async function run() {
    console.log('Supabase project ref:', ref);
    console.log('Connecting to Supabase PostgreSQL...');

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log('Connected!');

        // Add missing columns to calendar_events
        await client.query('ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent boolean DEFAULT false;');
        console.log('✅ whatsapp_reminder_sent column added/verified');

        await client.query('ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS reminder_minutes_before integer DEFAULT 60;');
        console.log('✅ reminder_minutes_before column added/verified');

        // Verify columns exist
        const res = await client.query(
            `SELECT column_name, data_type, column_default 
       FROM information_schema.columns 
       WHERE table_name = 'calendar_events' 
       AND column_name IN ('whatsapp_reminder_sent', 'reminder_minutes_before')
       ORDER BY column_name`
        );
        console.log('\nColumns found in calendar_events:');
        res.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
        });

        // Also verify last_whatsapp_send_at exists in tenant_settings
        const res2 = await client.query(
            `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'tenant_settings' 
       AND column_name = 'last_whatsapp_send_at'`
        );
        if (res2.rows.length === 0) {
            console.log('\n⚠ last_whatsapp_send_at missing in tenant_settings, adding...');
            await client.query('ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS last_whatsapp_send_at timestamptz DEFAULT NULL;');
            console.log('✅ last_whatsapp_send_at added to tenant_settings');
        } else {
            console.log('\n✅ last_whatsapp_send_at exists in tenant_settings');
        }

        // Check whatsapp_reminder_message and whatsapp_budget_message
        const res3 = await client.query(
            `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'tenant_settings' 
       AND column_name IN ('whatsapp_reminder_message', 'whatsapp_budget_message')
       ORDER BY column_name`
        );
        console.log(`\nTemplate columns in tenant_settings: ${res3.rows.length}/2 found`);
        res3.rows.forEach(row => console.log(`  - ${row.column_name}: ${row.data_type}`));

        if (res3.rows.length < 2) {
            console.log('Adding missing template columns...');
            await client.query('ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS whatsapp_reminder_message TEXT DEFAULT NULL;');
            await client.query('ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS whatsapp_budget_message TEXT DEFAULT NULL;');
            console.log('✅ Template columns added');
        }

        console.log('\n🎉 Migration complete! All columns are ready.');

        client.release();
        await pool.end();
    } catch (err) {
        console.error('Error:', err.message);
        console.log('\n=== IF CONNECTION FAILED, RUN THIS SQL IN SUPABASE DASHBOARD ===\n');
        console.log('ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent boolean DEFAULT false;');
        console.log('ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS reminder_minutes_before integer DEFAULT 60;');
        console.log('ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS last_whatsapp_send_at timestamptz DEFAULT NULL;');
        console.log('ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS whatsapp_reminder_message TEXT DEFAULT NULL;');
        console.log('ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS whatsapp_budget_message TEXT DEFAULT NULL;');
        console.log('\nGo to: https://supabase.com/dashboard/project/' + ref + '/sql/new');
        await pool.end();
    }
}

run();
