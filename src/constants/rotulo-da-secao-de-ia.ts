/**
 * O RÓTULO VISÍVEL da seção de IA no menu — desktop (`nav.component.tsx`) e drawer mobile
 * (`mobile-more-drawer.component.tsx`), do super admin e das contas logadas.
 *
 * "Agentes I.A." desde 26/10/2026 (dono do produto); antes, "Atendimentos I.A.". Só o rótulo: a rota
 * (`/atendimentos-ia`), a chave da seção (`atendimentos-ia`), as pastas e as tabelas não mudaram. Uma
 * constante só porque o drawer usa o rótulo também como chave da ordem das seções: duas cópias que
 * divergissem fariam a seção sumir do drawer em silêncio.
 */
export const ROTULO_DA_SECAO_DE_IA = 'Agentes I.A.'
