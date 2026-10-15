/* Private server drafts. The server explicitly advertises availability. */
(function(root) {
    class PrivateCart {
        constructor(api, tenant) {
            this.api = api;
            this.tenant = tenant;
            this.key = `verovaz.private-session.${tenant}`;
            this.token = null;
            this.revision = null;
            try {
                this.token = localStorage.getItem(this.key);
            } catch {}
        }
        async request(path, options = {}) {
            const response = await fetch(`${this.api}/atelier/private/${path}`, { ...options,
                signal: options.signal || AbortSignal.timeout(60000),
                headers: {
                    'X-Tenant-Id': this.tenant,
                    ...(this.token ? {
                        'X-Atelier-Session': this.token
                    } : {}),
                    ...options.headers
                }
            });
            if (!response.ok) {
                let detail;
                try {
                    const body = await response.json();
                    detail = body.detail || body.message || body.title;
                } catch {}
                throw new Error(detail || 'Não foi possível salvar no servidor. Seus rascunhos locais foram preservados.');
            }
            return response.status === 204 ? null : response.json();
        }
        async session() {
            if (!this.token) {
                const result = await this.request('sessions', {
                    method: 'POST'
                });
                this.token = result.token;
                try {
                    localStorage.setItem(this.key, this.token);
                } catch {
                    throw new Error('Permita o armazenamento local para recuperar sua sessão privada.');
                }
            }
            const cart = await this.request('cart');
            if (this.revision === null) this.revision = cart.revision;
            return cart;
        }
        async upload(blob) {
            const form = new FormData();
            form.append('file', blob, blob.type === 'image/png' ? 'imagem.png' : blob.type === 'image/webp' ? 'imagem.webp' : 'imagem.jpg');
            form.append('rightsConsent', 'true');
            const uploaded = await this.request('artworks', {
                method: 'POST',
                body: form
            });
            this.revision++;
            return uploaded;
        }
        async save(items, assets) {
            if (items.some(i => !i.productId)) throw new Error('Existe uma composição sem produto e preço cadastrados.');
            await this.session();
            const lines = [];
            for (const item of items) {
                let art = null;
                if (item.personalization) {
                    const p = item.personalization;
                    if (p.transform.rotation && !this.supportsRotation) throw new Error('O servidor precisa ser atualizado para receber artes com rotação. Seus arquivos locais foram preservados.');
                    if (!p.rightsConsent) throw new Error('Reabra a personalização para confirmar a autorização de uso da imagem.');
                    item.privateArt ??= {};
                    if (!item.privateArt.originalId) {
                        const source = assets.get(p.imageId);
                        if (!source ?.blob) throw new Error('O original não está neste navegador. Reenvie a imagem antes de continuar.');
                        item.privateArt.originalId = (await this.upload(source.blob)).id;
                    }
                    if (!item.privateArt.previewId) {
                        const preview = assets.get(p.previewId);
                        if (!preview ?.blob) throw new Error('Prévia indisponível. Revise a composição.');
                        item.privateArt.previewId = (await this.upload(preview.blob)).id;
                    }
                    p.assetId = item.privateArt.originalId;
                    art = { ...item.privateArt,
                        sizeId: p.modelProductId ? null : p.sizeId,
                        orientation: p.orientation,
                        zoom: p.transform.zoom,
                        x: p.transform.x,
                        y: p.transform.y,
                        rotation: p.transform.rotation || 0,
                        approved: true
                    };
                }
                lines.push({
                    id: item.id,
                    productId: item.productId,
                    quantity: item.quantity,
                    art
                });
            }
            const result = await this.request('cart', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    revision: this.revision,
                    items: lines
                })
            });
            this.revision = result.revision;
            return result;
        }
    }
    root.VeroVazPrivateCart = PrivateCart;
})(window);