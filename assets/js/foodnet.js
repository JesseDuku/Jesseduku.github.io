/* Grain-trade shock sketch for the home page.
   A toy two-stage model: (1) a drought cuts an exporter's shipments and the shortfall
   travels down each route at the speed of the grain already at sea; (2) exporters with
   spare grain re-supply importers, and importers with more buying power are served first.
   Volumes are rough and illustrative. Geometry: Equal Earth projection, great-circle routes. */
(function () {
    'use strict';
    var D = window.FOODNET_DATA, root = document.querySelector('.foodnet');
    if (!D || !root) return;
    var cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var SPEED = 78, RATE = 0.5, SPARE = 0.15, TAU = Math.PI * 2;
    var DUR = [3.5, 2.6, 6.5, 9, 4.5], INTRO = 7.5;
    var SCEN = [{ USA: 0.5 }, { RUS: 0.6 }, { USA: 0.5, RUS: 0.6 }];
    var LABEL = { USA: [0, 1], CAN: [0, -1], BRA: [1, 0], ARG: [1, 0], RUS: [0, -1], UKR: [-1, 0], FRA: [-1, 0],
                  AUS: [0, 1], IND: [0, 1], THA: [-1, 0], VNM: [1, 0], KAZ: [1, -1],
                  MEX: [-1, 0], COL: [-1, 0], PER: [-1, 0], NGA: [-1, 0], MAR: [-1, 0], DZA: [0, -1], EGY: [-1, 0],
                  SDN: [-1, 0], TUR: [0, -1], PAK: [0, -1], CHN: [0, -1], KOR: [0, -1], IDN: [0, 1] };
    var cs = getComputedStyle(root), C = {};
    ['bg', 'land', 'coast', 'grat', 'route', 'grain', 'drought', 'repl', 'ink'].forEach(function (k) {
        C[k] = cs.getPropertyValue('--fn-' + k).trim();
    });
    var FONT = cs.fontFamily;

    /* ---------- network ---------- */
    var ids = Object.keys(D.nodes), nodes = {}, edges = [], maxLen = 0;
    ids.forEach(function (id) {
        var n = D.nodes[id];
        nodes[id] = { id: id, name: n.n, x: n.x, y: n.y, exp: n.r === 'E', w: n.w, vol: 0, out: [], inn: [],
                      shock: 0, shockT: 0, seed: Math.random() * 100, lab: 0, gap: 0, pulse: -9, pulseC: '' };
    });
    D.edges.forEach(function (e) {
        var segs = e.s.map(function (a) {
            var x = [], y = [], c = [0], i;
            for (i = 0; i < a.length; i += 2) { x.push(a[i]); y.push(a[i + 1]); }
            for (i = 1; i < x.length; i++) c.push(c[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]));
            return { x: x, y: y, c: c, len: c[c.length - 1] };
        }).filter(function (s) { return s.x.length > 1; });
        var len = segs.reduce(function (t, s) { return t + s.len; }, 0);
        var ed = { a: nodes[e.a], b: nodes[e.b], f: e.f, segs: segs, len: len, wd: 0.5 + Math.sqrt(e.f) * 0.5,
                   acc: Math.random(), accR: Math.random(), repl: 0, replT: 0,
                   loss: 0, lossT: 0, got: 0, gotT: 0, queue: [], cut0: -1, cut1: -1, rep0: -1, rep1: -1 };
        ed.a.out.push(ed); ed.b.inn.push(ed); ed.a.vol += e.f; ed.b.vol += e.f;
        maxLen = Math.max(maxLen, len); edges.push(ed);
    });
    ids.forEach(function (id) {
        var n = nodes[id];
        n.r = n.exp ? Math.max(3, Math.sqrt(n.vol) * 1.05) : Math.max(2.4, Math.sqrt(n.vol) * 0.78);
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
    /* add the stretch of a route between distances s0 and s1 to the current path */
    function trace(ed, s0, s1) {
        var off = 0;
        for (var k = 0; k < ed.segs.length; k++) {
            var sg = ed.segs[k], a = s0 - off, b = s1 - off, c = sg.c, j = 1, t;
            off += sg.len;
            if (b <= 0 || a >= sg.len) continue;
            if (a < 0) a = 0; if (b > sg.len) b = sg.len;
            while (j < c.length - 1 && c[j] < a) j++;
            t = (a - c[j - 1]) / ((c[j] - c[j - 1]) || 1);
            ctx.moveTo(sg.x[j - 1] + (sg.x[j] - sg.x[j - 1]) * t, sg.y[j - 1] + (sg.y[j] - sg.y[j - 1]) * t);
            while (j < c.length && c[j] < b) { ctx.lineTo(sg.x[j], sg.y[j]); j++; }
            if (j < c.length) {
                t = (b - c[j - 1]) / ((c[j] - c[j - 1]) || 1);
                ctx.lineTo(sg.x[j - 1] + (sg.x[j] - sg.x[j - 1]) * t, sg.y[j - 1] + (sg.y[j] - sg.y[j - 1]) * t);
            }
        }
    }

    /* ---------- toy model ---------- */
    function reroute(shock) {
        var rem = {}, spare = {}, alloc = new Array(edges.length).fill(0), round;
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
    var now = 0, stage = 0, stageT = 0, scen = -1, custom = null, hover = null, parts = [], first = true;
    var tmp = { x: 0, y: 0, nx: 0, ny: 0 };

    function current() { return custom || SCEN[Math.max(0, scen)]; }
    function arrive(ed, key, v) { ed.queue.push({ t: now + ed.len / SPEED, k: key, v: v }); }

    function enter(s) {
        stage = s; stageT = 0;
        var sh = current();
        if (s === 1) {
            first = false;
            ids.forEach(function (id) { nodes[id].shockT = sh[id] || 0; });
            edges.forEach(function (e) {
                var v = e.f * (sh[e.a.id] || 0);
                arrive(e, 'lossT', v);
                if (v > 0 && (e.cut0 < 0 || e.cut1 >= 0)) { e.cut0 = now; e.cut1 = -1; }
                else if (!v && e.cut0 >= 0 && e.cut1 < 0) e.cut1 = now;
                if (e.rep0 >= 0 && e.rep1 < 0) { e.rep1 = now; e.replT = 0; arrive(e, 'gotT', 0); }
            });
        } else if (s === 3) {
            var al = reroute(sh);
            edges.forEach(function (e, i) {
                e.replT = al[i]; arrive(e, 'gotT', al[i]);
                if (al[i] > 0.05) { e.rep0 = now; e.rep1 = -1; }
            });
        } else if (s === 4) {
            ids.forEach(function (id) { nodes[id].shockT = 0; });
            edges.forEach(function (e) {
                e.replT = 0; arrive(e, 'lossT', 0); arrive(e, 'gotT', 0);
                if (e.cut0 >= 0 && e.cut1 < 0) e.cut1 = now;
                if (e.rep0 >= 0 && e.rep1 < 0) e.rep1 = now;
            });
        } else if (s === 0) {
            if (custom) custom = null; else scen = (scen + 1) % SCEN.length;
        }
        ui();
    }

    function spawn(ed, teal, s) {
        parts.push({ e: ed, s: s || 0, teal: teal, off: (Math.random() - 0.5) * ed.wd * 2.2,
                     v: SPEED * (0.9 + Math.random() * 0.2), sz: 0.8 + Math.random() * 0.45,
                     x: 0, y: 0, tx: 0, ty: 0, mx: 0, my: 0, a: 0 });
    }

    function step(dt) {
        now += dt; stageT += dt;
        if (stageT >= (first && stage === 0 ? INTRO : DUR[stage])) {
            if (stage === 0 && scen < 0) scen = 0;
            enter((stage + 1) % 5);
        }
        var k = 1 - Math.exp(-dt * 1.5), dens = RATE * (scale < 0.6 ? 0.6 : 1), i;
        ids.forEach(function (id) { var n = nodes[id]; n.shock += (n.shockT - n.shock) * k; });
        for (i = 0; i < edges.length; i++) {
            var e = edges[i];
            while (e.queue.length && e.queue[0].t <= now) {
                var q = e.queue.shift();
                if (q.v > e[q.k] + 0.2 && now - e.b.pulse > 1.4) { e.b.pulse = now; e.b.pulseC = q.k === 'lossT' ? C.drought : C.repl; }
                e[q.k] = q.v;
            }
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
    var scale = 1, dpr = 1, ox = 0, cw = 0, ch = 0, land = new Path2D(D.land), grat = new Path2D(D.grat);
    function resize() {
        cw = cv.clientWidth; ch = cv.clientHeight; if (!cw || !ch) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        var mw = Math.min(cw, ch * D.W / D.H); scale = mw / D.W; ox = (cw - mw) / 2;
        cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
        if (reduce || frozen) draw();
    }
    function blob(n, R, t) {
        ctx.beginPath();
        for (var i = 0; i <= 64; i++) {
            var a = i / 64 * TAU, s = n.seed;
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
    function ease(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); }
    function related(n) { return n === hover || n.out.some(function (e) { return e.b === hover; }) || n.inn.some(function (e) { return e.a === hover; }); }

    function draw() {
        var u = Math.max(1, 0.5 / scale), px = 1 / scale, i, e, n, lit, p;
        var intro = first ? now * SPEED * 1.25 : 1e9, fade = first ? ease(now / 1.2) : 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, cw, ch);
        ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, 0);

        /* base map */
        ctx.globalAlpha = fade; ctx.strokeStyle = C.grat; ctx.lineWidth = px; ctx.stroke(grat);
        ctx.fillStyle = C.land; ctx.fill(land);
        ctx.strokeStyle = C.coast; ctx.lineWidth = 0.75 * px; ctx.lineJoin = 'round'; ctx.stroke(land);

        /* routes: quiet base line, then the stretches a shock or a re-supply has reached */
        ctx.lineCap = 'round';
        for (i = 0; i < edges.length; i++) {
            e = edges[i]; lit = !hover || e.a === hover || e.b === hover;
            ctx.strokeStyle = 'rgba(' + C.route + ',' + ((0.1 + Math.min(0.16, e.f / 60)) * (lit ? (hover ? 2 : 1) : 0.3)).toFixed(3) + ')';
            ctx.lineWidth = (0.45 + Math.sqrt(e.f) * 0.2) * u;
            ctx.beginPath(); trace(e, 0, Math.min(e.len, intro)); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'lighter';
        for (i = 0; i < edges.length; i++) {
            e = edges[i]; lit = !hover || e.a === hover || e.b === hover;
            var w = (0.6 + Math.sqrt(e.f) * 0.24) * u, s0, s1;
            if (e.cut0 >= 0) {
                s1 = Math.min(e.len, (now - e.cut0) * SPEED); s0 = e.cut1 >= 0 ? (now - e.cut1) * SPEED : 0;
                if (s0 >= e.len) e.cut0 = e.cut1 = -1;
                else { ctx.strokeStyle = C.drought; ctx.globalAlpha = (lit ? 0.5 : 0.12); ctx.lineWidth = w; ctx.beginPath(); trace(e, s0, s1); ctx.stroke(); }
            }
            if (e.rep0 >= 0) {
                s1 = Math.min(e.len, (now - e.rep0) * SPEED); s0 = e.rep1 >= 0 ? (now - e.rep1) * SPEED : 0;
                if (s0 >= e.len) e.rep0 = e.rep1 = -1;
                else { ctx.strokeStyle = C.repl; ctx.globalAlpha = (lit ? 0.55 : 0.12); ctx.lineWidth = w; ctx.beginPath(); trace(e, s0, s1); ctx.stroke(); }
            }
        }

        /* drought: a warm field and three severity contours, hatched more densely towards the core */
        ids.forEach(function (id) {
            n = nodes[id]; if (n.shock < 0.01) return;
            var g = Math.min(1, n.shock / 0.45), R = (n.r * 2.1 + 20) * (0.5 + 0.5 * g) * Math.min(u, 1.3);
            var gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, R * 1.7);
            gr.addColorStop(0, C.drought); gr.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = 0.2 * g; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(n.x, n.y, R * 1.7, 0, TAU); ctx.fill();
            ctx.strokeStyle = C.drought;
            [[1, 0, 0.7], [0.7, 5.5, 0.6], [0.42, 2.6, 0.9]].forEach(function (lv, j) {
                var gj = ease((g - j * 0.12) / 0.76);
                blob(n, R * lv[0], now);
                ctx.globalAlpha = gj * lv[2]; ctx.lineWidth = 0.75 * u; ctx.stroke();
                if (lv[1]) { ctx.globalAlpha = gj * 0.55; ctx.lineWidth = 0.45 * u; hatch(n, R, lv[1] * u); }
            });
        });

        /* shipments: a bright head with a fading wake */
        for (i = 0; i < parts.length; i++) {
            p = parts[i];
            at(p.e, p.s, tmp); p.x = tmp.x + tmp.nx * p.off * u; p.y = tmp.y + tmp.ny * p.off * u;
            at(p.e, Math.max(0, p.s - 3.2 * u), tmp); p.mx = tmp.x + tmp.nx * p.off * u; p.my = tmp.y + tmp.ny * p.off * u;
            at(p.e, Math.max(0, p.s - 9 * u), tmp); p.tx = tmp.x + tmp.nx * p.off * u; p.ty = tmp.y + tmp.ny * p.off * u;
            p.a = Math.abs(p.x - p.tx) > 40 ? 0 : 1;
        }
        for (var pass = 0; pass < 4; pass++) {
            var teal = !!(pass & 1), dim = pass > 1;
            if (dim && !hover) break;
            var col = teal ? C.repl : C.grain, k = dim ? 0.16 : 1;
            ctx.strokeStyle = col; ctx.fillStyle = col;
            for (var layer = 0; layer < 3; layer++) {
                ctx.beginPath();
                for (i = 0; i < parts.length; i++) {
                    p = parts[i]; if (p.teal !== teal) continue;
                    lit = !hover || p.e.a === hover || p.e.b === hover;
                    if (lit === dim) continue;
                    if (layer === 2) { var r = (teal ? 1.2 : 1.05) * p.sz * u; ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, TAU); }
                    else if (p.a) { ctx.moveTo(layer ? p.mx : p.tx, layer ? p.my : p.ty); ctx.lineTo(p.x, p.y); }
                }
                if (layer === 2) { ctx.globalAlpha = 0.95 * k; ctx.fill(); }
                else { ctx.globalAlpha = (layer ? 0.5 : 0.22) * k; ctx.lineWidth = (layer ? 1.5 : 1.1) * u; ctx.stroke(); }
            }
        }
        ctx.globalCompositeOperation = 'source-over';

        /* nodes */
        ids.forEach(function (id) {
            n = nodes[id]; lit = !hover || related(n);
            var a = (lit ? 1 : 0.3) * fade, r = n.r * u;
            if (n.exp) {
                var rs = r * Math.sqrt(1 - n.shock);
                ctx.globalCompositeOperation = 'lighter';
                var gl = ctx.createRadialGradient(n.x, n.y, rs * 0.6, n.x, n.y, rs * 2.6);
                gl.addColorStop(0, C.grain); gl.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = 0.28 * a * (1 - n.shock); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(n.x, n.y, rs * 2.6, 0, TAU); ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
                if (n.shock > 0.01) {
                    ctx.globalAlpha = a * Math.min(1, n.shock * 4); ctx.strokeStyle = C.drought; ctx.lineWidth = 0.9 * u;
                    ctx.setLineDash([2 * u, 2 * u]); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
                }
                ctx.globalAlpha = a; ctx.fillStyle = C.bg; ctx.beginPath(); ctx.arc(n.x, n.y, rs + 1.2 * u, 0, TAU); ctx.fill();
                ctx.fillStyle = C.grain; ctx.beginPath(); ctx.arc(n.x, n.y, rs, 0, TAU); ctx.fill();
                n.rr = r;
            } else {
                var lost = 0, got = 0;
                n.inn.forEach(function (e) { lost += e.loss; got += e.got; });
                lost = Math.min(1, lost / n.vol); got = Math.min(lost, got / n.vol);
                var rr = r + 3 * u, a0 = -Math.PI / 2, a1 = a0 + TAU * (1 - lost), a2 = a1 + TAU * got;
                ctx.globalAlpha = a; ctx.fillStyle = C.bg; ctx.beginPath(); ctx.arc(n.x, n.y, rr + 1.6 * u, 0, TAU); ctx.fill();
                ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
                ctx.lineCap = 'butt'; ctx.lineWidth = 1.7 * u;
                ctx.strokeStyle = C.ink; ctx.globalAlpha = a * 0.34; ctx.beginPath(); ctx.arc(n.x, n.y, rr, a0, a1); ctx.stroke();
                if (lost > 0.004) {
                    ctx.globalAlpha = a;
                    if (got > 0.004) { ctx.strokeStyle = C.repl; ctx.beginPath(); ctx.arc(n.x, n.y, rr, a1, a2); ctx.stroke(); }
                    if (lost - got > 0.004) { ctx.strokeStyle = C.drought; ctx.beginPath(); ctx.arc(n.x, n.y, rr, a2, a0 + TAU); ctx.stroke(); }
                }
                var pt = (now - n.pulse) / 1.1;   /* one ring as a shortfall or a re-supply lands */
                if (pt < 1 && lit) {
                    ctx.globalAlpha = (1 - pt) * 0.8; ctx.strokeStyle = n.pulseC; ctx.lineWidth = 1.1 * u;
                    ctx.beginPath(); ctx.arc(n.x, n.y, rr + 2 * u + ease(pt) * 11 * u, 0, TAU); ctx.stroke();
                }
                n.gap = lost - got; n.rr = rr;
            }
        });

        /* labels */
        ctx.font = '500 ' + (11 * px) + 'px ' + FONT; ctx.lineJoin = 'round';
        ids.forEach(function (id) {
            n = nodes[id];
            var want = n === hover ? 1 : hover ? (n.exp && related(n) ? 0.5 : 0)
                     : n.exp ? (cw > 700 || n.shock > 0.05 ? 1 : 0) : (cw > 700 && stage === 3 && stageT > 3.5 && n.gap > 0.28 ? 1 : 0);
            n.lab += (want - n.lab) * (reduce || frozen ? 1 : 0.12);
            if (n.lab < 0.02) return;
            var o = LABEL[id] || [1, 0], d = n.rr + 4.5 * px, hot = n.exp && n.shock > 0.05;
            if (hot) d = Math.max(d, (n.r * 2.1 + 20) * Math.min(u, 1.3) * (o[1] ? 0.9 : 1.32) + 3 * px);
            var x = n.x + o[0] * d * (o[1] ? 0.7 : 1), y = n.y + o[1] * d * (o[0] ? 0.7 : 1);
            ctx.textAlign = o[0] > 0 ? 'left' : o[0] < 0 ? 'right' : 'center';
            ctx.textBaseline = o[1] > 0 ? 'top' : o[1] < 0 ? 'bottom' : 'middle';
            ctx.globalAlpha = n.lab * fade; ctx.lineWidth = 3.5 * px; ctx.strokeStyle = C.bg; ctx.strokeText(n.name, x, y);
            ctx.globalAlpha = n.lab * fade * (hot || n === hover || !n.exp ? 1 : 0.72);
            ctx.fillStyle = hot ? C.drought : C.ink; ctx.fillText(n.name, x, y);
        });

        /* dissolve the map into the band at its edges */
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in';
        var gx = ctx.createLinearGradient(0, 0, D.W, 0);
        gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.05, '#000'); gx.addColorStop(0.95, '#000'); gx.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gx; ctx.fillRect(-ox / scale, 0, cw / scale, D.H);
        var gy = ctx.createLinearGradient(0, 0, 0, D.H);
        gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.08, '#000'); gy.addColorStop(0.94, '#000'); gy.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gy; ctx.fillRect(-ox / scale, 0, cw / scale, D.H);
        ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------- interface ---------- */
    var steps = root.querySelectorAll('[data-step]'), btns = root.querySelectorAll('[data-scen]');
    function ui() {
        var s = stage === 4 ? 0 : stage, i;
        for (i = 0; i < steps.length; i++) {
            var k = +steps[i].getAttribute('data-step');
            steps[i].classList.toggle('is-on', k === s);
            steps[i].classList.toggle('is-done', stage !== 4 && k < s);
        }
        for (i = 0; i < btns.length; i++) {
            var on = !custom && +btns[i].getAttribute('data-scen') === scen && stage > 0 && stage < 4;
            btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        progress();
    }
    function progress() {
        var p = stage === 0 ? (first ? stageT / INTRO : (DUR[4] + stageT) / (DUR[4] + DUR[0]))
              : stage === 4 ? stageT / (DUR[4] + DUR[0]) : stageT / DUR[stage];
        steps[stage === 4 ? 0 : stage].style.setProperty('--p', Math.min(1, p).toFixed(3));
    }
    function settle() {   /* jump straight to the re-routed state (reduced motion) */
        var sh = current(), al = reroute(sh);
        first = false; if (scen < 0) scen = 0;
        ids.forEach(function (id) { nodes[id].shock = nodes[id].shockT = sh[id] || 0; });
        edges.forEach(function (e, i) {
            e.queue.length = 0; e.loss = e.lossT = e.f * (sh[e.a.id] || 0); e.got = e.gotT = e.repl = e.replT = al[i];
            e.cut0 = e.loss > 0 ? -99 : -1; e.rep0 = al[i] > 0.05 ? -99 : -1; e.cut1 = e.rep1 = -1;
        });
        now = 0; stage = 3; stageT = 99; seed(); ui(); steps[3].style.setProperty('--p', 1); draw();
    }
    function seed() {
        parts.length = 0;
        edges.forEach(function (e) {
            var n = RATE * e.f * (1 - e.a.shock) * e.len / SPEED, m = RATE * e.repl * e.len / SPEED, i;
            for (i = 0; i < n; i++) if (Math.random() < n - i) spawn(e, false, Math.random() * e.len);
            for (i = 0; i < m; i++) if (Math.random() < m - i) spawn(e, true, Math.random() * e.len);
        });
    }
    function restart() { if (reduce) settle(); else enter(1); }
    for (var b = 0; b < btns.length; b++) btns[b].addEventListener('click', function () {
        custom = null; scen = +this.getAttribute('data-scen'); restart();
    });
    function pick(ev) {
        var r = cv.getBoundingClientRect(), x = (ev.clientX - r.left - ox) / scale, y = (ev.clientY - r.top) / scale, best = null, bd = 1e9;
        ids.forEach(function (id) { var n = nodes[id], d = Math.hypot(n.x - x, n.y - y) - n.r; if (d < bd) { bd = d; best = n; } });
        return bd < 10 / scale ? best : null;
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
        if (!Object.keys(sh).length) { custom = null; if (reduce) { scen = 0; settle(); } else enter(4); return; }
        custom = sh; restart();
    });

    /* ---------- run ---------- */
    var last = 0, visible = true, raf = 0, frozen = false;
    function frame(t) {
        raf = 0;
        var dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
        step(dt); progress(); draw();
        if (visible && !document.hidden && !frozen) raf = requestAnimationFrame(frame);
    }
    function wake() { if (!raf && !reduce && !frozen && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv); else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; wake(); }).observe(root);
    document.addEventListener('visibilitychange', wake);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (reduce) draw(); });
    if (reduce) settle(); else { ui(); wake(); }
    window.__foodnet = { jump: function (s, t) {
        frozen = true; if (first) { first = false; scen = 0; seed(); }
        if (s !== stage || s === 1) enter(s);
        for (var i = 0; i < t * 30; i++) step(1 / 30);
        progress(); draw();
    } };
})();
