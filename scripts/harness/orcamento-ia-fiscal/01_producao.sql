-- O que a 20261109000004 lê de produção, como medido em 09/11/2026: os dois tipos de pricing_calculations e brazilian_states
-- (id integer PK, code character(2) NOT NULL com UNIQUE (code), name, icms_internal_rate; 27 linhas).
CREATE TYPE public.sale_scope AS ENUM ('INTRAESTADUAL', 'INTERESTADUAL');
CREATE TYPE public.buyer_type_enum AS ENUM ('CONSUMIDOR_FINAL', 'CONTRIBUINTE_PJ');
CREATE TABLE public.brazilian_states (
  id integer NOT NULL, code character(2) NOT NULL, name text NOT NULL, icms_internal_rate numeric NOT NULL, created_at timestamptz DEFAULT now(),
  CONSTRAINT brazilian_states_pkey PRIMARY KEY (id), CONSTRAINT brazilian_states_code_key UNIQUE (code));
INSERT INTO public.brazilian_states (id, code, name, icms_internal_rate)
  SELECT row_number() OVER (), c, c, 18 FROM unnest(string_to_array('AC,AL,AM,AP,BA,CE,DF,ES,GO,MA,MG,MS,MT,PA,PB,PE,PI,PR,RJ,RN,RO,RR,RS,SC,SE,SP,TO', ',')) AS c;
