#!/usr/bin/env python3
"""
As MUTAÇÕES da migração 20261111000001 (o índice dos desenhos). Cada uma estraga UMA coisa numa CÓPIA do .sql (fora da árvore de trabalho:
`mutacao-na-arvore-de-trabalho.md`), roda o run.sh com a cópia e conta morta (o harness saiu diferente de 0) ou viva. M0 é o controle: o
arquivo como está tem de dar verde. Confere TODAS as mutações antes de rodar qualquer uma (`mutacao-que-nao-se-aplica.md`).

Uso:   python3 -B mutacoes.py            (todas)
"""
import os, subprocess, sys, tempfile

S = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(S, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261111000001_desenhos_das_tipologias.sql')

MUTACOES = [
    ('R1', 'o REVOKE da tabela só de PUBLIC (o privilégio padrão de produção fica)', 'REVOKE ALL ON public.orcamentista_tipologia_desenho FROM PUBLIC, anon, authenticated;', 'REVOKE ALL ON public.orcamentista_tipologia_desenho FROM PUBLIC;'),
    ('R2', 'o REVOKE da função só de PUBLIC', 'REVOKE ALL ON FUNCTION public.superadmin_importar_desenhos(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;', 'REVOKE ALL ON FUNCTION public.superadmin_importar_desenhos(uuid, text, jsonb, boolean) FROM PUBLIC;'),
    ('R3', 'sem GRANT ao service_role', 'GRANT EXECUTE ON FUNCTION public.superadmin_importar_desenhos(uuid, text, jsonb, boolean) TO service_role;', ''),
    ('L1', 'sem RLS', 'ALTER TABLE public.orcamentista_tipologia_desenho ENABLE ROW LEVEL SECURITY;', ''),
    ('F1', 'a chave desconhecida passa calada', "  IF v_chave IS NOT NULL THEN\n    RAISE EXCEPTION 'linhas: chave desconhecida \"%\".', v_chave USING ERRCODE = '22023';\n  END IF;\n", ''),
    ('F2', 'o mesmo índice apaga e regrava', '  IF v_ultimo = p_sha256 AND v_antes = jsonb_array_length(p_linhas) THEN', '  IF false THEN'),
    ('F3', 'sem o DELETE: a linha que saiu do índice fica', '  DELETE FROM public.orcamentista_tipologia_desenho;\n', ''),
    ('F4', 'sem a trava: duas importações se cruzam', "  PERFORM pg_advisory_xact_lock(hashtext('orcamentista_tipologia_desenho'));\n", ''),
    ('F5', 'sem o log', "  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n  VALUES (NULL, 'orcamentista_tipologia_desenho', p_sha256,", "  PERFORM 1; PERFORM (NULL, 'orcamentista_tipologia_desenho', p_sha256,"),
    ('F6', 'o sha256 fora da forma passa', "IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN", 'IF p_sha256 IS NULL THEN'),
    ('F7', 'a lista vazia passa', "IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN", "IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN"),
    ('F8', 'sem SECURITY DEFINER', 'LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path', 'LANGUAGE plpgsql\nSET search_path'),
    # a trava do encolhimento (dono do produto, 11/11/2026)
    ('T1', 'o índice que encolhe a tabela passa sem permissão', "  IF v_recebidas < v_antes AND NOT p_permitir_encolher THEN", '  IF false THEN'),
    ('T2', 'a permissão nula passa (vira "não" calado)', "  IF p_permitir_encolher IS NULL THEN\n    RAISE EXCEPTION 'permitir_encolher: obrigatorio, true ou false.' USING ERRCODE = '22023';\n  END IF;\n", ''),
    ('T3', 'a permissão ganha default (deixa de ser explícita)', 'p_linhas jsonb, p_permitir_encolher boolean)', 'p_linhas jsonb, p_permitir_encolher boolean DEFAULT false)'),
    ('T4', 'o log perde as recebidas e a permissão', "jsonb_build_object('linhas', v_depois, 'recebidas', v_recebidas, 'permitir_encolher', p_permitir_encolher,", "jsonb_build_object('linhas', v_depois,"),
    ('T5', 'o log perde a contagem de ANTES', "          jsonb_build_object('linhas', v_antes),\n", "          NULL,\n"),
    ('C1', 'sem a CHECK do codigo_dp (o código cru entraria no normalizado)', "  CONSTRAINT orcamentista_tipologia_desenho_codigo_dp_forma CHECK (codigo_dp ~ '^DP-[1-9][0-9]*$'),\n", ''),
    ('C2', 'sem a CHECK do caminho', "  CONSTRAINT orcamentista_tipologia_desenho_caminho_forma CHECK (caminho_no_storage ~ '^tipologias/[a-z0-9]+(-[a-z0-9]+)*/[^/]+$')", "  CONSTRAINT orcamentista_tipologia_desenho_x CHECK (true)"),
    ('C3', 'sem a CHECK da fonte', "  CONSTRAINT orcamentista_tipologia_desenho_fonte CHECK (fonte IN ('principal', 'por_variavel')),\n", ''),
    ('N1', 'liberado vazio vira falso (default)', '  liberado_para_venda boolean NULL,', '  liberado_para_venda boolean NULL DEFAULT false,'),
    ('G1', 'sem a guarda da tabela de outra forma', "    IF n <> 9 THEN\n      RAISE EXCEPTION 'orcamentista_tipologia_desenho ja existe com % colunas (esta migracao cria 9). Nada foi alterado.', n;\n    END IF;\n", ''),
    ('G3', 'a reaplicação depois da importação aborta (a vazia vira exigência sempre)', "  IF current_setting('migracao_20261111000001.tabela_existia', true) IS DISTINCT FROM 'sim' THEN", '  IF true THEN'),
    ('G4', 'a tabela que nasce com linha passa', "  IF current_setting('migracao_20261111000001.tabela_existia', true) IS DISTINCT FROM 'sim' THEN", '  IF false THEN'),
    ('G2', 'sem a guarda das dependências', "  IF to_regprocedure('public.is_super_admin()') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN", '  IF false THEN'),
]
sys.path.insert(0, os.path.dirname(S))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
TEXTO = open(MIG, encoding='utf-8').read()
exigir_trecho_unico((i, [(MIG, TEXTO, de, para)]) for i, _d, de, para in MUTACOES)

# R3 é EQUIVALENTE, medida em 11/11/2026: o privilégio padrão de produção (pg_default_acl do postgres no schema public, reproduzido no
# 00_base.sql) já dá EXECUTE ao service_role em toda função que o postgres cria, e o REVOKE da migração não o tira. O GRANT explícito fica no
# arquivo pela robustez (um banco sem esse privilégio padrão). Fica na lista para a próxima pessoa saber que foi olhada e por que sobrevive.
# G4 é EQUIVALENTE: a migração não tem INSERT, então a tabela que nasce nesta aplicação não tem como nascer com linha. A conferência é
# defesa contra uma edição futura do arquivo, não contra o arquivo de hoje.
EQUIVALENTES: set = {'R3', 'G4'}


def rodar(caminho):
    return subprocess.run(['bash', os.path.join(S, 'run.sh'), caminho], capture_output=True, text=True, env={**os.environ, 'HARNESS_DB': 'harness_desenhos_mut'}).returncode


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    with tempfile.TemporaryDirectory() as d:
        if not pedidas or 'M0' in pedidas:
            verde = rodar(MIG) == 0
            print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda", flush=True)
            vivas += 0 if verde else 1
        for ident, descricao, de, para in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            copia = os.path.join(d, f'{ident}.sql')
            open(copia, 'w', encoding='utf-8').write(TEXTO.replace(de, para))
            morta = rodar(copia) != 0
            if ident in EQUIVALENTES:
                print(f"{'morta   ' if morta else 'equival.'} {ident}: {descricao}", flush=True)
                continue
            print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}", flush=True)
            vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}", flush=True)
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
