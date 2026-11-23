/* Quiet terrain contours in two corners of the home page. Grey, slow, and kept clear of the text. */
(function () {
    'use strict';
    var cv = document.querySelector('.corners');
    if (!cv) return;
    var ctx = cv.getContext('2d'), reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 0, H = 0, dpr = 1, ink = '29,29,31', CELL = 13, LEVELS = 11, t = 0;
    function hash(i, j, k) { var h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
    function lerp(a, b, f) { return a + (b - a) * f; }
    function noise(x, y, z) {
        var i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
        function plane(kk) { return lerp(lerp(hash(i, j, kk), hash(i + 1, j, kk), fx), lerp(hash(i, j + 1, kk), hash(i + 1, j + 1, kk), fx), fy); }
        return lerp(plane(k), plane(k + 1), fz);
    }
    function field(x, y) { return noise(x / 230, y / 230, t) * 0.68 + noise(x / 95 + 9, y / 95 + 4, t * 1.3 + 7) * 0.32; }
    function size() {
        W = window.innerWidth; H = window.innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        ink = getComputedStyle(document.documentElement).getPropertyValue('--bs-ink').trim() || ink; draw();
    }
    function corner(ox, oy, rad) {
        var n = Math.ceil(rad / CELL) + 1, v = new Float32Array((n + 1) * (n + 1)), i, j, sx = ox ? -1 : 1, sy = oy ? -1 : 1;
        for (j = 0; j <= n; j++) for (i = 0; i <= n; i++) v[j * (n + 1) + i] = field(ox + sx * i * CELL, oy + sy * j * CELL);
        for (var li = 0; li < LEVELS; li++) {
            var lv = 0.2 + li * 0.6 / (LEVELS - 1);
            for (var ring = 0; ring < 4; ring++) {         /* four distance bands, fainter away from the corner */
                ctx.beginPath();
                for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
                    var d = Math.hypot(i + 0.5, j + 0.5) * CELL / rad; if (d >= 1 || Math.min(3, (d * 4) | 0) !== ring) continue;
                    var c = j * (n + 1) + i, v0 = v[c], v1 = v[c + 1], v2 = v[c + n + 2], v3 = v[c + n + 1];
                    var m = (v0 > lv ? 1 : 0) | (v1 > lv ? 2 : 0) | (v2 > lv ? 4 : 0) | (v3 > lv ? 8 : 0);
                    if (!m || m === 15) continue;
                    var x0 = ox + sx * i * CELL, y0 = oy + sy * j * CELL, e = [];
                    if ((m & 1) !== ((m >> 1) & 1)) e.push(x0 + sx * CELL * (lv - v0) / (v1 - v0), y0);
                    if (((m >> 1) & 1) !== ((m >> 2) & 1)) e.push(x0 + sx * CELL, y0 + sy * CELL * (lv - v1) / (v2 - v1));
                    if (((m >> 2) & 1) !== ((m >> 3) & 1)) e.push(x0 + sx * CELL * (lv - v3) / (v2 - v3), y0 + sy * CELL);
                    if (((m >> 3) & 1) !== (m & 1)) e.push(x0, y0 + sy * CELL * (lv - v0) / (v3 - v0));
                    for (var k = 0; k + 3 < e.length; k += 4) { ctx.moveTo(e[k], e[k + 1]); ctx.lineTo(e[k + 2], e[k + 3]); }
                }
                var fall = Math.pow(1 - (ring + 0.5) / 4, 1.6), idx = li % 4 === 3;
                ctx.strokeStyle = 'rgba(' + ink + ',' + ((idx ? 0.2 : 0.12) * fall).toFixed(3) + ')'; ctx.lineWidth = idx ? 0.9 : 0.7; ctx.stroke();
            }
        }
    }
    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.lineCap = 'round';
        var margin = (W - Math.min(W, 1120)) / 2, rad = Math.max(230, Math.min(520, margin + 250));
        corner(W, 0, rad); corner(0, H, rad);
    }
    var lastT = 0;
    function frame(now) {
        if (!document.hidden) requestAnimationFrame(frame);
        if (now - lastT < 90) return;                 /* a slow drift needs only a few frames a second */
        t += (now - lastT) / 1000 * 0.012; lastT = now; draw();
    }
    var rz = 0; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(size, 150); });
    new MutationObserver(size).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !reduce) { lastT = performance.now(); requestAnimationFrame(frame); } });
    size(); if (!reduce) { lastT = performance.now(); requestAnimationFrame(frame); }
})();
