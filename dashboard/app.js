/*
 * SustainDC Ops Console: UI layer.
 * Depends on model.js (window.DCModel). No libraries, no build step.
 * Every number drawn on the LIVE tab comes from the illustrative model; numbers on the
 * MEASURED RESULTS tab come from DCModel.MEASURED (our real SustainDC runs).
 */
(function () {
  'use strict';
  const M = window.DCModel;
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const KEYS = ['baseline', 'mappo', 'happo', 'manual'];
  const COL = { baseline: '#9aa6b4', mappo: '#b388ff', happo: '#ffb547', manual: '#7ee787' };
  const NAME = { baseline: 'Baseline', mappo: 'MAPPO', happo: 'HAPPO (ours)', manual: 'Manual' };
  const HIST = 192; // two simulated days on the charts

  const app = {
    env: { demand: 1, toutOffset: 0, ciScale: 1 },
    ctrl: 'happo', compare: false, playing: true, speed: 4,
    manual: { sp: 18, ls: 1, bat: 2 },
    sims: null, hist: null, n: 0, view: 'live', acc: 0, last: 0,
  };

  // ------------------------------------------------------------------ helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function lerpColor(a, b, t) {
    const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
    return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join('');
  }
  const tempColor = t => t < 26 ? lerpColor('58e1ff', 'ffd84d', (t - 15) / 11) : lerpColor('ffd84d', 'ff6b6b', (t - 26) / 12);
  const ciColor = ci => ci < 220 ? '#7ee787' : ci < 270 ? '#ffd84d' : '#ff6b6b';
  const ciWord = ci => ci < 220 ? 'CLEAN' : ci < 270 ? 'MIXED' : 'DIRTY';

  // ------------------------------------------------------------------ simulation
  function manualAct(s) {
    const d = app.manual.sp - s.sp;
    return { ls: app.manual.ls, dc: d >= 0.5 ? 1 : d <= -0.5 ? -1 : 0, bat: app.manual.bat };
  }
  function reset(startStep) {
    app.sims = {};
    KEYS.forEach(k => { const s = M.createState(k); s.step = startStep || 0; app.sims[k] = s; });
    app.hist = { ci: [], hour: [] };
    KEYS.forEach(k => { app.hist[k] = []; app.hist[k + 'C'] = []; });
    app.n = 0;
    tick();
  }
  function tick() {
    for (const k of KEYS) {
      const s = app.sims[k];
      const inp = M.inputsAt(s.step, app.env);
      const act = k === 'manual' ? manualAct(s) : M.controllers[k](s, inp);
      const prev = Object.assign({}, s.lastAction);
      M.step(s, act, app.env);
      s.changed = { ls: prev.ls !== s.lastAction.ls, dc: prev.dc !== s.lastAction.dc, bat: prev.bat !== s.lastAction.bat };
      app.hist[k].push(s.out.grid); app.hist[k + 'C'].push(s.out.carbonRate);
      if (app.hist[k].length > HIST) { app.hist[k].shift(); app.hist[k + 'C'].shift(); }
    }
    const o = app.sims.baseline.out;
    app.hist.ci.push(o.inp.ci); app.hist.hour.push(o.inp.hour + o.inp.minute / 60);
    if (app.hist.ci.length > HIST) { app.hist.ci.shift(); app.hist.hour.shift(); }
    app.n += 1;
    onTick();
  }
  function jumpToHour(h) {
    const cur = app.sims.baseline.step;
    let target = Math.floor(cur / 96) * 96 + h * 4;
    if (target <= cur) target += 96;
    KEYS.forEach(k => { app.sims[k].step = target; });
    tick();
  }

  // ------------------------------------------------------------------ facility SVG
  const F = {};
  function buildFacility() {
    const svg = $('facility');
    const defs = el('defs', {}, svg);
    const sky = el('linearGradient', { id: 'skyg', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    F.sky1 = el('stop', { offset: '0', 'stop-color': '#0b1f36' }, sky);
    F.sky2 = el('stop', { offset: '1', 'stop-color': '#04070d' }, sky);
    const glow = el('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: 3, result: 'b' }, glow);
    const mg = el('feMerge', {}, glow); el('feMergeNode', { in: 'b' }, mg); el('feMergeNode', { in: 'SourceGraphic' }, mg);

    // sky + grid side
    el('rect', { x: 0, y: 0, width: 275, height: 430, rx: 10, fill: 'url(#skyg)', stroke: '#1b2c44' }, svg);
    F.sun = el('circle', { cx: 60, cy: 40, r: 11, fill: '#ffd84d', filter: 'url(#glow)' }, svg);
    el('text', { x: 14, y: 22, fill: '#8fa0b3', 'font-size': 11, 'letter-spacing': 1.5 }, svg).textContent = 'CAISO GRID';
    // pylon
    const py = el('g', { stroke: '#8fa0b3', 'stroke-width': 2, fill: 'none' }, svg);
    el('path', { d: 'M60 205 L80 80 L100 205 M66 165 L94 165 M70 130 L90 130 M74 100 L86 100 M62 195 L94 140 M98 195 L66 140 M50 95 L110 95 M55 118 L105 118' }, py);
    F.ciBadge = el('rect', { x: 18, y: 222, width: 124, height: 46, rx: 6, fill: '#08121f', stroke: '#7ee787', 'stroke-width': 1.5 }, svg);
    F.ciVal = el('text', { x: 80, y: 244, 'text-anchor': 'middle', fill: '#e6edf3', 'font-size': 18, 'font-family': 'Consolas, monospace' }, svg);
    F.ciTxt = el('text', { x: 80, y: 260, 'text-anchor': 'middle', fill: '#7ee787', 'font-size': 10, 'letter-spacing': 1 }, svg);
    F.solar = el('text', { x: 80, y: 285, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 11 }, svg);
    F.tout = el('text', { x: 80, y: 302, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 11 }, svg);

    // substation
    el('rect', { x: 160, y: 120, width: 80, height: 50, rx: 5, fill: '#0d1829', stroke: '#ffd84d', 'stroke-width': 1.5 }, svg);
    el('text', { x: 200, y: 141, 'text-anchor': 'middle', fill: '#ffd84d', 'font-size': 10, 'letter-spacing': 1 }, svg).textContent = 'SUBSTATION';
    F.gridKw = el('text', { x: 200, y: 160, 'text-anchor': 'middle', fill: '#e6edf3', 'font-size': 13, 'font-family': 'Consolas, monospace' }, svg);

    // battery
    el('rect', { x: 165, y: 245, width: 70, height: 110, rx: 6, fill: '#0d1829', stroke: '#ffd84d', 'stroke-width': 1.5 }, svg);
    el('rect', { x: 188, y: 238, width: 24, height: 8, rx: 2, fill: '#ffd84d' }, svg);
    F.batFill = el('rect', { x: 171, y: 251, width: 58, height: 98, rx: 3, fill: '#ffd84d', opacity: 0.55 }, svg);
    F.batTxt = el('text', { x: 200, y: 305, 'text-anchor': 'middle', fill: '#e6edf3', 'font-size': 15, 'font-family': 'Consolas, monospace', 'font-weight': 700 }, svg);
    F.batKw = el('text', { x: 200, y: 375, 'text-anchor': 'middle', fill: '#ffd84d', 'font-size': 11 }, svg);
    el('text', { x: 200, y: 392, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 10, 'letter-spacing': 1 }, svg).textContent = '1 MWh BATTERY';

    // power lines
    const power = el('g', { fill: 'none', 'stroke-linecap': 'round' }, svg);
    F.pGrid = el('path', { d: 'M100 110 L130 110 L130 145 L160 145', stroke: '#ffd84d', 'stroke-width': 3, class: 'flow' }, power);
    F.pBus = el('path', { d: 'M240 145 L290 145', stroke: '#ffd84d', 'stroke-width': 3, class: 'flow' }, power);
    F.pBat = el('path', { d: 'M200 238 L200 170', stroke: '#ffd84d', 'stroke-width': 3, class: 'flow' }, power);
    F.pCool = el('path', { d: 'M260 145 L260 34 L985 34 L985 270 L962 270', stroke: '#ffd84d', 'stroke-width': 2, class: 'flow' }, power);

    // data hall
    el('rect', { x: 290, y: 55, width: 500, height: 370, rx: 10, fill: '#070e19', stroke: '#2a4566', 'stroke-width': 1.5 }, svg);
    el('text', { x: 304, y: 74, fill: '#8fa0b3', 'font-size': 11, 'letter-spacing': 2 }, svg).textContent = 'DATA HALL · 3 ROWS × 8 RACKS';
    F.hallTxt = el('text', { x: 712, y: 74, 'text-anchor': 'end', fill: '#8fa0b3', 'font-size': 11, 'font-family': 'Consolas, monospace' }, svg);
    F.aisles = [
      { y: 82, h: 18, hot: true }, { y: 160, h: 55, hot: false }, { y: 275, h: 55, hot: true }, { y: 390, h: 22, hot: false },
    ].map(a => Object.assign(a, { r: el('rect', { x: 300, y: a.y, width: 420, height: a.h, rx: 4, fill: '#58e1ff', opacity: 0.12 }, svg) }));
    el('text', { x: 306, y: 192, fill: '#58e1ff', 'font-size': 10, 'letter-spacing': 2, opacity: 0.8 }, svg).textContent = 'COLD AISLE';
    el('text', { x: 306, y: 307, fill: '#ff6b6b', 'font-size': 10, 'letter-spacing': 2, opacity: 0.8 }, svg).textContent = 'HOT AISLE';
    F.coldT = el('text', { x: 714, y: 192, 'text-anchor': 'end', fill: '#e6edf3', 'font-size': 12, 'font-family': 'Consolas, monospace' }, svg);
    F.hotT = el('text', { x: 714, y: 307, 'text-anchor': 'end', fill: '#e6edf3', 'font-size': 12, 'font-family': 'Consolas, monospace' }, svg);

    // airflow
    const air = el('g', { fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    F.airCold = [el('path', { d: 'M728 178 L380 178', stroke: '#58e1ff', class: 'flow' }, air), el('path', { d: 'M728 401 L380 401', stroke: '#58e1ff', class: 'flow' }, air)];
    F.airHot = [el('path', { d: 'M420 296 L728 296', stroke: '#ff6b6b', class: 'flow' }, air), el('path', { d: 'M310 91 L728 91', stroke: '#ff6b6b', class: 'flow' }, air)];

    // racks
    F.leds = [];
    [100, 215, 330].forEach((ry, row) => {
      for (let i = 0; i < 8; i++) {
        const x = 310 + i * 52;
        el('rect', { x, y: ry, width: 40, height: 60, rx: 3, fill: '#0d1829', stroke: '#2a4566' }, svg);
        const leds = [];
        for (let j = 0; j < 5; j++) leds.push(el('rect', { x: x + 6, y: ry + 6 + j * 10.5, width: 28, height: 5, rx: 1.5, fill: '#1b2c44' }, svg));
        F.leds.push({ leds, seed: (row * 8 + i) * 7.31 });
      }
    });

    // CRAH units
    F.fans = [];
    [100, 215, 330].forEach(y => {
      el('rect', { x: 730, y, width: 50, height: 60, rx: 4, fill: '#0d1829', stroke: '#7ee787', 'stroke-width': 1.5 }, svg);
      const g = el('g', { class: 'fan' }, svg);
      el('circle', { cx: 755, cy: y + 30, r: 16, fill: 'none', stroke: '#7ee787', 'stroke-width': 1, opacity: 0.6 }, g);
      for (let a = 0; a < 3; a++) el('path', { d: 'M755 ' + (y + 30) + ' q 4 -12 0 -14 q -4 2 0 14', fill: '#7ee787', opacity: 0.85, transform: 'rotate(' + a * 120 + ' 755 ' + (y + 30) + ')' }, g);
      F.fans.push(g);
    });
    el('text', { x: 755, y: 92, 'text-anchor': 'middle', fill: '#7ee787', 'font-size': 10, 'letter-spacing': 1 }, svg).textContent = 'CRAH';

    // chilled-water loop, chiller and cooling tower
    const water = el('g', { fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
    F.pChw = [el('path', { d: 'M780 130 L810 130 L810 255 L830 255', stroke: '#4fd1c5', class: 'flow' }, water), el('path', { d: 'M830 290 L800 290 L800 360 L780 360', stroke: '#4fd1c5', class: 'flow' }, water)];
    F.pCond = el('path', { d: 'M895 230 L895 175', stroke: '#4fd1c5', class: 'flow', 'stroke-width': 3 }, water);
    el('rect', { x: 830, y: 230, width: 130, height: 80, rx: 6, fill: '#0d1829', stroke: '#4fd1c5', 'stroke-width': 1.5 }, svg);
    el('text', { x: 895, y: 252, 'text-anchor': 'middle', fill: '#4fd1c5', 'font-size': 11, 'letter-spacing': 1.5 }, svg).textContent = 'CHILLER';
    F.coolKw = el('text', { x: 895, y: 276, 'text-anchor': 'middle', fill: '#e6edf3', 'font-size': 16, 'font-family': 'Consolas, monospace' }, svg);
    F.coolSub = el('text', { x: 895, y: 296, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 10 }, svg);
    el('path', { d: 'M845 175 L860 80 L930 80 L945 175 Z', fill: '#0d1829', stroke: '#4fd1c5', 'stroke-width': 1.5 }, svg);
    el('text', { x: 895, y: 140, 'text-anchor': 'middle', fill: '#4fd1c5', 'font-size': 10, 'letter-spacing': 1 }, svg).textContent = 'COOLING';
    el('text', { x: 895, y: 153, 'text-anchor': 'middle', fill: '#4fd1c5', 'font-size': 10, 'letter-spacing': 1 }, svg).textContent = 'TOWER';
    F.steamG = el('g', {}, svg);
    [0, 0.75, 1.5, 2.25].forEach((d, i) => {
      const c = el('circle', { cx: 875 + i * 13, cy: 72, r: 9, fill: '#c4fdff', class: 'steam' }, F.steamG);
      c.style.animationDelay = d + 's';
    });
    F.waterTxt = el('text', { x: 903, y: 205, 'text-anchor': 'start', fill: '#8fa0b3', 'font-size': 10 }, svg);

    // setpoint / PUE readout
    el('rect', { x: 820, y: 330, width: 165, height: 95, rx: 8, fill: '#08121f', stroke: '#7ee787', 'stroke-width': 1.2 }, svg);
    el('text', { x: 832, y: 350, fill: '#7ee787', 'font-size': 10, 'letter-spacing': 1.5 }, svg).textContent = 'CRAH SUPPLY SETPOINT';
    F.spTxt = el('text', { x: 832, y: 382, fill: '#e6edf3', 'font-size': 28, 'font-family': 'Consolas, monospace', 'font-weight': 700 }, svg);
    F.puetxt = el('text', { x: 832, y: 410, fill: '#8fa0b3', 'font-size': 12, 'font-family': 'Consolas, monospace' }, svg);

    // job ingress + deferred queue
    el('rect', { x: 14, y: 445, width: 972, height: 125, rx: 10, fill: '#070e19', stroke: '#1b2c44' }, svg);
    el('text', { x: 28, y: 466, fill: '#ff7eb6', 'font-size': 11, 'letter-spacing': 2 }, svg).textContent = 'JOB INGRESS · ALIBABA CPU TRACE · 60 % OF EACH HOUR\'S JOBS ARE FLEXIBLE (12 h DEADLINE)';
    F.pJobs = el('path', { d: 'M30 505 L470 505 L470 425', stroke: '#ff7eb6', 'stroke-width': 6, fill: 'none', class: 'flow', 'stroke-dasharray': '10 12' }, svg);
    F.pDefer = el('path', { d: 'M330 505 L330 540 L560 540', stroke: '#ff7eb6', 'stroke-width': 3, fill: 'none', class: 'flow', opacity: 0.2 }, svg);
    F.pRun = el('path', { d: 'M960 540 L960 520 L620 520 L620 425', stroke: '#ff7eb6', 'stroke-width': 3, fill: 'none', class: 'flow', opacity: 0.2 }, svg);
    el('rect', { x: 560, y: 528, width: 400, height: 24, rx: 4, fill: '#0d1829', stroke: '#ff7eb6', 'stroke-width': 1 }, svg);
    F.qFill = el('rect', { x: 562, y: 530, width: 0, height: 20, rx: 3, fill: '#ff7eb6', opacity: 0.55 }, svg);
    F.qOver = el('rect', { x: 562, y: 530, width: 0, height: 20, rx: 3, fill: '#ff6b6b' }, svg);
    el('text', { x: 566, y: 564, fill: '#8fa0b3', 'font-size': 10, 'letter-spacing': 1 }, svg).textContent = 'DEFERRED-JOB QUEUE';
    F.qTxt = el('text', { x: 955, y: 564, 'text-anchor': 'end', fill: '#e6edf3', 'font-size': 11, 'font-family': 'Consolas, monospace' }, svg);
    F.demandTxt = el('text', { x: 30, y: 532, fill: '#e6edf3', 'font-size': 13, 'font-family': 'Consolas, monospace' }, svg);
    F.lsTxt = el('text', { x: 30, y: 552, fill: '#ff7eb6', 'font-size': 12 }, svg);

    // agent badges
    F.badges = {
      ls: badge(svg, 400, 505, '#ff7eb6', 'LS'),
      dc: badge(svg, 805, 70, '#7ee787', 'DC'),
      bat: badge(svg, 252, 300, '#ffd84d', 'BAT'),
    };
  }
  function badge(svg, x, y, c, label) {
    const g = el('g', {}, svg);
    const ring = el('circle', { cx: x, cy: y, r: 15, fill: 'none', stroke: c, 'stroke-width': 2, class: 'ring', opacity: 0 }, g);
    el('circle', { cx: x, cy: y, r: 14, fill: '#04070d', stroke: c, 'stroke-width': 2 }, g);
    el('text', { x, y: y + 4, 'text-anchor': 'middle', fill: c, 'font-size': label.length > 2 ? 9 : 10, 'font-weight': 700 }, g).textContent = label;
    return ring;
  }
  function pulse(node) { node.classList.remove('pulse'); void node.getBoundingClientRect(); node.classList.add('pulse'); }
  function setFlow(path, kw, ref, reverse) {
    const on = kw > 1;
    path.style.opacity = on ? 1 : 0.15;
    path.style.animationPlayState = on && app.playing ? 'running' : 'paused';
    const dur = clamp(1.6 * ref / Math.max(kw, 1), 0.35, 4).toFixed(1) + 's';
    if (path.style.animationDuration !== dur) path.style.animationDuration = dur;
    path.style.animationDirection = reverse ? 'reverse' : 'normal';
  }

  function renderFacility(s) {
    const o = s.out, inp = o.inp;
    // sky and grid
    const day = inp.solar > 0.02;
    F.sky1.setAttribute('stop-color', day ? lerpColor('0b1f36', '1d4a72', inp.solar / 0.47) : '#060d1a');
    const hf = (inp.hour + inp.minute / 60);
    const ang = day ? (hf - 6.5) / 13.5 : ((hf + 24 - 19.5) % 24) / 11;
    F.sun.setAttribute('cx', 30 + ang * 220);
    F.sun.setAttribute('cy', 70 - Math.sin(Math.PI * clamp(ang, 0, 1)) * 40);
    F.sun.setAttribute('fill', day ? '#ffd84d' : '#c4fdff');
    F.sun.setAttribute('r', day ? 11 : 8);
    const cc = ciColor(inp.ci);
    F.ciBadge.setAttribute('stroke', cc);
    F.ciVal.textContent = fmt(inp.ci) + ' g/kWh';
    F.ciTxt.textContent = ciWord(inp.ci) + ' GRID'; F.ciTxt.setAttribute('fill', cc);
    F.solar.textContent = 'solar share ' + fmt(inp.solar * 100) + ' %';
    F.tout.textContent = 'outdoor ' + fmt(inp.tout, 1) + ' °C';
    F.gridKw.textContent = fmt(o.grid) + ' kW';
    // battery
    const h = 98 * clamp(s.soc, 0, 1);
    F.batFill.setAttribute('y', 251 + 98 - h); F.batFill.setAttribute('height', h);
    F.batTxt.textContent = fmt(s.soc * 100) + '%';
    F.batKw.textContent = o.batKw > 1 ? 'charging ' + fmt(o.batKw) + ' kW' : o.batKw < -1 ? 'discharging ' + fmt(-o.batKw) + ' kW' : 'idle';
    setFlow(F.pGrid, o.grid, 1400); setFlow(F.pBus, o.facility, 1400); setFlow(F.pCool, o.cool, 400);
    setFlow(F.pBat, Math.abs(o.batKw), 250, o.batKw < 0);
    // hall
    F.hallTxt.textContent = 'IT ' + fmt(o.it) + ' kW · util ' + fmt(o.util * 100) + ' %';
    F.aisles.forEach(a => { a.r.setAttribute('fill', tempColor(a.hot ? o.hotAisle : o.inlet)); a.r.setAttribute('opacity', a.hot ? 0.2 : 0.14); });
    F.coldT.textContent = fmt(o.inlet, 1) + ' °C'; F.hotT.textContent = fmt(o.hotAisle, 1) + ' °C';
    F.airCold.forEach(p => { setFlow(p, o.cool, 360); p.setAttribute('stroke', tempColor(o.inlet)); });
    F.airHot.forEach(p => { setFlow(p, o.cool, 360); p.setAttribute('stroke', tempColor(o.hotAisle)); });
    const ledOn = o.inlet > 27 ? '#ffb547' : '#7ee787';
    F.leds.forEach(r => {
      const wob = 0.12 * Math.sin(s.step * 0.9 + r.seed);
      const lit = Math.round(clamp(o.util + wob, 0, 1) * 5);
      r.leds.forEach((l, j) => l.setAttribute('fill', j >= 5 - lit ? ledOn : '#1b2c44'));
    });
    // cooling plant
    const fanDur = clamp(0.25 * 376 / Math.max(o.cool, 1), 0.12, 2).toFixed(2) + 's';
    F.fans.forEach(f => { f.style.animationDuration = fanDur; f.style.animationPlayState = app.playing ? 'running' : 'paused'; });
    F.pChw.forEach(p => setFlow(p, o.cool, 380)); setFlow(F.pCond, o.cool, 380);
    F.coolKw.textContent = fmt(o.cool) + ' kW';
    F.coolSub.textContent = 'cooling / IT = ' + fmt(o.cool / o.it, 3);
    F.steamG.style.opacity = clamp(o.water / 800, 0.2, 1);
    F.steamG.querySelectorAll('circle').forEach(c => { c.style.animationPlayState = app.playing ? 'running' : 'paused'; });
    F.waterTxt.textContent = 'water ' + fmt(o.water) + ' L/h';
    F.spTxt.textContent = fmt(s.sp, 1) + ' °C';
    F.spTxt.setAttribute('fill', s.sp <= 15.5 ? '#7ee787' : s.sp >= 20 ? '#ffb547' : '#e6edf3');
    F.puetxt.textContent = 'PUE ' + fmt(o.pue, 3);
    // jobs
    const ls = s.lastAction.ls;
    setFlow(F.pJobs, inp.demand * 1000, 500);
    F.pDefer.style.opacity = ls === 'defer flexible jobs' ? 1 : 0.12;
    F.pRun.style.opacity = ls === 'run deferred jobs' && o.queue > 0.001 ? 1 : 0.12;
    const qmax = 12; // capacity-steps shown full scale
    F.qFill.setAttribute('width', 396 * clamp(o.queue / qmax, 0, 1));
    F.qOver.setAttribute('width', 396 * clamp(o.overdue / qmax, 0, 1));
    F.qTxt.textContent = fmt(o.queue * 0.25, 2) + ' cap·h' + (o.overdue > 0 ? '  · OVERDUE' : '');
    F.demandTxt.textContent = 'incoming ' + fmt(inp.demand * 100) + ' % · running ' + fmt(o.util * 100) + ' %';
    F.lsTxt.textContent = 'load shifter: ' + ls;
    if (s.changed) ['ls', 'dc', 'bat'].forEach(k => { if (s.changed[k]) pulse(F.badges[k]); });
  }

  // ------------------------------------------------------------------ gauges
  function buildGauge(svg, title, unit) {
    const g = {};
    const arc = (a0, a1, r) => {
      const p = a => [80 + r * Math.cos(Math.PI * (1 - a)), 82 - r * Math.sin(Math.PI * (1 - a))];
      const [x0, y0] = p(a0), [x1, y1] = p(a1);
      return 'M' + x0 + ' ' + y0 + ' A' + r + ' ' + r + ' 0 0 1 ' + x1 + ' ' + y1;
    };
    g.arc = arc;
    el('path', { d: arc(0, 1, 58), stroke: '#1b2c44', 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round' }, svg);
    g.bar = el('path', { d: arc(0, 0.001, 58), stroke: '#58e1ff', 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round' }, svg);
    g.val = el('text', { x: 80, y: 76, 'text-anchor': 'middle', fill: '#e6edf3', 'font-size': 20, 'font-family': 'Consolas, monospace' }, svg);
    el('text', { x: 80, y: 96, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 10, 'letter-spacing': 1.5 }, svg).textContent = title;
    g.unit = unit;
    return g;
  }
  function setGauge(g, v, lo, hi, color, d) {
    const t = clamp((v - lo) / (hi - lo), 0.001, 1);
    g.bar.setAttribute('d', g.arc(0, t, 58)); g.bar.setAttribute('stroke', color);
    g.val.textContent = fmt(v, d);
  }

  // ------------------------------------------------------------------ canvas charts
  const charts = {};
  function setupCanvas(c) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function registerChart(id, draw) {
    const c = $(id);
    charts[id] = { c, draw, hover: null };
    c.addEventListener('mousemove', e => { const r = c.getBoundingClientRect(); charts[id].hover = (e.clientX - r.left) / r.width; draw(charts[id]); });
    c.addEventListener('mouseleave', () => { charts[id].hover = null; draw(charts[id]); });
  }
  function drawLines(ch, opt) {
    const s = setupCanvas(ch.c); if (!s) return;
    const { ctx, w, h } = s;
    const padL = 48, padR = 22, padT = 10, padB = opt.strip ? 34 : 22;
    const n = opt.n;
    let lo = Infinity, hi = -Infinity;
    opt.series.forEach(se => se.data.forEach(v => { const y = opt.log ? Math.log10(Math.max(v, 1)) : v; lo = Math.min(lo, y); hi = Math.max(hi, y); }));
    if (opt.yMin !== undefined) lo = opt.yMin;
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const span = hi - lo; if (!opt.yMin && opt.yMin !== 0) lo -= span * 0.08; hi += span * 0.08;
    const X = i => padL + (n <= 1 ? 0 : i / (n - 1)) * (w - padL - padR);
    const Y = v => padT + (1 - ((opt.log ? Math.log10(Math.max(v, 1)) : v) - lo) / (hi - lo)) * (h - padT - padB);
    // grid
    ctx.font = '11px Consolas, monospace'; ctx.fillStyle = '#5d6f84'; ctx.strokeStyle = 'rgba(143,160,179,0.12)'; ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4, y = padT + (1 - k / 4) * (h - padT - padB);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(opt.log ? (v <= 0 ? '0' : '1e' + v.toFixed(0)) : opt.yFmt(v), padL - 6, y + 4);
    }
    if (opt.zero && lo < 0 && hi > 0) { ctx.strokeStyle = 'rgba(230,237,243,0.35)'; ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke(); }
    // x labels
    ctx.textAlign = 'center'; ctx.fillStyle = '#5d6f84';
    if (opt.xLabels) opt.xLabels(n).forEach(([i, t]) => ctx.fillText(t, X(i), h - 6));
    // strip
    if (opt.strip) {
      const sw = (w - padL - padR) / Math.max(n, 1);
      opt.strip.data.forEach((v, i) => { ctx.fillStyle = opt.strip.color(v); ctx.globalAlpha = 0.85; ctx.fillRect(X(i) - sw / 2, h - padB + 6, sw + 0.5, 8); });
      ctx.globalAlpha = 1;
    }
    // series
    opt.series.forEach(se => {
      ctx.strokeStyle = se.color; ctx.lineWidth = se.width || 2; ctx.setLineDash(se.dash || []); ctx.lineJoin = 'round';
      ctx.beginPath();
      se.data.forEach((v, i) => { const x = X(i), y = Y(v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
      if (se.dots) se.data.forEach((v, i) => { ctx.fillStyle = se.color; ctx.beginPath(); ctx.arc(X(i), Y(v), 3.5, 0, 7); ctx.fill(); });
    });
    // hover crosshair + tooltip
    if (ch.hover !== null && n > 0) {
      const i = clamp(Math.round(((ch.hover * w) - padL) / (w - padL - padR) * (n - 1)), 0, n - 1);
      const x = X(i);
      ctx.strokeStyle = 'rgba(230,237,243,0.4)'; ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
      const lines = [opt.tipTitle(i)].concat(opt.series.filter(se => se.label).map(se => [se, se.label + ': ' + opt.yFmt(se.data[i])]));
      ctx.font = '12px Consolas, monospace';
      const tw = Math.max.apply(null, lines.map(l => ctx.measureText(typeof l === 'string' ? l : l[1]).width)) + 26;
      const tx = x + tw + 12 > w ? x - tw - 8 : x + 8, ty = padT + 4, th = lines.length * 16 + 8;
      ctx.fillStyle = 'rgba(6,12,22,0.94)'; ctx.strokeStyle = '#2a4566'; ctx.fillRect(tx, ty, tw, th); ctx.strokeRect(tx, ty, tw, th);
      lines.forEach((l, k) => {
        ctx.textAlign = 'left';
        if (typeof l === 'string') { ctx.fillStyle = '#8fa0b3'; ctx.fillText(l, tx + 8, ty + 16 + k * 16); }
        else { ctx.fillStyle = l[0].color; ctx.fillRect(tx + 8, ty + 9 + k * 16, 10, 3); ctx.fillStyle = '#e6edf3'; ctx.fillText(l[1], tx + 22, ty + 16 + k * 16); }
        if (typeof l !== 'string' && l[0].dots) { /* dots already drawn */ }
      });
      opt.series.forEach(se => { ctx.fillStyle = se.color; ctx.beginPath(); ctx.arc(x, Y(se.data[i]), 4, 0, 7); ctx.fill(); ctx.strokeStyle = '#04070d'; ctx.lineWidth = 2; ctx.stroke(); });
    }
  }
  function liveSeries(suffix) {
    const shown = app.compare ? ['baseline', 'mappo', 'happo'].concat(app.ctrl === 'manual' ? ['manual'] : []) : (app.ctrl === 'baseline' ? ['baseline'] : ['baseline', app.ctrl]);
    return shown.map(k => ({ data: app.hist[k + suffix], color: COL[k], label: NAME[k], dash: k === 'baseline' ? [5, 4] : null, width: k === app.ctrl ? 2.5 : 1.6 }));
  }
  const hourLabels = n => {
    const out = [];
    for (let i = 0; i < n; i++) { const hr = app.hist.hour[i]; if (Math.abs(hr % 6) < 1e-6) out.push([i, String(hr).padStart(2, '0') + ':00']); }
    return out;
  };
  const tipHour = i => { const hr = app.hist.hour[i]; return 'time ' + String(Math.floor(hr)).padStart(2, '0') + ':' + String(Math.round((hr % 1) * 60)).padStart(2, '0') + ' · CI ' + fmt(app.hist.ci[i]); };
  function drawPower(ch) {
    drawLines(ch, { n: app.hist.ci.length, series: liveSeries(''), yFmt: v => fmt(v), xLabels: hourLabels, tipTitle: tipHour });
  }
  function drawCarbon(ch) {
    drawLines(ch, { n: app.hist.ci.length, series: liveSeries('C'), yFmt: v => fmt(v), xLabels: hourLabels, tipTitle: tipHour, strip: { data: app.hist.ci, color: ciColor } });
  }
  function legendHTML(series, extra) {
    return series.map(se => '<span><b style="background:' + se.color + '"></b>' + se.label + '</span>').join('') + (extra || '');
  }

  // measured charts
  const ksteps = i => fmt(M.MEASURED.steps[i] / 1000) + 'k steps';
  function drawReward(ch) {
    drawLines(ch, {
      n: M.MEASURED.steps.length, zero: true,
      series: [{ data: M.MEASURED.rewardHAPPO, color: COL.happo, label: 'HAPPO', dots: true }, { data: M.MEASURED.rewardMAPPO, color: COL.mappo, label: 'MAPPO', dots: true }],
      yFmt: v => fmt(v), tipTitle: ksteps,
      xLabels: n => [0, 4, 8, 12, 16, n - 1].map(i => [i, fmt(M.MEASURED.steps[i] / 1e6, 1) + 'M']),
    });
  }
  function drawBacklog(ch) {
    drawLines(ch, {
      n: M.MEASURED.steps.length, log: true, yMin: 0,
      series: [{ data: M.MEASURED.backlogHAPPO, color: COL.happo, label: 'HAPPO', dots: true }, { data: M.MEASURED.backlogMAPPO, color: COL.mappo, label: 'MAPPO', dots: true }],
      yFmt: v => fmt(v), tipTitle: ksteps,
      xLabels: n => [0, 4, 8, 12, 16, n - 1].map(i => [i, fmt(M.MEASURED.steps[i] / 1e6, 1) + 'M']),
    });
  }
  function drawLevers(ch) {
    const s = setupCanvas(ch.c); if (!s) return;
    const { ctx, w, h } = s;
    const L = M.MEASURED.levers, padL = 150, padR = 60, rowH = (h - 30) / L.length;
    const X = v => padL + (v / -12) * (w - padL - padR); // values are negative
    ctx.font = '12px Consolas, monospace';
    ctx.strokeStyle = 'rgba(143,160,179,0.15)';
    [0, -3, -6, -9, -12].forEach(v => { ctx.beginPath(); ctx.moveTo(X(v), 4); ctx.lineTo(X(v), h - 22); ctx.stroke(); ctx.fillStyle = '#5d6f84'; ctx.textAlign = 'center'; ctx.fillText(v + ' %', X(v), h - 6); });
    let hoverRow = ch.hover === null ? -1 : -2;
    L.forEach((r, i) => {
      const y0 = 6 + i * rowH;
      ctx.fillStyle = '#cfd8e3'; ctx.textAlign = 'right'; ctx.font = '13px Bahnschrift, Segoe UI, sans-serif';
      ctx.fillText(r.name, padL - 10, y0 + rowH / 2 + 4);
      ctx.font = '12px Consolas, monospace';
      [['energy', '#ffd84d', 0], ['carbon', '#7ee787', 1]].forEach(([key, c, k]) => {
        const v = r[key], bh = rowH * 0.3, by = y0 + rowH * 0.15 + k * (bh + 3);
        ctx.fillStyle = c; ctx.globalAlpha = 0.9;
        const x1 = X(Math.min(v, -0.0001));
        ctx.fillRect(padL, by, Math.max(x1 - padL, 2), bh);
        ctx.globalAlpha = 1; ctx.fillStyle = '#e6edf3'; ctx.textAlign = 'left';
        ctx.fillText((v === 0 ? '0.0' : signed(v)) + ' %', Math.max(x1, padL + 2) + 6, by + bh - 1);
      });
    });
    ctx.strokeStyle = 'rgba(230,237,243,0.5)'; ctx.beginPath(); ctx.moveTo(padL, 4); ctx.lineTo(padL, h - 22); ctx.stroke();
    void hoverRow;
  }

  // ------------------------------------------------------------------ KPI / table rendering
  // Like-for-like totals: work still waiting in the deferred queue has not been paid for yet,
  // and energy drawn from the battery (relative to its 50 % start) must be bought back later.
  // Both are charged back at the day's average carbon intensity, so savings are not inflated
  // just because work or battery energy was postponed.
  const meanCI = () => M.DATA.ci.reduce((a, b) => a + b, 0) / M.DATA.ci.length * (app.env.ciScale || 1);
  function owedKWh(s) {
    const o = s.out, C = M.C;
    const perUnit = C.itRef * (1 - C.itIdleFrac) / C.loadRef * (1 + C.fanSlope * (s.sp - 18)) * (1 + o.cool / o.it) * 0.25;
    return o.queue * perUnit + (0.5 - s.soc) * C.batCap;
  }
  const adjE = s => s.cum.energy + owedKWh(s);
  const adjC = s => s.cum.carbon + owedKWh(s) * meanCI() / 1000;
  const disp = {};
  function ease(id, target, d, unit) {
    const cur = disp[id] === undefined ? target : disp[id];
    const nv = Math.abs(target - cur) < Math.pow(10, -d) ? target : cur + (target - cur) * 0.18;
    disp[id] = nv;
    $(id).innerHTML = fmt(nv, d) + '<small>' + unit + '</small>';
  }
  let G;
  function renderKPIs() {
    const s = app.sims[app.ctrl], o = s.out, b = app.sims.baseline;
    ease('k-grid', o.grid, 0, 'kW'); ease('k-it', o.it, 0, 'kW'); ease('k-cool', o.cool, 0, 'kW');
    ease('k-inlet', o.inlet, 1, '°C'); ease('k-hot', o.hotAisle, 1, '°C'); ease('k-util', o.util * 100, 0, '%');
    ease('k-queue', o.queue * 0.25, 2, 'cap·h'); ease('k-crate', o.carbonRate, 0, 'kg/h'); ease('k-water', o.water, 0, 'L/h');
    const eS = (adjE(b) - adjE(s)) / 1000, cS = (adjC(b) - adjC(s)) / 1000;
    ease('k-esaved', eS, 2, 'MWh'); ease('k-csaved', cS, 2, 't');
    setGauge(G.pue, o.pue, 1.0, 1.6, o.pue < 1.37 ? '#7ee787' : o.pue < 1.4 ? '#ffd84d' : '#ff6b6b', 3);
    setGauge(G.ci, o.inp.ci, 150, 400, ciColor(o.inp.ci), 0);
  }
  function renderSlow() {
    const s = app.sims[app.ctrl], o = s.out, b = app.sims.baseline, bo = b.out;
    const inp = o.inp;
    $('clock').innerHTML = 'D' + inp.day + ' ' + String(inp.hour).padStart(2, '0') + ':' + String(inp.minute).padStart(2, '0') + '<span>15-MIN CONTROL STEP · ' + app.n + ' STEPS RUN</span>';
    const dGrid = (o.grid - bo.grid) / bo.grid * 100;
    $('k-grid-sub').textContent = app.ctrl === 'baseline' ? 'reference controller' : 'baseline now ' + fmt(bo.grid) + ' kW (' + signed(dGrid) + ' %)';
    $('k-util-sub').textContent = 'incoming ' + fmt(inp.demand * 100) + ' %';
    const oldest = s.queue.length ? Math.max.apply(null, s.queue.map(x => x.age)) / 4 : 0;
    $('k-queue-sub').textContent = s.queue.length ? 'oldest ' + fmt(oldest, 1) + ' h of 12 h' + (o.overdue > 0 ? ' · OVERDUE' : '') : 'empty';
    const eP = (adjE(b) - adjE(s)) / adjE(b) * 100;
    const cP = (adjC(b) - adjC(s)) / adjC(b) * 100;
    $('k-esaved-sub').textContent = fmt(eP, 1) + ' % since reset (like-for-like)';
    $('k-csaved-sub').textContent = fmt(cP, 1) + ' % since reset (like-for-like)';
    const who = $('who'); who.textContent = NAME[app.ctrl].toUpperCase(); who.style.color = COL[app.ctrl]; who.style.borderColor = COL[app.ctrl];
    // agent cards
    $('ag-ls-obs').textContent = 'CI ' + fmt(inp.ci) + ' · 12 h min ' + fmt(inp.ciMin12) + ' · queue ' + fmt(o.queue * 0.25, 2);
    $('ag-dc-obs').textContent = 'outdoor ' + fmt(inp.tout, 1) + ' °C · setpoint ' + fmt(s.sp, 1) + ' °C';
    $('ag-bat-obs').textContent = 'SoC ' + fmt(s.soc * 100) + ' % · CI forecast ' + inp.ciForecast.map(v => fmt(v)).join('/');
    $('ag-ls-act').textContent = s.lastAction.ls; $('ag-dc-act').textContent = s.lastAction.dc; $('ag-bat-act').textContent = s.lastAction.bat;
    ['ls', 'dc', 'bat'].forEach(k => { if (s.changed && s.changed[k]) { const c = $('ag-' + k); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } });
    // comparison table
    const rows = KEYS.map(k => {
      const x = app.sims[k], e = x.cum.energy, cb = x.cum.carbon;
      const de = (adjE(x) - adjE(b)) / adjE(b) * 100, dc = (adjC(x) - adjC(b)) / adjC(b) * 100;
      const cls = k === 'baseline' ? 'b' : k === 'mappo' ? 'm' : k === 'happo' ? 'h' : '';
      const mark = k === app.ctrl ? ' ◂' : '';
      return '<tr><td class="' + cls + '" style="color:' + COL[k] + '">' + NAME[k] + mark + '</td><td>' + fmt(e * 4 / app.n) + '</td><td>' + fmt(e / 1000, 2) + '</td><td>' + fmt(cb / 1000, 2) +
        '</td><td>' + (k === 'baseline' ? '—' : signed(de) + ' %') + '</td><td>' + (k === 'baseline' ? '—' : signed(dc) + ' %') + '</td><td>' + fmt((x.cum.it + x.cum.cool) / x.cum.it, 3) +
        '</td><td>' + fmt(x.cum.water / 1000, 1) + '</td><td>' + fmt(x.cum.overdue * 0.25, 2) + '</td></tr>';
    });
    document.querySelector('#cmp-table tbody').innerHTML = rows.join('');
    // charts
    drawPower(charts['ch-power']); drawCarbon(charts['ch-carbon']);
    const ser = liveSeries('');
    $('lg-power').innerHTML = legendHTML(ser);
    $('lg-carbon').innerHTML = legendHTML(ser, '<span>bottom strip = grid CO₂ intensity (green clean · red dirty)</span>');
  }
  function onTick() {
    if (!G) return;
    const s = app.sims[app.ctrl];
    renderFacility(s); renderSlow();
  }

  // ------------------------------------------------------------------ controls
  const CTRL_NOTE = {
    baseline: 'Standard operation, the reference in our study: 18 °C setpoint, no job shifting, battery idle.',
    manual: 'You drive the three agents with their real action spaces (setpoint ±1 °C per step, defer / normal / run queue, charge / discharge / idle).',
    mappo: 'Rule-based emulation of what our MAPPO policy learned: 15 °C setpoint, coarser timing of shifting and battery. Not the trained network.',
    happo: 'Rule-based emulation of what our HAPPO policy learned: 15 °C setpoint, defers only when a cleaner hour is forecast and clears its queue before deadlines. Not the trained network.',
  };
  function setCtrl(k) {
    app.ctrl = k;
    document.querySelectorAll('#ctrl-group .btn').forEach(b => b.classList.toggle('on', b.dataset.ctrl === k));
    $('manual-box').classList.toggle('disabled', k !== 'manual');
    $('manual-note').textContent = k === 'manual' ? 'Manual control active. The comparison table tracks your run against the others.' : 'Select MANUAL to drive the three agents yourself.';
    $('ctrl-note').textContent = CTRL_NOTE[k];
    $('fac-title').textContent = 'Facility · live view · ' + NAME[k];
    onTick();
  }
  function setSpeed(v) { app.speed = v; document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === v)); }
  function setPlaying(p) {
    app.playing = p; $('btn-play').textContent = p ? '❚❚ PAUSE' : '▶ PLAY'; $('btn-play').classList.toggle('on', p);
    onTick();
  }
  function setEnv(key, v) {
    app.env[key] = v;
    const map = { demand: ['s-demand', 'o-demand', x => '×' + fmt(x, 2)], toutOffset: ['s-tout', 'o-tout', x => signed(x) + ' °C'], ciScale: ['s-ci', 'o-ci', x => '×' + fmt(x, 2)] };
    const [s, o, f] = map[key]; $(s).value = v; $(o).textContent = key === 'toutOffset' && v === 0 ? '+0.0 °C' : f(v);
  }
  function setSeg(id, v) { document.querySelectorAll('#' + id + ' .btn').forEach(b => b.classList.toggle('on', +b.dataset.v === v)); }
  function setManual(key, v) {
    app.manual[key] = v;
    if (key === 'sp') { $('s-sp').value = v; $('o-sp').textContent = fmt(v, 1) + ' °C'; }
    if (key === 'ls') setSeg('seg-ls', v);
    if (key === 'bat') setSeg('seg-bat', v);
  }
  function setCompare(c) { app.compare = c; $('chk-compare').checked = c; onTick(); }

  const PRESETS = {
    baseline: () => { envDefaults(); setCtrl('baseline'); setCompare(false); },
    happo: () => { envDefaults(); setCtrl('happo'); setCompare(false); },
    mappo: () => { envDefaults(); setCtrl('mappo'); setCompare(false); },
    cooling: () => { envDefaults(); setManual('sp', 15); setManual('ls', 1); setManual('bat', 2); setCtrl('manual'); setCompare(false); },
    heatwave: () => { envDefaults(); setEnv('demand', 1.3); setEnv('toutOffset', 6); setCtrl('happo'); setCompare(true); },
    evening: () => { envDefaults(); setCtrl('happo'); setCompare(true); reset(0); jumpToHour(17); setSpeed(4); },
    dirty: () => { envDefaults(); setEnv('ciScale', 1.3); setCtrl('happo'); setCompare(true); },
    compare: () => { setCtrl('happo'); setCompare(true); setSpeed(16); },
  };
  function envDefaults() { setEnv('demand', 1); setEnv('toutOffset', 0); setEnv('ciScale', 1); }

  function bindControls() {
    $('btn-play').onclick = () => setPlaying(!app.playing);
    $('btn-step').onclick = () => { setPlaying(false); tick(); };
    $('btn-reset').onclick = () => { reset(0); };
    document.querySelectorAll('[data-speed]').forEach(b => { b.onclick = () => setSpeed(+b.dataset.speed); });
    document.querySelectorAll('.tab').forEach(t => { t.onclick = () => showView(t.dataset.view); });
    document.querySelectorAll('#ctrl-group .btn').forEach(b => { b.onclick = () => setCtrl(b.dataset.ctrl); });
    $('chk-compare').onchange = e => setCompare(e.target.checked);
    $('s-demand').oninput = e => setEnv('demand', +e.target.value);
    $('s-tout').oninput = e => setEnv('toutOffset', +e.target.value);
    $('s-ci').oninput = e => setEnv('ciScale', +e.target.value);
    document.querySelectorAll('#jump .btn').forEach(b => { b.onclick = () => jumpToHour(+b.dataset.hour); });
    $('s-sp').oninput = e => setManual('sp', +e.target.value);
    document.querySelectorAll('#seg-ls .btn').forEach(b => { b.onclick = () => setManual('ls', +b.dataset.v); });
    document.querySelectorAll('#seg-bat .btn').forEach(b => { b.onclick = () => setManual('bat', +b.dataset.v); });
    document.querySelectorAll('#presets .preset').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#presets .preset').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        PRESETS[b.dataset.preset]();
      };
    });
    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !/INPUT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); setPlaying(!app.playing); }
    });
    window.addEventListener('resize', () => Object.values(charts).forEach(ch => ch.draw(ch)));
  }
  function showView(v) {
    app.view = v;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
    document.querySelectorAll('.view').forEach(x => x.classList.toggle('on', x.id === 'view-' + v));
    requestAnimationFrame(() => Object.values(charts).forEach(ch => ch.draw(ch)));
    if (v === 'lab') runIteration();
  }

  // ------------------------------------------------------------------ lab: update order
  const LAB = { busy: false, auto: true };
  const AG = [{ k: 'ls', c: '#ff7eb6', t: 'LS' }, { k: 'dc', c: '#7ee787', t: 'DC' }, { k: 'bat', c: '#ffd84d', t: 'BAT' }];
  const SLOT_X = [330, 480, 630];
  function buildLab() {
    const svg = $('update-svg');
    const defs = el('defs', {}, svg);
    const mk = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0 0 L10 5 L0 10 z', fill: '#8fa0b3' }, mk);
    // MAPPO
    el('text', { x: 20, y: 28, fill: '#b388ff', 'font-size': 15, 'font-weight': 700, 'letter-spacing': 2 }, svg).textContent = 'MAPPO · ALL AGENTS AT ONCE';
    el('rect', { x: 20, y: 70, width: 150, height: 76, rx: 8, fill: '#0d1829', stroke: '#b388ff', 'stroke-width': 1.5 }, svg);
    el('text', { x: 95, y: 100, 'text-anchor': 'middle', fill: '#e6edf3', 'font-size': 13 }, svg).textContent = 'shared batch';
    el('text', { x: 95, y: 120, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 11 }, svg).textContent = 'advantage Â from critic';
    LAB.mArrows = SLOT_X.map((x, i) => el('path', { d: 'M170 108 C 230 108, 250 ' + (60 + i * 48) + ', ' + (x - 34) + ' ' + (60 + i * 48), stroke: '#b388ff', 'stroke-width': 2, fill: 'none', 'marker-end': 'url(#arr)', opacity: 0.35 }, svg));
    LAB.mNodes = AG.map((a, i) => labNode(svg, SLOT_X[i], 60 + i * 48, a, 'Â'));
    el('text', { x: 20, y: 185, fill: '#8fa0b3', 'font-size': 12 }, svg).textContent = 'every actor maximises E[ min(r·Â, clip(r, 1−ε, 1+ε)·Â) ] with the SAME Â, unaware of the others\' changes';
    // HAPPO
    el('line', { x1: 20, y1: 205, x2: 740, y2: 205, stroke: '#1b2c44' }, svg);
    el('text', { x: 20, y: 236, fill: '#ffb547', 'font-size': 15, 'font-weight': 700, 'letter-spacing': 2 }, svg).textContent = 'HAPPO · ONE AFTER ANOTHER, RANDOM ORDER';
    LAB.order = el('text', { x: 740, y: 236, 'text-anchor': 'end', fill: '#e6edf3', 'font-size': 13, 'font-family': 'Consolas, monospace' }, svg);
    el('rect', { x: 20, y: 280, width: 150, height: 76, rx: 8, fill: '#0d1829', stroke: '#ffb547', 'stroke-width': 1.5 }, svg);
    el('text', { x: 95, y: 310, 'text-anchor': 'middle', fill: '#e6edf3', 'font-size': 13 }, svg).textContent = 'shared batch';
    el('text', { x: 95, y: 330, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 11 }, svg).textContent = 'M starts at 1';
    LAB.hArrows = [[170, SLOT_X[0] - 34], [SLOT_X[0] + 34, SLOT_X[1] - 34], [SLOT_X[1] + 34, SLOT_X[2] - 34]].map(([a, b]) =>
      el('path', { d: 'M' + a + ' 318 L' + b + ' 318', stroke: '#ffb547', 'stroke-width': 2, fill: 'none', 'marker-end': 'url(#arr)', opacity: 0.35 }, svg));
    LAB.mLabels = [[255], [405], [555]].map(([x]) => el('text', { x, y: 304, 'text-anchor': 'middle', fill: '#ffb547', 'font-size': 12, 'font-family': 'Consolas, monospace' }, svg));
    LAB.hNodes = AG.map((a, i) => labNode(svg, SLOT_X[i], 318, a, 'M·Â', true));
    el('text', { x: 20, y: 400, fill: '#8fa0b3', 'font-size': 12 }, svg).textContent = 'agent m maximises E[ min(r·M·Â, clip(r, 1−ε, 1+ε)·M·Â) ], then M ← M · r_m for the next agent';
    el('text', { x: 20, y: 418, fill: '#5d6f84', 'font-size': 11 }, svg).textContent = 'ratios r shown are random examples, generated for the animation';
    $('btn-iter').onclick = () => runIteration();
    $('btn-autoiter').onclick = () => { LAB.auto = !LAB.auto; $('btn-autoiter').classList.toggle('on', LAB.auto); if (LAB.auto) runIteration(); };
    ['r1', 'r2', 'eps', 'adv'].forEach(k => { $('s-' + k).oninput = renderMChain; });
    buildMChain();
  }
  function labNode(svg, x, y, a, sub, movable) {
    const g = el('g', {}, svg);
    if (movable) { g.style.transition = 'transform .6s ease'; }
    const glow = el('circle', { cx: 0, cy: 0, r: 34, fill: a.c, opacity: 0 }, g);
    el('circle', { cx: 0, cy: 0, r: 30, fill: '#08121f', stroke: a.c, 'stroke-width': 2.5 }, g);
    el('text', { x: 0, y: -2, 'text-anchor': 'middle', fill: a.c, 'font-size': 14, 'font-weight': 700 }, g).textContent = a.t;
    const r = el('text', { x: 0, y: 15, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 10, 'font-family': 'Consolas, monospace' }, g);
    r.textContent = sub;
    g.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
    return { g, glow, r, y };
  }
  function flashNode(n) { n.glow.style.transition = 'none'; n.glow.setAttribute('opacity', 0.45); requestAnimationFrame(() => { n.glow.style.transition = 'opacity 1.1s'; n.glow.setAttribute('opacity', 0); }); }
  function runIteration() {
    if (LAB.busy || app.view !== 'lab') return;
    LAB.busy = true;
    // MAPPO: all at once
    LAB.mArrows.forEach(a => { a.setAttribute('opacity', 1); setTimeout(() => a.setAttribute('opacity', 0.35), 900); });
    LAB.mNodes.forEach(flashNode);
    // HAPPO: random permutation, sequential
    const order = [0, 1, 2].sort(() => Math.random() - 0.5);
    LAB.order.textContent = 'order: ' + order.map(i => AG[i].t).join(' → ');
    order.forEach((ai, slot) => { const n = LAB.hNodes[ai]; n.g.setAttribute('transform', 'translate(' + SLOT_X[slot] + ' ' + n.y + ')'); });
    const ratios = order.map(() => 1 + (Math.random() - 0.5) * 0.36);
    let Mv = 1;
    LAB.mLabels.forEach(l => { l.textContent = ''; });
    LAB.hArrows.forEach(a => a.setAttribute('opacity', 0.35));
    order.forEach((ai, slot) => {
      setTimeout(() => {
        if (slot === 0) Mv = 1;
        LAB.hArrows[slot].setAttribute('opacity', 1);
        LAB.mLabels[slot].textContent = 'M=' + Mv.toFixed(2);
        const n = LAB.hNodes[ai];
        flashNode(n);
        n.r.textContent = 'r=' + ratios[slot].toFixed(2);
        Mv *= ratios[slot];
      }, 700 + slot * 900);
    });
    setTimeout(() => { LAB.busy = false; if (LAB.auto) setTimeout(runIteration, 1600); }, 700 + 3 * 900);
  }

  // ------------------------------------------------------------------ lab: M explorer
  const MC = {};
  function buildMChain() {
    const svg = $('mchain-svg');
    const rows = [{ y: 50, label: 'STOCK', c: '#ff6b6b' }, { y: 140, label: 'CLIPPED', c: '#ffb547' }];
    MC.rows = rows.map(r => {
      el('text', { x: 10, y: r.y + 5, fill: r.c, 'font-size': 12, 'font-weight': 700, 'letter-spacing': 1.5 }, svg).textContent = r.label;
      const boxes = [130, 300, 470].map((x, i) => {
        el('rect', { x: x - 55, y: r.y - 26, width: 110, height: 52, rx: 8, fill: '#0d1829', stroke: AG[i].c, 'stroke-width': 1.5 }, svg);
        el('text', { x, y: r.y - 8, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 10 }, svg).textContent = 'agent ' + (i + 1) + ' sees M =';
        return el('text', { x, y: r.y + 15, 'text-anchor': 'middle', fill: '#e6edf3', 'font-size': 17, 'font-family': 'Consolas, monospace' }, svg);
      });
      [215, 385].forEach((x, i) => el('text', { x, y: r.y - 32, 'text-anchor': 'middle', fill: '#8fa0b3', 'font-size': 11 }, svg).textContent = (r.label === 'STOCK' ? '× r' : 'clip(M·r') + (i ? '₂' : '₁') + (r.label === 'STOCK' ? '' : ')'));
      [[185, 245], [355, 415]].forEach(([a, b]) => el('path', { d: 'M' + a + ' ' + r.y + ' L' + b + ' ' + r.y, stroke: r.c, 'stroke-width': 2, fill: 'none', 'marker-end': 'url(#arr2)' }, svg));
      const eff = el('text', { x: 540, y: r.y + 5, fill: r.c, 'font-size': 12, 'font-family': 'Consolas, monospace' }, svg);
      return { boxes, eff };
    });
    const defs = el('defs', {}, svg);
    const mk = el('marker', { id: 'arr2', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    el('path', { d: 'M0 0 L10 5 L0 10 z', fill: '#8fa0b3' }, mk);
    // number line
    MC.x = v => 40 + (v - 0.25) / (3.5 - 0.25) * 560;
    MC.band = el('rect', { x: 0, y: 222, width: 0, height: 26, fill: '#ffb547', opacity: 0.18, rx: 3 }, svg);
    el('line', { x1: 40, y1: 235, x2: 600, y2: 235, stroke: '#5d6f84', 'stroke-width': 1.5 }, svg);
    [0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach(v => {
      el('line', { x1: MC.x(v), y1: 230, x2: MC.x(v), y2: 240, stroke: '#5d6f84' }, svg);
      el('text', { x: MC.x(v), y: 262, 'text-anchor': 'middle', fill: '#5d6f84', 'font-size': 11, 'font-family': 'Consolas, monospace' }, svg).textContent = v.toFixed(1);
    });
    el('text', { x: 40, y: 212, fill: '#8fa0b3', 'font-size': 11 }, svg).textContent = 'M handed to agent 3 · shaded = allowed band [1−ε, 1+ε]';
    MC.mStock = el('circle', { cx: 0, cy: 235, r: 7, fill: '#ff6b6b', stroke: '#04070d', 'stroke-width': 2 }, svg);
    MC.mOurs = el('circle', { cx: 0, cy: 235, r: 7, fill: '#ffb547', stroke: '#04070d', 'stroke-width': 2 }, svg);
    MC.verdict = el('text', { x: 40, y: 290, fill: '#e6edf3', 'font-size': 13 }, svg);
    renderMChain();
  }
  function renderMChain() {
    const r1 = +$('s-r1').value, r2 = +$('s-r2').value, eps = +$('s-eps').value, adv = +$('s-adv').value;
    $('o-r1').textContent = r1.toFixed(2); $('o-r2').textContent = r2.toFixed(2); $('o-eps').textContent = eps.toFixed(2); $('o-adv').textContent = signed(adv, 2);
    const cl = v => clamp(v, 1 - eps, 1 + eps);
    const stock = [1, r1, r1 * r2];
    const m2 = cl(r1), ours = [1, m2, cl(m2 * r2)];
    MC.rows[0].boxes.forEach((t, i) => { t.textContent = stock[i].toFixed(3); });
    MC.rows[1].boxes.forEach((t, i) => { t.textContent = ours[i].toFixed(3); });
    MC.rows[0].eff.textContent = 'M·Â = ' + signed(stock[2] * adv, 3);
    MC.rows[1].eff.textContent = 'M·Â = ' + signed(ours[2] * adv, 3);
    MC.band.setAttribute('x', MC.x(1 - eps)); MC.band.setAttribute('width', MC.x(1 + eps) - MC.x(1 - eps));
    MC.mStock.setAttribute('cx', MC.x(clamp(stock[2], 0.25, 3.5))); MC.mOurs.setAttribute('cx', MC.x(ours[2]));
    const ratio = stock[2] / ours[2];
    MC.verdict.textContent = Math.abs(ratio - 1) < 0.005 ? 'Inside the band: both versions give agent 3 the same weighting.'
      : 'Stock M is ' + ratio.toFixed(2) + '× the clipped value: agent 3\'s gradient would be scaled that much more.';
  }

  // ------------------------------------------------------------------ main loop
  function frame(t) {
    const dt = Math.min(0.25, (t - (app.last || t)) / 1000); app.last = t;
    if (app.playing) {
      app.acc += dt * app.speed;
      let k = 0;
      while (app.acc >= 1 && k < 8) { tick(); app.acc -= 1; k++; }
      if (k === 8) app.acc = 0;
    }
    if (app.view === 'live') renderKPIs();
    requestAnimationFrame(frame);
  }

  function init() {
    buildFacility();
    G = { pue: buildGauge($('g-pue'), 'PUE (facility / IT)'), ci: buildGauge($('g-ci'), 'GRID gCO₂/kWh') };
    registerChart('ch-power', drawPower); registerChart('ch-carbon', drawCarbon);
    registerChart('ch-reward', drawReward); registerChart('ch-backlog', drawBacklog); registerChart('ch-levers', drawLevers);
    buildLab();
    bindControls();
    setManual('sp', 18); setManual('ls', 1); setManual('bat', 2);
    reset(0);
    setCtrl('happo');
    const h = location.hash.slice(1);
    if (h === 'lab' || h === 'results') showView(h);
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // exposed for testing in the console
  window.DCApp = { app, tick, reset, jumpToHour, setCtrl, setEnv, setManual, PRESETS };
})();
