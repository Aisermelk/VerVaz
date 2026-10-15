# Alquimia Ateliê (VeroVaz) — v1 no V8 Admin Universal

Site com loja + editor de azulejo personalizado. `site/` vai para o Cloudflare Pages; `worker/atelier.js` entra no Worker `v8adminuniversal`.

## 1) Backend (Worker)
1. Copie `worker/atelier.js` para a pasta `worker/` do repositório `v8adminuniversal`.
2. D1: `npx wrangler d1 execute v8adminuniversal-db --remote --file=worker/schema.sql` e depois `--file=worker/seed.sql`.
3. R2: `npx wrangler r2 bucket create alquimia-artworks` e adicione o trecho de `worker/wrangler.snippet.toml` ao `wrangler.toml`.
4. No `fetch()` do Worker, **antes das suas rotas**:
   ```js
   import { handleAtelier, cleanupAtelier } from './atelier.js';
   // ...
   const at = await handleAtelier(request, env, { isAdmin: req => SUA_VALIDACAO_ADMIN(req, env) });
   if (at) return at;
   ```
   e no `scheduled()`: `ctx.waitUntil(cleanupAtelier(env));`
   Se o binding do D1 não se chama `DB`, passe `{ ...env, DB: env.SEU_BINDING }`.
5. Secrets: `MP_ACCESS_TOKEN` (obrigatório p/ checkout), `MP_WEBHOOK_SECRET`, `MELHOR_ENVIO_TOKEN`.
6. No painel do Mercado Pago, o webhook de pagamentos aponta para
   `https://v8adminuniversal.aisermelk.workers.dev/atelier/webhooks/mercadopago?tenant=alquimia`.

## 2) Configurar a loja (antes de vender)
- **Preço dos azulejos** (ficam `NULL` no seed): `PUT /api/atelier/admin/products/azulejo-15x20` com `Authorization: Bearer ...` ou o `UPDATE` comentado no `seed.sql`.
- **Frete**: Melhor Envio (`originPostalCode` em settings + secret) **ou** `flatShipping` em settings (exemplo no `seed.sql`).
- **Textos** (FAQ, entrega, trocas…), contato e redes: `PUT /api/atelier/admin/settings` com `editorialPages`, `contact`, `instagramUrl`, `whatsAppUrl`, `siteUrl`, `homeImages`.

## 3) Front (Pages)
Suba `site/` num repositório GitHub, conecte no Cloudflare Pages (build vazio, diretório de saída = raiz) e aponte `alquimiaatelie.com.br`. Inclua o domínio em `ATELIER_ALLOWED_ORIGINS`.

## Integração V8 Loader
- O `site/index.html` declara o projeto `1b356c5c-c50d-4c4e-a16b-f3f3bafd2e45` e carrega `site/js/v8-loader.js` com `data-catalog="true"` e `data-style="off"`.
- O Loader disponibiliza `window.V8.ready`, `window.V8.config` e `window.V8.catalog` sem substituir o catálogo/carrinho próprios da loja. O storefront continua consumindo as rotas `/products` e `/atelier/config` do módulo Atelier.

## Limitações conhecidas desta versão
- Telas do painel admin (produtos/pedidos/artes): a API admin existe (`/api/atelier/admin/*`), mas a UI específica do Atelier ainda não está neste ZIP. O arquivo está em `site/js/v8-loader.js`.
- Arquivos referenciados e ausentes no zip original: `verovaz-sublogo-onde-memorias-viram-arte.png` (header) e o símbolo/favicon definitivos.
- Estoque é baixado quando o pagamento é aprovado (azulejos personalizados não baixam estoque).
