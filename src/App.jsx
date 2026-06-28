import React, { useState, useRef, useEffect } from "react";
import { SUITE, useModalTrap, Menu, MenuItem } from "./lib.js";
import { EditorTAR } from "./EditorTAR.jsx";
import { AnaliseQualitativa } from "./AnaliseQualitativa.jsx";
import { AnaliseQuantitativa } from "./AnaliseQuantitativa.jsx";
import { DiagramaGeral } from "./DiagramaGeral.jsx";

/* ===== Casca: seletor de ferramentas ===== */
const TOURQ = [
  { t: "Bem-vindo ao QualMap", b: "O QualMap reúne quatro janelas: Teoria Ator-Rede, Diagrama, Análise Qualitativa e Análise Quantitativa. Tudo começa em branco; cada janela tem um botão Exemplo (no menu Projeto) se você quiser ver um modelo pronto." },
  { t: "Teoria Ator-Rede", b: "Aqui você cadastra os actantes (caixas) e as associações (ligações) da Teoria Ator-Rede em tabelas, com o resumo da rede. Tudo o que você cadastra aparece também no Diagrama TAR.", tool: "tar" },
  { t: "Diagrama", b: "A aba Diagrama tem duas sub-abas: TAR (a rede Ator-Rede, ligada à Teoria Ator-Rede) e Geral (um mapa conceitual livre, independente).", tool: "diag" },
  { t: "Análise Qualitativa", b: "Aqui você analisa texto: cole ou abra um texto, selecione trechos e aplique códigos, agrupe em categorias e escreva o metatexto. Começa em branco — use o botão Exemplo se quiser ver um projeto já codificado. O botão ? Ajuda explica o fluxo.", tool: "qual" },
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
  const aboutRef = useRef(null);
  const [showAbout, setShowAbout] = useState(false);
  const [msg, setMsg] = useState("");
  useModalTrap(tourQ >= 0, tourQRef, finishTourQ);
  useModalTrap(showAbout, aboutRef, () => setShowAbout(false));
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
            <div style={{ fontSize: 10.5, color: "#7a8b99" }}>análise quanti-quali e diagramas</div>
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
        <Menu label="Arquivo" align="right" width={210} btnStyle={miniBtn} title="salvar/abrir o QualMap inteiro e tutorial">
          {(close) => (<>
            <MenuItem onClick={() => { salvarTudo(); close(); }}>Salvar QualMap…</MenuItem>
            <MenuItem onClick={() => { fileRefAll.current?.click(); close(); }}>Abrir QualMap…</MenuItem>
            <MenuItem onClick={() => { setTourQ(0); close(); }}>Tutorial</MenuItem>
          </>)}
        </Menu>
        <input ref={fileRefAll} type="file" accept=".json,application/json" onChange={abrirTudo} style={{ display: "none" }} />
        <button onClick={() => setShowAbout(true)} style={miniBtn} title="sobre o QualMap">Sobre</button>
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
      {showAbout && (
        <div role="dialog" aria-modal="true" aria-label="Sobre o QualMap" onClick={() => setShowAbout(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,30,38,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1300 }}>
          <div ref={aboutRef} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, maxWidth: 560, width: "100%", maxHeight: "86vh", overflow: "auto", boxShadow: "0 12px 40px rgba(0,0,0,.3)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <svg width="42" height="42" viewBox="0 0 26 26" aria-hidden="true">
                <line x1="6" y1="7" x2="20" y2="6" stroke="#cfd6dd" strokeWidth="1.4" />
                <line x1="6" y1="7" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
                <line x1="20" y1="6" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
                <line x1="7" y1="18" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
                <line x1="6" y1="7" x2="7" y2="18" stroke="#cfd6dd" strokeWidth="1.4" />
                <circle cx="6" cy="7" r="3" fill="#1f7a8c" />
                <circle cx="20" cy="6" r="2.4" fill="#7a5ea8" />
                <circle cx="19" cy="19" r="3" fill="#2e7d4f" />
                <circle cx="7" cy="18" r="2.2" fill="#b06a1f" />
              </svg>
              <div>
                <div style={{ fontWeight: 800, color: "#1f7a8c", fontSize: 22, letterSpacing: 0.2 }}>QualMap</div>
                <div style={{ fontSize: 12, color: "#7a8b99" }}>análise quanti-quali e diagramas · versão 9</div>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowAbout(false)} aria-label="Fechar" style={{ ...miniBtn, padding: "4px 10px", lineHeight: 1 }}>✕</button>
            </div>

            <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "#1f7a8c", textTransform: "uppercase", letterSpacing: ".5px" }}>Sobre o software</h3>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "#46555f", lineHeight: 1.6 }}>
              O QualMap é um ambiente para pesquisa qualitativa e quantitativa que reúne quatro janelas integradas. A <strong>Teoria Ator-Rede</strong> e o <strong>Diagrama</strong> permitem cadastrar e desenhar redes inspiradas na Teoria Ator-Rede (Latour, Callon, Law) — momentos da tradução, pontos de passagem obrigatória, caixas-pretas, porta-vozes, mediadores e intermediários, além de métricas de rede como grau e intermediação — e também um mapa conceitual livre.
            </p>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "#46555f", lineHeight: 1.6 }}>
              A <strong>Análise Qualitativa</strong> apoia a codificação de entrevistas e documentos: seleção de trechos, aplicação e agrupamento de códigos em categorias e redação do metatexto. A <strong>Análise Quantitativa</strong> oferece testes estatísticos (descritivas, t, ANOVA, correlação, qui-quadrado e não-paramétricos). Tudo funciona totalmente offline — no navegador ou como aplicativo de desktop — e o trabalho pode ser salvo e compartilhado num único arquivo.
            </p>

            <h3 style={{ margin: "18px 0 8px", fontSize: 13, color: "#1f7a8c", textTransform: "uppercase", letterSpacing: ".5px" }}>Desenvolvedores</h3>
            {[
              {
                nome: "Antonio Augusto Ignacio",
                formacao: [
                  "Bacharelado em Química (2023)",
                  "Licenciatura em Ciências Biológicas (2025)",
                  "Licenciatura em Matemática (2026)",
                  "Licenciatura em Pedagogia (2026)",
                  "Mestrado em Ciências Ambientais (UTFPR, 2026)",
                  "Doutorando em Educação em Ciências e Educação Matemática (UNIOESTE)",
                ],
                resumo: "Atua principalmente nas áreas relacionadas ao ensino de matemática e ciências, com experiência em modelagem matemática, engenharia química e análise, desenvolvimento e validação de softwares. É autor de softwares científicos como PDESolver, Pyisotherm, DRMSimulator e HexapodaID.",
              },
              {
                nome: "Evandro Alves Nakajima",
                formacao: [
                  "Graduação em Matemática (UEM, 2010)",
                  "Mestrado em Matemática (USP, 2013)",
                  "Doutorado em Engenharia Química (UNIOESTE, 2023)",
                  "Professor Adjunto da UTFPR, Campus Santa Helena",
                ],
                resumo: "Atua nas áreas de Matemática Aplicada e Engenharia Química, com ênfase em modelagem matemática, métodos numéricos e simulação de processos. Suas pesquisas abrangem simulação de adsorção em leito fixo, reforma a seco do metano, otimização e redes neurais, além do ensino de matemática e ciências. É autor de softwares científicos como PDESolver, Pyisotherm, DRMSimulator e HexapodaID.",
              },
            ].map((d, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #f0f4f7" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2b3a42", marginBottom: 4 }}>{d.nome}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9aa7b1", textTransform: "uppercase", letterSpacing: ".5px", margin: "6px 0 3px" }}>Formação</div>
                <ul style={{ margin: "0 0 4px", paddingLeft: 18 }}>
                  {d.formacao.map((f, j) => (<li key={j} style={{ fontSize: 12.5, color: "#46555f", lineHeight: 1.5 }}>{f}</li>))}
                </ul>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9aa7b1", textTransform: "uppercase", letterSpacing: ".5px", margin: "8px 0 3px" }}>Resumo</div>
                <p style={{ margin: 0, fontSize: 12.5, color: "#46555f", lineHeight: 1.6, textAlign: "justify" }}>{d.resumo}</p>
              </div>
            ))}

            <div style={{ borderTop: "1px solid #eef2f5", marginTop: 18, paddingTop: 12, fontSize: 11.5, color: "#7a8b99", lineHeight: 1.6 }}>
              © 2026 QualMap. Software livre para uso acadêmico e educacional.
            </div>

            <div style={{ display: "flex", marginTop: 16 }}>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowAbout(false)} style={primaryBtn}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
