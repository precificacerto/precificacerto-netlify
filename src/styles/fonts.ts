/**
 * As fontes do produto são LOCAIS: os arquivos moram em `./fontes/` e o build não fala com o Google.
 *
 * Por quê (dono do produto, 04/11/2026): com `next/font/google` o `next build` baixava a Inter e a
 * Roboto do Google Fonts na hora, e uma resposta ruim do Google derrubou o CI da main (run 521,
 * `TypeError: Cannot read properties of null (reading '1')` no loader do next/font) e dois previews
 * na semana. Com `next/font/local` o build é reprodutível e não depende de rede.
 *
 * Os arquivos são os MESMOS bytes que o Google servia ao build (subconjunto `latin`, fonte variável,
 * woff2): a Inter v20 (md5 65850a373e258f1c897a2b3d75eb74de, igual ao arquivo que o build de
 * 04/11 emitiu em `.next/static/media`), e a Roboto v51 normal e itálica. Só o `latin` entra: é o
 * que a configuração anterior pedia (`subsets: ['latin']`) e cobre o português inteiro; os demais
 * alfabetos (latin-ext, cirílico, grego, vietnamita) caem na fonte do sistema, como texto fora da
 * Inter já caía.
 */
import localFont from 'next/font/local'

// O nome da família no CSS vem do identificador da constante: `Inter` e `Roboto`, como o Google
// servia (o `_app.tsx` aplica `fontFamily: "'Inter', …"` pelo nome).
const Inter = localFont({
  src: [{ path: './fontes/inter-latin.woff2', weight: '100 900', style: 'normal' }],
  display: 'swap',
  variable: '--font-inter',
})

// Keep Roboto for backward compatibility
const Roboto = localFont({
  src: [
    { path: './fontes/roboto-latin.woff2', weight: '100 900', style: 'normal' },
    { path: './fontes/roboto-latin-italico.woff2', weight: '100 900', style: 'italic' },
  ],
  display: 'swap',
})

export const inter = Inter
export const roboto = Roboto
