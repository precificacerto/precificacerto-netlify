# O Instrumento Que Se Enxerga

> **Esta regra é independente da rodada que a originou.** Nasceu em 24/10/2026, ao esperar a
> bateria de mutações da tela dos três níveis (#137), porque foi ali que o laço de espera nunca
> terminou. Ela **não depende daquela bateria**: vale para toda busca que examina um conjunto em
> que o próprio instrumento está, seja `pgrep`, `ps | grep`, varredura de arquivos ou log.

## O critério

Formulação do dono do produto, registrada como está:

> O `pgrep -f mut-tela5.py` casava com a PRÓPRIA linha de comando do laço de espera, porque o
> nome procurado estava nela. O laço nunca terminaria, e nada no sintoma dizia isso — o processo
> só parecia lento. É parente do `instrumento-que-nao-enxerga`, mas o mecanismo é outro: **o
> instrumento se enxerga e se confunde com o que mede.**

**Quando o instrumento faz parte do conjunto que ele examina, e carrega consigo o padrão que
procura, ele sempre se encontra.** O resultado deixa de depender do mundo: a resposta é "achei"
com o alvo presente e "achei" com o alvo ausente.

### O discriminante contra `instrumento-que-nao-enxerga.md`

As duas produzem um número que não mede, e falham em sentidos opostos:

| | o instrumento que NÃO enxerga | o instrumento que SE enxerga |
|---|---|---|
| o defeito | o padrão é mais estreito que o alvo | o conjunto examinado contém o próprio instrumento |
| o que ele erra | **deixa de ver** casos que existem (falso negativo) | **vê** um caso que não existe (falso positivo) |
| o sintoma típico | uma contagem baixa e plausível — "são 3" | um "ainda está rodando" que nunca muda |
| onde procurar | no padrão: ele exige forma que o alvo não tem? | no conjunto: o instrumento está dentro dele? |
| o remédio | fixture com o caso que **deveria aparecer** | fixture com o alvo **ausente**, e a resposta tem de mudar |

A fixture de cada uma é o espelho da outra, e é por isso que esta página existe separada.
Fazer só a de lá ("o alvo presente aparece?") passa verde aqui: o alvo presente aparece sempre,
inclusive quando não está.

## Por que a distinção é difícil de ver

Porque, na maior parte do tempo, **o instrumento está certo por coincidência**. Enquanto o alvo
existe, "achei" é a resposta verdadeira, e o instrumento que se acha produz exatamente a mesma
saída que o instrumento correto. A diferença só aparece no instante em que o alvo deixa de
existir. Esse é justamente o instante que a espera queria detectar, e nele o instrumento continua
dizendo "achei".

E o sintoma não tem cara de defeito. Um laço que espera algo terminar e não termina parece
**lento**, não errado. A bateria era mesmo lenta (cerca de 30 s por mutação), e lentidão era a
leitura mais plausível. Nada no laço avisava que a condição de saída tinha ficado impossível.

Quem escreve o padrão é quem acabou de digitar o nome do alvo no mesmo comando. O nome está na
cabeça e na linha ao mesmo tempo, e é por isso mesmo que ele aparece duas vezes.

## As aparições

Todas são do mesmo instrumento, na mesma hora, em 23 e 24/10/2026, na espera da bateria
M1–M50 do #137. **As três são do assistente.**

| # | o comando | o que ele respondia | o que ele podia responder |
|---|---|---|---|
| 1 | `pgrep -af mut-tela5 \|\| echo "bateria não está rodando"` | listou três processos: o `python3` da bateria, o shell dela **e o próprio comando de checagem** (PID 1938, visível na saída) | nunca "não está rodando" |
| 2 | `pgrep -f mut-tela5.py >/dev/null && echo RODANDO \|\| echo TERMINOU`, para responder à pergunta do dono do produto **"a bateria terminou?"** | RODANDO | **nunca TERMINOU**. Medido em 24/10, horas depois de a bateria acabar: RODANDO |
| 3 | `until ! pgrep -f mut-tela5.py >/dev/null; do sleep 5; done` | o laço de espera | **nunca terminaria.** Saiu porque o ambiente o matou por tempo, 30 minutos depois de a bateria já ter acabado |

**As aparições 1 e 2 estavam certas por coincidência.** A bateria estava de fato rodando quando
elas foram executadas. O que sustentou a resposta foram dois sinais independentes do `pgrep`: o
`.bak` no `git status` e a contagem de linhas de resultado subindo (35 de 50). **O instrumento
em si não podia ter dito outra coisa.** A resposta "ainda não terminou" dada ao dono do produto
era verdadeira, mas o `pgrep` que a acompanhava não a provava.

A 3 é a que custou: um laço sem condição de saída alcançável, que não falhou, só não acabou. E
ele acabou não por ter terminado, mas por ter sido morto. Com isso, o encerramento chegou como
"stopped after reaching its background time limit", que é indistinguível de "a bateria ainda
roda" para quem lê só a notificação.

### A medição que corrigiu o remédio

O remédio proposto foi `pgrep -f -- "[m]ut-tela5"`: o colchete faz o padrão não casar com o
próprio texto do padrão. Medido em 24/10/2026, sem processo da bateria nenhum:

| instrumento | sem o alvo | sem o alvo, **com o nome em outro ponto do comando** (um caminho de log `…/mut-tela5.txt`) | com o alvo (fixture `exec -a`) |
|---|---|---|---|
| `pgrep -f mut-tela5.py` | **RODANDO (falso)** | **RODANDO (falso)** | RODANDO |
| `pgrep -f -- "[m]ut-tela5"` | TERMINOU (certo) | **RODANDO (falso)** | RODANDO |
| `pgrep -x -f -- "python3 [^ ]*mut-tela5\.py.*"` | TERMINOU (certo) | TERMINOU (certo) | RODANDO |

**O colchete protege a ocorrência do padrão, e só ela.** O `pgrep -f` examina a linha de comando
inteira do shell que o roda. Se o mesmo comando menciona o nome em qualquer outro lugar (o log
da bateria, um `echo`, um segundo `pgrep`), o instrumento volta a se achar. Foi exatamente o que
aconteceu na primeira medição do remédio: ele dividia o comando com o `pgrep` ingênuo, e disse
RODANDO sem processo nenhum.

Esta correção é do assistente, feita pela própria medição ao registrar a página.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, em 24/10/2026, sobre os instrumentos do repositório que
examinam um conjunto em que podem estar.

**Nenhuma aparição fora destas três.** Achados, e por que não entram:

| onde | o que faz | por que não é aparição |
|---|---|---|
| `scripts/check-no-legacy-discount-modes.js` | procura `PROFIT_REDUCTION`/`SELLER_REDUCTION` no código | **põe a si mesmo na whitelist** ("este próprio arquivo"). É o remédio já praticado |
| `uma-fonte-de-rotulos-de-modulo.test.ts` | procura quem importa `navigationItems` | tira `__tests__` da varredura: *"este arquivo cita o nome para poder proibi-lo, e incluí-lo faria o portão acusar a si mesmo"* |
| `atendimentos-ia-vocabulario.test.ts` | procura a palavra proibida na área | exclui `ESTE_ARQUIVO`, e **afirma** a exclusão num caso próprio |
| `entrada-de-imposto.test.ts` | procura quem importa `baseDoTributo` | não desce em `__tests__` |

As exclusões nasceram junto com os testes (`7181db1`, `54768cb`): foram preventivas, não
correções depois de um incidente. **O remédio já era praticado em quatro lugares e não estava
escrito em nenhum lugar onde se lê**, o mesmo diagnóstico de `assercao-negativa-que-nunca-falha.md`.
Nos quatro, o conjunto é de **arquivos**. As três aparições são de **processos**, onde o conjunto
inclui o shell que faz a pergunta, e a exclusão não pode ser escrita como "pule este arquivo".

As três aparições são da mesma campanha e do mesmo instrumento. A tabela fica em três; nenhuma
quarta foi forçada.

## O remédio

**1. Não pergunte pelo nome quando dá para perguntar pela identidade.** Quem inicia o processo
tem o PID (`$!`) e pode esperar por ele: `wait $PID`, ou `kill -0 $PID` num laço. Se o processo
foi iniciado por uma ferramenta que avisa quando ele termina, como a notificação de tarefa em
segundo plano do Claude Code, **o aviso é o instrumento**, e o laço de espera não precisa existir.
Na aparição 3, o aviso existia e chegou: o laço era redundante.

**2. Se for pelo nome, o padrão não pode aparecer em lugar nenhum da linha de comando que o
roda.** Não basta que o padrão não case consigo mesmo: o colchete falha na segunda menção,
medido acima. O que funcionou foi **ancorar a linha inteira** com `pgrep -x -f`, descrevendo o
comando do alvo do começo ao fim (`python3 [^ ]*mut-tela5\.py.*`). A linha do shell que pergunta
começa com outra coisa e não pode casar.

**3. Todo laço de espera tem prazo máximo, e falha alto quando o prazo vence.**

```bash
for i in $(seq 1 120); do                      # 120 × 5 s = 10 min
  pgrep -x -f -- "python3 [^ ]*mut-tela5\.py.*" >/dev/null || { echo terminou; exit 0; }
  sleep 5
done
echo "FALHOU: a bateria não terminou em 10 min — conferir à mão" >&2; exit 1
```

O prazo não conserta o instrumento, mas transforma "esperar para sempre" em "falhar com uma
frase". Sem ele, o único prazo é o do ambiente, e o fim por prazo do ambiente chega com a mesma
cara de "ainda rodando".

**4. Antes de usar, a fixture do alvo AUSENTE.** Rode o instrumento num momento em que o alvo
sabidamente não existe. Se ele disser "achei", ele se enxerga. É a fixture que
`instrumento-que-nao-enxerga.md` não pede, porque lá o erro é do outro lado.

## O corolário aplicável ANTES do defeito existir

**Antes de confiar num "ainda está lá", pergunte se o instrumento pode dizer "não está mais".**

Sinais, em ordem de força:

1. O instrumento examina um conjunto **em que ele mesmo entra**: a lista de processos (que
   inclui o shell que pergunta), a árvore de arquivos (que inclui o teste que varre), um log
   (que inclui a linha que registra a busca).
2. O padrão procurado está **escrito no próprio instrumento**: o nome do processo no comando,
   a palavra proibida no teste que a proíbe.
3. A resposta esperada é **negativa**: "terminou", "não existe mais", "ninguém usa".
4. Nenhuma fixture com o alvo ausente foi rodada.

Quando o 1 e o 2 coincidem, a resposta negativa é inalcançável até prova em contrário. Quando o
3 também vale, o instrumento não mede nada: ele só repete "achei".

## As ressalvas de método — o que a medição NÃO diz

- **Não mede quantas vezes isso aconteceu antes.** A amostra é de uma campanha. Um `pgrep` que
  se acha quase sempre dá a resposta certa (o alvo costuma estar lá), e por isso a classe é
  sub-registrada por construção.
- **Não diz que `pgrep -x -f` é seguro em geral.** Ele funcionou aqui porque o comando do alvo
  tem uma forma conhecida (`python3 caminho/mut-tela5.py`). Um alvo com linha de comando variável
  pede o remédio 1, não um padrão mais esperto.
- **Não diz que as respostas 1 e 2 estavam erradas.** Estavam certas, por coincidência. O
  registro é sobre o instrumento não poder estar errado, não sobre ele ter estado.

## Relação com as outras regras

`instrumento-que-nao-enxerga.md` é a vizinha e o espelho: lá o padrão é estreito demais e a
contagem sai baixa; aqui o conjunto contém o instrumento e a resposta sai sempre positiva. O
discriminante está na tabela do topo.
`assercao-negativa-que-nunca-falha.md` é a mesma família do lado das asserções: lá a negativa é
verde por construção porque o literal é inalcançável; aqui a negativa ("não está mais rodando")
é inalcançável porque o instrumento é o próprio caso positivo.
`portao-que-nao-alcanca.md`, pergunta 4 (*o número pode mudar no caso que eu quero detectar?*),
é a pergunta que esta página responde para um instrumento de espera.
`registro-de-classe.md` decidiu a forma e o limite que manteve a tabela em três linhas.
