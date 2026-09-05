# Teste Que Não Exercita a Correção

> **Esta regra é independente da correção que a originou.** Nasceu no PR que unificou o motor
> do gravador porque foi ali que a terceira variante apareceu, mas não depende dele.

## O critério

Formulação do dono do produto, registrada como está:

> Afirmar que a prop chega **NÃO É** afirmar que ela muda alguma coisa.

Um teste verde não prova que a correção funciona. Ele prova que **aquele caso** passou. Quando
o caso escolhido não distingue o estado corrigido do estado defeituoso, o verde é decorativo:
ele existiria igual sem a correção.

O critério operacional é um só, e é o que todo caso deste repositório tem de satisfazer:
**cada asserção precisa FALHAR sem a sua correção.**

## Por que a distinção é difícil de ver

Porque o teste **parece** exercitar. Ele nomeia o campo certo, chama a função certa, e o verde
chega. A falha não está no que ele afirma — está no que ele **deixa de poder distinguir**, e
isso não aparece na leitura do caso: aparece só quando se pergunta "e se eu desfizer a
correção, este caso quebra?".

E quem escreve o teste é quem acabou de escrever a correção. É a pessoa com menos condições de
ver que o caso escolhido não discrimina, porque para ela os dois estados não são simétricos —
um deles ela acabou de apagar.

## As três variantes

Todas com a mesma assinatura: verde antes, verde depois.

| # | Variante | Onde apareceu | O que a tornava inócua |
|---|---|---|---|
| 1 | **O caso que passa antes e depois** | #50 — a tela do pedido | Uma asserção sobre comportamento que a correção não alterou. Registrada no cabeçalho do próprio arquivo: *"Um caso que passasse antes e depois não estaria exercitando nada."* |
| 2 | **O caso escolhido não discrimina** | #48 — cobertura do gravador | Se o item tem a MESMA alíquota do tenant, congelar a do item ou a do tenant dá o mesmo número. E o `imp_total: 0` do ORC-0689: **MEI não tem alíquota de tenant**, então não sobra nada para congelar e o caso passa verde sem exercitar. Evitada por construção — todo caso usa item e tenant com valores DIFERENTES |
| 3 | **A asserção afirma PASSAGEM, não EFEITO** | #50 — `'as três props da Memória Cascata chegam ao bloco'` | As props chegavam mesmo. Duas das três eram **inertes**: `applyTotalACobrarToStep11` procura um `step 11` com filho "Restante distribuível", que só a Camada 2 do V17 cria, e o gravador produzia 13 etapas. O teste afirmava o que ele podia ver — e o que podia ver não era o efeito |

### De quem são

**As três são do assistente.** Está escrito assim porque suavizar apagaria o mecanismo: quem
escreveu a correção escreveu o teste, e o mesmo ponto cego produziu os três. A variante 3 foi
apontada pelo dono do produto ao ler o levantamento; as variantes 1 e 2 foram nomeadas nos
próprios arquivos de teste, no PR em que nasceram — e é justamente por terem ficado só ali que
a terceira aconteceu.

### Nota da busca por precedentes

A busca foi feita conforme `registro-de-classe.md`. Ela encontrou as variantes 1 e 2 já
**nomeadas em cabeçalhos de arquivo de teste** — o critério existia e era praticado, mas nunca
tinha sido versionado como regra. É o mesmo diagnóstico de `decisao-sob-regra-da-epoca.md`:
conhecimento certo, guardado no lugar em que não se lê. Esta página o tira de lá.

Nenhuma quarta variante foi forçada.

## O corolário aplicável ANTES do defeito existir

**Antes de escrever a asserção, pergunte o que ela distingue.** Se a resposta for "que o código
foi chamado", ela não é uma asserção sobre comportamento.

Três perguntas, na ordem em que custam menos:

1. **Se eu desfizer a correção, este caso fica vermelho?** Se não, ele não é o teste dela.
2. **O caso usa valores que DISTINGUEM os dois estados?** Alíquota do item igual à do tenant,
   regime sem imposto, desconto zero num teste de desconto — todos passam verde sem exercitar.
   Escolha valores que divergem, e afirme qual dos dois saiu.
3. **A asserção olha o EFEITO ou o caminho?** "A prop está no arquivo", "a função foi
   importada", "o campo chega ao componente" são asserções sobre o caminho. O efeito é o
   número que muda, a linha que aparece, a etapa que passa a existir.

Quando a pergunta 3 não tem resposta boa porque a função não é exportada, **exporte a função**.
Foi o que se fez com `applyTotalACobrarToStep11`: o custo é uma linha, e o que se compra é
poder afirmar efeito em vez de passagem.

### O caso limite honesto

Nem toda asserção estrutural é ruim. `'o ternário está nos DOIS pontos — cartão mobile e tabela
desktop'` afirma caminho e vale a pena, porque **o defeito era exatamente a ausência num dos
dois** e não há efeito numérico a medir. A regra não proíbe afirmar caminho; proíbe afirmar
caminho **quando existe efeito mensurável e ele foi deixado de fora**.

## Relação com as outras regras

`hipotese-derrubada-pela-propria-medicao.md` é a vizinha mais próxima e o espelho desta: lá a
razão para NÃO testar um caso é uma suposição de quem a formula; aqui o caso é testado e a
suposição está em achar que ele mede alguma coisa. `registro-de-classe.md` decidiu a forma
desta página. `baseline-measurement.md` trata do mesmo erro no outro instrumento — a medição
que parece rigorosa e compara a coisa errada.
