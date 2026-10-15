/*!
 * V8 LOADER v3 — conecta qualquer site ao V8 Admin Universal.
 *
 * USO MÍNIMO (antes de </body>):
 *   <script src="js/v8-loader.js" data-project-id="ID_DO_PROJETO"></script>
 *
 * Também aceita data-v8-project / data-project-id no <html> ou <body>.
 * Opcional no <script>: data-api-url="https://outro-worker..." (ou data-api),
 * data-style="off" (não injeta o CSS do catálogo/avaliações),
 * data-v8-scripts="off" (NÃO injeta scripts.head/body/footer; por padrão injeta).
 *
 * COMPATÍVEL COM O LOADER ANTIGO: campo vazio some (display:none); <a data-v8>
 * só troca o href (texto do botão fica); <iframe data-v8-video hidden> recebe
 * o src; galeria usa .v8-gallery-item; <form data-v8-form> com Formspree
 * envia nativamente e copia o lead pro painel.
 *
 * TEXTO / LINKS
 *   data-v8="contact.whatsapp"      texto do campo; em <a> define o href (wa.me/mailto/tel/URL)
 *   data-v8-text="true"             (em <a>) troca também o texto do link pelo valor
 *   data-v8-href="social.instagram" define href
 *   data-v8-src="seo.ogImage"       define src
 *   data-v8-attr="content:seo.title" define qualquer atributo
 *   data-v8-show="contact.email"    esconde o elemento se o campo estiver vazio
 *   Caminhos: contact.* social.* content.* location.* seo.* media.* name siteUrl ...
 *
 * MÍDIA
 *   <div data-v8-gallery></div>      galeria (media.galleryImages)
 *   <div data-v8-video></div>        vídeo YouTube/Vimeo/mp4 (media.video)
 *   <div data-v8-maps-embed></div>   mapa (location.embed ou mapsUrl)
 *   <div data-v8-reviews></div>      avaliações do Google (data-limit="3")
 *
 * FORMULÁRIO → LEADS
 *   <form data-v8-form> com campos name, email, phone, message.
 *   Com Formspree no painel: envio nativo + cópia do lead (como antes).
 *   Sem Formspree (ou data-v8-ajax="true"): envia por AJAX e mostra mensagem.
 *   Eventos: v8:lead-sent / v8:lead-error. Atributos: data-success="Texto".
 *
 * CATÁLOGO (categorias, subcategorias e tags)
 *   <div data-v8-catalog></div>
 *   data-layout="vitrine"      uma seção por categoria (subcategorias dentro), como no painel
 *   data-filters="true"        abas de categoria/subcategoria (layout grade) + filtro por tag
 *   data-search="true"         campo de busca (nome, descrição, tag, categoria)
 *   data-others-label="Outros" título da seção dos itens sem categoria (vitrine)
 *   data-category="Nome|id"    limita a uma categoria (inclui subcategorias)
 *   data-tag="Nome|id"  data-type="service"  data-featured="true"  data-limit="6"
 *   data-cta="whatsapp"        botão que abre o WhatsApp com o nome do item
 *   data-cta="pay"             botão "Pagar agora" (Pix/cartão); aceita lista: "whatsapp,pay"
 *   data-pay-label="Comprar"   texto do botão de pagar
 *   data-cta-label="Pedir orçamento"
 *
 * PAGAMENTO (InfinitePay / Mercado Pago, configurados na aba Pagamentos do painel)
 *   <button data-v8-pay="ID_DO_ITEM">Pagar</button>   cria a cobrança (valor vem do catálogo)
 *   e leva o cliente ao checkout. Opcionais: data-qty="2" data-provider="infinitepay"
 *   data-redirect="https://.../obrigado" data-form="#meuForm" (pega nome/e-mail/telefone).
 *   O botão some se nenhum provedor estiver ativo. Eventos: v8:pay-started / v8:pay-error.
 *
 * LOJA PRÓPRIA (site com carrinho próprio): <script src="v8-loader.js" data-project-id="ID" data-catalog="true">
 *   carrega o catálogo sem desenhar nada; use V8.ready.then(...) e V8.catalog / V8.config.ecommerce.
 *
 * ANÚNCIOS (Meta/Google): o loader guarda utm_*, fbclid e gclid da 1ª visita e anexa ao lead.
 *   <a data-v8-event="Contact">  dispara o evento ao clicar (Pixel e GA). "custom:Nome" = evento personalizado.
 *
 * JS: window.V8 = { ready, config, catalog, field(path), formatMoney(n), reload() }
 *     evento document "v8:ready" e "v8:catalog".
 */
(function () {
  "use strict";
  if (window.V8 && window.V8.__v3) return;

  var DEFAULT_API = "https://v8adminuniversal.aisermelk.workers.dev";
  var script = document.currentScript || document.querySelector("script[src*='v8-loader']");
  var root = document.documentElement, body = document.body;

  function attr(el, name) { return el && el.getAttribute ? (el.getAttribute(name) || "").trim() : ""; }
  var PROJECT_ID = attr(script, "data-project-id") || attr(script, "data-v8-project") ||
    attr(root, "data-project-id") || attr(root, "data-v8-project") ||
    attr(body, "data-project-id") || attr(body, "data-v8-project") ||
    ((document.querySelector("[data-project-id]") || {}).getAttribute ? attr(document.querySelector("[data-project-id]"), "data-project-id") : "");
  var API = (attr(script, "data-api-url") || attr(script, "data-api") || DEFAULT_API).replace(/\/+$/, "");
  var STYLE_ON = attr(script, "data-style") !== "off";
  var WANT_CATALOG = attr(script, "data-catalog") === "true";
  var SCRIPTS_ON = ["off", "false"].indexOf(attr(script, "data-v8-scripts")) < 0;

  var state = { config: null, catalog: null, reviews: null };

  /* ---------- utilidades ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function get(obj, path) {
    return String(path || "").split(".").reduce(function (o, k) { return o != null ? o[k] : undefined; }, obj);
  }
  function field(path) { return get(state.config || {}, path); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function formatMoney(n) {
    return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function digits(v) { return String(v || "").replace(/\D/g, ""); }
  function safeUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(u)) return u;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return "https://" + u;
    return "";
  }
  function waLink(number, text) {
    var d = digits(number);
    if (!d) return "";
    if (d.length <= 11) d = "55" + d;
    return "https://wa.me/" + d + (text ? "?text=" + encodeURIComponent(text) : "");
  }
  function request(path, options) {
    return fetch(API + path, options).then(function (r) {
      return r.json().catch(function () { return { success: false, error: "Erro " + r.status }; });
    });
  }
  function unwrapProject(data) {
    if (!data) return null;
    if (data.project && typeof data.project === "object") return data.project;
    if (data.data && data.data.project) return data.data.project;
    return data.id ? data : null;
  }
  function fire(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {}
  }
  function injectStyle() {
    if (!STYLE_ON || document.getElementById("v8-loader-style")) return;
    var css = ".v8-reviews{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}.v8-review{border:1px solid rgba(128,128,128,.3);border-radius:12px;padding:16px}.v8-stars{color:#f5a623}" +
      ".v8-filters{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.v8-filters button{border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;padding:7px 14px;border-radius:999px;cursor:pointer;font:inherit}.v8-filters button.active{background:currentColor}.v8-filters button.active span{color:#fff;mix-blend-mode:difference}" +
      ".v8-catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}.v8-card{border:1px solid rgba(128,128,128,.3);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}.v8-card-media{aspect-ratio:4/3;background:rgba(128,128,128,.12);display:grid;place-items:center}.v8-card-media img{width:100%;height:100%;object-fit:cover}" +
      ".v8-card-body{padding:14px;display:flex;flex-direction:column;gap:6px;flex:1}.v8-card-body h3{margin:0;font-size:1.05em}.v8-card-body p{margin:0;opacity:.75;font-size:.92em}.v8-price{font-weight:700}.v8-badge{font-size:.72em;padding:2px 8px;border-radius:999px;border:1px solid currentColor;margin-right:4px}.v8-tags{display:flex;gap:6px;flex-wrap:wrap}.v8-tag{font-size:.78em;opacity:.7}.v8-cta{margin-top:auto;display:inline-block;text-align:center;padding:10px 14px;border-radius:10px;border:1px solid currentColor;text-decoration:none;color:inherit}" +
      ".v8-form-msg{margin-top:10px;font-size:.92em}" +
      ".v8-search-input{width:100%;max-width:420px;box-sizing:border-box;padding:10px 14px;margin:0 0 12px;border:1px solid rgba(128,128,128,.4);border-radius:10px;background:transparent;color:inherit;font:inherit}" +
      ".v8-vitrine-section{margin:0 0 36px}.v8-vitrine-title{margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid rgba(128,128,128,.3)}.v8-vitrine-sub{margin:20px 0 0}.v8-vitrine-subtitle{margin:0 0 12px;opacity:.8;font-size:1.05em}.v8-empty{opacity:.7}";
    var st = document.createElement("style"); st.id = "v8-loader-style"; st.textContent = css; document.head.appendChild(st);
  }

  /* ---------- config: texto, links, SEO, tracking ---------- */
  var SOCIAL_BASE = { instagram: "https://instagram.com/", tiktok: "https://tiktok.com/@", facebook: "https://facebook.com/" };
  function toHref(path, value) {
    var v = String(value || "").trim();
    if (!v) return "";
    if (/(^|\.)whatsapp$/.test(path)) return waLink(v);
    if (/(^|\.)email$/.test(path)) return "mailto:" + v;
    if (/(^|\.)phone$/.test(path)) return "tel:" + digits(v);
    var net = path.indexOf("social.") === 0 ? path.slice(7) : "";
    if (net && SOCIAL_BASE[net] && !/^(https?:)?\/\//i.test(v)) {
      if (/^(www\.|m\.)?(instagram|tiktok|facebook|fb)\.[a-z.]+\//i.test(v)) return "https://" + v;
      if (v.indexOf("/") < 0) return SOCIAL_BASE[net] + v.replace(/^@/, ""); // só o @usuario
    }
    return safeUrl(v);
  }
  function bindFields(cfg) {
    qsa("[data-v8]").forEach(function (el) {
      var path = attr(el, "data-v8"), val = get(cfg, path);
      // Igual ao loader antigo: campo vazio no painel some da tela.
      if (val == null || val === "" || val === false) { el.style.display = "none"; return; }
      if (typeof val === "object") return;
      el.style.display = el.style.display === "none" ? "" : el.style.display;
      if (el.tagName === "A") {
        var href = toHref(path, val); if (href) el.setAttribute("href", href);
        // O texto do link é preservado (ex.: "Falar no WhatsApp"). Use data-v8-text="true" para trocar pelo valor.
        if (attr(el, "data-v8-text") === "true") el.textContent = String(val);
      } else if (el.tagName === "IMG") {
        el.setAttribute("src", safeUrl(val));
      } else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.value = String(val);
      } else {
        el.textContent = String(val);
      }
    });
    qsa("[data-v8-href]").forEach(function (el) {
      var p = attr(el, "data-v8-href"), h = toHref(p, get(cfg, p)); if (h) el.setAttribute("href", h);
    });
    qsa("[data-v8-src]").forEach(function (el) {
      var u = safeUrl(get(cfg, attr(el, "data-v8-src"))); if (u) el.setAttribute("src", u);
    });
    qsa("[data-v8-attr]").forEach(function (el) {
      attr(el, "data-v8-attr").split(",").forEach(function (pair) {
        var i = pair.indexOf(":"); if (i < 1) return;
        var a = pair.slice(0, i).trim(), p = pair.slice(i + 1).trim(), v = get(cfg, p);
        if (v != null && v !== "" && typeof v !== "object" && !/^on/i.test(a)) el.setAttribute(a, String(v));
      });
    });
    qsa("[data-v8-show]").forEach(function (el) {
      var v = get(cfg, attr(el, "data-v8-show")), empty = v == null || v === "" || v === false || (Array.isArray(v) && !v.length);
      if (empty) el.hidden = true; else el.hidden = false;
    });
  }
  function setMeta(selector, create, value) {
    if (!value) return;
    var el = document.head.querySelector(selector);
    if (!el) { el = document.createElement(create.tag); Object.keys(create.attrs).forEach(function (k) { el.setAttribute(k, create.attrs[k]); }); document.head.appendChild(el); }
    el.setAttribute(create.valueAttr, value);
  }
  function applySeo(cfg) {
    var seo = cfg.seo || {};
    if (seo.title) document.title = seo.title;
    setMeta('meta[name="description"]', { tag: "meta", attrs: { name: "description" }, valueAttr: "content" }, seo.description);
    setMeta('meta[name="keywords"]', { tag: "meta", attrs: { name: "keywords" }, valueAttr: "content" }, seo.keywords);
    setMeta('meta[name="robots"]', { tag: "meta", attrs: { name: "robots" }, valueAttr: "content" }, seo.robots);
    setMeta('meta[property="og:title"]', { tag: "meta", attrs: { property: "og:title" }, valueAttr: "content" }, seo.title);
    setMeta('meta[property="og:description"]', { tag: "meta", attrs: { property: "og:description" }, valueAttr: "content" }, seo.description);
    setMeta('meta[property="og:image"]', { tag: "meta", attrs: { property: "og:image" }, valueAttr: "content" }, safeUrl(seo.ogImage));
    setMeta('link[rel="canonical"]', { tag: "link", attrs: { rel: "canonical" }, valueAttr: "href" }, safeUrl(seo.canonical));
  }
  function addScriptSrc(src, id) {
    if (id && document.getElementById(id)) return;
    var s = document.createElement("script"); s.async = true; s.src = src; if (id) s.id = id; document.head.appendChild(s);
  }
  function addInline(code, id) {
    if (id && document.getElementById(id)) return;
    var s = document.createElement("script"); if (id) s.id = id; s.text = code; document.head.appendChild(s);
  }
  function findId(value, regex) {
    var v = String(value || "").trim(), m = v.match(regex);
    if (m) return m[0];
    return v && !/[\s<>"']/.test(v) ? v : ""; // valor simples (já é o ID): usa como está
  }
  function applyTracking(cfg) {
    var t = cfg.tracking || {};
    var gtm = findId(t.tag, /GTM-[A-Z0-9]+/i);
    if (gtm) {
      addInline("(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','" + gtm.toUpperCase() + "');", "v8-gtm");
    }
    var ga = findId(t.analytics, /\b(G-[A-Z0-9]{4,}|UA-\d+-\d+)\b/i);
    if (ga) {
      addScriptSrc("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga), "v8-ga");
      addInline("window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','" + ga + "');", "v8-ga-init");
    }
    var px = findId(t.pixel, /\b\d{10,20}\b/);
    if (px) {
      addInline("!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','" + px + "');fbq('track','PageView');", "v8-pixel");
    }
  }
  function applyCustomScripts(cfg) {
    if (!SCRIPTS_ON) return;
    var sc = cfg.scripts || {};
    [["head", document.head], ["body", document.body], ["footer", document.body]].forEach(function (pair) {
      var code = sc[pair[0]]; if (!code) return;
      var tpl = document.createElement("template"); tpl.innerHTML = code;
      Array.prototype.slice.call(tpl.content.childNodes).forEach(function (node) {
        if (node.nodeName === "SCRIPT") {
          var s = document.createElement("script");
          Array.prototype.slice.call(node.attributes).forEach(function (a) { s.setAttribute(a.name, a.value); });
          s.text = node.textContent; pair[1].appendChild(s);
        } else pair[1].appendChild(node);
      });
    });
  }

  /* ---------- mídia ---------- */
  function renderGallery(cfg) {
    var imgs = (cfg.media && cfg.media.galleryEnabled !== false && Array.isArray(cfg.media.galleryImages)) ? cfg.media.galleryImages : [];
    qsa("[data-v8-gallery]").forEach(function (el) {
      var urls = imgs.map(function (i) { return safeUrl(typeof i === "string" ? i : (i && (i.url || i.src))); }).filter(Boolean);
      if (!urls.length) { el.style.display = "none"; return; }
      el.hidden = false; el.style.display = "";
      el.innerHTML = urls.map(function (u, i) { return '<img class="v8-gallery-item" src="' + esc(u) + '" alt="' + esc((cfg.name || "Imagem") + " " + (i + 1)) + '" loading="lazy">'; }).join("");
    });
  }
  function videoSrc(url) {
    url = safeUrl(url); if (!url) return "";
    var yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
    if (yt) return "https://www.youtube.com/embed/" + yt[1];
    var vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vm) return "https://player.vimeo.com/video/" + vm[1];
    return url;
  }
  function renderVideo(cfg) {
    qsa("[data-v8-video]").forEach(function (el) {
      var m = cfg.media || {}, src = m.videoEnabled !== false && m.video ? videoSrc(m.video) : "";
      if (!src) { el.hidden = true; return; }
      if (el.tagName === "IFRAME") { el.setAttribute("src", src); el.setAttribute("allowfullscreen", ""); if (!el.getAttribute("loading")) el.setAttribute("loading", "lazy"); el.hidden = false; return; }
      if (el.tagName === "VIDEO") { el.setAttribute("src", src); el.hidden = false; return; }
      el.hidden = false;
      el.innerHTML = /\.(mp4|webm|ogg)(\?.*)?$/i.test(src) ? '<video src="' + esc(src) + '" controls playsinline style="width:100%"></video>' : '<iframe src="' + esc(src) + '" title="Vídeo" allowfullscreen loading="lazy" style="width:100%;aspect-ratio:16/9;border:0"></iframe>';
    });
  }
  function mapsSrc(loc) {
    loc = loc || {};
    var raw = String(loc.embed || "").trim(), src = "";
    var m = raw.match(/src=["']([^"']+)["']/i); src = m ? m[1] : (/^https?:/i.test(raw) ? raw : "");
    if (!src && loc.mapsUrl) {
      var u = safeUrl(loc.mapsUrl);
      if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(u)) src = "https://www.google.com/maps?q=" + encodeURIComponent(loc.address || u) + "&output=embed";
    }
    if (!src && loc.address) src = "https://www.google.com/maps?q=" + encodeURIComponent(loc.address) + "&output=embed";
    return /^https:\/\//i.test(src) ? src : "";
  }
  function renderMaps(cfg) {
    qsa("[data-v8-maps-embed]").forEach(function (el) {
      var loc = cfg.location || {}, src = loc.enabled === false ? "" : mapsSrc(loc);
      if (!src) { el.style.display = "none"; return; }
      el.hidden = false; el.style.display = "";
      el.innerHTML = '<iframe src="' + esc(src) + '" title="Mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen style="width:100%;min-height:320px;border:0"></iframe>';
    });
  }
  function renderReviews() {
    var boxes = qsa("[data-v8-reviews]"); if (!boxes.length) return Promise.resolve();
    return request("/api/public/reviews/" + encodeURIComponent(PROJECT_ID)).then(function (r) {
      state.reviews = r;
      boxes.forEach(function (el) {
        var list = (r && r.success && r.enabled !== false && r.reviews) || [], limit = parseInt(attr(el, "data-limit"), 10) || list.length;
        if (!list.length) { el.hidden = true; return; }
        el.hidden = false; el.classList.add("v8-reviews");
        el.innerHTML = list.slice(0, limit).map(function (rv) {
          var n = Math.max(0, Math.min(5, Math.round(rv.rating || 0)));
          return '<article class="v8-review"><div class="v8-stars" aria-label="' + n + ' de 5">' + "★".repeat(n) + "☆".repeat(5 - n) + "</div><p>" + esc(rv.text) + "</p><strong>" + esc(rv.author) + "</strong> <small>" + esc(rv.relativeTime) + "</small></article>";
        }).join("");
      });
    }).catch(function () { boxes.forEach(function (el) { el.hidden = true; }); });
  }

  /* ---------- formulário → leads ---------- */
  /* Origem da campanha (anúncios): guarda utm_* e fbclid da 1ª visita da sessão e anexa ao lead. */
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];
  function captureUtm() {
    try {
      var saved = JSON.parse(sessionStorage.getItem("v8_utm") || "{}"), q = new URLSearchParams(location.search), changed = false;
      UTM_KEYS.forEach(function (k) { var v = q.get(k); if (v) { saved[k] = v.slice(0, 200); changed = true; } });
      if (changed || !saved._page) { saved._page = location.pathname; saved._ref = saved._ref || (document.referrer || "").slice(0, 200); sessionStorage.setItem("v8_utm", JSON.stringify(saved)); }
      return saved;
    } catch (e) { return {}; }
  }
  function utmLines() {
    var u = captureUtm(), out = [];
    UTM_KEYS.forEach(function (k) { if (u[k]) out.push(k + ": " + u[k]); });
    out.push("página: " + location.pathname);
    return out;
  }
  function leadPayload(form) {
    var fd = new FormData(form);
    var data = {
      name: String(fd.get("name") || fd.get("nome") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      phone: String(fd.get("phone") || fd.get("telefone") || fd.get("whatsapp") || "").trim(),
      message: String(fd.get("message") || fd.get("mensagem") || "").trim()
    };
    var extras = [];
    fd.forEach(function (v, k) {
      if (["name", "nome", "email", "phone", "telefone", "whatsapp", "message", "mensagem", "_gotcha", "_subject", "_next", "_replyto"].indexOf(k) < 0 && typeof v === "string" && v.trim()) extras.push(k + ": " + v.trim());
    });
    extras = extras.concat(utmLines());
    if (extras.length) data.message = (data.message ? data.message + "\n\n" : "") + extras.join("\n");
    return { fd: fd, data: data };
  }
  function sendLead(data) {
    return fetch(API + "/api/public/leads/" + encodeURIComponent(PROJECT_ID), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), keepalive: true })
      .then(function (r) { return r.json().catch(function () { return { success: r.ok }; }); });
  }
  function bindForms(cfg) {
    var fs = cfg && /^https:\/\/formspree\.io\//i.test(cfg.formspree || "") ? cfg.formspree : "";
    qsa("form[data-v8-form]").forEach(function (form) {
      if (form.__v8) return; form.__v8 = true;
      // Modo Formspree (compatível com o loader antigo): o <form> envia nativamente e o lead é copiado pro painel.
      var native = !!fs && attr(form, "data-v8-ajax") !== "true";
      if (native) { form.setAttribute("action", fs); if (!form.getAttribute("method")) form.setAttribute("method", "POST"); }
      form.addEventListener("submit", function (e) {
        var p = leadPayload(form);
        if (p.fd.get("_gotcha")) { if (!native) e.preventDefault(); return; } // honeypot
        if (native) {
          sendLead(p.data).then(function (r) { fire("v8:lead-sent", { lead: r && r.lead, form: form }); }).catch(function () {});
          if (window.fbq) { try { window.fbq("track", "Lead"); } catch (x) {} }
          return; // sem preventDefault: o navegador segue para o Formspree
        }
        e.preventDefault();
        var btn = form.querySelector('[type="submit"]'), msg = form.querySelector(".v8-form-msg");
        if (!msg) { msg = document.createElement("div"); msg.className = "v8-form-msg"; msg.setAttribute("role", "status"); form.appendChild(msg); }
        if (btn) btn.disabled = true; msg.textContent = "Enviando...";
        sendLead(p.data)
          .then(function (r) {
            if (!r || r.success === false) throw new Error((r && r.error) || "Não foi possível enviar.");
            msg.textContent = attr(form, "data-success") || "Mensagem enviada! Em breve entraremos em contato.";
            form.reset(); fire("v8:lead-sent", { lead: r.lead, form: form });
            if (window.fbq) { try { window.fbq("track", "Lead"); } catch (x) {} }
            if (window.gtag) { try { window.gtag("event", "generate_lead"); } catch (x) {} }
          })
          .catch(function (err) { msg.textContent = err.message || "Erro ao enviar. Tente novamente."; fire("v8:lead-error", { error: err, form: form }); })
          .then(function () { if (btn) btn.disabled = false; });
      });
    });
  }

  /* ---------- catálogo ---------- */
  function catById(id) { return (state.catalog.categories || []).filter(function (c) { return c.id === id; })[0]; }
  function catKids(id) { return (state.catalog.categories || []).filter(function (c) { return c.parentId === id; }); }
  function resolveCat(v) {
    if (!v) return "";
    var low = v.toLowerCase();
    var c = (state.catalog.categories || []).filter(function (x) { return x.id === v || x.name.toLowerCase() === low; })[0];
    return c ? c.id : "__none__";
  }
  function resolveTag(v) {
    if (!v) return "";
    var low = v.toLowerCase();
    var t = (state.catalog.tags || []).filter(function (x) { return x.id === v || x.name.toLowerCase() === low; })[0];
    return t ? t.id : "__none__";
  }
  function catPath(id) { var c = catById(id); if (!c) return ""; var p = c.parentId ? catById(c.parentId) : null; return p ? p.name + " › " + c.name : c.name; }
  /* ---------- pagamento (InfinitePay / Mercado Pago) ---------- */
  function payEnabled() {
    var pay = (state.config && state.config.payments) || {};
    return !!((pay.infinitePay && pay.infinitePay.enabled) || (pay.mercadoPago && pay.mercadoPago.enabled));
  }
  function payLabelFor() {
    var box = document.querySelector("[data-pay-label]");
    return box ? attr(box, "data-pay-label") : "Pagar agora";
  }
  function startPayment(btn) {
    if (btn.__busy) return;
    var itemId = attr(btn, "data-v8-pay"); if (!itemId) return;
    var scope = btn.closest ? btn.closest("[data-v8-catalog]") : null;
    var form = attr(btn, "data-form") ? document.querySelector(attr(btn, "data-form")) : null;
    var data = { itemId: itemId, quantity: parseInt(attr(btn, "data-qty"), 10) || 1, provider: attr(btn, "data-provider") || attr(scope, "data-provider") || "", redirectUrl: attr(btn, "data-redirect") || attr(scope, "data-redirect") || location.href.split("#")[0] };
    if (form) { var fd = new FormData(form); data.name = String(fd.get("name") || fd.get("nome") || ""); data.email = String(fd.get("email") || ""); data.phone = String(fd.get("phone") || fd.get("telefone") || fd.get("whatsapp") || ""); }
    var original = btn.textContent; btn.__busy = true; btn.disabled = true; btn.textContent = "Aguarde...";
    request("/api/public/payments/" + encodeURIComponent(PROJECT_ID) + "/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) {
        if (!r || r.success === false || !r.url) throw new Error((r && r.error) || "Não foi possível iniciar o pagamento.");
        fire("v8:pay-started", { url: r.url, paymentId: r.paymentId });
        if (window.fbq) { try { window.fbq("track", "InitiateCheckout"); } catch (x) {} }
        window.location.href = r.url;
      })
      .catch(function (err) { fire("v8:pay-error", { error: err }); alert(err.message || "Erro ao iniciar o pagamento."); btn.__busy = false; btn.disabled = false; btn.textContent = original; });
  }
  function bindPay() {
    qsa("[data-v8-pay]").forEach(function (el) { if (!payEnabled() && !el.closest("[data-v8-catalog]")) el.hidden = true; });
    if (document.__v8payBound) return; document.__v8payBound = true;
    document.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-v8-pay]") : null; if (!b || !payEnabled()) return;
      e.preventDefault(); startPayment(b);
    });
  }

  function cardHtml(p, cta, ctaLabel, showPath) {
    var tags = (p.tags || []).map(function (id) { return (state.catalog.tags || []).filter(function (t) { return t.id === id; })[0]; }).filter(Boolean);
    var price = p.price == null ? "Sob consulta" : formatMoney(p.price);
    var ctas = String(cta || "").split(",").map(function (x) { return x.trim(); });
    var link = ctas.indexOf("whatsapp") >= 0 ? waLink(field("contact.whatsapp"), "Olá! Tenho interesse em: " + p.name) : "";
    var payBtn = ctas.indexOf("pay") >= 0 && p.price != null && payEnabled() ? '<button type="button" class="v8-cta v8-pay" data-v8-pay="' + esc(p.id) + '">' + esc(payLabelFor(cta)) + "</button>" : "";
    return '<article class="v8-card" data-id="' + esc(p.id) + '"><div class="v8-card-media">' + ((p.cover || p.image) ? '<img src="' + esc(safeUrl(p.cover || p.image)) + '" alt="' + esc(p.name) + '" loading="lazy">' : "") + '</div><div class="v8-card-body">' +
      ((p.featured || p.promotion) ? "<div>" + (p.featured ? '<span class="v8-badge">Destaque</span>' : "") + (p.promotion ? '<span class="v8-badge">Promoção</span>' : "") + "</div>" : "") +
      "<h3>" + esc(p.name) + "</h3>" + (showPath && catPath(p.categoryId) ? '<small class="v8-path">' + esc(catPath(p.categoryId)) + "</small>" : "") +
      (p.description ? "<p>" + esc(p.description) + "</p>" : "") +
      (tags.length ? '<div class="v8-tags">' + tags.map(function (t) { return '<span class="v8-tag">#' + esc(t.name) + "</span>"; }).join("") + "</div>" : "") +
      '<div class="v8-price">' + esc(price) + "</div>" + (payBtn || "") + (link ? '<a class="v8-cta" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(ctaLabel) + "</a>" : "") + "</div></article>";
  }
  function gridHtml(items, cta, ctaLabel, showPath) {
    return '<div class="v8-catalog-grid">' + items.map(function (p) { return cardHtml(p, cta, ctaLabel, showPath); }).join("") + "</div>";
  }
  function catalogOpts(el) {
    return {
      baseCat: resolveCat(attr(el, "data-category")), baseTag: resolveTag(attr(el, "data-tag")),
      type: attr(el, "data-type"), featured: attr(el, "data-featured") === "true", limit: parseInt(attr(el, "data-limit"), 10) || 0,
      filters: attr(el, "data-filters") === "true", search: attr(el, "data-search") === "true",
      layout: attr(el, "data-layout") === "vitrine" ? "vitrine" : "grid",
      cta: attr(el, "data-cta"), ctaLabel: attr(el, "data-cta-label") || "Pedir orçamento",
      othersLabel: attr(el, "data-others-label") || "Outros", emptyText: attr(el, "data-empty") || "Nenhum item encontrado."
    };
  }
  function catalogItems(o, ui) {
    var activeCat = ui.sub || ui.cat || o.baseCat, ids = null, q = (ui.q || "").trim().toLowerCase();
    if (activeCat) { ids = {}; ids[activeCat] = 1; catKids(activeCat).forEach(function (k) { ids[k.id] = 1; }); }
    var tagId = ui.tag || o.baseTag;
    var list = (state.catalog.products || []).filter(function (p) {
      if (ids && !ids[p.categoryId]) return false;
      if (tagId && (p.tags || []).indexOf(tagId) < 0) return false;
      if (o.type && p.itemType !== o.type) return false;
      if (o.featured && !p.featured) return false;
      if (q) {
        var tn = (p.tags || []).map(function (id) { var t = (state.catalog.tags || []).filter(function (x) { return x.id === id; })[0]; return t ? t.name : ""; }).join(" ");
        if ((p.name + " " + (p.description || "") + " " + tn + " " + catPath(p.categoryId)).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    return o.limit ? list.slice(0, o.limit) : list;
  }
  /* Vitrine: uma seção por categoria (subcategorias dentro). */
  function vitrineHtml(list, o) {
    var cats = state.catalog.categories || [], html = "";
    var roots = cats.filter(function (c) { return !c.parentId; });
    if (o.baseCat && o.baseCat !== "__none__") { var bc = catById(o.baseCat); roots = bc ? [bc] : []; }
    roots.forEach(function (r) {
      var direct = list.filter(function (p) { return p.categoryId === r.id; });
      var blocks = (r.parentId ? [] : catKids(r.id)).map(function (k) { return { k: k, items: list.filter(function (p) { return p.categoryId === k.id; }) }; }).filter(function (b) { return b.items.length; });
      if (!direct.length && !blocks.length) return;
      html += '<section class="v8-vitrine-section" data-category-id="' + esc(r.id) + '"><h2 class="v8-vitrine-title">' + esc(r.name) + "</h2>";
      if (direct.length) html += gridHtml(direct, o.cta, o.ctaLabel, false);
      blocks.forEach(function (b) { html += '<div class="v8-vitrine-sub"><h3 class="v8-vitrine-subtitle">' + esc(b.k.name) + "</h3>" + gridHtml(b.items, o.cta, o.ctaLabel, false) + "</div>"; });
      html += "</section>";
    });
    if (!o.baseCat) {
      var known = {}; cats.forEach(function (c) { known[c.id] = 1; });
      var loose = list.filter(function (p) { return !p.categoryId || !known[p.categoryId]; });
      if (loose.length) html += '<section class="v8-vitrine-section" data-category-id=""><h2 class="v8-vitrine-title">' + esc(o.othersLabel) + "</h2>" + gridHtml(loose, o.cta, o.ctaLabel, false) + "</section>";
    }
    return html;
  }
  function paintCatalogFilters(el, o, ui) {
    var slot = el.querySelector(".v8-catalog-filters"); if (!slot) return;
    var btn = function (label, on, kind, id) { return '<button type="button" class="' + (on ? "active" : "") + '" data-v8-f="' + kind + '" data-id="' + esc(id) + '"><span>' + esc(label) + "</span></button>"; };
    var html = "";
    if (o.filters) {
      if (o.layout !== "vitrine") {
        var roots = (state.catalog.categories || []).filter(function (c) { return !c.parentId; });
        var top = o.baseCat && o.baseCat !== "__none__" ? catKids(o.baseCat) : (o.baseCat ? [] : roots);
        if (top.length) {
          html += '<div class="v8-filters">' + btn("Todas", !(ui.cat || ui.sub), "cat", "") + top.map(function (c) { return btn(c.name, ui.cat === c.id, "cat", c.id); }).join("") + "</div>";
          var kids = ui.cat && !o.baseCat ? catKids(ui.cat) : [];
          if (kids.length) html += '<div class="v8-filters">' + btn("Todas", !ui.sub, "sub", "") + kids.map(function (c) { return btn(c.name, ui.sub === c.id, "sub", c.id); }).join("") + "</div>";
        }
      }
      if ((state.catalog.tags || []).length) {
        html += '<div class="v8-filters">' + btn("Todas as tags", !ui.tag, "tag", "") + state.catalog.tags.map(function (t) { return btn("#" + t.name, ui.tag === t.id, "tag", t.id); }).join("") + "</div>";
      }
    }
    slot.innerHTML = html;
  }
  function paintCatalogResults(el, o, ui) {
    var slot = el.querySelector(".v8-catalog-results"); if (!slot) return;
    var list = catalogItems(o, ui);
    var html = list.length ? (o.layout === "vitrine" ? vitrineHtml(list, o) : gridHtml(list, o.cta, o.ctaLabel, true)) : "";
    slot.innerHTML = html || '<p class="v8-empty">' + esc(o.emptyText) + "</p>";
  }
  function renderCatalog() {
    var boxes = qsa("[data-v8-catalog]"); if (!boxes.length || !state.catalog) return;
    boxes.forEach(function (el) {
      var o = catalogOpts(el), ui = el.__v8ui = el.__v8ui || { cat: "", sub: "", tag: "", q: "" };
      if (!el.__v8init) {
        el.__v8init = true;
        el.innerHTML = '<div class="v8-catalog-search"></div><div class="v8-catalog-filters"></div><div class="v8-catalog-results"></div>';
        if (o.search) {
          var inp = document.createElement("input"); inp.type = "search"; inp.className = "v8-search-input"; inp.placeholder = attr(el, "data-search-placeholder") || "Buscar..."; inp.setAttribute("aria-label", "Buscar no catálogo");
          inp.addEventListener("input", function () { ui.q = inp.value; paintCatalogResults(el, catalogOpts(el), ui); });
          el.querySelector(".v8-catalog-search").appendChild(inp);
        }
        el.addEventListener("click", function (e) {
          var b = e.target.closest ? e.target.closest("[data-v8-f]") : null; if (!b) return;
          var kind = b.getAttribute("data-v8-f"), id = b.getAttribute("data-id");
          if (kind === "cat") { ui.cat = id; ui.sub = ""; } else if (kind === "sub") ui.sub = id; else ui.tag = id;
          var oo = catalogOpts(el); paintCatalogFilters(el, oo, ui); paintCatalogResults(el, oo, ui);
        });
      }
      el.hidden = false; paintCatalogFilters(el, o, ui); paintCatalogResults(el, o, ui);
    });
  }
  function loadCatalog() {
    if (!WANT_CATALOG && !qsa("[data-v8-catalog]").length) return Promise.resolve();
    return request("/api/public/catalog/" + encodeURIComponent(PROJECT_ID)).then(function (r) {
      if (!r || r.success === false) throw new Error((r && r.error) || "catálogo indisponível");
      state.catalog = { products: r.products || [], categories: r.categories || [], tags: r.tags || [] };
      window.V8.catalog = state.catalog; renderCatalog(); fire("v8:catalog", state.catalog);
    }).catch(function (err) {
      console.warn("[V8] Catálogo:", err.message); qsa("[data-v8-catalog]").forEach(function (el) { el.hidden = true; });
    });
  }

  /* ---------- inicialização ---------- */
  function applyAll(cfg) {
    state.config = cfg; window.V8.config = cfg;
    bindFields(cfg); applySeo(cfg); applyTracking(cfg); applyCustomScripts(cfg);
    renderGallery(cfg); renderVideo(cfg); renderMaps(cfg); bindForms(cfg); bindPay();
    if (state.catalog) renderCatalog();
  }
  function init() {
    if (!PROJECT_ID) { console.warn("[V8] Informe data-project-id no <script> do v8-loader."); return Promise.resolve(null); }
    if (/^(ID_DO_PROJETO|SEU_PROJECT_ID|ID_DO_PROJECT)$/i.test(PROJECT_ID)) {
      console.warn('[V8] O data-project-id ainda está com o texto de exemplo ("' + PROJECT_ID + '"). Troque pelo ID real do projeto: painel V8 › Projetos › Editar › aba Geral › "Copiar ID".');
      return Promise.resolve(null);
    }
    injectStyle();
    return request("/api/public/config/" + encodeURIComponent(PROJECT_ID)).then(function (data) {
      var cfg = unwrapProject(data);
      if (!cfg) throw new Error((data && data.error) || "Projeto não encontrado.");
      applyAll(cfg);
      return Promise.all([loadCatalog(), renderReviews()]).then(function () { fire("v8:ready", cfg); return cfg; });
    }).catch(function (err) { console.warn("[V8] Falha ao carregar o projeto:", err.message); return null; });
  }

  /* Eventos de conversão por clique: <a data-v8-event="Contact"> (padrão do Meta) ou data-v8-event="custom:NomeLivre". */
  function trackEvent(name, el) {
    var custom = /^custom:/i.test(name), n = name.replace(/^custom:/i, "");
    if (window.fbq) { try { window.fbq(custom ? "trackCustom" : "track", n, { content_name: attr(el, "data-v8-event-label") || undefined }); } catch (e) {} }
    if (window.gtag) { try { window.gtag("event", n.toLowerCase(), { event_label: attr(el, "data-v8-event-label") || undefined }); } catch (e) {} }
    fire("v8:event", { name: n, element: el });
  }
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-v8-event]") : null;
    if (el) trackEvent(attr(el, "data-v8-event"), el);
  });
  captureUtm();

  window.V8 = { __v3: true, projectId: PROJECT_ID, api: API, config: null, catalog: null, field: field, formatMoney: formatMoney, reload: function () { return init(); } };
  window.V8.ready = new Promise(function (resolve) {
    function go() { init().then(resolve); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  });
})();
