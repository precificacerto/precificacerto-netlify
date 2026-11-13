# Os 68 perfis do motor da Wolf, por caminho da resolução — medição 5.3 (12/11/2026)

> Medido para o comando único, item 5.3. Só leitura de produção; nada gravado. O código é o desta branch
> (`resolucao-de-referencia.ts`, a escada ponte → exato → código + cor → nome técnico, com o guarda).

## O método

- **Os 68:** os perfis distintos da aba Perfis do motor `022fc55e-ad55-4e2d-87b4-6dd7e4b29351` (`orcamentista_motor_perfil.perfil`), com a descrição que o motor dá (a menor, por perfil).
- **A cor pedida:** BRANCO, a da De Paula. As cores da Wolf: as 15 do grupo PERFIS DE PVC que a migração 20261112000006 grava.
- **A ponte:** as regras do motor para o par (perfil, BRANCO), ou a cor vazia quando é a única variante. Cor vazia AO LADO de outras cores não é ponte (regra de 08/11): 1318, 1379, 1874 e 9125 entram sem ponte. Dois códigos para o par: `PONTE_AMBIGUA`.
- **Os itens:** os das tabelas da Wolf na família PVC ou sem família, recortados ao que algum degrau alcança (os códigos da ponte, o código do perfil com e sem o sufixo, o código + o dígito da cor, e as descrições que citam o nome técnico), mais as variantes coloridas dos perfis que caem no nome técnico. **Limite:** o recorte foi montado à mão a partir da leitura (520 linhas); um item fora dele que algum degrau alcançasse mudaria o resultado de um perfil. O script e o recorte estão no scratchpad da sessão, não no repositório (dado de cliente).

## O resultado

| caminho | perfis |
|---|---:|
| ponte | 50 |
| exato | 4 |
| cor | 4 |
| nome_tecnico | 5 |
| falta | 5 |
| **total** | **68** |

### ponte (50)

| perfil | resultado |
|---|---|
| `1023/WOLFF` | `ponte:1023` |
| `1317/WOLFF` | `ponte:13171` |
| `1756/WOLFF` | `ponte:17561` |
| `1757/WOLFF` | `ponte:17571` |
| `2202/WOLFF` | `ponte:2202` |
| `2575/WOLFF` | `ponte:25751` |
| `3485/WOLFF` | `ponte:34851` |
| `4661/WOLFF` | `ponte:4661` |
| `5456/WOLFF` | `ponte:54561` |
| `8357/WOLFF` | `ponte:83571` |
| `8427/WOLFF` | `ponte:8427` |
| `8428/WOLFF` | `ponte:8428` |
| `8429/WOLFF` | `ponte:8429` |
| `8431/WOLFF` | `ponte:8431` |
| `8432/WOLFF` | `ponte:8432` |
| `8433/WOLFF` | `ponte:8433` |
| `8434/WOLFF` | `ponte:8434` |
| `8523/WOLFF` | `ponte:8523` |
| `8645/WOLFF` | `ponte:86451` |
| `8833/WOLFF` | `ponte:8833` |
| `8834/WOLFF` | `ponte:8834` |
| `BR60/WOLFF` | `ponte:9471` |
| `BR88/WOLFF` | `ponte:84651` |
| `BY60/WOLFF` | `ponte:22321` |
| `BZ0006/WOLFF` | `ponte:10501` |
| `BZ0010/WOLFF` | `ponte:10511` |
| `BZ0012/WOLFF` | `ponte:10491` |
| `BZ5563/WOLFF` | `ponte:10261` |
| `CA6/WOLFF` | `ponte:21861` |
| `FR73N/WOLFF` | `ponte:9481` |
| `GB19/WOLFF` | `ponte:9581` |
| `GB25/WOLFF` | `ponte:9801` |
| `GB31/WOLFF` | `ponte:9561` |
| `GB34/WOLFF` | `ponte:9551` |
| `GB8/WOLFF` | `ponte:9831` |
| `HF112/WOLFF` | `ponte:72741` |
| `HF88/WOLFF` | `ponte:9641` |
| `IL36/WOLFF` | `ponte:9711` |
| `IL42/WOLFF` | `ponte:IL421` |
| `IL50/WOLFF` | `ponte:9701` |
| `JT61/WOLFF` | `ponte:9491` |
| `KT16/WOLFF` | `ponte:9541` |
| `KT42/WOLFF` | `ponte:KT421` |
| `MF52/WOLFF` | `ponte:13091` |
| `SE76N/WOLFF` | `ponte:9501` |
| `SF106/WOLFF` | `ponte:9521` |
| `SF66/WOLFF` | `ponte:9681` |
| `SF78C/WOLFF` | `ponte:9531` |
| `SF92/WOLFF` | `ponte:9691` |
| `SP66/WOLFF` | `ponte:9731` |

### exato (4)

| perfil | resultado |
|---|---|
| `1317.1/WOLFF` | `exato:1317.1` |
| `1318.1/WOLFF` | `exato:1318.1` |
| `2681.1/WOLFF` | `exato:2681.1` |
| `2681/WOLFF` | `exato:2681` |

### cor (4)

| perfil | resultado |
|---|---|
| `1318/WOLFF` | `cor:13181` |
| `1379/WOLFF` | `cor:13791` |
| `1874/WOLFF` | `cor:18741` |
| `9125/WOLFF` | `cor:91251` |

### nome_tecnico (5)

| perfil | resultado |
|---|---|
| `BZ1770/WOLFF` | `nome_tecnico:90531` |
| `BZ20010/WOLFF` | `nome_tecnico:10241` |
| `BZ3016/WOLFF` | `nome_tecnico:10251` |
| `FR106/WOLFF` | `nome_tecnico:9511` |
| `GM42N/WOLFF` | `nome_tecnico:9721` |

### falta (5)

| perfil | resultado |
|---|---|
| `1352/WOLFF` | `falta:SEM_VALOR (1352, achado por exato)` |
| `8331/WOLFF` | `falta:NAO_ACHADA` |
| `BZ4556/WOLFF` | `falta:PONTE_AMBIGUA (1027.1, 10271)` |
| `PP150N/WOLFF` | `falta:NAO_ACHADA` |
| `ZS30/WOLFF` | `falta:NAO_ACHADA` |

## O que a medição achou, e mudou o código antes do commit

1. **O reforço no lugar da folha.** Com a cor pedida que não existe para o SF92 (Roxo, no caso Gerson Boss), o nome técnico recusava a folha `9691 SF92 - FOLHA DE PORTA - BRANCO` pela cor e aceitava o `8427 REFORÇO FOLHA SF92 AÇO GALVANIZADO`, que passa no guarda pela palavra FOLHA. Corrigido: havendo descrição que COMEÇA com o nome técnico, só elas contam.
2. **A cor escrita de outro jeito.** As descrições da Wolf escrevem `LAMINADO GOLDEN OAK`, `LAMINADO NOGUEIRA`, `LAMINADO OAK`, `PRETO ALUMÍNIO`; a tabela de cores diz `AMADEIRADO GOLDEN OAK`, `AMADEIRADO NOGUEIRA`. Pela frase inteira, essas variantes passavam por "sem cor" e serviriam a um pedido BRANCO. Corrigido: a cor é lida pela PALAVRA (as palavras dos nomes da tabela, menos EXTERNO e AMADEIRADO, que também são palavra de peça).
3. **A cor pedida vence a ausência de cor.** No nome técnico, a descrição que nomeia a cor pedida vence a que não nomeia cor nenhuma (BZ1770 em PRETO TEXTURADO: `905320`, não o `90531`).

## Decidido pelo dono do produto (12/11/2026, à noite)

**ACEITO:** BZ1770 → `90531`, GM42N → `9721`, FR106 → `9511`, BZ3016 → `10251`. O CÓDIGO carrega a cor (9053 + 1, 972 + 1, 951 + 1, 1025 + 1, e 1 é
BRANCO na tabela de cores da Wolf). A hierarquia — sufixo do código na tabela de cores, senão a palavra de cor da descrição, senão recusa — está em
`docs/regras/cor-afirmada-pelo-codigo.md`, e supera neste ponto a regra de 25/10. Refeita a medição com ela: os mesmos números (50 · 4 · 4 · 5 · 5).

- **1317.1, 1318.1, 2681 e 2681.1** saem pelo exato com descrição sem cor: o exato acha o código que o motor deu, e a hierarquia da cor é do nome técnico.
