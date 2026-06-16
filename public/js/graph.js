/* ═══ Orbit — Graph (Obsidian-style SVG) ═══ */
let gTx = { x: 0, y: 0, s: 1 };
let gPan = false, gPanStart = null;
let gDrag = null, gDragOff = null;
let gHover = null;
let gNodes = [], gEdges = [];
let gNodeMap = {};
let gForceSimRunning = false;
let _graphSidePanel = null;
let gLocalNode = null;
let gStraightEdges = false;
let gLerpProgress = 0;

// Smooth zoom animation
let gZoomAnim = null;

// Camera history
let gCameraHistory = [];
let gCameraHistoryIdx = -1;

// Pinned nodes
let gPinned = {};

// History playback
let gHistoryPlay = null;

// Status filters
let gFilterStatus = { backlog: true, todo: true, review: true, done: true };

// Minimap
let _minimapCtx = null;
let _minimapCanvas = null;

let _graphRenderRaf = null;

function renderGraph() {
  stopGraphIdleAnim();
  if (_graphRenderRaf) { cancelAnimationFrame(_graphRenderRaf); _graphRenderRaf = null; }
  initGraphUI();
  buildGraphData();
  forceLayout(() => { renderGraphSvg(); setupGraphInteractions(); startGraphIdleAnim(); startGraphRenderLoop(); });
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function saveCameraState() {
  if (gCameraHistoryIdx < gCameraHistory.length - 1)
    gCameraHistory = gCameraHistory.slice(0, gCameraHistoryIdx + 1);
  gCameraHistory.push({ x: gTx.x, y: gTx.y, s: gTx.s });
  if (gCameraHistory.length > 10) gCameraHistory.shift();
  gCameraHistoryIdx = gCameraHistory.length - 1;
}

function cameraBack() {
  if (gCameraHistoryIdx <= 0) return;
  gCameraHistoryIdx--;
  const h = gCameraHistory[gCameraHistoryIdx];
  gZoomAnim = { tx: h.x, ty: h.y, ts: h.s, start: performance.now(), fromX: gTx.x, fromY: gTx.y, fromS: gTx.s };
}

function cameraForward() {
  if (gCameraHistoryIdx >= gCameraHistory.length - 1) return;
  gCameraHistoryIdx++;
  const h = gCameraHistory[gCameraHistoryIdx];
  gZoomAnim = { tx: h.x, ty: h.y, ts: h.s, start: performance.now(), fromX: gTx.x, fromY: gTx.y, fromS: gTx.s };
}

function zoomToNode(nodeId) {
  const n = gNodes.find(x => x.id === nodeId);
  if (!n) return;
  const container = $('graph-container');
  const W = container.clientWidth, H = container.clientHeight;
  const targetScale = 1.8;
  gZoomAnim = {
    tx: W / 2 - n.x * targetScale, ty: H / 2 - n.y * targetScale,
    ts: targetScale, start: performance.now(),
    fromX: gTx.x, fromY: gTx.y, fromS: gTx.s
  };
  saveCameraState();
}

function focusGraphTask(taskId) {
  switchView('graph');
  // After graph renders, set local mode to show only this task + connections
  setTimeout(() => {
    const node = gNodes.find(n => n.id === taskId);
    if (!node) return;
    gLocalNode = taskId;
    renderGraph();
    const localBtn = $('btn-graph-local');
    if (localBtn) localBtn.style.display = 'inline-flex';
  }, 50);
}

function spreadGraph() {
  stopGraphIdleAnim();
  const container = $('graph-container');
  const W = container?.clientWidth || 800;
  const H = container?.clientHeight || 600;
  gNodes.forEach(n => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 10;
    n._vx = Math.cos(angle) * speed;
    n._vy = Math.sin(angle) * speed;
  });
  startGraphIdleAnim();
}

/* ── Continuous render loop (zoom anim + minimap update) ── */
function startGraphRenderLoop() {
  if (_graphRenderRaf) { cancelAnimationFrame(_graphRenderRaf); _graphRenderRaf = null; }
  function tick(time) {
    // Smooth zoom animation
    if (gZoomAnim) {
      const { tx, ty, ts, start, fromX, fromY, fromS } = gZoomAnim;
      const elapsed = (time - start) / 400;
      if (elapsed >= 1) {
        gTx.x = tx; gTx.y = ty; gTx.s = ts;
        gZoomAnim = null;
      } else {
        const t = easeInOutCubic(elapsed);
        gTx.x = fromX + (tx - fromX) * t;
        gTx.y = fromY + (ty - fromY) * t;
        gTx.s = fromS + (ts - fromS) * t;
      }
      const gRoot = document.querySelector('#graph-root');
      if (gRoot) gRoot.setAttribute('transform', `translate(${gTx.x},${gTx.y}) scale(${gTx.s})`);
    }
    updateMiniMap();
    if (gZoomAnim) {
      _graphRenderRaf = requestAnimationFrame(tick);
    } else {
      _graphRenderRaf = null;
    }
  }
  _graphRenderRaf = requestAnimationFrame(tick);
}

/* ── Minimap ── */
function initMiniMap() {
  _minimapCanvas = document.getElementById('graph-minimap');
  if (_minimapCanvas) _minimapCtx = _minimapCanvas.getContext('2d');
}

function updateMiniMap() {
  if (!_minimapCtx || !_minimapCanvas) return;
  const mc = _minimapCanvas, mctx = _minimapCtx;
  const mw = 160, mh = 100, pad = 6;
  mc.width = mw; mc.height = mh;

  mctx.fillStyle = 'rgba(0,0,0,0.5)';
  mctx.fillRect(0, 0, mw, mh);
  mctx.strokeStyle = 'rgba(128,128,128,0.3)';
  mctx.lineWidth = 1;
  mctx.strokeRect(0, 0, mw, mh);

  if (!gNodes.length) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of gNodes) {
    if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
  }
  const bw = maxX - minX || 1, bh = maxY - minY || 1;
  const scale = Math.min((mw - pad * 2) / bw, (mh - pad * 2) / bh);
  const ox = pad - minX * scale, oy = pad - minY * scale;

  for (const n of gNodes) {
    mctx.fillStyle = ({ backlog: '#94a3b8', todo: '#f59e0b', review: '#8b5cf6', done: '#10b981' })[n.status] || '#94a3b8';
    mctx.beginPath();
    mctx.arc(n.x * scale + ox, n.y * scale + oy, 2, 0, Math.PI * 2);
    mctx.fill();
  }

  const container = $('graph-container');
  if (container) {
    const cw = container.clientWidth, ch = container.clientHeight;
    const vx = (-gTx.x / gTx.s) * scale + ox;
    const vy = (-gTx.y / gTx.s) * scale + oy;
    const vw = (cw / gTx.s) * scale;
    const vh = (ch / gTx.s) * scale;
    mctx.strokeStyle = 'rgba(99,102,241,0.7)';
    mctx.lineWidth = 1.5;
    mctx.strokeRect(Math.max(0, vx), Math.max(0, vy), Math.min(mw - vx, vw), Math.min(mh - vy, vh));
  }
}

/* ── Idle physics animation (free-drifting, no spring anchor) ── */
let _graphIdleRaf = null;
function startGraphIdleAnim() {
  stopGraphIdleAnim();
  if (gNodes.length === 0) return;

  gNodes.forEach(n => {
    n._vx = (Math.random() - 0.5) * 2;
    n._vy = (Math.random() - 0.5) * 2;
    n._mass = (n.size || 7) * 0.12;
    n._phase = Math.random() * Math.PI * 2;
  });

  const damping = 0.998;
  const repulseRadius = 80;
  const repulseForce = 0.04;
  const wanderForce = 0.005;
  const maxV = 0.06;
  const wallBounce = 0.05;
  const driftForce = 0.001;

  const container = $('graph-container');
  const W = container?.clientWidth || 800;
  const H = container?.clientHeight || 600;
  const margin = 30;
  let lastTime = performance.now();

  function tick() {
    if (currentView !== 'graph') { _graphIdleRaf = null; return; }
    if (gDrag || gPan) { lastTime = performance.now(); _graphIdleRaf = requestAnimationFrame(tick); return; }

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 16.67, 3);
    lastTime = now;
    const t = now / 1000;

    // Soft spring toward resting positions (keeps nodes near layout)
    gNodes.forEach(n => {
      if (gPinned[n.id]) return;
      n.x += (n._targetX - n.x) * 0.002;
      n.y += (n._targetY - n.y) * 0.002;
    });

    gNodes.forEach((n, i) => {
      if (gPinned[n.id]) return;
      let fx = 0, fy = 0;
      const rPhase = n._phase + t * 0.4;
      fx += (Math.sin(rPhase * 1.1 + i * 0.7) * 0.6 + (Math.random() - 0.5) * 0.4) * wanderForce;
      fy += (Math.cos(rPhase * 0.8 + i * 1.1) * 0.6 + (Math.random() - 0.5) * 0.4) * wanderForce;
      fx += Math.sin(t * 0.12 + n._phase * 0.5) * driftForce;
      fy += Math.cos(t * 0.09 + n._phase * 0.3) * driftForce;

      for (let j = 0; j < gNodes.length; j++) {
        if (j === i) continue;
        const other = gNodes[j];
        const dx = n.x - other.x;
        const dy = n.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < repulseRadius) {
          const strength = repulseForce * (1 - dist / repulseRadius) * (1 - dist / repulseRadius);
          fx += (dx / dist) * strength;
          fy += (dy / dist) * strength;
        }
      }

      n._vx += (fx / n._mass) * dt;
      n._vy += (fy / n._mass) * dt;
      n._vx *= Math.pow(damping, dt);
      n._vy *= Math.pow(damping, dt);
      const speed = Math.sqrt(n._vx * n._vx + n._vy * n._vy);
      if (speed > maxV) { n._vx = (n._vx / speed) * maxV; n._vy = (n._vy / speed) * maxV; }
      n.x += n._vx * dt;
      n.y += n._vy * dt;

      if (n.x < margin) n._vx += wallBounce * dt;
      if (n.x > W - margin) n._vx -= wallBounce * dt;
      if (n.y < margin) n._vy += wallBounce * dt;
      if (n.y > H - margin) n._vy -= wallBounce * dt;
    });

    const svg = document.querySelector('#graph-svg');
    const edgesGroup = svg?.querySelector('#graph-edges');
    const edgePaths = edgesGroup?.querySelectorAll('.graph-edge');
    const particlesGroup = svg?.querySelector('#graph-particles');
    const particles = particlesGroup?.querySelectorAll('.graph-particle');

    gNodes.forEach(n => {
      const nodeG = svg?.querySelector(`.graph-node[data-id="${n.id}"]`);
      if (nodeG) nodeG.setAttribute('transform', `translate(${n.x},${n.y})`);
    });

    if (edgePaths) {
      gEdges.forEach((edge, i) => {
        if (i >= edgePaths.length) return;
        edgePaths[i].setAttribute('d', edgeCurve(edge, i).d);
      });
    }

    if (particles) {
      particles.forEach(p => {
        const ei = parseInt(p.dataset.edgeIdx);
        const pi = parseInt(p.dataset.pIdx);
        const edge = gEdges[ei];
        if (!edge) return;
        const progress = ((t * (0.15 + ei * 0.02 + pi * 0.1)) % 1);
        const curve = edgeCurve(edge, ei);
        const s = edge.source, tgt = edge.target;
        const u = 1 - progress;
        const bx = u * u * s.x + 2 * u * progress * curve.cx + progress * progress * tgt.x;
        const by = u * u * s.y + 2 * u * progress * curve.cy + progress * progress * tgt.y;
        p.setAttribute('cx', bx);
        p.setAttribute('cy', by);
        p.setAttribute('opacity', '0.7');
      });
    }

    updateMiniMap();
    _graphIdleRaf = requestAnimationFrame(tick);
  }
  _graphIdleRaf = requestAnimationFrame(tick);
}

function stopGraphIdleAnim() {
  if (_graphIdleRaf) { cancelAnimationFrame(_graphIdleRaf); _graphIdleRaf = null; }
}

function buildGraphData() {
  gNodes = [];
  gEdges = [];
  gNodeMap = {};
  const container = $('graph-container');
  const w = container?.clientWidth || 800;
  const h = container?.clientHeight || 600;

  const statusCounts = {};
  ['backlog','todo','review','done'].forEach(s => statusCounts[s] = 0);

  tasks.forEach((t, i) => {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    const node = {
      id: t.id, label: t.title, type: 'task', status: t.status, priority: t.priority,
      tags: t.tags || [],
      x: 0, y: 0,
      size: t.status === 'done' ? 5 : t.priority === 'high' ? 10 : 7,
      vx: 0, vy: 0
    };
    gNodes.push(node);
    gNodeMap[t.id] = node;
  });

  links.forEach(l => {
    const s = gNodeMap[l.sourceId], t = gNodeMap[l.targetId];
    if (s && t && !gEdges.some(e => (e.source === s && e.target === t) || (e.source === t && e.target === s))) {
      gEdges.push({ source: s, target: t, type: l.type || 'related' });
    }
  });

  for (const t of tasks) {
    if (t.parentId && gNodeMap[t.parentId] && gNodeMap[t.id]) {
      const s = gNodeMap[t.id], tgt = gNodeMap[t.parentId];
      if (!gEdges.some(e => (e.source === s && e.target === tgt) || (e.source === tgt && e.target === s))) {
        gEdges.push({ source: s, target: tgt, type: 'parent' });
      }
    }
  }
}

/* ── Force-directed layout (link-based only, no status clusters) ── */
function forceLayout(onDone) {
  const n = gNodes.length;
  if (n === 0) { if (onDone) onDone(); return; }

  const container = $('graph-container');
  const W = container?.clientWidth || 800;
  const H = container?.clientHeight || 600;

  // Random placement (no status-based clustering)
  gNodes.forEach((nd) => {
    nd.x = 100 + Math.random() * (W - 200);
    nd.y = 100 + Math.random() * (H - 200);
    nd._vx = 0; nd._vy = 0;
  });

  // Force-directed physics (edges only, no cluster centering)
  const targetLen = 140;
  const repulsionStrength = 8000;
  const attractionStrength = 0.06;
  const dampingBase = 0.9;
  const maxV = 10;
  const iterations = 180;

  for (let iter = 0; iter < iterations; iter++) {
    const cool = Math.max(0.1, 1 - iter / 180);

    // Repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = gNodes[i], b = gNodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distSq = Math.max(dx * dx + dy * dy, 1);
        const dist = Math.sqrt(distSq);
        const f = (repulsionStrength * cool) / distSq;
        const fx = (dx / dist) * f, fy = (dy / dist) * f;
        a._vx -= fx; a._vy -= fy;
        b._vx += fx; b._vy += fy;
      }
    }

    // Edge attraction (spring to targetLen)
    for (const e of gEdges) {
      const a = e.source, b = e.target;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const strength = e.type === 'parent' ? 1.3 : 0.8;
      const f = (dist - targetLen) * attractionStrength * cool * strength;
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      a._vx += fx; a._vy += fy;
      b._vx -= fx; b._vy -= fy;
    }

    // Apply velocity with damping & cooling
    for (const n of gNodes) {
      n._vx *= Math.pow(dampingBase, 1) * cool;
      n._vy *= Math.pow(dampingBase, 1) * cool;
      const spd = Math.sqrt(n._vx * n._vx + n._vy * n._vy);
      if (spd > maxV) { n._vx = (n._vx / spd) * maxV; n._vy = (n._vy / spd) * maxV; }
      n.x += n._vx;
      n.y += n._vy;
      n.x = Math.max(30, Math.min(W - 30, n.x));
      n.y = Math.max(30, Math.min(H - 30, n.y));
    }
  }

  gNodes.forEach(nd => {
    nd._targetX = nd.x;
    nd._targetY = nd.y;
    nd._vx = 0; nd._vy = 0;
  });
  if (onDone) onDone();
}

/* ── Helper: compute quadratic bezier curve for an edge ── */
function edgeCurve(edge, edgeIdx) {
  const s = edge.source, t = edge.target;
  if (gStraightEdges) {
    return { d: `M${s.x},${s.y} L${t.x},${t.y}`, cx: (s.x+t.x)/2, cy: (s.y+t.y)/2 };
  }
  const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
  const dx = t.x - s.x, dy = t.y - s.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const curv = Math.min(30, len * 0.12) * (edgeIdx % 2 === 0 ? 1 : -1);
  const cx = mx + nx * curv, cy = my + ny * curv;
  return { d: `M${s.x},${s.y} Q${cx},${cy} ${t.x},${t.y}`, cx, cy };
}

function updateEdgesForNode(node) {
  const svg = document.querySelector('#graph-svg');
  if (!svg) return;
  const edgesGroup = svg.querySelector('#graph-edges');
  if (!edgesGroup) return;
  const paths = edgesGroup.querySelectorAll('.graph-edge');
  gEdges.forEach((edge, i) => {
    if (i >= paths.length) return;
    if (edge.source === node || edge.target === node) {
      paths[i].setAttribute('d', edgeCurve(edge, i).d);
    }
  });
}

/* ── SVG Rendering (Obsidian-style) ── */
function renderGraphSvg() {
  const container = $('graph-container');
  if (!container) return;

  const oldSvg = container.querySelector('#graph-svg');
  if (oldSvg) oldSvg.remove();

  const W = container.clientWidth;
  const H = container.clientHeight;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.id = 'graph-svg';
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const defs = document.createElementNS(ns, 'defs');

  const glowSoft = document.createElementNS(ns, 'filter');
  glowSoft.id = 'glow-soft';
  glowSoft.setAttribute('x', '-50%'); glowSoft.setAttribute('y', '-50%');
  glowSoft.setAttribute('width', '200%'); glowSoft.setAttribute('height', '200%');
  glowSoft.innerHTML = '<feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>';
  defs.appendChild(glowSoft);

  const glowStrong = document.createElementNS(ns, 'filter');
  glowStrong.id = 'glow-strong';
  glowStrong.setAttribute('x', '-80%'); glowStrong.setAttribute('y', '-80%');
  glowStrong.setAttribute('width', '260%'); glowStrong.setAttribute('height', '260%');
  glowStrong.innerHTML = '<feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>';
  defs.appendChild(glowStrong);

  const edgeGlow = document.createElementNS(ns, 'filter');
  edgeGlow.id = 'glow-edge';
  edgeGlow.setAttribute('x', '-20%'); edgeGlow.setAttribute('y', '-20%');
  edgeGlow.setAttribute('width', '140%'); edgeGlow.setAttribute('height', '140%');
  edgeGlow.innerHTML = '<feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>';
  defs.appendChild(edgeGlow);

  svg.appendChild(defs);

  const gRoot = document.createElementNS(ns, 'g');
  gRoot.id = 'graph-root';

  // Local graph filter: only show edges connected to target
  const localTarget = gLocalNode;
  const localNodeSet = new Set();
  if (localTarget) {
    localNodeSet.add(localTarget);
    gEdges.forEach(e => {
      if (e.source.id === localTarget) localNodeSet.add(e.target.id);
      if (e.target.id === localTarget) localNodeSet.add(e.source.id);
    });
  }

  // Edges (curved paths)
  const gEdgesGroup = document.createElementNS(ns, 'g');
  gEdgesGroup.id = 'graph-edges';
  gEdges.forEach((e, idx) => {
    const inLocal = !localTarget || (localNodeSet.has(e.source.id) && localNodeSet.has(e.target.id));
    if (localTarget && !inLocal) return;
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', edgeCurve(e, idx).d);
    const isParent = e.type === 'parent';
    const isWiki = e.type === 'wikilink';
    const color = isParent ? 'rgba(224,176,92,0.35)' : isWiki ? 'rgba(156,163,175,0.25)' : 'rgba(133,173,114,0.2)';
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', isParent ? '2' : '1');
    path.setAttribute('fill', 'none');
    if (isParent) path.setAttribute('stroke-dasharray', '5,4');
    path.setAttribute('filter', 'url(#glow-edge)');
    path.style.opacity = '0.6';
    path.classList.add('graph-edge');
    path.dataset.edgeIdx = idx;
    gEdgesGroup.appendChild(path);
  });
  gRoot.appendChild(gEdgesGroup);

  // Particles
  const gParticlesGroup = document.createElementNS(ns, 'g');
  gParticlesGroup.id = 'graph-particles';
  gEdges.forEach((e, idx) => {
    const numP = e.type === 'parent' ? 2 : 1;
    for (let pi = 0; pi < numP; pi++) {
      const particle = document.createElementNS(ns, 'circle');
      particle.setAttribute('r', e.type === 'parent' ? '2.5' : '1.8');
      const pColor = e.type === 'parent' ? '#e0b05c' : '#85ad72';
      particle.setAttribute('fill', pColor);
      particle.setAttribute('opacity', '0');
      particle.setAttribute('filter', 'url(#glow-edge)');
      particle.classList.add('graph-particle');
      particle.dataset.edgeIdx = idx;
      particle.dataset.pIdx = pi;
      gParticlesGroup.appendChild(particle);
    }
  });
  gRoot.appendChild(gParticlesGroup);

  // Nodes
  const gNodesGroup = document.createElementNS(ns, 'g');
  gNodesGroup.id = 'graph-nodes';

  // Filter visible by status
  const visibleStatuses = new Set(Object.entries(gFilterStatus).filter(([k, v]) => v).map(([k]) => k));

  gNodes.forEach(n => {
    const inLocal = !localTarget || localNodeSet.has(n.id);
    if (localTarget && !inLocal) return;
    if (!visibleStatuses.has(n.status)) return;
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('data-id', n.id);
    g.classList.add('graph-node');
    g.style.cursor = 'pointer';
    g.setAttribute('transform', `translate(${n.x},${n.y})`);

    const r = n.size || 7;
    let fillColor;
    if (n.status === 'done') fillColor = '#6f9c5e';
    else if (n.priority === 'high') fillColor = '#d47a5a';
    else if (n.priority === 'medium') fillColor = '#d49a3a';
    else if (n.priority === 'low') fillColor = '#85ad72';
    else fillColor = '#a8a094';

    const halo = document.createElementNS(ns, 'circle');
    halo.setAttribute('r', r + 6);
    halo.setAttribute('fill', fillColor);
    halo.setAttribute('opacity', '0');
    halo.classList.add('graph-node-halo');
    g.appendChild(halo);

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('r', r);
    circle.setAttribute('fill', fillColor);
    circle.setAttribute('stroke', 'rgba(255,255,255,0.12)');
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('filter', 'url(#glow-soft)');
    circle.style.opacity = '0.85';
    circle.style.transition = 'opacity 0.25s ease, r 0.25s ease';
    circle.classList.add('graph-node-circle');
    g.appendChild(circle);

    if (n.status === 'done') {
      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('r', r + 2);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#6f9c5e');
      ring.setAttribute('stroke-width', '1');
      ring.setAttribute('opacity', '0.4');
      g.appendChild(ring);
    }

    const label = n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label;
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('y', -r - 8);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#c8c0b4');
    text.setAttribute('font-size', n.type === 'task' ? '10' : '11');
    text.setAttribute('font-family', 'Inter, sans-serif');
    text.setAttribute('font-weight', n.priority === 'high' ? '600' : '400');
    text.textContent = label;
    text.style.opacity = '0.8';
    text.style.transition = 'opacity 0.2s ease';
    text.classList.add('graph-node-label');
    g.appendChild(text);

    // Tag badges on node
    const tags = n.tags || [];
    tags.slice(0, 3).forEach((tg, ti) => {
      const badge = document.createElementNS(ns, 'rect');
      const bw = Math.min(tg.length * 5 + 4, 40);
      const by = r + 10 + ti * 11;
      badge.setAttribute('x', -bw / 2);
      badge.setAttribute('y', by);
      badge.setAttribute('width', bw);
      badge.setAttribute('height', 9);
      badge.setAttribute('rx', 3);
      badge.setAttribute('fill', '#e0b05c');
      badge.setAttribute('opacity', '0.45');
      badge.classList.add('graph-tag-badge');
      g.appendChild(badge);
      const btxt = document.createElementNS(ns, 'text');
      btxt.setAttribute('x', 0);
      btxt.setAttribute('y', by + 7);
      btxt.setAttribute('text-anchor', 'middle');
      btxt.setAttribute('fill', '#fff');
      btxt.setAttribute('font-size', '6');
      btxt.setAttribute('font-family', 'Inter, sans-serif');
      btxt.textContent = tg.length > 6 ? tg.slice(0, 6) + '..' : tg;
      btxt.classList.add('graph-tag-text');
      g.appendChild(btxt);
    });

    // Hover
    g.addEventListener('mouseenter', () => {
      circle.style.opacity = '1';
      circle.setAttribute('filter', 'url(#glow-strong)');
      halo.setAttribute('opacity', '0.15');
      text.style.opacity = '1';
      gHover = n.id;
      // Dim non-neighbor nodes
      const connNodes = new Set([n.id]);
      gEdges.forEach(e => {
        if (e.source.id === n.id) connNodes.add(e.target.id);
        if (e.target.id === n.id) connNodes.add(e.source.id);
      });
      gNodesGroup.querySelectorAll('.graph-node').forEach(gn => {
        const gid = gn.dataset.id;
        const isConn = connNodes.has(gid);
        gn.style.opacity = isConn ? '1' : '0.2';
        gn.style.transition = 'opacity 0.3s ease';
      });
      gEdgesGroup.querySelectorAll('.graph-edge').forEach(el => {
        const ei = parseInt(el.dataset.edgeIdx);
        const edge = gEdges[ei];
        if (!edge) return;
        if (edge.source.id === n.id || edge.target.id === n.id) {
          el.style.opacity = '1';
          el.setAttribute('stroke-width', '2.5');
        } else {
          el.style.opacity = '0.08';
        }
      });
    });
    g.addEventListener('mouseleave', () => {
      circle.style.opacity = '0.85';
      circle.setAttribute('filter', 'url(#glow-soft)');
      halo.setAttribute('opacity', '0');
      text.style.opacity = '0.8';
      gHover = null;
      gNodesGroup.querySelectorAll('.graph-node').forEach(gn => {
        gn.style.opacity = '1';
      });
      gEdgesGroup.querySelectorAll('.graph-edge').forEach(el => {
        el.style.opacity = '0.6';
        const isParent = el.getAttribute('stroke-dasharray');
        el.setAttribute('stroke-width', isParent ? '2' : '1');
      });
    });

    // Click: show side panel with task info (local graph)
    g.addEventListener('click', (ev) => {
      ev.stopPropagation();
      showGraphSidePanel(n.id);
    });

    // Double-click: open task modal
    g.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      const task = tasks.find(t => t.id === n.id);
      if (task) openTaskModal(task);
    });

    gNodesGroup.appendChild(g);
  });
  gRoot.appendChild(gNodesGroup);
  svg.appendChild(gRoot);

  const infoPanel = document.createElement('div');
  infoPanel.id = 'graph-info-bar';
  const localInfo = localTarget ? ` · Локальный граф: ${localNodeSet.size} узлов` : '';
  infoPanel.innerHTML = `<span id="graph-info" style="font-size:12px;color:var(--text-secondary)">Узлов: ${gNodes.length} · Связей: ${gEdges.length} · Клик — детали · Двойной клик — открыть${localInfo}</span>`;

  const oldBar = container.querySelector('#graph-info-bar');
  if (oldBar) oldBar.remove();

  container.appendChild(svg);
  container.appendChild(infoPanel);

  // Close side panel on empty SVG click
  if (!svg._sidePanelClose) {
    svg._sidePanelClose = true;
    svg.addEventListener('mousedown', function(e) {
      if (!e.target.closest('.graph-node')) closeGraphSidePanel();
    });
  }
}

/* ── Graph interactions (pan, zoom, drag) ── */
function setupGraphInteractions() {
  const svg = document.querySelector('#graph-svg');
  if (!svg || svg._setup) return;
  svg._setup = true;

  const gRoot = svg.querySelector('#graph-root');

  function applyTransform() {
    gRoot.setAttribute('transform', `translate(${gTx.x},${gTx.y}) scale(${gTx.s})`);
  }

  function svgPoint(e) {
    const rect = svg.getBoundingClientRect();
    return { x: (e.clientX - rect.left - gTx.x) / gTx.s, y: (e.clientY - rect.top - gTx.y) / gTx.s };
  }

  if (!window._graphExplored) {
    window._graphExplored = true;
    api('POST', '/api/activity/trigger', { trigger: 'graph_pan' }).catch(() => {});
  }

  svg.addEventListener('mousedown', e => {
    if (e.button === 2) return;
    const nodeG = e.target.closest('.graph-node');
    if (nodeG) {
      const id = nodeG.dataset.id;
      const node = gNodeMap[id];
      if (node) {
        gDrag = node;
        const pt = svgPoint(e);
        gDragOff = { x: pt.x - node.x, y: pt.y - node.y };
        saveCameraState();
      }
    } else {
      gPan = true;
      gPanStart = { x: e.clientX - gTx.x, y: e.clientY - gTx.y };
      svg.style.cursor = 'grabbing';
      saveCameraState();
    }
  });

  svg.addEventListener('mousemove', e => {
    if (gDrag) {
      if (gPinned[gDrag.id]) return;
      const pt = svgPoint(e);
      gDrag.x = pt.x - gDragOff.x;
      gDrag.y = pt.y - gDragOff.y;
      gDrag._baseX = gDrag.x; gDrag._baseY = gDrag.y;
      const nodeG = svg.querySelector(`.graph-node[data-id="${gDrag.id}"]`);
      if (nodeG) nodeG.setAttribute('transform', `translate(${gDrag.x},${gDrag.y})`);
      updateEdgesForNode(gDrag);
    } else if (gPan) {
      gTx.x = e.clientX - gPanStart.x;
      gTx.y = e.clientY - gPanStart.y;
      applyTransform();
    }
  });

  svg.addEventListener('mouseup', () => { if (gDrag) { gDrag._baseX = gDrag.x; gDrag._baseY = gDrag.y; } gDrag = null; gPan = false; svg.style.cursor = 'grab'; });
  svg.addEventListener('mouseleave', () => { if (gDrag) { gDrag._baseX = gDrag.x; gDrag._baseY = gDrag.y; } gDrag = null; gPan = false; svg.style.cursor = 'grab'; });

  // Smooth zoom animation
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const d = e.deltaY > 0 ? 0.92 : 1.08;
    const ns = Math.max(0.2, Math.min(4, gTx.s * d));
    const tx = mx - (mx - gTx.x) * (ns / gTx.s);
    const ty = my - (my - gTx.y) * (ns / gTx.s);
    gZoomAnim = { tx, ty, ts: ns, start: performance.now(), fromX: gTx.x, fromY: gTx.y, fromS: gTx.s };
    saveCameraState();
    startGraphRenderLoop();
  }, { passive: false });

  // Right-click context menu
  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    const nodeG = e.target.closest('.graph-node');
    const nodeId = nodeG ? nodeG.dataset.id : null;
    const menu = document.getElementById('graph-ctx-menu');
    if (!menu) return;
    if (nodeId) {
      menu.dataset.nodeId = nodeId;
      menu.style.display = 'block';
      const containerRect = svg.getBoundingClientRect();
      menu.style.left = Math.min(e.clientX - containerRect.left, containerRect.width - 160) + 'px';
      menu.style.top = Math.min(e.clientY - containerRect.top, containerRect.height - 140) + 'px';
    } else {
      menu.style.display = 'none';
    }
  });

  // Double-click: zoom to node
  svg.addEventListener('dblclick', e => {
    const nodeG = e.target.closest('.graph-node');
    if (nodeG) {
      zoomToNode(nodeG.dataset.id);
      startGraphRenderLoop();
    }
  });

  // Click on empty space: close panels
  svg.addEventListener('click', e => {
    if (!e.target.closest('.graph-node')) {
      closeGraphSidePanel();
      const menu = document.getElementById('graph-ctx-menu');
      if (menu) menu.style.display = 'none';
    }
  });

  svg.style.cursor = 'grab';
}

/* ── Side panel with task info ── */
function showGraphSidePanel(nodeId) {
  if (_graphSidePanel && _graphSidePanel.dataset.taskId === nodeId) {
    closeGraphSidePanel();
    return;
  }
  closeGraphSidePanel();

  const task = tasks.find(t => t.id === nodeId);
  if (!task) return;

  const container = $('graph-container');
  if (!container) return;

  const panel = document.createElement('div');
  panel.id = 'graph-side-panel';
  panel.style.cssText = 'position:absolute;top:0;right:0;width:320px;height:100%;background:var(--bg-secondary);border-left:1px solid var(--border-soft);box-shadow:-4px 0 24px rgba(0,0,0,0.3);z-index:10;overflow-y:auto;animation:slideInRight .25s ease-out;display:flex;flex-direction:column';

  const statusColor = STATUS_COLORS[task.status] || '#999';
  const statusLabel = STATUS_LABELS[task.status] || task.status;
  const priLabel = ({ high: 'Высокий', medium: 'Средний', low: 'Низкий' })[task.priority] || task.priority;
  const priColor = ({ high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--accent)' })[task.priority] || 'var(--text-secondary)';
  const children = tasks.filter(t => t.parentId === task.id);
  const tagsHtml = (task.tags || []).map(tg => `<span class="tag">#${esc(tg)}</span>`).join('');
  const dueText = task.dueDate ? fmtDate(task.dueDate) : '—';
  const timeText = task.actualTime ? formatTimerTime(task.actualTime) : '—';

  let descHtml = task.desc ? `<div style="margin-bottom:16px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:8px;font-weight:600">Описание</div><div style="font-size:13px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap">${esc(task.desc)}</div></div>` : '';
  let tagsSection = tagsHtml ? `<div style="margin-bottom:16px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:8px;font-weight:600">Теги</div><div style="display:flex;gap:6px;flex-wrap:wrap">${tagsHtml}</div></div>` : '';
  let recurText = task.recurring ? `<div style="margin-bottom:16px;font-size:12px;color:var(--accent)">🔁 ${({ daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно', weekdays: 'По будням' })[task.recurring] || ''}</div>` : '';

  let childrenHtml = '';
  if (children.length > 0) {
    const doneCount = children.filter(c => c.status === 'done').length;
    childrenHtml = `<div style="margin-bottom:16px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:8px;font-weight:600">Подзадачи (${doneCount}/${children.length})</div>`;
    children.forEach(c => {
      const cColor = c.status === 'done' ? 'var(--success)' : 'var(--border-strong)';
      const cStyle = c.status === 'done' ? 'text-decoration:line-through;opacity:0.6' : '';
      childrenHtml += `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;margin-bottom:4px;background:var(--bg-tertiary);font-size:12px"><span style="width:8px;height:8px;border-radius:50%;background:${cColor};flex-shrink:0"></span><span style="flex:1;color:var(--text-primary);${cStyle}">${esc(c.title)}</span></div>`;
    });
    childrenHtml += '</div>';
  }

  panel.innerHTML = `<div style="padding:16px 20px;border-bottom:1px solid var(--border-soft);display:flex;align-items:center;gap:10px">
    <button id="sp-close" style="background:none;border:none;color:var(--text-secondary);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px">✕</button>
    <span style="flex:1;font-size:14px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(task.title)}</span>
    <button id="sp-local" style="background:var(--bg-tertiary);border:1px solid var(--border-soft);color:var(--text-secondary);font-size:10px;cursor:pointer;padding:4px 8px;border-radius:6px;font-weight:600" title="Показать локальный граф">⊙</button>
    <button id="sp-edit" style="background:var(--accent-soft);border:1px solid var(--accent);color:var(--accent);font-size:11px;cursor:pointer;padding:4px 10px;border-radius:6px;font-weight:600">✏️</button>
    </div>
    <div style="padding:16px 20px;flex:1">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    <div style="background:var(--bg-tertiary);border-radius:10px;padding:12px;text-align:center"><div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">Статус</div><div style="font-size:14px;font-weight:600;color:${statusColor}">${statusLabel}</div></div>
    <div style="background:var(--bg-tertiary);border-radius:10px;padding:12px;text-align:center"><div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">Приоритет</div><div style="font-size:14px;font-weight:600;color:${priColor}">${priLabel}</div></div>
    <div style="background:var(--bg-tertiary);border-radius:10px;padding:12px;text-align:center"><div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">Срок</div><div style="font-size:14px;font-weight:600;color:var(--text-primary)">${dueText}</div></div>
    <div style="background:var(--bg-tertiary);border-radius:10px;padding:12px;text-align:center"><div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">Время</div><div style="font-size:14px;font-weight:600;color:var(--text-primary)">${timeText}</div></div>
    </div>
    ${descHtml}${tagsSection}${recurText}${childrenHtml}
    <div style="margin-bottom:16px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:8px;font-weight:600">Связанные (${links.length})</div></div>
    <div id="sp-related" style="margin-bottom:16px"></div>
    <div style="margin-top:16px;display:flex;gap:8px">
    <button id="sp-focus" style="flex:1;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-soft);border-radius:8px;cursor:pointer;font-size:12px;color:var(--text-primary)">⛵ Фокус</button>
    <button id="sp-timer" style="flex:1;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-soft);border-radius:8px;cursor:pointer;font-size:12px;color:var(--text-primary)">⏱ Таймер</button>
    </div>
    </div>`;

  // Related tasks (backlinks/forward links)
  const relatedDiv = panel.querySelector('#sp-related');
  if (relatedDiv) {
    const relatedLinks = links.filter(l => l.sourceId === task.id || l.targetId === task.id);
    if (relatedLinks.length > 0) {
      relatedDiv.innerHTML = relatedLinks.map(l => {
        const otherId = l.sourceId === task.id ? l.targetId : l.sourceId;
        const otherTask = tasks.find(t => t.id === otherId);
        if (!otherTask) return '';
        const linkType = l.type === 'parent' ? '🔗' : '↔️';
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;margin-bottom:4px;background:var(--bg-tertiary);font-size:12px;cursor:pointer" class="sp-related-task" data-id="${otherId}">
          <span style="width:8px;height:8px;border-radius:50%;background:${STATUS_COLORS[otherTask.status] || '#999'};flex-shrink:0"></span>
          <span style="flex:1;color:var(--text-primary)">${esc(otherTask.title)}</span>
          <span style="font-size:10px;color:var(--text-tertiary)">${linkType}</span>
        </div>`;
      }).join('');
      // Click on related task: open its side panel
      relatedDiv.querySelectorAll('.sp-related-task').forEach(el => {
        el.addEventListener('click', () => {
          const rid = el.dataset.id;
          if (rid) { closeGraphSidePanel(); showGraphSidePanel(rid); }
        });
      });
    } else {
      relatedDiv.innerHTML = '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Нет связанных задач</div>';
    }
  }

  panel.dataset.taskId = nodeId;
  container.appendChild(panel);
  _graphSidePanel = panel;

  if (!document.getElementById('sp-anim-style')) {
    const style = document.createElement('style');
    style.id = 'sp-anim-style';
    style.textContent = '@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } #graph-side-panel button:hover { filter: brightness(1.15); }';
    document.head.appendChild(style);
  }

  panel.querySelector('#sp-close').onclick = () => closeGraphSidePanel();
  panel.querySelector('#sp-edit').onclick = () => { closeGraphSidePanel(); openTaskModal(task); };
  panel.querySelector('#sp-local').onclick = () => {
    closeGraphSidePanel();
    if (gLocalNode === nodeId) { gLocalNode = null; renderGraph(); }
    else { gLocalNode = nodeId; renderGraph(); }
  };
  const focusBtn = panel.querySelector('#sp-focus');
  if (focusBtn) focusBtn.onclick = () => { closeGraphSidePanel(); openFocusMode(task.id); };
  const timerBtn = panel.querySelector('#sp-timer');
  if (timerBtn) timerBtn.onclick = () => {
    if (timerTaskId === task.id && timerRunning) { pauseTimer(); }
    else { if (timerRunning) stopTimer(); startTimerForTask(task.id); }
    showToast('⏱ ' + task.title, 'success', 1500);
  };
}

function closeGraphSidePanel() {
  if (_graphSidePanel) { _graphSidePanel.remove(); _graphSidePanel = null; }
}

/* ── Context menu actions ── */
function setupContextMenu() {
  const menu = document.getElementById('graph-ctx-menu');
  if (!menu || menu._setup) return;
  menu._setup = true;

  // Close on click outside
  document.addEventListener('mousedown', e => {
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  menu.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const nodeId = menu.dataset.nodeId;
      if (!nodeId) return;
      const node = gNodeMap[nodeId];
      const task = tasks.find(t => t.id === nodeId);
      const action = el.dataset.action;

      if (action === 'edit' && task) { closeGraphSidePanel(); openTaskModal(task); }
      else if (action === 'focus') { focusGraphTask(nodeId); }
      else if (action === 'local') {
        if (gLocalNode === nodeId) { gLocalNode = null; renderGraph(); }
        else { gLocalNode = nodeId; renderGraph(); }
      }
      else if (action === 'delete' && task) {
        confirmAction('Удалить задачу?', async () => {
          try { await api('DELETE', '/tasks/' + nodeId); tasks = await api('GET', '/tasks'); rerender(); showToast('Удалено', 'success'); }
          catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
        }, { danger: true, okLabel: 'Удалить' });
      }
      else if (action === 'pin') {
        if (gPinned[nodeId]) { delete gPinned[nodeId]; showToast('Откреплено', 'info'); }
        else { gPinned[nodeId] = true; gNodes.forEach(n => { if (n.id === nodeId) { n._vx = 0; n._vy = 0; } }); showToast('Закреплено', 'success'); }
        renderGraph();
      }
      else if (action === 'center') {
        zoomToNode(nodeId);
        startGraphRenderLoop();
      }
      menu.style.display = 'none';
    });
  });
}

/* ── Status filter toggle ── */
function toggleGraphFilter(status) {
  gFilterStatus[status] = !gFilterStatus[status];
  const chips = document.querySelectorAll('#graph-filter-bar .filter-chip');
  chips.forEach(c => { if (c.dataset.gstatus === status) c.classList.toggle('active', gFilterStatus[status]); });
  renderGraph();
}

/* ── History playback: reveal nodes in creation order ── */
function playGraphHistory() {
  if (gHistoryPlay) {
    gHistoryPlay.stop = true;
    gHistoryPlay = null;
    renderGraph();
    return;
  }

  const sorted = tasks.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (sorted.length === 0) return showToast('Нет задач', 'info');
  const container = $('graph-container');
  const W = container?.clientWidth || 800;
  const H = container?.clientHeight || 600;

  // Build full graph data once, hide all nodes initially
  buildGraphData();
  gNodes.forEach(n => { n.x = W / 2; n.y = H / 2; });
  gEdges.length = 0;

  gHistoryPlay = { idx: 0, sorted, stop: false, step: 0, maxSteps: sorted.length + 2 };

  const btn = $('btn-graph-history');
  if (btn) btn.textContent = '⏹ Стоп';

  renderGraphSvg();

  function tick() {
    if (gHistoryPlay.stop) { gHistoryPlay = null; if (btn) btn.textContent = '▶ История'; return; }

    const step = gHistoryPlay.step;
    gHistoryPlay.step++;

    if (step < gHistoryPlay.sorted.length) {
      const task = gHistoryPlay.sorted[step];
      const node = gNodeMap[task.id];
      if (node) {
        // Place node at random position
        node.x = 100 + Math.random() * (W - 200);
        node.y = 100 + Math.random() * (H - 200);

        // Add edges for this node
        links.forEach(l => {
          const s = gNodeMap[l.sourceId], t = gNodeMap[l.targetId];
          if (s && t && (s.id === node.id || t.id === node.id)) {
            if (!gEdges.some(e => (e.source === s && e.target === t) || (e.source === t && e.target === s))) {
              gEdges.push({ source: s, target: t, type: l.type || 'related' });
            }
          }
        });
        // Add parent-child edges
        if (task.parentId && gNodeMap[task.parentId]) {
          const s = node, t = gNodeMap[task.parentId];
          if (!gEdges.some(e => (e.source === s && e.target === t) || (e.source === t && e.target === s))) {
            gEdges.push({ source: s, target: t, type: 'parent' });
          }
        }

        // Recompute target positions for visible nodes
        const visible = gNodes.filter(nn => nn.x !== W / 2 || nn.y !== H / 2);
        if (visible.length > 1) runMiniLayout(visible);

        // Update the SVG
        const svg = document.querySelector('#graph-svg');
        if (!svg) return;
        const edgesGroup = svg.querySelector('#graph-edges');
        const nodesGroup = svg.querySelector('#graph-nodes');
        if (!edgesGroup || !nodesGroup) return;

        // Regenerate edges SVG
        edgesGroup.innerHTML = '';
        gEdges.forEach((e, idx) => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', edgeCurve(e, idx).d);
          const isParent = e.type === 'parent';
          const color = isParent ? 'rgba(224,176,92,0.35)' : 'rgba(133,173,114,0.2)';
          path.setAttribute('stroke', color);
          path.setAttribute('stroke-width', isParent ? '2' : '1');
          path.setAttribute('fill', 'none');
          if (isParent) path.setAttribute('stroke-dasharray', '5,4');
          path.classList.add('graph-edge');
          path.dataset.edgeIdx = idx;
          edgesGroup.appendChild(path);
        });

        // Position this node
        const nodeG = nodesGroup.querySelector(`.graph-node[data-id="${node.id}"]`);
        if (nodeG) {
          nodeG.setAttribute('transform', `translate(${node.x},${node.y})`);
          nodeG.style.opacity = '0';
          nodeG.style.transition = 'opacity 0.4s ease';
          requestAnimationFrame(() => { nodeG.style.opacity = '1'; });
        }

        // Update info
        const info = $('graph-info');
        if (info) info.textContent = `История: ${step + 1}/${gHistoryPlay.sorted.length} · 🕐 ${esc(task.title)}`;
      }
    } else if (step === gHistoryPlay.sorted.length) {
      // Final relaxation pass
      runMiniLayout(gNodes);
      // Redraw all edges
      const edgesGroup = document.querySelector('#graph-edges');
      if (edgesGroup) {
        edgesGroup.innerHTML = '';
        gEdges.forEach((e, idx) => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', edgeCurve(e, idx).d);
          const isParent = e.type === 'parent';
          const color = isParent ? 'rgba(224,176,92,0.35)' : 'rgba(133,173,114,0.2)';
          path.setAttribute('stroke', color);
          path.setAttribute('stroke-width', isParent ? '2' : '1');
          path.setAttribute('fill', 'none');
          if (isParent) path.setAttribute('stroke-dasharray', '5,4');
          path.classList.add('graph-edge');
          path.dataset.edgeIdx = idx;
          edgesGroup.appendChild(path);
        });
      }
      gNodes.forEach(nn => { nn._targetX = nn.x; nn._targetY = nn.y; });
      // Clean up history state
      if (btn) btn.textContent = '▶ История';
      gHistoryPlay = null;
      showToast('Граф построен!', 'success', 2000);
      return;
    }

    setTimeout(tick, Math.max(50, 800 - gHistoryPlay.step * 3));
  }

  setTimeout(tick, 300);
}

function runMiniLayout(nodes) {
  const n = nodes.length;
  if (n < 2) return;
  const targetLen = 120;
  const repulsionStrength = 4000;
  const attractionStrength = 0.05;
  const iterations = 30;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distSq = Math.max(dx * dx + dy * dy, 1);
        const dist = Math.sqrt(distSq);
        const f = repulsionStrength / distSq;
        const fx = (dx / dist) * f, fy = (dy / dist) * f;
        a._vx = (a._vx || 0) - fx; a._vy = (a._vy || 0) - fy;
        b._vx = (b._vx || 0) + fx; b._vy = (b._vy || 0) + fy;
      }
    }

    for (const e of gEdges) {
      if (!nodes.includes(e.source) || !nodes.includes(e.target)) continue;
      const a = e.source, b = e.target;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (dist - targetLen) * attractionStrength;
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      a._vx = (a._vx || 0) + fx; a._vy = (a._vy || 0) + fy;
      b._vx = (b._vx || 0) - fx; b._vy = (b._vy || 0) - fy;
    }

    for (const n of nodes) {
      n.x += (n._vx || 0);
      n.y += (n._vy || 0);
      n._vx = 0; n._vy = 0;
    }
  }
}

/* ── Init graph UI (minimap, context menu, filters) ── */
function initGraphUI() {
  if (window._graphUIInit) return;
  window._graphUIInit = true;

  initMiniMap();
  setupContextMenu();

  // History playback
  const historyBtn = $('btn-graph-history');
  if (historyBtn) historyBtn.addEventListener('click', playGraphHistory);

  // Filter chip clicks
  document.querySelectorAll('#graph-filter-bar .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleGraphFilter(chip.dataset.gstatus));
  });

  // Minimap click to navigate
  if (_minimapCanvas && !_minimapCanvas._navSetup) {
    _minimapCanvas._navSetup = true;
    _minimapCanvas.addEventListener('click', e => {
      const rect = _minimapCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const pad = 6;
      const container = $('graph-container');
      if (!container || !gNodes.length) return;
      const cw = container.clientWidth, ch = container.clientHeight;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of gNodes) {
        if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
      }
      const bw = maxX - minX || 1, bh = maxY - minY || 1;
      const scale = Math.min((160 - pad * 2) / bw, (100 - pad * 2) / bh);
      const ox = pad - minX * scale, oy = pad - minY * scale;
      const graphX = (mx - ox) / scale, graphY = (my - oy) / scale;
      gTx.x = cw / 2 - graphX;
      gTx.y = ch / 2 - graphY;
      const gRoot = document.querySelector('#graph-root');
      if (gRoot) gRoot.setAttribute('transform', `translate(${gTx.x},${gTx.y}) scale(${gTx.s})`);
    });
  }
}
