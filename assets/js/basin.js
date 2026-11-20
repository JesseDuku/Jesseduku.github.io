/* The watershed behind the home page.
   A small rainfall-runoff model: a synthetic terrain is drained with D8 flow directions
   (after a priority-flood fill), flow accumulation picks out the stream network, rain cells
   drift across, and runoff is routed downstream cell to cell as a cascade of linear reservoirs.
   The terrain is shaped so the main rivers run down the page margins. A gauge on the right-hand
   river feeds the hydrograph under the bio. */
(function () {
    'use strict';
    var cv = document.querySelector('.basin');
    if (!cv) return;
    var ctx = cv.getContext('2d'), gcv = document.querySelector('.gauge canvas'), gctx = gcv && gcv.getContext('2d');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var TAU = Math.PI * 2, TICK = 1 / 30, KC = 0.34, KH = 0.11, BASE = 0.004, RAIN = 0.2, CHAN = 26;
    var PAST = 60, AHEAD = 9, HZ = 5, THRESH = 3;

    function hash(i, j) { var h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
    function vnoise(x, y) {
        var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        var a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
        return a + (b - a) * fx + (c - a + (a - b + d - c) * fx) * fy;
    }
    function fbm(x, y) { return vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 7, y * 2.1 + 3) * 0.28 + vnoise(x * 4.3 + 1, y * 4.3 + 9) * 0.17; }

    /* ---------- colours ---------- */
    var C = {};
    function colours() {
        var cs = getComputedStyle(document.documentElement);
        ['ink', 'water', 'extreme'].forEach(function (k) { C[k] = cs.getPropertyValue('--bs-' + k).trim(); });
        C.text = cs.getPropertyValue('--text-muted').trim(); C.soft = cs.getPropertyValue('--text-soft').trim();
        C.font = getComputedStyle(document.body).fontFamily;
    }
    function rgba(c, a) { return 'rgba(' + c + ',' + a.toFixed(3) + ')'; }

    /* ---------- terrain and network ---------- */
    var W = 0, H = 0, dpr = 1, cell = 12, nx = 0, ny = 0, N = 0;
    var z, zf, down, acc, kk, px, py, att, q, q2, chan = [], order, gauge = -1, upG, upMain, gaugeBase = 1;
    /* one stream cell as a smooth curve: from the midpoint above it, through it, to the midpoint below */
    function reach(g, c) {
        var d = down[c], u = upMain[c], mx = (px[c] + px[d]) / 2, my = (py[c] + py[d]) / 2;
        if (u >= 0) { g.moveTo((px[u] + px[c]) / 2, (py[u] + py[c]) / 2); g.quadraticCurveTo(px[c], py[c], mx, my); }
        else { g.moveTo(px[c], py[c]); g.lineTo(mx, my); }
        if (upMain[d] !== c) g.lineTo(px[d], py[d]);       /* a tributary runs on into the confluence */
    }
    var stat = document.createElement('canvas'), sctx = stat.getContext('2d');

    function band(x) {                      /* quieter behind the text column, full strength in the margins */
        var half = Math.min(W, 1120) / 2 - 6, d = Math.abs(x - W / 2) - half;
        var t = Math.max(0, Math.min(1, d / 70 + 0.5)); t = t * t * (3 - 2 * t);
        return 0.3 + 0.7 * t;
    }

    function build() {
        W = window.innerWidth; H = window.innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
        cell = W < 700 ? 10 : 12; nx = Math.ceil(W / cell) + 2; ny = Math.ceil(H / cell) + 2; N = nx * ny;
        cv.width = stat.width = Math.round(W * dpr); cv.height = stat.height = Math.round(H * dpr);
        z = new Float32Array(N); zf = new Float32Array(N); down = new Int32Array(N); acc = new Float32Array(N);
        kk = new Float32Array(N); px = new Float32Array(N); py = new Float32Array(N); att = new Float32Array(N);
        q = new Float32Array(N); q2 = new Float32Array(N);
        var margin = (W - Math.min(W, 1120)) / 2, vx = margin > 70 ? margin * 0.52 : 12, amp = Math.min(margin * 0.24, 46), i, j, c;
        for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
            c = j * nx + i;
            var x = (i - 0.5) * cell, y = (j - 0.5) * cell, yn = y / H;
            var l = vx + Math.sin(yn * 5.2 + 0.6) * amp + Math.sin(yn * 11.3 + 2) * amp * 0.35;
            var r = W - vx + Math.sin(yn * 4.6 + 2.4) * amp + Math.sin(yn * 12.1 + 5) * amp * 0.35;
            var d = Math.min(Math.abs(x - l), Math.abs(x - r)) / 720;
            /* nearly flat valley floors and a steady fall down the page, so tributaries wander in at an angle */
            z[c] = Math.pow(d, 1.35) * 0.95 + (1 - yn) * 1.05 * (H / 900) + fbm(x / 250 + 3.7, y / 250 + 1.3) * 0.36 + fbm(x / 90 + 11, y / 90 + 5) * 0.07;
            px[c] = x + (hash(i + 91, j + 17) - 0.5) * cell * 0.5; py[c] = y + (hash(i + 5, j + 71) - 0.5) * cell * 0.5;
            att[c] = band(x);
        }
        /* priority-flood fill from the bottom edge, so every cell drains off the bottom of the page */
        zf.set(z);
        var heap = [], seen = new Uint8Array(N);
        function push(v) { var k = heap.length, p; heap.push(v); while (k > 0 && zf[heap[p = (k - 1) >> 1]] > zf[v]) { heap[k] = heap[p]; k = p; } heap[k] = v; }
        function pop() {
            var top = heap[0], v = heap.pop(), k = 0, n = heap.length, ch;
            if (n) { for (;;) { ch = 2 * k + 1; if (ch >= n) break; if (ch + 1 < n && zf[heap[ch + 1]] < zf[heap[ch]]) ch++; if (zf[heap[ch]] >= zf[v]) break; heap[k] = heap[ch]; k = ch; } heap[k] = v; }
            return top;
        }
        for (i = 0; i < nx; i++) { c = (ny - 1) * nx + i; seen[c] = 1; push(c); }
        var DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1], k, n;
        while (heap.length) {
            c = pop(); i = c % nx; j = (c / nx) | 0;
            for (k = 0; k < 8; k++) {
                var a = i + DX[k], b = j + DY[k]; if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
                n = b * nx + a; if (seen[n]) continue;
                seen[n] = 1; if (zf[n] <= zf[c]) zf[n] = zf[c] + 1e-5; push(n);
            }
        }
        for (c = 0; c < N; c++) {               /* D8: steepest descent on the filled surface */
            i = c % nx; j = (c / nx) | 0; var best = 0, bn = -1;
            if (j < ny - 1) for (k = 0; k < 8; k++) {
                a = i + DX[k]; b = j + DY[k]; if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
                n = b * nx + a; var sl = (zf[c] - zf[n]) / (k & 1 ? 1.4142 : 1);
                if (sl > best) { best = sl; bn = n; }
            }
            down[c] = bn;
        }
        order = Array.prototype.slice.call(new Int32Array(N).map(function (_, v) { return v; })).sort(function (u, v) { return zf[v] - zf[u]; });
        acc.fill(1);
        for (k = 0; k < N; k++) { c = order[k]; if (down[c] >= 0) acc[down[c]] += acc[c]; }
        chan = [];
        for (c = 0; c < N; c++) {
            kk[c] = acc[c] >= CHAN ? KC : KH;
            q[c] = BASE * TICK * acc[c] / kk[c];                 /* start at steady baseflow */
            if (acc[c] >= CHAN && down[c] >= 0) chan.push(c);
        }
        /* each stream cell's main upstream neighbour, then relax the course so it reads as a line, not a staircase */
        upMain = new Int32Array(N).fill(-1);
        for (k = 0; k < chan.length; k++) { c = chan[k]; n = down[c]; if (upMain[n] < 0 || acc[c] > acc[upMain[n]]) upMain[n] = c; }
        for (var it = 0; it < 3; it++) {
            var sx = new Float32Array(px), sy = new Float32Array(py);
            for (k = 0; k < chan.length; k++) {
                c = chan[k]; var u0 = upMain[c], d0 = down[c]; if (u0 < 0 || d0 < 0 || (d0 / nx | 0) >= ny - 1) continue;
                px[c] = (sx[u0] + sx[c] * 2 + sx[d0]) / 4; py[c] = (sy[u0] + sy[c] * 2 + sy[d0]) / 4;
            }
        }
        /* gauge: on the right-hand river, about two thirds of the way down */
        gauge = -1; var gy = Math.round(ny * 0.66), ga = 0;
        for (i = (nx / 2) | 0; i < nx; i++) { c = gy * nx + i; if (acc[c] > ga) { ga = acc[c]; gauge = c; } }
        gaugeBase = BASE * TICK * acc[gauge];
        upG = new Uint8Array(N);
        for (k = N - 1; k >= 0; k--) { c = order[k]; upG[c] = c === gauge || (down[c] >= 0 && upG[down[c]]) ? 1 : 0; }
        paintStatic();
    }

    function paintStatic() {
        var i, j, c, k;
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.clearRect(0, 0, W, H);
        /* terrain contours (marching squares), every fifth one an index contour */
        var lo = 1e9, hi = -1e9; for (c = 0; c < N; c++) { if (z[c] < lo) lo = z[c]; if (z[c] > hi) hi = z[c]; }
        var step = (hi - lo) / 26, lv, li = 0;
        sctx.lineCap = 'round'; sctx.lineJoin = 'round';
        for (lv = lo + step; lv < hi; lv += step, li++) {
            for (var pass = 0; pass < 2; pass++) {       /* margins, then the quieter text column */
                sctx.beginPath();
                for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
                    c = j * nx + i;
                    if ((att[c] < 0.7 ? 1 : 0) !== pass) continue;
                    var v0 = z[c], v1 = z[c + 1], v2 = z[c + nx + 1], v3 = z[c + nx];
                    var m = (v0 > lv ? 1 : 0) | (v1 > lv ? 2 : 0) | (v2 > lv ? 4 : 0) | (v3 > lv ? 8 : 0);
                    if (!m || m === 15) continue;
                    var x0 = (i - 0.5) * cell, y0 = (j - 0.5) * cell, e = [];
                    if ((m & 1) !== ((m >> 1) & 1)) e.push(x0 + cell * (lv - v0) / (v1 - v0), y0);
                    if (((m >> 1) & 1) !== ((m >> 2) & 1)) e.push(x0 + cell, y0 + cell * (lv - v1) / (v2 - v1));
                    if (((m >> 2) & 1) !== ((m >> 3) & 1)) e.push(x0 + cell * (lv - v3) / (v2 - v3), y0 + cell);
                    if (((m >> 3) & 1) !== (m & 1)) e.push(x0, y0 + cell * (lv - v0) / (v3 - v0));
                    for (k = 0; k + 3 < e.length; k += 4) { sctx.moveTo(e[k], e[k + 1]); sctx.lineTo(e[k + 2], e[k + 3]); }
                }
                var idx = li % 5 === 4;
                sctx.strokeStyle = rgba(C.ink, (idx ? 0.1 : 0.055) * (pass ? 0.4 : 1)); sctx.lineWidth = idx ? 0.9 : 0.6; sctx.stroke();
            }
        }
        /* streams: width and weight grow with the area they drain */
        for (k = 0; k < chan.length; k++) {
            c = chan[k]; var s = Math.sqrt(acc[c]);
            sctx.strokeStyle = rgba(C.ink, Math.min(0.3, 0.08 + s / 210) * att[c]);
            sctx.lineWidth = Math.min(1.7, 0.5 + s / 34);
            sctx.beginPath(); reach(sctx, c); sctx.stroke();
        }
        /* gauge marker, only where there is a margin to hold it */
        if (gauge >= 0 && W - Math.min(W, 1120) > 190) {
            var gx = px[gauge], gyy = py[gauge];
            sctx.fillStyle = rgba(C.ink, 0.5); sctx.beginPath(); sctx.moveTo(gx + 7, gyy); sctx.lineTo(gx + 15, gyy - 4.5); sctx.lineTo(gx + 15, gyy + 4.5); sctx.closePath(); sctx.fill();
            sctx.font = '500 10.5px ' + C.font; sctx.textBaseline = 'middle'; sctx.fillStyle = rgba(C.ink, 0.45);
            if ('letterSpacing' in sctx) sctx.letterSpacing = '0.2px';
            sctx.fillText('gauge', gx + 20, gyy + 0.5);
        }
    }

    /* ---------- rain and routing ---------- */
    var storms = [], nextStorm = 1.5, clock = 0, series = [], sampleAcc = 0, fore = [], foreAcc = 0, seedN = 0;
    function addStorm(pre) {
        var s = hash(++seedN, 311), r = Math.max(110, Math.min(W, H) * (0.16 + hash(seedN, 7) * 0.1));
        var sp = 26 + hash(seedN, 19) * 20, ang = -0.25 + hash(seedN, 23) * 0.7, y0 = H * (0.02 + hash(seedN, 3) * 0.6);
        storms.push({ x: pre ? W * hash(seedN, 41) : -r * 1.3, y: y0, r: r, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                      p: 0.55 + s * 0.9, age: 0, life: (W + r * 2.6) / (Math.cos(ang) * sp), seed: s * 100 });
    }
    function tick(rainOn, Q, Q2, only) {
        var c, k, s, out, d;
        if (rainOn) for (k = 0; k < storms.length; k++) {
            s = storms[k]; var env = Math.sin(Math.PI * Math.min(1, s.age / s.life)), sg = s.r * 0.46, R = s.r * 1.25;
            var i0 = Math.max(0, ((s.x - R) / cell) | 0), i1 = Math.min(nx - 1, ((s.x + R) / cell + 2) | 0);
            var j0 = Math.max(0, ((s.y - R * 0.7) / cell) | 0), j1 = Math.min(ny - 1, ((s.y + R * 0.7) / cell + 2) | 0);
            for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
                c = j * nx + i; var dx = (px[c] - s.x) / 1.25, dy = (py[c] - s.y) / 0.82;
                Q[c] += RAIN * s.p * env * Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg)) * TICK;
            }
        }
        Q2.fill(0);
        for (c = 0; c < N; c++) {
            if (only && !only[c]) continue;
            Q[c] += BASE * TICK; out = Q[c] * kk[c]; d = down[c];
            Q2[c] += Q[c] - out; if (d >= 0) Q2[d] += out;
        }
    }
    function advance(dt) {
        clock += dt;
        for (var steps = 0; clock >= TICK && steps < 6; steps++) {
            clock -= TICK;
            for (var k = storms.length - 1; k >= 0; k--) {
                var s = storms[k]; s.age += TICK; s.x += s.vx * TICK; s.y += s.vy * TICK;
                if (s.age > s.life) storms.splice(k, 1);
            }
            nextStorm -= TICK; if (nextStorm <= 0) { addStorm(false); nextStorm = 13 + hash(seedN, 77) * 10; }
            tick(true, q, q2); var t = q; q = q2; q2 = t;
            sampleAcc += TICK; if (sampleAcc >= 1 / HZ) { sampleAcc -= 1 / HZ; series.push(q[gauge] * kk[gauge] / gaugeBase); if (series.length > PAST * HZ + 1) series.shift(); }
            foreAcc += TICK; if (foreAcc >= 1) { foreAcc = 0; forecast(); }
        }
        if (clock > TICK) clock = 0;
    }
    var fa, fb;
    function forecast() {            /* run the upstream cells forward with no further rain */
        if (!fa || fa.length !== N) { fa = new Float32Array(N); fb = new Float32Array(N); }
        fa.set(q); fore.length = 0;
        for (var i = 0, n = AHEAD * 30; i < n; i++) {
            tick(false, fa, fb, upG); var t = fa; fa = fb; fb = t;
            if (i % (30 / HZ) === 0) fore.push(fa[gauge] * kk[gauge] / gaugeBase);
        }
    }

    /* ---------- drawing ---------- */
    var BINS = 5, paths = [];
    function draw(time) {
        var k, c, b;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(stat, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round';
        /* water: streams turn blue and thicken as flow rises above baseflow */
        for (b = 0; b < BINS * 2; b++) paths[b] = null;
        for (k = 0; k < chan.length; k++) {
            c = chan[k]; var ratio = q[c] * kk[c] / (BASE * TICK * acc[c]);
            var lvl = Math.sqrt(Math.max(0, ratio - 1.5) / 10); if (lvl < 0.1) continue; if (lvl > 1) lvl = 1;
            b = Math.min(BINS - 1, (lvl * BINS) | 0) + (att[c] < 0.7 ? BINS : 0);
            (paths[b] || (paths[b] = [])).push(c);
        }
        for (b = 0; b < BINS * 2; b++) {
            if (!paths[b]) continue;
            var l = ((b % BINS) + 0.7) / BINS, quiet = b >= BINS;
            ctx.strokeStyle = rgba(C.water, (0.1 + 0.62 * l) * (quiet ? 0.32 : 1));
            for (var wpass = 0; wpass < 2; wpass++) {
                ctx.beginPath();
                for (k = 0; k < paths[b].length; k++) { c = paths[b][k]; if ((acc[c] > 260 ? 1 : 0) !== wpass) continue; reach(ctx, c); }
                ctx.lineWidth = (wpass ? 1.3 : 0.8) + l * (wpass ? 1.1 : 0.6); ctx.stroke();
            }
        }
        /* rain cells: three isohyets, the core hatched with falling rain */
        for (k = 0; k < storms.length; k++) {
            var s = storms[k], env = Math.sin(Math.PI * Math.min(1, s.age / s.life)), a = env * (0.3 + 0.7 * band(s.x)) * (0.42 + 0.3 * s.p);
            if (a < 0.01) continue;
            [[1, 0.5, [3, 4]], [0.68, 0.75, null], [0.4, 1, null]].forEach(function (lv, li) {
                ctx.beginPath();
                for (var i = 0; i <= 72; i++) {
                    var t = i / 72 * TAU, sd = s.seed + li * 1.7;
                    var r = s.r * lv[0] * (1 + 0.1 * Math.sin(2 * t + sd + time * 0.2) + 0.07 * Math.sin(3 * t + sd * 2.3 - time * 0.15) + 0.045 * Math.sin(5 * t + sd * 4.1 + time * 0.11));
                    var x = s.x + Math.cos(t) * r * 1.25, y = s.y + Math.sin(t) * r * 0.82;
                    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                }
                ctx.closePath(); ctx.setLineDash(lv[2] || []);
                ctx.strokeStyle = rgba(C.water, a * lv[1] * 0.75); ctx.lineWidth = 0.8; ctx.stroke(); ctx.setLineDash([]);
                if (li === 2) {
                    ctx.save(); ctx.clip(); ctx.beginPath();
                    var R = s.r * 0.6, gap = 7, fall = (time * 46) % 14;
                    for (var d = -R * 2; d < R * 2; d += gap) for (var yy = -R - 14 + fall + (((d / gap) | 0) & 1) * 7; yy < R; yy += 14) {
                        ctx.moveTo(s.x + d - yy * 0.28, s.y + yy); ctx.lineTo(s.x + d - (yy + 6) * 0.28, s.y + yy + 6);
                    }
                    ctx.strokeStyle = rgba(C.water, a * 0.7); ctx.lineWidth = 0.7; ctx.stroke(); ctx.restore();
                }
            });
        }
    }

    /* ---------- hydrograph ---------- */
    var gW = 0, gH = 0, yMax = 6;
    function gaugeSize() {
        if (!gcv) return; gW = gcv.clientWidth; gH = gcv.clientHeight;
        gcv.width = Math.round(gW * dpr); gcv.height = Math.round(gH * dpr);
    }
    function drawGauge() {
        if (!gctx || !gW || series.length < 2) return;
        var c = gctx, top = 20, bot = gH - 17, span = PAST + AHEAD, xNow = gW * PAST / span, i, x, y, n = series.length;
        var peak = THRESH * 1.5; for (i = 0; i < n; i++) if (series[i] > peak) peak = series[i];
        for (i = 0; i < fore.length; i++) if (fore[i] > peak) peak = fore[i];
        yMax += (peak * 1.12 - yMax) * 0.04;
        function X(i) { return xNow - (n - 1 - i) / HZ * gW / span; }
        function Y(v) { return bot - (bot - top) * Math.min(1, v / yMax); }
        c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, gW, gH); c.lineJoin = 'round'; c.lineCap = 'round';
        c.font = '500 10.5px ' + C.font; if ('letterSpacing' in c) c.letterSpacing = '0.2px';
        /* axis and threshold */
        c.strokeStyle = rgba(C.ink, 0.16); c.lineWidth = 1; c.beginPath(); c.moveTo(0, bot + 0.5); c.lineTo(gW, bot + 0.5); c.stroke();
        var yT = Math.round(Y(THRESH)) + 0.5;
        c.setLineDash([2, 3]); c.strokeStyle = rgba(C.extreme, 0.75); c.beginPath(); c.moveTo(0, yT); c.lineTo(gW, yT); c.stroke(); c.setLineDash([]);
        /* past: area, exceedance above the threshold, line */
        c.beginPath(); c.moveTo(X(0), bot); for (i = 0; i < n; i++) c.lineTo(X(i), Y(series[i])); c.lineTo(xNow, bot); c.closePath();
        c.fillStyle = rgba(C.water, 0.09); c.fill();
        c.save(); c.beginPath(); c.rect(0, 0, gW, yT); c.clip();
        c.beginPath(); c.moveTo(X(0), bot); for (i = 0; i < n; i++) c.lineTo(X(i), Y(series[i])); c.lineTo(xNow, bot); c.closePath();
        c.fillStyle = rgba(C.extreme, 0.2); c.fill(); c.restore();
        c.beginPath(); for (i = 0; i < n; i++) { x = X(i); y = Y(series[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        c.strokeStyle = rgba(C.water, 0.95); c.lineWidth = 1.5; c.stroke();
        /* flagged peaks: local maxima above the threshold */
        for (i = 3; i < n - 3; i++) {
            var v = series[i];
            if (v > THRESH && v >= series[i - 1] && v > series[i + 1] && v >= series[i - 3] && v > series[i + 3]) {
                x = X(i); y = Y(v);
                c.fillStyle = rgba(C.extreme, 1); c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill();
                c.strokeStyle = rgba(C.extreme, 0.45); c.lineWidth = 1; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x, y - 11); c.stroke();
            }
        }
        /* forecast */
        if (fore.length) {
            c.beginPath(); c.moveTo(xNow, Y(series[n - 1]));
            for (i = 0; i < fore.length; i++) c.lineTo(xNow + (i + 1) / HZ * gW / span, Y(fore[i]));
            c.setLineDash([3, 3]); c.strokeStyle = rgba(C.water, 0.75); c.lineWidth = 1.3; c.stroke(); c.setLineDash([]);
        }
        c.strokeStyle = rgba(C.ink, 0.28); c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(xNow) + 0.5, top - 6); c.lineTo(Math.round(xNow) + 0.5, bot); c.stroke();
        c.fillStyle = rgba(C.water, 1); c.beginPath(); c.arc(xNow, Y(series[n - 1]), 3, 0, TAU); c.fill();
        /* labels */
        c.textBaseline = 'alphabetic'; c.fillStyle = C.text; c.textAlign = 'left'; c.fillText('Discharge at the gauge', 0, 10);
        c.textAlign = 'right'; c.fillStyle = rgba(C.extreme, 0.95); c.fillText('flood threshold', gW, 10);
        var tw = c.measureText('flood threshold').width;
        c.setLineDash([2, 3]); c.strokeStyle = rgba(C.extreme, 0.9); c.beginPath(); c.moveTo(gW - tw - 26, 6.5); c.lineTo(gW - tw - 8, 6.5); c.stroke(); c.setLineDash([]); c.textAlign = 'left';
        c.fillStyle = C.soft; c.textBaseline = 'top'; c.fillText('60 s ago', 0, bot + 5);
        c.textAlign = 'center'; c.fillText('now', xNow, bot + 5);
        c.textAlign = 'right'; c.fillText('forecast', gW, bot + 5);
    }

    /* ---------- run ---------- */
    var raf = 0, last = 0, lastDraw = 0, T = 0, gVis = false, frozen = false;
    function preroll() {
        storms.length = 0; series.length = 0; seedN = 0; addStorm(true); storms[0].age = storms[0].life * 0.3; nextStorm = 6;
        for (var i = 0; i < 26 * 30; i++) { clock = TICK; advance(0); }
        forecast();
    }
    function frame(t) {
        raf = 0; if (!document.hidden && !frozen) raf = requestAnimationFrame(frame);
        if (t - lastDraw < 30) return;               /* about 30 frames a second is plenty for a backdrop */
        var dt = Math.min(0.1, (t - last) / 1000 || 0); last = lastDraw = t; T += dt;
        advance(dt); draw(T); if (gVis) drawGauge();
    }
    function wake() { if (!raf && !reduce && !frozen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function start() { colours(); build(); gaugeSize(); preroll(); draw(T); drawGauge(); }
    var rz = 0;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (window.innerWidth !== W || Math.abs(window.innerHeight - H) > 120) start(); else gaugeSize(); }, 180); });
    new MutationObserver(function () { colours(); paintStatic(); draw(T); drawGauge(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (gcv && 'IntersectionObserver' in window) new IntersectionObserver(function (en) { gVis = en[0].isIntersecting; }).observe(gcv); else gVis = true;
    document.addEventListener('visibilitychange', wake);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { colours(); paintStatic(); if (reduce || frozen) { draw(T); drawGauge(); } });
    start(); wake();
    window.__basin = { peak: function () { return [Math.max.apply(null, series).toFixed(1), chan.length]; }, run: function (sec) { frozen = true; for (var i = 0; i < sec * 30; i++) { clock = TICK; advance(0); T += TICK; } draw(T); gVis = true; yMax = 0; for (i = 0; i < 200; i++) drawGauge(); } };
})();
