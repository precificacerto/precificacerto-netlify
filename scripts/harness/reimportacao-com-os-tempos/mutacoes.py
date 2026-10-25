#!/usr/bin/env python3
"""
HARNESS da reimportação com os tempos — as MUTAÇÕES. NÃO TOCA PRODUÇÃO: Postgres local.

Cada mutação faz a FUNÇÃO DE IMPORTAÇÃO (20261025000004) alcançar a tabela de tempos de um jeito, numa
cópia temporária, e roda `run.sh` com ela. A mutação tem de deixar algum caso vermelho, e o caso
exigido (4º elemento) tem de aparecer na saída. Sem isso, o "os 164 continuam lá" estaria verde por
construção (`teste-que-nao-exercita.md`).

Uso:   python3 -B scripts/harness/reimportacao-com-os-tempos/mutacoes.py
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
IMP = os.path.join(RAIZ, 'supabase/migrations/20261025000004_abas_do_motor_por_tipologia.sql')
ANCORA = '  DELETE FROM public.orcamentista_motor_otimizacao WHERE tabela_id = p_tabela_id;\n'

M = [
 ('R1', 'a importação apaga os tempos da tabela que importa',
  ANCORA + '  DELETE FROM public.orcamentista_motor_tipologia_tempo WHERE tabela_id = p_tabela_id;\n', 'caso 3'),
 ('R2', 'a importação apaga os tempos das OUTRAS tabelas',
  ANCORA + '  DELETE FROM public.orcamentista_motor_tipologia_tempo WHERE tabela_id <> p_tabela_id;\n', 'caso 4'),
 ('R3', 'a importação muda um tempo (soma +1) sem apagar nada',
  ANCORA + "  UPDATE public.orcamentista_motor_tipologia_tempo SET tempo_fabricacao_min = tempo_fabricacao_min + 1 WHERE tabela_id = p_tabela_id AND tipologia = 'DP-001';\n", 'caso 3'),
 ('R4', 'a importação troca a origem de um tempo',
  ANCORA + "  UPDATE public.orcamentista_motor_tipologia_tempo SET tempo_origem = 'IMPORTADO' WHERE tabela_id = p_tabela_id AND tipologia = 'DP-164';\n", 'caso 3'),
 ('R0', 'controle: nada muda', ANCORA, None),
]

def principal():
    orig = open(IMP, encoding='utf-8').read()
    if orig.count(ANCORA) != 1:
        print('A ÂNCORA NÃO APARECE UMA VEZ SÓ na 20261025000004 (o código mudou; ajuste as mutações)')
        return 1
    sobrou = []
    for ident, desc, troca, exige in M:
        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as f:
            f.write(orig.replace(ANCORA, troca))
            copia = f.name
        try:
            p = subprocess.run(['bash', os.path.join(AQUI, 'run.sh'), copia], capture_output=True, text=True)
        finally:
            os.unlink(copia)
        out = p.stdout + p.stderr
        ultima = (out.strip().split('\n') or [''])[-1]
        if exige is None:
            ok = p.returncode == 0
            print(f"{'VERDE' if ok else 'FALHOU'}       {ident} {desc} | {ultima}")
        else:
            ok = p.returncode != 0 and f'FALHOU: {exige}' in out
            print(f"{'VERMELHO' if ok else 'NAO DERRUBOU'} {ident} {desc} | {ultima} | exige 'FALHOU: {exige}': {'apareceu' if f'FALHOU: {exige}' in out else 'NÃO apareceu'}")
        if not ok:
            sobrou.append(ident)
    print('todas as mutações derrubaram o caso exigido; controle verde' if not sobrou else 'NÃO DERRUBARAM: ' + ', '.join(sobrou))
    return 1 if sobrou else 0

if __name__ == '__main__':
    sys.exit(principal())
