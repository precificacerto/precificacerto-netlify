
PRECIFICA
Relatório de Melhorias e Insights do Sistema
Reunião: Felipe Klein & Matheus Torquato
Data: 17 de março de 2026
Pauta: Revisão do sistema, precificação por tipo de negócio, fluxo de caixa e tributação

Resumo Executivo
Esta reunião teve como objetivo revisar o estado atual do sistema Precifica, identificar inconsistências na lógica de precificação, alinhar a arquitetura para diferentes tipos de negócio e definir as prioridades de desenvolvimento para as próximas entregas.
Os três grandes temas abordados foram: (1) a separação da lógica de precificação para prestação de serviço vs. venda de produto, (2) melhorias no módulo de fluxo de caixa com foco em usabilidade e categorização, e (3) a estratégia de evolução da tributação, começando pelo Simples Nacional e MEI.

DECISÃO	Focar primeiro no Simples Nacional e MEI. Implantar com usuários reais (esposa do Felipe e namorada do Matheus) para coleta de feedback antes de avançar para Lucro Real e Presumido.

BUG	Ao trocar o CNPJ/regime tributário, a configuração de Lucro Real não estava carregando corretamente na tela de precificação. Verificar se o save do regime está sendo persistido antes de renderizar os campos.

1. Precificação — Separação por Tipo de Negócio
Este é o ponto mais estrutural da reunião. A lógica de precificação precisa se comportar de forma completamente diferente dependendo do tipo de atividade escolhida pelo usuário no onboarding: prestação de serviço, industrialização ou revenda.
1.1 Prestação de Serviço — Custo por Minuto Produtivo
Para negócios de prestação de serviço (salões, clínicas, mecânicas), toda a despesa fixa e mão de obra são diluídas no custo por minuto do serviço. A fórmula é:
Valor por Minuto = (Mão de Obra Total + Despesas Fixas) ÷ (Horas Trabalhadas × Nº de Produtivos × 60)

O sistema precisa:
•	Detectar o tipo de atividade (prestação de serviço) e bloquear despesa fixa e mão de obra administrativa da tela de produto
•	Exibir o valor por minuto calculado como referência no topo da precificação de serviços
•	Conectar o quadro de funcionários do onboarding ao cálculo do minuto produtivo

1.2 Produto Avulso Dentro do Salão — Sem Despesa Fixa
Produtos vendidos avulso dentro de um negócio de serviço (ex: shampoo, condicionador, peças mecânicas) são receita extra. A despesa fixa e mão de obra já foram absorvidas pelo serviço, portanto NÃO devem entrar na precificação desses produtos.

EXEMPLO	Uma mecânica cobra pela mão de obra do serviço e vende a peça separado. O lucro sobre a peça é puro ganho extra — 20% sobre R$ 1.000 = R$ 200 limpos, sem rateio de custo fixo.

1.3 Suporte a Outros Tipos de Prestadores
A mesma lógica da espinha dorsal foi validada para clínicas odontológicas, mecânicas e qualquer outro prestador de serviço. O sistema já foi projetado para suportar isso — garantir que o fluxo seja genérico o suficiente para não ter acoplamento com o segmento de salão.

2. Onboarding — Configuração Inicial
O onboarding é o ponto de entrada do usuário e deve capturar as informações essenciais para que toda a lógica de precificação funcione corretamente desde o início.
2.1 Seleção de Tipo de Atividade
A primeira decisão do usuário define tudo que vem depois. O sistema deve apresentar de forma clara as opções:
Prestação de Serviço	Industrialização	Revenda
Salões, clínicas, mecânicas, escritórios	Produção e venda de produtos próprios	Compra e venda de mercadorias
Base: minuto produtivo	Base: custo de produção	Base: CMV + margem

2.2 Quadro de Funcionários Produtivos
Capturar no onboarding: número de cadeiras/postos de trabalho produtivos, horas trabalhadas por dia e dias úteis por mês. Esses dados são a entrada direta para o cálculo do valor por minuto. Já existe a tela — garantir que esteja conectada ao motor de precificação.

2.3 Prévia de Receita — Sem Contaminar o Caixa
Sugestão validada: inserir uma prévia dos dados de receita/pagamento no início do onboard para dar um panorama indicativo ao usuário. Esses dados NÃO devem alimentar o caixa real.

REGRA	O caixa é fidedigno — só entra o que realmente aconteceu. A prévia do onboarding fica em uma sessão separada de 'estimativa inicial' ou 'panorama de referência'.

3. Fluxo de Caixa — Melhorias de Usabilidade
O módulo de caixa já tem a estrutura correta. Os ajustes são de usabilidade e categorização, para que o usuário consiga tomar decisões rápidas a partir da visualização.
3.1 Visão Diária do Fluxo
O usuário precisa ver dia a dia quanto vai entrar e sair, não só o consolidado mensal. Com a visão diária, é possível identificar antecipadamente quando o saldo ficará negativo e agir: fazer um resgate no banco, acionar a equipe de vendas para fechar negócio, antecipar uma entrada.

3.2 Categorias Pré-definidas no Lançamento
Incluir as categorias padrão como opções no dropdown de categoria ao lançar uma despesa ou receita. O usuário ainda pode digitar livremente, mas ter as categorias padronizadas garante relatórios coerentes e auto-soma correta por grupo.

Despesas — Categorias Sugeridas	Receitas — Categorias Sugeridas
Mão de obra indireta (administrativa)	Receita de serviços prestados
Mão de obra produtiva (salários + encargos)	Venda de produtos (home care, avulso)
Comissões sobre vendas/serviços	Adiantamentos e entradas de clientes
Fretes e logística	Outras receitas operacionais
DRF / Impostos e tributos	
Despesas fixas operacionais	
Custos variáveis de insumos	

3.3 Comissão como Categoria Variável Separada
Comissão não deve ser agrupada em salários. Ela é uma despesa variável e precisa ter sua própria categoria para análise correta da DRE e separação na hora de precificar.

3.4 Fretes e Logística Isolados da Operação Geral
No Lucro Real, o valor de frete CIF tem tributação especial de ICMS. Se os fretes ficarem misturados no caixa geral, a alíquota será calculada sobre uma base errada. A categoria de logística/frete deve ser isolada para não interferir na contabilização tributária.

4. Cadastro de Produtos — Conversão de Unidade
4.1 Cadastro em Unidade com Uso em Fração
O sistema já suporta conversão de unidade de medida. O fluxo para salões precisa ser validado: a dono do salão cadastra o shampoo em mililitros (ex: 1000 ml = 1 frasco) e na ficha de serviço informa quantos ml usa por atendimento (ex: 30 ml). O sistema calcula automaticamente o custo do insumo por atendimento.

Cadastro do produto	Uso no serviço
Shampoo L'Oréal — 1000 ml (1 unidade)	Uso por atendimento: 30 ml
Custo unitário: R$ 48,00	Custo por atendimento: R$ 1,44

4.2 Linguagem para o Usuário Leigo
A interface deve usar linguagem acessível. Em vez de 'conversão de unidade de medida', usar perguntas como: 'Quanto você compra de uma vez?' e 'Quanto usa em cada serviço?'. A dono de salão não pensa em termos técnicos — a usabilidade precisa respeitar isso.

5. Tributação — Evolução por Regime
A arquitetura de tributação já diferencia os regimes. Os ajustes são de validação e de separação conceitual entre os impostos por dentro e por fora.
5.1 Regime Tributário Trava a Lógica
Quando o usuário muda o regime tributário (ou o CNPJ é carregado com um regime vinculado), toda a lógica de precificação, campos exibidos e alíquotas mudam juntas. Foi identificado um bug onde o Lucro Real não carregava ao trocar o CNPJ — verificar se o save está sendo persistido antes do render.

5.2 Impostos Por Dentro vs Por Fora
No Lucro Real, ICMS e PIS/COFINS têm cálculo por dentro (a base de cálculo inclui o próprio imposto). Os demais impostos são destacados por fora. O sistema trata essas duas situações de forma distinta na nota fiscal e na precificação — garantir que a distinção esteja documentada e testada para os diferentes regimes.

5.3 Roadmap de Tributação

Fase	Regime	Status
1	MEI e Simples Nacional	Prioridade imediata
2	Lucro Presumido	Próxima fase
3	Lucro Real	Fase futura

6. Resumo de Ações — O Que Fazer Agora

#	Ação	Prioridade	Módulo
1	Bloquear despesa fixa e mão de obra na precificação de produto para negócios de serviço	Alta	Precificação
2	Conectar quadro de funcionários do onboarding ao cálculo do minuto produtivo	Alta	Onboarding
3	Corrigir bug do regime tributário que não carrega ao trocar CNPJ	Alta	Tributação
4	Incluir categorias pré-definidas no dropdown de lançamento do caixa	Média	Caixa
5	Implementar visão diária no fluxo de caixa (além da mensal)	Média	Caixa
6	Separar comissão como categoria variável distinta de salários	Média	Caixa
7	Criar categoria isolada de fretes/logística no caixa	Média	Caixa
8	Validar fluxo de conversão de unidade de medida para salões (ml por atendimento)	Média	Cadastro
9	Criar sessão de prévia/estimativa no onboarding separada do caixa real	Baixa	Onboarding
10	Evoluir lógica para Lucro Presumido após validação do Simples Nacional	Baixa	Tributação

