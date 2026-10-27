/**
 * PORTÃO — o BLOCO MOTOR na tela da conta (`motor-da-conta.component.tsx`).
 *
 * POR QUÊ (dono do produto, 26/10/2026): "O BLOCO MOTOR NÃO É CAMPO DE TEXTO. Se 'como vai ser aplicado'
 * virasse redação, alguém escreveria 'aplique sem o reforço' e o cálculo obedeceria uma frase em vez do
 * motor. Ele MOSTRA o que a conta tem carregado e edita só escolha estruturada (critério de barra, família
 * da tabela)."
 *
 * O que este portão fica vermelho:
 *   (1) o bloco MOSTRA: a cascata, a tabela com fornecedor e arquivos, as linhas, cada contagem e a otimização;
 *   (2) NÃO HÁ campo de texto no bloco: nenhum textarea, nenhum input de texto;
 *   (3) a família se escolhe da lista e vai pela rota da TABELA; com a tabela em mais de uma conta, o bloco
 *       diz que a troca vale para todas, nomeando-as;
 *   (4) o critério de custo das barras se escolhe entre as duas opções e vai pela rota da CATEGORIA da base
 *       de conhecimento, só com essa chave (a função faz merge: o resto do Perfil não é tocado);
 *   (5) as tipologias de uma tabela e as abas de uma tipologia, pelas rotas do motor;
 *   (6) falha de leitura é ERRO na tela, nunca um bloco vazio;
 *   (7) A FONTE É A DERIVAÇÃO (26/10/2026): cada tabela diz por qual categoria da base de conhecimento entra e se vale
 *       para levantamento novo; a VIGENTE se marca com uma chave, pela rota da tabela, e a recusa do índice aparece
 *       no bloco; os avisos dizem fornecedor sem tabela, par sem vigente e nenhuma tabela com motor; nada fala em
 *       "Tabelas em uso";
 *   (8) SÓ O QUE TEM MOTOR (27/10/2026): o bloco lista o que o servidor manda — e diz DE ONDE vem (tabela do
 *       fornecedor, que a conversa lê; planilha, que ainda não) e A QUAL FAMÍLIA pertence;
 *   (9) ARQUIVAR (27/10/2026): a planilha se arquiva pela rota de arquivar, com confirmação, dizendo que o dado fica
 *       e quais contas a perdem da lista; a recusa aparece no bloco; NÃO HÁ botão de excluir, em lugar nenhum.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ROTAS_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'
import {
    AVISO_NENHUMA_COM_MOTOR, ROTAS_DO_MOTOR, ROTULO_DA_ORIGEM, SEM_MOTOR_NA_CONTA, fraseDoArquivar, fraseDoFornecedorSemTabela, fraseDoParSemVigente,
    type MotorDaConta,
} from '@/utils/atendimentos-ia-motor'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const CONTA = '00000000-0000-4000-8000-0000000000a1'
const T1 = '00000000-0000-4000-8000-0000000000c1'
const M1 = '00000000-0000-4000-8000-0000000000d1'
const CATEGORIA = `/api/super-admin/base-de-conhecimento/categoria?tenant=${CONTA}&materia_prima=mp-1&categoria=PERFIL`

const RESUMO: MotorDaConta = {
    tabelas: [{
        tabela_id: T1, fornecedor: 'Wolff Perfis', arquivo_nome: 'Tabela Wolff.xlsx', motor_nome: 'Motor Wolff.xlsx', vigencia: 'desde 10/2026', familia: null,
        contas_usando: ['Esquadrias De Paula', 'Outra Esquadrias'],
        categorias: ['PERFIL'], vigente: false, vale: true, com_motor: true,
        linhas: [{ linha: 'PVC WOLFF DESIGN', tipologias: 1 }, { linha: 'PVC WOLFF EUROPA 42', tipologias: 109 }],
        contagens: { tipologias: 164, perfis: 10496, formulas: 4468, variaveis: 3573, vidros: 402, baguetes: 418, insumos: 30017, validacoes: 169, otimizacao: 7, formulas_da_linha: 137, regras: 12116, tempos: 164, itens_de_preco: 735 },
        otimizacao: [{ parametro: 'barra_mm', valor: '6000' }, { parametro: 'serra_mm', valor: '5' }],
    }],
    planilhas: [{
        motor_id: M1, familia: 'PVC', fornecedor: 'Wolff Perfis', arquivo_nome: 'Motor_Wolf_PVC.xlsm', vigente: true,
        contas_usando: ['Esquadrias De Paula', 'Outra Esquadrias'],
        linhas: [{ linha: 'PVC WOLFF EUROPA 42', tipologias: 109 }],
        contagens: { tipologias: 109, perfis: 2000, formulas: 300, variaveis: 200, vidros: 50, baguetes: 40, insumos: 900, validacoes: 20, otimizacao: 7, formulas_da_linha: 30, regras: 4000, tempos: 109 },
        otimizacao: [{ parametro: 'barra_mm', valor: '6000' }],
    }],
    avisos: { fornecedores_sem_tabela: [], pares_sem_vigente: [], nenhuma_com_motor: false },
    familias: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }],
    etapas_das_familias: [],
    materias_primas: [{ id: 'mp-1', nome: 'Perfis PVC', criterio_custo_barra: 'CONSUMO_REAL' }],
}

let respostas: Record<string, { status: number; body: unknown }> = {}
const pedidos: Array<{ chave: string; corpo: unknown }> = []
beforeEach(() => {
    pedidos.length = 0
    respostas = {
        [`GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`]: { status: 200, body: RESUMO },
        [`PATCH ${ROTAS_DO_CATALOGO.tabela(T1)}`]: { status: 200, body: { ok: true } },
        [`POST ${ROTAS_DO_MOTOR.arquivar(CONTA)}`]: { status: 200, body: { depois: { orcamentista_motor: { id: M1 } } } },
        [`GET ${ROTAS_DO_MOTOR.tipologias(CONTA, { motor: M1 })}`]: {
            status: 200,
            body: [{ tipologia: 'PL-01', linha: 'PVC WOLFF EUROPA 42', descricao: 'PORTA DA PLANILHA', tipo: 'Porta', larg_min_mm: null, larg_max_mm: null, alt_min_mm: null, alt_max_mm: null, n_perfis: 3, n_vidros: 0, n_insumos: 0, tempo_fabricacao_min: null, tempo_origem: null }],
        },
        [`PUT ${CATEGORIA}`]: { status: 200, body: {} },
        [`GET ${ROTAS_DO_MOTOR.tipologias(CONTA, T1)}`]: {
            status: 200,
            body: [{ tipologia: 'DP-02', linha: 'PVC WOLFF EUROPA 42', descricao: 'JANELA DE CORRER 02 FOLHAS', tipo: 'Correr', larg_min_mm: 600, larg_max_mm: 3000, alt_min_mm: 400, alt_max_mm: 2500, n_perfis: 64, n_vidros: 2, n_insumos: 3, tempo_fabricacao_min: 300, tempo_origem: 'ESTIMADO' }],
        },
        [`GET ${ROTAS_DO_MOTOR.tipologia(CONTA, T1, 'DP-02')}`]: {
            status: 200,
            body: {
                perfis: [{ ordem: 2, linha: 'EUROPA 42', perfil: 'SF66', descricao: 'folha', corte: '45/45', qtd: '2', medida: 'H-10', posicao: null, esp_vidro: null, condicao: null, obs: null }],
                formulas: [], variaveis: [{ ordem: 2, linha: 'EUROPA 42', variavel: 'ARI', descricao: 'ARREMATE INTERNO', padrao: '1', min_max: null, condicao: null, opcoes: '1 = BZ0006' }],
                vidros: [], baguetes: [], insumos: [], validacoes: [],
            },
        },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push({ chave, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = respostas[chave] ?? { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Bloco = () => require('@/page-parts/atendimentos-ia/motor-da-conta.component').MotorDaConta as React.ComponentType<{ tenantId: string }>

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(React.createElement(Bloco(), { tenantId: CONTA })) })
    await assentar()
    return host
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '')) as HTMLButtonElement | undefined
async function clicar(el: Element | null | undefined) {
    expect(el).toBeTruthy()
    await act(async () => { (el as HTMLElement).click() })
    await assentar()
}

describe('(1)(2) o bloco MOSTRA, e não tem campo de texto', () => {
    it('a cascata, a tabela, as linhas, cada contagem e a otimização', async () => {
        const host = await montar()
        const texto = host.textContent ?? ''
        expect(texto).toContain('Família → Linha → Tipologia → Perfis, vidros, insumos → Preço')
        expect(texto).toContain('Wolff Perfis')
        expect(texto).toContain('Tabela Wolff.xlsx')
        expect(texto).toContain('Motor Wolff.xlsx')
        expect(texto).toContain('PVC WOLFF EUROPA 42: 109 tipologia(s)')
        const contagem = (c: string) => host.querySelector(`[data-tabela-do-motor="${T1}"] [data-contagem="${c}"]`)?.textContent ?? ''
        expect(contagem('perfis')).toContain('10.496')
        expect(contagem('insumos')).toContain('30.017')
        expect(contagem('itens_de_preco')).toContain('735')
        expect(texto).toContain('barra_mm: 6000')
    })

    it('NÃO HÁ campo de texto: nenhum textarea, nenhum input de texto', async () => {
        const host = await montar()
        expect(host.querySelectorAll('textarea, input[type="text"], input:not([type])').length).toBe(0)
    })

    it('a família não informada aparece como tal, nunca como uma família', async () => {
        const host = await montar()
        expect(host.querySelector(`[data-familia-da-tabela="${T1}"]`)?.textContent).toContain('não informada')
    })
})

describe('(3) a família: da lista, pela rota da tabela, e o aviso das outras contas', () => {
    it('com a tabela em duas contas, o bloco diz que a troca vale para as duas, pelo nome', async () => {
        const host = await montar()
        expect(host.textContent).toContain('Esta tabela é usada por 2 contas (Esquadrias De Paula, Outra Esquadrias): trocar a família muda para todas.')
    })

    it('escolher PVC e salvar manda PATCH { familia: "PVC" } para a rota da tabela', async () => {
        const host = await montar()
        expect((host.querySelector(`[data-escolha-de-familia="${T1}"]`)?.querySelector('button') as HTMLButtonElement).disabled).toBe(true)
        await clicar(host.querySelector(`[data-escolha-de-familia="${T1}"] input[value="PVC"]`))
        await clicar(host.querySelector(`[data-escolha-de-familia="${T1}"]`)?.querySelector('button'))
        const patch = pedidos.find((p) => p.chave === `PATCH ${ROTAS_DO_CATALOGO.tabela(T1)}`)
        expect(patch?.corpo).toEqual({ familia: 'PVC' })
    })

    it('a recusa da rota aparece no bloco', async () => {
        respostas[`PATCH ${ROTAS_DO_CATALOGO.tabela(T1)}`] = { status: 400, body: { error: 'A família "PVC" não está na lista de famílias.' } }
        const host = await montar()
        await clicar(host.querySelector(`[data-escolha-de-familia="${T1}"] input[value="PVC"]`))
        await clicar(host.querySelector(`[data-escolha-de-familia="${T1}"]`)?.querySelector('button'))
        expect(host.textContent).toContain('A família "PVC" não está na lista de famílias.')
    })
})

describe('(4) o critério de custo das barras: das duas opções, pela rota da categoria, só a chave dele', () => {
    it('trocar para barra inteira manda PUT { config: { criterio_custo_barra: "BARRA_INTEIRA" } } e nada mais', async () => {
        const host = await montar()
        expect(host.querySelector('[data-criterio="mp-1"] input[value="CONSUMO_REAL"]')).toHaveProperty('checked', true)
        await clicar(host.querySelector('[data-criterio="mp-1"] input[value="BARRA_INTEIRA"]'))
        await clicar(botao(host, 'Salvar critério'))
        const put = pedidos.find((p) => p.chave === `PUT ${CATEGORIA}`)
        expect(put?.corpo).toEqual({ config: { criterio_custo_barra: 'BARRA_INTEIRA' } })
    })
})

describe('(5) as tipologias e as abas de uma tipologia', () => {
    it('"Ver tipologias" lista as da tabela; a tipologia abre as abas, com o perfil e a variável', async () => {
        const host = await montar()
        await clicar(host.querySelector(`[data-tabela-do-motor="${T1}"]`)?.querySelector('[data-ver-tipologias]'))
        expect(host.textContent).toContain('JANELA DE CORRER 02 FOLHAS')
        await clicar(host.querySelector('[data-tipologia="DP-02"]'))
        const gaveta = document.querySelector('.ant-drawer-open') as HTMLElement | null
        expect(gaveta?.textContent).toContain('SF66')
        expect(gaveta?.textContent).toContain('Perfis (1)')
        expect(gaveta?.textContent).toContain('Variáveis (1)')
    })
})

describe('(6) falha de leitura é erro, nunca bloco vazio', () => {
    it('500 no resumo: o bloco diz que não leu, com a frase da rota', async () => {
        respostas[`GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`] = { status: 500, body: { error: 'Não foi possível ler o motor da conta.' } }
        const host = await montar()
        expect(host.textContent).toContain('Não foi possível ler o motor da conta.')
        expect(host.querySelector('[data-contagem]')).toBeNull()
    })
})

describe('(7) a fonte é a derivação: motor ou tabela de preço, a vigente e os avisos', () => {
    it('a tabela diz por qual categoria da base de conhecimento entra', async () => {
        const host = await montar()
        expect(host.querySelector(`[data-tabela-do-motor="${T1}"]`)?.textContent).toContain('PERFIL')
    })

    it('a vigente: uma chave por tabela; marcar a Wolff manda PATCH { vigente: true } pela rota da tabela, e só isso', async () => {
        const host = await montar()
        const chave = host.querySelector(`[data-vigente-do-motor="${T1}"]`) as HTMLButtonElement | null
        expect(chave?.getAttribute('aria-checked')).toBe('false')
        await clicar(chave)
        expect(pedidos.find((p) => p.chave === `PATCH ${ROTAS_DO_CATALOGO.tabela(T1)}`)?.corpo).toEqual({ vigente: true })
    })

    it('a recusa do índice (já há uma vigente) aparece no bloco, inteira', async () => {
        const recusa = 'Já há uma tabela vigente deste fornecedor na família não informada: Wolff 2027.xlsx. Desmarque-a antes de marcar outra.'
        respostas[`PATCH ${ROTAS_DO_CATALOGO.tabela(T1)}`] = { status: 409, body: { error: recusa } }
        const host = await montar()
        await clicar(host.querySelector(`[data-vigente-do-motor="${T1}"]`))
        expect(host.textContent).toContain(recusa)
    })

    it('a tabela que NÃO vale (par sem vigente) diz isso', async () => {
        respostas[`GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`] = { status: 200, body: { ...RESUMO, tabelas: RESUMO.tabelas.map((t) => (t.tabela_id === T1 ? { ...t, vale: false } : t)) } }
        const host = await montar()
        expect(host.querySelector(`[data-vale="${T1}"]`)?.textContent).toContain('não vale')
    })

    it('a que vale não diz que não vale', async () => {
        const host = await montar()
        expect(host.querySelector(`[data-vale="${T1}"]`)?.textContent).not.toContain('não vale')
    })

    it('os três avisos aparecem, cada um com a sua frase', async () => {
        respostas[`GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`] = { status: 200, body: { ...RESUMO, avisos: {
            fornecedores_sem_tabela: [{ fornecedor: 'Ferragens Ômega', categorias: ['FERRAGENS'] }],
            pares_sem_vigente: [{ fornecedor: 'Wolff Perfis', familia: null, arquivos: ['Tabela Wolff.xlsx', 'Wolff 2027.xlsx'] }],
            nenhuma_com_motor: true,
        } } }
        const host = await montar()
        const texto = host.textContent ?? ''
        expect(texto).toContain(fraseDoFornecedorSemTabela('Ferragens Ômega', ['FERRAGENS']))
        expect(texto).toContain(fraseDoParSemVigente('Wolff Perfis', null, ['Tabela Wolff.xlsx', 'Wolff 2027.xlsx']))
        expect(texto).toContain(AVISO_NENHUMA_COM_MOTOR)
    })

    it('sem nenhum motor: a frase diz que tabela de preço não é motor — nada fala em "Tabelas em uso"', async () => {
        respostas[`GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`] = { status: 200, body: { ...RESUMO, tabelas: [], planilhas: [] } }
        const host = await montar()
        expect(host.querySelector('[data-sem-motor]')?.textContent).toContain(SEM_MOTOR_NA_CONTA)
        expect(SEM_MOTOR_NA_CONTA).toContain('Tabela de preço')
        expect(host.textContent).not.toContain('Tabelas em uso')
    })

    it('com as chaves da vigente, continua sem campo de texto', async () => {
        const host = await montar()
        expect(host.querySelectorAll('[data-vigente-do-motor]').length).toBe(1)
        expect(host.querySelectorAll('textarea, input[type="text"], input:not([type])').length).toBe(0)
    })
})

describe('(8) só o que tem motor, de onde vem e a que família pertence', () => {
    it('cada card diz a origem: a tabela do fornecedor (a conversa lê) e a planilha (a conversa ainda não lê)', async () => {
        const host = await montar()
        expect(host.querySelector(`[data-origem="${T1}"]`)?.textContent).toBe(ROTULO_DA_ORIGEM.TABELA)
        expect(host.querySelector(`[data-origem="${M1}"]`)?.textContent).toBe(ROTULO_DA_ORIGEM.PLANILHA)
        expect(ROTULO_DA_ORIGEM.PLANILHA).toContain('ainda não lê')
    })

    it('a planilha mostra a família pelo RÓTULO do catálogo, e a vigente', async () => {
        const host = await montar()
        expect(host.querySelector(`[data-familia-do-motor="${M1}"]`)?.textContent).toBe('PVC')
        expect(host.querySelector(`[data-vigente-da-planilha="${M1}"]`)?.textContent).toBe('Vigente')
    })

    it('a planilha lista as linhas e as contagens SEM os itens de preço (o preço é da tabela do fornecedor)', async () => {
        const host = await montar()
        const planilha = host.querySelector(`[data-planilha-do-motor="${M1}"]`) as HTMLElement
        expect(planilha.textContent).toContain('PVC WOLFF EUROPA 42: 109 tipologia(s)')
        expect(planilha.querySelector('[data-contagem="perfis"]')?.textContent).toContain('2.000')
        expect(planilha.querySelector('[data-contagem="itens_de_preco"]')).toBeNull()
    })

    it('"Ver tipologias" da planilha chama a rota com ?motor=, não com ?tabela=', async () => {
        const host = await montar()
        await clicar(host.querySelector(`[data-planilha-do-motor="${M1}"] [data-ver-tipologias]`))
        expect(pedidos.some((p) => p.chave === `GET ${ROTAS_DO_MOTOR.tipologias(CONTA, { motor: M1 })}`)).toBe(true)
        expect(ROTAS_DO_MOTOR.tipologias(CONTA, { motor: M1 })).toContain(`motor=${M1}`)
        expect(ROTAS_DO_MOTOR.tipologias(CONTA, { motor: M1 })).not.toContain('tabela=')
        expect(host.textContent).toContain('PORTA DA PLANILHA')
    })

    it('a rota por tabela continua com ?tabela= (a forma antiga, com a string)', () => {
        expect(ROTAS_DO_MOTOR.tipologias(CONTA, T1)).toBe(ROTAS_DO_MOTOR.tipologias(CONTA, { tabela: T1 }))
        expect(ROTAS_DO_MOTOR.tipologias(CONTA, T1)).toContain(`tabela=${T1}`)
    })
})

describe('(9) arquivar a planilha: com confirmação, sem excluir', () => {
    const confirmar = () => botao(document.body.querySelector('.ant-popover') as ParentNode, 'Arquivar')

    it('o clique pede confirmação dizendo que o dado fica e que nada é apagado; só a confirmação manda o POST { motor }', async () => {
        const host = await montar()
        await clicar(host.querySelector(`[data-arquivar-motor="${M1}"]`))
        expect(document.body.querySelector('.ant-popover')?.textContent).toContain(fraseDoArquivar('Motor_Wolf_PVC.xlsm'))
        expect(fraseDoArquivar('x')).toContain('nada é apagado')
        expect(pedidos.some((p) => p.chave.startsWith('POST '))).toBe(false)
        await clicar(confirmar())
        const post = pedidos.find((p) => p.chave === `POST ${ROTAS_DO_MOTOR.arquivar(CONTA)}`)
        expect(post?.corpo).toEqual({ motor: M1 })
    })

    it('depois de arquivar, o bloco relê o resumo', async () => {
        const host = await montar()
        const antes = pedidos.filter((p) => p.chave === `GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`).length
        await clicar(host.querySelector(`[data-arquivar-motor="${M1}"]`))
        await clicar(confirmar())
        expect(pedidos.filter((p) => p.chave === `GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`).length).toBe(antes + 1)
    })

    it('com a planilha em duas contas, o bloco diz que arquivar tira da lista de todas, pelo nome', async () => {
        const host = await montar()
        expect(host.querySelector(`[data-arquivar-contas="${M1}"]`)?.textContent).toContain('2 contas (Esquadrias De Paula, Outra Esquadrias): arquivar tira da lista de todas.')
    })

    it('com a planilha em uma conta só, não há o aviso das outras', async () => {
        respostas[`GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`] = { status: 200, body: { ...RESUMO, planilhas: [{ ...RESUMO.planilhas[0], contas_usando: ['Esquadrias De Paula'] }] } }
        const host = await montar()
        expect(host.querySelector(`[data-arquivar-contas="${M1}"]`)).toBeNull()
    })

    it('a recusa da rota aparece no bloco, inteira, e o resumo não é relido', async () => {
        respostas[`POST ${ROTAS_DO_MOTOR.arquivar(CONTA)}`] = { status: 400, body: { error: 'o motor ja esta arquivado' } }
        const host = await montar()
        const antes = pedidos.filter((p) => p.chave === `GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`).length
        await clicar(host.querySelector(`[data-arquivar-motor="${M1}"]`))
        await clicar(confirmar())
        expect(host.textContent).toContain('o motor ja esta arquivado')
        expect(host.textContent).toContain('O motor não foi arquivado.')
        expect(pedidos.filter((p) => p.chave === `GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`).length).toBe(antes)
    })

    it('NÃO HÁ botão de excluir, apagar ou remover em lugar nenhum do bloco, e nenhum pedido DELETE sai', async () => {
        const host = await montar()
        const textos = Array.from(host.querySelectorAll('button')).map((b) => b.textContent ?? '')
        expect(textos.filter((t) => /exclu|apag|remov|delet/i.test(t))).toEqual([])
        await clicar(host.querySelector(`[data-arquivar-motor="${M1}"]`))
        await clicar(confirmar())
        expect(pedidos.filter((p) => p.chave.startsWith('DELETE '))).toEqual([])
    })

    it('a tabela do fornecedor NÃO tem botão de arquivar: arquivar é da planilha', async () => {
        const host = await montar()
        expect(host.querySelector(`[data-tabela-do-motor="${T1}"] [data-arquivar-motor]`)).toBeNull()
    })
})

describe('(10) o CABEÇALHO das etapas e a planilha da família (27/10/2026)', () => {
    const MF = '00000000-0000-4000-8000-0000000000f9'
    const comResumo = (extra: Record<string, unknown>) => { respostas[`GET ${ROTAS_DO_MOTOR.resumo(CONTA)}`] = { status: 200, body: { ...RESUMO, ...extra } } }

    it('por família que a conta usa, um cartão ANTES das planilhas: etapa por etapa, o motor que aponta — ou "sem motor apontado"', async () => {
        comResumo({ etapas_das_familias: [{ familia: 'PVC', etapas: [{ numero: 1, rotulo: 'Apanhar', motor: { id: M1, arquivo_nome: 'Motor_Wolf_PVC.xlsm' } }, { numero: 2, rotulo: 'Confirmar', motor: null }] }] })
        const host = await montar()
        const cartao = host.querySelector('[data-etapas-da-familia="PVC"]') as HTMLElement
        expect(cartao).toBeTruthy()
        expect(cartao.textContent).toContain('Motores das etapas — PVC')
        expect(cartao.querySelector('[data-etapa-do-motor="1"]')!.textContent).toBe('Etapa 1 — Apanhar: Motor_Wolf_PVC.xlsm')
        expect(cartao.querySelector('[data-etapa-do-motor="2"]')!.textContent).toBe('Etapa 2 — Confirmar: sem motor apontado')
        // ANTES dos fornecedores: o cartão precede o da planilha no documento
        const planilha = host.querySelector(`[data-planilha-do-motor="${M1}"]`) as HTMLElement
        expect(cartao.compareDocumentPosition(planilha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('sem etapa cadastrada: nenhum cartão de etapas', async () => {
        const host = await montar()
        expect(host.querySelector('[data-etapas-da-familia]')).toBeNull()
    })

    it('a planilha da FAMÍLIA, sem fornecedor, aparece com o título "Da família", e não some nem vira "null"', async () => {
        comResumo({ planilhas: [{ ...RESUMO.planilhas[0], motor_id: MF, fornecedor: null, arquivo_nome: 'Motor PVC da família.xlsm', contas_usando: ['Esquadrias De Paula'] }] })
        const host = await montar()
        const cartao = host.querySelector(`[data-planilha-do-motor="${MF}"]`) as HTMLElement
        expect(cartao).toBeTruthy()
        expect(cartao.textContent).toContain('Da família — Motor PVC da família.xlsm')
        expect(cartao.textContent).not.toContain('null')
    })

    it('o par sem vigente de UMA categoria nomeia a categoria no aviso', async () => {
        comResumo({ avisos: { fornecedores_sem_tabela: [], pares_sem_vigente: [{ fornecedor: 'Wolff Perfis', familia: 'PVC', categoria: 'REFORCO', arquivos: ['Reforço 2026.xlsx', 'Reforço 2027.xlsx'] }], nenhuma_com_motor: false } })
        const host = await montar()
        expect(host.querySelector('[data-aviso="par-sem-vigente"]')!.textContent).toContain('categoria REFORCO')
    })
})
