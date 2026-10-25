-- HARNESS do catálogo de categorias — um rótulo CORRETO com "Ã" maiúsculo. NÃO TOCA PRODUÇÃO.
-- Aplicado por `run.sh` só com TEXTO_CERTO_COM_A_TIL=1. O texto é certo: "VEDAÇÃO" tem "Ã" (U+00C3)
-- seguido de "O", e não de um caractere de U+0080 a U+00BF — não é mojibake, e a verificação 2 da
-- migração tem de deixá-lo passar. Com a verificação antiga (chr(195) sozinho), a migração abortava.
UPDATE public.orcamentista_categoria_campo SET rotulo = 'VEDAÇÃO DAS FOLHAS'
 WHERE categoria_chave = 'ACESSORIOS_VEDACAO' AND chave = 'vedacao';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo WHERE rotulo = 'VEDAÇÃO DAS FOLHAS') THEN
    RAISE EXCEPTION 'o rótulo de teste não foi gravado: o campo ACESSORIOS_VEDACAO.vedacao não existe nesta base';
  END IF;
END $$;
