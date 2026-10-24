#!/usr/bin/env python3
"""
HARNESS do tempo em tabela própria — as MUTAÇÕES da migração 20261024000003. NÃO TOCA PRODUÇÃO.

Cada mutação estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório nunca é escrito, e
o script confere isso no fim) e roda `run.sh` sobre a cópia. A mutação tem de DERRUBAR o que está
no 4º elemento: a verificação que aborta a migração, ou o caso que fica vermelho. Uma mutação que
passa verde é um caso que não exercita o que promete (`teste-que-nao-exercita.md`).

O controle M0 não muda nada e TEM de sair verde: prova que o detector não é vermelho por
construção (`instrumento-que-se-enxerga.md`, a fixture do alvo ausente).

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py V4 V7      (só estas)
Sai com 1 se alguma não derrubar, ou se o controle não sair verde.
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261024000003_tempo_da_tipologia_em_tabela_propria.sql')

T = 'public.orcamentista_motor_tipologia_tempo'
COPIA_WHERE = " WHERE tempo_origem IS NOT NULL\nON CONFLICT (tabela_id, tipologia) DO NOTHING;"

# (id, o que estraga, [(trecho, troca), ...], fragmento que TEM de aparecer na saída, só aplicar?)
MUTACOES = [
    ('V1', 'sem o REVOKE de anon e authenticated',
     [(f"REVOKE ALL ON {T} FROM anon, authenticated;\n", "")], 'verificacao 4', False),
    ('V8', 'o REVOKE esquece o anon',
     [(f"REVOKE ALL ON {T} FROM anon, authenticated;\n", f"REVOKE ALL ON {T} FROM authenticated;\n")], 'verificacao 4', False),
    ('V2', 'sem a RLS ligada',
     [(f"ALTER TABLE {T} ENABLE ROW LEVEL SECURITY;\n", "")], 'verificacao 4', False),
    ('V3', 'a política de SELECT sem is_super_admin() — aberta a todos',
     [("  FOR SELECT USING (public.is_super_admin());\nCREATE POLICY orcamentista_motor_tipologia_tempo_insert",
       "  FOR SELECT USING (true);\nCREATE POLICY orcamentista_motor_tipologia_tempo_insert")], 'verificacao 4', False),
    ('V4', 'a cópia leva só os ESTIMADO',
     [(COPIA_WHERE, " WHERE tempo_origem = 'ESTIMADO'\nON CONFLICT (tabela_id, tipologia) DO NOTHING;")], 'verificacao 1', False),
    ('V5', 'a cópia grava tudo como ESTIMADO',
     [("SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem\n  FROM public.orcamentista_motor_tipologia\n WHERE",
       "SELECT tabela_id, tipologia, tempo_fabricacao_min, 'ESTIMADO'\n  FROM public.orcamentista_motor_tipologia\n WHERE")], 'verificacao 2', False),
    ('V6', 'a chave sem tabela_id — a mesma tipologia de duas tabelas colide',
     [("CONSTRAINT orcamentista_motor_tipologia_tempo_pkey PRIMARY KEY (tabela_id, tipologia),",
       "CONSTRAINT orcamentista_motor_tipologia_tempo_pkey PRIMARY KEY (tipologia),"),
      ("ON CONFLICT (tabela_id, tipologia) DO NOTHING;", "ON CONFLICT (tipologia) DO NOTHING;")], 'verificacao 1', False),
    ('V7', 'a migração "move" o tempo: apaga as colunas antigas no mesmo passo',
     [("-- ── 4. AS COLUNAS ANTIGAS FICAM",
       "UPDATE public.orcamentista_motor_tipologia SET tempo_fabricacao_min = NULL, tempo_origem = NULL;\n-- ── 4. AS COLUNAS ANTIGAS FICAM")], 'verificacao 3', False),
    ('B1', 'ON CONFLICT DO UPDATE: reaplicar SOBRESCREVE a tabela nova com a antiga',
     [("ON CONFLICT (tabela_id, tipologia) DO NOTHING;",
       "ON CONFLICT (tabela_id, tipologia) DO UPDATE SET tempo_fabricacao_min = EXCLUDED.tempo_fabricacao_min, tempo_origem = EXCLUDED.tempo_origem;")],
     'FALHOU: a reaplicação', False),
    ('B2', 'FK para orcamentista_motor_tipologia com CASCADE — a importação leva o tempo junto',
     [("  CONSTRAINT orcamentista_motor_tipologia_tempo_positivo",
       "  CONSTRAINT harness_fk_tipologia FOREIGN KEY (tabela_id, tipologia) REFERENCES public.orcamentista_motor_tipologia (tabela_id, tipologia) ON DELETE CASCADE,\n  CONSTRAINT orcamentista_motor_tipologia_tempo_positivo")],
     'FALHOU: caso 4', False),
    ('B3', 'a FK para a tabela do fornecedor SEM CASCADE',
     [("REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,", "REFERENCES public.orcamentista_tabela(id),")],
     'violates foreign key', False),
    ('B4', 'sem o CHECK de tempo positivo',
     [("  CONSTRAINT orcamentista_motor_tipologia_tempo_positivo CHECK (tempo_fabricacao_min > 0),\n", "")],
     'FALHOU: caso 6', False),
    ('B5', 'sem marcar as colunas antigas como OBSOLETAS',
     [("  'OBSOLETA desde 20261024000003: a fonte e orcamentista_motor_tipologia_tempo. A importacao apaga esta coluna. Sai em migracao posterior, depois que o leitor ler a tabela nova';\nCOMMENT ON COLUMN public.orcamentista_motor_tipologia.tempo_origem",
       "  'minutos de fabricacao da tipologia';\nCOMMENT ON COLUMN public.orcamentista_motor_tipologia.tempo_origem")],
     'FALHOU: caso 3', False),
    ('M0', 'CONTROLE: nada muda', [], None, False),
]


def mutar(texto, trocas):
    if callable(trocas):
        novo = trocas(texto)
        if novo == texto:
            raise SystemExit('a transformação não mudou nada — a mutação não exercitaria o que promete')
        return novo
    for velho, novo in trocas:
        n = texto.count(velho)
        if n != 1:
            raise SystemExit(f'o trecho a mutar aparece {n} vez(es) — a migração mudou e a mutação precisa ser revista: {velho[:80]!r}')
        texto = texto.replace(velho, novo)
    return texto


def main():
    pedidas = set(sys.argv[1:])
    original = open(MIG, encoding='utf-8').read()
    falhas = 0
    with tempfile.TemporaryDirectory() as tmp:
        copia = os.path.join(tmp, 'mutada.sql')
        for ident, descricao, trocas, espera, so_aplicar in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            open(copia, 'w', encoding='utf-8').write(mutar(original, trocas))
            env = dict(os.environ)
            if so_aplicar:
                env['SO_APLICAR'] = '1'
            p = subprocess.run(['bash', os.path.join(AQUI, 'run.sh'), copia], capture_output=True, text=True, env=env)
            saida = p.stdout + p.stderr
            if espera is None:   # o controle
                ok = p.returncode == 0
                falhas += 0 if ok else 1
                print(f"{'VERDE        ' if ok else 'VERMELHO(!)  '} {ident:4} {descricao}  [{saida.strip().splitlines()[-1]}]")
                continue
            derrubou = p.returncode != 0 and espera in saida
            falhas += 0 if derrubou else 1
            linha = next((l for l in saida.splitlines() if espera in l), '')
            print(f"{'VERMELHO     ' if derrubou else 'NAO DERRUBOU '} {ident:4} {descricao}")
            print('      caiu: ' + linha.strip()[:200] if derrubou else '      esperado na saída: ' + espera)
            if not derrubou:
                print('      ' + '\n      '.join(l for l in saida.splitlines() if 'FALHOU' in l or 'ERRO' in l or 'casos ok' in l or 'ABORTOU' in l))
    if open(MIG, encoding='utf-8').read() != original:
        raise SystemExit('o arquivo da migração foi alterado durante as mutações — isto não deveria acontecer')
    print(f'{falhas} mutação(ões) que NÃO fizeram o que deviam')
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
