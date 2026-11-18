#!/usr/bin/env python3
"""Mutações de O QUE IMPEDE O ITEM (dono do produto, 18/11/2026, decisão 2: "o agente sempre diz o que o impede"): as frases de cada motivo do
padrão (tipologia-padrao.ts) e a resposta que leva uma frase por item, mais o que ainda falta (conversa-da-ia.ts).
Cada mutação troca um trecho; as suítes dela têm de ficar vermelhas. Roda SOZINHA ou numa worktree (mutacao-na-arvore-de-trabalho.md).
Uso: python3 -B scripts/mutacoes/o-que-impede-o-item.py  (os arquivos voltam ao original no fim, sempre)."""
import os, subprocess, sys

LIB = 'src/lib/atendimentos-ia/'
PADRAO, CONVERSA = LIB + 'tipologia-padrao.ts', LIB + 'conversa-da-ia.ts'
T = 'src/utils/__tests__/'
PURA = [T + 'tipologia-padrao-atributo-por-atributo.test.ts']
PONTA = [T + 'atendimentos-ia-levantamento-por-nome.test.ts', '-t', 'CASO DAIANE|Jorge Koss|Maria Cristina']

# (nome, arquivo, de, para, suítes)
M = [
 # as frases de cada motivo
 ('F1 o impedimento não chega a quem chama', PADRAO, "(f) => { impedimento = f })", "() => undefined)", PURA),
 ('F3 dois tipos ditos sem a frase própria', PADRAO, "return falta({ motivo: 'TIPOS_DITOS' }, fraseDosTiposDitos([...tiposDoMotor]))", "return { motivo: 'TIPOS_DITOS' }", PURA + ['-t', 'O QUE IMPEDE']),
 ('F4 o tipo fora do motor sem os tipos que ele tem', PADRAO, "    if (ditos.tipoForaDoMotor) return falta({ motivo: 'TIPO_FORA_DO_MOTOR' }, fraseDoTipoForaDoMotor(tiposDaEmpresa))", "    if (ditos.tipoForaDoMotor) return falta({ motivo: 'TIPO_FORA_DO_MOTOR' }, fraseDoTipoForaDoMotor([]))", PURA),
 ('F5 os módulos ditos sem as opções', PADRAO, "return falta({ motivo: 'MODULOS_DITOS' }, fraseDosModulosDitos(ditos.modulos, opcoes))", "return falta({ motivo: 'MODULOS_DITOS' }, fraseDosModulosDitos(ditos.modulos, []))", PURA),
 ('F6 a sem candidata sem o que foi dito', PADRAO, "fraseDaSemCandidata(esquadria, [...ditos.extras]))", "fraseDaSemCandidata(esquadria))", PURA),
 ('F7 o fora do limite da modulação sem frase', PADRAO, "if (cabem.length === 0) return falta({ motivo: 'LIMITES' }, fraseDoForaDoLimite(item, porModulacao.map(({ c }) => c)))", "if (cabem.length === 0) return { motivo: 'LIMITES' }", PURA + ['-t', 'O QUE IMPEDE']),
 ('F8 a única fora do limite sem frase', PADRAO, "{ explicar(fraseDoForaDoLimite(item, [unica.c])); return { motivo: 'LIMITES' } }", "{ return { motivo: 'LIMITES' } }", PURA),
 ('F9 o limite diz o lado que o arquivo não traz', PADRAO, ": max !== null ? `${nome} máxima de ${emMm(max)} mm` : null", ": max !== null ? `${nome} máxima de ${emMm(max)} mm` : `${nome} sem limite`", PURA),
 ('F10 a medida sem o milhar', PADRAO, "const emMm = (n: number) => n.toLocaleString('pt-BR')", "const emMm = (n: number) => String(n)", PURA),
 ('F11 a lista com "e" no lugar de "ou"', PADRAO, "`${u.slice(0, -1).join(', ')} ou ${u[u.length - 1]}`", "`${u.slice(0, -1).join(', ')} e ${u[u.length - 1]}`", PURA),
 # a conversa
 ('C1 a frase do impedimento não vai à resposta', CONVERSA, "faltasDoPadrao.push({ ordem: item.ordem, frase: impedimento, motivo: padrao.motivo })", "void 0", PONTA),
 ('C2 a falta de informação também vira impedimento', CONVERSA, "if (impedimento !== null && !SO_FALTA_INFORMACAO.has(padrao.motivo))", "if (impedimento !== null)", [T + 'atendimentos-ia-levantamento-por-nome.test.ts']),
 ('C3 o que mais falta não vai junto', CONVERSA, "${x.frase}`), ...(resto.length ? [perguntaDasPendencias(resto, n, null, filtro.jaDito)] : [])]", "${x.frase}`)]", PONTA),
 ('C4 sem o "Item N:" na frente', CONVERSA, "...semPadrao.map((x) => `${n > 1 ? `Item ${x.ordem}: ` : ''}${x.frase}`)", "...semPadrao.map((x) => x.frase)", PONTA),
]
# EQUIVALENTES, fora da bateria (medidas em 18/11/2026): trocar `'motivo' in decisao ? … : null` por `impedimento ?? fraseDoPadraoQueFalta(…)`
# não muda nada, porque com tipologia `fraseDoPadraoQueFalta` devolve null e nenhum caminho chama `explicar` antes de devolver tipologia; e
# tirar a frase do `tipo === null` depois do tipo dito também não, porque `tipoCurto` só devolve null para tipo em branco, que `tiposDitos` não
# devolve (a guarda é defensiva).

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'harness'))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta com o código 3 (mutacao-que-nao-se-aplica.md)

orig = {a: open(a, encoding='utf-8').read() for a in {m[1] for m in M}}
exigir_trecho_unico((nome, [(arq, orig[arq], de, para)]) for nome, arq, de, para, _ in M)
jest = lambda suites: subprocess.run(['npx', 'jest', '--ci', *suites], capture_output=True, text=True)
vivas = []
try:
    for nome, arq, de, para, suites in M:
        open(arq, 'w', encoding='utf-8').write(orig[arq].replace(de, para))
        morta = jest(suites).returncode != 0
        open(arq, 'w', encoding='utf-8').write(orig[arq])
        print(f"{'morta' if morta else 'VIVA '}  {nome}", flush=True)
        if not morta: vivas.append(nome)
finally:
    for a, t in orig.items(): open(a, 'w', encoding='utf-8').write(t)
controle = [jest(s).returncode == 0 for s in (PURA, PONTA)]
print('controle (sem mutação):', 'verde' if all(controle) else f'VERMELHO {controle}')
print(f'{len(M) - len(vivas)} de {len(M)} mortas' + (f'; vivas: {vivas}' if vivas else ''))
sys.exit(1 if vivas or not all(controle) else 0)
