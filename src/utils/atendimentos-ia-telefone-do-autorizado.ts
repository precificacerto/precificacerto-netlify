/** Esqueleto — a implementação vem no commit seguinte. */
export type TelefoneDoAutorizado = { ok: true; telefone: string } | { ok: false; motivo: string }
export function telefoneDoAutorizado(_bruto: string | null | undefined): TelefoneDoAutorizado { return { ok: false, motivo: 'não implementado' } }
export function telefoneMascarado(t: string): string { return t }
