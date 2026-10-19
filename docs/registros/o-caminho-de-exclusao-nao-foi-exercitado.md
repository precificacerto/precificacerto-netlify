# O caminho de exclusão não foi exercitado contra o banco real

Data: 19/10/2026 · Bloco 2B.2 (Atendimentos I.A. — catálogo de fornecedores)

## O fato medido

Depois do teste ponta a ponta no preview da Vercel — que escreve no banco de
PRODUÇÃO — a medição do banco deu:

    nicho: 12 · fornecedor: 1 · tabela: 1 · conta_tabela: 0
    objetos no bucket atendimentos-ia: 2
    n_tup_del em orcamentista_fornecedor: 0
    n_tup_del em orcamentista_tabela: 0

O caminho de CRIAÇÃO está provado contra o Supabase real: dois objetos no
Storage para uma tabela, e a linha nascendo somente depois que os dois
arquivos chegaram. Isso nenhum teste automatizado conseguia afirmar.

O caminho de EXCLUSÃO nunca rodou. Zero deletes nas duas tabelas.

## O que isso significa

Nunca foram exercitados contra o banco real:

- o FK ON DELETE RESTRICT de orcamentista_tabela -> orcamentista_fornecedor
  (impedir apagar fornecedor que ainda tem tabela);
- o FK ON DELETE RESTRICT de orcamentista_conta_tabela -> orcamentista_tabela
  (impedir apagar tabela em uso por uma conta);
- a limpeza dos objetos no Storage ao excluir uma tabela.

Os testes cobrem a intenção do código. Não cobrem o comportamento do banco.

## Pendência aberta

Permanecem em produção, como resto de teste: 1 fornecedor, 1 tabela e 2
objetos no bucket atendimentos-ia. Exercitar a exclusão pela tela removeria
os três e provaria o caminho no mesmo movimento — por decisão do PO em
19/10/2026, isso não foi feito agora.

## Classe

teste-que-nao-exercita — aplicada a mim mesmo, e por escolha consciente,
não por descuido.
