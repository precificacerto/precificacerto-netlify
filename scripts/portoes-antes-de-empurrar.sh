#!/bin/bash
# OS PORTÕES ANTES DE EMPURRAR — falham pelo CÓDIGO DE SAÍDA de cada portão, nunca por texto casado.
#
# A razão (dono do produto, 11/11/2026: "Portão que não reprova não é portão"): um commit do #264 foi empurrado com o check-tsc VERMELHO
# porque o encadeamento era `npm run check-tsc | grep -E "nenhum erro novo|VERMELHO" && git commit` — o código do pipeline é o do grep, que
# casou a linha do vermelho e saiu 0. O portão estava certo (sai 1 no vermelho); quem o chamava, não.
#
# Uso:   bash scripts/portoes-antes-de-empurrar.sh [suítes do jest...]
#        Sem argumento: check-tsc, check-pricing-engine e check-edge-imports. Com argumentos: também `jest` só nessas suítes.
#        Sai 1 no PRIMEIRO portão vermelho, dizendo qual. Use `bash scripts/portoes-antes-de-empurrar.sh ... && git commit ...`.
set -uo pipefail
cd "$(dirname "$0")/.."
portao() { # $1 nome, $2.. o comando; a saída vai para um arquivo, o veredito é o código de saída
  local nome=$1; shift
  local log; log=$(mktemp)
  if "$@" >"$log" 2>&1; then echo "verde     $nome"; rm -f "$log"
  else local c=$?; echo "VERMELHO  $nome (código $c) — as últimas linhas:"; tail -15 "$log"; rm -f "$log"; exit 1; fi
}
portao check-tsc npm run check-tsc
portao check-pricing-engine npm run check-pricing-engine
portao check-edge-imports npm run check-edge-imports
if [ $# -gt 0 ]; then portao "jest ($#)" npx jest --silent "$@"; fi
echo "todos verdes"
