/**
 * AS MENSAGENS PADRÃO — o rodapé do cancelamento, e o `{codigo}` que não voltou.
 *
 * Comando do PO de 08/10/2026, quarta rodada, Parte 3.
 *
 * >>> POR QUE ESTE ARQUIVO EXISTE, SE É "SÓ UMA CONSTANTE" <<<
 *
 * Porque ela é lida pela rota pública `api/public/agenda/[token]/agendar.ts`, que manda a
 * mensagem de confirmação ao cliente por WhatsApp. Um texto que prometa o que o sistema não faz
 * sai do nosso lado e chega no telefone de alguém — e `{codigo}` já teve de ser RETIRADO dessa
 * mesma constante em 06/10 por esse motivo.
 *
 * O rodapé novo é a tensão invertida: a promessa foi ACRESCENTADA de propósito, com a dívida
 * anotada no arquivo. Estes casos existem para que a próxima mudança na constante não desfaça
 * nenhuma das duas decisões sem alguém perceber.
 */

import {
  MENSAGEM_ALTERACAO_PADRAO,
  MENSAGEM_CANCELAMENTO_PADRAO,
  MENSAGEM_CONFIRMACAO_PADRAO,
  VARIAVEIS_DAS_MENSAGENS,
} from '@/utils/mensagens-agendamento-padrao'

const RODAPE = 'Necessitando alteração/cancelamento acesse pelo mesmo link. '
  + 'Cancelamento próximo ao horário (menos de 2 horas antes) será mantido/cobrado.'

describe('o rodapé da CONFIRMAÇÃO', () => {
  it('a constante contém a frase do rodapé, literal', () => {
    expect(MENSAGEM_CONFIRMACAO_PADRAO).toContain(RODAPE)
  })

  it('ele está no FIM, depois de uma linha em branco', () => {
    // A posição é requisito: no meio, entre o serviço e a empresa, ele quebraria a leitura do
    // bloco de dados do agendamento, que é o que o cliente confere primeiro.
    expect(MENSAGEM_CONFIRMACAO_PADRAO.endsWith(RODAPE)).toBe(true)
    expect(MENSAGEM_CONFIRMACAO_PADRAO).toContain(`{empresa}\n\n${RODAPE}`)
  })

  it('NÃO contém `{codigo}` — ele saiu em 06/10 e não voltou', () => {
    // >>> A ASSERÇÃO QUE IMPEDE A VOLTA SILENCIOSA <<<
    // O rodapé fala de alterar e cancelar, que é exatamente o assunto do `{codigo}`. Quem
    // escrever a Fase 2B pode achar natural acrescentá-lo junto — e aí a confirmação voltaria a
    // mandar o cliente usar um código que a tela não aceita.
    expect(MENSAGEM_CONFIRMACAO_PADRAO).not.toContain('{codigo}')
  })

  it('as variáveis que ele JÁ usava continuam lá — o rodapé não comeu nada', () => {
    // Sem isto, "contém o rodapé" ficaria verde numa constante reescrita que perdesse o bloco
    // de dados do agendamento.
    for (const v of ['{cliente}', '{servico}', '{profissional}', '{data}', '{hora}', '{empresa}']) {
      expect(MENSAGEM_CONFIRMACAO_PADRAO).toContain(v)
    }
  })

  it('o rodapé NÃO entrou nas outras duas mensagens', () => {
    // Só a de confirmação muda. Nas de cancelamento e alteração a ação JÁ aconteceu — dizer
    // "necessitando cancelamento acesse pelo link" para quem acabou de cancelar é ruído.
    expect(MENSAGEM_CANCELAMENTO_PADRAO).not.toContain(RODAPE)
    expect(MENSAGEM_ALTERACAO_PADRAO).not.toContain(RODAPE)
  })

  it('`{codigo}` CONTINUA na lista de variáveis e na mensagem de ALTERAÇÃO', () => {
    // A decisão de 06/10 foi retirá-lo da CONFIRMAÇÃO, não do sistema. Afirmar só a ausência na
    // confirmação não distinguiria isso de alguém ter apagado a variável inteira.
    //
    // >>> A PRIMEIRA VERSÃO DESTE CASO AFIRMAVA "NAS OUTRAS DUAS", E FICOU VERMELHA <<<
    // Eu a escrevi a partir do COMENTÁRIO do arquivo, que dizia isso — e o comentário estava
    // errado: a de CANCELAMENTO não usa `{codigo}`, porque mandar um código de cancelamento
    // para quem acabou de cancelar não faz sentido. É `estado-relatado-vs-real.md` com o
    // comentário no lugar da fonte primária. O comentário foi corrigido no arquivo.
    expect(VARIAVEIS_DAS_MENSAGENS).toContain('{codigo}')
    expect(MENSAGEM_ALTERACAO_PADRAO).toContain('{codigo}')
    expect(MENSAGEM_CANCELAMENTO_PADRAO).not.toContain('{codigo}')
  })
})

describe('a DÍVIDA do rodapé está registrada no arquivo, não só nesta suíte', () => {
  const fonte = require('fs').readFileSync(
    require('path').resolve(__dirname, '../mensagens-agendamento-padrao.ts'), 'utf8',
  ) as string

  it('a frase que o PO exigiu está no arquivo, literal', () => {
    // `registro-de-classe.md`: corpo de PR mergeado fica soterrado. A nota tem de morar no
    // arquivo que alguém abre para mexer na constante.
    expect(fonte).toContain(
      'Este rodapé promete alteração e cancelamento pelo link, que a Fase 2B ainda não entregou.',
    )
    expect(fonte).toContain('Nenhuma tenant tem o link ligado — confirmar antes de ligar o primeiro.')
  })

  it('e o registro de que as 2 horas NÃO são regra de código', () => {
    // Sem esta nota, quem implementar o cancelamento vai procurar a trava das 2 horas — e, não
    // achando, pode concluir que ela se perdeu e "restaurá-la". Ela nunca existiu.
    expect(fonte).toContain('POLÍTICA COMERCIAL, NÃO REGRA DE CÓDIGO')
  })

  it('NENHUMA trava de 2 horas foi implementada — medido no repositório', () => {
    // >>> A ASSERÇÃO QUE MEDE A AUSÊNCIA PEDIDA <<<
    // O PO proibiu implementar a trava. Afirmar a nota no comentário não afirma que ninguém a
    // escreveu; esta linha varre os arquivos onde ela cairia.
    const fs = require('fs')
    const path = require('path')
    const raiz = path.resolve(__dirname, '../..')
    const alvos = [
      path.join(raiz, 'utils/horarios-disponiveis.ts'),
      path.join(raiz, 'lib/agendamento-publico.ts'),
      path.join(raiz, 'pages/api/public/agenda/[token]/agendar.ts'),
    ]
    // >>> O PADRÃO FOI ESTREITADO DEPOIS DE UM FALSO POSITIVO MEDIDO <<<
    //
    // A primeira versão procurava `\b120\b` e ficou vermelha em `agendar.ts:66`, que tem
    // `textoCurto(body.nome, 120)` — um limite de caracteres do nome, sem relação com horas.
    // É `instrumento-que-nao-enxerga.md` pelo lado invertido: lá o padrão perdia casos, aqui
    // ele achava o que não procurava. A conclusão é a mesma — o número só vale depois de
    // confrontar o instrumento com o repositório de verdade.
    //
    // As formas em que uma janela de 2 horas apareceria, e nenhuma delas é um `120` solto:
    const FORMAS_DA_TRAVA = [
      /2\s*\*\s*60\s*\*\s*60/,      // 2 * 60 * 60
      /120\s*\*\s*60/,               // 120 * 60
      /\b7200\b|7200000|7_200_000/,  // segundos ou ms
      /subtract\(\s*2\s*,\s*['"]hour/, // dayjs
      /hours?\s*:\s*2\b/,            // { hours: 2 }
      /CANCELAMENTO|JANELA_DE_CANCEL/i,
    ]
    for (const a of alvos) {
      const txt = fs.readFileSync(a, 'utf8') as string
      const programa = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      for (const forma of FORMAS_DA_TRAVA) {
        expect(programa).not.toMatch(forma)
      }
    }
  })
})
