-- O estado ANTES das duas migrações novas: a 20261027000006 aplicada (o arquivo REAL), e as duas funções como a
-- 20261027000003 as criou (o texto REAL do arquivo, cortado por awk no run.sh e posto em /tmp pelo run.sh).
-- Os dados: uma etapa vazia (0, como em produção), três motores e o log vazio.
insert into public.orcamentista_motor (id, familia, fornecedor_id, arquivo_nome, arquivo_path, vigente) values
  ('c0000000-0000-0000-0000-000000000001', 'PVC', null, 'motor-pvc-da-familia.xlsx', 'p/m1', false),
  ('c0000000-0000-0000-0000-000000000002', 'ALUMINIO', null, 'motor-aluminio.xlsx', 'a/m1', false);
insert into public.orcamentista_motor (id, familia, fornecedor_id, arquivo_nome, arquivo_path, vigente, arquivado_em) values
  ('c0000000-0000-0000-0000-000000000003', 'PVC', null, 'motor-pvc-velho.xlsx', 'p/m0', false, now());
-- A ESTRELA COMO ESTÁ EM PRODUÇÃO (medido em 27/10/2026): motor_path e motor_nome VAZIOS (comprimento 0), não nulos. A réplica de
-- `../motor-da-familia/05_estado_de_producao.sql` a tem com um motor preenchido; aqui ela vira o que o banco de verdade tem.
update public.orcamentista_tabela set motor_path = '', motor_nome = '' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
