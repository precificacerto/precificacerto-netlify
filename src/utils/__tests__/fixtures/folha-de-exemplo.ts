/**
 * O levantamento de EXEMPLO da folha A4 — dados fictícios (nenhum cliente real sai do tenant). As tipologias, as descrições e as linhas são as do
 * motor da Wolff (`fdff3386…`, medido em 06/11/2026); as variáveis são as da aba Variáveis de cada uma (AF da DP-04 = altura da bandeira; AF da
 * DP-05 = altura do peitoril; N e V das maxim-ar).
 *
 * O PDF em `docs/levantamento/exemplo-levantamento.pdf` é gerado daqui e conferido byte a byte pelo portão (`folha-do-levantamento.test.ts`).
 */
import type { DadosDaFolha, ItemDaFolha } from '@/lib/atendimentos-ia/folha-do-levantamento'

const BANDEIRA = 'ALTURA DA BANDEIRA'
const PEITORIL = 'ALTURA DO PEITORIL'
const N = 'QUANTIDADE DE MÓDULOS HORIZONTAIS'
const V = 'QUANTIDADE DE MÓDULOS VERTICAIS'
const PERFIL = 'Branco / padrão'

export const ITENS_DE_EXEMPLO: ItemDaFolha[] = [
    {
        ordem: 1, tipologia: 'DP-02', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', linha: 'PVC WOLFF EUROPA 42',
        quantidade: 3, largura_mm: 1500, altura_mm: 1200, variaveis: [], perfilEAcessorio: PERFIL, vidro: 'incolor 4 mm comum',
        ambientes: [{ ambiente: 'Quarto 1', quantidade: 1 }, { ambiente: 'Quarto 2', quantidade: 1 }, { ambiente: 'Escritório', quantidade: 1 }], obs: null,
    },
    {
        ordem: 2, tipologia: 'DP-04', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | BANDEIRA FIXA | EUROPA 42', linha: 'PVC WOLFF EUROPA 42',
        quantidade: 1, largura_mm: 2000, altura_mm: 1600, variaveis: [{ variavel: 'AF', descricao: BANDEIRA, valor: 400, semPadrao: true }],
        perfilEAcessorio: PERFIL, vidro: 'incolor 4 mm comum', ambientes: [{ ambiente: 'Sala', quantidade: 1 }], obs: 'Conferir prumo da parede antes da medição final.',
    },
    {
        ordem: 3, tipologia: 'DP-39', descricao: 'PORTA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', linha: 'PVC WOLFF EUROPA 42',
        quantidade: 1, largura_mm: 1600, altura_mm: 2150, variaveis: [], perfilEAcessorio: PERFIL, vidro: '8 mm temperado',
        ambientes: [{ ambiente: 'Sala', quantidade: 1 }], obs: null,
    },
    {
        ordem: 4, tipologia: 'DP-129', descricao: 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS | BANDEIRA FIXA | PERFIL MODULAÇÃO | EUROPA 60', linha: 'PVC WOLFF EUROPA 60',
        quantidade: 2, largura_mm: 1800, altura_mm: 900,
        variaveis: [{ variavel: 'AF', descricao: BANDEIRA, valor: 300, semPadrao: true }, { variavel: 'N', descricao: N, valor: 3, semPadrao: false }],
        perfilEAcessorio: PERFIL, vidro: 'mini boreal 4 mm', ambientes: [{ ambiente: 'Banheiro social', quantidade: 1 }, { ambiente: 'Lavabo', quantidade: 1 }], obs: null,
    },
    {
        ordem: 5, tipologia: 'DP-05', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | PEITORIL FIXO | EUROPA 42', linha: 'PVC WOLFF EUROPA 42',
        quantidade: 1, largura_mm: 1200, altura_mm: 1500, variaveis: [{ variavel: 'AF', descricao: PEITORIL, valor: 500, semPadrao: true }],
        perfilEAcessorio: PERFIL, vidro: 'incolor 4 mm comum', ambientes: [{ ambiente: 'Cozinha', quantidade: 1 }], obs: null,
    },
    {
        ordem: 6, tipologia: 'DP-141', descricao: 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E "V" MÓDULOS VERTICAIS | ALT IGUAIS | PERFIL COLUNA |EUROPA 60', linha: 'PVC WOLFF EUROPA 60',
        quantidade: 1, largura_mm: 1400, altura_mm: 1400,
        variaveis: [{ variavel: 'N', descricao: N, valor: 2, semPadrao: false }, { variavel: 'V', descricao: V, valor: 2, semPadrao: false }],
        perfilEAcessorio: PERFIL, vidro: 'incolor 4 mm comum', ambientes: null, obs: null,
    },
    {
        ordem: 7, tipologia: 'DP-165', descricao: 'PORTA OSCILO BATENTE 01 FOLHA | EUROPA 60', linha: 'PVC WOLFF EUROPA 60',
        quantidade: 1, largura_mm: 900, altura_mm: 2100, variaveis: [], perfilEAcessorio: PERFIL, vidro: '8 mm temperado',
        ambientes: [{ ambiente: 'Área de serviço', quantidade: 1 }], obs: 'Abertura para dentro, dobradiças à direita de quem entra.',
    },
]

export const FOLHA_DE_EXEMPLO: DadosDaFolha = {
    empresa: 'Esquadrias Exemplo Ltda',
    numero: 6,
    cliente: {
        nome: 'Ana Exemplo',
        telefone: '(51) 99999-0000',
        email: 'ana@exemplo.com.br',
        edificacao: 'Sobrado, dois pavimentos',
        endereco: 'Rua das Acácias, 120, Bairro Jardim, Montenegro/RS',
        obsObra: 'Obra em acabamento; acesso pela lateral.',
        dataEntrega: '2026-11-27',
    },
    itens: ITENS_DE_EXEMPLO,
    preDefinicoes: [
        { rotulo: 'Cor do perfil', valor: 'Branco' },
        { rotulo: 'Arremate e guarnição', valor: 'padrão' },
        { rotulo: 'Vedação', valor: 'padrão' },
    ],
    condicoes: {
        vendedor: 'Vendedor Exemplo', comissaoPercentual: 5, comissaoModo: 'PROPORCIONAL',
        rtResponsavel: 'Arq. Paula Exemplo', rtPercentual: 1, lucroPercentual: 10,
    },
    geradoEm: new Date(Date.UTC(2026, 10, 6, 17, 30, 0)),
}
