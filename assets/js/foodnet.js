/* Grain-trade shock sketch for the home page.
   A toy two-stage model: (1) a drought cuts an exporter's shipments and the shortfall
   travels down each route; (2) exporters with spare grain re-supply importers, and
   importers with more buying power are served first. Volumes are rough and illustrative. */
(function () {
    'use strict';
    var D = window.FOODNET_DATA, root = document.querySelector('.foodnet');
    if (!D || !root) return;
    var cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var SPEED = 78, RATE = 0.5, SPARE = 0.15, TAU = Math.PI * 2;
    var DUR = [3.5, 2.4, 6.5, 9, 4.5];
    var SCEN = [{ shock: { USA: 0.5 } }, { shock: { RUS: 0.6 } }, { shock: { USA: 0.5, RUS: 0.6 } }];
    var LABEL = { USA: [0, 1], CAN: [0, -1], BRA: [1, 0], ARG: [1, 0], RUS: [0, -1], UKR: [-1, 0], FRA: [-1, 0],
                  AUS: [0, 1], IND: [0, 1], THA: [-1, 0], VNM: [1, 0], KAZ: [0, -1] };

    /* ---------- network ---------- */
    var ids = Object.keys(D.nodes), nodes = {}, edges = [];
    ids.forEach(function (id) {
        var n = D.nodes[id];
        nodes[id] = { id: id, name: n.n, x: n.x, y: n.y, exp: n.r === 'E', w: n.w, vol: 0, out: [], inn: [],
                      shock: 0, shockT: 0, seed: Math.random() * 100 };
    });
    D.edges.forEach(function (e) {
        var segs = e.s.map(function (a) {
            var x = [], y = [], c = [0], i;
            for (i = 0; i < a.length; i += 2) { x.push(a[i]); y.push(a[i + 1]); }
            for (i = 1; i < x.length; i++) c.push(c[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]));
            return { x: x, y: y, c: c, len: c[c.length - 1] };
        }).filter(function (s) { return s.x.length > 1; });
        var len = segs.reduce(function (t, s) { return t + s.len; }, 0);
        var ed = { a: nodes[e.a], b: nodes[e.b], f: e.f, segs: segs, len: len, wd: 0.6 + Math.sqrt(e.f) * 0.55,
                   acc: Math.random(), accR: Math.random(), repl: 0, replT: 0,
                   loss: 0, lossT: 0, got: 0, gotT: 0, queue: [] };
        ed.a.out.push(ed); ed.b.inn.push(ed); ed.a.vol += e.f; ed.b.vol += e.f;
        edges.push(ed);
    });
    ids.forEach(function (id) {
        var n = nodes[id];
        n.r = n.exp ? Math.max(3, Math.sqrt(n.vol) * 1.05) : Math.max(2.5, Math.sqrt(n.vol) * 0.8);
    });

    function at(ed, s, out) {
        for (var k = 0; k < ed.segs.length; k++) {
            var sg = ed.segs[k];
            if (s <= sg.len || k === ed.segs.length - 1) {
                var c = sg.c, lo = 0, hi = c.length - 1;
                while (hi - lo > 1) { var m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
                var t = (s - c[lo]) / ((c[hi] - c[lo]) || 1);
                var dx = sg.x[hi] - sg.x[lo], dy = sg.y[hi] - sg.y[lo], l = Math.hypot(dx, dy) || 1;
                out.x = sg.x[lo] + dx * t; out.y = sg.y[lo] + dy * t; out.nx = -dy / l; out.ny = dx / l;
                return out;
            }
            s -= sg.len;
        }
        return out;
    }

    /* ---------- toy model ---------- */
    function reroute(shock) {
        var rem = {}, spare = {}, alloc = new Array(edges.length).fill(0), i, round;
        edges.forEach(function (e) { rem[e.b.id] = (rem[e.b.id] || 0) + e.f * (shock[e.a.id] || 0); });
        ids.forEach(function (id) { if (nodes[id].exp && !shock[id]) spare[id] = nodes[id].vol * SPARE; });
        for (round = 0; round < 4; round++) {
            Object.keys(spare).forEach(function (id) {
                var es = nodes[id].out, tot = 0, wts = es.map(function (e) {
                    var w = Math.sqrt(e.f) * (rem[e.b.id] || 0) * e.b.w; tot += w; return w;
                });
                if (tot <= 0 || spare[id] <= 0.01) return;
                var give = spare[id];
                es.forEach(function (e, j) {
                    var q = Math.min(give * wts[j] / tot, rem[e.b.id] || 0);
                    if (q <= 0) return;
                    alloc[edges.indexOf(e)] += q; rem[e.b.id] -= q; spare[id] -= q;
                });
            });
        }
        return alloc;
    }

    /* ---------- state ---------- */
    var now = 0, stage = 0, stageT = 0, scen = 0, custom = null, hover = null, parts = [];
    var tmp = { x: 0, y: 0, nx: 0, ny: 0 };

    function current() { return custom || SCEN[scen].shock; }
    function arrive(ed, key, v) { ed.queue.push({ t: now + ed.len / SPEED, k: key, v: v }); }

    function enter(s) {
        stage = s; stageT = 0;
        var sh = current();
        if (s === 1) {
            ids.forEach(function (id) { nodes[id].shockT = sh[id] || 0; });
            edges.forEach(function (e) { arrive(e, 'lossT', e.f * (sh[e.a.id] || 0)); });
        } else if (s === 3) {
            var al = reroute(sh);
            edges.forEach(function (e, i) { e.replT = al[i]; arrive(e, 'gotT', al[i]); });
        } else if (s === 4) {
            ids.forEach(function (id) { nodes[id].shockT = 0; });
            edges.forEach(function (e) { e.replT = 0; arrive(e, 'lossT', 0); arrive(e, 'gotT', 0); });
        } else if (s === 0) {
            if (custom) custom = null; else scen = (scen + 1) % SCEN.length;
        }
        ui();
    }

    function spawn(ed, teal, s) {
        parts.push({ e: ed, s: s || 0, teal: teal, off: (Math.random() - 0.5) * ed.wd * 2.4,
                     v: SPEED * (0.9 + Math.random() * 0.2), sz: 0.75 + Math.random() * 0.5 });
    }

    function step(dt) {
        now += dt; stageT += dt;
        if (stageT >= DUR[stage]) enter((stage + 1) % 5);
        var k = 1 - Math.exp(-dt * 1.5), dens = RATE * (scale < 0.6 ? 0.6 : 1), i;
        ids.forEach(function (id) { var n = nodes[id]; n.shock += (n.shockT - n.shock) * k; });
        for (i = 0; i < edges.length; i++) {
            var e = edges[i];
            while (e.queue.length && e.queue[0].t <= now) { var q = e.queue.shift(); e[q.k] = q.v; }
            e.repl += (e.replT - e.repl) * k; e.loss += (e.lossT - e.loss) * k; e.got += (e.gotT - e.got) * k;
            e.acc += dens * e.f * (1 - e.a.shock) * dt; e.accR += dens * e.repl * dt;
            while (e.acc >= 1) { e.acc -= 1; spawn(e, false); }
            while (e.accR >= 1) { e.accR -= 1; spawn(e, true); }
        }
        for (i = parts.length - 1; i >= 0; i--) {
            var p = parts[i]; p.s += p.v * dt;
            if (p.s >= p.e.len) { parts[i] = parts[parts.length - 1]; parts.pop(); }
        }
    }

    /* ---------- drawing ---------- */
    var C = {}, scale = 1, dpr = 1, land = new Path2D(D.land), cssW = 0;
    function colours() {
        var cs = getComputedStyle(root);
        ['land', 'arc', 'grain', 'source', 'drought', 'repl', 'ink', 'halo'].forEach(function (k) {
            C[k] = cs.getPropertyValue('--fn-' + k).trim();
        });
        C.font = cs.fontFamily;
    }
    function resize() {
        cssW = cv.clientWidth; if (!cssW) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2); scale = cssW / D.W;
        cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssW * D.H / D.W * dpr);
        if (reduce) draw();
    }
    function blob(n, R, t) {
        ctx.beginPath();
        for (var i = 0; i <= 56; i++) {
            var a = i / 56 * TAU, s = n.seed;
            var r = R * (1 + 0.11 * Math.sin(2 * a + s + t * 0.22) + 0.07 * Math.sin(3 * a + s * 2.3 - t * 0.17) + 0.045 * Math.sin(5 * a + s * 4.1 + t * 0.13));
            var x = n.x + Math.cos(a) * r * 1.25, y = n.y + Math.sin(a) * r * 0.82;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
    }
    function hatch(n, R, gap) {
        ctx.save(); ctx.clip(); ctx.beginPath();
        for (var d = -R * 3; d < R * 3; d += gap) { ctx.moveTo(n.x + d - R * 2, n.y + R * 2); ctx.lineTo(n.x + d + R * 2, n.y - R * 2); }
        ctx.stroke(); ctx.restore();
    }
    function text(s, x, y, align, base, col, a) {
        ctx.textAlign = align; ctx.textBaseline = base; ctx.globalAlpha = a;
        ctx.lineWidth = 3 / scale; ctx.strokeStyle = C.halo; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y);
        ctx.fillStyle = col; ctx.fillText(s, x, y);
    }

    function draw() {
        var u = Math.max(1, 0.5 / scale), i, e, n, lit;
        ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
        ctx.clearRect(0, 0, D.W, D.H);
        ctx.globalAlpha = 1; ctx.fillStyle = C.land; ctx.fill(land);

        /* routes */
        ctx.lineCap = 'round';
        for (i = 0; i < edges.length; i++) {
            e = edges[i]; lit = !hover || e.a === hover || e.b === hover;
            var hot = e.repl / (e.f + 2), cut = e.a.shock;
            ctx.strokeStyle = hot > 0.02 ? C.repl : cut > 0.05 ? C.drought : C.arc;
            ctx.globalAlpha = (hot > 0.02 ? 0.3 + Math.min(0.4, hot) : cut > 0.05 ? 0.12 + cut * 0.25 : 0.45 + Math.min(0.55, e.f / 12)) * (lit ? (hover ? 1.6 : 1) : 0.3);
            ctx.lineWidth = (0.4 + Math.sqrt(e.f) * 0.2) * u;
            ctx.beginPath();
            e.segs.forEach(function (sg) { ctx.moveTo(sg.x[0], sg.y[0]); for (var j = 1; j < sg.x.length; j++) ctx.lineTo(sg.x[j], sg.y[j]); });
            ctx.stroke();
        }

        /* drought: three severity contours, denser hatching towards the core */
        ids.forEach(function (id) {
            n = nodes[id]; if (n.shock < 0.01) return;
            var g = Math.min(1, n.shock / 0.45), R = (n.r * 2.1 + 20) * (0.55 + 0.45 * g) * Math.min(u, 1.3);
            ctx.strokeStyle = C.drought;
            [[1, 0, 0.75], [0.7, 5.5, 0.6], [0.42, 2.6, 0.85]].forEach(function (lv) {
                blob(n, R * lv[0], now);
                ctx.globalAlpha = g * lv[2]; ctx.lineWidth = 0.7 * u; ctx.stroke();
                if (lv[1]) { ctx.globalAlpha = g * 0.5; ctx.lineWidth = 0.45 * u; hatch(n, R, lv[1] * u); }
            });
        });

        /* shipments */
        for (var pass = 0; pass < 4; pass++) {
            var teal = pass & 1, dim = pass > 1;
            if (dim && !hover) break;
            ctx.fillStyle = teal ? C.repl : C.grain; ctx.globalAlpha = (teal ? 0.95 : 0.8) * (dim ? 0.18 : 1);
            ctx.beginPath();
            for (i = 0; i < parts.length; i++) {
                var p = parts[i];
                if (p.teal != teal) continue;
                lit = !hover || p.e.a === hover || p.e.b === hover;
                if (lit === dim) continue;
                at(p.e, p.s, tmp);
                var edge = Math.min(1, p.s / 5, (p.e.len - p.s) / 5), r = (teal ? 1.55 : 1.3) * p.sz * u * (0.4 + 0.6 * edge);
                var x = tmp.x + tmp.nx * p.off * u, y = tmp.y + tmp.ny * p.off * u;
                ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
            }
            ctx.fill();
        }

        /* nodes */
        ctx.font = '500 ' + (11 / scale) + 'px ' + C.font;
        ids.forEach(function (id) {
            n = nodes[id]; lit = !hover || n === hover || n.out.concat(n.inn).some(function (e) { return e.a === hover || e.b === hover; });
            var a = lit ? 1 : 0.3, r = n.r * u;
            if (n.exp) {
                if (n.shock > 0.01) {
                    ctx.globalAlpha = a; ctx.strokeStyle = C.drought; ctx.lineWidth = 0.8 * u;
                    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.stroke();
                }
                ctx.globalAlpha = a; ctx.fillStyle = C.halo; ctx.beginPath(); ctx.arc(n.x, n.y, r * Math.sqrt(1 - n.shock) + 1.1 * u, 0, TAU); ctx.fill();
                ctx.fillStyle = C.source; ctx.beginPath(); ctx.arc(n.x, n.y, r * Math.sqrt(1 - n.shock), 0, TAU); ctx.fill();
            } else {
                var lost = 0, got = 0;
                n.inn.forEach(function (e) { lost += e.loss; got += e.got; });
                lost = Math.min(1, lost / n.vol); got = Math.min(lost, got / n.vol);
                var rr = r + 3 * u, a0 = -Math.PI / 2, a1 = a0 + TAU * (1 - lost), a2 = a1 + TAU * got;
                ctx.fillStyle = C.halo; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(n.x, n.y, rr + 1.5 * u, 0, TAU); ctx.fill();
                ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
                ctx.lineCap = 'butt'; ctx.lineWidth = 1.7 * u;
                ctx.strokeStyle = C.ink; ctx.globalAlpha = a * 0.38; ctx.beginPath(); ctx.arc(n.x, n.y, rr, a0, a1); ctx.stroke();
                if (lost > 0.004) {
                    ctx.globalAlpha = a;
                    if (got > 0.004) { ctx.strokeStyle = C.repl; ctx.beginPath(); ctx.arc(n.x, n.y, rr, a1, a2); ctx.stroke(); }
                    if (lost - got > 0.004) { ctx.strokeStyle = C.drought; ctx.beginPath(); ctx.arc(n.x, n.y, rr, a2, a0 + TAU); ctx.stroke(); }
                }
                n.gap = lost - got; n.rr = rr;
            }
        });

        /* labels */
        ids.forEach(function (id) {
            n = nodes[id];
            var show = n === hover || (n.exp ? (cssW > 700 || n.shock > 0.05) : (cssW > 700 && stage === 3 && stageT > 4 && n.gap > 0.3));
            if (!show) return;
            var o = LABEL[id] || [1, 0], d = (n.exp ? n.r * u : n.rr) + 4 / scale;
            if (n.exp && n.shock > 0.05) d = Math.max(d, (n.r * 2.1 + 20) * Math.min(u, 1.3) * (o[1] ? 0.9 : 1.32) + 3 / scale);
            if (hover && n !== hover && !n.exp) return;
            text(n.name, n.x + o[0] * d, n.y + o[1] * d, o[0] > 0 ? 'left' : o[0] < 0 ? 'right' : 'center',
                 o[1] > 0 ? 'top' : o[1] < 0 ? 'bottom' : 'middle', n.exp && n.shock > 0.05 ? C.drought : C.ink,
                 hover && n !== hover ? 0.35 : n.exp ? 0.78 : 0.95);
        });
        ctx.globalAlpha = 1;
    }

    /* ---------- interface ---------- */
    var steps = root.querySelectorAll('[data-step]'), btns = root.querySelectorAll('[data-scen]');
    function ui() {
        var s = stage === 4 ? 0 : stage;
        for (var i = 0; i < steps.length; i++) steps[i].classList.toggle('is-on', +steps[i].getAttribute('data-step') === s);
        for (i = 0; i < btns.length; i++) {
            var on = !custom && +btns[i].getAttribute('data-scen') === scen && stage > 0 && stage < 4;
            btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }
    function restart() {
        if (reduce) { settle(); return; }
        enter(1);
    }
    function settle() {   /* jump straight to the re-routed state (reduced motion) */
        var sh = current(), al = reroute(sh);
        ids.forEach(function (id) { nodes[id].shock = nodes[id].shockT = sh[id] || 0; });
        edges.forEach(function (e, i) { e.queue.length = 0; e.loss = e.lossT = e.f * (sh[e.a.id] || 0); e.got = e.gotT = e.repl = e.replT = al[i]; });
        stage = 3; stageT = 99; seed(); ui(); draw();
    }
    function seed() {
        parts.length = 0;
        edges.forEach(function (e) {
            var n = RATE * e.f * (1 - e.a.shock) * e.len / SPEED, m = RATE * e.repl * e.len / SPEED, i;
            for (i = 0; i < n; i++) if (Math.random() < n - i) spawn(e, false, Math.random() * e.len);
            for (i = 0; i < m; i++) if (Math.random() < m - i) spawn(e, true, Math.random() * e.len);
        });
    }
    for (var b = 0; b < btns.length; b++) btns[b].addEventListener('click', function () {
        custom = null; scen = +this.getAttribute('data-scen'); restart();
    });
    function pick(ev) {
        var r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / scale, y = (ev.clientY - r.top) / scale, best = null, bd = 1e9;
        ids.forEach(function (id) { var n = nodes[id], d = Math.hypot(n.x - x, n.y - y) - n.r; if (d < bd) { bd = d; best = n; } });
        return bd < 9 / scale ? best : null;
    }
    cv.addEventListener('pointermove', function (ev) {
        var h = pick(ev); if (h === hover) return;
        hover = h; cv.style.cursor = h && h.exp ? 'pointer' : 'default'; if (reduce) draw();
    });
    cv.addEventListener('pointerleave', function () { hover = null; if (reduce) draw(); });
    cv.addEventListener('click', function (ev) {
        var n = pick(ev); if (!n || !n.exp) return;
        var sh = {}, base = custom && stage > 0 && stage < 4 ? custom : {};
        Object.keys(base).forEach(function (k) { sh[k] = base[k]; });
        if (sh[n.id]) delete sh[n.id]; else sh[n.id] = 0.55;
        if (!Object.keys(sh).length) { custom = null; if (reduce) { scen = 0; settle(); } else { enter(4); } return; }
        custom = sh; restart();
    });

    /* ---------- run ---------- */
    var last = 0, visible = true, raf = 0, frozen = false;
    function frame(t) {
        raf = 0;
        var dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
        step(dt); draw();
        if (visible && !document.hidden && !frozen) raf = requestAnimationFrame(frame);
    }
    function wake() { if (!raf && !reduce && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    colours(); resize();
    new MutationObserver(function () { colours(); if (reduce) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv); else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; wake(); }).observe(root);
    document.addEventListener('visibilitychange', wake);
    if (reduce) { settle(); } else { seed(); ui(); wake(); }
    window.__foodnet = { jump: function (s, t) { frozen = true; enter(s); for (var i = 0; i < t * 30; i++) step(1 / 30); draw(); } };
})();
