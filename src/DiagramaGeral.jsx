import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { wrapText, esc, REGION_COLORS, SUITE, Menu, MenuItem } from "./lib.js";

/*
  Diagrama Geral — mapa conceitual / mental livre, independente das outras abas.
  Nós (conceitos) e ligações rotuladas, sem as regras da Teoria Ator-Rede.
  Estado próprio; entra no "Salvar QualMap" pela ponte SUITE (getGeral/setGeral).
*/

const VBW = 1000, VBH = 620;
const FS = 14, CW = FS * 0.58, LH = FS * 1.32, PADX = 14, PADY = 9, WRAP = 18;
const COLORS = ["#cfe0e8", ...REGION_COLORS.map((c) => c), "#ffffff"];

const uid = () => "g" + Math.random().toString(36).slice(2, 8);

function seedGeral() {
  return {
    nodes: [
      { id: "n1", text: "Conceito central", x: 500, y: 130, color: "#cfe0e8" },
      { id: "n2", text: "Ideia A", x: 250, y: 360, color: "#ffffff" },
      { id: "n3", text: "Ideia B", x: 750, y: 360, color: "#ffffff" },
      { id: "n4", text: "Detalhe", x: 750, y: 520, color: "#ffffff" },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", text: "leva a" },
      { id: "e2", from: "n1", to: "n3", text: "relaciona" },
      { id: "e3", from: "n3", to: "n4", text: "inclui" },
    ],
  };
}

function nodeDims(text) {
  const lines = wrapText(text || " ", WRAP);
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  const w = Math.max(74, Math.round(maxLen * CW) + PADX * 2);
  const h = lines.length * LH + PADY * 2;
  return { w, h, lines };
}

// ponto onde a reta até (tx,ty) cruza a borda da caixa centrada em (cx,cy)
function edgePoint(cx, cy, hw, hh, tx, ty) {
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function geometry(state) {
  const byId = {}; state.nodes.forEach((n) => (byId[n.id] = { ...n, ...nodeDims(n.text) }));
  const edges = state.edges.map((e) => {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return null;
    const p1 = edgePoint(a.x, a.y, a.w / 2, a.h / 2, b.x, b.y);
    const p2 = edgePoint(b.x, b.y, b.w / 2, b.h / 2, a.x, a.y);
    return { ...e, p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
  }).filter(Boolean);
  return { byId, edges };
}

function arrow(p1, p2, color) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, sz = 9;
  const bx = p2.x - ux * sz, by = p2.y - uy * sz, px = -uy, py = ux;
  return `${p2.x},${p2.y} ${bx + px * sz * 0.5},${by + py * sz * 0.5} ${bx - px * sz * 0.5},${by - py * sz * 0.5}`;
}

function buildGeralSVG(state, { withBg = true } = {}) {
  const { byId, edges } = geometry(state);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VBW} ${VBH}" width="${VBW}" height="${VBH}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">`];
  if (withBg) out.push(`<rect x="0" y="0" width="${VBW}" height="${VBH}" fill="#ffffff"/>`);
  edges.forEach((e) => {
    out.push(`<line x1="${e.p1.x}" y1="${e.p1.y}" x2="${e.p2.x}" y2="${e.p2.y}" stroke="#7a8b99" stroke-width="1.6"/>`);
    out.push(`<polygon points="${arrow(e.p1, e.p2, "#7a8b99")}" fill="#7a8b99"/>`);
    if (e.text) {
      const tw = e.text.length * 6.4 + 8;
      out.push(`<rect x="${e.mid.x - tw / 2}" y="${e.mid.y - 9}" width="${tw}" height="16" rx="3" fill="#ffffff" opacity="0.9"/>`);
      out.push(`<text x="${e.mid.x}" y="${e.mid.y + 3}" font-size="11" fill="#5a6b7a" text-anchor="middle">${esc(e.text)}</text>`);
    }
  });
  state.nodes.forEach((n) => {
    const d = byId[n.id]; const x = n.x - d.w / 2, y = n.y - d.h / 2;
    out.push(`<rect x="${x}" y="${y}" width="${d.w}" height="${d.h}" rx="9" fill="${n.color || "#ffffff"}" stroke="#34495e" stroke-width="1.4"/>`);
    d.lines.forEach((ln, i) => out.push(`<text x="${n.x}" y="${y + PADY + LH * (i + 0.8)}" font-size="${FS}" fill="#2b3a48" text-anchor="middle">${esc(ln)}</text>`));
  });
  out.push("</svg>");
  return out.join("");
}

function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }

function DiagramaGeral({ active = true }) {
  const [state, setStateRaw] = useState(seedGeral);
  const [past, setPast] = useState([]); const [future, setFuture] = useState([]);
  const [sel, setSel] = useState(null);       // id de nó
  const [selEdge, setSelEdge] = useState(null);
  const [mode, setMode] = useState("select"); // "select" | "connect"
  const [connectFrom, setConnectFrom] = useState(null);
  const stateRef = useRef(state); useEffect(() => { stateRef.current = state; });
  const svgRef = useRef(null); const dragRef = useRef(null); const fileRef = useRef(null);

  const pushHist = useCallback(() => { setPast((p) => [...p.slice(-60), JSON.stringify(stateRef.current)]); setFuture([]); }, []);
  const mut = useCallback((u) => { pushHist(); setStateRaw(u); }, [pushHist]);
  const undo = useCallback(() => setPast((p) => { if (!p.length) return p; setFuture((f) => [JSON.stringify(stateRef.current), ...f].slice(0, 60)); setStateRaw(JSON.parse(p[p.length - 1])); return p.slice(0, -1); }), []);
  const redo = useCallback(() => setFuture((f) => { if (!f.length) return f; setPast((p) => [...p, JSON.stringify(stateRef.current)].slice(-60)); setStateRaw(JSON.parse(f[0])); return f.slice(1); }), []);

  // persistência no "Salvar QualMap"
  useEffect(() => {
    SUITE.getGeral = () => stateRef.current;
    SUITE.setGeral = (data) => { if (data && Array.isArray(data.nodes)) { setStateRaw({ nodes: data.nodes, edges: data.edges || [] }); setSel(null); setSelEdge(null); } };
    return () => { SUITE.getGeral = null; SUITE.setGeral = null; };
  }, []);

  // autosave local simples
  useEffect(() => {
    const t = setTimeout(() => { try { window.localStorage.setItem("qualmap_geral", JSON.stringify(state)); } catch {} }, 600);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => { try { const s = window.localStorage.getItem("qualmap_geral"); if (s) { const o = JSON.parse(s); if (o && Array.isArray(o.nodes)) setStateRaw({ nodes: o.nodes, edges: o.edges || [] }); } } catch {} }, []);

  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (e.key === "Escape") { setMode("select"); setConnectFrom(null); }
      else if ((e.key === "Delete" || e.key === "Backspace") && (sel || selEdge)) { const tgt = e.target; if (tgt && /input|textarea/i.test(tgt.tagName)) return; e.preventDefault(); removeSel(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [active, sel, selEdge, undo, redo]);

  const geo = useMemo(() => geometry(state), [state]);

  const toSvg = (clientX, clientY) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * VBW, y: (clientY - r.top) / r.height * VBH };
  };

  const addNode = (x = VBW / 2, y = VBH / 2) => {
    const id = uid();
    mut((s) => ({ ...s, nodes: [...s.nodes, { id, text: "Novo conceito", x, y, color: "#ffffff" }] }));
    setSel(id); setSelEdge(null);
  };

  const onNodePointerDown = (e, id) => {
    e.stopPropagation();
    if (mode === "connect") {
      if (!connectFrom) setConnectFrom(id);
      else { if (connectFrom !== id) mut((s) => ({ ...s, edges: [...s.edges, { id: uid(), from: connectFrom, to: id, text: "" }] })); setConnectFrom(null); setMode("select"); }
      return;
    }
    setSel(id); setSelEdge(null);
    const start = toSvg(e.clientX, e.clientY); const n = stateRef.current.nodes.find((x) => x.id === id);
    dragRef.current = { id, dx: start.x - n.x, dy: start.y - n.y, moved: false };
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const p = toSvg(e.clientX, e.clientY);
    if (!d.moved) { pushHist(); d.moved = true; }
    setStateRaw((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === d.id ? { ...n, x: Math.round(p.x - d.dx), y: Math.round(p.y - d.dy) } : n)) }));
  };
  const onPointerUp = () => { dragRef.current = null; };
  useEffect(() => { window.addEventListener("pointermove", onPointerMove); window.addEventListener("pointerup", onPointerUp); return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); }; }, []);

  const onBgPointerDown = () => { setSel(null); setSelEdge(null); if (mode === "connect") setConnectFrom(null); };
  const onBgDoubleClick = (e) => { if (mode === "connect") return; const p = toSvg(e.clientX, e.clientY); addNode(Math.round(p.x), Math.round(p.y)); };

  const removeSel = () => {
    if (sel) mut((s) => ({ nodes: s.nodes.filter((n) => n.id !== sel), edges: s.edges.filter((e) => e.from !== sel && e.to !== sel) }));
    else if (selEdge) mut((s) => ({ ...s, edges: s.edges.filter((e) => e.id !== selEdge) }));
    setSel(null); setSelEdge(null);
  };
  const setNodeText = (t) => mut((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === sel ? { ...n, text: t } : n)) }));
  const setNodeColor = (c) => mut((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === sel ? { ...n, color: c } : n)) }));
  const setEdgeText = (t) => mut((s) => ({ ...s, edges: s.edges.map((e) => (e.id === selEdge ? { ...e, text: t } : e)) }));

  const exportSVG = () => dl(new Blob([buildGeralSVG(state)], { type: "image/svg+xml" }), "diagrama-geral.svg");
  const exportPNG = () => {
    const svg = buildGeralSVG(state); const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = VBW * 2; c.height = VBH * 2; const ctx = c.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); c.toBlob((b) => b && dl(b, "diagrama-geral.png")); };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  };
  const exportJSON = () => dl(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }), "diagrama-geral.json");
  const importJSON = (ev) => { const f = ev.target.files && ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(String(r.result)); if (o && Array.isArray(o.nodes)) mut(() => ({ nodes: o.nodes, edges: o.edges || [] })); } catch {} }; r.readAsText(f); ev.target.value = ""; };
  const limpar = () => mut(() => ({ nodes: [], edges: [] }));
  const exemplo = () => mut(() => seedGeral());

  const selNode = sel ? state.nodes.find((n) => n.id === sel) : null;
  const selEdgeObj = selEdge ? state.edges.find((e) => e.id === selEdge) : null;
  const mini = { padding: "6px 10px", fontSize: 12.5, border: "1px solid #cfd6dd", borderRadius: 6, cursor: "pointer", background: "#fff", color: "#34495e", fontWeight: 600 };
  const prim = { ...mini, background: "#1f7a8c", color: "#fff", border: "none" };
  const div = { width: 1, height: 22, background: "#dde3e9" };
  const lbl = { fontSize: 12, color: "#5a6b7a", display: "block", margin: "10px 0 3px" };
  const inp = { width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid #cfd6dd", borderRadius: 5, fontSize: 13, fontFamily: "inherit" };

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#eef1f4", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "9px 12px", background: "#fff", borderBottom: "1px solid #dde3e9" }}>
        <strong style={{ fontSize: 15, marginRight: 4 }}>Diagrama Geral</strong>
        <span style={{ fontSize: 11.5, color: "#9aa7b2" }}>mapa conceitual livre</span>
        <span style={div} />
        <button style={mini} onClick={() => addNode()}>+ Nó</button>
        <button style={mode === "connect" ? prim : mini} onClick={() => { setMode(mode === "connect" ? "select" : "connect"); setConnectFrom(null); }} title="ligar dois nós: clique na origem e no destino">Ligar nós</button>
        <button style={mini} onClick={removeSel} disabled={!sel && !selEdge}>Excluir</button>
        <span style={div} />
        <button style={mini} onClick={undo} disabled={!past.length} title="desfazer (Ctrl+Z)">↶</button>
        <button style={mini} onClick={redo} disabled={!future.length} title="refazer (Ctrl+Shift+Z)">↷</button>
        <span style={div} />
        <Menu label="Exportar" btnStyle={mini} title="exportar a figura">
          {(close) => (<>
            <MenuItem onClick={() => { exportSVG(); close(); }}>Figura SVG</MenuItem>
            <MenuItem onClick={() => { exportPNG(); close(); }}>Figura PNG</MenuItem>
          </>)}
        </Menu>
        <Menu label="Projeto" btnStyle={mini} title="salvar, abrir, exemplo e limpar">
          {(close) => (<>
            <MenuItem onClick={() => { exportJSON(); close(); }}>Salvar (.json)</MenuItem>
            <MenuItem onClick={() => { fileRef.current?.click(); close(); }}>Abrir (.json)</MenuItem>
            <MenuItem onClick={() => { exemplo(); close(); }}>Carregar exemplo</MenuItem>
            <MenuItem danger onClick={() => { limpar(); close(); }}>Limpar tudo</MenuItem>
          </>)}
        </Menu>
        <input ref={fileRef} type="file" accept="application/json" onChange={importJSON} style={{ display: "none" }} />
        {mode === "connect" && <span style={{ fontSize: 12, color: "#1f7a8c", fontWeight: 600 }}>{connectFrom ? "clique no nó de destino (Esc cancela)" : "clique no nó de origem (Esc cancela)"}</span>}
      </div>

      <div style={{ display: "flex", gap: 12, padding: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 560px", minWidth: 320, background: "#fff", border: "1px solid #dde3e9", borderRadius: 8, padding: 8 }}>
          <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block", background: "#fbfcfd", borderRadius: 4, touchAction: "none", cursor: mode === "connect" ? "crosshair" : "default" }}
            onPointerDown={onBgPointerDown} onDoubleClick={onBgDoubleClick}>
            {geo.edges.map((e) => {
              const on = selEdge === e.id;
              return (
                <g key={e.id} onPointerDown={(ev) => { ev.stopPropagation(); setSelEdge(e.id); setSel(null); }} style={{ cursor: "pointer" }}>
                  <line x1={e.p1.x} y1={e.p1.y} x2={e.p2.x} y2={e.p2.y} stroke={on ? "#1f7a8c" : "#7a8b99"} strokeWidth={on ? 2.6 : 1.6} />
                  <polygon points={arrow(e.p1, e.p2)} fill={on ? "#1f7a8c" : "#7a8b99"} />
                  <line x1={e.p1.x} y1={e.p1.y} x2={e.p2.x} y2={e.p2.y} stroke="transparent" strokeWidth={12} />
                  {e.text && (<>
                    <rect x={e.mid.x - (e.text.length * 6.4 + 8) / 2} y={e.mid.y - 9} width={e.text.length * 6.4 + 8} height={16} rx={3} fill="#ffffff" opacity={0.9} />
                    <text x={e.mid.x} y={e.mid.y + 3} fontSize={11} fill="#5a6b7a" textAnchor="middle" style={{ pointerEvents: "none" }}>{e.text}</text>
                  </>)}
                </g>
              );
            })}
            {state.nodes.map((n) => {
              const d = geo.byId[n.id]; const x = n.x - d.w / 2, y = n.y - d.h / 2;
              const on = sel === n.id, src = connectFrom === n.id;
              return (
                <g key={n.id} onPointerDown={(ev) => onNodePointerDown(ev, n.id)} style={{ cursor: mode === "connect" ? "crosshair" : "move" }}>
                  <rect x={x} y={y} width={d.w} height={d.h} rx={9} fill={n.color || "#ffffff"} stroke={on || src ? "#1f7a8c" : "#34495e"} strokeWidth={on || src ? 2.6 : 1.4} />
                  {d.lines.map((ln, i) => (<text key={i} x={n.x} y={y + PADY + LH * (i + 0.8)} fontSize={FS} fill="#2b3a48" textAnchor="middle" style={{ pointerEvents: "none", userSelect: "none" }}>{ln}</text>))}
                </g>
              );
            })}
          </svg>
          <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 6 }}>Duplo-clique no fundo cria um nó · arraste para mover · “Ligar nós” conecta · Delete remove o selecionado</div>
        </div>

        <div style={{ flex: "0 1 280px", minWidth: 250, background: "#fff", border: "1px solid #dde3e9", borderRadius: 8, padding: 14 }}>
          {selNode ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>Nó selecionado</div>
              <label style={lbl}>Texto</label>
              <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={selNode.text} onChange={(e) => setNodeText(e.target.value)} />
              <label style={lbl}>Cor</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {COLORS.map((c) => (<button key={c} onClick={() => setNodeColor(c)} style={{ width: 26, height: 22, borderRadius: 5, border: (selNode.color || "#ffffff") === c ? "2px solid #1f7a8c" : "1px solid #cfd6dd", background: c, cursor: "pointer" }} />))}
              </div>
              <button style={{ ...mini, marginTop: 12 }} onClick={removeSel}>Excluir nó</button>
            </div>
          ) : selEdgeObj ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>Ligação selecionada</div>
              <label style={lbl}>Rótulo</label>
              <input style={inp} value={selEdgeObj.text} onChange={(e) => setEdgeText(e.target.value)} placeholder="ex.: leva a, causa, inclui…" />
              <button style={{ ...mini, marginTop: 12 }} onClick={removeSel}>Excluir ligação</button>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "#7a8b99", lineHeight: 1.5 }}>
              Selecione um nó ou uma ligação para editar.<br /><br />
              <strong>Dica:</strong> duplo-clique no fundo cria um nó; use “Ligar nós” para conectar dois conceitos e dê um rótulo à ligação.
            </div>
          )}
          <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 16, borderTop: "1px solid #eef1f4", paddingTop: 8 }}>{state.nodes.length} nós · {state.edges.length} ligações</div>
        </div>
      </div>
    </div>
  );
}

export { DiagramaGeral };
