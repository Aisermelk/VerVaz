(async function() {
    'use strict';
    const D = window.AtelieDomain;
    const root = document.getElementById('app');
    const runtime = window.__ALQUIMIA_ATELIE_STOREFRONT__ ?? {};
    const host = location.hostname;
    const tenantFromHost = !['localhost', '127.0.0.1'].includes(host) && runtime.rootDomain && host.endsWith(`.${runtime.rootDomain}`) ?
        host.slice(0, -(runtime.rootDomain.length + 1)).split('.')[0] : null;
    const tenant = runtime.tenantId ?? tenantFromHost ?? runtime.localTenantId ?? 'demo';
    const api = (runtime.apiBaseUrl ?? 'http://localhost:8080').replace(/\/$/, '');
    const $ = selector => root.querySelector(selector);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
    const money = cents => cents === null ? 'Preço a cadastrar' : new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(cents / 100);
    const id = () => crypto.randomUUID();
    const initialDraft = () => ({
        imageId: null,
        sizeId: '10x20',
        orientation: 'portrait',
        rotation: 0,
        zoom: 1,
        x: 50,
        y: 50,
        confirmedAt: null,
        rightsConsent: false
    });
    const state = {
        products: [],
        loading: true,
        error: '',
        content: {
            pages: {}
        },
        variants: [],
        productDetails: {},
        draft: initialDraft(),
        cart: [],
        cep: '',
        search: '',
        category: '',
        minPrice: '',
        maxPrice: '',
        inStock: false,
        uploadMessage: '',
        notice: '',
        storageWarning: '',
        quote: null,
        shippingMessage: '',
        quoteLoading: false,
        readyQuantity: 1
    };
    const assets = new Map();

    function previewUrl(item) {
        return assets.get(item.personalization ?.previewId) ?.url || '';
    }
    const privateCart = window.VeroVazPrivateCart ? new window.VeroVazPrivateCart(api, tenant) : null;
    let restoredSession = false;
    let disposeHero = () => {},
        disposeEditor = () => {};
    let database, uploadRevision = 0,
        quoteRevision = 0,
        quoteAbort, saveQueue = Promise.resolve();
    const cropRects = {
        plate: [538, 0, 341, 401],
        tile: [650, 410, 214, 253],
        mug: [875, 410, 181, 253],
        baby: [1064, 410, 188, 253],
        travel: [645, 721, 204, 217],
        family: [355, 835, 280, 290],
        pet: [493, 563, 110, 95],
        packaging: [0, 833, 348, 293],
        author: [884, 0, 366, 401]
    };

    function referencePhoto(key, className = '', label = '') {
        // Usa imagens que realmente acompanham o ZIP; evita referências quebradas a arquivos ausentes.
        const examples = {
            baby: '/assets/home/gift.webp',
            pet: '/assets/home/detail.webp',
            tile: '/assets/home/tile.webp',
            family: '/assets/home/phone.webp'
        };
        const src = examples[key] || examples.tile;
        const alt = label || ({
            baby: 'Inspiração de presente artesanal',
            pet: 'Detalhe decorativo em tons naturais',
            tile: 'Azulejo personalizado com paisagem',
            family: 'Imagem de inspiração para personalização'
        }[key] || 'Inspiração VeroVaz');
        return `<div class="reference-photo ${className}" role="img" aria-label="${escape(alt)}"><img src="${src}" alt="${escape(alt)}" loading="lazy"></div>`;
    }
    // Approved v5 artwork: fixed viewports preserve the native photo proportions.
    function cleanPhoto(key, label, eager = false) {
        const rects = {
            hero: [522, 197, 502, 323],
            tile: [37, 538, 189, 190],
            plate: [238, 538, 189, 190],
            mug: [428, 538, 189, 190],
            decor: [613, 538, 189, 190],
            gift: [803, 538, 189, 190],
            phone: [341, 872, 212, 128],
            editor: [566, 872, 212, 128],
            box: [782, 872, 212, 128],
            detail: [0, 1115, 535, 215]
        };
        const [x, y, w, h] = rects[key];
        const replacement = safeImage(state.content.homeImages ?.[key]);
        if (replacement) return `<div class="v5-photo custom-photo photo-${key}" style="aspect-ratio:${w}/${h}"><img src="${escape(replacement)}" alt="${escape(label)}" loading="${eager ? 'eager' : 'lazy'}"></div>`;
        return `<div class="v5-photo photo-${key}" style="aspect-ratio:${w}/${h}"><img src="/assets/home/${key}.webp" alt="${escape(label)}" width="${w}" height="${h}" loading="${eager ? 'eager' : 'lazy'}"></div>`;
    }

    function lineIcon(name) {
        const paths = {
            truck: '<path d="M2 5h12v12H2zM14 9h4l4 4v4h-8"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
            heart: '<path d="M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6Z"/>',
            shield: '<path d="m12 2 9 4v7c0 5-9 9-9 9S3 18 3 13V6Z"/><path d="m7 12 3 3 6-7"/>',
            gift: '<path d="M3 9h18v4H3zM5 13v9h14v-9M12 9v13"/><path d="M12 9C1 9 5-1 10 4l2 5c11 0 7-10 2-5Z"/>',
            diamond: '<path d="M2 8 7 2h10l5 6-10 14ZM2 8h20M7 2l5 20 5-20M7 8l5-6 5 6"/>',
            whatsapp: '<path d="M5 20 2 22l1-6a10 10 0 1 1 4 5"/><path d="M8 7c-2 3 3 9 7 9l2-3-3-1-1 2-3-3 1-2Z"/>',
            instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="18" cy="6" r=".6"/>'
        };
        return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.heart}</svg>`;
    }

    // O WhatsApp é sempre obtido da configuração central do projeto no V8 Loader.
    // Não usa socialLinks/content.json nem a configuração específica do módulo Ateliê como fallback.
    function loaderWhatsAppHref() {
        const raw = String(window.V8?.field?.('contact.whatsapp') ?? window.V8?.config?.contact?.whatsapp ?? '').trim();
        if (!raw) return '';
        if (/^https?:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(raw)) return raw;
        let number = raw.replace(/\D/g, '');
        if (!number) return '';
        if (number.length <= 11) number = '55' + number;
        return `https://wa.me/${number}`;
    }

    function socialLink(name) {
        if (name === 'whatsapp') return loaderWhatsAppHref();
        return safeImage(state.content.socialLinks ?.find(link => link.label ?.toLowerCase() === name) ?.url);
    }

    function floatingWhatsApp() {
        const href = loaderWhatsAppHref();
        if (!href) return '';
        return `<a class="v8-whatsapp-float" href="${escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="Conversar com a VeroVaz pelo WhatsApp" title="Fale conosco pelo WhatsApp" data-v8-event="Contact" data-v8-event-label="WhatsApp flutuante"><svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M16.04 3C8.87 3 3.04 8.78 3.04 15.9c0 2.28.61 4.5 1.77 6.46L3 29l6.85-1.78a13.1 13.1 0 0 0 6.19 1.55h.01c7.16 0 13-5.79 13-12.9 0-3.45-1.36-6.69-3.83-9.13A12.9 12.9 0 0 0 16.04 3Zm0 23.57c-1.92 0-3.8-.51-5.44-1.49l-.39-.23-4.07 1.06 1.09-3.95-.26-.41a10.7 10.7 0 0 1-1.65-5.65c0-5.9 4.83-10.7 10.73-10.7 2.86 0 5.55 1.11 7.57 3.13a10.6 10.6 0 0 1 3.14 7.56c0 5.9-4.81 10.68-10.72 10.68Zm5.88-8.01c-.32-.16-1.91-.94-2.21-1.05-.3-.11-.51-.16-.73.16-.21.32-.83 1.05-1.02 1.27-.19.21-.38.24-.7.08-.32-.16-1.35-.5-2.57-1.59-.95-.84-1.59-1.88-1.78-2.2-.19-.32-.02-.49.14-.65.14-.14.32-.38.48-.56.16-.19.21-.32.32-.54.11-.21.05-.4-.03-.56-.08-.16-.73-1.75-1-2.4-.26-.62-.53-.54-.73-.55h-.62c-.21 0-.56.08-.86.4-.3.32-1.13 1.1-1.13 2.67s1.16 3.1 1.32 3.32c.16.21 2.28 3.47 5.52 4.87.77.33 1.37.53 1.84.68.77.24 1.47.21 2.02.13.62-.09 1.91-.78 2.18-1.54.27-.75.27-1.4.19-1.54-.08-.14-.3-.22-.62-.38Z"/></svg><span>Fale conosco</span></a>`;
    }

    function safeImage(url) {
        if (typeof url !== 'string' || !url.trim()) return '';
        try {
            const parsed = new URL(url, location.origin);
            return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
        } catch {
            return '';
        }
    }

    function icon(name) {
        const paths = {
            search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
            account: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
            cart: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
            menu: '<path d="M3 6h18M3 12h18M3 18h18"/>'
        };
        return `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true">${paths[name]}</svg>`;
    }

    function brand(footer = false) {
        return `<a href="#inicio" class="brand brand-approved ${footer ? 'brand-footer' : ''}" aria-label="VeroVaz Ateliê & Decoração, início"><img src="/assets/brand/logo-verovaz.jpeg" alt="VeroVaz Ateliê & Decoração" width="1600" height="800"></a>`;
    }

    function route() {
        return location.hash.slice(1) || 'inicio';
    }

    function publicPrice(variant) {
        return D.toCents(variant ?.price);
    }

    function variant() {
        if (state.draft.modelProductId) {
            const product = state.products.find(p => p.id === state.draft.modelProductId),
                details = state.productDetails[state.draft.modelProductId];
            return product && details ?.print ? {
                productId: product.id,
                price: product.price,
                active: product.active && product.stock > 0,
                minimumDpi: details.print.minimumDpi,
                productionDays: details.productionDays,
                print: details.print,
                name: product.name
            } : null;
        }
        return state.variants.find(item => item.sizeId === state.draft.sizeId);
    }

    function currentProduct() {
        return state.products.find(item => item.id === route().split('/')[1]);
    }

    function currentLines() {
        if (['carrinho', 'checkout'].includes(route())) return state.cart;
        if (route().startsWith('personalize')) return [{
            id: 'preview',
            productId: variant() ?.productId,
            quantity: 1,
            unitCents: publicPrice(variant()),
            personalization: {
                sizeId: state.draft.modelProductId ? null : state.draft.sizeId
            }
        }];
        const product = currentProduct();
        return product ? [{
            id: product.id,
            productId: product.id,
            quantity: state.readyQuantity,
            unitCents: D.toCents(product.price)
        }] : [];
    }

    function button(text, href, secondary = false) {
        return `<a class="button ${secondary ? 'secondary' : ''}" href="${href}">${text}<span aria-hidden="true">↗</span></a>`;
    }

    function render() {
        disposeHero();
        disposeEditor();
        const currentRoute = route();
        if (currentRoute.startsWith('personalize')) {
            const modelId = currentRoute.split('/')[1] || null;
            if (modelId !== (state.draft.modelProductId ?? null)) {
                state.draft = { ...initialDraft(),
                    modelProductId: modelId,
                    sizeId: modelId ? `model:${modelId}` : '10x20'
                };
            }
        }
        let page;
        if (currentRoute.startsWith('personalize')) page = personalization();
        else if (currentRoute.startsWith('produtos')) page = catalog();
        else if (currentRoute.startsWith('produto/')) page = productPage();
        else if (currentRoute === 'colecao') page = collectionPage();
        else if (currentRoute === 'historia') page = historyPage();
        else if (currentRoute === 'carrinho') page = cartPage();
        else if (currentRoute === 'checkout') page = checkoutPage();
        else if (currentRoute.startsWith('pedido/')) page = orderPage();
        else if (currentRoute === 'conta') page = accountPage();
        else if (currentRoute.startsWith('pagina/')) page = editorialPage();
        else page = home();
        root.innerHTML = `<a class="skip-link" href="#main-content">Pular para o conteúdo</a>
      <div class="brand-strip"><span>${lineIcon('truck')} Envio seguro para todo o Brasil</span><span>Personalização • Decoração • Presentes • Qualidade em cada detalhe</span>${socialLink('whatsapp') ? `<a href="${escape(socialLink('whatsapp'))}" target="_blank" rel="noopener noreferrer">${lineIcon('whatsapp')} Atendimento via WhatsApp</a>` : `<a href="#pagina/contato">${lineIcon('whatsapp')} Fale com o ateliê</a>`}</div>
      <header class="site-header shell"><form class="header-search" id="header-search" role="search"><button class="icon-button" aria-label="Buscar produtos">${icon('search')}</button><input name="query" type="search" aria-label="O que você está buscando?" placeholder="O que você está buscando?" value="${escape(state.search)}"></form>${brand()}<nav class="desktop-nav" aria-label="Principal">${navigation(currentRoute)}</nav><div class="header-actions"><button class="icon-button compact-search" data-action="search" aria-label="Buscar produtos">${icon('search')}</button><a class="icon-button" href="#conta" aria-label="Conta e acompanhamento de pedidos">${icon('account')}</a><a class="icon-button cart-icon" href="#carrinho" aria-label="Carrinho, ${state.cart.reduce((sum, item) => sum + item.quantity, 0)} itens">${icon('cart')}<span>${state.cart.reduce((sum, item) => sum + item.quantity, 0)}</span></a><button class="icon-button mobile-toggle" data-action="menu" aria-label="Abrir menu" aria-controls="mobile-nav" aria-expanded="false">${icon('menu')}</button></div><nav class="mobile-nav" id="mobile-nav" aria-label="Navegação móvel" hidden>${navigation(currentRoute)}</nav></header>
      ${state.storageWarning ? `<div class="inline-notice shell" role="status">${escape(state.storageWarning)}</div>` : ''}
      ${state.notice ? `<div class="inline-notice shell" role="status">${escape(state.notice)} <button data-action="dismiss" class="text-button">Fechar</button></div>` : ''}
      <main id="main-content" tabindex="-1">${page}</main>${footer()}${floatingWhatsApp()}`;
        bind();
        if (currentRoute.startsWith('personalize') && (!state.draft.modelProductId || variant() ?.print)) drawPreview();
    }

    function navigation(current) {
        return [
            ['inicio', 'Início'],
            ['personalize', 'Personalização'],
            ['produtos', 'Produtos'],
            ['produtos/decoracao', 'Decoração'],
            ['produtos/presentes', 'Presentes'],
            ['colecao', 'Coleções'],
            ['historia', 'Sobre Nós']
        ].map(([href, label]) => `<a href="#${href}" ${current === href ? 'aria-current="page"' : ''}>${label}</a>`).join('');
    }
    const categoryContent = [
        ['azulejos', 'Azulejos', 'Imagens que encontram um lugar especial na sua casa.', 'tile'],
        ['decoracao', 'Decoração', 'Vasos, cordões e objetos para compor o seu espaço.', 'frame'],
        ['pratos', 'Pratos', 'Detalhes para decorar, personalizar e presentear.', 'plate'],
        ['canecas', 'Canecas e xícaras', 'Uma imagem ou mensagem para acompanhar o dia a dia.', 'mug']
    ];
    const faqContent = [
        ['Como funciona a personalização?', 'Escolha o produto e envie sua imagem. Nesta prévia, você pode simular o enquadramento de azulejos e salvar sua composição no carrinho. A compra e o envio para produção ainda não estão disponíveis.'],
        ['Posso enviar qualquer foto?', 'Use uma imagem sua ou que você tenha autorização para reproduzir. Envie JPG, PNG ou WebP dentro do limite indicado no editor, de preferência em boa resolução. Confira o corte na simulação antes de confirmar.'],
        ['Quais são os tamanhos dos azulejos?', 'Os tamanhos previstos são 10 × 20 cm, 15 × 20 cm e 20 × 30 cm, nas orientações vertical ou horizontal. Preços e disponibilidade dependem do cadastro de cada peça.'],
        ['Posso pedir um quadro sem foto?', 'Sim, a proposta inclui quadros decorativos com composições prontas, além dos personalizados. As opções serão apresentadas conforme o catálogo for disponibilizado.'],
        ['Como recebo minha arte ou produto?', 'A simulação ajuda você a visualizar a peça. Ela não é um arquivo final de impressão. Quando as vendas estiverem disponíveis, a imagem será usada na personalização do produto físico escolhido.'],
        ['Qual é o prazo de produção?', 'O prazo será informado para cada produto antes da compra. Nesta etapa ele ainda está em definição; não há prazo de produção confirmado.'],
        ['Como funciona o envio?', 'O valor e o prazo de entrega serão consultados pelo CEP antes da compra. A integração de frete ainda está em preparação.'],
        ['Posso comprar um produto sem personalização?', 'A marca também terá peças decorativas prontas, sem envio de foto. Nesta prévia é possível explorar a proposta; as compras ainda estão desabilitadas.']
    ];

    function scenePhoto(kind = 'all', extra = '') {
        // A imagem de ambiente original não veio no pacote. Usa assets locais existentes como fallback.
        const scenes = {
            all: ['/assets/home/detail.webp', 'Ambiente decorativo em tons naturais'],
            tile: ['/assets/home/tile.webp', 'Azulejo decorativo com paisagem'],
            frame: ['/assets/home/detail.webp', 'Detalhes decorativos para o ambiente'],
            plate: ['/assets/home/plate.webp', 'Prato decorativo em tons terrosos'],
            mug: ['/assets/home/mug.webp', 'Caneca personalizada']
        };
        const scene = scenes[kind] || scenes.all;
        return `<div class="scene-photo scene-${kind} ${extra}"><img src="${scene[0]}" alt="${scene[1]}" loading="${extra === 'hero-scene' ? 'eager' : 'lazy'}"></div>`;
    }

    function faqBlock() {
        if (state.checkoutAvailable && !state.content.pages ?.faq ?.body) return `<div class="faq-list">${[
      ['Como funciona a personalização?','Escolha a peça, envie uma imagem autorizada, ajuste e aprove o enquadramento. O original e a prévia ficam vinculados ao pedido.'],
      ['Quais são os tamanhos dos azulejos?','10 × 20, 15 × 20 e 20 × 30 cm. Cada medida tem preço e disponibilidade próprios.'],
      ['Como posso pagar?','Com Pix ou cartão de crédito no Mercado Pago. A produção depende da confirmação do pagamento.'],
      ['Qual é o prazo?','O prazo de produção da peça é somado ao transporte escolhido. Consulte os valores e prazos pelo CEP antes de pagar.'],
      ['Como acompanho o pedido?','Você recebe atualizações por e-mail e pode consultar o código do pedido com o celular informado na compra.'],
      ['Como entro em contato?',state.content.contact || 'veronica.vmesquita@hotmail.com']
    ].map(([q,a])=>`<details><summary>${escape(q)}<span aria-hidden="true">+</span></summary><p>${escape(a)}</p></details>`).join('')}</div>`;

        if (state.content.pages ?.faq ?.body) return `<div class="editorial-text">${escape(state.content.pages.faq.body)}</div>`;
        return `<div class="faq-list">${faqContent.map(([q,a]) => `<details><summary>${q}<span aria-hidden="true">+</span></summary><p>${a}</p></details>`).join('')}</div>`;
    }

    function home() {
        return `<div class="approved-home clean-v5">
      ${window.VeroVazHero.render()}
      <section class="editorial-categories shell" aria-label="Encontre sua peça — deslize para explorar" tabindex="0">${[
        ['tile','AZULEJOS PERSONALIZADOS','#personalize','Fotos, frases ou artes que têm significado.','Azulejo com fotografia do pôr do sol apoiado em madeira'],
        ['plate','PRATOS DECORATIVOS','#produtos/pratos','Beleza e elegância para o seu espaço.','Prato com composição geométrica em terracota, azul profundo, grafite e creme'],
        ['mug','CANECAS PERSONALIZADAS','#produtos/canecas','Mensagens, fotos e designs que aquecem o dia.','Caneca clara com frase e pequeno coração'],
        ['decor','DECORAÇÃO','#produtos/decoracao','Vasos, objetos, peças prontas e coleções para deixar seu ambiente ainda mais especial.','Vasos terracota e marfim com ramos secos, flores brancas e contas de madeira'],
        ['gift','PRESENTES','#produtos/presentes','Para todas as ocasiões, com muito mais significado.','Presente com laço natural, recipiente artesanal de madeira e vaso claro com hastes secas']
      ].map(([photo,title,href,description,alt])=>`<a class="editorial-category" href="${href}">${cleanPhoto(photo,alt)}<div class="category-caption"><h2>${title}<span aria-hidden="true"> →</span></h2><p>${description}</p></div></a>`).join('')}</section>
      <section class="editorial-process shell" aria-labelledby="process-title"><div class="process-intro"><p class="eyebrow">É MUITO SIMPLES</p><h2 id="process-title">Personalize<br>do seu jeito.</h2><p>Escolha o produto, envie sua foto, ideia ou frase e nós cuidamos do resto. Do seu jeito, para quem você ama.</p><a class="text-link" href="#pagina/como-funciona">COMO FUNCIONA →</a></div><ol tabindex="0" aria-label="Etapas da personalização — deslize para explorar">${[
        ['phone','Mão segurando celular com a fotografia escolhida','ENVIE SUA FOTO OU IDEIA','Você pode enviar a sua imagem ou escolher entre nossas opções de artes e coleções.'],
        ['editor','Computador mostrando prévia e opções de personalização','SELECIONE O PRODUTO E PERSONALIZE','Escolha o tamanho, o modelo e os detalhes da sua peça.'],
        ['box','Caixa de papel kraft VeroVaz','RECEBA EM CASA','Produzimos com todo cuidado e enviamos para você com segurança.']
      ].map(([photo,alt,title,body],i)=>`<li>${cleanPhoto(photo,alt)}<div class="process-caption"><span class="step-number">${i+1}</span><div><h3>${title}</h3><p>${body}</p></div></div></li>`).join('')}</ol></section>
      <section class="editorial-decor">${cleanPhoto('detail','Vaso terracota com alça, vasos claros com flores secas, contas de madeira, livros em português e escultura em pedra clara')}<div><p class="eyebrow">DECORAÇÃO</p><h2>Mais do que objetos,<br>são detalhes que acolhem.</h2><p>Vasos, objetos decorativos, peças prontas e coleções para deixar cada ambiente com a sua cara.</p>${button('VER DECORAÇÃO','#colecao',true)}</div></section>
      <section class="v5-benefits" aria-label="Benefícios do ateliê">${[['diamond','Produto de qualidade e acabamento impecável'],['truck','Envio seguro para todo o Brasil'],['shield','Pagamento seguro — Diversas formas'],['heart','Atendimento especializado'],['gift','Presentes que emocionam']].map(([icon,label])=>`<div>${lineIcon(icon)}<span>${label}</span></div>`).join('')}</section>
    </div>`;
    }

    function personalization() {
        const draft = state.draft,
            asset = assets.get(draft.imageId),
            configured = variant();
        const fixed = Boolean(draft.modelProductId);
        if (fixed && !configured ?.print) return `<section class="shell page-section"><h1>Modelo em preparação</h1><p>Este produto ainda não tem uma área de impressão disponível.</p><a class="text-link" href="#produtos">Voltar aos produtos</a></section>`;
        const title = fixed ? configured.name : 'Azulejo personalizado';
        const dpi = asset ? D.resolutionDpi(asset.width, asset.height, draft) : null;
        const minDpi = configured ?.minimumDpi;
        const insufficient = minDpi && dpi < minDpi;
        return `<section class="shell page-section"><div class="page-intro"><p class="eyebrow">${fixed ? escape(title) : 'PERSONALIZE SEU AZULEJO'}</p><h1>Uma imagem sua.<br><em>Um novo lugar na casa.</em></h1><p>Escolha sua imagem, ajuste o enquadramento e salve sua composição. ${fixed ? 'A área imprimível deste modelo é fixa.' : 'Escolha uma das três medidas disponíveis.'}</p></div><div class="personalization-grid"><div class="preview-column"><div class="wall-scene ${fixed ? 'fixed-model-scene' : ''}"><div class="wall-light"></div><div class="wall-tile" id="wall-tile"><canvas id="art-canvas" aria-label="Prévia do enquadramento da sua imagem"></canvas><span id="empty-art" ${asset ? 'hidden' : ''}>Sua história<br><em>começa aqui.</em></span></div><div class="wall-shelf"></div><div class="wall-vase" aria-hidden="true"></div><span class="wall-scale">${fixed ? 'ÁREA DE IMPRESSÃO · VISTA PLANA' : 'ESCALA ILUSTRATIVA · MESMO AMBIENTE PARA OS TRÊS TAMANHOS'}</span></div><div class="preview-caption"><span>${fixed ? 'ÁREA IMPRIMÍVEL DO MODELO' : 'PRÉVIA NA PAREDE'}</span><p>${fixed ? 'Visualização plana da área imprimível, sem simular a curvatura do produto.' : 'Simulação de ambiente.'} Cores e acabamento podem variar. Não representa o arquivo final de impressão.</p></div><div class="inspiration-row"><span>INSPIRAÇÕES</span>${[['baby', 'Bebê'], ['pet', 'Pet'], ['tile', 'Viagem'], ['family', 'Família']].map(([photo, label]) => `<figure><div class="example-wall"><div class="example-tile">${referencePhoto(photo)}</div></div><figcaption>${label}</figcaption></figure>`).join('')}</div><p class="tiny-note">Composições demonstrativas com recortes da referência fornecida. Não são pedidos reais e não substituem a foto que você enviar.</p></div>
      <div class="personalization-controls"><section class="step"><p class="step-title"><span>01</span> Envie sua imagem</p><label for="image-file" class="upload-area"><span class="upload-arrow">↑</span><strong>${asset ? 'Substituir minha imagem' : 'Escolher foto ou arte'}</strong><small>JPG, PNG ou WebP · até ${Math.round((state.maxUploadBytes || 15728640)/1048576)} MB</small></label><input id="image-file" aria-describedby="upload-status" type="file" accept="image/jpeg,image/png,image/webp"><p class="tiny-note">${state.privateDraftsAvailable ? `Sua imagem fica neste navegador até salvar o carrinho no servidor ou continuar para pagamento. O rascunho privado dura até ${Number(state.draftRetentionDays)} dia(s).` : 'Sua imagem fica neste navegador. Rascunhos expiram em 24 horas e são removidos na próxima visita. O envio privado para produção ainda não está habilitado.'}</p><p id="upload-status" role="status" aria-live="polite" class="form-message">${escape(state.uploadMessage)}</p>${asset ? '<button class="text-button" data-action="remove-image">Remover imagem</button>' : ''}</section>
      ${!fixed ? `<fieldset class="step" ${!asset ? 'disabled' : ''}><legend class="step-title"><span>02</span> Escolha o tamanho do seu azulejo</legend><div class="size-choices">${D.sizes.map(size => `<label><input type="radio" name="tile-size" value="${size.id}" ${draft.sizeId === size.id ? 'checked' : ''}><span>${size.label}</span></label>`).join('')}</div><p class="tiny-note">Medidas da peça. Embalagem e área final de impressão dependem do cadastro.</p></fieldset>` : ''}
      <fieldset class="step" ${!asset ? 'disabled' : ''}><legend class="step-title"><span>03</span> Ajuste sua imagem</legend>${!fixed ? `<div class="orientation"><label><input type="radio" name="orientation" value="portrait" ${draft.orientation === 'portrait' ? 'checked' : ''}> Vertical</label><label><input type="radio" name="orientation" value="landscape" ${draft.orientation === 'landscape' ? 'checked' : ''}> Horizontal</label></div>` : ''}${[['zoom', 'Zoom', 1, 3, .05], ['x', 'Posição horizontal', 0, 100, 1], ['y', 'Posição vertical', 0, 100, 1]].map(([field, label, min, max, step]) => `<label class="slider-label" for="adjust-${field}">${label}<input id="adjust-${field}" data-adjust="${field}" type="range" min="${min}" max="${max}" step="${step}" value="${draft[field]}"></label>`).join('')}<div class="editor-actions"><button type="button" class="text-button" data-action="rotate-image">Girar imagem 90°</button><button type="button" class="text-button" data-action="reset-adjustments">Restaurar enquadramento</button></div><p id="resolution-status" class="tiny-note">${asset ? minDpi ? `${dpi} DPI efetivos · mínimo cadastrado: ${minDpi} DPI.${insufficient ? ' Escolha uma imagem maior ou reduza o zoom.' : ''}` : 'Requisitos de resolução para produção ainda não cadastrados.' : 'Os ajustes ficam disponíveis após escolher uma imagem.'}</p></fieldset>
      <section class="step"><p class="step-title"><span>04</span> Confira e confirme a arte</p><p id="confirmation-help" class="tiny-note">${draft.confirmedAt ? 'Enquadramento confirmado para este tamanho e orientação.' : 'Mudanças de tamanho, orientação, imagem ou corte pedem uma nova confirmação.'}</p><label class="confirmation"><input id="image-rights" type="checkbox" ${draft.rightsConsent ? 'checked' : ''}> Confirmo que tenho autorização para usar esta imagem na personalização.</label><label class="confirmation"><input id="confirm-art" type="checkbox" ${draft.confirmedAt ? 'checked' : ''} ${!asset || insufficient || !draft.rightsConsent ? 'disabled' : ''}> Revisei e aprovo este enquadramento</label></section>
      <div class="purchase-summary"><span>${escape(title)}${fixed ? '' : ` · ${D.sizes.find(item => item.id === draft.sizeId).label}`}</span><strong>${money(publicPrice(configured))}</strong><small>${configured?.active ? 'Valor do cadastro atual, sujeito à revalidação no pedido.' : 'Preço e disponibilidade aguardam cadastro.'}</small></div>${shippingPanel(configured?.productionDays)}<button class="button full" data-action="add-personalization" ${!draft.confirmedAt || insufficient ? 'disabled' : ''}>Salvar composição no carrinho <span>↗</span></button><p class="tiny-note">Composição salva como rascunho. A compra depende do preço, frete e armazenamento privado da arte.</p></div></div></section>`;
    }

    function shippingPanel(productionDays) {
        return `<section class="shipping-panel"><h2>Calcule o frete</h2><form id="shipping-form"><label for="destination-cep">CEP de destino</label><div class="cep-row"><input id="destination-cep" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" pattern="[0-9]{5}-?[0-9]{3}" maxlength="9" required value="${escape(state.cep)}"><button class="button secondary" ${state.quoteLoading ? 'disabled' : ''}>${state.quoteLoading ? 'Consultando…' : 'Consultar'}</button></div></form><p class="form-message" role="status">${escape(state.shippingMessage || 'Informe seu CEP para consultar a entrega.')}</p>${state.quote ? `<fieldset class="shipping-options"><legend>Transportadora e serviço</legend>${state.quote.options.map(o=>`<label><input type="radio" name="shipping-service" value="${escape(o.serviceCode)}" ${state.quote.selectedService===o.serviceCode?'checked':''}> ${escape(o.carrier)} · ${escape(o.name)} — ${money(o.amountCents)} · ${o.minTransitDays}–${o.maxTransitDays} dias úteis de transporte</label>`).join('')}</fieldset>` : ''}<dl><div><dt>Valor do frete</dt><dd>${state.quote ? money(state.quote.amountCents) : 'A calcular'}</dd></div><div><dt>Prazo de produção</dt><dd>${Number.isInteger(state.quote?.productionDays ?? productionDays) ? `${state.quote?.productionDays ?? productionDays} dias úteis` : 'A cadastrar'}</dd></div><div><dt>Prazo de transporte</dt><dd>${state.quote ? `${state.quote.minTransitDays}–${state.quote.maxTransitDays} dias úteis` : 'A calcular'}</dd></div><div><dt>Prazo total estimado</dt><dd>${state.quote ? `${state.quote.productionDays + state.quote.minTransitDays}–${state.quote.productionDays + state.quote.maxTransitDays} dias úteis após aprovação do pagamento` : 'A calcular'}</dd></div></dl></section>`;
    }

    function catalog() {
        const filter = route().split('/')[1] || '';
        const categories = [...new Set(state.products.map(product => product.categoryName).filter(Boolean))];
        return `<section class="shell page-section"><div class="page-intro"><p class="eyebrow">PERSONALIZADOS E DECORAÇÃO</p><h1>Uma ideia.<br><em>Muitas possibilidades.</em></h1><p>Encontre uma peça para personalizar ou um objeto pronto para decorar.</p></div><form class="catalog-controls" id="catalog-filter"><label>Buscar produtos<input id="product-search" type="search" placeholder="O que você procura?" value="${escape(state.search)}"></label><label>Categoria<select id="product-category"><option value="">Todas as categorias</option>${categories.map(category => `<option ${state.category === category ? 'selected' : ''}>${escape(category)}</option>`).join('')}</select></label><label>Preço mínimo<input id="min-price" type="number" min="0" step="0.01" value="${escape(state.minPrice)}"></label><label>Preço máximo<input id="max-price" type="number" min="0" step="0.01" value="${escape(state.maxPrice)}"></label><label class="stock-filter"><input id="in-stock" type="checkbox" ${state.inStock ? 'checked' : ''}> Disponíveis</label><button class="button secondary">Buscar</button></form>${filter ? `<p class="tiny-note">Seleção: ${escape(filter)}. <a href="#produtos">Ver todos</a></p>` : ''}<div id="catalog-results">${catalogResults(filter)}</div></section>`;
    }

    function catalogResults(filter = '') {
        if (state.loading) return '<div class="empty-state" role="status">Carregando o catálogo…</div>';
        if (state.error) return `<div class="empty-state"><h2>O catálogo não está disponível agora.</h2><p>${escape(state.error)}</p><button class="button secondary" data-action="reload">Tentar novamente</button></div>`;
        const text = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const personalizedProductIds = new Set(state.variants.map(variant => variant.productId));
        const results = state.products.filter(product => !personalizedProductIds.has(product.id) && (!state.inStock || product.stock > 0) && (state.minPrice === '' || product.price >= Number(state.minPrice)) && (state.maxPrice === '' || product.price <= Number(state.maxPrice)) && (!state.category || state.category === product.categoryName) && text(`${product.name} ${product.description} ${product.categoryName}`).includes(text(state.search)) && (!filter || (filter === 'decoracao' ? (state.productDetails[product.id] ?.kind ?? 'decoration') === 'decoration' : text(`${product.name} ${product.categoryName}`).includes(text(filter).replace(/s$/, '')))));
        if (!results.length) return '<div class="empty-state"><h2>Nenhuma peça disponível nesta seleção.</h2><p>Os produtos serão exibidos conforme o catálogo cadastrado.</p><a class="text-link" href="#personalize">Experimentar uma personalização</a></div>';
        return `<div class="live-product-grid">${results.map(productCard).join('')}</div>`;
    }

    function productCard(product) {
        return `<a href="#produto/${encodeURIComponent(product.id)}" class="live-product-card">${product.imageUrl ? `<img src="${escape(safeImage(product.imageUrl))}" alt="${escape(product.name)}" loading="lazy">` : '<div class="photo-pending">Imagem a cadastrar</div>'}<p class="eyebrow">${escape(product.categoryName || 'VeroVaz Ateliê &amp; Decoração')}</p><h2>${escape(product.name)}</h2><p>${money(D.toCents(product.price))}</p><small>${product.stock > 0 ? 'Ver disponibilidade e entrega' : 'Indisponível'}</small></a>`;
    }

    function productGallery(product, details) {
        const urls = [...new Set([product.imageUrl, ...(details.gallery ?? [])].filter(Boolean))];
        return urls.length ? `<div class="product-gallery">${urls.map((url,i) => `<img src="${escape(safeImage(url))}" alt="${escape(product.name)} · imagem ${i+1}" loading="${i ? 'lazy' : 'eager'}">`).join('')}</div>` : '<div class="photo-pending">Fotografia a cadastrar</div>';
    }

    function productPage() {
        const product = currentProduct();
        if (product && state.variants.some(variant => variant.productId === product.id)) return `<section class="shell page-section empty-state"><h1>Este azulejo é personalizado.</h1><a class="button" href="#personalize">Escolher minha imagem</a></section>`;
        const details = state.productDetails[product ?.id] ?? {};
        if (details.kind === 'fixed') return `<section class="shell page-section"><p class="eyebrow">PERSONALIZADO · MODELO FIXO</p><h1>${escape(product.name)}</h1><p>${escape(product.description)}</p><p class="product-price">${money(D.toCents(product.price))}</p>${productGallery(product, details)}${details.print && product.stock > 0 ? button('Personalizar este modelo', '#personalize/'+product.id) : '<p>Modelo indisponível no momento.</p>'}</section>`;
        if (!product) return `<section class="shell page-section empty-state"><h1>${state.loading ? 'Carregando a peça…' : 'Produto não disponível.'}</h1><a class="text-link" href="#produtos">Voltar ao catálogo</a></section>`;
        return `<section class="shell page-section"><a href="#produtos" class="text-link">← Voltar aos produtos</a><div class="product-detail"><div class="product-photo">${productGallery(product, details)}</div><div><p class="eyebrow">PRODUTO PRONTO · ${escape(product.categoryName)}</p><h1>${escape(product.name)}</h1><p class="product-price">${money(D.toCents(product.price))}</p><p>${escape(product.description)}</p><dl class="product-specs"><div><dt>Dimensões</dt><dd>${escape(details.dimensions || 'A cadastrar')}</dd></div><div><dt>Material</dt><dd>${escape(details.material || 'A cadastrar')}</dd></div><div><dt>Acabamento</dt><dd>${escape(details.finish || 'A cadastrar')}</dd></div><div><dt>Cor</dt><dd>${escape(details.color || 'A cadastrar')}</dd></div><div><dt>Cuidados</dt><dd>${escape(details.care || 'A cadastrar')}</dd></div><div><dt>Disponibilidade</dt><dd>${product.stock > 0 ? `${product.stock} unidade(s) no cadastro` : 'Indisponível'}</dd></div></dl><label class="quantity-label" for="ready-quantity">Quantidade<input id="ready-quantity" type="number" min="1" max="${Math.max(1, product.stock)}" value="${state.readyQuantity}"></label>${shippingPanel(details.productionDays)}<button class="button full" data-action="add-ready" ${product.stock <= 0 ? 'disabled' : ''}>Adicionar ao carrinho <span>↗</span></button><p class="tiny-note">Este produto não exige envio de imagem. A entrega será revalidada para o carrinho completo.</p></div></div></section>`;
    }

    function collectionPage() {
        const ids = state.content.collectionProductIds ?? [];
        const products = state.products.filter(product => (state.productDetails[product.id] ?.kind ?? 'decoration') === 'decoration' && !state.variants.some(v => v.productId === product.id));
        return `<section class="shell page-section"><div class="collection-feature"><div class="collection-image">${scenePhoto('frame')}</div><div class="section-copy"><p class="eyebrow">DECORE SEU ESPAÇO</p><h1>Escolhas que<br><em>combinam com você.</em></h1><p>Vasos, cordões e objetos decorativos prontos para o seu ambiente. Encontre uma peça para o seu ambiente, sem precisar enviar uma foto.</p>${button('Ver decoração', '#produtos/decoracao', true)}</div></div>${products.length ? `<div class="live-product-grid section">${products.map(productCard).join('')}</div>` : '<div class="empty-state"><h2>A seleção está em preparação.</h2><p>As peças decorativas serão apresentadas conforme o catálogo for disponibilizado.</p><a href="#produtos" class="text-link">Explorar produtos</a></div>'}<p class="tiny-note">Imagem ilustrativa gerada por IA.</p></section>`;
    }

    function historyPage() {
        return `<section class="shell page-section story-page"><p class="eyebrow">SOBRE A VeroVaz Ateliê &amp; Decoração</p><h1>O significado está<br><em>nas suas escolhas.</em></h1><div class="story-grid"><div><h2>Peças para fazer parte.</h2><p>${escape(state.content.history || 'A VeroVaz Ateliê & Decoração nasceu para transformar imagens, ideias e escolhas pessoais em objetos que decoram, presenteiam e fazem parte do dia a dia.')}</p><p>Azulejos, quadros, pratos e canecas abrem espaço para diferentes possibilidades: personalizar uma imagem especial ou escolher uma composição decorativa pronta.</p>${button('Conheça as possibilidades', '#produtos')}</div>${scenePhoto('all')}<p class="tiny-note">Ambiente ilustrativo gerado por IA.</p></div></section>`;
    }

    function editorialPage() {
        const slug = route().split('/')[1];
        const page = state.content.pages ?.[slug];
        if (slug === 'faq' && !page ?.body) return `<section class="shell page-section editorial-page"><p class="eyebrow">VeroVaz Ateliê &amp; Decoração</p><h1>Perguntas frequentes</h1>${faqBlock()}</section>`;
        return `<section class="shell page-section editorial-page"><p class="eyebrow">VeroVaz Ateliê &amp; Decoração</p><h1>${escape(page?.title || 'Conteúdo não encontrado')}</h1><div class="editorial-text">${escape(page?.body || 'Este conteúdo aguarda revisão e aprovação antes da publicação.')}</div>${slug === 'contato' && state.content.contact ? `<p>${escape(state.content.contact)}</p>` : ''}<a href="#inicio" class="text-link">Voltar ao início</a></section>`;
    }

    function cartPage() {
        const subtotal = D.subtotal(state.cart);
        return `<section class="shell page-section"><div class="page-intro"><p class="eyebrow">SUAS ESCOLHAS</p><h1>Seu carrinho.</h1><p>Revise cada peça e cada composição.</p></div>${!state.cart.length ? '<div class="empty-state"><h2>Ainda há espaço para uma ideia.</h2><a href="#personalize" class="button">Personalizar meu azulejo ↗</a></div>' : `<div class="cart-layout"><div>${state.cart.map(item => `<article class="cart-item">${previewUrl(item) ? `<img src="${escape(previewUrl(item))}" alt="Prévia da composição deste item">` : item.imageUrl ? `<img src="${escape(safeImage(item.imageUrl))}" alt="${escape(item.name)}">` : '<div class="cart-placeholder">VeroVaz</div>'}<div><h2>${escape(item.name)}</h2>${item.personalization ? `<p>${item.personalization.modelProductId ? 'Modelo fixo' : D.sizes.find(size => size.id === item.personalization.sizeId)?.label} · ${item.personalization.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}</p><span class="draft-tag">COMPOSIÇÃO EM RASCUNHO</span>` : '<p>Produto pronto</p>'}<p>${money(item.unitCents)}</p><div class="quantity-control"><button data-action="quantity" data-id="${item.id}" data-delta="-1" aria-label="Diminuir quantidade de ${escape(item.name)}">−</button><span>${item.quantity}</span><button data-action="quantity" data-id="${item.id}" data-delta="1" aria-label="Aumentar quantidade de ${escape(item.name)}">+</button><button class="text-button" data-action="remove-item" data-id="${item.id}">Remover</button></div></div></article>`).join('')}<p class="tiny-note">Cada arte tem seu próprio item. ${state.privateDraftsAvailable ? `Use Salvar carrinho e artes no servidor para persistir os arquivos privados. A sessão expira em até ${Number(state.draftRetentionDays)} dia(s), conforme a política cadastrada. Isso não inicia produção nem pagamento.` : 'Os originais permanecem neste navegador; nenhuma imagem foi enviada à produção.'}</p></div><aside class="cart-summary"><h2>Resumo</h2>${state.privateDraftsAvailable ? '<button type="button" class="button secondary" data-action="save-private">Salvar carrinho e artes no servidor</button>' : ''}<dl><div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div><div><dt>Frete</dt><dd>${state.quote ? money(state.quote.amountCents) : 'A calcular'}</dd></div><div><dt>Descontos</dt><dd>Não aplicados</dd></div><div class="total"><dt>Total</dt><dd>${subtotal === null ? 'A calcular' : state.quote ? money(subtotal+state.quote.amountCents) : `${money(subtotal)} + frete`}</dd></div></dl>${shippingPanel()}${state.checkoutAvailable ? button('Continuar para entrega e pagamento', '#checkout') : '<button class="button full" disabled>Finalização ainda indisponível</button>'}<p class="tiny-note">${state.checkoutAvailable ? 'Seu pedido será confirmado após a aprovação do pagamento pelo Mercado Pago.' : 'A compra será habilitada após a configuração de entrega e do armazenamento privado da arte.'}</p></aside></div>`}</section>`;
    }

    function checkoutPage() {
        if (!state.checkoutAvailable || !state.cart.length) return '<section class="shell page-section"><h1>Checkout indisponível</h1><a href="#carrinho">Voltar ao carrinho</a></section>';
        const a = state.address || {};
        const fields = [
            ['name', 'Nome completo', 'text'],
            ['email', 'E-mail', 'email'],
            ['phone', 'Celular com DDD (somente números)', 'tel'],
            ['document', 'CPF ou CNPJ (somente números)', 'text'],
            ['street', 'Rua', 'text'],
            ['number', 'Número', 'text'],
            ['complement', 'Complemento (opcional)', 'text'],
            ['district', 'Bairro', 'text'],
            ['city', 'Cidade', 'text'],
            ['state', 'UF', 'text']
        ];
        return `<section class="shell page-section"><h1>Entrega e pagamento</h1><p>Você pagará com Pix ou cartão no ambiente do Mercado Pago.</p><form id="checkout-form" class="checkout-fields">${fields.map(([key,label,type])=>`<label>${label}<input name="${key}" type="${type}" value="${escape(a[key])}" maxlength="${key==='state'?2:150}" ${key==='complement'?'':'required'}></label>`).join('')}<button class="button full" ${state.checkoutBusy || !state.quote?'disabled':''}>${state.checkoutBusy?'Preparando seu pedido…':'Criar pedido e ir ao Mercado Pago'}</button></form>${shippingPanel()}<div class="checkout-total"><p>Produtos: ${money(D.subtotal(state.cart))}</p><p>Frete: ${state.quote ? money(state.quote.amountCents) : 'A calcular'}</p><strong>Total: ${state.quote && D.subtotal(state.cart)!==null ? money(D.subtotal(state.cart)+state.quote.amountCents) : 'A calcular'}</strong></div><p role="status">${escape(state.checkoutError)}</p><p>O total e a disponibilidade serão conferidos antes da criação do pagamento. Seus arquivos serão vinculados ao pedido.</p></section>`;
    }

    function orderPage() {
        const order = state.orderStatus;
        const labels = {
            pending: 'Aguardando pagamento',
            paid: 'Pagamento aprovado',
            production: 'Em produção',
            shipped: 'Enviado',
            delivered: 'Entregue',
            payment_review: 'Pagamento em revisão'
        };
        return `<section class="shell page-section"><h1>Seu pedido</h1><p>Código: <strong>${escape(route().split('/')[1]?.slice(0,8).toUpperCase())}</strong></p><p>O retorno do Mercado Pago não confirma o pagamento. Confira abaixo a informação recebida pelo servidor.</p>${order ? `<p><strong>${escape(labels[order.status]||order.status)}</strong></p><p>Total: ${money(Math.round(order.totalAmount*100))}</p>${order.trackingCode?`<p>Rastreio: ${escape(order.trackingCode)}</p>`:''}${order.paymentStatus!=='approved' && order.status!=='payment_review' && order.checkoutUrl ? button('Retomar pagamento',safeImage(order.checkoutUrl)) : ''}` : `<p>${escape(state.orderError||'Consulte o estado atualizado do pedido.')}</p>`}<button class="button secondary" data-action="refresh-order">Atualizar situação</button><p><a href="#conta">Consultar pelo código e celular</a></p><button class="text-button" data-action="new-cart">Começar outra compra</button></section>`;
    }
    async function refreshOrder() {
        try {
            state.orderStatus = await privateCart.request('orders/' + encodeURIComponent(route().split('/')[1]));
            state.orderError = '';
        } catch (error) {
            state.orderError = error.message;
        }
        render();
    }

    function accountPage() {
        return `<section class="shell page-section editorial-page"><p class="eyebrow">SEUS PEDIDOS</p><h1>Vamos acompanhar?</h1><p>O cadastro de conta de cliente ainda não está disponível. Você pode consultar pedidos existentes com o código e o celular informados na compra.</p><form id="tracking-form" class="tracking-form"><label>Código do pedido<input name="code" minlength="8" required autocomplete="off"></label><label>Celular com DDD<input name="phone" inputmode="tel" minlength="10" required autocomplete="tel"></label><button class="button">Consultar pedido</button></form><div id="tracking-result" role="status"></div></section>`;
    }

    function footer() {
        const newsletter = safeImage(state.content.newsletterUrl);
        return `<footer class="footer approved-footer v5-footer"><div class="shell v5-footer-main">${brand(true)}<nav aria-label="Links do rodapé">${navigation('')}</nav><div class="v5-subscribe"><label for="newsletter-email">Receba novidades e inspirações</label>${newsletter ? `<a class="button secondary" href="${escape(newsletter)}" target="_blank" rel="noopener noreferrer">Cadastrar meu e-mail →</a>` : '<input id="newsletter-email" type="email" placeholder="Seu e-mail" disabled aria-describedby="newsletter-status"><small id="newsletter-status">Inscrições em breve.</small>'}<div class="v5-socials">${['instagram','whatsapp'].filter(name=>socialLink(name)).map(name=>`<a href="${escape(socialLink(name))}" aria-label="${name==='instagram'?'Instagram':'WhatsApp'}" target="_blank" rel="noopener noreferrer">${lineIcon(name)}</a>`).join('')}<a href="#pagina/contato">Fale conosco</a></div></div></div><div class="shell footer-bottom"><span>© ${new Date().getFullYear()} VeroVaz Ateliê &amp; Decoração. Todos os direitos reservados.</span><div><a href="#pagina/privacidade">Política de Privacidade</a><a href="#pagina/termos">Termos de Uso</a><a href="#pagina/contato">Fale Conosco</a></div></div><nav class="shell v5-support" aria-label="Informações da loja"><a href="#pagina/faq">Perguntas frequentes</a><a href="#pagina/entrega">Entrega e frete</a><a href="#pagina/trocas">Trocas e devoluções</a><a href="#pagina/cuidados">Cuidados com a peça</a><a href="#conta">Acompanhe seu pedido</a></nav></footer>`;
    }

    function drawPreview() {
        const tile = $('#wall-tile'),
            canvas = $('#art-canvas');
        if (!tile || !canvas) return;
        const dimensions = D.dimensions(state.draft.sizeId, state.draft.orientation);
        const profile = variant() ?.print;
        tile.style.borderRadius = profile ?.shape === 'circle' ? '50%' : '';
        const margin = profile ?.safeMarginMm ?? variant() ?.safeMarginMm;
        tile.querySelector('.safe-area') ?.remove();
        if (margin != null && margin > 0) {
            const area = document.createElement('span');
            area.className = 'safe-area';
            area.setAttribute('aria-label', 'Limite da área segura');
            area.style.inset = `${margin/(dimensions.height*10)*100}% ${margin/(dimensions.width*10)*100}%`;
            tile.append(area);
        }
        // Same physical scale for every size; 30 cm always occupies the same wall width.
        tile.style.width = `${dimensions.width / 60 * 100}%`;
        tile.style.aspectRatio = `${dimensions.width}/${dimensions.height}`;
        const asset = assets.get(state.draft.imageId);
        canvas.width = dimensions.width * 30;
        canvas.height = dimensions.height * 30;
        if (!asset ?.image) return;
        const rect = D.crop(asset.width, asset.height, state.draft.sizeId, state.draft.orientation, state.draft.zoom, state.draft.x, state.draft.y, state.draft.rotation || 0);
        const ctx = canvas.getContext('2d');
        ctx.save();
        if (variant() ?.print ?.shape === 'circle') {
            ctx.beginPath();
            ctx.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, 0, 0, Math.PI * 2);
            ctx.clip();
        }
        ctx.drawImage(window.VeroVazImageEditor.source(asset, state.draft.rotation || 0), rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    function invalidateQuote(message = '') {
        quoteRevision++;
        quoteAbort ?.abort();
        state.quote = null;
        state.quoteLoading = false;
        state.shippingMessage = message;
    }
    async function quoteShipping() {
        const revision = ++quoteRevision;
        quoteAbort ?.abort();
        quoteAbort = new AbortController();
        const lines = currentLines();
        const fingerprint = D.fingerprint(lines, state.cep);
        state.quote = null;
        if (!lines.length || lines.some(line => !line.productId || line.unitCents === null)) {
            state.shippingMessage = 'O cálculo depende do preço e dos dados logísticos cadastrados para esta seleção.';
            state.quoteLoading = false;
            render();
            return;
        }
        state.quoteLoading = true;
        state.shippingMessage = 'Consultando a entrega…';
        render();
        try {
            const response = await fetch(`${api}/atelier/shipping/quotes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': tenant
                },
                signal: quoteAbort.signal,
                body: JSON.stringify({
                    postalCode: state.cep.replace(/\D/g, ''),
                    items: lines.map(line => ({
                        productId: line.productId,
                        sizeId: line.personalization ?.modelProductId ? null : line.personalization ?.sizeId ?? null,
                        quantity: line.quantity
                    }))
                })
            });
            const data = await response.json().catch(() => null);
            if (revision !== quoteRevision || fingerprint !== D.fingerprint(currentLines(), state.cep)) return;
            if (!response.ok) throw new Error(data ?.detail || 'Não foi possível consultar o frete.');
            if (!data ?.id || !Array.isArray(data.options) || !data.options.length || data.options.some(o => !Number.isSafeInteger(o.amountCents) || o.amountCents < 0)) throw new Error('Nenhum serviço de entrega disponível.');
            state.quote = { ...data,
                ...data.options[0],
                selectedService: data.options[0].serviceCode
            };
            state.shippingMessage = 'Escolha a transportadora e o serviço. Cotação válida por 15 minutos.';
        } catch (error) {
            if (error.name === 'AbortError' || revision !== quoteRevision) return;
            state.shippingMessage = error.message || 'Não foi possível conectar ao serviço de entrega.';
        } finally {
            if (revision === quoteRevision) {
                state.quoteLoading = false;
                render();
            }
        }
    }

    function resetConfirmation() {
        state.draft.confirmedAt = null;
        const input = $('#confirm-art');
        if (input) input.checked = false;
        const add = $('[data-action="add-personalization"]');
        if (add) add.disabled = true;
        const help = $('#confirmation-help');
        if (help) help.textContent = 'O enquadramento mudou. Confira a prévia e confirme novamente.';
    }
    async function upload(file) {
        if (!file) return;
        if (assets.size >= 12) {
            state.uploadMessage = 'Você atingiu o limite de 12 imagens locais. Remova composições que não deseja manter antes de enviar outra.';
            render();
            return;
        }
        const revision = ++uploadRevision;
        state.uploadMessage = 'Verificando sua imagem…';
        render();
        let url;
        try {
            if (file.size === 0 || file.size > (state.maxUploadBytes || 15728640)) throw new Error(`Escolha uma imagem de até ${Math.round((state.maxUploadBytes || 15728640)/1048576)} MB. A imagem anterior foi preservada.`);
            if (file.name && !/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error('A extensão deve ser JPG, PNG ou WebP. HEIC e SVG não são aceitos.');
            const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
            const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
            const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
            const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
            if (file.name && ((jpeg && !/\.jpe?g$/i.test(file.name)) || (png && !/\.png$/i.test(file.name)) || (webp && !/\.webp$/i.test(file.name)))) throw new Error('A extensão não corresponde ao conteúdo da imagem.');
            if (!(jpeg || png || webp)) throw new Error('Formato não aceito. Escolha JPG, PNG ou WebP; a imagem anterior foi preservada.');
            url = URL.createObjectURL(file);
            const image = new Image();
            image.src = url;
            await image.decode();
            if (image.naturalWidth * image.naturalHeight > 50000000) throw new Error('A imagem é grande demais para esta prévia. Use uma cópia de até 50 megapixels.');
            if (revision !== uploadRevision) {
                URL.revokeObjectURL(url);
                return;
            }
            const imageId = id();
            assets.set(imageId, {
                blob: file,
                originalFileName: (file.name || 'imagem').replace(/[\\/<>]/g, '_').slice(0, 200),
                mimeType: file.type,
                image,
                url,
                width: image.naturalWidth,
                height: image.naturalHeight
            });
            state.draft = { ...state.draft,
                imageId,
                rotation: 0,
                zoom: 1,
                x: 50,
                y: 50,
                confirmedAt: null
            };
            state.uploadMessage = `Imagem pronta · ${image.naturalWidth} × ${image.naturalHeight} px. Escolha o tamanho e ajuste a composição.`;
            save();
            render();
        } catch (error) {
            if (url) URL.revokeObjectURL(url);
            if (revision === uploadRevision) {
                state.uploadMessage = error.message;
                render();
            }
        }
    }

    function bind() {
        disposeHero = window.VeroVazHero.mount($('.hero-carousel'));
        $('#header-search') ?.addEventListener('submit', event => {
            event.preventDefault();
            state.search = new FormData(event.currentTarget).get('query').trim();
            state.category = '';
            if (route() === 'produtos') render();
            else location.hash = 'produtos';
        });
        $('#mobile-nav') ?.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                $('#mobile-nav').hidden = true;
                const toggle = $('[data-action="menu"]');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.focus();
            }
        });
        root.querySelectorAll('[name="shipping-service"]').forEach(input => input.addEventListener('change', () => {
            const choice = state.quote.options.find(o => o.serviceCode === input.value);
            Object.assign(state.quote, choice, {
                selectedService: choice.serviceCode
            });
            render();
        }));
        $('#checkout-form') ?.addEventListener('input', () => {
            state.address = Object.fromEntries(new FormData($('#checkout-form')));
        });
        $('#checkout-form') ?.addEventListener('submit', async event => {
            event.preventDefault();
            if (state.checkoutBusy) return;
            state.address = Object.fromEntries(new FormData(event.currentTarget));
            state.checkoutBusy = true;
            state.checkoutError = '';
            render();
            try {
                if (!state.quote || Date.parse(state.quote.expiresAt) <= Date.now()) throw new Error('Consulte novamente o frete. A cotação expirou.');
                const current = await privateCart.session();
                if (current.orderId) {
                    location.hash = "pedido/" + current.orderId;
                    return;
                }
                const saved = await privateCart.save(state.cart, assets);
                save();
                const request = {
                    revision: saved.revision,
                    quoteId: state.quote.id,
                    serviceCode: state.quote.selectedService,
                    address: { ...state.address,
                        state: state.address.state.toUpperCase(),
                        postalCode: state.cep.replace(/\D/g, '')
                    }
                };
                // Keep the exact request for safe replay if the network drops after order creation.
                localStorage.setItem(`verovaz.checkout.${tenant}`, JSON.stringify(request));
                const result = await privateCart.request('checkout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(request)
                });
                localStorage.setItem(`verovaz.order.${tenant}`, result.orderId);
                window.location.assign(result.checkoutUrl);
            } catch (error) {
                state.checkoutError = error.message;
            } finally {
                state.checkoutBusy = false;
                render();
            }
        });
        $('[data-action="refresh-order"]') ?.addEventListener('click', refreshOrder);
        $('[data-action="new-cart"]') ?.addEventListener('click', () => {
            privateCart.token = null;
            privateCart.revision = null;
            localStorage.removeItem(privateCart.key);
            localStorage.removeItem(`verovaz.checkout.${tenant}`);
            state.cart = [];
            state.draft = initialDraft();
            state.orderStatus = null;
            save();
            location.hash = 'produtos';
        });
        $('[data-action="menu"]') ?.addEventListener('click', event => {
            const nav = $('#mobile-nav');
            nav.hidden = !nav.hidden;
            event.currentTarget.setAttribute('aria-expanded', String(!nav.hidden));
        });
        $('[data-action="search"]') ?.addEventListener('click', () => {
            if (route() !== 'produtos') location.hash = 'produtos';
            else $('#product-search') ?.focus();
        });
        $('[data-action="dismiss"]') ?.addEventListener('click', () => {
            state.notice = '';
            render();
        });
        $('[data-action="save-private"]') ?.addEventListener('click', async event => {
            event.currentTarget.disabled = true;
            try {
                const result = await privateCart.save(state.cart, assets);
                state.notice = 'Carrinho e artes salvos no servidor. Preços conferidos com o catálogo atual.';
                for (const line of result.items) {
                    const local = state.cart.find(item => item.id === line.id);
                    if (local) local.unitCents = line.unitCents;
                }
                save();
            } catch (error) {
                state.notice = error.message;
            }
            render();
        });
        $('[data-action="reload"]') ?.addEventListener('click', loadCatalog);
        $('#image-file') ?.addEventListener('change', event => upload(event.target.files[0]));
        $('[data-action="remove-image"]') ?.addEventListener('click', () => {
            uploadRevision++;
            state.draft = initialDraft();
            state.uploadMessage = 'Imagem removida do editor. Composições já salvas no carrinho foram preservadas.';
            invalidateQuote();
            save();
            render();
        });
        root.querySelectorAll('[name="tile-size"], [name="orientation"]').forEach(input => input.addEventListener('change', event => {
            resetConfirmation();
            state.draft[event.target.name === 'tile-size' ? 'sizeId' : 'orientation'] = event.target.value;
            invalidateQuote('A seleção mudou. Consulte novamente o frete.');
            save();
            render();
            if (/^\d{5}-?\d{3}$/.test(state.cep)) quoteShipping();
        }));
        root.querySelectorAll('[data-adjust]').forEach(input => input.addEventListener('input', event => {
            state.draft[event.target.dataset.adjust] = Number(event.target.value);
            resetConfirmation();
            drawPreview();
            const asset = assets.get(state.draft.imageId),
                minimum = variant() ?.minimumDpi;
            if (asset && minimum) {
                const dpi = D.resolutionDpi(asset.width, asset.height, state.draft);
                $('#resolution-status').textContent = `${dpi} DPI efetivos · mínimo: ${minimum} DPI.${dpi < minimum ? ' Reduza o zoom ou escolha uma imagem maior.' : ''}`;
                $('#confirm-art').disabled = dpi < minimum;
            }
            save();
        }));
        $('[data-action=rotate-image]') ?.addEventListener('click', () => {
            state.draft.rotation = ((state.draft.rotation || 0) + 90) % 360;
            state.draft.x = 50;
            state.draft.y = 50;
            resetConfirmation();
            save();
            render();
        });
        disposeEditor = window.VeroVazImageEditor.bindPan($('#art-canvas'), () => {
            const asset = assets.get(state.draft.imageId);
            return asset ? {
                asset,
                draft: state.draft
            } : null;
        }, position => {
            Object.assign(state.draft, position);
            resetConfirmation();
            drawPreview();
            for (const field of ['x', 'y']) {
                const input = $(`#adjust-${field}`);
                if (input) input.value = state.draft[field];
            }
            save();
        });
        $('#image-rights') ?.addEventListener('change', event => {
            state.draft.rightsConsent = event.target.checked;
            resetConfirmation();
            save();
            render();
        });
        $('[data-action="reset-adjustments"]') ?.addEventListener('click', () => {
            Object.assign(state.draft, {
                zoom: 1,
                x: 50,
                y: 50,
                rotation: 0
            });
            resetConfirmation();
            save();
            render();
        });
        $('#confirm-art') ?.addEventListener('change', event => {
            state.draft.confirmedAt = event.target.checked && state.draft.rightsConsent ? new Date().toISOString() : null;
            save();
            render();
        });
        $('[data-action="add-personalization"]') ?.addEventListener('click', async event => {
            if (!state.draft.confirmedAt || !state.draft.rightsConsent) return;
            event.currentTarget.disabled = true;
            const itemId = id(),
                configured = variant(),
                draft = structuredClone(state.draft),
                source = assets.get(draft.imageId),
                previewId = id();
            try {
                const canvas = $('#art-canvas');
                const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível preparar a prévia.')), 'image/png'));
                if (state.draft.imageId !== draft.imageId || state.draft.confirmedAt !== draft.confirmedAt) throw new Error('O enquadramento mudou. Revise e confirme novamente.');
                assets.set(previewId, {
                    blob,
                    url: URL.createObjectURL(blob),
                    width: canvas.width,
                    height: canvas.height
                });
                const personalization = { ...D.snapshot(draft, itemId, previewId),
                    assetId: null,
                    originalFileName: source ?.originalFileName || 'imagem',
                    mimeType: source ?.mimeType || source ?.blob.type,
                    outputAspectRatio: canvas.width / canvas.height
                };
                const item = {
                    id: itemId,
                    productId: configured ?.productId ?? null,
                    quantity: 1,
                    name: configured ?.name || 'Azulejo personalizado',
                    unitCents: publicPrice(configured),
                    personalization
                };
                if (state.privateDraftsAvailable) {
                    await privateCart.save([...state.cart, item], assets);
                    personalization.assetId = item.privateArt.originalId;
                }
                state.cart.push(item);
                state.notice = state.privateDraftsAvailable ? 'Composição e original salvos no carrinho privado.' : 'Composição salva neste dispositivo. O envio privado ainda depende da ativação da loja.';
                invalidateQuote();
                save();
                render();
            } catch (error) {
                state.notice = error.message;
                save();
                render();
            }
        });
        $('#product-search') ?.addEventListener('input', event => {
            state.search = event.target.value;
        });
        $('#catalog-filter') ?.addEventListener('submit', event => {
            event.preventDefault();
            state.search = $('#product-search').value;
            state.category = $('#product-category').value;
            state.minPrice = $('#min-price').value;
            state.maxPrice = $('#max-price').value;
            state.inStock = $('#in-stock').checked;
            render();
            $('#product-search') ?.focus();
        });
        $('#product-category') ?.addEventListener('change', event => {
            state.category = event.target.value;
            state.search = $('#product-search').value;
            render();
        });
        $('#ready-quantity') ?.addEventListener('change', event => {
            state.readyQuantity = Math.max(1, Math.min(currentProduct() ?.stock || 1, Math.floor(Number(event.target.value) || 1)));
            invalidateQuote('A quantidade mudou. Consulte novamente o frete.');
            render();
            if (/^\d{5}-?\d{3}$/.test(state.cep)) quoteShipping();
        });
        $('[data-action="add-ready"]') ?.addEventListener('click', () => {
            const product = currentProduct();
            if (!product || product.stock < state.readyQuantity) return;
            const existing = state.cart.find(item => !item.personalization && item.productId === product.id);
            if (existing && existing.quantity + state.readyQuantity > product.stock) {
                state.notice = 'A quantidade total supera o estoque cadastrado.';
                render();
                return;
            }
            if (existing) existing.quantity += state.readyQuantity;
            else state.cart.push({
                id: id(),
                productId: product.id,
                name: product.name,
                imageUrl: product.imageUrl,
                quantity: state.readyQuantity,
                unitCents: D.toCents(product.price)
            });
            state.notice = 'Produto adicionado ao carrinho.';
            invalidateQuote();
            save();
            render();
        });
        root.querySelectorAll('[data-action="quantity"]').forEach(button => button.addEventListener('click', () => {
            const item = state.cart.find(item => item.id === button.dataset.id);
            if (!item) return;
            const next = item.quantity + Number(button.dataset.delta);
            const product = state.products.find(product => product.id === item.productId);
            if (next < 1 || next > (product ?.stock ?? 100)) return;
            item.quantity = next;
            invalidateQuote('O carrinho mudou. Consulte novamente o frete.');
            save();
            render();
            if (/^\d{5}-?\d{3}$/.test(state.cep)) quoteShipping();
        }));
        root.querySelectorAll('[data-action="remove-item"]').forEach(button => button.addEventListener('click', () => {
            state.cart = state.cart.filter(item => item.id !== button.dataset.id);
            invalidateQuote('O carrinho mudou. Consulte novamente o frete.');
            save();
            render();
            if (state.cart.length && /^\d{5}-?\d{3}$/.test(state.cep)) quoteShipping();
        }));
        $('#destination-cep') ?.addEventListener('input', event => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
            state.cep = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
            event.target.value = state.cep;
            invalidateQuote();
            $('.shipping-panel .form-message').textContent = 'CEP alterado. Consulte novamente a entrega.';
            save();
        });
        $('#destination-cep') ?.addEventListener('change', () => {
            if (/^\d{5}-?\d{3}$/.test(state.cep)) quoteShipping();
        });
        $('#shipping-form') ?.addEventListener('submit', event => {
            event.preventDefault();
            quoteShipping();
        });
        $('#tracking-form') ?.addEventListener('submit', trackOrder);
    }
    async function trackOrder(event) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const result = $('#tracking-result');
        result.textContent = 'Consultando…';
        try {
            const params = new URLSearchParams({
                code: String(data.get('code')).trim(),
                phone: String(data.get('phone')).replace(/\D/g, '')
            });
            const response = await fetch(`${api}/orders/tracking?${params}`, {
                headers: {
                    'X-Tenant-Id': tenant
                }
            });
            if (!response.ok) throw new Error('Pedido não encontrado ou serviço indisponível. Confira os dados e tente novamente.');
            const order = await response.json();
            result.textContent = `Pedido ${order.code} · ${({ pending: 'Pendente', paid: 'Pagamento confirmado', processing: 'Em preparação', production: 'Em produção', payment_review: 'Pagamento em revisão', shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado' })[order.status] ?? 'Em acompanhamento'} · ${money(D.toCents(order.totalAmount))}${order.trackingCode ? ' · Rastreio: '+order.trackingCode : ''}`;
        } catch (error) {
            result.textContent = error.message === 'Failed to fetch' ? 'Não foi possível conectar à loja. Tente novamente.' : error.message;
        }
    }
    async function loadCatalog() {
        state.loading = true;
        state.error = '';
        render();
        const headers = {
            'X-Tenant-Id': tenant
        };
        await Promise.all([
            fetch(`${api}/products`, {
                headers
            }).then(async response => {
                if (!response.ok) throw new Error();
                const data = await response.json();
                if (!Array.isArray(data)) throw new Error();
                state.products = data.filter(product => product.active);
            }).catch(() => {
                state.error = 'Estamos preparando as peças e suas informações. Volte em breve para conhecer o catálogo.';
            }),
            fetch(`${api}/atelier/config`, {
                headers
            }).then(async response => {
                if (!response.ok) return;
                const data = await response.json();
                state.variants = data.tileVariants ?? [];
                state.productDetails = data.products ?? {};
                state.privateDraftsAvailable = data.privateDraftsAvailable === true;
                state.checkoutAvailable = data.personalizationCheckoutAvailable === true;
                state.draftRetentionDays = data.draftRetentionDays;
                state.maxUploadBytes = data.maxUploadBytes || 15728640;
                if (privateCart) privateCart.supportsRotation = data.personalizationSchemaVersion >= 2;
                for (const [id, p] of Object.entries(state.productDetails)) {
                    if (p.kind === 'fixed' && p.print) D.registerModel(id, Number(p.print.widthCm), Number(p.print.heightCm));
                }
                state.content.homeImages = data.homeImages || {};
                state.content.contact = data.contact || state.content.contact;
                // Instagram pode continuar vindo da configuração editorial do Ateliê.
                // WhatsApp é exclusivo do V8 Loader (contact.whatsapp), sem fonte duplicada.
                if (data.instagramUrl) {
                    state.content.socialLinks = [
                        ...(state.content.socialLinks || []).filter(link => link.label?.toLowerCase() !== 'instagram'),
                        { label: 'Instagram', url: data.instagramUrl }
                    ];
                }
                for (const [slug, body] of Object.entries(data.editorialPages || {})) {
                    if (body) state.content.pages[slug] = { ...state.content.pages[slug],
                        body
                    };
                }
            }).catch(() => {})
        ]);
        state.loading = false;
        if (!restoredSession && !state.cart.length && state.products.length) {
            try {
                const previous = JSON.parse(localStorage.getItem('alquimia-atelie-storefront-cart') || '[]');
                const personalizedIds = new Set(state.variants.map(item => item.productId));
                if (Array.isArray(previous))
                    for (const item of previous) {
                        const product = state.products.find(product => product.id === item.productId && product.stock > 0 && !personalizedIds.has(product.id));
                        if (!product || !Number.isSafeInteger(item.quantity) || item.quantity < 1) continue;
                        const existing = state.cart.find(line => line.productId === product.id);
                        if (existing) existing.quantity = Math.min(product.stock, existing.quantity + item.quantity);
                        else state.cart.push({
                            id: id(),
                            productId: product.id,
                            quantity: Math.min(product.stock, item.quantity),
                            unitCents: D.toCents(product.price),
                            name: product.name,
                            imageUrl: product.imageUrl
                        });
                    }
                if (state.cart.length) {
                    state.notice = 'Recuperamos os itens válidos do carrinho anterior. Confira os preços e quantidades atualizados.';
                    restoredSession = true;
                    save();
                }
            } catch { /* Preserve the old storage key unchanged if it cannot be migrated. */ }
        }
        render();
    }
    async function openStorage() {
        try {
            database = await new Promise((resolve, reject) => {
                const request = indexedDB.open('alquimia-atelie-drafts', 1);
                request.onupgradeneeded = () => request.result.createObjectStore('sessions');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const saved = await new Promise((resolve, reject) => {
                const request = database.transaction('sessions').objectStore('sessions').get(tenant);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            if (!saved) return;
            if (saved.expiresAt < Date.now()) {
                database.transaction('sessions', 'readwrite').objectStore('sessions').delete(tenant);
                state.notice = 'Os rascunhos locais expiraram após 24 horas e foram removidos nesta visita.';
                return;
            }
            state.draft = saved.draft;
            state.cart = saved.cart;
            if (!state.draft.modelProductId && !D.sizes.some(size => size.id === state.draft.sizeId)) {
                state.draft = { ...initialDraft(),
                    imageId: saved.draft.imageId
                };
                state.notice = 'As medidas foram atualizadas. Revise o tamanho e confirme novamente o enquadramento.';
            }
            const previousCount = state.cart.length;
            state.cart = state.cart.filter(item => !item.personalization || item.personalization.modelProductId || D.sizes.some(size => size.id === item.personalization.sizeId));
            if (state.cart.length !== previousCount) state.notice = 'Um rascunho de medida antiga foi retirado do carrinho. Recrie a composição em 15 × 20 cm e confira o corte.';
            state.cep = saved.cep || '';
            restoredSession = true;
            for (const item of state.cart) {
                const p = item.personalization;
                if (p ?.preview ?.startsWith('data:image/')) {
                    const response = await fetch(p.preview);
                    const blob = await response.blob(),
                        key = id();
                    saved.assets.push({
                        id: key,
                        blob,
                        width: 0,
                        height: 0
                    });
                    p.previewId = key;
                    delete p.preview;
                }
            }
            for (const asset of saved.assets) {
                const image = new Image(),
                    url = URL.createObjectURL(asset.blob);
                image.src = url;
                await image.decode();
                assets.set(asset.id, { ...asset,
                    image,
                    url
                });
            }
            save();
        } catch {
            state.storageWarning = 'Não foi possível restaurar ou salvar rascunhos neste navegador. Mantenha esta aba aberta para preservar suas imagens.';
        }
    }

    function save() {
        const referenced = new Set([state.draft.imageId, ...state.cart.flatMap(item => [item.personalization ?.imageId, item.personalization ?.previewId])].filter(Boolean));
        for (const [key, asset] of assets)
            if (!referenced.has(key)) {
                URL.revokeObjectURL(asset.url);
                assets.delete(key);
            }
        if (!database) return;
        const record = {
            draft: structuredClone(state.draft),
            cart: structuredClone(state.cart),
            cep: state.cep,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            assets: [...assets.entries()].map(([key, asset]) => ({
                id: key,
                blob: asset.blob,
                width: asset.width,
                height: asset.height,
                originalFileName: asset.originalFileName,
                mimeType: asset.mimeType
            }))
        };
        saveQueue = saveQueue.then(() => new Promise((resolve, reject) => {
            const transaction = database.transaction('sessions', 'readwrite');
            transaction.objectStore('sessions').put(record, tenant);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        })).catch(() => {
            state.storageWarning = 'Não foi possível salvar as últimas alterações neste dispositivo. Mantenha a aba aberta.';
            render();
        });
    }
    window.addEventListener('hashchange', () => {
        uploadRevision++;
        invalidateQuote();
        state.readyQuantity = 1;
        render();
        window.scrollTo({
            top: 0,
            behavior: 'instant'
        });
        $('#main-content') ?.focus({
            preventScroll: true
        });
        if (route() === 'produtos') $('#product-search') ?.focus();
        if (route().startsWith('pedido/')) refreshOrder();
        if (['carrinho', 'checkout'].includes(route()) && state.cart.length && /^\d{5}-?\d{3}$/.test(state.cep)) quoteShipping();
    });
    window.addEventListener('beforeunload', event => {
        if (state.storageWarning && assets.size) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
    try {
        const response = await fetch('/config/content.json');
        if (response.ok) state.content = await response.json();
    } catch { /* Editorial empty states are intentional. */ }
    if (state.content.faviconUrl && safeImage(state.content.faviconUrl)) {
        const favicon = document.createElement('link');
        favicon.rel = 'icon';
        favicon.href = safeImage(state.content.faviconUrl);
        document.head.appendChild(favicon);
    }
    await openStorage();
    render();
    // O Loader pode concluir a leitura do contato depois do primeiro render.
    // Re-renderiza para exibir o botão assim que contact.whatsapp estiver disponível.
    if (window.V8?.ready && typeof window.V8.ready.then === 'function') {
        window.V8.ready.then(() => render()).catch(() => {});
    }
    loadCatalog();
    if (route().startsWith('pedido/')) refreshOrder();
})();