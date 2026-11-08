/**
 * O ARQUIVO DO MOTOR CORRIGIDO (dono do produto, 08/11/2026): a coluna Cor VAZIA nos três perfis da aba Perfis cuja única variante não é
 * cor — BZ0012/WOLFF ('CLICK', o tipo de encaixe) e os reforços 8523/WOLFF e 8434/WOLFF ('AÇO GALVANIZADO…') — medidos no motor da Wolff
 * em produção em 08/11/2026. O PO limpa a coluna no arquivo e sobe por "Trocar arquivo"; a célula vazia é "sem variante", e o perfil serve
 * a qualquer cor, como deve.
 *
 * Os recortes de produção (`fixture_de-para_DP-02.json`, `caso-gerson-boss.json`) ficam COMO ESTÃO — conferidos por md5 contra o banco —, e
 * os testes que modelam o motor depois da correção passam por aqui. Os que modelam o motor de HOJE (a coluna com 'CLICK') leem o recorte
 * direto, e provam que, até a correção entrar, o levantamento com arremate interno recusa nomeando o BZ0012.
 *
 * É dado do teste, não do código: o código do sistema não conhece perfil nenhum de fornecedor.
 */
export const PERFIS_LIMPOS_NO_ARQUIVO_CORRIGIDO: readonly string[] = ['BZ0012/WOLFF', '8523/WOLFF', '8434/WOLFF']

/** As regras como ficam com o arquivo corrigido: a cor desses três perfis vazia, o resto como veio. */
export function comACorLimpa<T extends Record<string, unknown>>(regras: readonly T[]): T[] {
    return regras.map((r) => (PERFIS_LIMPOS_NO_ARQUIVO_CORRIGIDO.includes(String(r.codigo_wvetro)) ? { ...r, cor: null } : r))
}
