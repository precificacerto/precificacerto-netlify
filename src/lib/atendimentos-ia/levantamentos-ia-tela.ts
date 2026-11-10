/** O contrato da lista dos Levantamentos I.A. entre a rota e a tela — puro, sem o cliente do servidor (a tela o importa). */
export type LinhaDoLevantamento = { id: string; numero: number; nome: string; estado: string; vendedor_nome: string | null; criado_em: string }

/** O estado como a tela o diz; o que não for um dos dois aparece como está gravado (nunca deduzido). */
export const ROTULO_DO_ESTADO: Readonly<Record<string, string>> = { COMPLETO: 'Completo', EM_MONTAGEM: 'Em montagem' }
