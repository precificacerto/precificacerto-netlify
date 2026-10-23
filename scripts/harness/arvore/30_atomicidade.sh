#!/bin/bash
# HARNESS da árvore — a ATOMICIDADE como a rota a vive: uma chamada em autocommit, como o rpc do
# PostgREST faz, que falha no MEIO. NÃO TOCA PRODUÇÃO.
#
# A árvore cria a matéria-prima "Ferro" (função 1), grava o config do PERFIL dela (função 2) e
# falha nos fornecedores (função 3, fornecedor de outro nicho). A MENSAGEM prova que as duas
# primeiras rodaram: sem a função 1, a categoria do Ferro não existiria e o erro seria outro. Depois:
# nem o Ferro, nem o config, nem UMA linha de log das internas. Mutação A5 do README (engolir o erro).
#
# Uso: 30_atomicidade.sh "<psql>" <banco>   (chamado por run.sh)
P="$1"; D="$2"
T=00000000-0000-0000-0000-0000000000a1; S=00000000-0000-0000-0000-00000000005a
LOGS0=$($P -d $D -At -c "SELECT count(*) FROM superadmin_alteracao_log")
OUT=$($P -d $D -c '\set VERBOSITY verbose' -c "SELECT superadmin_gravar_arvore('$T','$S','{\"materias_primas\":[{\"nome\":\"PVC\"},{\"nome\":\"Ferro\",\"categorias\":[{\"categoria_chave\":\"PERFIL\",\"config\":{\"linha\":\"F\"},\"fornecedores\":[{\"fornecedor_id\":\"00000000-0000-0000-0000-0000000000f3\",\"principal\":true}]}]}]}');" 2>&1)
LOGS1=$($P -d $D -At -c "SELECT count(*) FROM superadmin_alteracao_log")
FERRO=$($P -d $D -At -c "SELECT count(*) FROM orcamentista_materia_prima WHERE nome = 'Ferro'")
if ! echo "$OUT" | grep -q '23503: materia-prima Ferro, categoria PERFIL, fornecedores:'; then
  echo "FALHOU: atomicidade: a chamada nao falhou nos fornecedores com 23503 e o caminho: $(echo "$OUT" | grep -E 'ERROR' | head -1)"
elif [ "$FERRO" != 0 ] || [ "$LOGS1" != "$LOGS0" ]; then
  echo "FALHOU: atomicidade: falhou no meio e SOBROU escrita — Ferro=$FERRO, linhas de log $LOGS0 -> $LOGS1"
else
  echo "ok: atomicidade: em autocommit, falha na 3a chamada interna (depois de a 1a e a 2a rodarem) e nada sobra — nem a materia-prima, nem uma linha de log das internas"
fi
