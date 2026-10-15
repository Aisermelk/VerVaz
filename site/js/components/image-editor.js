(function(root) {
    'use strict';

    function source(asset, rotation = 0) {
        if (!rotation) return asset.image;
        if (asset.rotated ?.rotation === rotation) return asset.rotated.canvas;
        const size = root.AtelieDomain.rotatedDimensions(asset.width, asset.height, rotation),
            canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d');
        ctx.translate(size.width / 2, size.height / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(asset.image, -asset.width / 2, -asset.height / 2);
        asset.rotated = {
            rotation,
            canvas
        };
        return canvas;
    }

    function bindPan(canvas, getContext, onMove) {
        if (!canvas) return () => {};
        let start = null;

        function down(e) {
            const data = getContext();
            if (!data) return;
            const {
                asset,
                draft
            } = data, rect = root.AtelieDomain.crop(asset.width, asset.height, draft.sizeId, draft.orientation, draft.zoom, draft.x, draft.y, draft.rotation || 0), size = root.AtelieDomain.rotatedDimensions(asset.width, asset.height, draft.rotation || 0);
            start = {
                pointer: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                cropX: draft.x,
                cropY: draft.y,
                rect,
                size,
                box: canvas.getBoundingClientRect()
            };
            canvas.setPointerCapture ?.(e.pointerId);
        }

        function move(e) {
            if (!start || start.pointer !== e.pointerId) return;
            const dx = e.clientX - start.x,
                dy = e.clientY - start.y;
            const gapX = start.size.width - start.rect.width,
                gapY = start.size.height - start.rect.height;
            const clamp = v => Math.max(0, Math.min(100, v));
            onMove({
                x: gapX > 0 ? clamp(start.cropX - dx / start.box.width * start.rect.width / gapX * 100) : 50,
                y: gapY > 0 ? clamp(start.cropY - dy / start.box.height * start.rect.height / gapY * 100) : 50
            });
        }

        function up(e) {
            if (start ?.pointer === e.pointerId) start = null;
        }
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        return () => {
            canvas.removeEventListener('pointerdown', down);
            canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', up);
            canvas.removeEventListener('pointercancel', up);
        };
    }
    root.VeroVazImageEditor = {
        source,
        bindPan
    };
})(window);