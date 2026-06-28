import React, { useState, useEffect, useMemo } from "react";
import { SUITE, brandes, NODE_TYPES, TYPE_ORDER, NAT_LBL, MOMENTS, MOMENT_ORDER } from "./lib.js";

/*
  Janela 4 — Análise Quantitativa.
  Reúne as frequências da análise textual (códigos, categorias, co-ocorrência,
  vindas da Análise Qualitativa) e as métricas da rede TAR (grau, intermediação,
  densidade, vindas da Codificação TAR). Lê os dois lados pela ponte SUITE
  (SUITE.getTar / SUITE.getQual) sempre que a janela é aberta.
*/

// métricas da rede — espelha o cálculo do EditorTAR (aba Análise)
function computeTarMetrics(state) {
  if (!state || !Array.isArray(state.nodes)) return null;
  const nodes = state.nodes, edges = state.edges || [];
  const N = nodes.length, E = edges.length;
  const byType = {}; TYPE_ORDER.forEach((t) => (byType[t] = 0)); nodes.forEach((n) => { byType[n.type] = (byType[n.type] || 0) + 1; });
  const byNat = { humano: 0, nao: 0, indef: 0 }; nodes.forEach((n) => { byNat[n.nat === "humano" ? "humano" : n.nat === "nao" ? "nao" : "indef"]++; });
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
  const ranking = nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, ...deg[n.id], bet: Math.round((CB[n.id] || 0) * 10) / 10 })).sort((a, b) => b.tot - a.tot);
  const betRanking = ranking.slice().sort((a, b) => b.bet - a.bet);
  const moments = {}; MOMENT_ORDER.forEach((m) => (moments[m] = 0)); edges.forEach((e) => { if (e.moment && moments[e.moment] != null) moments[e.moment]++; });
  const density = N > 1 ? E / (N * (N - 1)) : 0;
  return { N, E, byType, byNat, calc, isolated, components, ranking, betRanking, moments, density };
}

// frequências do texto — espelha o cálculo da Análise Qualitativa
function computeQualFreq(project) {
  if (!project || !Array.isArray(project.codes)) return null;
  const codeMap = Object.fromEntries(project.codes.map((c) => [c.id, c]));
  const codeFreq = project.codes.map((c) => ({
    id: c.id, name: c.name, color: c.color,
    n: project.excerpts.filter((e) => e.codeIds.includes(c.id)).length,
  })).sort((a, b) => b.n - a.n);
  const catFreq = (project.categories || []).map((cat) => {
    const exs = project.excerpts.filter((e) => e.codeIds.some((id) => cat.codeIds.includes(id)));
    return { id: cat.id, name: cat.name, tipo: cat.tipo, codes: cat.codeIds.length, n: exs.length };
  });
  const m = {};
  project.excerpts.forEach((e) => {
    const ids = [...new Set(e.codeIds)];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join("|");
        m[key] = (m[key] || 0) + 1;
      }
  });
  const cooc = Object.entries(m).map(([k, n]) => { const [a, b] = k.split("|"); return { a, b, n }; }).sort((x, y) => y.n - x.n).slice(0, 12);
  return { codeFreq, catFreq, cooc, codeMap, name: project.name, excerpts: project.excerpts.length };
}

const T = {
  page: { fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: "#2b3a48", padding: "16px 20px", maxWidth: 1100, margin: "0 auto" },
  h2: { fontSize: 17, color: "#1f7a8c", margin: "4px 0 2px" },
  sub: { fontSize: 12, color: "#7a8b99", margin: "0 0 14px" },
  cols: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" },
  col: { flex: "1 1 420px", minWidth: 320 },
  card: { background: "#fff", border: "1px solid #e3e9ee", borderRadius: 8, padding: "12px 14px", marginBottom: 14 },
  cardH: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a", marginBottom: 8 },
  kv: { display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#46555f", padding: "2px 0" },
  empty: { fontSize: 12.5, color: "#9aa7b2" },
};

function BarRows({ items, color }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div style={T.empty}>Sem dados.</div>;
  return items.map((i, idx) => (
    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0" }}>
      <span style={{ width: 132, fontSize: 11.5, color: "#5a6b7a", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={i.label}>{i.label}</span>
      <div style={{ flex: 1, background: "#eef1f4", borderRadius: 3, height: 14 }}>
        <div style={{ width: `${(i.value / max) * 100}%`, background: i.color || color, height: "100%", borderRadius: 3, minWidth: i.value ? 3 : 0 }} />
      </div>
      <span style={{ width: 30, fontSize: 11.5, color: "#46555f", fontWeight: 600, textAlign: "right", flexShrink: 0 }}>{i.value}</span>
    </div>
  ));
}

function AnaliseQuantitativa({ active = true }) {
  const [tar, setTar] = useState(null);
  const [qual, setQual] = useState(null);

  // recarrega os dados dos dois lados sempre que a janela é aberta
  useEffect(() => {
    if (!active) return;
    let alive = true;
    try { setTar(SUITE.getTar ? SUITE.getTar() : null); } catch { setTar(null); }
    (async () => {
      try {
        const q = SUITE.getQual ? await SUITE.getQual() : null;
        const proj = q && q.projects && (q.projects[q.active] || Object.values(q.projects)[0]);
        if (alive) setQual(proj || null);
      } catch { if (alive) setQual(null); }
    })();
    return () => { alive = false; };
  }, [active]);

  const net = useMemo(() => computeTarMetrics(tar), [tar]);
  const txt = useMemo(() => computeQualFreq(qual), [qual]);

  return (
    <div style={T.page}>
      <h2 style={T.h2}>Análise Quantitativa</h2>
      <p style={T.sub}>Frequências do texto (Análise Qualitativa) e métricas da rede (Codificação TAR). Os números refletem o estado ao abrir esta janela.</p>
      <div style={T.cols}>

        {/* ---------- Rede TAR ---------- */}
        <div style={T.col}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#2e7d4f", margin: "0 0 6px" }}>Rede TAR</div>
          {!net ? <div style={T.card}><div style={T.empty}>Sem rede cadastrada.</div></div> : (<>
            <div style={T.card}>
              <div style={T.cardH}>Visão geral</div>
              <div style={T.kv}><span>Actantes</span><strong>{net.N}</strong></div>
              <div style={T.kv}><span>Associações</span><strong>{net.E}</strong></div>
              <div style={T.kv}><span>Densidade</span><strong>{(net.density * 100).toFixed(1)}%</strong></div>
              <div style={T.kv}><span>Componentes conectados</span><strong>{net.components}</strong></div>
              <div style={T.kv}><span>Actantes isolados</span><strong>{net.isolated}</strong></div>
              <div style={T.kv}><span>Centros de cálculo</span><strong>{net.calc}</strong></div>
            </div>
            <div style={T.card}>
              <div style={T.cardH}>Grau (centralidade) — top 10</div>
              <BarRows color="#3a6ea5" items={net.ranking.slice(0, 10).map((r) => ({ label: r.label, value: r.tot }))} />
            </div>
            <div style={T.card}>
              <div style={T.cardH}>Intermediação (betweenness) — top 10</div>
              <BarRows color="#7a5ea8" items={net.betRanking.slice(0, 10).map((r) => ({ label: r.label, value: r.bet }))} />
            </div>
            <div style={T.card}>
              <div style={T.cardH}>Actantes por tipo</div>
              <BarRows color="#2e7d4f" items={TYPE_ORDER.filter((t) => net.byType[t]).map((t) => ({ label: (NODE_TYPES[t] && NODE_TYPES[t].name) || t, value: net.byType[t] }))} />
            </div>
          </>)}
        </div>

        {/* ---------- Texto ---------- */}
        <div style={T.col}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1f7a8c", margin: "0 0 6px" }}>Texto{txt && txt.name ? ` · ${txt.name}` : ""}</div>
          {!txt ? <div style={T.card}><div style={T.empty}>Sem projeto de texto.</div></div> : (<>
            <div style={T.card}>
              <div style={T.cardH}>Visão geral</div>
              <div style={T.kv}><span>Códigos</span><strong>{txt.codeFreq.length}</strong></div>
              <div style={T.kv}><span>Categorias</span><strong>{txt.catFreq.length}</strong></div>
              <div style={T.kv}><span>Trechos codificados</span><strong>{txt.excerpts}</strong></div>
            </div>
            <div style={T.card}>
              <div style={T.cardH}>Frequência de códigos</div>
              <BarRows color="#1f7a8c" items={txt.codeFreq.slice(0, 14).map((c) => ({ label: c.name, value: c.n, color: c.color }))} />
            </div>
            <div style={T.card}>
              <div style={T.cardH}>Frequência de categorias</div>
              <BarRows color="#b06a1f" items={txt.catFreq.map((c) => ({ label: c.name, value: c.n }))} />
            </div>
            <div style={T.card}>
              <div style={T.cardH}>Co-ocorrência de códigos (top 12)</div>
              {!txt.cooc.length ? <div style={T.empty}>Sem pares de códigos no mesmo trecho.</div> : (
                <BarRows color="#7d2e6e" items={txt.cooc.map((p) => ({
                  label: `${(txt.codeMap[p.a] && txt.codeMap[p.a].name) || "?"} + ${(txt.codeMap[p.b] && txt.codeMap[p.b].name) || "?"}`,
                  value: p.n,
                }))} />
              )}
            </div>
          </>)}
        </div>

      </div>
    </div>
  );
}

export { AnaliseQuantitativa };
