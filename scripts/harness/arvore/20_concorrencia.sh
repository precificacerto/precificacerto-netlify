#!/bin/bash
# HARNESS da árvore — os DOIS casos de CONCORRÊNCIA, cada um com duas sessões. NÃO TOCA PRODUÇÃO.
#
# C1 — O RESUMO NÃO MENTE. A sessão A grava a árvore e segura a transação aberta; a B grava outra
#      árvore da MESMA empresa logo depois. Com o lock do tenant, B espera A inteira, e o ANTES do
#      resumo de B tem o que A gravou. Sem ele, B lê o antes ANTES de A confirmar — e o resumo de B
#      mente sobre o estado de que partiu. Mutações A1 e A2 do README.
# C2 — O DEADLOCK QUE O LOCK TIRA DO MAPA. A remove [PVC, Alumínio]; B remove [Alumínio, PVC]. Um
#      gatilho SÓ DO HARNESS dorme 1,5 s em cada DELETE de matéria-prima, para que as duas fiquem no
#      meio ao mesmo tempo. Com o lock do tenant, B espera A, A tira as duas, e B sai com P0002 (o
#      PVC não existe mais) — nunca 40P01. Sem o lock, cada uma trava uma matéria-prima e espera a
#      outra: o Postgres detecta o deadlock e derruba uma delas. Mutação A1 do README.
#
# Uso: 20_concorrencia.sh "<psql>" <banco>   (chamado por run.sh)
P="$1"; D="$2"
T=00000000-0000-0000-0000-0000000000c3; S=00000000-0000-0000-0000-00000000005a
TMP=$(mktemp -d)

# ── C1 ──
$P -d $D -c "BEGIN; SELECT superadmin_gravar_arvore('$T','$S','{\"materias_primas\":[{\"nome\":\"PVC\",\"categorias\":[{\"categoria_chave\":\"PERFIL\",\"config\":{\"linha\":\"Da sessao A\"}}]}]}'); SELECT pg_sleep(2); COMMIT;" >/dev/null 2>&1 &
sleep 0.7
$P -d $D -c "SELECT superadmin_gravar_arvore('$T','$S','{\"materias_primas\":[{\"nome\":\"PVC\"},{\"nome\":\"Alumínio\"}]}');" >/dev/null 2>&1
wait
R=$($P -d $D -At -c "SELECT antes::text FROM superadmin_alteracao_log WHERE tenant_id = '$T' AND tabela = 'arvore' AND depois::text LIKE '%Alumínio%' ORDER BY em DESC LIMIT 1")
if echo "$R" | grep -q 'Da sessao A'; then
  echo "ok: concorrencia C1: o segundo salvar esperou o primeiro, e o ANTES do resumo dele tem o que o primeiro gravou"
else
  echo "FALHOU: concorrencia C1: o antes do resumo do segundo salvar nao viu o primeiro: ${R:0:200}"
fi

# ── C2 ──
PVC=$($P -d $D -At -c "SELECT id FROM orcamentista_materia_prima WHERE tenant_id = '$T' AND nome = 'PVC'")
ALU=$($P -d $D -At -c "SELECT id FROM orcamentista_materia_prima WHERE tenant_id = '$T' AND nome = 'Alumínio'")
$P -d $D -c "CREATE FUNCTION public.harness_devagar() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN PERFORM pg_sleep(1.5); RETURN OLD; END \$\$;
             CREATE TRIGGER harness_devagar AFTER DELETE ON public.orcamentista_materia_prima FOR EACH ROW EXECUTE FUNCTION public.harness_devagar();" >/dev/null 2>&1
$P -d $D -c '\set VERBOSITY verbose' -c "SELECT superadmin_gravar_arvore('$T','$S','{\"remover\":[\"$PVC\",\"$ALU\"]}');" > $TMP/a.txt 2>&1 &
sleep 0.5
$P -d $D -c '\set VERBOSITY verbose' -c "SELECT superadmin_gravar_arvore('$T','$S','{\"remover\":[\"$ALU\",\"$PVC\"]}');" > $TMP/b.txt 2>&1
wait
$P -d $D -c "DROP TRIGGER harness_devagar ON public.orcamentista_materia_prima; DROP FUNCTION public.harness_devagar();" >/dev/null 2>&1
SOBRARAM=$($P -d $D -At -c "SELECT count(*) FROM orcamentista_materia_prima WHERE tenant_id = '$T'")
if grep -qiE 'deadlock|40P01' $TMP/a.txt $TMP/b.txt; then
  echo "FALHOU: concorrencia C2: DEADLOCK entre dois salvamentos que removem em ordem inversa: $(grep -hiE 'ERROR' $TMP/a.txt $TMP/b.txt | head -2 | tr '\n' ' ')"
elif [ "$SOBRARAM" = 0 ] && ! grep -q ERROR $TMP/a.txt && grep -q 'P0002' $TMP/b.txt; then
  echo "ok: concorrencia C2: remover em ordem inversa nao trava — o segundo esperou o primeiro e saiu com P0002, nunca 40P01"
else
  echo "FALHOU: concorrencia C2: estado inesperado (sobraram $SOBRARAM): A=$(grep -h ERROR $TMP/a.txt | head -1) B=$(grep -h ERROR $TMP/b.txt | head -1)"
fi
rm -rf $TMP
