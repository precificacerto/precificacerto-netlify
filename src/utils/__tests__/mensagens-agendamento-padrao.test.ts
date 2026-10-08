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

  it('`{codigo}` continua na lista de VARIÁVEIS, e em nenhuma das três mensagens', () => {
    // >>> ESTE CASO MUDOU DUAS VEZES, E AS DUAS ESTÃO REGISTRADAS <<<
    //
    // Primeira versão (08/10, manhã): afirmava `{codigo}` "nas outras DUAS mensagens". Ficou
    // vermelha — eu a escrevi a partir do COMENTÁRIO do arquivo, que estava errado: a de
    // CANCELAMENTO nunca o usou. `estado-relatado-vs-real.md` com o comentário no lugar da
    // fonte primária; o comentário foi corrigido, não o caso.
    //
    // Segunda (08/10, Fase 2B): a de ALTERAÇÃO perdeu a linha do `{codigo}`, porque o código
    // virou um segredo de acesso de 10 minutos e de uso único — e já queimado quando a
    // mensagem sai. Agora NENHUMA das três o cita.
    //
    // A variável FICA na lista: a decisão foi sobre as mensagens padrão, e a tenant que
    // escrever a própria pode querer usá-la.
    expect(VARIAVEIS_DAS_MENSAGENS).toContain('{codigo}')
    expect(MENSAGEM_ALTERACAO_PADRAO).not.toContain('{codigo}')
    expect(MENSAGEM_CANCELAMENTO_PADRAO).not.toContain('{codigo}')
    expect(MENSAGEM_CONFIRMACAO_PADRAO).not.toContain('{codigo}')
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
      // >>> ESTE PADRÃO FOI ESTREITADO DUAS VEZES, E A SEGUNDA FOI NESTA RODADA <<<
      // Ele era `/CANCELAMENTO|JANELA_DE_CANCEL/i` e passou a casar com `msg_cancelamento` —
      // NOME DE COLUNA — quando a Fase 2B acrescentou as duas mensagens ao contexto público.
      // Falso positivo, `instrumento-que-nao-enxerga.md` pelo lado invertido, e a segunda vez
      // que ESTE padrão precisou ser confrontado com o repositório. Agora ele nomeia só o que
      // uma JANELA de cancelamento se chamaria.
      /JANELA_DE_CANCEL|LIMITE_DE_CANCEL|HORAS_ANTES|MINUTOS_ANTES|prazoDeCancel/i,
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// FASE 2B — a linha do {codigo} saiu da ALTERAÇÃO, e o rodapé passou a ser verdade
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('Fase 2B — o `{codigo}` fora da mensagem de ALTERAÇÃO', () => {
  it('a de ALTERAÇÃO não cita mais `{codigo}`', () => {
    // >>> ELA ERA A ÚNICA QUE CITAVA, E A MEDIÇÃO CONFIRMOU ISSO <<<
    // O comentário do arquivo dizia "nas outras DUAS mensagens" e estava errado; a correção
    // daquela rodada foi validada pelo dono do produto nesta.
    //
    // A razão da remoção: o código MUDOU DE NATUREZA. Antes seria uma referência estável do
    // agendamento; com a Fase 2B é um código de ACESSO de 10 minutos, de uso único, e já
    // QUEIMADO no instante em que esta mensagem é enviada — a remarcação acabou de consumi-lo.
    // Publicá-lo não autoriza nada.
    expect(MENSAGEM_ALTERACAO_PADRAO).not.toContain('{codigo}')
    expect(MENSAGEM_ALTERACAO_PADRAO).not.toContain('use o código')
  })

  it('mas ela continua com o resto — a remoção não comeu a mensagem', () => {
    for (const v of ['{cliente}', '{data}', '{hora}', '{servico}', '{profissional}', '{empresa}']) {
      expect(MENSAGEM_ALTERACAO_PADRAO).toContain(v)
    }
    expect(MENSAGEM_ALTERACAO_PADRAO).toContain('Novo horário')
  })

  it('`{codigo}` CONTINUA na lista de variáveis — a decisão foi sobre a mensagem', () => {
    // Tirá-lo de `VARIAVEIS_DAS_MENSAGENS` apagaria a variável do sistema, e a tenant que
    // escrever a própria mensagem pode querer usá-lo.
    expect(VARIAVEIS_DAS_MENSAGENS).toContain('{codigo}')
  })

  it('agora NENHUMA das três constantes cita `{codigo}`', () => {
    // O estado final, dito de uma vez: a de confirmação perdeu em 06/10, a de alteração em
    // 08/10, e a de cancelamento nunca teve.
    for (const m of [MENSAGEM_CONFIRMACAO_PADRAO, MENSAGEM_CANCELAMENTO_PADRAO, MENSAGEM_ALTERACAO_PADRAO]) {
      expect(m).not.toContain('{codigo}')
    }
  })

  it('a dívida da Fase 2B foi PAGA, e a nota do arquivo diz isso', () => {
    // >>> O RODAPÉ PASSOU A SER VERDADE NESTA RODADA <<<
    // A nota de 08/10 dizia: "Este rodapé promete alteração e cancelamento pelo link, que a
    // Fase 2B ainda não entregou." As quatro rotas existem agora. A nota continua no arquivo
    // como REGISTRO do que aconteceu — apagá-la apagaria a história — e este caso afirma que o
    // rodapé e as rotas existem juntos, que é o que torna a promessa cumprível.
    const fs = require('fs')
    const path = require('path')
    const raiz = path.resolve(__dirname, '../..')
    for (const r of ['codigo-solicitar', 'codigo-validar', 'cancelar', 'remarcar']) {
      expect(fs.existsSync(path.join(raiz, 'pages/api/public/agenda/[token]', `${r}.ts`))).toBe(true)
    }
    expect(MENSAGEM_CONFIRMACAO_PADRAO).toContain('acesse pelo mesmo link')
  })
})
