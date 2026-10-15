# VeroVaz Ateliê — integrado ao V8 Admin Universal

Projeto reorganizado para uma estrutura simples na raiz, pronta para publicar os arquivos estáticos no Cloudflare Pages.

## Estrutura

- `index.html` — página inicial.
- `assets/` — imagens e identidade visual.
- `css/styles.css` — folha de estilos única; reúne os estilos base e os ajustes visuais que antes estavam separados em `redesign.css`, mantendo a ordem original da cascata.
- `js/` — aplicação, V8 Loader e módulos funcionais.
- `js/components/` — componentes específicos reutilizáveis, como carrossel e editor de imagem.
- `config/storefront-config.js` — endereço da API e ID do projeto usado pelo app legado da vitrine.
- `config/content.json` — conteúdo editorial/fallback ainda lido pelo app.
- `worker/` — artefatos de referência para integração do módulo Ateliê no Worker central do V8; não é um Worker de produção pronto para substituir o backend atual.
- `_headers` — cabeçalhos HTTP para Cloudflare Pages.
- `manifest.webmanifest` — metadados da experiência instalável.
- `INTEGRATION-AUDIT.md` — auditoria de integração e pontos que precisam ser confirmados no backend.

## Integração central

A página carrega `js/v8-loader.js` com o ID do projeto e mantém os caminhos públicos `/assets`, `/css`, `/js` e `/config`. O catálogo e os dados de projeto devem continuar centralizados no V8 Admin Universal. Não publique os arquivos de `worker/` por cima do Worker de produção sem comparar e integrar as rotas no backend existente.

## Publicação

Publique **o conteúdo desta pasta raiz** no Cloudflare Pages. Não use uma pasta `site/` como diretório de publicação. O `index.html` fica diretamente na raiz e os caminhos absolutos (`/assets/...`, `/css/...`, `/js/...`, `/config/...`) permanecem válidos.

## Limites desta limpeza

A limpeza reorganiza pastas e consolida CSS sem remover módulos funcionais. Os arquivos JavaScript foram mantidos separados porque têm responsabilidades distintas e são carregados em uma ordem definida no HTML. `storefront-config.js` e `content.json` também foram mantidos porque são formatos e funções diferentes; removê-los exige primeiro migrar todos os dados que o app ainda lê deles para o V8.
