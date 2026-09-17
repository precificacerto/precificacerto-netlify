/**
 * O NCM determina a alíquota de PIS/COFINS — e o que se afirma aqui é o NÚMERO.
 *
 * Por que este arquivo existe. A Parte A reagrupou a tela de produto em dois blocos e o
 * campo NCM mudou de bloco. As duas coisas que essa mudança pode quebrar EM SILÊNCIO são:
 * o save deixar de gravar `ncm_code`, e selecionar um NCM deixar de preencher a alíquota.
 * `teste-que-nao-exercita.md` é explícito sobre o que NÃO basta: *"afirmar que a prop chega
 * NÃO É afirmar que ela muda alguma coisa"* — e afirmar que o `Form.Item` está no JSX é
 * exatamente isso. O efeito é o percentual que aparece no campo.
 *
 * A conta foi extraída para `ncm-pis-cofins.ts` justamente por isso, seguindo o precedente
 * do `applyTotalACobrarToStep11`: *"quando a função não é exportada, exporte a função"*.
 * Aqui se afirma o EFEITO; o escopo do `<Form>` e os dois gatilhos ficam em
 * `o-ncm-mora-no-bloco-fiscal.test.tsx`.
 *
 * CADA CASO DISCRIMINA. Os três estados devolvem números DIFERENTES entre si — 9,25 no
 * Lucro Real, 3,0295 no Presumido e `null` fora dos dois. Um caso em que os três
 * coincidissem passaria verde com a função trocada por qualquer um deles.
 */
import {
  resolvePisCofinsPctFromNcm,
  PIS_COFINS_CUMULATIVO_PCT,
} from '@/utils/ncm-pis-cofins'

describe('o NCM determina a alíquota de PIS/COFINS', () => {
  describe('LUCRO REAL — não cumulativo: quem manda é o NCM', () => {
    it('soma PIS e COFINS da linha do NCM: 1,65% + 7,60% = 9,25%', () => {
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: true,
        isLucroPresumido: false,
        icmsPct: 17,
        ncmRow: { pis_rate_nao_cumulativo: 0.0165, cofins_rate_nao_cumulativo: 0.076 },
      })
      expect(pct).toBe(9.25)
    })

    it('SOMA as duas parcelas — não devolve só uma delas', () => {
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: true,
        isLucroPresumido: false,
        icmsPct: 17,
        ncmRow: { pis_rate_nao_cumulativo: 0.0165, cofins_rate_nao_cumulativo: 0.076 },
      })
      // O contraste é o que dá dente à asserção acima: 9,25 não é 1,65 nem 7,60.
      expect(pct).not.toBe(1.65)
      expect(pct).not.toBe(7.6)
    })

    it('o ICMS NÃO entra na conta do Lucro Real — mudar o ICMS não muda o resultado', () => {
      const args = {
        isLucroReal: true,
        isLucroPresumido: false,
        ncmRow: { pis_rate_nao_cumulativo: 0.0165, cofins_rate_nao_cumulativo: 0.076 },
      }
      expect(resolvePisCofinsPctFromNcm({ ...args, icmsPct: 17 })).toBe(9.25)
      expect(resolvePisCofinsPctFromNcm({ ...args, icmsPct: 12 })).toBe(9.25)
    })

    it('NCM de alíquota zero devolve 0 — que é APURADO, e não a ausência', () => {
      // `ausente-vs-falso.md`: aqui o zero é uma afirmação legítima sobre o mundo (cesta
      // básica, alíquota zero). É diferente do `null` do caso seguinte, e os dois não podem
      // colapsar no mesmo valor.
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: true,
        isLucroPresumido: false,
        icmsPct: 17,
        ncmRow: { pis_rate_nao_cumulativo: 0, cofins_rate_nao_cumulativo: 0 },
      })
      expect(pct).toBe(0)
      expect(pct).not.toBeNull()
    })

    it('sem linha de NCM devolve null — e null NÃO é zero', () => {
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: true,
        isLucroPresumido: false,
        icmsPct: 17,
        ncmRow: null,
      })
      expect(pct).toBeNull()
    })
  })

  describe('LUCRO PRESUMIDO — cumulativo: 3,65% com a base sem ICMS', () => {
    it('com ICMS de 17%: 3,65% × (1 − 0,17) = 3,0295%', () => {
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: false,
        isLucroPresumido: true,
        icmsPct: 17,
        ncmRow: null,
      })
      expect(pct).toBe(3.0295)
      // sem o desconto do ICMS sairia 3,65 — o contraste é a R5 em ação
      expect(pct).not.toBe(PIS_COFINS_CUMULATIVO_PCT)
    })

    it('com ICMS de 12%: 3,65% × (1 − 0,12) = 3,212%', () => {
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: false,
        isLucroPresumido: true,
        icmsPct: 12,
        ncmRow: null,
      })
      expect(pct).toBe(3.212)
    })

    it('o NCM NÃO decide nada no Presumido — a linha do NCM é ignorada', () => {
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: false,
        isLucroPresumido: true,
        icmsPct: 17,
        ncmRow: { pis_rate_nao_cumulativo: 0.0165, cofins_rate_nao_cumulativo: 0.076 },
      })
      expect(pct).toBe(3.0295)
      expect(pct).not.toBe(9.25)
    })
  })

  describe('fora dos dois regimes NÃO HÁ O QUE APURAR', () => {
    it('devolve null, e não zero — o campo fica como está, sem afirmar alíquota nenhuma', () => {
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: false,
        isLucroPresumido: false,
        icmsPct: 17,
        ncmRow: { pis_rate_nao_cumulativo: 0.0165, cofins_rate_nao_cumulativo: 0.076 },
      })
      expect(pct).toBeNull()
      // zero afirmaria "a alíquota é nada" e o save gravaria essa afirmação
      expect(pct).not.toBe(0)
    })
  })

  it('os três estados devolvem números DIFERENTES — é o que torna os casos discriminantes', () => {
    const ncmRow = { pis_rate_nao_cumulativo: 0.0165, cofins_rate_nao_cumulativo: 0.076 }
    const lr = resolvePisCofinsPctFromNcm({ isLucroReal: true, isLucroPresumido: false, icmsPct: 17, ncmRow })
    const lp = resolvePisCofinsPctFromNcm({ isLucroReal: false, isLucroPresumido: true, icmsPct: 17, ncmRow })
    const fora = resolvePisCofinsPctFromNcm({ isLucroReal: false, isLucroPresumido: false, icmsPct: 17, ncmRow })
    expect(new Set([String(lr), String(lp), String(fora)]).size).toBe(3)
  })
})
