/**
 * Máscara de telefone em módulo único, coluna canônica `whatsapp_phone`, e "Excluir" no lugar
 * de "Desativar".
 *
 * CADA ASSERÇÃO PRECISA FALHAR SEM A SUA CORREÇÃO. Antes destas mudanças:
 *   - `phoneMask` existia SÓ em `clientes/index.tsx`, e os dois campos de cliente manual eram
 *     `<Input placeholder="(00) 00000-0000" />` sem `onChange`, `maxLength` ou validação;
 *   - as três rotas rápidas gravavam em `customers.phone`, que a tela de Clientes NÃO LÊ;
 *   - o botão dizia "Desativar", prometendo uma reversibilidade que não existe.
 *
 * MEDIDO: restauradas as três páginas do `origin/main`, os casos de contrato ficam vermelhos.
 *
 * OS ORÁCULOS, medidos na base em 08/09/2026 (89 clientes):
 *   - GERONIMO, gravado com `51999999999999999999999` — VINTE E TRÊS dígitos, pela rota do
 *     Novo Orçamento, que não tinha máscara nenhuma.
 *   - 63 dos 79 `phone` preenchidos têm MENOS de 10 dígitos: `54194`, `34530`, `5555`, `356435`.
 *   - 13 dos 24 `whatsapp_phone` preenchidos são o PLACEHOLDER `999999999`, o mesmo valor
 *     repetido para vencer o campo obrigatório.
 *
 * A LIÇÃO DE MÉTODO QUE ESTE ARQUIVO REGISTRA, e ela é a razão de os casos abaixo checarem
 * VALIDADE e não só diferença:
 *
 *   > "Os valores são DIFERENTES" não prova "são dois dados REAIS" — prova só que são
 *   > diferentes. DOIS LIXOS TAMBÉM DIFEREM ENTRE SI.
 *
 * Os 14 clientes com as duas colunas preenchidas tinham valores distintos, e isso foi lido como
 * evidência de dois telefones reais (fixo e WhatsApp). Doze deles têm `999999999` de um lado e
 * 4 a 9 dígitos do outro: lixo dos dois lados. É a mesma armadilha de
 * `.claude/rules/teste-que-nao-exercita.md` — medir a propriedade FÁCIL em vez da propriedade
 * que DECIDE.
 *
 * A MIGRAÇÃO DE DADOS É RODADA PRÓPRIA. Os 89 registros com telefone espalhado nas duas colunas
 * FICAM COMO ESTÃO; este PR só faz o código gravar certo daqui pra frente. Quando for feita,
 * vale o protocolo de `.claude/rules/migration-delivery.md`: SQL em raw e base64, `md5`,
 * verificação por consulta e `NOTIFY pgrst, 'reload schema'`. O único caso com DOIS valores
 * plausíveis é o Wfjnrjn (`51999999999` e `51999114290`), e ele fica com o `whatsapp_phone`.
 */

import fs from 'fs'
import path from 'path'
import {
    MAX_PHONE_DIGITS,
    MAX_PHONE_MASKED_LENGTH,
    MIN_PHONE_DIGITS,
    PHONE_ERROR_MESSAGE,
    isValidPhoneBR,
    onlyPhoneDigits,
    phoneMask,
    phoneRules,
} from '@/utils/phone-br'

const leia = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), 'src', ...p), 'utf-8')

/**
 * Remove linhas de comentário antes de afirmar AUSÊNCIA de um termo.
 *
 * Os comentários destas correções CITAM de propósito o que foi removido — "gravava em `phone`",
 * "o texto pedia DDI", "RESTRICT em pending_receivables" — e é código EXECUTÁVEL que está sendo
 * afirmado. Sem isto, a asserção acusaria a própria explicação da correção.
 */
const semComentarios = (fonte: string) =>
    fonte
        .split('\n')
        .filter((l) => {
            const c = l.trim()
            return !c.startsWith('//') && !c.startsWith('*') && !c.startsWith('/*') && !c.startsWith('{/*')
        })
        .join('\n')
const CLIENTES = leia('pages', 'clientes', 'index.tsx')
const ORCAMENTOS = leia('pages', 'orcamentos', 'index.tsx')
const AGENDA = leia('pages', 'agenda', 'index.tsx')

describe('a máscara recusa o que não é telefone', () => {
    it('o GERONIMO, de 23 dígitos, é cortado em 11', () => {
        const mascarado = phoneMask('51999999999999999999999')
        expect(onlyPhoneDigits(mascarado)).toHaveLength(MAX_PHONE_DIGITS)
        expect(mascarado).toBe('(51) 99999-9999')
    })

    it('os lixos medidos na base são INVÁLIDOS', () => {
        for (const lixo of ['5555', '54194', '34530', '35465', '356435', '465323', '9845985']) {
            expect(isValidPhoneBR(lixo)).toBe(false)
        }
    })

    it('o placeholder `999999999` é INVÁLIDO — nove dígitos não são telefone', () => {
        // 13 dos 24 `whatsapp_phone` da base são exatamente este valor. Com a validação, ele
        // deixa de ser aceito como saída fácil para o campo obrigatório.
        expect(isValidPhoneBR('999999999')).toBe(false)
    })

    it('telefone real passa, fixo e celular', () => {
        expect(isValidPhoneBR('51999114290')).toBe(true)   // celular, 11
        expect(isValidPhoneBR('(51) 3333-4444')).toBe(true) // fixo mascarado, 10
        expect(MIN_PHONE_DIGITS).toBe(10)
        expect(MAX_PHONE_DIGITS).toBe(11)
    })

    it('formata progressivamente e é idempotente sobre a própria saída', () => {
        expect(phoneMask('')).toBe('')
        expect(phoneMask('5')).toBe('(5')
        expect(phoneMask('5199')).toBe('(51) 99')
        expect(phoneMask('51999114290')).toBe('(51) 99911-4290')
        // Reaplicar não corrompe — é o que permite usá-la no `onChange` sem guardar estado.
        expect(phoneMask(phoneMask('51999114290'))).toBe('(51) 99911-4290')
    })

    it('`maxLength` do campo cabe o número mascarado inteiro', () => {
        expect('(51) 99911-4290'.length).toBe(MAX_PHONE_MASKED_LENGTH)
    })
})

describe('vazio e malformado são afirmações DIFERENTES', () => {
    const [obrigatorio, formato] = phoneRules('Informe o telefone do cliente')

    it('a regra de obrigatoriedade não julga formato', () => {
        expect(obrigatorio).toEqual({ required: true, message: 'Informe o telefone do cliente' })
    })

    it('o validador aceita vazio — quem recusa vazio é a outra regra', () => {
        // Juntar as duas esconderia qual das duas é o caso: "não informou" e "informou errado"
        // são coisas distintas. `.claude/rules/ausente-vs-falso.md`.
        return expect((formato as { validator: (a: unknown, b: string) => Promise<void> })
            .validator(null, '')).resolves.toBeUndefined()
    })

    it('o validador recusa o malformado com a mensagem própria', async () => {
        const v = (formato as { validator: (a: unknown, b: string) => Promise<void> }).validator
        await expect(v(null, '5555')).rejects.toThrow(PHONE_ERROR_MESSAGE)
        await expect(v(null, '51999114290')).resolves.toBeUndefined()
    })
})

describe('a máscara está em UM módulo, não copiada para três telas', () => {
    it('nenhuma página redefine `phoneMask`', () => {
        // Copiar para os dois campos seria `.claude/rules/copia-divergente.md`, a classe que já
        // custou o #27, o #28 e o #45.
        for (const fonte of [CLIENTES, ORCAMENTOS, AGENDA]) {
            expect(fonte).not.toContain('const phoneMask = (value: string)')
        }
    })

    it('as três páginas importam do módulo único', () => {
        for (const fonte of [CLIENTES, ORCAMENTOS, AGENDA]) {
            expect(fonte).toContain("from '@/utils/phone-br'")
        }
    })

    it('os DOIS campos manuais ganharam máscara, `maxLength` e validação', () => {
        for (const fonte of [ORCAMENTOS, AGENDA]) {
            expect(fonte).toContain('manual_customer_phone: phoneMask(e.target.value)')
            expect(fonte).toContain('maxLength={MAX_PHONE_MASKED_LENGTH}')
            expect(fonte).toContain("phoneRules('Informe o telefone do cliente')")
        }
    })

    it('o campo do cadastro também passou a validar, não só mascarar', () => {
        expect(CLIENTES).toContain("phoneRules('Informe o WhatsApp para disparos')")
    })
})

describe('a coluna canônica é `whatsapp_phone` nas QUATRO rotas', () => {
    it('as três rotas rápidas não gravam mais em `phone`', () => {
        // Era a causa do campo em branco no cadastro: gravava em `phone`, a tela lê
        // `whatsapp_phone`.
        // O `(?<!whatsapp_)` é necessário: `whatsapp_phone: manualPhone,` CONTÉM a substring
        // `phone: manualPhone,`, e uma asserção ingênua acusaria a própria correção.
        const gravaEmPhone = /(?<!whatsapp_)phone: manualPhone/
        expect(semComentarios(ORCAMENTOS)).not.toMatch(gravaEmPhone)
        expect(semComentarios(AGENDA)).not.toMatch(gravaEmPhone)
    })

    it('as três rotas rápidas gravam em `whatsapp_phone`', () => {
        // Duas em orçamentos (criar e editar) e uma na agenda. A contagem importa: uma rota
        // esquecida volta a gravar na coluna que a tela não lê, sem erro nenhum.
        expect(ORCAMENTOS.split('whatsapp_phone: manualPhone,').length - 1).toBe(2)
        expect(AGENDA.split('whatsapp_phone: manualPhone,').length - 1).toBe(1)
    })

    it('o texto de ajuda do cadastro deixou de pedir DDI, que contradizia a máscara', () => {
        // `normalizePhoneBR` acrescenta o `55` sozinho quando o número tem até 11 dígitos:
        // gravar com DDI faria o número cair no ramo errado da normalização.
        expect(semComentarios(CLIENTES)).not.toContain('DDI + DDD + Número (ex: 5551999990000)')
        expect(CLIENTES).toContain('o código do país é acrescentado no envio')
    })
})

describe('"Excluir" no lugar de "Desativar" — o rótulo passa a descrever o que acontece', () => {
    it('os DOIS pontos da tela dizem Excluir', () => {
        expect(CLIENTES).toContain('<Button type="link" size="small" danger>Excluir</Button>')
        expect(CLIENTES).toContain("label: 'Excluir',")
        expect(CLIENTES).not.toContain('>Desativar<')
        expect(CLIENTES).not.toContain("label: 'Desativar',")
    })

    it('o cartão mobile CONFIRMA antes de excluir — ele não tem Popconfirm', () => {
        // Sem o `Modal.confirm` a exclusão aconteceria sem barreira nenhuma no mobile, enquanto
        // o desktop pergunta. Dois pontos montando a mesma ação, um sem a proteção do outro.
        expect(CLIENTES).toContain("title: 'Excluir cliente?'")
        expect(CLIENTES).toContain('title="Excluir cliente?"')
    })

    it('a confirmação diz que NÃO HÁ REATIVAÇÃO — é a informação que faltava', () => {
        expect(CLIENTES).toContain('não há como reativá-lo')
    })

    it('a razão do renome está escrita, não é troca silenciosa de texto', () => {
        expect(CLIENTES).toContain('REVERSIBILIDADE QUE NÃO EXISTE')
        expect(CLIENTES).toContain('NÃO HÁ TELA DE')
    })

    it('continua sendo SOFT DELETE — nenhum DELETE físico em `customers`', () => {
        // Dez tabelas apontam para `customers` com TRÊS comportamentos diferentes (SET NULL,
        // CASCADE, RESTRICT): um delete físico ora desvincularia documentos, ora destruiria
        // histórico, ora falharia. Este caso é o que impede alguém de "completar" o renome
        // trocando o UPDATE por um DELETE.
        const rota = leia('pages', 'api', 'delete', 'customers.ts')
        expect(rota).toContain('.update({ is_active: false })')
        expect(rota).not.toContain('.delete()')
    })

    it('sem pré-condição — excluir cliente com documentos continua permitido', () => {
        // Medido: 70 dos 89 clientes têm orçamento e 27 têm venda; uma pré-condição por
        // documento bloquearia 74 de 89. E 4 dos 14 já desativados TÊM venda: nunca houve
        // barreira, e a decisão foi não criar uma.
        const rota = semComentarios(leia('pages', 'api', 'delete', 'customers.ts'))
        expect(rota).not.toContain("from('sales')")
        expect(rota).not.toContain("from('budgets')")
        expect(rota).not.toContain('pending_receivables')
    })
})
