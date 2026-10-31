-- O estado das 3 etapas da família "Esquadrias de PVC WOLF" (De Paula) MEDIDO em produção em 31/10/2026, depois da gravação das 14:57:47 UTC pela
-- tela: rótulos, ações e abas como estão, instrução vazia, as 3 com o motor da Wolff. Os mesmos ids. E a foto do antes, para os casos.
update public.orcamentista_familia_etapa set rotulo = 'Apanhado e levantamento de esquadrias', acao = 'GERAR_LEVANTAMENTO',
       abas = array['tipologias', 'variaveis', 'vidros', 'formulas_da_linha'], instrucao = ''
 where id = 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d';
update public.orcamentista_familia_etapa set rotulo = 'Relação de barras, materiais e tempo fabricaçãoprodução', acao = 'CALCULAR_BARRAS',
       abas = array['tipologias', 'perfis', 'formulas', 'variaveis', 'vidros', 'baguetes', 'insumos', 'validacoes', 'formulas_da_linha', 'regras', 'tempos'], instrucao = ''
 where id = 'ed9a9b06-d898-4f75-8487-e260d8ba8ec0';
update public.orcamentista_familia_etapa set rotulo = 'Relação de barras e materiais', acao = 'CALCULAR_BARRAS',
       abas = array['tipologias', 'perfis', 'formulas', 'variaveis', 'vidros', 'baguetes', 'insumos', 'validacoes', 'otimizacao', 'formulas_da_linha', 'regras', 'tempos'], instrucao = ''
 where id = 'dd8d3526-f08e-47e1-81c3-a6770214516f';
do $d$ begin
  if (select count(*) from public.orcamentista_familia_etapa where materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' and motor_id is not null) <> 3 then
    raise exception 'o estado de 31/10 nao montou: as 3 etapas com motor';
  end if;
end $d$;
create table public.h_etapas_antes_da_000001 as select * from public.orcamentista_familia_etapa;
create table public.h_log_antes_da_000001 as select count(*) as n from public.superadmin_alteracao_log;
