import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { VW, VH, SNAP_T, setDims, setSizeCtx, SUITE, useModalTrap, C, NODE_TYPES, TYPE_ORDER, MOMENTS, MOMENT_ORDER, NAT_LBL, ESTAB_LBL, KIND_LBL, brandes, parseCSVfull, csvNorm, colIdx, HELP, TOUR, Hint, Menu, MenuItem, REGION_COLORS, wrapText, sizeOf, degreeMap, clipToRect, distToSeg, qPoint, esc, approxW, edgeGeometry, arrowHead, barrierBar, estabBadge, scriptGlyph, calcGlyph, sourceLetter, sourceMark, nodeBody, buildInner, legendMetaFor, snapNode, alignNodes, distributeNodes, depths, forceLayout, arrange, declutter, fillLayout, foldBox, unfoldBox, parseCSV, toGraphML, toGEXF, seedVazio, seedDidatico, seedRedeLivre, seedRedeUnica, seedComparativo, seedCadeia, baseState } from "./lib.js";

function EditorTAR({ active = true, viewMode: viewModeProp, setViewMode: setViewModeProp }) {
  const [state, setStateRaw] = useState(seedVazio);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  const pushHist = useCallback(() => { setPast((p) => [...p.slice(-80), JSON.stringify(stateRef.current)]); setFuture([]); }, []);
  const setState = (updater) => setStateRaw(updater);
  const mut = useCallback((updater) => { pushHist(); setStateRaw(updater); }, [pushHist]);
  const undo = useCallback(() => {
    setPast((p) => { if (!p.length) return p; const prev = p[p.length - 1]; setFuture((f) => [JSON.stringify(stateRef.current), ...f].slice(0, 80)); setStateRaw(JSON.parse(prev)); return p.slice(0, -1); });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => { if (!f.length) return f; const nx = f[0]; setPast((p) => [...p, JSON.stringify(stateRef.current)].slice(-80)); setStateRaw(JSON.parse(nx)); return f.slice(1); });
  }, []);

  const [selNodes, setSelNodes] = useState([]);
  const [selEdge, setSelEdge] = useState(null);
  const [selRegion, setSelRegion] = useState(null);
  const [mode, setMode] = useState("select");
  const [connectFrom, setConnectFrom] = useState(null);
  const [newType, setNewType] = useState("mediador");
  const [newStyle, setNewStyle] = useState("solida");
  const [newDirected, setNewDirected] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [snap, setSnap] = useState(false);
  const [gridSize, setGridSize] = useState(20);
  const [useGuides, setUseGuides] = useState(true);
  const [force, setForce] = useState(false);
  const [guides, setGuides] = useState(null);
  const [band, setBand] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, w: VW, h: VH });
  const [step, setStep] = useState(Infinity);
  const [scaleOnResize, setScaleOnResize] = useState(true);
  const [relatos, setRelatos] = useState([]);
  const [activeRelato, setActiveRelato] = useState(null);
  const [relatoName, setRelatoName] = useState("");
  const [openSec, setOpenSec] = useState({ ins: true });
  const [viewModeInternal, setViewModeInternal] = useState("diagrama");
  const controlledView = viewModeProp != null;
  const viewMode = controlledView ? viewModeProp : viewModeInternal;
  const setViewMode = controlledView ? (setViewModeProp || (() => {})) : setViewModeInternal;
  const [impAct, setImpAct] = useState("");
  const [impAssoc, setImpAssoc] = useState("");
  const [impMsg, setImpMsg] = useState("");
  const [actSearch, setActSearch] = useState("");
  const [actFiltType, setActFiltType] = useState("all");
  const [actFiltNat, setActFiltNat] = useState("all");
  const [assocSearch, setAssocSearch] = useState("");
  const [assocFiltKind, setAssocFiltKind] = useState("all");
  const [assocFiltMoment, setAssocFiltMoment] = useState("all");
  const actFileRef = useRef(null);
  const assocFileRef = useRef(null);
  const toggleSec = (k) => setOpenSec((s) => ({ ...s, [k]: !s[k] }));

  const svgRef = useRef(null), dragRef = useRef(null), bandRef = useRef(null), panRef = useRef(null), resizeRef = useRef(null), fileRef = useRef(null), csvRef = useRef(null);
  const viewRef = useRef(view), scaleRef = useRef(scaleOnResize), cfgRef = useRef({ snap, gridSize, useGuides });
  useEffect(() => { viewRef.current = view; scaleRef.current = scaleOnResize; cfgRef.current = { snap, gridSize, useGuides }; });

  const maxStep = useMemo(() => {
    let m = 0;
    state.nodes.forEach((n) => { if (n.step) m = Math.max(m, n.step); });
    state.edges.forEach((e) => { if (e.step) m = Math.max(m, e.step); });
    return m;
  }, [state]);
  const effStep = maxStep ? (step === Infinity ? maxStep : Math.min(step, maxStep)) : null;

  const secHead = (k, title, badge, id) => (
    <div id={id} onClick={() => toggleSec(k)} style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 10px", margin: "6px 0 0", background: openSec[k] ? "#eef3f6" : "#f7f9fb", border: "1px solid #e3e9ee", borderRadius: 6, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>{badge}<span>{title}</span></span>
      <span style={{ color: "#9aa7b2", fontWeight: 400 }}>{openSec[k] ? "▾" : "▸"}</span>
    </div>
  );

  const simetria = useMemo(() => {
    const nodes = state.nodes, edges = state.edges;
    if (!nodes.length) return { level: "info", msg: "Adicione actantes para avaliar a simetria.", hAct: 0, nAct: 0, indef: 0 };
    const acting = new Set(edges.filter((e) => e.directed).map((e) => e.from));
    let hAct = 0, nAct = 0, indef = 0;
    for (const n of nodes) {
      const nat = n.nat || "indef";
      if (nat === "indef") indef++;
      if (acting.has(n.id)) { if (nat === "humano") hAct++; else if (nat === "nao") nAct++; }
    }
    let level = "info", msg = "";
    if (indef > nodes.length / 2) { level = "info"; msg = "Marque a natureza (humano/não-humano) dos actantes para verificar a simetria generalizada."; }
    else if (!acting.size) { level = "info"; msg = "Use arestas direcionadas para indicar quem age; então a simetria pode ser avaliada."; }
    else if (hAct > 0 && nAct === 0) { level = "aviso"; msg = "Só actantes humanos agem na rede. A simetria generalizada pede que não-humanos também façam diferença, não apareçam apenas como pano de fundo."; }
    else if (nAct > 0 && hAct === 0) { level = "aviso"; msg = "Só actantes não-humanos agem. Verifique se os humanos não foram reduzidos a meros efeitos da rede."; }
    else { level = "ok"; msg = "Humanos e não-humanos agem na rede: a simetria está respeitada."; }
    return { level, msg, hAct, nAct, indef };
  }, [state.nodes, state.edges]);

  const analise = useMemo(() => {
    const nodes = state.nodes, edges = state.edges;
    const N = nodes.length, E = edges.length;
    const byType = {}; TYPE_ORDER.forEach((t) => (byType[t] = 0)); nodes.forEach((n) => { byType[n.type] = (byType[n.type] || 0) + 1; });
    const byNat = { humano: 0, nao: 0, indef: 0 }; nodes.forEach((n) => { byNat[n.nat === "humano" ? "humano" : n.nat === "nao" ? "nao" : "indef"]++; });
    const byEstab = { estab: 0, prova: 0, nenhum: 0 }; nodes.forEach((n) => { byEstab[n.estab === "estab" ? "estab" : n.estab === "prova" ? "prova" : "nenhum"]++; });
    const calc = nodes.filter((n) => n.calc).length;
    const deg = {}; nodes.forEach((n) => (deg[n.id] = { in: 0, out: 0, tot: 0 }));
    edges.forEach((e) => { if (deg[e.from]) { deg[e.from].out++; deg[e.from].tot++; } if (deg[e.to]) { deg[e.to].in++; deg[e.to].tot++; } });
    const ids = nodes.map((n) => n.id);
    const adj = {}; ids.forEach((id) => (adj[id] = []));
    const seenPair = new Set();
    edges.forEach((e) => { if (adj[e.from] && adj[e.to] && e.from !== e.to) { const k = e.from < e.to ? e.from + "|" + e.to : e.to + "|" + e.from; if (!seenPair.has(k)) { seenPair.add(k); adj[e.from].push(e.to); adj[e.to].push(e.from); } } });
    const isolated = ids.filter((id) => adj[id].length === 0).length;
    let components = 0; const seen = new Set();
    for (const s of ids) { if (seen.has(s)) continue; components++; const st = [s]; seen.add(s); while (st.length) { const v = st.pop(); for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); st.push(w); } } }
    const CB = brandes(ids, adj);
    const ranking = nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, nat: n.nat, estab: n.estab, calc: n.calc, ...deg[n.id], bet: Math.round((CB[n.id] || 0) * 10) / 10 })).sort((a, b) => b.tot - a.tot);
    const betRanking = ranking.slice().sort((a, b) => b.bet - a.bet);
    const moments = {}; MOMENT_ORDER.forEach((m) => (moments[m] = 0)); edges.forEach((e) => { if (e.moment && moments[e.moment] != null) moments[e.moment]++; });
    const front = { programa: 0, antiprograma: 0 }; edges.forEach((e) => { if (e.front && front[e.front] != null) front[e.front]++; });
    const kinds = { associacao: 0, "porta-voz": 0, delegacao: 0, referencia: 0 }; edges.forEach((e) => { const k = e.kind || "associacao"; kinds[k] = (kinds[k] || 0) + 1; });
    const fontes = { entrevista: 0, documento: 0, observacao: 0, outro: 0, sem: 0 }; edges.forEach((e) => { const f = e.fonteTipo || (e.fonte ? "outro" : "sem"); fontes[f] = (fontes[f] || 0) + 1; });
    const comFonte = edges.filter((e) => e.fonteTipo || e.fonte).length;
    const density = N > 1 ? E / (N * (N - 1)) : 0;
    return { N, E, byType, byNat, byEstab, calc, ranking, betRanking, components, isolated, moments, front, kinds, fontes, comFonte, density };
  }, [state.nodes, state.edges]);

  const inner = useMemo(
    () => buildInner(state, { selNodes, selEdge, selRegion, connectFrom, interactive: true, grid: { show: showGrid, size: gridSize }, guides, band, force, step: effStep }),
    [state, selNodes, selEdge, selRegion, connectFrom, showGrid, gridSize, guides, band, force, effStep]
  );
  useEffect(() => { if (svgRef.current) svgRef.current.innerHTML = inner; }, [inner]);
  useEffect(() => { setDims(state.W, state.H); setSizeCtx({ force, degree: degreeMap(state.nodes, state.edges), maxW: state.maxW || 170, fontNo: (state.fonts && state.fonts.no) || 1, lineSpace: (state.fonts && state.fonts.entrelinha != null) ? state.fonts.entrelinha : 1.25 }); }, [state, force]);
  useEffect(() => { setDims(state.W, state.H); if (!resizeRef.current) setView({ x: 0, y: 0, w: state.W || 900, h: state.H || 540 }); }, [state.W, state.H]);

  const setNodes = (fn) => mut((s) => ({ ...s, nodes: fn(s.nodes) }));
  const setEdges = (fn) => mut((s) => ({ ...s, edges: fn(s.edges) }));
  const byId = (id) => state.nodes.find((n) => n.id === id);

  const toSvg = (evt) => {
    const svg = svgRef.current, pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse()); return { x: p.x, y: p.y };
  };
  const nodeAt = (p) => {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const n = state.nodes[i], { w, h } = sizeOf(n);
      if (Math.abs(p.x - n.x) <= w / 2 && Math.abs(p.y - n.y) <= h / 2) return n;
    }
    return null;
  };
  const edgeAt = (p) => {
    const pairMap = {};
    state.edges.forEach((e) => { const k = [e.from, e.to].sort().join("|"); (pairMap[k] ??= []).push(e.id); });
    for (const e of state.edges) {
      const geo = edgeGeometry(e, byId, pairMap); if (!geo) continue;
      const { p1, p2, ctrl, curved } = geo;
      let best = Infinity;
      if (curved) { for (let t = 0; t <= 1; t += 0.1) { const q = qPoint(p1, ctrl, p2, t); best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y)); } }
      else best = distToSeg(p.x, p.y, p1.x, p1.y, p2.x, p2.y);
      if (best < 6) return e;
    }
    return null;
  };

  const onPointerMove = useCallback((evt) => {
    if (panRef.current) {
      const pr = panRef.current, sc = viewRef.current.w / (svgRef.current.clientWidth || VW);
      setView((v) => ({ ...v, x: pr.vx - (evt.clientX - pr.x0) * sc, y: pr.vy - (evt.clientY - pr.y0) * sc }));
      return;
    }
    if (resizeRef.current) {
      const r = resizeRef.current;
      const newW = Math.max(360, Math.min(3200, Math.round(r.W0 + (evt.clientX - r.sx) * r.f0)));
      const newH = Math.max(280, Math.min(2400, Math.round(r.H0 + (evt.clientY - r.sy) * r.f0)));
      if (scaleRef.current) {
        const fx = newW / r.W0, fy = newH / r.H0;
        setStateRaw((s) => ({ ...s, W: newW, H: newH, nodes: s.nodes.map((n) => { const o = r.nodes[n.id]; return o ? { ...n, x: Math.round(o.x * fx), y: Math.round(o.y * fy) } : n; }) }));
      } else setStateRaw((s) => ({ ...s, W: newW, H: newH }));
      return;
    }
    const p = toSvg(evt);
    if (bandRef.current) {
      const b = bandRef.current, box = { x: Math.min(b.x0, p.x), y: Math.min(b.y0, p.y), w: Math.abs(p.x - b.x0), h: Math.abs(p.y - b.y0) };
      bandRef.current.box = box; setBand(box);
      return;
    }
    const d = dragRef.current; if (!d) return;
    const cur = stateRef.current, cfg = cfgRef.current;
    if (d.ids.length === 1) {
      const node = cur.nodes.find((m) => m.id === d.anchor); if (!node) return;
      const moved = { ...node, x: p.x - d.ox, y: p.y - d.oy };
      const others = cur.nodes.filter((m) => m.id !== node.id);
      const sn = snapNode(moved, others, cfg.snap ? cfg.gridSize : 0, cfg.useGuides);
      setGuides(sn.guides.length ? sn.guides : null);
      setStateRaw((s) => ({ ...s, nodes: s.nodes.map((m) => (m.id === node.id ? { ...m, x: sn.x, y: sn.y } : m)) }));
    } else {
      const dx = p.x - d.last.x, dy = p.y - d.last.y;
      setStateRaw((s) => ({ ...s, nodes: s.nodes.map((m) => (d.ids.includes(m.id) ? { ...m, x: Math.round(m.x + dx), y: Math.round(m.y + dy) } : m)) }));
      dragRef.current.last = { x: p.x, y: p.y };
    }
  }, []);
  const onPointerUp = useCallback(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    if (panRef.current) { panRef.current = null; return; }
    if (resizeRef.current) { resizeRef.current = null; setView({ x: 0, y: 0, w: stateRef.current.W || 900, h: stateRef.current.H || 540 }); return; }
    if (bandRef.current) {
      const b = bandRef.current.box;
      if (b && (b.w > 3 || b.h > 3)) {
        const inside = stateRef.current.nodes.filter((n) => n.x >= b.x && n.x <= b.x + b.w && n.y >= b.y && n.y <= b.y + b.h).map((n) => n.id);
        setSelNodes(Array.from(new Set([...(bandRef.current.add || []), ...inside])));
      }
      bandRef.current = null; setBand(null); return;
    }
    if (dragRef.current && dragRef.current.ids.length > 1 && cfgRef.current.snap) {
      const gs = cfgRef.current.gridSize;
      setStateRaw((s) => ({ ...s, nodes: s.nodes.map((m) => (dragRef.current.ids.includes(m.id) ? { ...m, x: Math.round(m.x / gs) * gs, y: Math.round(m.y / gs) * gs } : m)) }));
    }
    dragRef.current = null; setGuides(null);
  }, [onPointerMove]);
  const attachWindow = useCallback(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }, [onPointerMove, onPointerUp]);
  const onPointerDown = (evt) => {
    const p = toSvg(evt);
    if (evt.altKey) { panRef.current = { x0: evt.clientX, y0: evt.clientY, vx: view.x, vy: view.y }; attachWindow(); return; }
    const f0 = view.w / (svgRef.current.clientWidth || VW);
    if (Math.abs(p.x - VW) < 15 * f0 && Math.abs(p.y - VH) < 15 * f0) {
      pushHist();
      resizeRef.current = { W0: VW, H0: VH, sx: evt.clientX, sy: evt.clientY, f0, nodes: Object.fromEntries(state.nodes.map((q) => [q.id, { x: q.x, y: q.y }])) };
      attachWindow(); return;
    }
    const n = nodeAt(p);
    if (mode === "connect") {
      if (n) {
        if (connectFrom && connectFrom !== n.id) {
          mut((s) => ({ ...s, edges: [...s.edges, { id: connectFrom + "_" + n.id + "_" + Date.now(), from: connectFrom, to: n.id, style: newStyle, directed: newDirected, label: "" }] }));
          setConnectFrom(null);
        } else setConnectFrom(n.id);
      } else setConnectFrom(null);
      return;
    }
    if (n) {
      setSelEdge(null); setSelRegion(null);
      let ids;
      if (evt.shiftKey) ids = selNodes.includes(n.id) ? selNodes.filter((i) => i !== n.id) : [...selNodes, n.id];
      else ids = selNodes.includes(n.id) ? selNodes : [n.id];
      setSelNodes(ids);
      const group = ids.includes(n.id) ? ids : [n.id];
      pushHist();
      dragRef.current = { ids: group, last: { x: p.x, y: p.y }, anchor: n.id, ox: p.x - n.x, oy: p.y - n.y };
      attachWindow(); return;
    }
    const e = edgeAt(p);
    if (e) { setSelEdge(e.id); setSelNodes([]); setSelRegion(null); return; }
    setSelEdge(null); setSelRegion(null);
    if (!evt.shiftKey) setSelNodes([]);
    bandRef.current = { x0: p.x, y0: p.y, add: evt.shiftKey ? selNodes : [], box: null };
    attachWindow();
  };
  const resetView = () => setView({ x: 0, y: 0, w: VW, h: VH });
  const onDoubleClick = (evt) => { if (mode !== "select") return; const p = toSvg(evt); if (nodeAt(p)) return; addNode(Math.round(p.x), Math.round(p.y)); };

  // ---- toque: dois dedos = mover a tela + pinça para zoom ----
  const pinchRef = useRef(null);
  const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const touchMid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  const onTouchStart = (evt) => {
    if (evt.touches.length === 2) {
      dragRef.current = null; bandRef.current = null; setBand(null); panRef.current = null; setGuides(null);
      pinchRef.current = { d0: touchDist(evt.touches), mid0: touchMid(evt.touches), view0: { ...viewRef.current } };
    }
  };
  const onTouchMove = (evt) => {
    const pr = pinchRef.current;
    if (!pr || evt.touches.length !== 2 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const mid = touchMid(evt.touches);
    const relX = (pr.mid0.x - rect.left) / rect.width, relY = (pr.mid0.y - rect.top) / rect.height;
    const worldX = pr.view0.x + relX * pr.view0.w, worldY = pr.view0.y + relY * pr.view0.h;
    const ratio = pr.d0 / Math.max(1, touchDist(evt.touches));
    const nw = Math.min(VW * 2.5, Math.max(VW * 0.3, pr.view0.w * ratio));
    const nh = nw * (pr.view0.h / pr.view0.w);
    const x = worldX - relX * nw - (mid.x - pr.mid0.x) * (nw / rect.width);
    const y = worldY - relY * nh - (mid.y - pr.mid0.y) * (nh / rect.height);
    setView({ x, y, w: nw, h: nh });
  };
  const onTouchEnd = (evt) => { if (!evt.touches || evt.touches.length < 2) pinchRef.current = null; };

  const addNode = (x = VW / 2, y = 120) => {
    const id = "n" + Date.now();
    mut((s) => ({ ...s, nodes: [...s.nodes, { id, label: "Novo actante", x, y, type: newType, emph: false, nat: "indef" }] }));
    setSelNodes([id]); setSelEdge(null); setMode("select");
  };
  const addNodeOfType = (t) => {
    setDims(state.W, state.H);
    const id = "n" + Date.now();
    const cnt = stateRef.current.nodes.length;
    const x = Math.min(VW - 90, 120 + (cnt % 5) * 150);
    const y = Math.min(VH - 130, 110 + Math.floor(cnt / 5) * 110);
    setNewType(t);
    mut((s) => ({ ...s, nodes: [...s.nodes, { id, label: "Novo actante", x, y, type: t, emph: false, nat: "indef" }] }));
    setSelNodes([id]); setSelEdge(null); setSelRegion(null); setMode("select");
  };
  const upNode = (id, patch) => setStateRaw((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const upEdge = (id, patch) => setStateRaw((s) => ({ ...s, edges: s.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const removeNodeById = (id) => mut((s) => ({ ...s, nodes: s.nodes.filter((n) => n.id !== id), edges: s.edges.filter((e) => e.from !== id && e.to !== id) }));
  const removeEdgeById = (id) => mut((s) => ({ ...s, edges: s.edges.filter((e) => e.id !== id) }));
  const addActante = () => {
    setDims(state.W, state.H);
    const id = "n" + Date.now();
    const cnt = stateRef.current.nodes.length;
    const x = Math.min(VW - 90, 120 + (cnt % 5) * 150), y = Math.min(VH - 130, 110 + Math.floor(cnt / 5) * 110);
    mut((s) => ({ ...s, nodes: [...s.nodes, { id, label: "Novo actante", x, y, type: "mediador", emph: false, nat: "indef" }] }));
  };
  const addAssoc = () => {
    const ns = stateRef.current.nodes;
    if (ns.length < 2) return;
    const id = "e" + Date.now();
    mut((s) => ({ ...s, edges: [...s.edges, { id, from: ns[0].id, to: ns[1].id, style: "solida", directed: true, label: "" }] }));
  };
  const csvEsc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const labelOf = (id) => { const n = state.nodes.find((x) => x.id === id); return n ? n.label : id; };
  const exportActantesCSV = () => {
    const head = ["rotulo", "tipo", "natureza", "estabilizacao", "centro_calculo", "grau_total", "grau_saida", "grau_entrada", "intermediacao"];
    const rows = analise.ranking.map((r) => [r.label, NODE_TYPES[r.type]?.name || r.type, NAT_LBL[r.nat] || NAT_LBL.indef, ESTAB_LBL[r.estab] || "", r.calc ? "sim" : "não", r.tot, r.out, r.in, r.bet]);
    download(new Blob([[head, ...rows].map((row) => row.map(csvEsc).join(",")).join("\n")], { type: "text/csv" }), "actantes.csv");
  };
  const exportAssocCSV = () => {
    const head = ["origem", "destino", "relacao", "momento", "frente", "fonte_tipo", "fonte"];
    const rows = state.edges.map((e) => [labelOf(e.from), labelOf(e.to), KIND_LBL[e.kind || "associacao"], e.moment ? MOMENTS[e.moment].name : "", e.front || "", e.fonteTipo || "", e.fonte || ""]);
    download(new Blob([[head, ...rows].map((row) => row.map(csvEsc).join(",")).join("\n")], { type: "text/csv" }), "associacoes.csv");
  };
  const exportResumoCSV = () => {
    const a = analise, L = [["metrica", "valor"], ["actantes", a.N], ["associacoes", a.E], ["densidade", a.density.toFixed(3)], ["componentes_conectados", a.components], ["actantes_isolados", a.isolated], ["centros_de_calculo", a.calc]];
    TYPE_ORDER.forEach((t) => L.push(["tipo: " + NODE_TYPES[t].name, a.byType[t] || 0]));
    L.push(["natureza: humano", a.byNat.humano], ["natureza: nao-humano", a.byNat.nao], ["natureza: indefinido", a.byNat.indef]);
    L.push(["estabilizado", a.byEstab.estab], ["em prova", a.byEstab.prova], ["sem estado", a.byEstab.nenhum]);
    MOMENT_ORDER.forEach((m) => L.push(["momento: " + MOMENTS[m].name, a.moments[m] || 0]));
    L.push(["programa", a.front.programa], ["antiprograma", a.front.antiprograma], ["assoc_com_fonte", a.comFonte]);
    ["entrevista", "documento", "observacao", "outro", "sem"].forEach((f) => L.push(["fonte: " + f, a.fontes[f] || 0]));
    download(new Blob([L.map((row) => row.map(csvEsc).join(",")).join("\n")], { type: "text/csv" }), "resumo.csv");
  };
  const gerarRelatorio = () => {
    setDims(state.W, state.H);
    const a = analise;
    const eh = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}" style="max-width:100%;height:auto;border:1px solid #e3e9ee;border-radius:6px">${buildInner(state, { interactive: false })}</svg>`;
    const bar = (items, color) => { const max = Math.max(1, ...items.map((i) => i.value)); return items.map((i) => `<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><span style="width:150px;font-size:11px;color:#5a6b7a;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${eh(i.label)}</span><div style="flex:1;background:#eef1f4;border-radius:3px;height:13px"><div style="width:${(i.value / max) * 100}%;background:${color};height:100%;border-radius:3px"></div></div><span style="width:28px;font-size:11px;text-align:right;font-weight:600">${i.value}</span></div>`).join(""); };
    const kv = (rows) => `<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:3px 6px;border-bottom:1px solid #eef1f4;color:#46555f;font-size:12px">${eh(k)}</td><td style="padding:3px 6px;border-bottom:1px solid #eef1f4;text-align:right;font-weight:600;font-size:12px">${v}</td></tr>`).join("")}</table>`;
    const card = (title, inner) => `<div style="break-inside:avoid;background:#f7f9fb;border:1px solid #e3e9ee;border-radius:8px;padding:10px 12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#5a6b7a;margin-bottom:6px">${eh(title)}</div>${inner}</div>`;
    const simTxt = simetria.level === "ok" ? "simetria respeitada" : simetria.level === "aviso" ? "atenção à simetria" : "indeterminada";
    const cards = [
      card("Visão geral", kv([["Actantes", a.N], ["Associações", a.E], ["Densidade", (a.density * 100).toFixed(1) + "%"], ["Centros de cálculo", a.calc], ["Simetria", simTxt]])),
      card("Estrutura da rede", kv([["Componentes conectados", a.components], ["Actantes isolados", a.isolated]])),
      card("Por tipo", kv(TYPE_ORDER.map((t) => [NODE_TYPES[t].name, a.byType[t] || 0]))),
      card("Natureza", kv([["Humano", a.byNat.humano], ["Não-humano", a.byNat.nao], ["Indefinido", a.byNat.indef]])),
      card("Estabilização", kv([["Estabilizado", a.byEstab.estab], ["Em prova", a.byEstab.prova], ["Sem estado", a.byEstab.nenhum]])),
      card("Momentos da tradução", kv(MOMENT_ORDER.map((m) => [MOMENTS[m].name, a.moments[m] || 0]))),
      card("Frentes e relações", kv([["Programa", a.front.programa], ["Antiprograma", a.front.antiprograma], ["Porta-voz", a.kinds["porta-voz"] || 0], ["Delegação", a.kinds.delegacao || 0], ["Cadeia de ref.", a.kinds.referencia || 0]])),
      card("Fontes", kv([["Entrevista", a.fontes.entrevista], ["Documento", a.fontes.documento], ["Observação", a.fontes.observacao], ["Outro", a.fontes.outro], ["Com fonte", (a.E ? Math.round((a.comFonte / a.E) * 100) : 0) + "%"]])),
    ].join("");
    const charts = [
      card("Actantes por tipo", bar(TYPE_ORDER.map((t) => ({ label: NODE_TYPES[t].name, value: a.byType[t] || 0 })), "#4a6d8a")),
      card("Centralidade (top 8)", a.ranking.length ? bar(a.ranking.slice(0, 8).map((r) => ({ label: r.label, value: r.tot })), "#7d2e6e") : "<span style='font-size:12px;color:#b3bcc4'>sem dados</span>"),
      card("Intermediação (top 8)", a.betRanking.length ? bar(a.betRanking.slice(0, 8).map((r) => ({ label: r.label, value: r.bet })), "#b06a1f") : "<span style='font-size:12px;color:#b3bcc4'>sem dados</span>"),
    ].join("");
    const centRows = a.ranking.slice(0, 15).map((r) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eef1f4">${eh(r.label)}${r.type === "opp" ? " ◆" : ""}</td><td style="padding:4px 8px;border-bottom:1px solid #eef1f4;color:#7a8b99">${eh(NODE_TYPES[r.type]?.name || r.type)}</td><td style="padding:4px 8px;border-bottom:1px solid #eef1f4;text-align:right;font-weight:600">${r.tot}</td><td style="padding:4px 8px;border-bottom:1px solid #eef1f4;text-align:right">${r.out}</td><td style="padding:4px 8px;border-bottom:1px solid #eef1f4;text-align:right">${r.in}</td><td style="padding:4px 8px;border-bottom:1px solid #eef1f4;text-align:right">${r.bet}</td></tr>`).join("");
    const data = new Date().toLocaleDateString("pt-BR");
    const titulo = state.titles && state.titles.a ? state.titles.a : "Diagrama Ator-Rede";
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de análise TAR</title>
<style>
*{box-sizing:border-box} body{font-family:Helvetica,Arial,sans-serif;color:#2b3a42;margin:0;padding:28px 32px;background:#fff}
h1{font-size:20px;margin:0 0 2px} h2{font-size:14px;text-transform:uppercase;letter-spacing:.4px;color:#5a6b7a;border-bottom:2px solid #e3e9ee;padding-bottom:4px;margin:24px 0 12px}
.sub{color:#7a8b99;font-size:13px;margin-bottom:4px} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
table.cent{border-collapse:collapse;width:100%;font-size:12px} table.cent th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:#5a6b7a;padding:6px 8px;border-bottom:2px solid #e3e9ee}
.noprint{margin-bottom:16px} .noprint button{font-size:14px;padding:8px 16px;border:none;border-radius:6px;background:#1f7a8c;color:#fff;cursor:pointer}
@media print{.noprint{display:none}body{padding:0}h2{break-after:avoid}.grid>div{break-inside:avoid}}
@page{margin:16mm}
</style></head><body>
<div class="noprint"><button onclick="window.print()">Imprimir / Salvar como PDF</button></div>
<h1>Relatório de análise quantitativa — Teoria Ator-Rede</h1>
<div class="sub">${eh(titulo)} · ${data}</div>
<h2>Diagrama da rede</h2>
<div style="text-align:center">${svg}</div>
<h2>Resumo quantitativo</h2>
<div class="grid">${cards}</div>
<h2>Gráficos</h2>
<div class="grid">${charts}</div>
<h2>Centralidade e intermediação</h2>
<table class="cent"><thead><tr><th>Actante</th><th>Tipo</th><th style="text-align:right">Grau</th><th style="text-align:right">Saída</th><th style="text-align:right">Entrada</th><th style="text-align:right">Interm.</th></tr></thead><tbody>${centRows || '<tr><td colspan="6" style="padding:8px;color:#b3bcc4">sem actantes</td></tr>'}</tbody></table>
<div style="margin-top:26px;font-size:11px;color:#9aa7b2">Gerado pelo editor Ator-Rede. Intermediação (betweenness) calculada sobre o grafo não-direcionado; densidade sobre grafo direcionado.</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { setImpMsg("permita pop-ups para gerar o relatório."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };
  const importActantes = (text) => {
    const rows = parseCSVfull(text || ""); if (!rows.length) { setImpMsg("nada para importar"); return; }
    const head = rows[0];
    const ri = colIdx(head, ["rotulo", "rótulo", "label", "nome", "actante"]);
    const ti = colIdx(head, ["tipo", "type"]);
    const ni = colIdx(head, ["natureza", "nature", "nat"]);
    const ei = colIdx(head, ["estabilizacao", "estabilização", "estado", "estab"]);
    const ci = colIdx(head, ["centro_calculo", "centro de calculo", "centro de cálculo", "centro", "calc"]);
    const hasHeader = ri >= 0 || ti >= 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const rIdx = ri >= 0 ? ri : 0;
    const typeKey = {}; TYPE_ORDER.forEach((t) => { typeKey[csvNorm(NODE_TYPES[t].name)] = t; typeKey[csvNorm(t)] = t; });
    setDims(state.W, state.H);
    const newNodes = dataRows.map((r, idx) => {
      const label = (r[rIdx] || "").trim() || ("Actante " + (idx + 1));
      let type = "mediador"; if (ti >= 0 && typeKey[csvNorm(r[ti])]) type = typeKey[csvNorm(r[ti])];
      let nat = "indef"; if (ni >= 0) { const v = csvNorm(r[ni]); nat = v.startsWith("hum") ? "humano" : (v.includes("nao") || v === "n" || v.includes("não")) ? "nao" : "indef"; }
      let estab; if (ei >= 0) { const v = csvNorm(r[ei]); estab = v.startsWith("estab") ? "estab" : v.includes("prova") ? "prova" : undefined; }
      let calc; if (ci >= 0) { const v = csvNorm(r[ci]); calc = (v === "sim" || v === "true" || v === "x" || v === "1") ? true : undefined; }
      const x = Math.min(VW - 90, 120 + (idx % 5) * 150), y = Math.min(VH - 130, 110 + Math.floor(idx / 5) * 110);
      return { id: "n" + Date.now() + "_" + idx, label, x, y, type, emph: false, nat, ...(estab ? { estab } : {}), ...(calc ? { calc } : {}) };
    });
    mut((s) => ({ ...s, nodes: newNodes, edges: [] }));
    setSelNodes([]); setSelEdge(null);
    setImpMsg(`${newNodes.length} actante(s) importado(s); associações limpas.`);
  };
  const importAssoc = (text) => {
    const rows = parseCSVfull(text || ""); if (!rows.length) { setImpMsg("nada para importar"); return; }
    const head = rows[0];
    const oi = colIdx(head, ["origem", "source", "from", "de"]);
    const di = colIdx(head, ["destino", "target", "to", "para"]);
    const ki = colIdx(head, ["relacao", "relação", "kind"]);
    const mi = colIdx(head, ["momento", "moment"]);
    const fi = colIdx(head, ["frente", "front"]);
    const fti = colIdx(head, ["fonte_tipo", "fonte tipo", "tipo_fonte", "tipo de fonte"]);
    const fxi = colIdx(head, ["fonte", "fonte_texto", "fonte_livre", "nota"]);
    const hasHeader = oi >= 0 && di >= 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const oIdx = oi >= 0 ? oi : 0, dIdx = di >= 0 ? di : 1;
    const byLabel = {}; stateRef.current.nodes.forEach((n) => { byLabel[csvNorm(n.label)] = n.id; });
    const kindByName = {}; Object.entries(KIND_LBL).forEach(([k, v]) => { kindByName[csvNorm(v)] = k === "associacao" ? undefined : k; });
    kindByName[csvNorm("cadeia de ref.")] = "referencia";
    const momentByName = {}; MOMENT_ORDER.forEach((m) => { momentByName[csvNorm(MOMENTS[m].name)] = m; momentByName[csvNorm(m)] = m; });
    let matched = 0, skipped = 0;
    const newEdges = [];
    dataRows.forEach((r, idx) => {
      const from = byLabel[csvNorm(r[oIdx])], to = byLabel[csvNorm(r[dIdx])];
      if (!from || !to) { skipped++; return; }
      let kind; if (ki >= 0) kind = kindByName[csvNorm(r[ki])];
      let moment; if (mi >= 0) moment = momentByName[csvNorm(r[mi])];
      let front; if (fi >= 0) { const v = csvNorm(r[fi]); front = v.startsWith("anti") ? "antiprograma" : v.startsWith("prog") ? "programa" : undefined; }
      let fonteTipo; if (fti >= 0) { const v = csvNorm(r[fti]); fonteTipo = v.startsWith("entrev") ? "entrevista" : v.startsWith("doc") ? "documento" : v.startsWith("obs") ? "observacao" : v === "outro" ? "outro" : undefined; }
      let fonte; if (fxi >= 0 && fxi !== fti) { fonte = (r[fxi] || "").trim() || undefined; }
      newEdges.push({ id: "e" + Date.now() + "_" + idx, from, to, style: "solida", directed: true, label: "", ...(kind ? { kind } : {}), ...(moment ? { moment } : {}), ...(front ? { front } : {}), ...(fonteTipo ? { fonteTipo } : {}), ...(fonte ? { fonte } : {}) });
      matched++;
    });
    mut((s) => ({ ...s, edges: newEdges }));
    setImpMsg(`${matched} associação(ões) importada(s)${skipped ? `, ${skipped} ignorada(s) (rótulo não encontrado)` : ""}.`);
  };
  const updateNode = (patch) => setNodes((ns) => ns.map((n) => (n.id === selNodes[0] ? { ...n, ...patch } : n)));
  const updateEdge = (patch) => setEdges((es) => es.map((e) => (e.id === selEdge ? { ...e, ...patch } : e)));
  const deleteSelected = useCallback(() => {
    if (selEdge) { mut((s) => ({ ...s, edges: s.edges.filter((e) => e.id !== selEdge) })); setSelEdge(null); return; }
    if (selRegion) { mut((s) => ({ ...s, regions: (s.regions || []).filter((r) => r.id !== selRegion) })); setSelRegion(null); return; }
    if (selNodes.length) {
      const ids = new Set(selNodes);
      mut((s) => ({ ...s, nodes: s.nodes.filter((n) => !ids.has(n.id)), edges: s.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)), regions: (s.regions || []).map((r) => ({ ...r, nodeIds: r.nodeIds.filter((i) => !ids.has(i)) })) }));
      setSelNodes([]);
    }
  }, [selEdge, selRegion, selNodes, mut]);
  const doAlign = (how) => setNodes((ns) => alignNodes(ns, selNodes, how));
  const doDistribute = (axis) => setNodes((ns) => distributeNodes(ns, selNodes, axis));
  const organizar = (kind) => { setDims(state.W, state.H); mut((s) => ({ ...s, nodes: arrange(s.nodes, s.edges, kind) })); setGuides(null); };
  const desafogar = () => { setDims(state.W, state.H); mut((s) => ({ ...s, nodes: declutter(s.nodes) })); setGuides(null); };
  const preencher = () => { setDims(state.W, state.H); mut((s) => ({ ...s, nodes: fillLayout(s) })); setGuides(null); };
  const limparTudo = () => { let ok = true; try { ok = window.confirm("Apagar todos os actantes e associações? Dá para desfazer com Ctrl+Z."); } catch {} if (!ok) return; mut((s) => ({ ...s, nodes: [], edges: [], regions: [] })); setSelNodes([]); setSelEdge(null); setSelRegion(null); };
  const carregarExemplo = () => { mut(() => seedDidatico()); setSelNodes([]); setSelEdge(null); setSelRegion(null); };
  const setCanvas = (w, h) => mut((s) => ({ ...s, W: Math.max(360, Math.min(3200, Math.round(w))), H: Math.max(280, Math.min(2400, Math.round(h))) }));
  const adjustFont = (key, delta) => mut((s) => { const cur = { titulo: 1, no: 1, aresta: 1, legenda: 1, sub: 1, entrelinha: 1.25, ...(s.fonts || {}) }; cur[key] = Math.max(0.6, Math.min(2.2, Math.round((cur[key] + delta) * 100) / 100)); return { ...s, fonts: cur }; });
  const fitCanvas = () => {
    setDims(state.W, state.H);
    if (!state.nodes.length) return;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const n of state.nodes) { const { w, h } = sizeOf(n); minx = Math.min(minx, n.x - w / 2); maxx = Math.max(maxx, n.x + w / 2); miny = Math.min(miny, n.y - h / 2); maxy = Math.max(maxy, n.y + h / 2); }
    const padX = 40, padTop = state.twoPanel ? 44 : 40;
    let W = Math.max(360, Math.round(maxx - minx + padX * 2));
    // largura mínima para caber os títulos
    const tW = Math.max((state.titles.a || "").length, (state.titles.b || "").length) * 7.4 + 60;
    W = Math.max(W, state.twoPanel ? tW * 2 : tW);
    // alarga até a legenda caber em no máx. 3 linhas (evita estourar)
    if (state.showLegend) { let guard = 0; while (legendMetaFor(state, W).rows > 3 && W < 1500 && guard++ < 40) W += 80; }
    W = Math.round(Math.min(W, 1600));
    const legH = legendMetaFor(state, W).legendH;
    const subGap = (state.subs.a || (state.twoPanel && state.subs.b)) ? 22 : 0;
    const bottom = (legH ? legH + 14 : 0) + subGap + 16;
    const H = Math.max(280, Math.round(maxy - miny + padTop + bottom));
    const dx = padX - minx, dy = padTop - miny;
    mut((s) => ({ ...s, W, H, nodes: s.nodes.map((n) => ({ ...n, x: Math.round(n.x + dx), y: Math.round(n.y + dy) })) }));
  };
  const fold = () => { if (selNodes.length < 2) return; mut((s) => foldBox(s, selNodes, "Caixa-preta")); setSelNodes([]); };
  const unfold = () => { const b = byId(selNodes[0]); if (!b || !b.folded) return; mut((s) => unfoldBox(s, b.id)); setSelNodes([]); };
  const makeRegion = () => {
    if (selNodes.length < 1) return;
    const id = "r" + Date.now();
    const color = REGION_COLORS[(state.regions || []).length % REGION_COLORS.length];
    mut((s) => ({ ...s, regions: [...(s.regions || []), { id, label: "Locus", nodeIds: [...selNodes], color }] }));
    setSelRegion(id);
  };

  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); }
      else if (e.key === "Escape") { setConnectFrom(null); setMode("select"); setSelNodes([]); setSelEdge(null); setSelRegion(null); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setSelNodes(state.nodes.map((n) => n.id)); setSelEdge(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [deleteSelected, undo, redo, state.nodes, active]);

  const LS_KEY = "tar_editor_autosave_v2";
  const savedPayloadRef = useRef(null);
  const skipFirstSave = useRef(true);
  const storageOkRef = useRef(true);
  const [hasSaved, setHasSaved] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [tour, setTour] = useState(-1);
  const [spot, setSpot] = useState(null);
  const helpRef = useRef(null);
  useModalTrap(showHelp, helpRef, () => setShowHelp(false));
  const finishTour = () => { setTour(-1); setSpot(null); try { window.localStorage.setItem("tar_tour_done", "1"); } catch {} };
  useEffect(() => {
    if (tour < 0) { setSpot(null); return; }
    const step = TOUR[tour];
    if (step.view && viewMode !== step.view) { setViewMode(step.view); return; }
    if (!step.target) { setSpot(null); return; }
    const measure = () => { const el = document.getElementById(step.target); if (!el) { setSpot(null); return; } const r = el.getBoundingClientRect(); setSpot({ top: r.top, left: r.left, width: r.width, height: r.height }); };
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    const onR = () => measure();
    window.addEventListener("resize", onR); window.addEventListener("scroll", onR, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); window.removeEventListener("scroll", onR, true); };
  }, [tour, viewMode]);
  useEffect(() => { /* introdução agora é feita pelo Tutorial do QualMap; este tour continua acessível pela Ajuda */ }, []);
  useEffect(() => { if (!showHelp) return; const h = (e) => { if (e.key === "Escape") setShowHelp(false); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [showHelp]);
  useEffect(() => {
    try { const raw = window.localStorage.getItem(LS_KEY); if (raw) { const o = JSON.parse(raw); if (o && o.nodes && o.edges) { savedPayloadRef.current = o; setHasSaved(true); } } } catch { storageOkRef.current = false; }
  }, []);
  useEffect(() => {
    if (skipFirstSave.current) { skipFirstSave.current = false; return; }
    const t = setTimeout(() => { try { window.localStorage.setItem(LS_KEY, JSON.stringify({ ...stateRef.current, __relatos: relatos })); storageOkRef.current = true; } catch { storageOkRef.current = false; } }, 700);
    return () => clearTimeout(t);
  }, [state, relatos]);
  useEffect(() => {
    const h = (e) => { if (!storageOkRef.current && (stateRef.current.nodes.length || stateRef.current.edges.length)) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);
  const carregarSalvo = () => {
    const o = savedPayloadRef.current; if (!o) { setHasSaved(false); return; }
    const { __relatos, ...d } = o;
    if (Array.isArray(__relatos)) { setRelatos(__relatos); setActiveRelato(null); }
    mut(() => ({ regions: [], showNature: true, showSources: true, maxW: 170, ...d }));
    setSelNodes([]); setSelEdge(null); setSelRegion(null); setHasSaved(false);
  };
  const descartarSalvo = () => {
    try { window.localStorage.removeItem(LS_KEY); } catch {}
    savedPayloadRef.current = null; setHasSaved(false);
  };
  useEffect(() => {
    SUITE.getTar = () => ({ ...stateRef.current, __relatos: relatos });
    SUITE.setTar = (data) => {
      if (!data) return;
      const { __relatos, ...d } = data;
      if (Array.isArray(__relatos)) { setRelatos(__relatos); setActiveRelato(null); }
      mut(() => ({ regions: [], showNature: true, showSources: true, maxW: 170, ...d }));
      setSelNodes([]); setSelEdge(null); setSelRegion(null);
    };
    return () => { SUITE.getTar = null; SUITE.setTar = null; };
  }, [relatos]);

  const fullSVG = () => { setDims(state.W, state.H); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}">${buildInner(state, { interactive: false, force, step: effStep })}</svg>`; };
  const download = (blob, name) => { const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); };
  const exportSVG = () => download(new Blob([fullSVG()], { type: "image/svg+xml;charset=utf-8" }), "diagrama-tar.svg");
  const exportPNG = () => {
    setDims(state.W, state.H);
    const W = VW, H = VH;
    const blob = new Blob([fullSVG()], { type: "image/svg+xml;charset=utf-8" }), url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => {
      const sc = 2, c = document.createElement("canvas"); c.width = W * sc; c.height = H * sc;
      const ctx = c.getContext("2d"); ctx.setTransform(sc, 0, 0, sc, 0, 0);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url); c.toBlob((b) => download(b, "diagrama-tar.png"));
    };
    img.src = url;
  };
  const exportJSON = () => download(new Blob([JSON.stringify({ ...state, __relatos: relatos }, null, 2)], { type: "application/json" }), `tar-projeto-${new Date().toISOString().slice(0, 10)}.json`);
  const exportGraphML = () => download(new Blob([toGraphML(state)], { type: "application/xml" }), "diagrama-tar.graphml");
  const exportGEXF = () => download(new Blob([toGEXF(state)], { type: "application/xml" }), "diagrama-tar.gexf");
  const importJSON = (ev) => { const f = ev.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(r.result); if (o.nodes && o.edges) { const { __relatos, ...d } = o; if (Array.isArray(__relatos)) { setRelatos(__relatos); setActiveRelato(null); } mut(() => ({ regions: [], showNature: true, showSources: true, maxW: 170, ...d })); setSelNodes([]); setSelEdge(null); } } catch {} }; r.readAsText(f); ev.target.value = ""; };
  const salvarRelato = () => {
    const name = (relatoName.trim() || (state.titles && state.titles.a) || ("Relato " + (relatos.length + 1))).slice(0, 60);
    const id = "rel" + Date.now();
    setRelatos((rs) => [...rs, { id, name, snap: JSON.stringify(stateRef.current) }]);
    setActiveRelato(id); setRelatoName("");
  };
  const carregarRelato = (rel) => {
    pushHist();
    try { const o = JSON.parse(rel.snap); const { __relatos, ...d } = o; setStateRaw(d); } catch {}
    setActiveRelato(rel.id); setSelNodes([]); setSelEdge(null); setSelRegion(null);
  };
  const atualizarRelato = () => { if (!activeRelato) return; setRelatos((rs) => rs.map((x) => (x.id === activeRelato ? { ...x, snap: JSON.stringify(stateRef.current) } : x))); };
  const removerRelato = (id) => { setRelatos((rs) => rs.filter((x) => x.id !== id)); if (activeRelato === id) setActiveRelato(null); };
  const renomearRelato = (id) => { let nv = null; try { nv = window.prompt("Novo nome do relato:"); } catch {} if (nv && nv.trim()) setRelatos((rs) => rs.map((x) => (x.id === id ? { ...x, name: nv.trim().slice(0, 60) } : x))); };
  const importCSV = (ev) => { const f = ev.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const g = parseCSV(r.result); if (g) { mut(() => baseState(g.nodes, g.edges, false, "Rede importada", "", "", "")); setSelNodes([]); setSelEdge(null); } }; r.readAsText(f); ev.target.value = ""; };

  const ui = {
    page: { fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", background: "#eef1f4", color: "#2b3a48", minHeight: "100vh", display: "flex", flexDirection: "column" },
    bar: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "9px 12px", background: "#fff", borderBottom: "1px solid #dde3e9" },
    main: { display: "flex", gap: 12, padding: 12, flexWrap: "wrap", alignItems: "flex-start" },
    canvasWrap: { flex: "1 1 560px", background: "#fff", border: "1px solid #dde3e9", borderRadius: 8, padding: 8, minWidth: 320 },
    panel: { flex: "0 1 300px", background: "#fff", border: "1px solid #dde3e9", borderRadius: 8, padding: 14, minWidth: 270, maxHeight: "80vh", overflowY: "auto" },
    h: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a", margin: "14px 0 6px" },
    label: { fontSize: 12, color: "#5a6b7a", display: "block", margin: "8px 0 3px" },
    input: { width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid #cfd6dd", borderRadius: 5, fontSize: 13, fontFamily: "inherit" },
    seg: (a) => ({ flex: 1, padding: "6px 4px", fontSize: 12, border: "1px solid " + (a ? C.sel : "#cfd6dd"), background: a ? "#e3f1f4" : "#fff", color: a ? C.sel : "#46555f", borderRadius: 5, cursor: "pointer", fontWeight: a ? 700 : 500 }),
    btn: (k) => ({ padding: "6px 10px", fontSize: 13, border: "1px solid #cfd6dd", borderRadius: 6, cursor: "pointer", background: k === "primary" ? C.sel : "#fff", color: k === "primary" ? "#fff" : "#34495e", fontWeight: 600 }),
    chk: { fontSize: 12, color: "#5a6b7a", display: "flex", alignItems: "center", gap: 6, margin: 0 },
    mini: { padding: "6px 8px", fontSize: 12, border: "1px solid #cfd6dd", borderRadius: 5, cursor: "pointer", background: "#fff", color: "#34495e", fontWeight: 600 },
    div: { width: 1, height: 22, background: "#dde3e9" },
  };
  const selNode = selNodes.length === 1 ? byId(selNodes[0]) : null;
  const selEdgeObj = selEdge ? state.edges.find((e) => e.id === selEdge) : null;
  const selRegionObj = selRegion ? (state.regions || []).find((r) => r.id === selRegion) : null;
  const Seg = ({ value, set, options }) => (<div style={{ display: "flex", gap: 6 }}>{options.map(([v, l]) => (<button key={v} style={ui.seg(value === v)} onClick={() => set(v)}>{l}</button>))}</div>);
  const hint = (text) => <Hint text={text} />;

  const aTh = { textAlign: "left", fontSize: 11, fontWeight: 700, color: "#5a6b7a", padding: "7px 8px", borderBottom: "2px solid #e3e9ee", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" };
  const aTd = { padding: "4px 6px", borderBottom: "1px solid #eef1f4", verticalAlign: "middle" };
  const aCell = { width: "100%", boxSizing: "border-box", padding: "5px 6px", border: "1px solid #cfd6dd", borderRadius: 4, fontSize: 12.5, fontFamily: "inherit", background: "#fff" };
  const aCard = { background: "#f7f9fb", border: "1px solid #e3e9ee", borderRadius: 8, padding: "10px 12px" };
  const aCardH = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: "#5a6b7a", marginBottom: 6 };
  const aKv = { display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#46555f", padding: "2px 0" };
  const actFiltered = state.nodes.filter((n) => {
    if (actFiltType !== "all" && n.type !== actFiltType) return false;
    if (actFiltNat !== "all") { const nn = n.nat === "humano" ? "humano" : n.nat === "nao" ? "nao" : "indef"; if (nn !== actFiltNat) return false; }
    if (actSearch.trim() && !csvNorm(n.label).includes(csvNorm(actSearch))) return false;
    return true;
  });
  const assocFiltered = state.edges.filter((e) => {
    if (assocFiltKind !== "all" && (e.kind || "associacao") !== assocFiltKind) return false;
    if (assocFiltMoment !== "all" && (e.moment || "") !== assocFiltMoment) return false;
    if (assocSearch.trim()) { const q = csvNorm(assocSearch); if (!csvNorm(labelOf(e.from)).includes(q) && !csvNorm(labelOf(e.to)).includes(q)) return false; }
    return true;
  });
  const barRows = (items, color) => {
    const max = Math.max(1, ...items.map((i) => i.value));
    return items.map((i, idx) => (
      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0" }}>
        <span style={{ width: 104, fontSize: 11.5, color: "#5a6b7a", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={i.label}>{i.label}</span>
        <div style={{ flex: 1, background: "#eef1f4", borderRadius: 3, height: 14 }}>
          <div style={{ width: `${(i.value / max) * 100}%`, background: color, height: "100%", borderRadius: 3, minWidth: i.value ? 3 : 0, transition: "width .2s" }} />
        </div>
        <span style={{ width: 26, fontSize: 11.5, color: "#46555f", fontWeight: 600, textAlign: "right", flexShrink: 0 }}>{i.value}</span>
      </div>
    ));
  };

  return (
    <div style={ui.page}>
      <div style={ui.bar}>
        <strong style={{ fontSize: 15, marginRight: 4 }}>{viewMode === "analise" ? "Teoria Ator-Rede" : "Diagrama TAR"}</strong>
        {!controlledView && (
          <div id="tour-tabs" style={{ display: "flex", border: "1px solid #cfd6dd", borderRadius: 6, overflow: "hidden", marginRight: 6 }}>
            {[["analise", "Análise"], ["diagrama", "Diagrama"]].map(([v, l]) => (
              <button key={v} onClick={() => setViewMode(v)} style={{ border: "none", padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: viewMode === v ? "#1f7a8c" : "#fff", color: viewMode === v ? "#fff" : "#5a6b7a" }}>{l}</button>
            ))}
          </div>
        )}
        <button style={ui.mini} onClick={() => setShowHelp(true)} title="ajuda: o que o software faz">? Ajuda</button>
        <button style={ui.mini} onClick={undo} disabled={!past.length} title="desfazer (Ctrl+Z)">↶</button>
        <button style={ui.mini} onClick={redo} disabled={!future.length} title="refazer (Ctrl+Shift+Z)">↷</button>
        <span style={ui.div} />

        {viewMode === "diagrama" && (
          <Menu label="Organizar" title="acomodar os nós automaticamente" btnStyle={ui.mini}>
            {(close) => (<>
              <MenuItem onClick={() => { organizar("rede"); close(); }}>Rede ○ (círculo)</MenuItem>
              <MenuItem onClick={() => { organizar("organica"); close(); }}>Orgânica ⚛ (force-directed)</MenuItem>
              <MenuItem onClick={() => { organizar("vertical"); close(); }}>Cascata vertical ↓</MenuItem>
              <MenuItem onClick={() => { organizar("horizontal"); close(); }}>Cascata horizontal →</MenuItem>
              <MenuItem onClick={() => { desafogar(); close(); }}>Desafogar ⤧ (só sobreposições)</MenuItem>
              <MenuItem onClick={() => { preencher(); close(); }}>Preencher ⤢ (centraliza e amplia)</MenuItem>
            </>)}
          </Menu>
        )}

        {viewMode === "diagrama" && (
          <Menu label="Exibição" title="grade, aderência, guias e força" btnStyle={ui.mini} width={210}>
            <label style={{ ...ui.chk, padding: "5px 6px" }}><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grade</label>
            <label style={{ ...ui.chk, padding: "5px 6px" }}><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Aderir à grade</label>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 6px", fontSize: 12, color: "#5a6b7a" }}>Tamanho da grade
              <select style={{ ...ui.mini, padding: "3px 6px" }} value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}>{[10, 20, 25, 50].map((g) => (<option key={g} value={g}>{g}px</option>))}</select>
            </div>
            <label style={{ ...ui.chk, padding: "5px 6px" }}><input type="checkbox" checked={useGuides} onChange={(e) => setUseGuides(e.target.checked)} /> Guias de alinhamento</label>
            <label style={{ ...ui.chk, padding: "5px 6px" }}><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Força (nó por grau)</label>
          </Menu>
        )}

        {viewMode === "diagrama" && (<>
          <button style={ui.mini} onClick={() => setView((v) => ({ ...v, w: v.w * 0.9, h: v.h * 0.9 }))} aria-label="aproximar (zoom)" title="aproximar">＋</button>
          <button style={ui.mini} onClick={() => setView((v) => ({ ...v, w: v.w * 1.1, h: v.h * 1.1 }))} aria-label="afastar (zoom)" title="afastar">－</button>
          <button style={ui.mini} onClick={resetView} aria-label="ajustar à tela" title="ajustar">⤢</button>
          <span style={ui.div} />
        </>)}

        {viewMode === "diagrama" && (
          <Menu label="Exportar" title="exportar a figura e o grafo" btnStyle={ui.mini}>
            {(close) => (<>
              <MenuItem onClick={() => { exportSVG(); close(); }}>Figura SVG</MenuItem>
              <MenuItem onClick={() => { exportPNG(); close(); }}>Figura PNG</MenuItem>
              <MenuItem onClick={() => { exportGraphML(); close(); }}>GraphML (Gephi)</MenuItem>
              <MenuItem onClick={() => { exportGEXF(); close(); }}>GEXF (Gephi)</MenuItem>
            </>)}
          </Menu>
        )}

        <span id="tour-save" style={{ display: "inline-block" }}>
          <Menu label="Projeto" title="salvar, abrir, exemplo e limpar" btnStyle={ui.mini}>
            {(close) => (<>
              {hasSaved && <MenuItem onClick={() => { carregarSalvo(); close(); }}>Continuar de onde parei</MenuItem>}
              {hasSaved && <MenuItem onClick={() => { descartarSalvo(); close(); }}>Descartar salvo</MenuItem>}
              <MenuItem onClick={() => { exportJSON(); close(); }}>Salvar projeto (.json)</MenuItem>
              <MenuItem onClick={() => { fileRef.current?.click(); close(); }}>Abrir projeto (.json)</MenuItem>
              <MenuItem onClick={() => { csvRef.current?.click(); close(); }}>Importar CSV (associações)</MenuItem>
              <MenuItem onClick={() => { carregarExemplo(); close(); }}>Carregar exemplo</MenuItem>
              <MenuItem danger onClick={() => { limparTudo(); close(); }}>Limpar tudo</MenuItem>
            </>)}
          </Menu>
        </span>

        <input ref={fileRef} type="file" accept="application/json" onChange={importJSON} style={{ display: "none" }} />
        <input ref={csvRef} type="file" accept=".csv,text/csv,text/plain" onChange={importCSV} style={{ display: "none" }} />
        {viewMode === "diagrama" && maxStep > 0 && (
          <>
            <span style={ui.div} />
            <span style={{ fontSize: 12, color: "#7a8b99" }}>Etapa</span>
            <input type="range" min={1} max={maxStep} value={effStep || maxStep} onChange={(e) => setStep(Number(e.target.value))} />
            <button style={ui.mini} onClick={() => setStep(Infinity)}>Tudo</button>
          </>
        )}
      </div>

      {viewMode === "diagrama" && (<div style={ui.main}>
        <div style={ui.canvasWrap}>
          <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            style={{ width: "100%", height: "auto", display: "block", touchAction: "none", cursor: mode === "connect" ? "crosshair" : "default", background: "#fbfcfd", borderRadius: 4 }}
            onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} />
          <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 6 }}>Alt+arrastar = mover a tela · shift-clique ou laço = multi · zoom nos botões ＋ / － · no toque: dois dedos movem e dão zoom</div>
        </div>

        <div style={ui.panel}>
          {secHead("ins", "Inserir", undefined, "tour-ins")}
          {openSec.ins && (<>
            <span style={ui.label}>Adicionar caixa (clique no tipo){hint("Cada botão cria um actante daquele tipo. A caixa nasce selecionada para você renomear no inspetor.")}</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {TYPE_ORDER.map((t) => (
                <button key={t} style={{ ...ui.mini, textAlign: "left" }} onClick={() => addNodeOfType(t)} title={"adicionar " + NODE_TYPES[t].name}>+ {NODE_TYPES[t].name}</button>
              ))}
            </div>
            <span style={ui.label}>Ligar nós</span>
            <button style={{ ...ui.btn(mode === "connect" ? "primary" : ""), width: "100%" }} onClick={() => { setMode((m) => (m === "connect" ? "select" : "connect")); setConnectFrom(null); }}>{mode === "connect" ? "Ligando… clique origem e destino (Esc cancela)" : "Ligar nós (clique origem → destino)"}</button>
            <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#5a6b7a" }}>nova ligação:</span>
              <Seg value={newStyle} set={setNewStyle} options={[["solida", "Sólida"], ["tracejada", "Tracejada"]]} />
              <label style={ui.chk}><input type="checkbox" checked={newDirected} onChange={(e) => setNewDirected(e.target.checked)} /> com seta</label>
            </div>
            <span style={ui.label}>Rede automática{hint("Organiza os nós sozinho: em rede (force-directed), círculo, camadas, ou preenche a tela.")}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={{ ...ui.mini, flex: "1 1 100%" }} onClick={() => organizar("organica")} title="organiza os nós conectados como uma rede (force-directed)">⚛ Organizar em rede</button>
              <button style={{ ...ui.mini, flex: 1 }} onClick={() => organizar("rede")} title="dispõe os nós em círculo">○ Círculo</button>
              <button style={{ ...ui.mini, flex: 1 }} onClick={() => organizar("vertical")} title="cascata por camadas">↓ Camadas</button>
              <button style={{ ...ui.mini, flex: 1 }} onClick={preencher} title="centraliza e amplia para preencher a tela">⤢ Preencher</button>
            </div>
            <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 6, lineHeight: 1.35 }}>Dica: clique num tipo para inserir a caixa (ela já fica selecionada para renomear). Use “Ligar nós” e clique origem e destino. “Organizar em rede” acomoda tudo automaticamente.</div>
          </>)}

          {selNodes.length > 1 && (
            <>
              <div style={ui.h}>{selNodes.length} nós selecionados</div>
              <span style={ui.label}>Alinhar</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                <button style={ui.mini} onClick={() => doAlign("left")}>⇤ Esq</button>
                <button style={ui.mini} onClick={() => doAlign("centerX")}>↔ Centro</button>
                <button style={ui.mini} onClick={() => doAlign("right")}>Dir ⇥</button>
                <button style={ui.mini} onClick={() => doAlign("top")}>⤒ Topo</button>
                <button style={ui.mini} onClick={() => doAlign("centerY")}>↕ Meio</button>
                <button style={ui.mini} onClick={() => doAlign("bottom")}>Base ⤓</button>
              </div>
              <span style={ui.label}>Distribuir (3+ nós)</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ ...ui.mini, flex: 1 }} onClick={() => doDistribute("h")}>↔ Horizontal</button>
                <button style={{ ...ui.mini, flex: 1 }} onClick={() => doDistribute("v")}>↕ Vertical</button>
              </div>
              <span style={ui.label}>Agrupar</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ ...ui.mini, flex: 1 }} onClick={fold} title="dobrar em caixa-preta">▣ Caixa-preta</button>
                <button style={{ ...ui.mini, flex: 1 }} onClick={makeRegion} title="região / locus">◌ Região</button>
              </div>
              <button style={{ ...ui.btn(), marginTop: 12, width: "100%" }} onClick={deleteSelected}>Remover {selNodes.length} nós</button>
            </>
          )}
          {selNode && (
            <>
              <div style={ui.h}>Nó selecionado</div>
              <span style={ui.label}>Rótulo (Enter = nova linha)</span>
              <textarea style={{ ...ui.input, resize: "vertical", minHeight: 54 }} value={selNode.label} onChange={(e) => updateNode({ label: e.target.value })} onFocus={pushHist} />
              <span style={ui.label}>Tipo</span>
              <select style={ui.input} value={selNode.type} onChange={(e) => updateNode({ type: e.target.value })}>{TYPE_ORDER.map((t) => (<option key={t} value={t}>{NODE_TYPES[t].name}</option>))}</select>
              <span style={ui.label}>Natureza{hint("Humano ou não-humano. A TAR trata os dois simetricamente, como actantes que agem.")}</span>
              <select style={ui.input} value={selNode.nat || "indef"} onChange={(e) => updateNode({ nat: e.target.value })}><option value="indef">indefinida</option><option value="humano">humano</option><option value="nao">não-humano</option></select>
              <div style={{ background: "#f4f7fa", border: "1px solid #e1e8ee", borderRadius: 6, padding: "8px 10px", marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#46555f" }}>Teste mediador/intermediário</div>
                <div style={{ fontSize: 11.5, color: "#6b7c8a", margin: "3px 0 7px" }}>Esse elemento transforma o que passa por ele?</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...ui.mini, flex: 1, background: selNode.type === "mediador" ? "#e3f1f4" : "#fff", borderColor: selNode.type === "mediador" ? C.sel : "#cfd6dd" }} onClick={() => updateNode({ type: "mediador" })}>Sim → mediador</button>
                  <button style={{ ...ui.mini, flex: 1, background: selNode.type === "intermediario" ? "#e3f1f4" : "#fff", borderColor: selNode.type === "intermediario" ? C.sel : "#cfd6dd" }} onClick={() => updateNode({ type: "intermediario" })}>Não → intermediário</button>
                </div>
              </div>
              <span style={ui.label}>Prova de força{hint("Estabilizado: resistiu às provas e virou fato. Em prova: ainda em disputa.")}</span>
              <select style={ui.input} value={selNode.estab || ""} onChange={(e) => updateNode({ estab: e.target.value || undefined })}>
                <option value="">não marcado</option>
                <option value="estab">estabilizado (resistiu às provas)</option>
                <option value="prova">em prova (em disputa)</option>
              </select>
              <label style={{ ...ui.chk, margin: "10px 0 2px" }}><input type="checkbox" checked={!!selNode.calc} onChange={(e) => updateNode({ calc: e.target.checked || undefined })} /> centro de cálculo{hint("Lugar que acumula móveis imutáveis (tabelas, textos, inscrições) e por isso age à distância e domina a rede. Ganha um anel ao redor.")} (acumula móveis imutáveis)</label>
              <span style={ui.label}>Revelar na etapa (vazio = sempre)</span>
              <input style={ui.input} type="number" min="1" value={selNode.step || ""} onChange={(e) => updateNode({ step: e.target.value ? Number(e.target.value) : undefined })} />
              <label style={{ ...ui.chk, margin: "8px 0" }}><input type="checkbox" checked={!!selNode.emph} onChange={(e) => updateNode({ emph: e.target.checked })} /> ênfase (negrito)</label>
              {selNode.type === "caixapreta" && selNode.folded && (<button style={{ ...ui.mini, width: "100%", marginBottom: 8 }} onClick={unfold}>▣ Desdobrar caixa-preta</button>)}
              <button style={{ ...ui.btn(), width: "100%" }} onClick={deleteSelected}>Remover nó</button>
            </>
          )}
          {selEdgeObj && (
            <>
              <div style={ui.h}>Aresta selecionada</div>
              <span style={ui.label}>Estilo</span>
              <Seg value={selEdgeObj.style} set={(v) => updateEdge({ style: v })} options={[["solida", "Sólida"], ["tracejada", "Tracejada"]]} />
              <span style={ui.label}>Relação{hint("Tipo de ligação: associação simples, porta-voz (representa outros), delegação (ação inscrita num objeto) ou cadeia de referência (do mundo ao texto).")}</span>
              <select style={ui.input} value={selEdgeObj.kind || ""} onChange={(e) => updateEdge({ kind: e.target.value || undefined })}>
                <option value="">associação</option>
                <option value="porta-voz">porta-voz (representação)</option>
                <option value="delegacao">delegação / inscrição</option>
                <option value="referencia">cadeia de referência</option>
              </select>
              {selEdgeObj.kind === "referencia" && (
                <>
                  <span style={ui.label}>Ganha (amplificação)</span>
                  <input style={ui.input} value={selEdgeObj.ganha || ""} onChange={(e) => updateEdge({ ganha: e.target.value })} onFocus={pushHist} placeholder="mobilidade, padronização…" />
                  <span style={ui.label}>Perde (redução)</span>
                  <input style={ui.input} value={selEdgeObj.perde || ""} onChange={(e) => updateEdge({ perde: e.target.value })} onFocus={pushHist} placeholder="matéria, localidade…" />
                </>
              )}
              <span style={ui.label}>Momento da tradução{hint("Fases de Callon ao montar a rede: problematização, interessamento, alistamento e mobilização.")}</span>
              <select style={ui.input} value={selEdgeObj.moment || ""} onChange={(e) => updateEdge({ moment: e.target.value || undefined })}>
                <option value="">nenhum</option>
                {MOMENT_ORDER.map((m) => (<option key={m} value={m}>{MOMENTS[m].name}</option>))}
              </select>
              <span style={ui.label}>Programa de ação (controvérsia){hint("Programa: associação que favorece o objetivo. Antiprograma: resiste ou bloqueia (mostra uma barra).")}</span>
              <select style={ui.input} value={selEdgeObj.front || ""} onChange={(e) => updateEdge({ front: e.target.value || undefined })}>
                <option value="">neutro</option>
                <option value="programa">programa (a favor)</option>
                <option value="antiprograma">antiprograma (resistência)</option>
              </select>
              <label style={{ ...ui.chk, margin: "8px 0" }}><input type="checkbox" checked={!!selEdgeObj.directed} onChange={(e) => updateEdge({ directed: e.target.checked })} /> seta (direcionada)</label>
              <span style={ui.label}>Curvatura ({Math.round(selEdgeObj.curve || 0)})</span>
              <input type="range" min="-60" max="60" value={selEdgeObj.curve || 0} onChange={(e) => updateEdge({ curve: Number(e.target.value) || undefined })} style={{ width: "100%" }} />
              <span style={ui.label}>Rótulo</span>
              <input style={ui.input} value={selEdgeObj.label || ""} onChange={(e) => updateEdge({ label: e.target.value })} onFocus={pushHist} />
              <span style={ui.label}>Nota de fonte (rastro empírico){hint("De onde veio esta ligação: entrevista (E), documento (D), observação (O) ou outro. Aproxima o diagrama do \u201csiga os atores\u201d.")}</span>
              <select style={ui.input} value={selEdgeObj.fonteTipo || ""} onChange={(e) => updateEdge({ fonteTipo: e.target.value || undefined })}>
                <option value="">sem fonte</option>
                <option value="entrevista">entrevista (E)</option>
                <option value="documento">documento (D)</option>
                <option value="observacao">observação (O)</option>
                <option value="outro">outro (·)</option>
              </select>
              <input style={ui.input} value={selEdgeObj.fonte || ""} onChange={(e) => updateEdge({ fonte: e.target.value })} onFocus={pushHist} placeholder="ex.: entrevista com gestor, 2024" />
              <span style={ui.label}>Revelar na etapa (vazio = sempre)</span>
              <input style={ui.input} type="number" min="1" value={selEdgeObj.step || ""} onChange={(e) => updateEdge({ step: e.target.value ? Number(e.target.value) : undefined })} />
              <button style={{ ...ui.btn(), marginTop: 10, width: "100%" }} onClick={deleteSelected}>Remover aresta</button>
            </>
          )}
          {selRegionObj && (
            <>
              <div style={ui.h}>Região / locus</div>
              <span style={ui.label}>Rótulo</span>
              <input style={ui.input} value={selRegionObj.label} onChange={(e) => mut((s) => ({ ...s, regions: s.regions.map((r) => (r.id === selRegion ? { ...r, label: e.target.value } : r)) }))} onFocus={pushHist} />
              <span style={ui.label}>Cor</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{REGION_COLORS.map((c) => (<button key={c} onClick={() => mut((s) => ({ ...s, regions: s.regions.map((r) => (r.id === selRegion ? { ...r, color: c } : r)) }))} style={{ width: 26, height: 22, borderRadius: 5, border: selRegionObj.color === c ? "2px solid #1f7a8c" : "1px solid #cfd6dd", background: c, cursor: "pointer" }} />))}<input type="color" value={selRegionObj.color || "#3a6ea5"} onChange={(e) => mut((s) => ({ ...s, regions: s.regions.map((r) => (r.id === selRegion ? { ...r, color: e.target.value } : r)) }))} title="cor personalizada" style={{ width: 28, height: 22, padding: 0, border: "1px solid #cfd6dd", borderRadius: 5, background: "none", cursor: "pointer" }} /></div>
              <button style={{ ...ui.btn(), marginTop: 12, width: "100%" }} onClick={deleteSelected}>Remover região</button>
            </>
          )}
          {secHead("sim", "Verificação de simetria", <span style={{ width: 9, height: 9, borderRadius: "50%", background: simetria.level === "ok" ? "#2e7d4f" : simetria.level === "aviso" ? "#b06a1f" : "#9aa7b2" }} />)}
          {openSec.sim && (() => {
            const c = simetria.level === "ok" ? "#2e7d4f" : simetria.level === "aviso" ? "#b06a1f" : "#7a8b99";
            const bg = simetria.level === "ok" ? "#eef6f0" : simetria.level === "aviso" ? "#fbf3e8" : "#f4f7fa";
            const ic = simetria.level === "ok" ? "✓" : simetria.level === "aviso" ? "▲" : "•";
            return (
              <div style={{ borderLeft: `3px solid ${c}`, background: bg, borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: c }}>{ic} {simetria.level === "ok" ? "Simetria respeitada" : simetria.level === "aviso" ? "Atenção à simetria" : "Simetria indeterminada"}</div>
                <div style={{ fontSize: 11.5, color: "#5a6b7a", marginTop: 4, lineHeight: 1.35 }}>{simetria.msg}</div>
                <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 5 }}>agem: {simetria.hAct} humano(s), {simetria.nAct} não-humano(s){simetria.indef ? ` · ${simetria.indef} sem natureza` : ""}</div>
              </div>
            );
          })()}

          {secHead("tam", "Tamanho da figura")}
          {openSec.tam && (<>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input style={{ ...ui.input, width: 70 }} type="number" min="360" max="3200" value={state.W || 900} onChange={(e) => setCanvas(Number(e.target.value), state.H || 540)} onFocus={pushHist} />
            <span style={{ color: "#9aa7b2" }}>×</span>
            <input style={{ ...ui.input, width: 70 }} type="number" min="280" max="2400" value={state.H || 540} onChange={(e) => setCanvas(state.W || 900, Number(e.target.value))} onFocus={pushHist} />
            <span style={{ fontSize: 11, color: "#9aa7b2" }}>px</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <button style={ui.mini} onClick={() => setCanvas(900, 540)}>900×540</button>
            <button style={ui.mini} onClick={() => setCanvas(1200, 675)}>1200×675</button>
            <button style={ui.mini} onClick={() => setCanvas(1280, 960)}>1280×960</button>
            <button style={ui.mini} onClick={() => setCanvas(1400, 900)}>1400×900</button>
          </div>
          <button style={{ ...ui.btn(), width: "100%", marginTop: 6 }} onClick={fitCanvas} title="cresce a tela até toda a rede caber">⤢ Caber tudo</button>
          <label style={{ ...ui.chk, margin: "8px 0 0" }}><input type="checkbox" checked={scaleOnResize} onChange={(e) => setScaleOnResize(e.target.checked)} /> escalar conteúdo ao arrastar a alça</label>
          <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 4 }}>arraste a alça ◢ no canto inferior direito da tela para redimensionar</div></>)}

          {secHead("fon", "Fontes e espaçamento")}
          {openSec.fon && (<>{[["titulo", "Títulos"], ["no", "Caixas (nós)"], ["aresta", "Rótulos de aresta"], ["legenda", "Legenda"], ["sub", "Subtítulos"], ["entrelinha", "Entrelinha das caixas"]].map(([k, lbl]) => {
            const def = k === "entrelinha" ? 1.25 : 1;
            const val = (state.fonts && state.fonts[k] != null) ? state.fonts[k] : def;
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, margin: "5px 0" }}>
                <span style={{ flex: 1, fontSize: 12, color: "#5a6b7a" }}>{lbl}</span>
                <button style={{ ...ui.mini, padding: "3px 9px" }} onClick={() => adjustFont(k, -0.1)} title="diminuir">A−</button>
                <span style={{ width: 38, textAlign: "center", fontSize: 11, color: "#7a8b99" }}>{Math.round(val * 100)}%</span>
                <button style={{ ...ui.mini, padding: "3px 9px" }} onClick={() => adjustFont(k, 0.1)} title="aumentar">A+</button>
              </div>
            );
          })}</>)}

          {secHead("fig", "Figura")}
          {openSec.fig && (<>
          <label style={{ ...ui.chk, margin: "4px 0" }}><input type="checkbox" checked={state.twoPanel} onChange={(e) => mut((s) => ({ ...s, twoPanel: e.target.checked }))} /> dois painéis</label>
          <label style={{ ...ui.chk, margin: "4px 0" }}><input type="checkbox" checked={state.showLegend} onChange={(e) => mut((s) => ({ ...s, showLegend: e.target.checked }))} /> mostrar legenda</label>
          <label style={{ ...ui.chk, margin: "4px 0" }}><input type="checkbox" checked={state.showNature !== false} onChange={(e) => mut((s) => ({ ...s, showNature: e.target.checked }))} /> marcadores humano/não-humano</label>
          <label style={{ ...ui.chk, margin: "4px 0" }}><input type="checkbox" checked={state.showSources !== false} onChange={(e) => mut((s) => ({ ...s, showSources: e.target.checked }))} /> marcas de fonte das associações</label>
          <span style={ui.label}>Largura máx. do nó ({state.maxW || 170})</span>
          <input type="range" min="90" max="280" value={state.maxW || 170} onChange={(e) => setStateRaw((s) => ({ ...s, maxW: Number(e.target.value) }))} style={{ width: "100%" }} />
          <span style={ui.label}>{state.twoPanel ? "Título painel (a)" : "Título"}</span>
          <input style={ui.input} value={state.titles.a} onChange={(e) => setStateRaw((s) => ({ ...s, titles: { ...s.titles, a: e.target.value } }))} onFocus={pushHist} />
          {state.twoPanel && (<><span style={ui.label}>Título painel (b)</span><input style={ui.input} value={state.titles.b} onChange={(e) => setStateRaw((s) => ({ ...s, titles: { ...s.titles, b: e.target.value } }))} /></>)}
          <span style={ui.label}>{state.twoPanel ? "Legenda inferior (a)" : "Legenda inferior"}</span>
          <input style={ui.input} value={state.subs.a} onChange={(e) => setStateRaw((s) => ({ ...s, subs: { ...s.subs, a: e.target.value } }))} />
          {state.twoPanel && (<><span style={ui.label}>Legenda inferior (b)</span><input style={ui.input} value={state.subs.b} onChange={(e) => setStateRaw((s) => ({ ...s, subs: { ...s.subs, b: e.target.value } }))} /></>)}</>)}

          {secHead("rel", "Relatos da mesma rede")}
          {openSec.rel && (<>
          <div style={{ fontSize: 11, color: "#9aa7b2", marginBottom: 6, lineHeight: 1.35 }}>Salve versões alternativas do mesmo conjunto de actantes.{hint("O \u201cmolusco de referência\u201d: a mesma rede pode ser contada de vários modos e nenhum relato é privilegiado. Salve, alterne e atualize versões.")} Nenhum relato é privilegiado: cada um é um quadro da rede.</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...ui.input, flex: 1 }} placeholder="nome do relato" value={relatoName} onChange={(e) => setRelatoName(e.target.value)} />
            <button style={ui.mini} onClick={salvarRelato}>Salvar</button>
          </div>
          {activeRelato && relatos.find((r) => r.id === activeRelato) && (
            <button style={{ ...ui.mini, width: "100%", marginTop: 6 }} onClick={atualizarRelato}>Atualizar “{relatos.find((r) => r.id === activeRelato).name}” com o estado atual</button>
          )}
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {relatos.map((rel) => (
              <div key={rel.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button style={{ ...ui.mini, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: activeRelato === rel.id ? "#e3f1f4" : "#fff", borderColor: activeRelato === rel.id ? C.sel : "#cfd6dd", color: activeRelato === rel.id ? C.sel : "#34495e" }} onClick={() => carregarRelato(rel)} title="abrir este relato">{rel.name}</button>
                <button style={{ ...ui.mini, padding: "4px 7px" }} onClick={() => renomearRelato(rel.id)} title="renomear">✎</button>
                <button style={{ ...ui.mini, padding: "4px 7px" }} onClick={() => removerRelato(rel.id)} title="remover">✕</button>
              </div>
            ))}
            {!relatos.length && <div style={{ fontSize: 11, color: "#b3bcc4" }}>nenhum relato salvo ainda</div>}
          </div></>)}

          {secHead("mod", "Modelos")}
          {openSec.mod && (<>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={ui.mini} onClick={() => { mut(() => seedDidatico()); setSelNodes([]); setSelEdge(null); }}>Exemplo didático</button>
            <button style={ui.mini} onClick={() => { mut(() => seedRedeLivre()); setSelNodes([]); setSelEdge(null); }}>Rede livre</button>
            <button style={ui.mini} onClick={() => { mut(() => seedRedeUnica()); setSelNodes([]); setSelEdge(null); }}>Rede única</button>
            <button style={ui.mini} onClick={() => { mut(() => seedComparativo()); setSelNodes([]); setSelEdge(null); }}>Comparativo</button>
            <button style={ui.mini} onClick={() => { mut(() => seedCadeia()); setSelNodes([]); setSelEdge(null); }}>Cadeia</button>
          </div></>)}

          {state.showLegend && (
            <>
              {secHead("leg", "Textos da legenda")}
              {openSec.leg && (<>{[["mediador", "Mediador"], ["intermediario", "Intermediário"], ["silenciado", "Silenciado"], ["opp", "OPP"], ["caixapreta", "Caixa-preta"], ["quaseobjeto", "Quase-objeto"], ["solida", "Linha sólida"], ["tracejada", "Linha tracejada"], ["portavoz", "Porta-voz"], ["delegacao", "Delegação"], ["referencia", "Cadeia de referência"], ["programa", "Programa"], ["antiprograma", "Antiprograma"], ["estabilizado", "Estabilizado"], ["prova", "Em prova"], ["calc", "Centro de cálculo"], ["fonte", "Nota de fonte"], ["humano", "Humano"], ["nao", "Não-humano"]].map(([k, lbl]) => (
                <div key={k}><span style={ui.label}>{lbl}</span><input style={ui.input} value={state.legend[k] || ""} onChange={(e) => setStateRaw((s) => ({ ...s, legend: { ...s.legend, [k]: e.target.value } }))} /></div>
              ))}</>)}
            </>
          )}
        </div>
      </div>)}

      {viewMode === "analise" && (
        <div id="tour-analise" style={{ background: "#fff", border: "1px solid #dde3e9", borderRadius: 8, padding: 16, maxHeight: "84vh", overflowY: "auto" }}>
          <div style={{ fontSize: 13, color: "#5a6b7a", marginBottom: 14, lineHeight: 1.45 }}>
            Cadastre os actantes e categorize cada um (tipo, natureza, estabilização, centro de cálculo); registre as associações. O resumo quantitativo é calculado automaticamente e alimenta o diagrama (as duas abas compartilham os mesmos dados).
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px,1fr))", gap: 10, marginBottom: 20 }}>
            <div style={aCard}>
              <div style={aCardH}>Visão geral</div>
              <div style={aKv}><span>Actantes</span><strong>{analise.N}</strong></div>
              <div style={aKv}><span>Associações</span><strong>{analise.E}</strong></div>
              <div style={aKv}><span>Densidade</span><strong>{(analise.density * 100).toFixed(1)}%</strong></div>
              <div style={aKv}><span>Centros de cálculo</span><strong>{analise.calc}</strong></div>
              <div style={{ ...aKv, color: simetria.level === "ok" ? "#2e7d4f" : simetria.level === "aviso" ? "#b06a1f" : "#7a8b99" }}><span>Simetria</span><strong>{simetria.level === "ok" ? "ok" : simetria.level === "aviso" ? "atenção" : "—"}</strong></div>
            </div>
            <div style={aCard}>
              <div style={aCardH}>Estrutura da rede</div>
              <div style={aKv}><span>Componentes conectados</span><strong>{analise.components}</strong></div>
              <div style={aKv}><span>Actantes isolados</span><strong>{analise.isolated}</strong></div>
              <div style={aKv}><span>Densidade</span><strong>{(analise.density * 100).toFixed(1)}%</strong></div>
            </div>
            <div style={aCard}>
              <div style={aCardH}>Por tipo</div>
              {TYPE_ORDER.map((t) => (<div key={t} style={aKv}><span>{NODE_TYPES[t].name}</span><strong>{analise.byType[t] || 0}</strong></div>))}
            </div>
            <div style={aCard}>
              <div style={aCardH}>Natureza</div>
              <div style={aKv}><span>Humano</span><strong>{analise.byNat.humano}</strong></div>
              <div style={aKv}><span>Não-humano</span><strong>{analise.byNat.nao}</strong></div>
              <div style={aKv}><span>Indefinido</span><strong>{analise.byNat.indef}</strong></div>
            </div>
            <div style={aCard}>
              <div style={aCardH}>Estabilização</div>
              <div style={aKv}><span>Estabilizado</span><strong>{analise.byEstab.estab}</strong></div>
              <div style={aKv}><span>Em prova</span><strong>{analise.byEstab.prova}</strong></div>
              <div style={aKv}><span>Sem estado</span><strong>{analise.byEstab.nenhum}</strong></div>
            </div>
            <div style={aCard}>
              <div style={aCardH}>Momentos da tradução</div>
              {MOMENT_ORDER.map((m) => (<div key={m} style={aKv}><span>{MOMENTS[m].name}</span><strong>{analise.moments[m] || 0}</strong></div>))}
            </div>
            <div style={aCard}>
              <div style={aCardH}>Frentes e relações</div>
              <div style={aKv}><span>Programa</span><strong>{analise.front.programa}</strong></div>
              <div style={aKv}><span>Antiprograma</span><strong>{analise.front.antiprograma}</strong></div>
              <div style={aKv}><span>Porta-voz</span><strong>{analise.kinds["porta-voz"] || 0}</strong></div>
              <div style={aKv}><span>Delegação</span><strong>{analise.kinds.delegacao || 0}</strong></div>
              <div style={aKv}><span>Cadeia de ref.</span><strong>{analise.kinds.referencia || 0}</strong></div>
            </div>
            <div style={aCard}>
              <div style={aCardH}>Fontes (rastro empírico)</div>
              <div style={aKv}><span>Entrevista</span><strong>{analise.fontes.entrevista}</strong></div>
              <div style={aKv}><span>Documento</span><strong>{analise.fontes.documento}</strong></div>
              <div style={aKv}><span>Observação</span><strong>{analise.fontes.observacao}</strong></div>
              <div style={aKv}><span>Outro</span><strong>{analise.fontes.outro}</strong></div>
              <div style={aKv}><span>Com fonte</span><strong>{analise.E ? Math.round((analise.comFonte / analise.E) * 100) : 0}%</strong></div>
            </div>
          </div>

          <div style={{ ...aCardH, fontSize: 12, marginBottom: 6 }}>Gráficos</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(265px,1fr))", gap: 12, marginBottom: 20 }}>
            <div style={aCard}>
              <div style={aCardH}>Actantes por tipo</div>
              {barRows(TYPE_ORDER.map((t) => ({ label: NODE_TYPES[t].name, value: analise.byType[t] || 0 })), "#4a6d8a")}
            </div>
            <div style={aCard}>
              <div style={aCardH}>Natureza</div>
              {barRows([{ label: "Humano", value: analise.byNat.humano }, { label: "Não-humano", value: analise.byNat.nao }, { label: "Indefinido", value: analise.byNat.indef }], "#3f7d54")}
            </div>
            <div style={aCard}>
              <div style={aCardH}>Momentos da tradução</div>
              {barRows(MOMENT_ORDER.map((m) => ({ label: MOMENTS[m].name, value: analise.moments[m] || 0 })), "#c98a2b")}
            </div>
            <div style={aCard}>
              <div style={aCardH}>Centralidade (top 8)</div>
              {analise.ranking.length ? barRows(analise.ranking.slice(0, 8).map((r) => ({ label: r.label, value: r.tot })), "#7d2e6e") : <div style={{ fontSize: 12, color: "#b3bcc4" }}>sem dados</div>}
            </div>
            <div style={aCard}>
              <div style={aCardH}>Intermediação / betweenness (top 8)</div>
              {analise.betRanking.length ? barRows(analise.betRanking.slice(0, 8).map((r) => ({ label: r.label, value: r.bet })), "#b06a1f") : <div style={{ fontSize: 12, color: "#b3bcc4" }}>sem dados</div>}
            </div>
          </div>

          <div style={{ ...aCardH, fontSize: 12, marginBottom: 6 }}>Centralidade (grau): quem mais se conecta e quem age{hint("Grau = nº de conexões. Saída = age sobre outros; entrada = é mobilizado. Intermediação = faz ponte entre grupos.")}</div>
          <div style={{ overflowX: "auto", marginBottom: 20, border: "1px solid #eef1f4", borderRadius: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={aTh}>Actante</th><th style={aTh}>Tipo</th><th style={aTh}>Grau total</th><th style={aTh}>Age (saída)</th><th style={aTh}>Mobilizado (entrada)</th><th style={aTh}>Intermediação</th></tr></thead>
              <tbody>
                {analise.ranking.slice(0, 12).map((r) => (<tr key={r.id}><td style={aTd}>{r.label}{r.type === "opp" ? " ◆" : ""}</td><td style={{ ...aTd, color: "#7a8b99" }}>{NODE_TYPES[r.type]?.name}</td><td style={aTd}><strong>{r.tot}</strong></td><td style={aTd}>{r.out}</td><td style={aTd}>{r.in}</td><td style={aTd}>{r.bet}</td></tr>))}
                {!analise.ranking.length && (<tr><td style={aTd} colSpan={6}>nenhum actante ainda</td></tr>)}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ ...aCardH, fontSize: 12, margin: 0 }}>Actantes{hint("Cada linha é um actante. Categorize tipo, natureza, estabilização e centro de cálculo. Alimenta o diagrama e as métricas.")}</div>
            <button style={ui.btn("primary")} onClick={addActante}>+ Actante</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <input placeholder="buscar rótulo…" value={actSearch} onChange={(e) => setActSearch(e.target.value)} style={{ ...aCell, width: 170, flex: "0 0 auto" }} />
            <select value={actFiltType} onChange={(e) => setActFiltType(e.target.value)} style={{ ...aCell, width: "auto" }}><option value="all">todos os tipos</option>{TYPE_ORDER.map((t) => (<option key={t} value={t}>{NODE_TYPES[t].name}</option>))}</select>
            <select value={actFiltNat} onChange={(e) => setActFiltNat(e.target.value)} style={{ ...aCell, width: "auto" }}><option value="all">toda natureza</option><option value="humano">humano</option><option value="nao">não-humano</option><option value="indef">indefinido</option></select>
            <span style={{ fontSize: 11.5, color: "#9aa7b2" }}>{actFiltered.length} de {state.nodes.length}</span>
            {(actSearch || actFiltType !== "all" || actFiltNat !== "all") && <button style={{ ...ui.mini, padding: "4px 8px" }} onClick={() => { setActSearch(""); setActFiltType("all"); setActFiltNat("all"); }}>limpar</button>}
          </div>
          <div style={{ overflowX: "auto", marginBottom: 20, border: "1px solid #eef1f4", borderRadius: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 680 }}>
              <thead><tr><th style={aTh}>Rótulo</th><th style={aTh}>Tipo</th><th style={aTh}>Natureza</th><th style={aTh}>Estabilização</th><th style={aTh}>Centro cálc.</th><th style={aTh}></th></tr></thead>
              <tbody>
                {actFiltered.map((n) => (
                  <tr key={n.id}>
                    <td style={{ ...aTd, minWidth: 160 }}><input style={aCell} value={n.label} onChange={(e) => upNode(n.id, { label: e.target.value })} onFocus={pushHist} /></td>
                    <td style={aTd}><select style={aCell} value={n.type} onChange={(e) => { pushHist(); upNode(n.id, { type: e.target.value }); }}>{TYPE_ORDER.map((t) => (<option key={t} value={t}>{NODE_TYPES[t].name}</option>))}</select></td>
                    <td style={aTd}><select style={aCell} value={n.nat || "indef"} onChange={(e) => { pushHist(); upNode(n.id, { nat: e.target.value }); }}><option value="indef">—</option><option value="humano">humano</option><option value="nao">não-humano</option></select></td>
                    <td style={aTd}><select style={aCell} value={n.estab || ""} onChange={(e) => { pushHist(); upNode(n.id, { estab: e.target.value || undefined }); }}><option value="">—</option><option value="estab">estabilizado</option><option value="prova">em prova</option></select></td>
                    <td style={{ ...aTd, textAlign: "center" }}><input type="checkbox" checked={!!n.calc} onChange={(e) => { pushHist(); upNode(n.id, { calc: e.target.checked || undefined }); }} /></td>
                    <td style={aTd}><button style={{ ...ui.mini, padding: "4px 8px" }} onClick={() => removeNodeById(n.id)} title="remover">✕</button></td>
                  </tr>
                ))}
                {!actFiltered.length && (<tr><td style={aTd} colSpan={6}>{state.nodes.length ? "nenhum actante corresponde ao filtro." : "nenhum actante. Clique “+ Actante”."}</td></tr>)}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ ...aCardH, fontSize: 12, margin: 0 }}>Associações{hint("Ligações entre actantes: origem, destino, tipo de relação, momento da tradução, frente e fonte.")}</div>
            <button style={ui.btn("primary")} onClick={addAssoc} disabled={state.nodes.length < 2}>+ Associação</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <input placeholder="buscar origem/destino…" value={assocSearch} onChange={(e) => setAssocSearch(e.target.value)} style={{ ...aCell, width: 180, flex: "0 0 auto" }} />
            <select value={assocFiltKind} onChange={(e) => setAssocFiltKind(e.target.value)} style={{ ...aCell, width: "auto" }}><option value="all">toda relação</option><option value="associacao">associação</option><option value="porta-voz">porta-voz</option><option value="delegacao">delegação</option><option value="referencia">cadeia de ref.</option></select>
            <select value={assocFiltMoment} onChange={(e) => setAssocFiltMoment(e.target.value)} style={{ ...aCell, width: "auto" }}><option value="all">todo momento</option>{MOMENT_ORDER.map((m) => (<option key={m} value={m}>{MOMENTS[m].name}</option>))}</select>
            <span style={{ fontSize: 11.5, color: "#9aa7b2" }}>{assocFiltered.length} de {state.edges.length}</span>
            {(assocSearch || assocFiltKind !== "all" || assocFiltMoment !== "all") && <button style={{ ...ui.mini, padding: "4px 8px" }} onClick={() => { setAssocSearch(""); setAssocFiltKind("all"); setAssocFiltMoment("all"); }}>limpar</button>}
          </div>
          <div style={{ overflowX: "auto", marginBottom: 20, border: "1px solid #eef1f4", borderRadius: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
              <thead><tr><th style={aTh}>Origem</th><th style={aTh}>Destino</th><th style={aTh}>Relação</th><th style={aTh}>Momento</th><th style={aTh}>Frente</th><th style={aTh}>Fonte</th><th style={aTh}>Seta</th><th style={aTh}></th></tr></thead>
              <tbody>
                {assocFiltered.map((e) => (
                  <tr key={e.id}>
                    <td style={aTd}><select style={aCell} value={e.from} onChange={(ev) => { pushHist(); upEdge(e.id, { from: ev.target.value }); }}>{state.nodes.map((n) => (<option key={n.id} value={n.id}>{n.label}</option>))}</select></td>
                    <td style={aTd}><select style={aCell} value={e.to} onChange={(ev) => { pushHist(); upEdge(e.id, { to: ev.target.value }); }}>{state.nodes.map((n) => (<option key={n.id} value={n.id}>{n.label}</option>))}</select></td>
                    <td style={aTd}><select style={aCell} value={e.kind || ""} onChange={(ev) => { pushHist(); upEdge(e.id, { kind: ev.target.value || undefined }); }}><option value="">associação</option><option value="porta-voz">porta-voz</option><option value="delegacao">delegação</option><option value="referencia">cadeia de ref.</option></select></td>
                    <td style={aTd}><select style={aCell} value={e.moment || ""} onChange={(ev) => { pushHist(); upEdge(e.id, { moment: ev.target.value || undefined }); }}><option value="">—</option>{MOMENT_ORDER.map((m) => (<option key={m} value={m}>{MOMENTS[m].name}</option>))}</select></td>
                    <td style={aTd}><select style={aCell} value={e.front || ""} onChange={(ev) => { pushHist(); upEdge(e.id, { front: ev.target.value || undefined }); }}><option value="">—</option><option value="programa">programa</option><option value="antiprograma">antiprograma</option></select></td>
                    <td style={aTd}><select style={aCell} value={e.fonteTipo || ""} onChange={(ev) => { pushHist(); upEdge(e.id, { fonteTipo: ev.target.value || undefined }); }}><option value="">—</option><option value="entrevista">entrevista</option><option value="documento">documento</option><option value="observacao">observação</option><option value="outro">outro</option></select></td>
                    <td style={{ ...aTd, textAlign: "center" }}><input type="checkbox" checked={!!e.directed} onChange={(ev) => { pushHist(); upEdge(e.id, { directed: ev.target.checked }); }} /></td>
                    <td style={aTd}><button style={{ ...ui.mini, padding: "4px 8px" }} onClick={() => removeEdgeById(e.id)} title="remover">✕</button></td>
                  </tr>
                ))}
                {!assocFiltered.length && (<tr><td style={aTd} colSpan={8}>{state.edges.length ? "nenhuma associação corresponde ao filtro." : state.nodes.length < 2 ? "nenhuma associação. Cadastre ao menos 2 actantes." : "nenhuma associação. Clique “+ Associação”."}</td></tr>)}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={ui.mini} onClick={exportActantesCSV}>Actantes CSV</button>
            <button style={ui.mini} onClick={exportAssocCSV}>Associações CSV</button>
            <button style={ui.mini} onClick={exportResumoCSV}>Resumo CSV</button>
            <button style={ui.btn("primary")} onClick={gerarRelatorio}>Relatório (PDF)</button>
          </div>

          <div style={{ ...aCardH, fontSize: 12, margin: "20px 0 6px" }}>Importar planilha (CSV)</div>
          {impMsg && <div style={{ fontSize: 12, color: "#2e7d4f", marginBottom: 8 }}>{impMsg}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 12 }}>
            <div style={aCard}>
              <div style={aCardH}>Actantes</div>
              <div style={{ fontSize: 11, color: "#9aa7b2", marginBottom: 6, lineHeight: 1.35 }}>Colunas: rotulo, tipo, natureza, estabilizacao, centro_calculo. Substitui os actantes e limpa as associações.</div>
              <textarea value={impAct} onChange={(e) => setImpAct(e.target.value)} placeholder={"rotulo,tipo,natureza\nSecretaria,mediador,humano\nPlataforma,caixa-preta,não-humano"} style={{ width: "100%", minHeight: 76, boxSizing: "border-box", border: "1px solid #cfd6dd", borderRadius: 4, fontSize: 12, fontFamily: "monospace", padding: 6 }} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button style={ui.btn("primary")} onClick={() => { importActantes(impAct); setImpAct(""); }} disabled={!impAct.trim()}>Importar actantes</button>
                <button style={ui.mini} onClick={() => actFileRef.current?.click()}>Arquivo…</button>
                <input ref={actFileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: "none" }} onChange={(ev) => { const f = ev.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => importActantes(String(r.result)); r.readAsText(f); ev.target.value = ""; }} />
              </div>
            </div>
            <div style={aCard}>
              <div style={aCardH}>Associações</div>
              <div style={{ fontSize: 11, color: "#9aa7b2", marginBottom: 6, lineHeight: 1.35 }}>Colunas: origem, destino, relacao, momento, frente, fonte_tipo, fonte. Use os rótulos dos actantes já cadastrados.</div>
              <textarea value={impAssoc} onChange={(e) => setImpAssoc(e.target.value)} placeholder={"origem,destino,relacao,momento\nSecretaria,Plataforma,associação,problematização"} style={{ width: "100%", minHeight: 76, boxSizing: "border-box", border: "1px solid #cfd6dd", borderRadius: 4, fontSize: 12, fontFamily: "monospace", padding: 6 }} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button style={ui.btn("primary")} onClick={() => { importAssoc(impAssoc); setImpAssoc(""); }} disabled={!impAssoc.trim() || state.nodes.length < 2}>Importar associações</button>
                <button style={ui.mini} onClick={() => assocFileRef.current?.click()}>Arquivo…</button>
                <input ref={assocFileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: "none" }} onChange={(ev) => { const f = ev.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => importAssoc(String(r.result)); r.readAsText(f); ev.target.value = ""; }} />
              </div>
            </div>
          </div>
        </div>
      )}
      {showHelp && (
        <div onClick={() => setShowHelp(false)} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(20,30,38,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000 }}>
          <div ref={helpRef} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, maxWidth: 720, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,.25)", padding: "22px 26px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: "#2b3a42" }}>Ajuda — editor Ator-Rede</h2>
              <button onClick={() => setShowHelp(false)} aria-label="fechar" style={{ border: "none", background: "#eef3f6", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: "#5a6b7a" }}>×</button>
            </div>
            <div style={{ fontSize: 12.5, color: "#7a8b99", marginBottom: 16 }}>Guia rápido de tudo que o software faz. Pressione Esc para fechar.</div>
            <button style={{ ...ui.btn("primary"), marginBottom: 16 }} onClick={() => { setShowHelp(false); setTour(0); }}>▶ Ver primeiros passos (tour)</button>
            {HELP.map((sec, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1f7a8c", marginBottom: 6 }}>{sec.h}</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {sec.items.map((it, j) => (
                    <li key={j} style={{ fontSize: 13, color: "#3b4a52", lineHeight: 1.5, marginBottom: 3 }}>{Array.isArray(it) ? (<><b>{it[0]}:</b> {it[1]}</>) : it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      {tour >= 0 && TOUR[tour] && (() => {
        const body = (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1f7a8c", letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 6 }}>Primeiros passos · {tour + 1}/{TOUR.length}</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#2b3a42" }}>{TOUR[tour].t}</h2>
            <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#46555f", lineHeight: 1.5 }}>{TOUR[tour].b}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {TOUR.map((_, i) => (<span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === tour ? "#1f7a8c" : "#cfd6dd" }} />))}
              <div style={{ flex: 1 }} />
              <button style={ui.mini} onClick={finishTour}>Pular</button>
              {tour > 0 && <button style={ui.mini} onClick={() => setTour(tour - 1)}>Anterior</button>}
              {tour < TOUR.length - 1 ? <button style={ui.btn("primary")} onClick={() => setTour(tour + 1)}>Próximo</button> : <button style={ui.btn("primary")} onClick={finishTour}>Começar</button>}
            </div>
          </>
        );
        const cardBox = { background: "#fff", borderRadius: 12, maxWidth: 380, width: "calc(100% - 24px)", boxShadow: "0 12px 40px rgba(0,0,0,.3)", padding: "20px 22px", boxSizing: "border-box" };
        if (!spot) {
          return (
            <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(20,30,38,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1100 }}>
              <div style={cardBox}>{body}</div>
            </div>
          );
        }
        const cw = 380, ch = 200, vw = window.innerWidth, vh = window.innerHeight;
        let ct = spot.top + spot.height + 14; if (ct + ch > vh) ct = Math.max(10, spot.top - ch - 14);
        let cl = Math.min(vw - cw - 12, Math.max(12, spot.left)); if (cl < 12) cl = 12;
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 1100, pointerEvents: "none" }}>
            <div style={{ position: "fixed", top: spot.top - 6, left: spot.left - 6, width: spot.width + 12, height: spot.height + 12, borderRadius: 8, boxShadow: "0 0 0 9999px rgba(20,30,38,.55)", border: "2px solid #2bb0c9", transition: "all .2s" }} />
            <div style={{ position: "fixed", top: ct, left: cl, pointerEvents: "auto", ...cardBox }}>{body}</div>
          </div>
        );
      })()}
    </div>
  );
}



export { EditorTAR };
