/**
 * O ARQUIVO QUE NÃO CHEGOU (dono do produto, 13/11/2026): "Pergunta é texto; resultado é ARQUIVO." Depois do "sim", o que vai ao vendedor é o
 * arquivo do orçamento. Quando ele NÃO chega a quem disse "sim", o corpo da mensagem NÃO vira o plano B contando o resultado (itens,
 * medidas, barras, aproveitamento, mão de obra, preço, o que o preço cobre): ele diz que o arquivo não chegou, e por quê — a falta nomeada,
 * e nada mais. Função pura: a conversa, a travessia e a etapa do preço a usam.
 */
export type OrcamentoNaFrase = { numero: number; nome: string }

export const fraseDoArquivoQueNaoChegou = (orcamento: OrcamentoNaFrase | null, motivo: string) =>
    `O arquivo do orçamento${orcamento ? ` ${orcamento.numero} (${orcamento.nome})` : ''} não chegou a você: ${motivo.replace(/\.$/, '')}.`
