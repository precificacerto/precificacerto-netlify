#!/bin/bash
# PORTÃO 2, O LADO DO BANCO — `soma` de `dar_baixa_em_lote` sobre os lotes de `somas.json`. O lado
# da tela é `src/utils/__tests__/a-rota-da-baixa.test.ts`, que lê a MESMA tabela e compara com
# `somarSelecionadas`. Uso: somas.sh <arquivo da …000003>. Mesmo Postgres local de `run.sh`.
#
# Recusa vira `FALHOU` com o SQLSTATE (a lição de `deltas.sh`), e o script confere UMA linha `ok`
# por lote da tabela — um lote que nem roda não conta como verde.
S=$(cd "$(dirname "$0")" && pwd); P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
$P -c 'drop database if exists harness_somas' >/dev/null 2>&1; $P -c 'create database harness_somas' >/dev/null
for f in 00_schema.sql 01_orders.sql 02_000001_como_aplicada.sql; do
  $P -d harness_somas -v ON_ERROR_STOP=1 -f $S/$f >/dev/null 2>&1 || { echo "BASE FALHOU em $f"; exit 2; }
done
$P -d harness_somas -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "MIGRACAO FALHOU"; exit 2; }
SAIDA=$(python3 - "$S/somas.json" <<'PY' | $P -d harness_somas -At 2>&1 | sed -nE '/^(ok: |FALHOU: )/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p'
import json, sys
t = json.load(open(sys.argv[1]))
print("""
insert into public.tenants values ('00000000-0000-0000-0000-00000000000a');
create function s(v numeric[]) returns text language plpgsql as $$
declare r jsonb; ids uuid[] := '{}'; i int; begin
  delete from public.parcela_reajuste_log; delete from public.cash_entries;
  for i in 1 .. array_length(v, 1) loop
    insert into public.cash_entries (id, tenant_id, type, amount, due_date, origin_type, origin_id, payment_method)
    values (('00000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid, '00000000-0000-0000-0000-00000000000a', 'INCOME',
            v[i], date '2026-10-10' + i, 'SALE', ('00000000-0000-0000-0001-' || lpad((1 + i % 3)::text,12,'0'))::uuid, 'BOLETO');
    ids := ids || ('00000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid;
  end loop;
  r := public.dar_baixa_em_lote(ids, '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1',
                                date '2026-10-17', array_fill(null::public.payment_method, array[array_length(ids, 1)]));
  return r->>'soma';
exception when others then return 'RECUSOU ' || SQLSTATE; end $$;
""")
for l in t['lotes']:
    arr = "array[" + ",".join(l['valores']) + "]::numeric[]"
    nome = l['nome'].replace("'", "''")
    print(f"select case when v ~ '^-?[0-9]+(\\.[0-9]+)?$' and v::numeric = {l['soma']} then 'ok: {nome} -> {l['soma']}' else 'FALHOU: {nome} esperava {l['soma']}, RPC deu ' || coalesce(v, 'nulo') end from (select s({arr}) v) x;")
PY
)
echo "$SAIDA"
ESPERADO=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['lotes']))" "$S/somas.json")
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO lotes ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
