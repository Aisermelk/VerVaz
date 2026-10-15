# Auditoria de integração — Alquimia Ateliê

## Objetivo confirmado

O site público é dependente do V8 Admin Universal. Não deve manter uma administração paralela de produtos, preços, categorias, promoções, pagamentos, Pixel, Analytics ou dados de clientes que já sejam administrados pelo V8. O R2 armazena imagens/arquivos; o D1 mantém registros e referências.

## O que foi confirmado nos arquivos deste pacote

- `site/index.html` carrega `site/js/v8-loader.js` e `site/js/app.js`.
- O Loader usa o ID de projeto `1b356c5c-c50d-4c4e-a16b-f3f3bafd2e45`.
- `site/js/app.js` consulta `GET /products` e `GET /atelier/config` na API configurada.
- `site/js/app.js` ainda carrega `/config/content.json` como conteúdo editorial/fallback.
- `site/config/storefront-config.js` contém `apiBaseUrl` e `tenantId` usados pelo app.
- `integration/worker/atelier.js` usa `env.V8_D1` para registros e `env.ATELIER_R2` para arquivos privados.
- O módulo específico do Ateliê possui tabelas para sessões, artes, pedidos personalizados, itens, cotações e configurações específicas. Isso não é o mesmo que duplicar o catálogo geral do V8: são dados operacionais do fluxo de personalização. Ainda assim, devem ser comparados ao modelo atual do backend antes de implantação.

## Arquivos que não devem ser removidos sem adaptação

- `site/config/storefront-config.js`: ainda é lido por `app.js` para definir API e projeto.
- `site/config/content.json`: ainda é carregado diretamente por `app.js`; o backend atual precisa fornecer todos os campos necessários antes que esse fallback possa ser removido.
- `site/js/private-cart.js` e `site/js/components/image-editor.js`: suportam carrinho privado e personalização; não são substitutos de catálogo central, mas componentes funcionais específicos.
- `integration/worker/atelier-schema.sql`: só deve ser aplicado depois de comparar as tabelas com o D1 de produção e fazer backup.
- `integration/worker/index.integrated-reference.js`: referência para comparação/merge, não arquivo para substituição automática do Worker publicado.

## Itens ainda pendentes para afirmar integração completa

1. Comparar o módulo com o Worker atual em produção e resolver diferenças de rotas, autenticação, CORS, bindings e crons.
2. Confirmar o contrato de resposta do catálogo central (`GET /products`) e o mapeamento dos campos de imagem, preço, status e categorias.
3. Confirmar quais configurações de conteúdo, WhatsApp, redes sociais, SEO, Pixel e Analytics o V8 entrega para esse projeto; remover os fallbacks locais apenas depois disso.
4. Confirmar a política de acesso ao R2: bucket privado, uploads validados, acesso a artes restrito e URLs temporárias quando necessário.
5. Testar fluxo completo em ambiente de teste antes de publicar.

## Resultado

O pacote foi organizado e sua documentação foi alinhada à arquitetura centralizada V8 + D1 + R2. Não se declara implantação final nem remoção de todos os arquivos redundantes porque o Worker atual de produção não faz parte deste ZIP e a API efetivamente publicada precisa ser comparada antes de apagar configurações ainda usadas pelo frontend.
