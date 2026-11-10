"""A mutação que não se aplica falha ALTO — `docs/regras/mutacao-que-nao-se-aplica.md` (dono do produto, 10/11/2026).

Toda bateria de mutação chama `exigir_trecho_unico` ANTES de rodar qualquer suíte, com TODAS as suas mutações — inclusive quando
quem a chamou pediu só algumas: uma rodada parcial que não confere as outras é como 15 mutações da `levantamento-na-conversa` ficaram
dias sem se aplicar. Um trecho que aparece zero vezes, ou duas ou mais, no texto alvo aborta a bateria inteira com o código 3 e a lista
de todas as que não se aplicam. Nunca vira "morta", nunca vira "sobrevivente", nunca é pulada.

    mutacoes: [(ident, [(alvo, texto, de, para), ...]), ...]

As trocas de uma mesma mutação sobre o mesmo alvo se ENCADEIAM, como na bateria: a segunda é procurada no texto já trocado pela
primeira. Uma mutação sem trocas é o controle (nada muda) e não tem o que conferir. Uma troca cujo `de` é uma FUNÇÃO (texto -> texto)
se aplica quando muda o texto; a que devolve o texto igual não exercitaria o que promete, e conta como falta (zero ocorrências).
"""
import sys

CODIGO_DE_SAIDA = 3
MARCA = 'MUTAÇÃO QUE NÃO SE APLICA'


def faltas_do_trecho_unico(mutacoes):
    faltas = []
    for ident, trocas in mutacoes:
        atual = {}
        for alvo, texto, de, para in trocas:
            t = atual.get(alvo, texto)
            if callable(de):
                try:
                    novo = de(t)
                except SystemExit as e:  # a própria troca recusou o trecho (ex.: a neutraliza, que exige as duas listas)
                    faltas.append((ident, alvo, 0, f'a transformação recusou: {e}'))
                    break
                if novo == t:
                    faltas.append((ident, alvo, 0, f'a transformação {de.__name__} não mudou nada'))
                    break
                atual[alvo] = novo
                continue
            n = t.count(de)
            if n != 1:
                faltas.append((ident, alvo, n, de))
                break
            atual[alvo] = t.replace(de, para)
    return faltas


def exigir_trecho_unico(mutacoes):
    mutacoes = list(mutacoes)
    faltas = faltas_do_trecho_unico(mutacoes)
    if faltas:
        print(f'{MARCA}: {len(faltas)} de {len(mutacoes)} — a bateria NÃO roda, e nenhum placar dela vale até o trecho ser revisto:',
              flush=True)
        for ident, alvo, n, de in faltas:
            print(f'  {ident}: o trecho aparece {n} vez(es) em {alvo}: {de[:90]!r}', flush=True)
        sys.exit(CODIGO_DE_SAIDA)
    return len(mutacoes)
