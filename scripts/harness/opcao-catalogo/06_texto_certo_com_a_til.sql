-- HARNESS da opção no catálogo — um rótulo CORRETO com "Ã" maiúsculo. NÃO TOCA PRODUÇÃO.
-- Aplicado por `run.sh` só com TEXTO_CERTO_COM_A_TIL=1, depois de `05_como_em_producao.sql`. O texto
-- é certo: "VEDAÇÃO" tem "Ã" (U+00C3) seguido de "O", e não de um caractere de U+0080 a U+00BF — não é
-- mojibake, e a verificação 3a da migração tem de deixá-lo passar. Com a verificação antiga (chr(195)
-- sozinho), a migração abortava. O campo é NOVO, e de propósito: os 7 rótulos que a migração conserta
-- ela mesma reescreve, e um "Ã" posto neles sumiria antes da 3a.
INSERT INTO public.orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem)
VALUES ('PERFIL', 'harness_a_til', 'texto', 'VEDAÇÃO DAS FOLHAS', 99);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo WHERE rotulo = 'VEDAÇÃO DAS FOLHAS') THEN
    RAISE EXCEPTION 'o rótulo de teste não foi gravado';
  END IF;
END $$;
