#!/bin/bash
# O LADO DA RPC de `deltas.json`. O lado do cliente é `o-valor-diferente-na-tela.test.tsx`, que
# lê a MESMA tabela. Uso: deltas.sh <arquivo da migração>. Saída: `ok:` / `FALHOU:` por par.
# Mesmo Postgres local de `run.sh` (ver o cabeçalho de lá para subir).
#
# A RPC QUE RECUSA TEM DE APARECER COMO `FALHOU`. A primeira versão deixava a exceção subir: o
# psql imprimia ERROR, o filtro a descartava, e com o sinal do delta invertido na função SÓ OS
# DOIS PARES DE DELTA ZERO apareciam — como `ok`. O instrumento não enxergava a recusa
# (`instrumento-que-nao-enxerga.md`). Agora a exceção vira `FALHOU` com o SQLSTATE, e o script
# confere que saiu UMA linha `ok` por par da tabela; qualquer outra coisa sai com código 1.
S=$(cd "$(dirname "$0")" && pwd); P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
$P -c 'drop database if exists harness_deltas' >/dev/null 2>&1; $P -c 'create database harness_deltas' >/dev/null
$P -d harness_deltas -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "SCHEMA FALHOU"; exit 2; }
$P -d harness_deltas -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "MIGRACAO FALHOU"; exit 2; }
SAIDA=$(python3 - "$S/deltas.json" <<'PY' | $P -d harness_deltas -At 2>&1 | grep -oE '(ok|FALHOU)[^"]*'
import json, sys
t = json.load(open(sys.argv[1]))
print("""
insert into public.tenants values ('00000000-0000-0000-0000-00000000000a');
create function d(c numeric, p numeric) returns text language plpgsql as $$
declare r jsonb; begin
  delete from public.parcela_reajuste_log; delete from public.cash_entries;
  insert into public.cash_entries (id, tenant_id, type, amount, due_date, origin_type, origin_id) values
   ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','INCOME',c,'2026-10-10','SALE','00000000-0000-0000-0001-0000000000ee'),
   ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-00000000000a','INCOME',500000.00,'2026-11-10','SALE','00000000-0000-0000-0001-0000000000ee'),
   ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-00000000000a','INCOME',500000.00,'2026-12-10','SALE','00000000-0000-0000-0001-0000000000ee');
  r := public.dar_baixa_com_valor_diferente('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1',p,date '2026-10-17','PIX');
  return r->>'delta';
exception when others then return 'RECUSOU ' || SQLSTATE; end $$;
""")
for x in t['duas_casas']:
    print(f"select case when v ~ '^-?[0-9]+(\\.[0-9]+)?$' and v::numeric = {x['delta']} then 'ok: {x['combinado']} / {x['pago']} -> {x['delta']}' else 'FALHOU: {x['combinado']} / {x['pago']} esperava {x['delta']}, RPC deu ' || coalesce(v, 'nulo') end from (select d({x['combinado']},{x['pago']}) v) s;")
for x in t['tres_casas_divergem']:
    print(f"select case when v ~ '^-?[0-9]+(\\.[0-9]+)?$' and v::numeric = {x['delta_rpc']} then 'ok: tres casas {x['pago']} -> RPC {x['delta_rpc']} (cliente daria {x['delta_cliente']})' else 'FALHOU: tres casas {x['pago']}, RPC deu ' || coalesce(v, 'nulo') end from (select d({x['combinado']},{x['pago']}) v) s;")
PY
)
echo "$SAIDA"
ESPERADO=$(python3 -c "import json,sys; t=json.load(open(sys.argv[1])); print(len(t['duas_casas'])+len(t['tres_casas_divergem']))" "$S/deltas.json")
OKS=$(echo "$SAIDA" | grep -c '^ok')
echo "$OKS de $ESPERADO pares ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
