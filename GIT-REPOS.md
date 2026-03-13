# Por que aparecem "2 changes" no Source Control?

Você está vendo **duas áreas de "Changes"** porque existem **dois repositórios Git** no workspace:

1. **Repositório raiz** ("Precifica certo")  
   - Contém toda a pasta do projeto, incluindo a pasta `web-app`.
   - As alterações aqui aparecem como algo como: `web-app` modificado (quando há mudanças dentro de `web-app`).

2. **Repositório dentro de web-app** ("web-app Git")  
   - A pasta `web-app` tem seu **próprio** `.git` (foi inicializada como repositório ou é um submodule).
   - As alterações nos arquivos dentro de `web-app` aparecem neste segundo repositório.

Você está na **mesma branch** (`Precifica-certo-merge-matheus-duarte`) nos dois, mas cada um tem seu histórico e seus commits.

## Como ter só "1 change" (um repositório)

Se você **não** precisa que `web-app` seja um projeto Git separado:

1. **Remover o Git de dentro de web-app** (tudo passa a ser commitado só no repositório raiz):
   - Faça backup ou commit do que precisar dentro de `web-app`.
   - Delete a pasta `web-app\.git` (no Windows: pode ser necessário mostrar pastas ocultas).
   - A partir daí, todas as alterações de `web-app` aparecerão apenas no repositório "Precifica certo".

2. **Ou manter os dois** e fazer **dois commits** quando mudar algo em `web-app`:
   - Um commit no repositório "web-app Git".
   - Um commit no repositório raiz (que verá `web-app` como alterado, se for submodule, ou os arquivos se não for).

Se `web-app` foi colocado como **submódulo** de propósito, o fluxo normal é ter os dois repositórios e commitar em cada um quando fizer alterações em cada parte.
