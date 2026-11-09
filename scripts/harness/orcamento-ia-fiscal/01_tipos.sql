-- Os dois tipos como estão em produção (medido em 09/11/2026): os de pricing_calculations.
CREATE TYPE public.sale_scope AS ENUM ('INTRAESTADUAL', 'INTERESTADUAL');
CREATE TYPE public.buyer_type_enum AS ENUM ('CONSUMIDOR_FINAL', 'CONTRIBUINTE_PJ');
