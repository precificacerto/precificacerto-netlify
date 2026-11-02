-- O que o arrasto da CATEGORIA alcança e a base do harness (a cadeia da tabela-soberana + a 20261101000002 + a 20261102000001) ainda não tem,
-- na FORMA medida em produção em 02/11/2026, só leitura: o catálogo de campos (`orcamentista_categoria_campo`, 13 linhas: PERFIL 7, REFORCO 3,
-- ACESSORIOS_VEDACAO 3), com a PK, a FK para o catálogo de categorias (o mesmo nome de produção; sem ON DELETE, como lá) e a CHECK do tipo.
-- A tabela de PERSIANAS que o arrasto leva está em 09_persianas.sql, fora daqui: ela muda as contagens do fornecedor Wolf, e a REGRESSÃO dos casos
-- da 20261031000003 e da 20261101000001 roda sem ela.
-- A base já tem, do estado de 31/10/2026 (catalogo-soberano/09_estado.sql): as 7 categorias; a família PVC com 7 ramificações; a De Paula com
-- 7 categorias de conta, 2 fornecedores vinculados (PERFIL e VIDRO), 4 ferragens, 3 instalações e 4 vidros; as tabelas 21acfa75 (PERFIL),
-- fe2c6667 (FERRAGENS) e 5f7acebf (sem categoria); o motor 9a233c55 (PERFIL, depois da 20261028000001).
CREATE TABLE IF NOT EXISTS public.orcamentista_categoria_campo (
  categoria_chave text NOT NULL,
  chave           text NOT NULL,
  tipo            text NOT NULL,
  rotulo          text NOT NULL,
  ordem           int  NOT NULL,
  opcoes          text[],
  CONSTRAINT orcamentista_categoria_campo_pkey         PRIMARY KEY (categoria_chave, chave),
  CONSTRAINT orcamentista_categoria_campo_categoria_fk FOREIGN KEY (categoria_chave) REFERENCES public.orcamentista_categoria_catalogo (chave),
  CONSTRAINT orcamentista_categoria_campo_tipo_valido  CHECK (tipo IN ('texto', 'inteiro', 'numero', 'booleano', 'lista_texto', 'mapa', 'opcao'))
);
INSERT INTO public.orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem) VALUES
  ('PERFIL', 'linha', 'texto', 'Linha', 1), ('PERFIL', 'cor_predominante', 'texto', 'Cor predominante', 2), ('PERFIL', 'cores', 'lista_texto', 'Cores que trabalha', 3),
  ('PERFIL', 'barra_mm', 'inteiro', 'Barra (mm)', 4), ('PERFIL', 'serra_mm', 'inteiro', 'Serra (mm)', 5), ('PERFIL', 'solda', 'texto', 'Solda', 6),
  ('PERFIL', 'criterio_custo_barra', 'opcao', 'Custo das barras', 7),
  ('REFORCO', 'usa', 'booleano', 'Usa reforço', 1), ('REFORCO', 'material', 'texto', 'Material', 2), ('REFORCO', 'par_inox_referencia', 'texto', 'Referência do par em inox', 3),
  ('ACESSORIOS_VEDACAO', 'cor_por_perfil', 'mapa', 'Cor do acessório por cor de perfil', 1), ('ACESSORIOS_VEDACAO', 'modelo_interlock', 'texto', 'Modelo do interlock', 2),
  ('ACESSORIOS_VEDACAO', 'vedacao', 'texto', 'Vedação', 3)
ON CONFLICT (categoria_chave, chave) DO NOTHING;
DO $v$ BEGIN
  IF (SELECT count(*) FROM public.orcamentista_categoria_campo) <> 13 THEN RAISE EXCEPTION 'estado: os 13 campos nao entraram'; END IF;
  IF (SELECT count(*) FROM public.orcamentista_categoria_catalogo) <> 7 THEN RAISE EXCEPTION 'estado: o catalogo nao tem as 7 categorias'; END IF;
  IF (SELECT count(*) FROM public.orcamentista_mp_categoria WHERE categoria_chave = 'PERSIANAS') <> 1 THEN RAISE EXCEPTION 'estado: a De Paula nao tem a categoria PERSIANAS'; END IF;
END $v$;
