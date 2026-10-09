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
  aplicarVariaveis,
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

  it('`{codigo}` NÃO está na lista de VARIÁVEIS, nem em nenhuma das três mensagens', () => {
    // >>> ESTE CASO MUDOU TRÊS VEZES, E AS TRÊS ESTÃO REGISTRADAS <<<
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
    // Terceira (09/10): a variável SAIU DA LISTA. A asserção anterior era
    // `expect(VARIAVEIS_DAS_MENSAGENS).toContain('{codigo}')`, com esta justificativa: *"A
    // variável FICA na lista: a decisão foi sobre as mensagens padrão, e a tenant que escrever
    // a própria pode querer usá-la."* Ela caiu porque a medição das três rotas mostrou que
    // NENHUMA interpola `codigo` — a tenant que a usasse receberia o literal `{codigo}` no
    // WhatsApp do cliente. A asserção está INVERTIDA, não apagada: a antiga fica aqui para que
    // quem a reintroduzir saiba que ela já existiu e por que caiu.
    expect(VARIAVEIS_DAS_MENSAGENS).not.toContain('{codigo}')
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

  it('`{codigo}` SAIU da lista de variáveis — a tela não oferece o que o envio ignora', () => {
    // >>> ASSERÇÃO INVERTIDA EM 09/10/2026 <<<
    // Ela era `expect(VARIAVEIS_DAS_MENSAGENS).toContain('{codigo}')`, com a razão: *"tirá-lo
    // apagaria a variável do sistema, e a tenant que escrever a própria mensagem pode querer
    // usá-lo."* O raciocínio tratava a lista como catálogo do que o sistema conhece; ela é o
    // que a TELA OFERECE. Medido nas três rotas: nenhuma interpola `codigo`.
    expect(VARIAVEIS_DAS_MENSAGENS).not.toContain('{codigo}')
    // e a lista é exatamente estas seis, na ordem — um campo novo não entra sem ninguém olhar
    expect([...VARIAVEIS_DAS_MENSAGENS]).toEqual([
      '{cliente}', '{servico}', '{profissional}', '{data}', '{hora}', '{empresa}',
    ])
  })

  it('o `{codigo}` segue vivo e interpolado em `codigo-solicitar`, que não foi tocado', () => {
    // >>> O ESPELHO OBRIGATÓRIO, E ELE É O QUE IMPEDE A LEITURA ERRADA DA REMOÇÃO <<<
    // Sem este caso, "o {codigo} saiu" ficaria verde num estado em que o código tivesse sido
    // removido do sistema inteiro — e aí ninguém receberia código nenhum. A remoção é da LISTA
    // DA TELA; o envio do código continua existindo, com a variável interpolada.
    const fs = require('fs')
    const path = require('path')
    const rota = fs.readFileSync(
      path.resolve(__dirname, '../../pages/api/public/agenda/[token]/codigo-solicitar.ts'), 'utf8',
    ) as string
    const prog = rota.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(prog).toContain('{codigo}')
    expect(prog).toContain('vars: { codigo, empresa: ctx.empresa }')
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A SALVAGUARDA — `aplicarVariaveis`: o placeholder sem valor SOME, com o espaço que sobraria
//
// >>> É A MUTAÇÃO M23, E O CASO DELA É O PRIMEIRO DESTE BLOCO <<<
//
// Tirar `{codigo}` da lista impede a tenant de ESCOLHER a variável daqui para frente; não apaga
// o texto que ela já salvou. As três colunas são texto livre. Sem esta limpeza, o cliente
// receberia `use o código {codigo}` com as chaves — e isso parece defeito do salão.
//
// Cada caso abaixo mede EFEITO: o texto que sai. Nenhum deles afirma que a função foi chamada.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('`aplicarVariaveis` — o que não tem valor desaparece, e o resto fica intacto', () => {
  it('>>> {codigo} e {inexistente} NÃO aparecem, o resto fica, e não há espaço duplo <<<', () => {
    // >>> O CASO DA MUTAÇÃO M23 — desligar a limpeza tem de deixar ESTE vermelho <<<
    // É o caso que o comando pediu, literal: *"texto com {codigo} e {inexistente} -> nenhum dos
    // dois aparece no resultado, e o resto do texto fica intacto, sem espaco duplo."*
    const texto = 'Olá {cliente}, use o {codigo} e o {inexistente} para alterar. {empresa}'
    const r = aplicarVariaveis(texto, { cliente: 'Ana', empresa: 'Salão X' })

    // os dois sumiram, chaves e tudo
    expect(r).not.toContain('{codigo}')
    expect(r).not.toContain('{inexistente}')
    expect(r).not.toContain('codigo')
    expect(r).not.toContain('inexistente')
    expect(r).not.toContain('{')
    expect(r).not.toContain('}')
    // o resto ficou — e as duas variáveis COM valor foram interpoladas
    expect(r).toContain('Olá Ana,')
    expect(r).toContain('Salão X')
    expect(r).toContain('para alterar')
    // e NENHUM espaço duplo em lugar nenhum
    expect(r).not.toMatch(/ {2}/)
    // o texto exato, para que a asserção não seja só "não contém"
    expect(r).toBe('Olá Ana, use o e o para alterar. Salão X')
  })

  it('a VÍRGULA SOLTA não acontece: `Olá {cliente},` com nome vazio vira `Olá,`', () => {
    // >>> O DEFEITO MEDIDO EM PRODUÇÃO, E A FORMA EXATA DA CORREÇÃO <<<
    // `cancelar.ts` passava `cliente: ''`, e o texto padrão saía `Olá , seu agendamento foi
    // cancelado.` — com a vírgula solta. Esta é a asserção que o comando pediu: *"Confirme que
    // fica assim, sem virgula solta."*
    const r = aplicarVariaveis(MENSAGEM_CANCELAMENTO_PADRAO, {
      cliente: '', servico: 'Corte', profissional: 'João',
      data: '09/10/2026', hora: '14:30', empresa: 'Salão X',
    })
    expect(r.startsWith('Olá, seu agendamento foi cancelado.')).toBe(true)
    expect(r).not.toContain('Olá ,')
    expect(r).not.toContain('{cliente}')
    expect(r).not.toMatch(/ {2}/)
    // e o resto da mensagem continua inteiro
    expect(r).toContain('Corte com João')
    expect(r).toContain('09/10/2026 às 14:30')
    expect(r).toContain('Salão X')
  })

  it('e o PAR: com nome, o nome aparece — sem ele a asserção acima não mediria nada', () => {
    // Sem este caso, "não tem vírgula solta" ficaria verde numa função que apagasse o
    // `{cliente}` sempre. `teste-que-nao-exercita.md`: o caso precisa DISTINGUIR os dois
    // estados, e é por isso que os dois valores do par são diferentes.
    const r = aplicarVariaveis(MENSAGEM_CANCELAMENTO_PADRAO, {
      cliente: 'Ana Maria', servico: 'Corte', profissional: 'João',
      data: '09/10/2026', hora: '14:30', empresa: 'Salão X',
    })
    expect(r.startsWith('Olá Ana Maria, seu agendamento foi cancelado.')).toBe(true)
  })

  it('`null`, `undefined`, `\'\'` e `\'   \'` são todos SEM VALOR — e `0` NÃO é', () => {
    // A distinção de `ausente-vs-falso.md` na assinatura: branco não afirma nada. Já `'0'` é
    // um valor que alguém escreveu, e apagá-lo seria apagar dado.
    const semValor = [null, undefined, '', '   ', '\t']
    for (const v of semValor) {
      expect(aplicarVariaveis('a {x} b', { x: v as any })).toBe('a b')
    }
    expect(aplicarVariaveis('a {x} b', { x: '0' })).toBe('a 0 b')
    expect(aplicarVariaveis('a {x} b', { x: 'Z' })).toBe('a Z b')
  })

  it('o ESPAÇO é tratado nos quatro arranjos, e nenhum deles deixa sobra', () => {
    // A tabela do cabeçalho da função, uma asserção por linha.
    expect(aplicarVariaveis('Olá {cliente}, seu', {})).toBe('Olá, seu')      // antes, pontuação
    expect(aplicarVariaveis('use o {codigo} agora', {})).toBe('use o agora') // dos dois lados
    expect(aplicarVariaveis('{servico} com', {})).toBe('com')                // nada antes
    expect(aplicarVariaveis('com {profissional}', {})).toBe('com')           // nada depois
  })

  it('a QUEBRA DE LINHA nunca é comida — só espaço horizontal', () => {
    // Comer `\n` juntaria linhas da mensagem, e o `{empresa}` da última apagaria a quebra antes
    // dela. O caso usa a constante real, que termina em `{empresa}` numa linha própria.
    expect(aplicarVariaveis('linha 1\n{x}\nlinha 3', {})).toBe('linha 1\n\nlinha 3')
    const r = aplicarVariaveis(MENSAGEM_ALTERACAO_PADRAO, {
      cliente: 'Ana', servico: 'Corte', profissional: 'João',
      data: '09/10/2026', hora: '14:30', empresa: '',
    })
    // a empresa sumiu, mas a quebra antes dela ficou — a mensagem não virou um parágrafo só
    expect(r).toContain('Corte com João\n')
    expect(r).not.toContain('{empresa}')
  })

  it('UMA passagem só: valor que contém `{hora}` NÃO é reinterpolado', () => {
    // O laço sequencial que havia no envio preenchia o `{hora}` que viesse DENTRO de um valor —
    // e o nome do cliente é dado de fora. Injeção de template, estreita e real.
    const r = aplicarVariaveis('Olá {cliente}, às {hora}', { cliente: 'Ana {hora}', hora: '14:30' })
    expect(r).toBe('Olá Ana {hora}, às 14:30')
  })

  it('TODA variável que a tela oferece é interpolada — a lista e a função não divergem', () => {
    // `copia-divergente.md`: a tela oferece seis, e nada garantia que a função as reconhecesse.
    // Com nomes distintos por variável, um `{x}` que sobrasse apareceria na asserção final.
    const vars: Record<string, string> = {}
    for (const v of VARIAVEIS_DAS_MENSAGENS) vars[v.slice(1, -1)] = `VALOR_${v.slice(1, -1)}`
    const texto = VARIAVEIS_DAS_MENSAGENS.join(' · ')
    const r = aplicarVariaveis(texto, vars)
    expect(r).toBe(VARIAVEIS_DAS_MENSAGENS.map((v) => `VALOR_${v.slice(1, -1)}`).join(' · '))
    expect(r).not.toContain('{')
  })

  it('texto SEM placeholder nenhum volta idêntico', () => {
    const t = 'Seu agendamento foi cancelado. Até logo!'
    expect(aplicarVariaveis(t, { cliente: 'Ana' })).toBe(t)
  })

  it('o ENVIO chama esta função — e é o ÚNICO ponto que interpola', () => {
    // >>> A EXIGÊNCIA DE "UMA FUNÇÃO SÓ, USADA PELOS TRÊS" <<<
    // As três rotas não interpolam nada: elas passam `vars` para `enviarMensagemDoAgendamento`,
    // e é ele que chama `aplicarVariaveis`. Esta asserção é sobre CAMINHO, não efeito, e vale
    // porque o defeito a evitar é exatamente a existência de um SEGUNDO interpolador — não há
    // número que mude (`teste-que-nao-exercita.md`, o caso-limite honesto).
    const fs = require('fs')
    const path = require('path')
    const raiz = path.resolve(__dirname, '../..')
    const semComentarios = (f: string) => fs.readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') as string

    const lib = semComentarios(path.join(raiz, 'lib/agendamento-publico.ts'))
    expect(lib).toContain('aplicarVariaveis(textoOuPadrao(')
    // e o laço sequencial que havia lá NÃO voltou
    expect(lib).not.toContain('.split(`{${k}}`).join(')

    for (const r of ['agendar', 'cancelar', 'remarcar', 'codigo-solicitar']) {
      const rota = semComentarios(path.join(raiz, 'pages/api/public/agenda/[token]', `${r}.ts`))
      expect(rota).not.toContain('aplicarVariaveis')
      expect(rota).not.toContain('.split(`{')
    }
  })
})
