/* The figure on the home page: Earth seen from orbit, with satellites sweeping the surface and
   the large lakes they monitor picked out in blue. The Caspian Sea is labelled.
   Orthographic projection (d3-geo); orbits are fixed in space while the Earth turns beneath them. */
(function () {
    'use strict';
    var D = window.GLOBE_DATA, box = document.querySelector('.hero-globe'), d3 = window.d3;
    if (!D || !box || !d3 || !d3.geoOrthographic) return;
    var cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var TAU = Math.PI * 2, RAD = Math.PI / 180;
    var proj = d3.geoOrthographic().clipAngle(90).precision(0.5), path = d3.geoPath(proj, ctx);
    var land = { type: 'MultiPolygon', coordinates: D.land.coordinates }, grat = d3.geoGraticule().step([15, 15])();
    var lakes = D.lakes.map(function (l) { return { name: l.n, c: l.c, g: l.g, pulse: -9, caspian: l.n === 'Caspian Sea' }; });
    var caspian = lakes.filter(function (l) { return l.caspian; })[0];

    /* three orbits at exaggerated heights: start as a loop over the poles, turn it about the vertical, then lean it */
    var sats = [
        { r: 1.2, turn: 38, lean: -16, period: 23, ph: 0.6 },
        { r: 1.33, turn: -58, lean: 24, period: 34, ph: 2.9 },
        { r: 1.47, turn: 78, lean: 58, period: 47, ph: 4.4 }
    ].map(function (s) {
        var ct = Math.cos(s.turn * RAD), st = Math.sin(s.turn * RAD), cl = Math.cos(s.lean * RAD), sl = Math.sin(s.lean * RAD);
        s.at = function (th) {
            var y = Math.cos(th), z = Math.sin(th), x = z * st; z = z * ct;
            return [(x * cl - y * sl) * s.r, (x * sl + y * cl) * s.r, z * s.r];
        };
        s.trail = []; return s;
    });
    sats.forEach(function (s, i) { s.kind = i; });

    var C = {}, W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1;
    function colours() {
        var cs = getComputedStyle(box);
        ['ink', 'water', 'alert', 'land', 'sea0', 'sea1', 'glow', 'foil0', 'foil1', 'cell'].forEach(function (k) { C[k] = cs.getPropertyValue('--gl-' + k).trim(); });
        C.dark = cs.getPropertyValue('--gl-dark').trim() === '1'; C.font = getComputedStyle(document.body).fontFamily;
    }
    function rgba(c, a) { return 'rgba(' + c + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
    function resize() {
        W = cv.clientWidth; H = cv.clientHeight; if (!W || !H) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        R = Math.min(W, H) * 0.325; cx = W * 0.5; cy = H * 0.5;
        proj.scale(R).translate([cx, cy]);
        if (reduce || frozen) draw();
    }

    var lon = 34, lat = 27, spin = 1.6, vel = 1.6, time = 0, drag = null;

    function draw() {
        var i, k, s;
        proj.rotate([-lon, -lat, 9]);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        /* satellites: position, depth, and the point on the ground beneath each */
        sats.forEach(function (s) {
            var th = s.ph + time / s.period * TAU, p = s.at(th), p0 = s.at(th - 0.02);
            s.x = cx + p[0] * R; s.y = cy - p[1] * R; s.z = p[2];
            s.gx = cx + p[0] / s.r * R; s.gy = cy - p[1] / s.r * R;
            s.dx = p[0] - p0[0]; s.dy = -(p[1] - p0[1]); var l = Math.hypot(s.dx, s.dy) || 1; s.dx /= l; s.dy /= l;
            s.hidden = s.z < 0 && Math.hypot(p[0], p[1]) < 1.01;
        });

        /* atmosphere */
        var g = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.2);
        g.addColorStop(0, rgba(C.glow, C.dark ? 0.34 : 0.2)); g.addColorStop(1, rgba(C.glow, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, TAU); ctx.fill();

        orbits(false);

        /* sphere */
        g = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.46, R * 0.05, cx, cy, R);
        g.addColorStop(0, C.sea0); g.addColorStop(1, C.sea1);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
        ctx.beginPath(); path(grat); ctx.strokeStyle = rgba(C.ink, 0.07); ctx.lineWidth = 0.6; ctx.stroke();
        ctx.beginPath(); path(land); ctx.fillStyle = C.land; ctx.fill();
        ctx.strokeStyle = rgba(C.ink, C.dark ? 0.3 : 0.26); ctx.lineWidth = 0.7; ctx.stroke();

        /* swaths: the strip each satellite has just scanned stays on the ground and turns with it */
        sats.forEach(function (s) {
            var n = s.trail.length; if (n < 2) return;
            [[0, 0.09], [0.45, 0.08], [0.75, 0.11]].forEach(function (tier) {
                var from = Math.floor(n * tier[0]); if (n - from < 2) return;
                ctx.beginPath(); path({ type: 'LineString', coordinates: s.trail.slice(from).map(function (t) { return t.ll; }) });
                ctx.strokeStyle = rgba(C.water, tier[1]); ctx.lineWidth = R * 0.105; ctx.lineCap = 'butt'; ctx.stroke(); ctx.lineCap = 'round';
            });
        });

        /* lakes */
        lakes.forEach(function (l) {
            ctx.beginPath(); path(l.g);
            ctx.fillStyle = rgba(C.water, l.caspian ? 1 : 0.9); ctx.fill();
            if (C.dark) { ctx.strokeStyle = rgba(C.water, 0.35); ctx.lineWidth = 2.2; ctx.stroke(); }
        });

        /* volume: light from the upper left, limb falling into shadow */
        g = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.46, R * 0.2, cx, cy, R * 1.02);
        g.addColorStop(0, 'rgba(255,255,255,' + (C.dark ? 0.05 : 0.0) + ')'); g.addColorStop(0.7, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,' + (C.dark ? 0.5 : 0.1) + ')');
        ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        ctx.restore();
        ctx.strokeStyle = rgba(C.ink, C.dark ? 0.22 : 0.16); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

        /* a ring where a satellite has just passed over a lake */
        var centre = [lon, lat];
        lakes.forEach(function (l) {
            var age = (time - l.pulse) / 1.6; if (age >= 1 || age < 0) return;
            if (d3.geoDistance(l.c, centre) > 1.45) return;
            var p = proj(l.c), e = 1 - Math.pow(1 - age, 3);
            ctx.strokeStyle = rgba(C.water, (1 - age) * 0.9); ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(p[0], p[1], 5 + e * 16, 0, TAU); ctx.stroke();
        });

        /* Caspian label, with a leader line; fades out as the sea turns towards the limb */
        if (caspian) {
            var dist = d3.geoDistance(caspian.c, centre), a = Math.max(0, Math.min(1, (1.25 - dist) / 0.3));
            if (a > 0.01) {
                var p = proj(caspian.c), big = W > 520, side = p[0] + (big ? 215 : 135) > W ? -1 : 1, ex = p[0] + side * 38, ey = p[1] - 48;
                ctx.strokeStyle = rgba(C.ink, 0.55 * a); ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(p[0] + side * 5, p[1] - 6); ctx.lineTo(ex, ey); ctx.lineTo(ex + side * 12, ey); ctx.stroke();
                ctx.textAlign = side > 0 ? 'left' : 'right'; ctx.textBaseline = 'middle';
                if ('letterSpacing' in ctx) ctx.letterSpacing = '0.1px';
                ctx.font = '600 ' + (big ? 12.5 : 11.5) + 'px ' + C.font; ctx.fillStyle = rgba(C.ink, a);
                ctx.fillText('Caspian Sea', ex + side * 17, ey - (big ? 7 : 0));
                if (big) { ctx.font = '500 11px ' + C.font; ctx.fillStyle = rgba(C.alert, a); ctx.fillText('2.3 m lower than in 1995', ex + side * 17, ey + 9); }
            }
        }

        orbits(true);

        /* scan beam and satellite */
        sats.forEach(function (s) {
            if (s.hidden) return;
            var a = s.z >= 0 ? 1 : 0.4, hw = R * 0.052, px = -s.dy, py = s.dx;
            if (s.z > 0.12 && s.kind < 2) {
                g = ctx.createLinearGradient(s.x, s.y, s.gx, s.gy);
                g.addColorStop(0, rgba(C.water, 0.42)); g.addColorStop(1, rgba(C.water, 0.04));
                ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.gx + px * hw, s.gy + py * hw); ctx.lineTo(s.gx - px * hw, s.gy - py * hw); ctx.closePath(); ctx.fill();
            }
            var k = (1 + 0.12 * s.z) * Math.max(0.72, Math.min(1.12, R / 235)) * (s.z >= 0 ? 1 : 0.86);
            ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(cy - s.y, cx - s.x) - Math.PI / 2); ctx.scale(k, k); ctx.globalAlpha = a;
            craft(s.kind); ctx.restore(); ctx.globalAlpha = 1;
        });
    }

    /* spacecraft, drawn with +y pointing at the Earth. Sizes are in pixels at scale 1. */
    function panel(x, y, w, h, cells) {
        var g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, rgba(C.water, 1)); g.addColorStop(1, rgba(C.water, 0.72));
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = rgba(C.cell, 0.55); ctx.lineWidth = 0.5; ctx.beginPath();
        for (var i = 1; i < cells; i++) { ctx.moveTo(x + w * i / cells, y); ctx.lineTo(x + w * i / cells, y + h); }
        ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
        ctx.strokeStyle = rgba(C.ink, 0.55); ctx.lineWidth = 0.6; ctx.strokeRect(x, y, w, h);
    }
    function bus(x, y, w, h) {
        var g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, C.foil0); g.addColorStop(1, C.foil1);
        ctx.fillStyle = g; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill();
        ctx.strokeStyle = rgba(C.ink, 0.6); ctx.lineWidth = 0.6; ctx.stroke();
    }
    function craft(kind) {
        ctx.lineCap = 'round'; ctx.strokeStyle = rgba(C.ink, 0.75); ctx.lineWidth = 0.8;
        if (kind === 0) {                       /* radar altimeter: two wings, dish looking down */
            ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
            panel(-25, -3.2, 16, 6.4, 4); panel(9, -3.2, 16, 6.4, 4);
            bus(-4.2, -5, 8.4, 10);
            ctx.strokeStyle = rgba(C.ink, 0.85); ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, 10.5); ctx.moveTo(-2.4, 7.2); ctx.lineTo(0, 10.5); ctx.lineTo(2.4, 7.2); ctx.stroke();
            ctx.fillStyle = rgba(C.ink, 0.92); ctx.beginPath(); ctx.ellipse(0, 6.4, 5, 1.9, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(2.5, -5); ctx.lineTo(4.5, -9); ctx.stroke();
        } else if (kind === 1) {                /* optical imager: one long array, telescope looking down */
            ctx.beginPath(); ctx.moveTo(-5, -1.5); ctx.lineTo(-9, -1.5); ctx.stroke();
            panel(-33, -5, 24, 7, 6);
            bus(-5, -6.5, 10, 12);
            ctx.fillStyle = rgba(C.ink, 0.9); ctx.fillRect(-3, 5.5, 6, 5.5);
            ctx.fillStyle = rgba(C.water, 0.9); ctx.fillRect(-2.1, 9.8, 4.2, 1.2);
            ctx.fillStyle = rgba(C.ink, 0.8); ctx.fillRect(5, -3.5, 2.6, 3);
            ctx.beginPath(); ctx.moveTo(-2, -6.5); ctx.lineTo(-4, -10.5); ctx.stroke();
        } else {                                /* gravity pair: two small craft, one following the other, ranging between them */
            ctx.setLineDash([1.2, 2.4]); ctx.strokeStyle = rgba(C.water, 0.9); ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke(); ctx.setLineDash([]);
            [-15, 15].forEach(function (x) {
                ctx.beginPath(); ctx.moveTo(x - 6.5, 3); ctx.lineTo(x - 4, -3); ctx.lineTo(x + 4, -3); ctx.lineTo(x + 6.5, 3); ctx.closePath();
                var g = ctx.createLinearGradient(0, -3, 0, 3); g.addColorStop(0, rgba(C.water, 1)); g.addColorStop(1, rgba(C.water, 0.7));
                ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rgba(C.ink, 0.6); ctx.lineWidth = 0.6; ctx.stroke();
                ctx.fillStyle = C.foil0; ctx.fillRect(x - 6.5, 3, 13, 1.8);
            });
        }
    }

    function orbits(front) {
        sats.forEach(function (s) {
            ctx.beginPath(); var open = false;
            for (var i = 0; i <= 180; i++) {
                var p = s.at(i / 180 * TAU), isFront = p[2] >= 0, behind = !isFront && Math.hypot(p[0], p[1]) < 1;
                if (isFront !== front || behind) { open = false; continue; }
                var x = cx + p[0] * R, y = cy - p[1] * R;
                if (open) ctx.lineTo(x, y); else { ctx.moveTo(x, y); open = true; }
            }
            ctx.strokeStyle = rgba(C.ink, front ? 0.26 : 0.1); ctx.lineWidth = 0.8; ctx.stroke();
        });
    }

    function step(dt) {
        time += dt;
        if (!drag) { vel += (spin - vel) * Math.min(1, dt * 0.8); lon -= vel * dt; lat += (27 - lat) * Math.min(1, dt * 0.25); }
        if (lon < -180) lon += 360; if (lon > 180) lon -= 360;
        proj.rotate([-lon, -lat, 9]);
        sats.forEach(function (s) {
            var th = s.ph + time / s.period * TAU, p = s.at(th);
            s.tAcc = (s.tAcc || 0) + dt;
            if (s.tAcc > 0.3) {
                s.tAcc = 0;
                if (p[2] > 0.02) {
                    var ll = proj.invert([cx + p[0] / s.r * R, cy - p[1] / s.r * R]);
                    if (ll && isFinite(ll[0])) {
                        s.trail.push({ ll: ll, t: time });
                        lakes.forEach(function (l) { if (time - l.pulse > 5 && d3.geoDistance(l.c, ll) < 0.085) l.pulse = time; });
                    }
                } else if (s.trail.length) s.gap = true;
            }
            while (s.trail.length && time - s.trail[0].t > 9) s.trail.shift();
            if (p[2] <= 0.02 && s.trail.length && time - s.trail[s.trail.length - 1].t > 9) s.trail.length = 0;
        });
    }

    /* drag to turn the globe; it drifts back to its own rotation afterwards */
    cv.addEventListener('pointerdown', function (e) {
        if (Math.hypot(e.offsetX - cx, e.offsetY - cy) > R * 1.05) return;
        drag = { x: e.clientX, y: e.clientY, t: performance.now() }; cv.setPointerCapture(e.pointerId); cv.classList.add('is-dragging');
    });
    cv.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var k = 57.3 / R, dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
        lon -= dx * k; lat = Math.max(-55, Math.min(65, lat + dy * k));
        vel = -dx * k / Math.max(0.008, (now - drag.t) / 1000) * -1; vel = Math.max(-60, Math.min(60, vel));
        drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
        sats.forEach(function (s) { s.trail.length = 0; });
        if (reduce) draw();
    });
    function release() { drag = null; cv.classList.remove('is-dragging'); }
    cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);

    var raf = 0, last = 0, visible = true, frozen = false;
    function frame(t) {
        raf = 0;
        var dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
        step(dt); draw();
        if (visible && !document.hidden && !frozen) raf = requestAnimationFrame(frame);
    }
    function wake() { if (!raf && !reduce && !frozen && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    colours(); resize();
    new MutationObserver(function () { colours(); if (reduce || frozen) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv); else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; wake(); }).observe(cv);
    document.addEventListener('visibilitychange', wake);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { colours(); if (reduce || frozen) draw(); });
    for (var i = 0; i < 240; i++) step(1 / 20);       /* start with swaths already laid down */
    lon = 34; vel = spin; draw(); wake();
    window.__globe = { run: function (sec) { frozen = true; for (var i = 0; i < sec * 30; i++) step(1 / 30); draw(); } };
})();
