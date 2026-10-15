# Alquimia Ateliê — pacote de integração com V8 Admin Universal

## Arquitetura desejada

Este projeto não deve operar como loja independente. O V8 Admin Universal é a fonte central de configurações, catálogo, preços, categorias, promoções, pedidos e integrações disponíveis no painel. O site público apresenta a loja e consome as APIs do V8.

- **Cloudflare D1**: registros estruturados e referências a arquivos.
- **Cloudflare R2**: arquivos binários, imagens enviadas pelos clientes e artes privadas. O R2 não substitui o D1 como banco relacional.
- **V8 Loader**: integração central de configurações/rastreamento já existente. Não adicionar Pixel ou Analytics em duplicidade.
- **Site público**: interface visual e componentes específicos da experiência do Ateliê.

## Conteúdo do pacote

- `site/`: arquivos do site público para Cloudflare Pages.
- `integration/worker/atelier.js`: rotas e regras específicas da experiência de personalização do Ateliê.
- `integration/worker/atelier-schema.sql`: tabelas específicas necessárias ao fluxo de personalização; não é um dump completo do D1.
- `integration/worker/atelier-seed.sql`: configurações iniciais específicas.
- `integration/worker/index.integration.diff`: alterações de referência para mesclar no Worker central.
- `integration/worker/index.integrated-reference.js`: referência de integração baseada na versão de Worker incluída no pacote original. **Não publique este arquivo por cima do Worker atual sem comparar as versões.**
- `integration/worker/wrangler.snippet.toml`: binding R2 e notas de configuração; é um trecho, não um `wrangler.toml` completo.
- `INTEGRATION-AUDIT.md`: auditoria dos limites conhecidos e verificações antes de produção.

## Configuração atualmente presente no site

O site ainda carrega `site/config/storefront-config.js` e `site/config/content.json`. O primeiro contém a URL base da API e o ID do projeto; o segundo contém conteúdo editorial e caminhos de imagens de apresentação. O `app.js` ainda lê `content.json` como fallback e consome `/atelier/config` para algumas configurações.

Esses arquivos não devem ser apagados até que o Worker central entregue os mesmos campos e a aplicação tenha sido adaptada e testada para consumi-los. Removê-los agora às cegas pode deixar a página sem configuração ou conteúdo. A remoção definitiva deve ocorrer depois de validar o contrato da API do V8.

## Requisitos de integração

1. Confirme que o projeto `1b356c5c-c50d-4c4e-a16b-f3f3bafd2e45` existe no V8 Admin Universal.
2. Cadastre os produtos no catálogo central do V8. O site não deve manter uma lista paralela de produtos/preços.
3. Crie o bucket privado `alquimia-artworks` no Cloudflare R2 e configure o binding `ATELIER_R2` no Worker central.
4. Confirme que o binding D1 utilizado pelo Worker é `V8_D1` antes de aplicar SQL. Não crie outro D1 para o Ateliê.
5. Revise `atelier-schema.sql` e execute-o no D1 existente apenas após backup e validação de compatibilidade.
6. Mescle as rotas de `atelier.js` no Worker central com base em `index.integration.diff`. Não substitua o Worker de produção pela referência integral sem comparar o código atual.
7. Configure os secrets necessários no Worker, incluindo `MP_ACCESS_TOKEN` e, quando aplicável, `MP_WEBHOOK_SECRET`. Nunca coloque credenciais no JavaScript público.
8. Mescle o cron de limpeza com os crons existentes; não remova tarefas agendadas do V8.
9. Teste catálogo, upload para R2, carrinho, cotação de frete, checkout, webhook, atualização de pagamento e acesso administrativo em ambiente de teste.

## Importante

Este ZIP contém os arquivos do Ateliê e uma referência de integração, mas não inclui o backend atual independente do V8 Admin Universal fornecido separadamente. Portanto, ele não comprova que as rotas estejam implantadas no Worker de produção nem que todos os campos do painel já estejam disponíveis para o site. A integração final exige comparar este pacote com o Worker e o `wrangler.toml` atualmente publicados.
