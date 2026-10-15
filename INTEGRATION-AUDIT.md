# Auditoria de estrutura e integração — VeroVaz Ateliê

## Reorganização aplicada

- O conteúdo público foi movido de `site/` para a raiz do projeto.
- Os caminhos de URL continuam `/assets/`, `/css/`, `/js/` e `/config/`, compatíveis com publicação da raiz no Cloudflare Pages.
- `css/styles.css` agora contém, em sequência, o conteúdo de `styles.css` e `redesign.css`. O segundo arquivo foi removido após a consolidação, preservando a ordem da cascata.
- Os módulos JS foram mantidos separados para não alterar dependências nem ordem de execução.
- Os arquivos de integração do backend foram movidos de `integration/worker/` para `worker/`.

## Fatos do projeto

- `index.html` carrega `js/v8-loader.js` com o ID do projeto e carrega `js/app.js`.
- `js/app.js` consulta a API configurada para produtos e configurações do Ateliê.
- `js/app.js` ainda lê `config/content.json` como conteúdo editorial/fallback.
- `config/storefront-config.js` contém a URL base da API e o ID do projeto usado pelo app.
- `js/private-cart.js` e `js/components/image-editor.js` suportam funcionalidades específicas de carrinho e personalização; foram preservados.
- `worker/` contém referências de integração, schema, seed e um snippet de Wrangler. Não é o backend de produção completo do V8.

## Não removido intencionalmente

- `config/content.json`: ainda é lido pelo app. Apagá-lo agora pode quebrar conteúdo editorial e páginas informativas.
- `config/storefront-config.js`: ainda é usado para configuração da API/projeto no app atual. Removê-lo requer alteração coordenada no código.
- Arquivos JS separados: preservam a ordem de carregamento e evitam regressões em carrinho, domínio, editor e carrossel.
- `worker/index.integrated-reference.js` e `worker/index.integration.diff`: são artefatos de referência diferentes; um é referência completa e o outro é um diff para integração. Nenhum substitui automaticamente o Worker de produção.

## Verificações pendentes

- Testar em Cloudflare Pages os caminhos de recursos após publicar a raiz.
- Confirmar no site publicado que o V8 Loader entrega o WhatsApp no formato esperado.
- Integrar/testar as rotas de Ateliê no Worker de produção com o ZIP atual do backend central.
