/* Shared, dependency-free geometry and cart rules. */
(function(root) {
    'use strict';
    const sizes = Object.freeze([{
            id: '10x20',
            widthCm: 10,
            heightCm: 20,
            label: '10 × 20 cm'
        },
        {
            id: '15x20',
            widthCm: 15,
            heightCm: 20,
            label: '15 × 20 cm'
        },
        {
            id: '20x30',
            widthCm: 20,
            heightCm: 30,
            label: '20 × 30 cm'
        }
    ]);
    const models = new Map();

    function registerModel(id, widthCm, heightCm) {
        if (!id || !Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm <= 0 || heightCm <= 0 || widthCm > 200 || heightCm > 200) throw new Error('Área de impressão inválida.');
        models.set(`model:${id}`, {
            widthCm,
            heightCm
        });
    }

    function dimensions(sizeId, orientation = 'portrait') {
        const size = sizes.find(size => size.id === sizeId) ?? models.get(sizeId);
        if (!size) throw new Error('Tamanho de azulejo inválido.');
        if (!['portrait', 'landscape'].includes(orientation)) throw new Error('Orientação inválida.');
        return orientation === 'portrait' ? {
            width: size.widthCm,
            height: size.heightCm
        } : {
            width: size.heightCm,
            height: size.widthCm
        };
    }
    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

    function rotatedDimensions(width, height, rotation = 0) {
        if (![0, 90, 180, 270].includes(rotation)) throw new Error('Rotação inválida.');
        return rotation % 180 ? {
            width: height,
            height: width
        } : {
            width,
            height
        };
    }

    function crop(imageWidth, imageHeight, sizeId, orientation, zoom = 1, x = 50, y = 50, rotation = 0) {
        if (!(imageWidth > 0 && imageHeight > 0)) throw new Error('Imagem inválida.');
        ({
            width: imageWidth,
            height: imageHeight
        } = rotatedDimensions(imageWidth, imageHeight, rotation));
        const {
            width,
            height
        } = dimensions(sizeId, orientation);
        const scale = Math.max(width / imageWidth, height / imageHeight) * clamp(zoom, 1, 3);
        const sourceWidth = width / scale;
        const sourceHeight = height / scale;
        return {
            x: (imageWidth - sourceWidth) * clamp(x, 0, 100) / 100,
            y: (imageHeight - sourceHeight) * clamp(y, 0, 100) / 100,
            width: sourceWidth,
            height: sourceHeight
        };
    }

    function resolutionDpi(imageWidth, imageHeight, draft) {
        const area = crop(imageWidth, imageHeight, draft.sizeId, draft.orientation, draft.zoom, draft.x, draft.y, draft.rotation || 0);
        const dimensionsCm = dimensions(draft.sizeId, draft.orientation);
        return Math.floor(Math.min(area.width / dimensionsCm.width, area.height / dimensionsCm.height) * 2.54);
    }

    function toCents(price) {
        if (price === null || price === undefined || price === '' || !Number.isFinite(Number(price)) || Number(price) < 0) return null;
        const cents = Math.round(Number(price) * 100);
        return Number.isSafeInteger(cents) ? cents : null;
    }

    function subtotal(items) {
        if (items.some(item => item.unitCents === null)) return null;
        return items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
    }

    function snapshot(draft, id, previewId) {
        if (!draft.imageId || !draft.confirmedAt) throw new Error('Confirme a arte antes de adicioná-la.');
        return Object.freeze({
            id,
            type: 'personalized',
            imageId: draft.imageId,
            sizeId: draft.sizeId,
            orientation: draft.orientation,
            transform: {
                zoom: draft.zoom,
                x: draft.x,
                y: draft.y,
                rotation: draft.rotation || 0
            },
            confirmedAt: draft.confirmedAt,
            rightsConsent: draft.rightsConsent === true,
            modelProductId: draft.modelProductId ?? null,
            previewId
        });
    }

    function fingerprint(items, cep) {
        return JSON.stringify({
            cep: cep.replace(/\D/g, ''),
            items: items.map(item => ({
                id: item.id,
                productId: item.productId,
                quantity: item.quantity,
                sizeId: item.personalization ?.sizeId ?? null,
                price: item.unitCents
            }))
        });
    }
    const api = {
        sizes,
        registerModel,
        dimensions,
        rotatedDimensions,
        crop,
        resolutionDpi,
        toCents,
        subtotal,
        snapshot,
        fingerprint
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.AtelieDomain = api;
})(typeof window !== 'undefined' ? window : globalThis);