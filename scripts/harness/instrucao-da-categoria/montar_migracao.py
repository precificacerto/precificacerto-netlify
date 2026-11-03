#!/usr/bin/env python3
"""Monta a 20261103000002 a partir do modelo (modelo.sql) e do corpo de PRODUÇÃO da superadmin_gravar_arvore
(corpos-de-producao/superadmin_gravar_arvore.sql, md5 d1165c55f1e143e7a805249cc1494afe, o da 20261023000004).

O que muda no corpo da árvore, e a prova de que é só isso:
  1. a chave `instrucao` entra na lista das que a função sabe a quem entregar;
  2. um bloco IF chama a superadmin_gravar_instrucao_da_categoria, depois do da config;
  3. os COMENTÁRIOS de dentro do corpo perdem os acentos (decisão do dono do produto, 03/11/2026: "corpo todo em ASCII"). Prova: em cada linha
     que a transliteração muda, o código antes do "--" é o mesmo, byte a byte.
Depois da transliteração, o difflib entre produção e o novo só pode mostrar as linhas acrescentadas e a única linha trocada (a lista).
Imprime o caminho, o md5, as linhas e os bytes do arquivo final."""
import difflib, hashlib, pathlib, re, sys, unicodedata

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
DESTINO = RAIZ / 'supabase/migrations/20261103000002_instrucao_da_categoria.sql'
MD5_PRODUCAO = 'd1165c55f1e143e7a805249cc1494afe'

def ascii_(t: str) -> str:
    t = t.replace('—', '-').replace('–', '-').replace('“', '"').replace('”', '"')
    return unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode('ascii')

def corpo(sql: str):
    m = re.search(r'AS (\$fn\$)(.*?)\1', sql, re.S)
    return m.start(2), m.end(2), m.group(2)

def troca(texto: str, de: str, para: str) -> str:
    assert texto.count(de) == 1, f'trecho nao achado ou repetido: {de[:70]!r}'
    return texto.replace(de, para)

# ── a árvore: o corpo de produção, conferido ──
arvore_prod = (AQUI / 'corpos-de-producao/superadmin_gravar_arvore.sql').read_text()
i, j, b_prod = corpo(arvore_prod)
assert hashlib.md5(b_prod.encode()).hexdigest() == MD5_PRODUCAO, 'o corpo de producao da arvore nao e o medido'

# (3) a transliteração só toca comentário
b_ascii = ascii_(b_prod)
for a, n in zip(b_prod.split('\n'), b_ascii.split('\n')):
    if a != n:
        assert '--' in a and a.split('--', 1)[0] == n.split('--', 1)[0], f'a transliteracao tocou codigo: {a!r}'
assert len(b_prod.split('\n')) == len(b_ascii.split('\n'))

# (1) e (2) o acréscimo
b_novo = troca(b_ascii, "   WHERE k NOT IN ('categoria_chave', 'config', 'fornecedores', 'vidros', 'ferragens', 'instalacao');",
               "   WHERE k NOT IN ('categoria_chave', 'config', 'fornecedores', 'vidros', 'ferragens', 'instalacao', 'instrucao');")
b_novo = troca(b_novo, """          IF v_cat ? 'config' THEN
            v_caminho := v_base || ', config';
            PERFORM public.superadmin_gravar_mp_categoria(p_tenant, p_por, v_mp_id, v_chave, v_cat -> 'config');
          END IF;
""", """          IF v_cat ? 'config' THEN
            v_caminho := v_base || ', config';
            PERFORM public.superadmin_gravar_mp_categoria(p_tenant, p_por, v_mp_id, v_chave, v_cat -> 'config');
          END IF;
          -- 03/11/2026 (20261103000002): a instrucao da categoria, texto livre ate 1500, gravada no mesmo bloco (o erro sai com o caminho)
          IF v_cat ? 'instrucao' THEN
            v_caminho := v_base || ', instrucao';
            PERFORM public.superadmin_gravar_instrucao_da_categoria(p_tenant, p_por, v_cat_id, v_cat -> 'instrucao');
          END IF;
""")
assert all(ord(c) < 128 for c in b_novo), 'o corpo novo da arvore tem caractere fora do ASCII'

# a prova pelo diff: depois da transliteração, só a linha da lista mudou e só as 5 linhas do bloco entraram
d = [l for l in difflib.ndiff(b_ascii.split('\n'), b_novo.split('\n')) if l[:1] in '+-']
menos = [l for l in d if l.startswith('- ')]; mais = [l for l in d if l.startswith('+ ')]
assert len(menos) == 1 and "'instalacao');" in menos[0], menos
assert len(mais) == 6 and "'instalacao', 'instrucao');" in mais[0], mais
arvore_nova = arvore_prod[:i] + b_novo + arvore_prod[j:]
arvore_nova = ascii_(arvore_nova[:i]) + b_novo + arvore_prod[j:]   # a assinatura (fora do corpo) não tem acento; garante
md5_arvore = hashlib.md5(b_novo.encode()).hexdigest()

# ── a função nova ──
FUNCAO = r"""CREATE OR REPLACE FUNCTION public.superadmin_gravar_instrucao_da_categoria(
  p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_instrucao jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
-- 03/11/2026 (20261103000002): a instrucao da categoria da conta, texto livre ate 1500 caracteres. A conversa a manda ao modelo, identificada
-- pela categoria, so quando preenchida. Corpo em ASCII: a colagem pelo SQL Editor no Windows reescreve o que nao e ASCII.
DECLARE
  v_texto  text;
  v_n      integer;
  v_antes  jsonb;
  v_atual  text;
  v_depois jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  -- texto ou null; null, vazio e so espaco limpam: ausente e NULL, nunca texto vazio
  IF p_instrucao IS NULL OR jsonb_typeof(p_instrucao) = 'null' THEN
    v_texto := NULL;
  ELSIF jsonb_typeof(p_instrucao) <> 'string' THEN
    RAISE EXCEPTION 'a instrucao e um texto' USING ERRCODE = 'invalid_parameter_value';
  ELSE
    v_texto := nullif(btrim(p_instrucao #>> '{}', E' \t\r\n'), '');
  END IF;
  v_n := char_length(v_texto);
  IF v_n > 1500 THEN
    RAISE EXCEPTION 'a instrucao tem % caracteres; o limite e 1500', v_n USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- a categoria tem de ser DESTA empresa: travada e lida com o tenant, nunca confiada
  SELECT to_jsonb(c), c.instrucao INTO v_antes, v_atual
    FROM public.orcamentista_mp_categoria c
   WHERE c.id = p_mp_categoria AND c.tenant_id = p_tenant
   FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'categoria inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  -- a mesma instrucao nao grava nem loga
  IF v_atual IS NOT DISTINCT FROM v_texto THEN
    RETURN jsonb_build_object('orcamentista_mp_categoria', v_antes, 'mudou', false);
  END IF;
  UPDATE public.orcamentista_mp_categoria c
     SET instrucao = v_texto, atualizado_por = p_por, atualizado_em = now()
   WHERE c.id = p_mp_categoria AND c.tenant_id = p_tenant
  RETURNING to_jsonb(c) INTO v_depois;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_mp_categoria', p_mp_categoria::text,
          jsonb_build_object('orcamentista_mp_categoria', v_antes),
          jsonb_build_object('orcamentista_mp_categoria', v_depois, 'campo', 'instrucao'), p_por);
  RETURN jsonb_build_object('orcamentista_mp_categoria', v_depois, 'mudou', true);
END
$fn$;"""
_, _, b_nova = corpo(FUNCAO)
assert all(ord(c) < 128 for c in b_nova)
md5_nova = hashlib.md5(b_nova.encode()).hexdigest()

modelo = (AQUI / 'modelo.sql').read_text()
saida = (modelo.replace('@@FUNCAO_NOVA@@', FUNCAO).replace('@@ARVORE@@', arvore_nova.rstrip('\n'))
               .replace('@@MD5_ARVORE@@', md5_arvore).replace('@@MD5_NOVA@@', md5_nova))
assert '@@' not in saida
DESTINO.write_text(saida)
dados = DESTINO.read_bytes()
assert b'\r' not in dados
print(DESTINO.relative_to(RAIZ), hashlib.md5(dados).hexdigest(), dados.count(b'\n'), 'linhas', len(dados), 'bytes',
      'arvore', md5_arvore, 'nova', md5_nova)
