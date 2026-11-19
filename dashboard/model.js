/*
 * Simplified data-centre model for the demo dashboard.
 *
 * ILLUSTRATIVE: this is NOT SustainDC and does not run our trained networks.
 * It is a small analytic model calibrated so that, on average, it reproduces the
 * operating points we measured in SustainDC (California, July, 1 MW):
 *   standard operation (18 C, no shifting, battery idle): IT ~1,040 kW, cooling ~376 kW
 *   15 C setpoint: IT ~927 kW, cooling ~352 kW, water +~4.8 %
 * The input traces (grid carbon, weather, workload) are real data extracted from the
 * SustainDC data folder (see DATA below).
 */
(function () {
  'use strict';

  // ---- Real input data (extracted from SustainDC/sustaindc/data) -----------------
  const DATA = {
    // Mean July carbon intensity by local hour, California (EIA), gCO2/kWh
    ci: [295, 290, 284, 280, 279, 279, 281, 265, 220, 205, 197, 191, 192, 192, 194, 202, 211, 221, 234, 262, 296, 305, 302, 304],
    // Mean July solar share of generation by hour (same file)
    solar: [0, 0, 0, 0, 0, 0, 0, 0.08, 0.29, 0.4, 0.44, 0.46, 0.47, 0.46, 0.44, 0.41, 0.38, 0.34, 0.29, 0.18, 0.04, 0, 0, 0],
    // Mean July outdoor dry-bulb temperature by hour, San Jose EPW, deg C
    temp: [16.1, 15.7, 15.2, 14.9, 14.8, 15.2, 15.6, 17.9, 20.1, 22.2, 24.7, 25.8, 26.7, 26.9, 26.4, 25.8, 24.7, 23.3, 21.1, 19.2, 18.2, 17.5, 17.0, 16.7],
    // 96 consecutive hours of the Alibaba CPU trace starting in early July (fraction of capacity)
    load: [0.385, 0.447, 0.55, 0.532, 0.409, 0.406, 0.379, 0.336, 0.418, 0.51, 0.439, 0.434, 0.415, 0.37, 0.361, 0.421, 0.501, 0.458, 0.432, 0.416, 0.4, 0.373, 0.48, 0.488, 0.381, 0.434, 0.402, 0.485, 0.376, 0.389, 0.453, 0.376, 0.4, 0.353, 0.482, 0.365, 0.349, 0.415, 0.369, 0.379, 0.329, 0.497, 0.381, 0.395, 0.404, 0.567, 0.406, 0.365, 0.473, 0.45, 0.459, 0.42, 0.596, 0.431, 0.428, 0.407, 0.486, 0.519, 0.375, 0.485, 0.456, 0.432, 0.464, 0.472, 0.469, 0.438, 0.46, 0.404, 0.557, 0.568, 0.56, 0.545, 0.544, 0.451, 0.5, 0.488, 0.589, 0.516, 0.576, 0.557, 0.469, 0.535, 0.561, 0.688, 0.662, 0.7, 0.694, 0.385, 0.665, 0.687, 0.698, 0.687, 0.627, 0.655, 0.415, 0.632],
  };

  // ---- Measured experimental results (from our SustainDC runs) ---------------------
  const MEASURED = {
    steps: [102400, 204800, 307200, 409600, 512000, 614400, 716800, 819200, 921600, 1024000, 1126400, 1228800, 1331200, 1433600, 1536000, 1638400, 1740800, 1843200, 1945600],
    rewardMAPPO: [-784.4, -834.6, -261.0, 290.7, 114.9, 251.6, 168.3, 254.8, 267.3, 120.0, 243.5, 278.6, 234.8, 163.4, 167.9, 259.5, 24.7, 284.2, 39.2],
    rewardHAPPO: [-1011.3, -743.6, -258.6, 142.5, 221.7, 205.2, 238.5, 319.1, 60.6, 143.7, 186.7, 305.1, 202.6, 189.2, 282.4, 251.5, 67.1, 267.7, 81.3],
    backlogMAPPO: [13422582, 13535227, 6706370, 20588, 0, 0, 0, 0, 0, 0, 0, 4462, 57618, 270616, 314812, 473532, 595893, 395287, 669813],
    backlogHAPPO: [13450314, 13489481, 10130863, 16801, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 59394, 97530, 220106, 463088, 193603],
    power: { baseline: { it: 1040, cool: 376 }, mappo: { it: 927.3, cool: 353.5 }, happo: { it: 927.1, cool: 351.2 } },
    levers: [
      { name: 'Cooling only (15 °C)', energy: -9.0, carbon: -9.0 },
      { name: 'Battery only', energy: 0.0, carbon: -1.6 },
      { name: 'Job shifting only', energy: 0.0, carbon: -0.1 },
      { name: 'All three levers', energy: -9.0, carbon: -10.7 },
    ],
  };

  // ---- Model constants ---------------------------------------------------------------
  const C = {
    stepMin: 15,
    loadRef: 0.4712,        // mean of the trace slice: anchor for the calibration
    itRef: 1040,            // kW at 18 C and loadRef
    itIdleFrac: 0.42,       // share of IT power that does not scale with load
    fanSlope: 0.0362,       // IT power change per degree of setpoint (server fans)
    coolK18: 0.3615,        // cooling kW per IT kW at 18 C and mean outdoor temp
    coolSpSlope: 0.023,     // relative cooling change per degree colder setpoint
    coolToutSlope: 0.012,   // relative cooling change per degree outdoor temp
    toutRef: 20.4,
    flexible: 0.6,          // share of workload that may be deferred (SustainDC config)
    deadlineSteps: 12 * 4,  // a deferred job must run within 12 h
    batCap: 1000,           // kWh (max_bat_cap_Mw = 1.0)
    batRate: 250,           // kW
    spMin: 15, spMax: 21.6,
    capacity: 0.95,         // max utilisation
  };

  function hourOf(step) { return Math.floor((step * C.stepMin) / 60) % 24; }
  function interp(arr, step) {
    const h = (step * C.stepMin) / 60;
    const i = Math.floor(h) % arr.length, j = (i + 1) % arr.length, f = h - Math.floor(h);
    return arr[i] * (1 - f) + arr[j] * f;
  }
  function inputsAt(step, env) {
    const h = (step * C.stepMin) / 60;
    const loadIdx = Math.floor(h) % DATA.load.length;
    return {
      hour: hourOf(step),
      minute: (step * C.stepMin) % 60,
      day: Math.floor(h / 24) + 1,
      ci: interp(DATA.ci, step) * (env.ciScale || 1),
      ciForecast: [1, 2, 3, 4].map(k => interp(DATA.ci, step + k * 4) * (env.ciScale || 1)),
      ciMin12: Math.min.apply(null, Array.from({ length: 12 }, (_, k) => interp(DATA.ci, step + (k + 1) * 4))) * (env.ciScale || 1),
      solar: interp(DATA.solar, step),
      tout: interp(DATA.temp, step) + (env.toutOffset || 0),
      demand: Math.min(1.2, DATA.load[loadIdx] * (env.demand || 1)),
    };
  }

  function createState(name) {
    return {
      name, step: 0, sp: 18, soc: 0.5, queue: [], // queue items: {amt, age}
      lastAction: { ls: 'run normally', dc: 'hold', bat: 'idle' },
      cum: { energy: 0, carbon: 0, water: 0, it: 0, cool: 0, reward: 0, overdue: 0 },
      out: null,
    };
  }

  function queueTotal(q) { return q.reduce((s, x) => s + x.amt, 0); }

  // One 15-minute step. act = {ls: 0 defer | 1 normal | 2 run deferred, dc: -1|0|1, bat: 0 charge|1 discharge|2 idle}
  function step(s, act, env) {
    const inp = inputsAt(s.step, env);
    // ---- cooling agent: setpoint change
    s.sp = Math.max(C.spMin, Math.min(C.spMax, s.sp + act.dc));
    s.lastAction.dc = act.dc < 0 ? 'setpoint −1 °C' : act.dc > 0 ? 'setpoint +1 °C' : 'hold';
    // ---- load shifter: decide utilisation
    const incoming = inp.demand;
    const flex = incoming * C.flexible;
    let run = incoming;
    s.queue.forEach(x => { x.age += 1; });
    if (act.ls === 0) { run = incoming - flex; s.queue.push({ amt: flex, age: 0 }); s.lastAction.ls = 'defer flexible jobs'; }
    else if (act.ls === 2) { s.lastAction.ls = 'run deferred jobs'; }
    else { s.lastAction.ls = 'run normally'; }
    // jobs at their deadline must run; deferred jobs drain if asked (or if there is spare room)
    let overdue = 0;
    // jobs past their deadline are forced to run first, as far as capacity allows;
    // whatever does not fit stays in the queue as overdue (unfinished) work
    for (const x of s.queue) {
      if (x.age >= C.deadlineSteps && x.amt > 0) {
        const take = Math.min(Math.max(0, C.capacity - run), x.amt);
        run += take; x.amt -= take;
        if (x.amt > 0) overdue += x.amt;
      }
    }
    if (act.ls === 2) {
      for (const x of s.queue) {
        const room = C.capacity - run; if (room <= 0) break;
        const take = Math.min(room, x.amt); run += take; x.amt -= take;
      }
    }
    s.queue = s.queue.filter(x => x.amt > 1e-6);
    const util = Math.min(1, run);
    // ---- physics (illustrative, calibrated)
    const loadFactor = C.itIdleFrac + (1 - C.itIdleFrac) * (util / C.loadRef);
    const fan = 1 + C.fanSlope * (s.sp - 18);
    const it = C.itRef * loadFactor * fan;
    const k = C.coolK18 * (1 + C.coolSpSlope * (18 - s.sp)) * (1 + C.coolToutSlope * (inp.tout - C.toutRef));
    const cool = it * k;
    const facility = it + cool;
    // ---- battery agent
    let batKw = 0;
    if (act.bat === 0 && s.soc < 0.98) { batKw = Math.min(C.batRate, (0.98 - s.soc) * C.batCap * 4); s.lastAction.bat = 'charge'; }
    else if (act.bat === 1 && s.soc > 0.1) { batKw = -Math.min(C.batRate, (s.soc - 0.1) * C.batCap * 4); s.lastAction.bat = 'discharge'; }
    else { s.lastAction.bat = 'idle'; }
    s.soc += (batKw / 4) / C.batCap;
    const grid = facility + batKw;
    // ---- outcomes
    const carbonRate = grid * inp.ci / 1000;           // kg CO2 per hour
    const water = cool * 1.8 * (1 + 0.031 * (18 - s.sp)); // litres per hour (illustrative)
    const inlet = s.sp + 2 + 4 * util;
    const hotAisle = inlet + 9 + 6 * util;
    const reward = -(inp.ci * grid / 4) / 1e5 - overdue * 0.5;
    s.cum.energy += grid / 4; s.cum.it += it / 4; s.cum.cool += cool / 4;
    s.cum.carbon += carbonRate / 4; s.cum.water += water / 4; s.cum.reward += reward; s.cum.overdue += overdue;
    s.out = { inp, util, it, cool, facility, grid, batKw, pue: facility / it, carbonRate, water, inlet, hotAisle, queue: queueTotal(s.queue), overdue, reward };
    s.step += 1;
    return s.out;
  }

  // ---- Controllers ---------------------------------------------------------------------
  // Baseline: standard operation used as the reference in our study.
  function baseline() { return { ls: 1, dc: 0, bat: 2 }; }

  // Emulated MAPPO behaviour (illustrative): finds the 15 C optimum; timing is coarser and
  // tends to over-defer, so jobs hit their deadline more often.
  function mappo(s, inp) {
    const dc = s.sp > 15 ? -1 : 0;
    let ls = 1;
    if (inp.ci > 285) ls = 0;
    else if (inp.ci < 212) ls = 2;
    let bat = 2;
    if (inp.ci < 215 && s.soc < 0.95) bat = 0; else if (inp.ci > 290 && s.soc > 0.15) bat = 1;
    return { ls, dc, bat };
  }

  // Emulated HAPPO (ours) behaviour (illustrative): same 15 C optimum, but uses the carbon
  // forecast, defers only when a cleaner hour is coming and clears its queue before deadlines.
  function happo(s, inp) {
    const dc = s.sp > 15 ? -1 : 0;
    const oldest = s.queue.length ? Math.max.apply(null, s.queue.map(x => x.age)) : 0;
    let ls = 1;
    if (s.queue.length && (oldest >= 10 * 4 || inp.ci < 215)) ls = 2;
    else if (inp.ci > 255 && inp.ciMin12 < 215) ls = 0;
    let bat = 2;
    if (inp.ci < 205 && s.soc < 0.95) bat = 0;
    else if (inp.ci > 285 && s.soc > 0.15) bat = 1;
    return { ls, dc, bat };
  }

  window.DCModel = { DATA, MEASURED, C, inputsAt, createState, step, controllers: { baseline, mappo, happo }, hourOf };
})();
