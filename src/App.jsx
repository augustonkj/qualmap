import React, { useState, useRef, useEffect } from "react";
import { SUITE, useModalTrap } from "./lib.js";
import { EditorTAR } from "./EditorTAR.jsx";
import { AnaliseQualitativa } from "./AnaliseQualitativa.jsx";
import { AnaliseQuantitativa } from "./AnaliseQuantitativa.jsx";
import { DiagramaGeral } from "./DiagramaGeral.jsx";

/* ===== Casca: seletor de ferramentas ===== */
const TOURQ = [
  { t: "Bem-vindo ao QualMap", b: "O QualMap reúne quatro janelas: Teoria Ator-Rede, Diagrama, Análise Qualitativa e Análise Quantitativa. Vamos ver cada uma." },
  { t: "Teoria Ator-Rede", b: "Aqui você cadastra os actantes (caixas) e as associações (ligações) da Teoria Ator-Rede em tabelas, com o resumo da rede. Tudo o que você cadastra aparece também no Diagrama TAR.", tool: "tar" },
  { t: "Diagrama", b: "A aba Diagrama tem duas sub-abas: TAR (a rede Ator-Rede, ligada à Teoria Ator-Rede) e Geral (um mapa conceitual livre, independente).", tool: "diag" },
  { t: "Análise Qualitativa", b: "Aqui você analisa texto: o exemplo já traz uma entrevista codificada. Selecione trechos e aplique códigos, agrupe em categorias e escreva o metatexto. O botão ? Ajuda explica o fluxo.", tool: "qual" },
  { t: "Análise Quantitativa", b: "Espaço dedicado aos testes estatísticos, independente das outras abas.", tool: "quant" },
];
export default function App() {
  const [tool, setTool] = useState("tar");
  const [diagSub, setDiagSub] = useState("tar"); // sub-aba do Diagrama: "tar" | "geral"
  const [tourQ, setTourQ] = useState(-1);
  const tabs = [["tar", "Teoria Ator-Rede"], ["diag", "Diagrama"], ["qual", "Análise Qualitativa"], ["quant", "Análise Quantitativa"]];
  const showTar = tool === "tar" || (tool === "diag" && diagSub === "tar");
  const tarView = tool === "tar" ? "analise" : "diagrama";
  const finishTourQ = () => { setTourQ(-1); try { window.localStorage.setItem("qualmap_tour_done", "1"); } catch {} };
  useEffect(() => { try { if (!window.localStorage.getItem("qualmap_tour_done")) setTourQ(0); } catch {} }, []);
  useEffect(() => { if (tourQ < 0) return; const st = TOURQ[tourQ]; if (st && st.tool && tool !== st.tool) setTool(st.tool); }, [tourQ]);
  const miniBtn = { border: "1px solid #cfd6dd", background: "#fff", color: "#46555f", borderRadius: 6, padding: "6px 12px", fontSize: 12.5, cursor: "pointer", fontWeight: 600 };
  const primaryBtn = { border: "none", background: "#1f7a8c", color: "#fff", borderRadius: 6, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", fontWeight: 600 };
  const fileRefAll = useRef(null);
  const tourQRef = useRef(null);
  const [msg, setMsg] = useState("");
  useModalTrap(tourQ >= 0, tourQRef, finishTourQ);
  const salvarTudo = async () => {
    try {
      const tar = SUITE.getTar ? SUITE.getTar() : null;
      const qual = SUITE.getQual ? await SUITE.getQual() : null;
      const geral = SUITE.getGeral ? SUITE.getGeral() : null;
      const payload = { __qualmap: 1, savedAt: new Date().toISOString(), tar, qual, geral };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const u = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = u; a.download = `qualmap-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1500);
      setMsg("projeto do QualMap salvo"); setTimeout(() => setMsg(""), 2500);
    } catch (e) { setMsg("falha ao salvar"); setTimeout(() => setMsg(""), 2500); }
  };
  const abrirTudo = (ev) => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const o = JSON.parse(String(r.result));
        if (!o || !o.__qualmap) { setMsg("este arquivo não é um projeto do QualMap"); setTimeout(() => setMsg(""), 3000); return; }
        if (o.tar && SUITE.setTar) SUITE.setTar(o.tar);
        if (o.qual && SUITE.setQual) await SUITE.setQual(o.qual);
        if (o.geral && SUITE.setGeral) SUITE.setGeral(o.geral);
        setMsg("projeto do QualMap restaurado"); setTimeout(() => setMsg(""), 2500);
      } catch (e) { setMsg("não foi possível abrir o arquivo"); setTimeout(() => setMsg(""), 3000); }
    };
    r.readAsText(f); ev.target.value = "";
  };
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderBottom: "1px solid #e3e9ee", background: "#fff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="6" cy="7" r="3" fill="#1f7a8c" />
            <circle cx="20" cy="6" r="2.4" fill="#7a5ea8" />
            <circle cx="19" cy="19" r="3" fill="#2e7d4f" />
            <circle cx="7" cy="18" r="2.2" fill="#b06a1f" />
            <line x1="6" y1="7" x2="20" y2="6" stroke="#cfd6dd" strokeWidth="1.4" />
            <line x1="6" y1="7" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
            <line x1="20" y1="6" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
            <line x1="7" y1="18" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
            <line x1="6" y1="7" x2="7" y2="18" stroke="#cfd6dd" strokeWidth="1.4" />
          </svg>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontWeight: 800, color: "#1f7a8c", fontSize: 17, letterSpacing: 0.2 }}>QualMap</div>
            <div style={{ fontSize: 10.5, color: "#7a8b99" }}>análise qualitativa e diagramas</div>
          </div>
        </div>
        <div style={{ display: "flex", border: "1px solid #cfd6dd", borderRadius: 6, overflow: "hidden", marginLeft: 6 }}>
          {tabs.map(([v, l]) => (
            <button key={v} onClick={() => setTool(v)} style={{ border: "none", padding: "7px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: tool === v ? "#1f7a8c" : "#fff", color: tool === v ? "#fff" : "#46555f" }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 11.5, color: "#1f7a8c", marginRight: 4 }}>{msg}</span>}
        <button onClick={salvarTudo} style={miniBtn} title="salva o trabalho das duas ferramentas num único arquivo">Salvar QualMap</button>
        <label style={{ ...miniBtn, display: "inline-block" }} title="abrir um projeto do QualMap (.json)">Abrir QualMap<input ref={fileRefAll} type="file" accept=".json,application/json" onChange={abrirTudo} style={{ display: "none" }} /></label>
        <button onClick={() => setTourQ(0)} style={miniBtn} title="abrir o tutorial das duas ferramentas">Tutorial</button>
      </div>
      {tool === "diag" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderBottom: "1px solid #eef1f4", background: "#fafbfc", flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, color: "#7a8b99", fontWeight: 600 }}>Diagrama:</span>
          <div style={{ display: "flex", border: "1px solid #cfd6dd", borderRadius: 6, overflow: "hidden" }}>
            {[["tar", "TAR"], ["geral", "Geral"]].map(([v, l]) => (
              <button key={v} onClick={() => setDiagSub(v)} style={{ border: "none", padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, background: diagSub === v ? "#1f7a8c" : "#fff", color: diagSub === v ? "#fff" : "#5a6b7a" }}>{l}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div style={{ display: showTar ? "block" : "none", height: "100%" }}><EditorTAR active={showTar} viewMode={tarView} setViewMode={(v) => { if (v === "diagrama") { setTool("diag"); setDiagSub("tar"); } else setTool("tar"); }} /></div>
        <div style={{ display: tool === "diag" && diagSub === "geral" ? "block" : "none", height: "100%" }}><DiagramaGeral active={tool === "diag" && diagSub === "geral"} /></div>
        <div style={{ display: tool === "qual" ? "block" : "none", height: "100%" }}><AnaliseQualitativa /></div>
        <div style={{ display: tool === "quant" ? "block" : "none", height: "100%" }}><AnaliseQuantitativa active={tool === "quant"} /></div>
      </div>
      {tourQ >= 0 && TOURQ[tourQ] && (
        <div role="dialog" aria-modal="true" aria-label="Tutorial do QualMap" style={{ position: "fixed", inset: 0, background: "rgba(20,30,38,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1200 }}>
          <div ref={tourQRef} style={{ background: "#fff", borderRadius: 12, maxWidth: 460, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,.3)", padding: "22px 24px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1f7a8c", letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 6 }}>Tutorial do QualMap · {tourQ + 1}/{TOURQ.length}</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#2b3a42" }}>{TOURQ[tourQ].t}</h2>
            <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#46555f", lineHeight: 1.5 }}>{TOURQ[tourQ].b}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {TOURQ.map((_, i) => (<span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === tourQ ? "#1f7a8c" : "#cfd6dd" }} />))}
              <div style={{ flex: 1 }} />
              <button onClick={finishTourQ} style={miniBtn}>Pular</button>
              {tourQ > 0 && <button onClick={() => setTourQ(tourQ - 1)} style={miniBtn}>Anterior</button>}
              {tourQ < TOURQ.length - 1 ? <button onClick={() => setTourQ(tourQ + 1)} style={primaryBtn}>Próximo</button> : <button onClick={finishTourQ} style={primaryBtn}>Começar</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
