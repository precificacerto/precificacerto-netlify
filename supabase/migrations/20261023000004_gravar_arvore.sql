-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261023000004 — `superadmin_gravar_arvore`: a base de conhecimento em TRÊS NÍVEIS gravada numa
-- transação só, chamando as sete funções da `20261023000003` — e que NASCE FECHADA
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTADO: NÃO APLICADA por quem a escreveu. Quem aplica é o dono do produto.
--
-- ORDEM: depende das sete funções da `20261023000003` (aplicada em produção em 23/10/2026). O bloco
-- 0 confere que as sete existem, com a assinatura certa, ANTES de criar esta: `plpgsql` não valida
-- referência na criação, e uma função que chama outra inexistente nasce e só quebra no primeiro uso
-- (`migration-delivery.md`). Aplicar ANTES do merge de qualquer rota que a chame. Só função: nenhum
-- DDL de tabela.
--
-- ══ POR QUE EXISTE ══
-- Com UM botão "salvar alterações", gravar a árvore pelas rotas do #133 são N chamadas, cada uma a
-- sua transação: medido em 23/10/2026, a terceira falhando deixou as duas primeiras gravadas e duas
-- linhas de log — meia verdade. Esta função faz as N chamadas DENTRO de uma transação: qualquer
-- erro desfaz tudo, as linhas de log das sete inclusive.
--
-- ══ DECISÕES DO DONO DO PRODUTO (23/10/2026) ══
--   1. ENDEREÇO POR NOME + categoria_chave. A função 1 identifica a matéria-prima por `lower(nome)` e
--      recusa `id` no item; e a matéria-prima nova ainda não tem id quando a árvore é montada.
--   2. Chave AUSENTE = não mexer; lista VAZIA = esvaziar. Vale para `config`, `fornecedores`,
--      `vidros`, `ferragens`, `instalacao` e `categorias`. Ausente não chama a função; vazio chama,
--      e a função apaga o que não veio.
--   3. `remover: [uuid]` à parte, pela função 7 — a função 1 não apaga.
--   4. UM `pg_advisory_xact_lock` no tenant, no começo, antes de qualquer chamada interna: dois
--      salvamentos da mesma empresa ficam em fila, e o deadlock por ordem de travamento entre eles
--      deixa de existir (exercitado no harness, com duas sessões).
--   5. Erro de chamada interna é capturado e RELANÇADO com o caminho (matéria-prima e categoria),
--      PRESERVANDO o ERRCODE: a rota escolhe o status pelo código.
--   6. LOG: as N linhas das sete ficam como estão. Esta insere, POR ÚLTIMO, UMA linha de resumo —
--      `tabela = 'arvore'`, `chave = p_tenant`, antes e depois com a árvore INTEIRA (as seis
--      tabelas), lida antes e depois das chamadas. É essa linha que reconstrói um salvar; as N são
--      o detalhe. As N e o resumo têm o mesmo `em` (o `now()` da transação).
--
-- ══ DECISÃO DE QUEM ESCREVEU, a confirmar ══
--   - REMOVER E GRAVAR A MESMA MATÉRIA-PRIMA NO MESMO SALVAR É RECUSADO (22023). A ordem
--     "remove e recria" apagaria a árvore inteira e criaria uma vazia com o mesmo nome; "grava e
--     remove" jogaria fora o que acabou de gravar. Nenhuma das duas é o que um botão "salvar" diz.
--   - A ordem das chamadas: `remover` primeiro; depois a função 1 com a lista inteira; depois, por
--     matéria-prima na ordem da lista e por categoria na ordem dela: config, fornecedores, vidros,
--     ferragens, instalação.
--
-- ══ O QUE A ÁRVORE HERDA DA FUNÇÃO 1, e a tela precisa saber ══
-- `materias_primas` vai à função 1 como a lista INTEIRA: a ordem é a posição, e matéria-prima que
-- não veio fica com a `ordem` que tinha. Uma árvore que mande só uma matéria-prima para editar uma
-- categoria dela reordena as outras. A tela manda a lista toda.
--
-- ══ NASCE FECHADA ══
-- Como as sete: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE ALL ... FROM
-- PUBLIC, anon, authenticated`, `GRANT EXECUTE ... TO service_role`, e só. A VERIFICAÇÃO no fim é o
-- mesmo bloco da `20261023000003`, sobre as OITO: aborta se alguma não existir, não for SECURITY
-- DEFINER, perder o search_path, for executável por PUBLIC, anon ou authenticated, não for por
-- service_role, ou tiver ACL nula ou com entrada de PUBLIC.
--
-- IDEMPOTENTE: CREATE OR REPLACE, e REVOKE/GRANT repetem sem efeito.
--
-- COMO APLICAR (`migration-delivery.md`)
--   - pelo conector: tire o BEGIN e o COMMIT e registre o `name` como o nome COMPLETO deste arquivo,
--     sem a extensão: `20261023000004_gravar_arvore`. ATENÇÃO: o corpo entre `$fn$` É O ARTEFATO —
--     o catálogo guarda o texto (`prosrc`). Não enxugue comentário de dentro do corpo sem a prova da
--     árvore PL/pgSQL (`transformacao-quebra-a-cadeia-de-hash.md`);
--   - pelo SQL Editor: como está. O Editor transporta CRLF: o `prosrc` fica com `\r` a mais, e só.
--   - DEPOIS: `NOTIFY pgrst, 'reload schema';`.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. AS DEPENDÊNCIAS — as sete existem, com a assinatura certa, ANTES de criar a oitava ────
DO $dependencias$
DECLARE
  a      text;
  faltam text;
BEGIN
  FOREACH a IN ARRAY ARRAY[
    'public.superadmin_gravar_materia_prima(uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb)',
    'public.superadmin_gravar_mp_fornecedores(uuid, uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_vidros(uuid, uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_ferragens(uuid, uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_instalacao(uuid, uuid, uuid, jsonb)',
    'public.superadmin_remover_materia_prima(uuid, uuid, uuid)'
  ] LOOP
    IF to_regprocedure(a) IS NULL THEN
      faltam := concat_ws('; ', faltam, a);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'dependencia(s) ausente(s) — aplique a 20261023000003 antes: %. Nada foi alterado.', faltam;
  END IF;
END
$dependencias$;

-- ── 1. A ÁRVORE NUMA TRANSAÇÃO SÓ ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_arvore(
  p_tenant uuid, p_por uuid, p_arvore jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- a ÁRVORE da empresa, as seis tabelas: UM texto, lido no antes e no depois — uma cópia só
  c_arvore CONSTANT text := $q$
    SELECT jsonb_build_object(
      'orcamentista_materia_prima', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ordem, m.nome)
                                                FROM public.orcamentista_materia_prima m WHERE m.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_categoria', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.materia_prima_id, c.categoria_chave)
                                               FROM public.orcamentista_mp_categoria c WHERE c.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_categoria_fornecedor', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.mp_categoria_id, f.ordem)
                                               FROM public.orcamentista_mp_categoria_fornecedor f WHERE f.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_vidro', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.mp_categoria_id, v.ordem)
                                           FROM public.orcamentista_mp_vidro v WHERE v.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_ferragem', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.mp_categoria_id, g.ordem)
                                              FROM public.orcamentista_mp_ferragem g WHERE g.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_instalacao', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.mp_categoria_id, i.produto)
                                                FROM public.orcamentista_mp_instalacao i WHERE i.tenant_id = $1), '[]'::jsonb))
  $q$;
  v_antes   jsonb;
  v_depois  jsonb;
  v_mps     jsonb;
  v_remover jsonb;
  v_mp      jsonb;
  v_cat     jsonb;
  v_mp_id   uuid;
  v_cat_id  uuid;
  v_chave   text;
  v_rem     text;
  v_fora    text;
  v_base    text;
  v_caminho text := 'arvore';
  v_estado  text;
  v_msg     text;
BEGIN
  -- (1) o autor e (2) a empresa — com as mensagens das sete, sem caminho
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- (3) o ENVELOPE da árvore. O conteúdo de cada nó é validado pela função que o recebe.
  IF p_arvore IS NULL OR jsonb_typeof(p_arvore) <> 'object' THEN
    RAISE EXCEPTION 'a arvore e um objeto com materias_primas e/ou remover' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_object_keys(p_arvore) k WHERE k NOT IN ('materias_primas', 'remover');
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) na arvore: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT (p_arvore ? 'materias_primas' OR p_arvore ? 'remover') THEN
    RAISE EXCEPTION 'nada a gravar' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_mps := p_arvore -> 'materias_primas';
  v_remover := p_arvore -> 'remover';
  IF p_arvore ? 'materias_primas' AND jsonb_typeof(v_mps) <> 'array' THEN
    RAISE EXCEPTION 'materias_primas e uma lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_arvore ? 'remover' AND (jsonb_typeof(v_remover) <> 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_remover) e
                 WHERE jsonb_typeof(e) <> 'string'
                    OR (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) THEN
    RAISE EXCEPTION 'remover e uma lista de ids (uuid) de materia-prima' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT lower(e #>> '{}')) FROM jsonb_array_elements(coalesce(v_remover, '[]'::jsonb)) e) THEN
    RAISE EXCEPTION 'materia-prima repetida em remover' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- as categorias de cada matéria-prima: lista de objetos com categoria_chave, sem repetir, do
  -- catálogo, e só com as chaves que esta função sabe a quem entregar
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e
              WHERE jsonb_typeof(e) = 'object' AND e ? 'categorias'
                AND (jsonb_typeof(e -> 'categorias') <> 'array'
                     OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e -> 'categorias') = 'array' THEN e -> 'categorias' ELSE '[]'::jsonb END) c
                                 WHERE jsonb_typeof(c) <> 'object' OR jsonb_typeof(c -> 'categoria_chave') IS DISTINCT FROM 'string'))) THEN
    RAISE EXCEPTION 'categorias e uma lista de objetos com categoria_chave' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(DISTINCT k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e,
         jsonb_array_elements(CASE WHEN jsonb_typeof(e) = 'object' AND jsonb_typeof(e -> 'categorias') = 'array' THEN e -> 'categorias' ELSE '[]'::jsonb END) c,
         jsonb_object_keys(c) k
   WHERE k NOT IN ('categoria_chave', 'config', 'fornecedores', 'vidros', 'ferragens', 'instalacao');
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) nas categorias: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(e ->> 'nome', ', ' ORDER BY e ->> 'nome') INTO v_fora
    FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e
   WHERE jsonb_typeof(e) = 'object' AND jsonb_typeof(e -> 'categorias') = 'array'
     AND (SELECT count(*) <> count(DISTINCT c ->> 'categoria_chave') FROM jsonb_array_elements(e -> 'categorias') c);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'categoria repetida na materia-prima %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(format('materia-prima %s, categoria %s', e ->> 'nome', c ->> 'categoria_chave'), '; ') INTO v_fora
    FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e,
         jsonb_array_elements(CASE WHEN jsonb_typeof(e) = 'object' AND jsonb_typeof(e -> 'categorias') = 'array' THEN e -> 'categorias' ELSE '[]'::jsonb END) c
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo k WHERE k.chave = c ->> 'categoria_chave');
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'categoria desconhecida: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (4) UM lock no TENANT, antes de qualquer chamada: dois salvamentos da mesma empresa em fila.
  --     Sem ele, o ANTES do resumo de um seria lido antes de o outro gravar, e duas árvores que
  --     travam matérias-primas em ordem diferente podiam se travar uma à outra.
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_arvore:' || p_tenant::text, 0));
  EXECUTE c_arvore INTO v_antes USING p_tenant;

  -- remover e gravar a MESMA matéria-prima no mesmo salvar: recusado (ver o cabeçalho)
  SELECT string_agg(m.nome, ', ' ORDER BY m.nome) INTO v_fora
    FROM public.orcamentista_materia_prima m
   WHERE m.tenant_id = p_tenant
     AND m.id::text IN (SELECT lower(e #>> '{}') FROM jsonb_array_elements(coalesce(v_remover, '[]'::jsonb)) e)
     AND lower(m.nome) IN (SELECT lower(e ->> 'nome') FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e WHERE jsonb_typeof(e) = 'object');
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'materia-prima em remover e em materias_primas no mesmo salvar: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (5) as CHAMADAS. Um bloco só: o erro de qualquer uma sai com o caminho de onde estava, e com o
  --     ERRCODE dela — a rota escolhe o status pelo código.
  BEGIN
    FOR v_rem IN SELECT e #>> '{}' FROM jsonb_array_elements(coalesce(v_remover, '[]'::jsonb)) WITH ORDINALITY x(e, o) ORDER BY o LOOP
      v_caminho := format('remover %s', v_rem);
      PERFORM public.superadmin_remover_materia_prima(p_tenant, p_por, v_rem::uuid);
    END LOOP;

    IF v_mps IS NOT NULL THEN
      v_caminho := 'materias_primas';
      PERFORM public.superadmin_gravar_materia_prima(p_tenant, p_por,
        coalesce((SELECT jsonb_agg(CASE WHEN jsonb_typeof(e) = 'object' THEN e - 'categorias' ELSE e END ORDER BY o)
                    FROM jsonb_array_elements(v_mps) WITH ORDINALITY x(e, o)), '[]'::jsonb));

      FOR v_mp IN SELECT e FROM jsonb_array_elements(v_mps) WITH ORDINALITY x(e, o)
                   WHERE jsonb_typeof(e) = 'object' AND e ? 'categorias' ORDER BY o LOOP
        SELECT m.id INTO v_mp_id FROM public.orcamentista_materia_prima m
         WHERE m.tenant_id = p_tenant AND lower(m.nome) = lower(v_mp ->> 'nome');
        FOR v_cat IN SELECT c FROM jsonb_array_elements(v_mp -> 'categorias') WITH ORDINALITY y(c, o) ORDER BY o LOOP
          v_chave := v_cat ->> 'categoria_chave';
          v_base := format('materia-prima %s, categoria %s', v_mp ->> 'nome', v_chave);
          v_caminho := v_base;
          SELECT c.id INTO v_cat_id FROM public.orcamentista_mp_categoria c
           WHERE c.materia_prima_id = v_mp_id AND c.tenant_id = p_tenant AND c.categoria_chave = v_chave;
          IF v_cat_id IS NULL THEN
            RAISE EXCEPTION 'categoria inexistente nesta empresa' USING ERRCODE = 'no_data_found';
          END IF;
          IF v_cat ? 'config' THEN
            v_caminho := v_base || ', config';
            PERFORM public.superadmin_gravar_mp_categoria(p_tenant, p_por, v_mp_id, v_chave, v_cat -> 'config');
          END IF;
          IF v_cat ? 'fornecedores' THEN
            v_caminho := v_base || ', fornecedores';
            PERFORM public.superadmin_gravar_mp_fornecedores(p_tenant, p_por, v_cat_id, v_cat -> 'fornecedores');
          END IF;
          IF v_cat ? 'vidros' THEN
            v_caminho := v_base || ', vidros';
            PERFORM public.superadmin_gravar_mp_vidros(p_tenant, p_por, v_cat_id, v_cat -> 'vidros');
          END IF;
          IF v_cat ? 'ferragens' THEN
            v_caminho := v_base || ', ferragens';
            PERFORM public.superadmin_gravar_mp_ferragens(p_tenant, p_por, v_cat_id, v_cat -> 'ferragens');
          END IF;
          IF v_cat ? 'instalacao' THEN
            v_caminho := v_base || ', instalacao';
            PERFORM public.superadmin_gravar_mp_instalacao(p_tenant, p_por, v_cat_id, v_cat -> 'instalacao');
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- o bloco já foi desfeito; relança para desfazer a transação inteira, com o caminho
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RAISE EXCEPTION '%: %', v_caminho, v_msg USING ERRCODE = v_estado;
  END;

  -- (6) o RESUMO: a árvore inteira, antes e depois — por último, na mesma transação
  EXECUTE c_arvore INTO v_depois USING p_tenant;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'arvore', p_tenant::text, v_antes, v_depois, p_por);

  RETURN v_depois;
END
$fn$;

-- ── 2. FECHADA: só service_role executa ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.superadmin_gravar_arvore(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_arvore(uuid, uuid, jsonb) TO service_role;

-- ── 3. VERIFICAÇÃO — o bloco da 20261023000003, sobre as OITO ───────────────────────────────
DO $verifica$
DECLARE
  assinaturas text[] := ARRAY[
    'public.superadmin_gravar_materia_prima(uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb)',
    'public.superadmin_gravar_mp_fornecedores(uuid, uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_vidros(uuid, uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_ferragens(uuid, uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_instalacao(uuid, uuid, uuid, jsonb)',
    'public.superadmin_remover_materia_prima(uuid, uuid, uuid)',
    'public.superadmin_gravar_arvore(uuid, uuid, jsonb)'
  ];
  a        text;
  f        regprocedure;
  aberta   text;
  sem_path text;
  herdada  text;
BEGIN
  FOREACH a IN ARRAY assinaturas LOOP
    f := to_regprocedure(a);
    -- (1) existe, é SECURITY DEFINER e tem o search_path fixo
    IF f IS NULL THEN
      RAISE EXCEPTION 'a funcao % nao existe. Nada foi alterado.', a;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef
                     AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      sem_path := concat_ws('; ', sem_path, a);
    END IF;
    -- (2) PUBLIC, anon e authenticated não executam; service_role executa
    IF has_function_privilege('public', f, 'EXECUTE')
       OR has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      aberta := concat_ws('; ', aberta, a);
    END IF;
    -- (3) nenhuma herança por PUBLIC: ACL nula é o default do Postgres — EXECUTE para PUBLIC —, e
    --     uma entrada de grantee 0 é PUBLIC explícito. Os dois abririam para authenticated.
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.proacl IS NULL)
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x
                   WHERE p.oid = f AND x.grantee = 0 AND x.privilege_type = 'EXECUTE') THEN
      herdada := concat_ws('; ', herdada, a);
    END IF;
  END LOOP;
  IF sem_path IS NOT NULL THEN
    RAISE EXCEPTION 'sem SECURITY DEFINER ou sem search_path fixo no proconfig: %. Nada foi alterado.', sem_path;
  END IF;
  IF aberta IS NOT NULL THEN
    RAISE EXCEPTION 'aberta a PUBLIC/anon/authenticated (ou service_role sem EXECUTE): %. Nada foi alterado.', aberta;
  END IF;
  IF herdada IS NOT NULL THEN
    RAISE EXCEPTION 'EXECUTE herdavel por PUBLIC (ACL nula ou com PUBLIC): %. Nada foi alterado.', herdada;
  END IF;
  RAISE NOTICE 'as 8 funcoes dos tres niveis: fechadas para PUBLIC, anon e authenticated; service_role executa; search_path fixo.';
END
$verifica$;

COMMIT;

-- ── DEPOIS DE APLICAR — pela consulta, não pelo retorno do comando ──────────────────────────
--   select format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) as assinatura,
--          p.prosecdef, p.proconfig,
--          has_function_privilege('public', p.oid, 'EXECUTE')        as public,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'superadmin_gravar_arvore';
--   → 1 linha; prosecdef = true; proconfig = {"search_path=public, pg_temp"};
--     public, anon e authenticated = false; service_role = true.
-- E então: NOTIFY pgrst, 'reload schema';
