import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";


/* ============================================================
   Editor de diagramas Ator-Rede - v5
   Novidades sobre a v4:
   - momentos da tradução (Callon) por cor + playback por etapas
   - força das associações (tamanho do nó por grau, espessura por laços)
   - caixa-preta dobrável (pontualização: agrupa/desdobra)
   - porta-voz (relação de representação)
   - arestas curvas e paralelas (múltiplos laços entre dois actantes)
   - regiões / loci (arquipélagos) com rótulo
   - desfazer/refazer, zoom/pan, quebra de texto automática
   - importar CSV (lista de arestas), exportar GraphML/GEXF
   - layout orgânico (force-directed) além de rede/vertical/horizontal
   ============================================================ */

let VW = 900, VH = 540;
const SNAP_T = 6;
function setDims(w, h) { VW = w || 900; VH = h || 540; }
const SUITE = {};
function useModalTrap(isOpen, ref, onClose) {
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const node = ref.current;
    const prev = (typeof document !== "undefined") ? document.activeElement : null;
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const list = () => Array.prototype.slice.call(node.querySelectorAll(sel)).filter((el) => !el.disabled);
    const f0 = list()[0];
    try { (f0 && f0.focus) ? f0.focus() : (node.focus && node.focus()); } catch (e) {}
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose && onClose(); return; }
      if (e.key !== "Tab") return;
      const f = list(); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey) { if (i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } }
      else { if (i === f.length - 1 || i === -1) { e.preventDefault(); f[0].focus(); } }
    };
    node.addEventListener("keydown", onKey);
    return () => { node.removeEventListener("keydown", onKey); try { prev && prev.focus && prev.focus(); } catch (e) {} };
  }, [isOpen]);
}
const C = {
  ink: "#34495e", text: "#2b3a48", mediador: "#c7d8e6", silencStroke: "#7a8b99",
  edge: "#4a5d6c", edgeDashed: "#8a99a6", line: "#d0d7de", caption: "#6b7c8a",
  legend: "#5a6b7a", sel: "#1f7a8c", oppFill: "#9bc1d8", oppStroke: "#2f516a",
  blackbox: "#3a4a57", blackboxStroke: "#27333d", mark: "#5a6b7a",
  grid: "#e6ebf0", guide: "#e07a3c", band: "#1f7a8c", pv: "#7a5ea8",
  programa: "#2e7d4f", antiprograma: "#b3402f",
  estab: "#2f7d6f", prova: "#b06a1f", deleg: "#8a6d3b", ref: "#4a5a8a", calc: "#7d2e6e", fonte: "#5a6b8a",
};
const NODE_TYPES = {
  mediador: { name: "Mediador", fill: C.mediador, stroke: C.ink, dash: false, text: C.text, shape: "rect" },
  intermediario: { name: "Intermediário", fill: "#ffffff", stroke: C.ink, dash: false, text: C.text, shape: "rect" },
  silenciado: { name: "Silenciado", fill: "#ffffff", stroke: C.silencStroke, dash: true, text: C.text, shape: "rect" },
  opp: { name: "Passagem obrigatória (OPP)", fill: C.oppFill, stroke: C.oppStroke, dash: false, text: C.text, shape: "hex" },
  caixapreta: { name: "Caixa-preta", fill: C.blackbox, stroke: C.blackboxStroke, dash: false, text: "#ffffff", shape: "stack" },
  quaseobjeto: { name: "Quase-objeto / token", fill: "#ffffff", stroke: C.ink, dash: false, text: C.text, shape: "pill" },
};
const TYPE_ORDER = ["mediador", "intermediario", "silenciado", "opp", "caixapreta", "quaseobjeto"];
const MOMENTS = {
  problematizacao: { name: "problematização", color: "#c0563f" },
  interessamento: { name: "interessamento", color: "#c98a2b" },
  alistamento: { name: "alistamento", color: "#3f7d54" },
  mobilizacao: { name: "mobilização", color: "#3a6ea5" },
};
const MOMENT_ORDER = ["problematizacao", "interessamento", "alistamento", "mobilizacao"];
const NAT_LBL = { humano: "humano", nao: "não-humano", indef: "indefinido" };
const ESTAB_LBL = { estab: "estabilizado", prova: "em prova" };
const KIND_LBL = { associacao: "associação", "porta-voz": "porta-voz", delegacao: "delegação", referencia: "cadeia de referência" };
function brandes(ids, adj) {
  const CB = {}; ids.forEach((v) => (CB[v] = 0));
  for (const s of ids) {
    const S = [], P = {}, sigma = {}, dist = {};
    ids.forEach((v) => { P[v] = []; sigma[v] = 0; dist[v] = -1; });
    sigma[s] = 1; dist[s] = 0;
    const Q = [s];
    while (Q.length) {
      const v = Q.shift(); S.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) { dist[w] = dist[v] + 1; Q.push(w); }
        if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; P[w].push(v); }
      }
    }
    const delta = {}; ids.forEach((v) => (delta[v] = 0));
    while (S.length) {
      const w = S.pop();
      for (const v of P[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) CB[w] += delta[w];
    }
  }
  ids.forEach((v) => (CB[v] /= 2));
  return CB;
}
function parseCSVfull(text) {
  const rows = []; let i = 0, field = "", row = [], inQ = false;
  const pushF = () => { row.push(field); field = ""; };
  const pushR = () => { pushF(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',' || c === ';' || c === '\t') { pushF(); i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { pushR(); i++; continue; }
      field += c; i++; continue;
    }
  }
  if (field.length || row.length) pushR();
  return rows.filter((r) => r.length && !(r.length === 1 && r[0].trim() === ""));
}
const csvNorm = (s) => String(s == null ? "" : s).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const colIdx = (headers, aliases) => { const H = headers.map(csvNorm); for (const a of aliases) { const k = H.indexOf(csvNorm(a)); if (k >= 0) return k; } return -1; };
const HELP = [
  { h: "O que é", items: ["Software para criar diagramas da Teoria Ator-Rede (TAR, de Bruno Latour) e fazer análise quantitativa da rede. Há duas abas no topo: Análise (tabelas e métricas) e Diagrama (desenho). As duas compartilham os mesmos dados: o que você cadastra numa aparece na outra."] },
  { h: "Aba Diagrama — inserir e ligar", items: [
    ["Inserir", "na seção Inserir (painel direito), clique num tipo para adicionar a caixa; ela já fica selecionada para você renomear no inspetor."],
    ["Ligar nós", "clique em \u201cLigar nós\u201d, depois no nó de origem e no de destino. Antes, escolha sólida/tracejada e com/sem seta. Esc cancela."],
    ["Rede automática", "Organizar em rede (force-directed), Círculo, Camadas ou Preencher acomodam tudo sozinho."],
    ["Mover e selecionar", "arraste para mover; clique para selecionar; shift-clique ou laço para vários; duplo-clique no fundo cria um nó."],
  ] },
  { h: "Tipos de caixa (actantes)", items: [
    ["Mediador", "transforma o que passa por ele; produz diferença."],
    ["Intermediário", "apenas transmite, sem transformar."],
    ["Actante silenciado", "estava invisível e a TAR reabre (caixa tracejada)."],
    ["Ponto de passagem obrigatório (OPP)", "todos precisam passar por ele."],
    ["Caixa-preta", "rede já estabilizada que virou um ponto único; pode ser dobrada/desdobrada."],
    ["Quase-objeto", "token que circula (forma de cápsula)."],
  ] },
  { h: "Relações entre actantes", items: [
    ["Associação", "ligação simples (sólida ou tracejada)."],
    ["Porta-voz", "um actante fala por outros (representação)."],
    ["Delegação / inscrição", "ação inscrita num objeto."],
    ["Cadeia de referência", "transformação do mundo ao texto; cada elo ganha e perde algo (losango no meio)."],
    ["Seta", "indica a direção da ação (quem age sobre quem)."],
  ] },
  { h: "Marcadores do nó", items: [
    ["Natureza", "humano ou não-humano. A simetria generalizada trata os dois como actantes que agem."],
    ["Prova de força", "estabilizado (resistiu às provas) ou em prova (em disputa)."],
    ["Centro de cálculo", "acumula móveis imutáveis e age à distância (anel ao redor da caixa)."],
  ] },
  { h: "Momentos da tradução e etapas", items: [
    "Cada associação pode receber um momento de Callon: problematização, interessamento, alistamento ou mobilização (cores na legenda).",
    ["Etapas", "numere nós e arestas por etapa e use o controle Etapa na barra para revelar a rede passo a passo."],
  ] },
  { h: "Programa, antiprograma e fontes", items: [
    ["Programa/antiprograma", "marque uma associação como programa (favorece) ou antiprograma (resiste/bloqueia, com barra)."],
    ["Notas de fonte", "cada associação pode citar de onde veio: entrevista (E), documento (D), observação (O) ou outro. Mostra um círculo com a letra."],
  ] },
  { h: "Organizar e ajustar", items: [
    ["Desafogar", "afasta só o que está sobreposto, com movimento mínimo."],
    ["Preencher", "desafoga, centraliza e amplia para ocupar a tela."],
    ["Caber tudo", "cresce a tela até tudo caber."],
    ["Alça \u25e2", "no canto inferior direito redimensiona a área."],
    ["Grade / Aderir / Guias", "ajudam no alinhamento."],
  ] },
  { h: "Texto, legenda e relatos", items: [
    ["Fontes e espaçamento", "tamanho independente para títulos, caixas, rótulos, legenda e subtítulos; entrelinha das caixas com mais de uma linha."],
    ["Figura", "dois painéis, títulos, subtítulos e os textos da legenda são editáveis."],
    ["Relatos da mesma rede", "salve versões alternativas do mesmo conjunto de actantes; nenhuma é privilegiada. Alterne e atualize; viajam junto no arquivo do projeto."],
  ] },
  { h: "Aba Análise — cadastro", items: [
    ["Tabelas", "cadastre actantes (rótulo, tipo, natureza, estabilização, centro de cálculo) e associações (origem, destino, relação, momento, frente, fonte, seta). Tudo alimenta o diagrama."],
    ["Filtros e busca", "busque por rótulo e filtre por tipo, natureza, relação ou momento."],
  ] },
  { h: "Aba Análise — métricas", items: [
    ["Resumo", "contagens por categoria, densidade, centros de cálculo e status de simetria."],
    ["Grau (centralidade)", "quantas conexões cada actante tem; saída = age, entrada = é mobilizado."],
    ["Intermediação (betweenness)", "quem faz a ponte entre grupos da rede."],
    ["Estrutura", "componentes conectados e actantes isolados."],
    ["Gráficos", "barras por tipo, natureza, momentos, centralidade e intermediação."],
  ] },
  { h: "Exportar, importar e relatório", items: [
    ["CSV", "Actantes, Associações e Resumo para planilha ou estatística."],
    ["Importar planilha", "cole ou carregue CSV para preencher as tabelas de uma vez (mesmo formato do export)."],
    ["Relatório (PDF)", "abre uma página com a figura + resumo + gráficos + tabela, pronta para imprimir ou salvar em PDF."],
  ] },
  { h: "Salvar e compartilhar", items: [
    ["Salvar / Abrir projeto", "arquivo .json com tudo (actantes, categorias, associações, relatos). É o que você guarda e compartilha para continuar editando."],
    ["Autosave", "salva sozinho no navegador; ao reabrir, use \u201cContinuar de onde parei\u201d. \u201cDescartar salvo\u201d limpa esse autosave."],
    ["SVG / PNG", "a figura para publicar."],
    ["GraphML / GEXF", "para Gephi e outros softwares de rede."],
  ] },
  { h: "Atalhos", items: ["Ctrl+Z desfaz · Ctrl+Shift+Z refaz · Delete remove o selecionado · Alt+arrastar = mover a tela · zoom pelos botões ＋ / － · Esc fecha esta ajuda."] },
];
const TOUR = [
  { t: "Bem-vindo", b: "Este software cria diagramas da Teoria Ator-Rede (Latour) e faz a análise quantitativa da rede. Vamos ver o básico em alguns passos." },
  { t: "Duas abas", b: "Aqui você alterna entre Análise (tabelas e métricas) e Diagrama (o desenho). As duas trabalham sobre os mesmos dados.", target: "tour-tabs" },
  { t: "Inserir e ligar", b: "Na seção Inserir, clique num tipo (mediador, intermediário, OPP…) para criar a caixa, use \u201cLigar nós\u201d para conectar e \u201cOrganizar em rede\u201d para acomodar tudo.", view: "diagrama", target: "tour-ins" },
  { t: "Categorizar", b: "Na aba Análise você cadastra e categoriza os actantes (tipo, natureza, estabilização) e as associações em tabelas. Tudo alimenta o diagrama.", view: "analise", target: "tour-analise" },
  { t: "Análise quantitativa", b: "Aqui também ficam o resumo, o grau (centralidade), a intermediação, os componentes e os gráficos. Dá para exportar CSV e gerar um relatório em PDF.", view: "analise", target: "tour-analise" },
  { t: "Salvar", b: "O trabalho é salvo sozinho no navegador. Para guardar fora ou compartilhar, use \u201cSalvar projeto\u201d (.json). O botão ? Ajuda abre o guia completo a qualquer hora.", target: "tour-save" },
];
function Hint({ text }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const place = () => {
    const el = ref.current; if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const w = Math.min(260, (window.innerWidth || 360) - 16);
    let left = Math.max(8, Math.min((window.innerWidth || 360) - w - 8, r.left + r.width / 2 - w / 2));
    const approxH = 26 + Math.ceil(text.length / 30) * 17;
    let top = r.bottom + 8;
    if (top + approxH > (window.innerHeight || 9999)) top = Math.max(8, r.top - approxH - 6);
    setPos({ left, top, w });
  };
  const openIt = () => { place(); setOpen(true); };
  return (
    <span ref={ref} onMouseEnter={openIt} onMouseLeave={() => setOpen(false)} onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openIt(); }}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "#cfe0e8", color: "#3f5560", fontSize: 10, fontWeight: 700, marginLeft: 6, cursor: "help", verticalAlign: "middle", userSelect: "none" }}>
      ?
      {open && pos && (
        <span onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.w, zIndex: 5000, background: "#2b3a42", color: "#fff", fontSize: 11.5, lineHeight: 1.45, fontWeight: 400, padding: "8px 10px", borderRadius: 6, boxShadow: "0 8px 22px rgba(0,0,0,.32)", textTransform: "none", letterSpacing: 0, whiteSpace: "normal", textAlign: "left" }}>{text}</span>
      )}
    </span>
  );
}
const REGION_COLORS = ["#3a6ea5", "#3f7d54", "#c98a2b", "#7a5ea8", "#c0563f"];

/* contexto de medição (força + largura máx). Atualizado antes de medir. */
let SIZE_CTX = { force: false, degree: {}, maxW: 170, fontNo: 1, lineSpace: 1.25 };

/* ---------- texto ---------- */
function wrapText(label, maxChars) {
  const paras = String(label ?? " ").split("\n");
  const lines = [];
  for (const para of paras) {
    const words = para.split(/\s+/);
    let cur = "";
    for (const w of words) {
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= maxChars) cur += " " + w;
      else { lines.push(cur); cur = w; }
    }
    lines.push(cur);
  }
  return lines.length ? lines : [" "];
}
function sizeOf(n) {
  const fs = (n.emph ? 13.5 : 12.5) * (SIZE_CTX.fontNo || 1), cw = fs * 0.62;
  const maxChars = Math.max(8, Math.round(SIZE_CTX.maxW / cw));
  const lines = wrapText(n.label, maxChars);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  let w = Math.max(72, Math.round(longest * cw) + 30);
  const baseLh = fs * 1.3;
  const lh = lines.length > 1 ? baseLh * (SIZE_CTX.lineSpace || 1) : baseLh;
  let h = Math.max(Math.round(fs * 2.3 + 8), Math.round(lines.length * lh + 14));
  if (n.type === "opp") w += 18;
  if (SIZE_CTX.force) {
    const deg = SIZE_CTX.degree[n.id] || 0;
    const f = 1 + Math.min(0.6, deg * 0.07);
    w = Math.round(w * f); h = Math.round(h * f);
  }
  return { w, h, fs, lh, lines };
}
function degreeMap(nodes, edges) {
  const d = {};
  nodes.forEach((n) => (d[n.id] = 0));
  edges.forEach((e) => { if (d[e.from] != null) d[e.from]++; if (d[e.to] != null) d[e.to]++; });
  return d;
}

/* ---------- geometria ---------- */
function clipToRect(n, tx, ty) {
  const { w, h } = sizeOf(n);
  let dx = tx - n.x, dy = ty - n.y;
  if (dx === 0 && dy === 0) return { x: n.x, y: n.y };
  const s = 1 / Math.max(Math.abs(dx) / (w / 2), Math.abs(dy) / (h / 2));
  return { x: n.x + dx * s, y: n.y + dy * s };
}
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function qPoint(p1, ctrl, p2, t) {
  const u = 1 - t;
  return { x: u * u * p1.x + 2 * u * t * ctrl.x + t * t * p2.x, y: u * u * p1.y + 2 * u * t * ctrl.y + t * t * p2.y };
}
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function approxW(t, fs) { return String(t).length * fs * 0.55; }

/* geometria de uma aresta (com curvatura para paralelas) */
function edgeGeometry(e, byId, pairMap) {
  const a = byId(e.from), b = byId(e.to);
  if (!a || !b) return null;
  const key = [e.from, e.to].sort().join("|");
  const arr = pairMap[key] || [e.id];
  const total = arr.length, index = Math.max(0, arr.indexOf(e.id));
  let off = e.curve != null ? e.curve : (total > 1 ? (index - (total - 1) / 2) * 20 : 0);
  const p1 = clipToRect(a, b.x, b.y), p2 = clipToRect(b, a.x, a.y);
  if (!off) return { p1, p2, ctrl: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, curved: false };
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  let nx = -(p2.y - p1.y), ny = p2.x - p1.x;
  const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
  const ctrl = { x: mx + nx * off, y: my + ny * off };
  // reclipa nas bordas em direção ao controle
  const s1 = clipToRect(a, ctrl.x, ctrl.y), s2 = clipToRect(b, ctrl.x, ctrl.y);
  return { p1: s1, p2: s2, ctrl, curved: true };
}
function arrowHead(x, y, dx, dy, color, hollow, size) {
  const L = Math.hypot(dx, dy) || 1; const ux = dx / L, uy = dy / L;
  const bx = x - ux * size, by = y - uy * size;
  const px = -uy, py = ux, s = size * 0.5;
  const fill = hollow ? "#ffffff" : color;
  return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${(bx + px * s).toFixed(1)},${(by + py * s).toFixed(1)} ${(bx - px * s).toFixed(1)},${(by - py * s).toFixed(1)}" fill="${fill}" stroke="${color}" stroke-width="1"/>`;
}
function barrierBar(x, y, dx, dy, color, size) {
  const L = Math.hypot(dx, dy) || 1; const ux = dx / L, uy = dy / L;
  const px = -uy, py = ux, bx = x - ux * 2, by = y - uy * 2;
  return `<line x1="${(bx + px * size).toFixed(1)}" y1="${(by + py * size).toFixed(1)}" x2="${(bx - px * size).toFixed(1)}" y2="${(by - py * size).toFixed(1)}" stroke="${color}" stroke-width="2.6"/>`;
}
function estabBadge(cx, cy, kind) {
  if (kind === "estab") {
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="${C.estab}"/><path d="M${(cx - 2.4).toFixed(1)},${cy.toFixed(1)} L${(cx - 0.6).toFixed(1)},${(cy + 2).toFixed(1)} L${(cx + 2.6).toFixed(1)},${(cy - 2.2).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<polygon points="${cx.toFixed(1)},${(cy - 5).toFixed(1)} ${(cx + 4.6).toFixed(1)},${(cy + 3.6).toFixed(1)} ${(cx - 4.6).toFixed(1)},${(cy + 3.6).toFixed(1)}" fill="#ffffff" stroke="${C.prova}" stroke-width="1.3" stroke-linejoin="round"/><line x1="${cx.toFixed(1)}" y1="${(cy - 1.4).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(cy + 1.2).toFixed(1)}" stroke="${C.prova}" stroke-width="1.2"/>`;
}
function scriptGlyph(x, y, color) {
  const w = 9, h = 11, lx = x - w / 2, ty = y - h / 2;
  return `<rect x="${lx.toFixed(1)}" y="${ty.toFixed(1)}" width="${w}" height="${h}" rx="1.5" fill="#ffffff" stroke="${color}" stroke-width="1.1"/>` +
    `<line x1="${(lx + 2).toFixed(1)}" y1="${(ty + 3).toFixed(1)}" x2="${(lx + w - 2).toFixed(1)}" y2="${(ty + 3).toFixed(1)}" stroke="${color}" stroke-width="0.9"/>` +
    `<line x1="${(lx + 2).toFixed(1)}" y1="${(ty + 5.5).toFixed(1)}" x2="${(lx + w - 2).toFixed(1)}" y2="${(ty + 5.5).toFixed(1)}" stroke="${color}" stroke-width="0.9"/>` +
    `<line x1="${(lx + 2).toFixed(1)}" y1="${(ty + 8).toFixed(1)}" x2="${(lx + w - 3).toFixed(1)}" y2="${(ty + 8).toFixed(1)}" stroke="${color}" stroke-width="0.9"/>`;
}
function calcGlyph(x, y, color) {
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="8" height="6" rx="1" fill="#ffffff" stroke="${color}" stroke-width="1"/>` +
    `<rect x="${(x + 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" width="8" height="6" rx="1" fill="#ffffff" stroke="${color}" stroke-width="1"/>` +
    `<rect x="${(x + 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="8" height="6" rx="1" fill="#ffffff" stroke="${color}" stroke-width="1"/>`;
}
function sourceLetter(t) { return t === "entrevista" ? "E" : t === "documento" ? "D" : t === "observacao" ? "O" : "\u00b7"; }
function sourceMark(x, y, t) {
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#ffffff" stroke="${C.fonte}" stroke-width="1.1"/>` +
    `<text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="7.6" font-weight="bold" fill="${C.fonte}">${sourceLetter(t)}</text>`;
}

function nodeBody(n, stroke, sw, dashAttr) {
  const meta = NODE_TYPES[n.type] || NODE_TYPES.intermediario;
  const { w, h } = sizeOf(n);
  const x = n.x - w / 2, y = n.y - h / 2, p = [];
  if (meta.shape === "hex") {
    const cut = Math.min(20, w * 0.18);
    const pts = [[x, n.y], [x + cut, y], [x + w - cut, y], [x + w, n.y], [x + w - cut, y + h], [x + cut, y + h]]
      .map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ");
    p.push(`<polygon points="${pts}" fill="${meta.fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`);
  } else if (meta.shape === "pill") {
    p.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" rx="${h / 2}" fill="${meta.fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`);
  } else if (meta.shape === "stack") {
    p.push(`<rect x="${(x + 6).toFixed(1)}" y="${(y + 6).toFixed(1)}" width="${w}" height="${h}" rx="4" fill="none" stroke="${meta.stroke}" stroke-width="1"/>`);
    p.push(`<rect x="${(x + 3).toFixed(1)}" y="${(y + 3).toFixed(1)}" width="${w}" height="${h}" rx="4" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1" opacity="0.55"/>`);
    p.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" rx="4" fill="${meta.fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`);
  } else {
    p.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" rx="4" fill="${meta.fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`);
  }
  return p.join("");
}

/* ---------- desenho ---------- */
function buildInner(state, opts = {}) {
  setDims(state.W, state.H);
  const { titles, subs, legend, twoPanel, showLegend, regions = [], showNature = true } = state;
  const showSources = state.showSources !== false;
  const { selNodes, selEdge, selRegion, connectFrom, interactive, grid, guides, band, force } = opts;
  const stepLim = opts.step == null ? Infinity : opts.step;
  const vis = (el) => el.step == null || el.step <= stepLim;
  const allNodes = state.nodes.filter(vis);
  const visIds = new Set(allNodes.map((n) => n.id));
  const nodes = allNodes;
  const edges = state.edges.filter((e) => vis(e) && visIds.has(e.from) && visIds.has(e.to));

  const F = state.fonts || {};
  const fT = F.titulo || 1, fN = F.no || 1, fA = F.aresta || 1, fL = F.legenda || 1, fS = F.sub || 1;
  SIZE_CTX = { force: !!force, degree: degreeMap(nodes, edges), maxW: state.maxW || 170, fontNo: fN, lineSpace: F.entrelinha != null ? F.entrelinha : 1.25 };

  const selSet = new Set(selNodes || []);
  const byId = (id) => nodes.find((n) => n.id === id);
  const out = [];
  out.push(`<rect x="0" y="0" width="${VW}" height="${VH}" fill="#ffffff"/>`);

  if (interactive && grid && grid.show) {
    const g = grid.size, L = [];
    for (let x = 0; x <= VW; x += g) L.push(`<line x1="${x}" y1="0" x2="${x}" y2="${VH}" stroke="${C.grid}" stroke-width="1"/>`);
    for (let y = 0; y <= VH; y += g) L.push(`<line x1="0" y1="${y}" x2="${VW}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`);
    out.push(L.join(""));
  }

  // regiões (atrás de tudo)
  for (const r of regions) {
    const ms = (r.nodeIds || []).map(byId).filter(Boolean);
    if (!ms.length) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of ms) { const { w, h } = sizeOf(n); minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w / 2); minY = Math.min(minY, n.y - h / 2); maxY = Math.max(maxY, n.y + h / 2); }
    const pad = 18, col = r.color || REGION_COLORS[0];
    const isSel = interactive && selRegion === r.id;
    out.push(`<rect x="${(minX - pad).toFixed(1)}" y="${(minY - pad).toFixed(1)}" width="${(maxX - minX + 2 * pad).toFixed(1)}" height="${(maxY - minY + 2 * pad).toFixed(1)}" rx="14" fill="${col}" fill-opacity="0.10" stroke="${col}" stroke-opacity="${isSel ? 0.9 : 0.5}" stroke-width="${isSel ? 2 : 1.3}" stroke-dasharray="6 4"/>`);
    if (r.label) out.push(`<text x="${(minX - pad + 8).toFixed(1)}" y="${(minY - pad + 16).toFixed(1)}" font-family="Helvetica,Arial,sans-serif" font-size="11" font-weight="bold" fill="${col}">${esc(r.label)}</text>`);
  }

  const used = new Set(nodes.map((n) => n.type));
  const entries = [];
  TYPE_ORDER.forEach((t) => { if (used.has(t)) entries.push({ g: "node", t, label: legend[t] }); });
  if (edges.some((e) => (e.style || "solida") === "solida" && !e.moment && e.kind !== "porta-voz")) entries.push({ g: "edge", t: "solida", label: legend.solida });
  if (edges.some((e) => e.style === "tracejada" && !e.moment && e.kind !== "porta-voz")) entries.push({ g: "edge", t: "tracejada", label: legend.tracejada });
  MOMENT_ORDER.forEach((m) => { if (edges.some((e) => e.moment === m)) entries.push({ g: "moment", t: m, label: MOMENTS[m].name }); });
  if (edges.some((e) => e.kind === "porta-voz")) entries.push({ g: "pv", t: "pv", label: legend.portavoz });
  if (edges.some((e) => e.kind === "delegacao")) entries.push({ g: "deleg", t: "deleg", label: legend.delegacao || "delegação / inscrição" });
  if (edges.some((e) => e.kind === "referencia")) entries.push({ g: "ref", t: "ref", label: legend.referencia || "cadeia de referência" });
  if (edges.some((e) => e.front === "programa")) entries.push({ g: "front", t: "programa", label: legend.programa || "associação do programa de ação" });
  if (edges.some((e) => e.front === "antiprograma")) entries.push({ g: "front", t: "antiprograma", label: legend.antiprograma || "associação do antiprograma (resistência)" });
  if (nodes.some((n) => n.estab === "estab")) entries.push({ g: "estab", t: "estab", label: legend.estabilizado || "actante estabilizado" });
  if (nodes.some((n) => n.estab === "prova")) entries.push({ g: "estab", t: "prova", label: legend.prova || "actante em prova de força" });
  if (nodes.some((n) => n.calc)) entries.push({ g: "calc", t: "calc", label: legend.calc || "centro de cálculo" });
  if (showSources && edges.some((e) => e.fonteTipo || e.fonte)) entries.push({ g: "fonte", t: "fonte", label: legend.fonte || "nota de fonte: E entrevista, D documento, O observação" });
  if (showNature && nodes.some((n) => n.nat === "humano")) entries.push({ g: "mark", t: "humano", label: legend.humano });
  if (showNature && nodes.some((n) => n.nat === "nao")) entries.push({ g: "mark", t: "nao", label: legend.nao });

  // legenda em colunas alinhadas (compacta, justificada por colunas)
  const usable = VW - 48, gapL = 24, maxCols = 5;
  const natW = entries.map((e) => 28 + String(e.label).length * 5.6 * fL + 12);
  let cols = 1, COLW = [natW.length ? Math.max(...natW) : 0];
  for (let c = Math.min(maxCols, entries.length); c >= 1; c--) {
    const cw = [];
    for (let k = 0; k < c; k++) { let m = 0; for (let i = k; i < entries.length; i += c) m = Math.max(m, natW[i] || 0); cw[k] = m; }
    const total = cw.reduce((a, b) => a + b, 0) + gapL * (c - 1);
    if (total <= usable || c === 1) { cols = Math.max(1, c); COLW = cw.length ? cw : COLW; break; }
  }
  const colX = []; { let acc = 24; for (let k = 0; k < cols; k++) { colX[k] = acc; acc += (COLW[k] || 0) + gapL; } }
  const rows = entries.length ? Math.ceil(entries.length / cols) : 0;
  const placed = entries.map((e, i) => ({ ...e, x: colX[i % cols], row: Math.floor(i / cols) + 1 }));
  const legendH = showLegend && entries.length ? Math.round((31 + rows * 19) * fL) : 0;
  const legendTop = VH - legendH;
  const subY = (showLegend && legendH ? legendTop : VH) - 12;
  const dividerBottom = subY - 18;

  if (twoPanel) {
    out.push(`<line x1="${VW / 2}" y1="38" x2="${VW / 2}" y2="${dividerBottom}" stroke="${C.line}" stroke-width="1"/>`);
    out.push(`<text x="${VW / 4}" y="24" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${(13 * fT).toFixed(1)}" font-weight="bold" fill="${C.text}">${esc(titles.a)}</text>`);
    out.push(`<text x="${(VW * 3) / 4}" y="24" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${(13 * fT).toFixed(1)}" font-weight="bold" fill="${C.text}">${esc(titles.b)}</text>`);
  } else {
    out.push(`<text x="${VW / 2}" y="24" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${(13 * fT).toFixed(1)}" font-weight="bold" fill="${C.text}">${esc(titles.a)}</text>`);
  }

  // arestas
  const pairMap = {};
  edges.forEach((e) => { const k = [e.from, e.to].sort().join("|"); (pairMap[k] ??= []).push(e.id); });
  const labelJobs = [];
  const markJobs = [];
  for (const e of edges) {
    const geo = edgeGeometry(e, byId, pairMap);
    if (!geo) continue;
    const { p1, p2, ctrl, curved } = geo;
    const dashed = e.style === "tracejada";
    const isSel = interactive && selEdge === e.id;
    const pv = e.kind === "porta-voz";
    const deleg = e.kind === "delegacao";
    const ref = e.kind === "referencia";
    let stroke = e.moment ? MOMENTS[e.moment].color : pv ? C.pv : deleg ? C.deleg : ref ? C.ref : dashed ? C.edgeDashed : C.edge;
    if (isSel) stroke = C.sel;
    let sw = isSel ? 2.6 : pv ? 2.2 : ref ? 2.2 : 1.5;
    if (force) sw += (pairMap[[e.from, e.to].sort().join("|")].length - 1) * 0.9;
    const dash = dashed ? ` stroke-dasharray="5 4"` : "";
    const d = curved ? `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}` : `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    const front = e.front;
    if (front === "programa") out.push(`<path d="${d}" fill="none" stroke="${C.programa}" stroke-width="${sw + 3}" stroke-opacity="0.22"/>`);
    else if (front === "antiprograma") out.push(`<path d="${d}" fill="none" stroke="${C.antiprograma}" stroke-width="${sw + 3}" stroke-opacity="0.22"/>`);
    if (pv) out.push(`<path d="${d}" fill="none" stroke="${C.pv}" stroke-width="${sw + 1.6}" stroke-opacity="0.28"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
    if (e.directed) {
      const tan = curved ? qPoint(p1, ctrl, p2, 0.92) : p1;
      if (front === "antiprograma") out.push(barrierBar(p2.x, p2.y, p2.x - tan.x, p2.y - tan.y, stroke, 7));
      else out.push(arrowHead(p2.x, p2.y, p2.x - tan.x, p2.y - tan.y, stroke, pv, 8));
    }
    if (deleg) {
      const gp = curved ? qPoint(p1, ctrl, p2, 0.74) : { x: p1.x + (p2.x - p1.x) * 0.74, y: p1.y + (p2.y - p1.y) * 0.74 };
      let ddx = p2.x - p1.x, ddy = p2.y - p1.y; const dl = Math.hypot(ddx, ddy) || 1;
      out.push(scriptGlyph(gp.x + (-ddy / dl) * 9, gp.y + (ddx / dl) * 9, C.deleg));
    }
    if (ref) {
      const mp = curved ? qPoint(p1, ctrl, p2, 0.5) : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const ds = 4.4;
      out.push(`<polygon points="${mp.x.toFixed(1)},${(mp.y - ds).toFixed(1)} ${(mp.x + ds).toFixed(1)},${mp.y.toFixed(1)} ${mp.x.toFixed(1)},${(mp.y + ds).toFixed(1)} ${(mp.x - ds).toFixed(1)},${mp.y.toFixed(1)}" fill="#ffffff" stroke="${C.ref}" stroke-width="1.4"/>`);
    }
    if (e.label) {
      const mid = curved ? qPoint(p1, ctrl, p2, 0.5) : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      let pdx = p2.x - p1.x, pdy = p2.y - p1.y; const pl = Math.hypot(pdx, pdy) || 1;
      labelJobs.push({ bx: mid.x, by: mid.y - 3, px: -pdy / pl, py: pdx / pl, color: e.moment ? MOMENTS[e.moment].color : pv ? C.pv : C.caption, text: esc(e.label) });
    }
    if (ref && (e.ganha || e.perde)) {
      const mid = curved ? qPoint(p1, ctrl, p2, 0.5) : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      let pdx = p2.x - p1.x, pdy = p2.y - p1.y; const pl = Math.hypot(pdx, pdy) || 1, px = -pdy / pl, py = pdx / pl;
      if (e.ganha) labelJobs.push({ bx: mid.x + px * 14, by: mid.y + py * 14 - 3, px, py, color: C.programa, text: "+ " + esc(e.ganha) });
      if (e.perde) labelJobs.push({ bx: mid.x - px * 14, by: mid.y - py * 14 - 3, px, py, color: C.antiprograma, text: "\u2212 " + esc(e.perde) });
    }
    if (showSources && (e.fonteTipo || e.fonte)) {
      const mp = curved ? qPoint(p1, ctrl, p2, 0.34) : { x: p1.x + (p2.x - p1.x) * 0.34, y: p1.y + (p2.y - p1.y) * 0.34 };
      let ddx = p2.x - p1.x, ddy = p2.y - p1.y; const dl = Math.hypot(ddx, ddy) || 1;
      markJobs.push({ x: mp.x + (-ddy / dl) * 11, y: mp.y + (ddx / dl) * 11, t: e.fonteTipo });
    }
  }

  // nós
  for (const n of nodes) {
    const meta = NODE_TYPES[n.type] || NODE_TYPES.intermediario;
    const { fs, lh, lines, w, h } = sizeOf(n);
    let stroke = meta.stroke, sw = 1.4, dashAttr = meta.dash ? ` stroke-dasharray="4 3"` : "";
    const isSel = interactive && selSet.has(n.id);
    const isFrom = interactive && connectFrom === n.id;
    if (isSel || isFrom) { stroke = C.sel; sw = 2.2; if (isFrom) dashAttr = ` stroke-dasharray="5 4"`; }
    if (n.calc) out.push(`<rect x="${(n.x - w / 2 - 5).toFixed(1)}" y="${(n.y - h / 2 - 5).toFixed(1)}" width="${w + 10}" height="${h + 10}" rx="8" fill="none" stroke="${C.calc}" stroke-width="1.6"/>`);
    out.push(nodeBody(n, stroke, sw, dashAttr));
    if (n.type === "caixapreta" && n.folded) out.push(`<text x="${(n.x + w / 2 - 8).toFixed(1)}" y="${(n.y - h / 2 + 13).toFixed(1)}" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="9" fill="#cdd6de">▣</text>`);
    if (showNature && n.nat === "humano") out.push(`<circle cx="${(n.x - w / 2 + 10).toFixed(1)}" cy="${(n.y - h / 2 + 10).toFixed(1)}" r="3.6" fill="${C.mark}"/>`);
    if (showNature && n.nat === "nao") out.push(`<rect x="${(n.x - w / 2 + 6).toFixed(1)}" y="${(n.y - h / 2 + 6).toFixed(1)}" width="7" height="7" fill="${C.mark}"/>`);
    if (n.estab === "estab" || n.estab === "prova") out.push(estabBadge(n.x + w / 2 - 8, n.y - h / 2 + 8, n.estab));
    if (n.calc) out.push(calcGlyph(n.x - w / 2 + 4, n.y + h / 2 - 8, C.calc));
    const startY = n.y - ((lines.length - 1) * lh) / 2 + fs / 3;
    const tspans = lines.map((l, i) => `<tspan x="${n.x}"${i === 0 ? "" : ` dy="${lh}"`}>${esc(l)}</tspan>`).join("");
    out.push(`<text x="${n.x}" y="${startY.toFixed(1)}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${fs}" font-weight="${n.emph ? "bold" : "normal"}" fill="${meta.text}">${tspans}</text>`);
  }

  // rótulos de aresta por cima dos nós, desviando das caixas para não ficarem cobertos
  const insideAnyNode = (x, y) => { for (const n of nodes) { const { w, h } = sizeOf(n); if (Math.abs(x - n.x) <= w / 2 + 5 && Math.abs(y - n.y) <= h / 2 + 5) return true; } return false; };
  for (const m of markJobs) out.push(sourceMark(m.x, m.y, m.t));
  for (const lj of labelJobs) {
    let lx = lj.bx, ly = lj.by;
    for (const off of [0, -14, 14, -26, 26, -40, 40, -54, 54, -70, 70]) {
      const x = lj.bx + lj.px * off, y = lj.by + lj.py * off;
      if (!insideAnyNode(x, y)) { lx = x; ly = y; break; }
    }
    out.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${(10 * fA).toFixed(1)}" fill="#ffffff" stroke="#ffffff" stroke-width="3" stroke-linejoin="round">${lj.text}</text>`);
    out.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${(10 * fA).toFixed(1)}" fill="${lj.color}">${lj.text}</text>`);
  }

  if (subs.a) out.push(`<text x="${twoPanel ? VW / 4 : VW / 2}" y="${subY}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-style="italic" font-size="${(10.5 * fS).toFixed(1)}" fill="${C.caption}">${esc(subs.a)}</text>`);
  if (subs.b && twoPanel) out.push(`<text x="${(VW * 3) / 4}" y="${subY}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-style="italic" font-size="${(10.5 * fS).toFixed(1)}" fill="${C.caption}">${esc(subs.b)}</text>`);

  if (showLegend && legendH) {
    out.push(`<line x1="24" y1="${legendTop}" x2="${VW - 24}" y2="${legendTop}" stroke="${C.line}" stroke-width="1"/>`);
    out.push(`<text x="24" y="${(legendTop + 16 * fL).toFixed(1)}" font-family="Helvetica,Arial,sans-serif" font-size="${(11 * fL).toFixed(1)}" font-weight="bold" fill="${C.text}">Legenda</text>`);
    const fnt = `font-family="Helvetica,Arial,sans-serif" font-size="${(10.5 * fL).toFixed(1)}" fill="${C.legend}"`;
    for (const p of placed) {
      const yRow = legendTop + 31 * fL + (p.row - 1) * 19 * fL, gy = yRow - 4 * fL;
      if (p.g === "node") {
        const meta = NODE_TYPES[p.t];
        if (meta.shape === "hex") out.push(`<polygon points="${p.x + 3},${gy} ${p.x + 7},${gy - 6} ${p.x + 19},${gy - 6} ${p.x + 23},${gy} ${p.x + 19},${gy + 6} ${p.x + 7},${gy + 6}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.2"/>`);
        else if (meta.shape === "pill") out.push(`<rect x="${p.x + 2}" y="${gy - 6}" width="22" height="12" rx="6" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.2"/>`);
        else if (meta.shape === "stack") { out.push(`<rect x="${p.x + 5}" y="${gy - 4}" width="18" height="11" rx="2" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="0.8" opacity="0.5"/>`); out.push(`<rect x="${p.x + 2}" y="${gy - 7}" width="18" height="11" rx="2" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.2"/>`); }
        else out.push(`<rect x="${p.x + 2}" y="${gy - 6}" width="20" height="12" rx="2" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.2"${meta.dash ? ` stroke-dasharray="3 2"` : ""}/>`);
        out.push(`<text x="${p.x + 30}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else if (p.g === "edge") {
        const col = p.t === "tracejada" ? C.edgeDashed : C.edge, da = p.t === "tracejada" ? ` stroke-dasharray="5 4"` : "";
        out.push(`<line x1="${p.x + 2}" y1="${gy}" x2="${p.x + 26}" y2="${gy}" stroke="${col}" stroke-width="1.6"${da}/>`);
        out.push(`<text x="${p.x + 32}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else if (p.g === "moment") {
        out.push(`<line x1="${p.x + 2}" y1="${gy}" x2="${p.x + 26}" y2="${gy}" stroke="${MOMENTS[p.t].color}" stroke-width="2"/>`);
        out.push(`<text x="${p.x + 32}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else if (p.g === "pv") {
        out.push(`<line x1="${p.x + 2}" y1="${gy}" x2="${p.x + 26}" y2="${gy}" stroke="${C.pv}" stroke-width="2.2"/>`);
        out.push(arrowHead(p.x + 26, gy, 1, 0, C.pv, true, 6));
        out.push(`<text x="${p.x + 34}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else if (p.g === "deleg") {
        out.push(`<line x1="${p.x + 2}" y1="${gy}" x2="${p.x + 18}" y2="${gy}" stroke="${C.deleg}" stroke-width="1.6"/>`);
        out.push(arrowHead(p.x + 18, gy, 1, 0, C.deleg, false, 6));
        out.push(scriptGlyph(p.x + 28, gy, C.deleg));
        out.push(`<text x="${p.x + 38}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else if (p.g === "ref") {
        out.push(`<line x1="${p.x + 2}" y1="${gy}" x2="${p.x + 24}" y2="${gy}" stroke="${C.ref}" stroke-width="2"/>`);
        out.push(`<polygon points="${p.x + 13},${gy - 4} ${p.x + 17},${gy} ${p.x + 13},${gy + 4} ${p.x + 9},${gy}" fill="#ffffff" stroke="${C.ref}" stroke-width="1.2"/>`);
        out.push(arrowHead(p.x + 24, gy, 1, 0, C.ref, false, 6));
        out.push(`<text x="${p.x + 30}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else if (p.g === "front") {
        const col = p.t === "programa" ? C.programa : C.antiprograma;
        out.push(`<line x1="${p.x + 2}" y1="${gy}" x2="${p.x + 26}" y2="${gy}" stroke="${col}" stroke-width="3" stroke-opacity="0.5"/>`);
        out.push(`<line x1="${p.x + 2}" y1="${gy}" x2="${p.x + 26}" y2="${gy}" stroke="${col}" stroke-width="1.4"/>`);
        if (p.t === "antiprograma") out.push(`<line x1="${p.x + 24}" y1="${gy - 5}" x2="${p.x + 24}" y2="${gy + 5}" stroke="${col}" stroke-width="2"/>`);
        else out.push(arrowHead(p.x + 26, gy, 1, 0, col, false, 6));
        out.push(`<text x="${p.x + 32}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else if (p.g === "estab") {
        out.push(estabBadge(p.x + 8, gy, p.t));
        out.push(`<text x="${p.x + 19}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else if (p.g === "calc") {
        out.push(`<rect x="${p.x + 1}" y="${gy - 6}" width="20" height="12" rx="3" fill="none" stroke="${C.calc}" stroke-width="1.4"/>`);
        out.push(calcGlyph(p.x + 4, gy + 1, C.calc));
        out.push(`<text x="${p.x + 26}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else if (p.g === "fonte") {
        out.push(sourceMark(p.x + 8, gy, "entrevista"));
        out.push(`<text x="${p.x + 18}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      } else {
        if (p.t === "humano") out.push(`<circle cx="${p.x + 11}" cy="${gy}" r="3.6" fill="${C.mark}"/>`);
        else out.push(`<rect x="${p.x + 7}" y="${gy - 4}" width="7" height="7" fill="${C.mark}"/>`);
        out.push(`<text x="${p.x + 22}" y="${yRow}" ${fnt}>${esc(p.label)}</text>`);
      }
    }
  }

  if (interactive && guides) for (const g of guides) out.push(`<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${C.guide}" stroke-width="1" stroke-dasharray="4 3"/>`);
  if (interactive && band) out.push(`<rect x="${band.x}" y="${band.y}" width="${band.w}" height="${band.h}" fill="${C.band}" fill-opacity="0.08" stroke="${C.band}" stroke-width="1" stroke-dasharray="4 3"/>`);
  if (interactive) out.push(`<g opacity="0.85"><rect x="${VW - 18}" y="${VH - 18}" width="16" height="16" rx="2" fill="#ffffff" stroke="${C.sel}" stroke-width="1.4"/><line x1="${VW - 13}" y1="${VH - 4}" x2="${VW - 4}" y2="${VH - 13}" stroke="${C.sel}" stroke-width="1.1"/><line x1="${VW - 8}" y1="${VH - 4}" x2="${VW - 4}" y2="${VH - 8}" stroke="${C.sel}" stroke-width="1.1"/></g>`);
  return out.join("");
}

/* ---------- métrica da legenda (altura real para uma largura) ---------- */
function legendMetaFor(state, W) {
  if (!state.showLegend) return { rows: 0, legendH: 0 };
  const nodes = state.nodes, edges = state.edges, legend = state.legend || {};
  const used = new Set(nodes.map((n) => n.type));
  const entries = [];
  TYPE_ORDER.forEach((t) => { if (used.has(t)) entries.push(legend[t] || t); });
  if (edges.some((e) => (e.style || "solida") === "solida" && !e.moment && e.kind !== "porta-voz")) entries.push(legend.solida || "associação");
  if (edges.some((e) => e.style === "tracejada" && !e.moment && e.kind !== "porta-voz")) entries.push(legend.tracejada || "reposta");
  MOMENT_ORDER.forEach((m) => { if (edges.some((e) => e.moment === m)) entries.push(MOMENTS[m].name); });
  if (edges.some((e) => e.kind === "porta-voz")) entries.push(legend.portavoz || "porta-voz");
  if (edges.some((e) => e.kind === "delegacao")) entries.push(legend.delegacao || "delegação / inscrição");
  if (edges.some((e) => e.kind === "referencia")) entries.push(legend.referencia || "cadeia de referência");
  if (edges.some((e) => e.front === "programa")) entries.push(legend.programa || "programa");
  if (edges.some((e) => e.front === "antiprograma")) entries.push(legend.antiprograma || "antiprograma");
  if (nodes.some((n) => n.estab === "estab")) entries.push(legend.estabilizado || "estabilizado");
  if (nodes.some((n) => n.estab === "prova")) entries.push(legend.prova || "em prova");
  if (nodes.some((n) => n.calc)) entries.push(legend.calc || "centro de cálculo");
  if ((state.showSources !== false) && edges.some((e) => e.fonteTipo || e.fonte)) entries.push(legend.fonte || "nota de fonte: E entrevista, D documento, O observação");
  if (state.showNature !== false && nodes.some((n) => n.nat === "humano")) entries.push(legend.humano || "humano");
  if (state.showNature !== false && nodes.some((n) => n.nat === "nao")) entries.push(legend.nao || "não-humano");
  if (!entries.length) return { rows: 0, legendH: 0 };
  const fL = (state.fonts && state.fonts.legenda) || 1;
  const usable = W - 48, gapL = 24, maxCols = 5;
  const natW = entries.map((l) => 28 + String(l).length * 5.6 * fL + 12);
  let cols = 1;
  for (let c = Math.min(maxCols, entries.length); c >= 1; c--) {
    const cw = []; for (let k = 0; k < c; k++) { let m = 0; for (let i = k; i < entries.length; i += c) m = Math.max(m, natW[i] || 0); cw[k] = m; }
    const total = cw.reduce((a, b) => a + b, 0) + gapL * (c - 1);
    if (total <= usable || c === 1) { cols = Math.max(1, c); break; }
  }
  const rows = Math.ceil(entries.length / cols);
  return { rows, legendH: Math.round((31 + rows * 19) * fL) };
}

/* ---------- aderência e guias ---------- */
function snapNode(node, others, gridSize, useGuides) {
  const { w, h } = sizeOf(node);
  const left = node.x - w / 2, right = node.x + w / 2, top = node.y - h / 2, bottom = node.y + h / 2;
  let bestX = null, bestY = null;
  if (useGuides) {
    for (const o of others) {
      const s = sizeOf(o), ol = o.x - s.w / 2, or = o.x + s.w / 2, ot = o.y - s.h / 2, ob = o.y + s.h / 2;
      [[node.x, o.x], [left, ol], [right, or]].forEach(([dd, t]) => { if (Math.abs(dd - t) < SNAP_T) { const adj = t - dd; if (!bestX || Math.abs(adj) < Math.abs(bestX.adj)) bestX = { adj, line: t }; } });
      [[node.y, o.y], [top, ot], [bottom, ob]].forEach(([dd, t]) => { if (Math.abs(dd - t) < SNAP_T) { const adj = t - dd; if (!bestY || Math.abs(adj) < Math.abs(bestY.adj)) bestY = { adj, line: t }; } });
    }
  }
  let X = node.x, Y = node.y; const guides = [];
  if (bestX) { X = node.x + bestX.adj; guides.push({ x1: bestX.line, y1: 0, x2: bestX.line, y2: VH }); }
  else if (gridSize) X = Math.round(node.x / gridSize) * gridSize;
  if (bestY) { Y = node.y + bestY.adj; guides.push({ x1: 0, y1: bestY.line, x2: VW, y2: bestY.line }); }
  else if (gridSize) Y = Math.round(node.y / gridSize) * gridSize;
  return { x: Math.round(X), y: Math.round(Y), guides };
}

/* ---------- alinhar / distribuir ---------- */
function alignNodes(nodes, ids, how) {
  const sel = nodes.filter((n) => ids.includes(n.id));
  if (sel.length < 2) return nodes;
  const dim = sel.map((n) => ({ n, s: sizeOf(n) }));
  const minL = Math.min(...dim.map((d) => d.n.x - d.s.w / 2)), maxR = Math.max(...dim.map((d) => d.n.x + d.s.w / 2));
  const minT = Math.min(...dim.map((d) => d.n.y - d.s.h / 2)), maxB = Math.max(...dim.map((d) => d.n.y + d.s.h / 2));
  const avgX = Math.round(sel.reduce((a, n) => a + n.x, 0) / sel.length), avgY = Math.round(sel.reduce((a, n) => a + n.y, 0) / sel.length);
  const set = {};
  for (const { n, s } of dim) {
    if (how === "left") set[n.id] = { x: Math.round(minL + s.w / 2) };
    else if (how === "right") set[n.id] = { x: Math.round(maxR - s.w / 2) };
    else if (how === "centerX") set[n.id] = { x: avgX };
    else if (how === "top") set[n.id] = { y: Math.round(minT + s.h / 2) };
    else if (how === "bottom") set[n.id] = { y: Math.round(maxB - s.h / 2) };
    else if (how === "centerY") set[n.id] = { y: avgY };
  }
  return nodes.map((n) => (set[n.id] ? { ...n, ...set[n.id] } : n));
}
function distributeNodes(nodes, ids, axis) {
  const sel = nodes.filter((n) => ids.includes(n.id));
  if (sel.length < 3) return nodes;
  const key = axis === "h" ? "x" : "y";
  const sorted = [...sel].sort((a, b) => a[key] - b[key]);
  const first = sorted[0][key], last = sorted[sorted.length - 1][key], step = (last - first) / (sorted.length - 1);
  const set = {};
  sorted.forEach((n, i) => { set[n.id] = Math.round(first + i * step); });
  return nodes.map((n) => (set[n.id] != null ? { ...n, [key]: set[n.id] } : n));
}

/* ---------- layouts ---------- */
function depths(nodes, edges) {
  const id = nodes.map((n) => n.id);
  const adj = {}, indeg = {};
  id.forEach((i) => { adj[i] = []; indeg[i] = 0; });
  let anyDir = false;
  edges.forEach((e) => { if (e.directed && adj[e.from] && adj[e.to] !== undefined) { adj[e.from].push(e.to); indeg[e.to]++; anyDir = true; } });
  if (!anyDir) {
    const deg = {}; id.forEach((i) => (deg[i] = 0));
    edges.forEach((e) => { if (deg[e.from] !== undefined) deg[e.from]++; if (deg[e.to] !== undefined) deg[e.to]++; });
    const adj2 = {}; id.forEach((i) => (adj2[i] = []));
    edges.forEach((e) => { if (adj2[e.from]) { adj2[e.from].push(e.to); adj2[e.to].push(e.from); } });
    const root = id.slice().sort((a, b) => deg[b] - deg[a])[0];
    const d = {}; id.forEach((i) => (d[i] = 0));
    const seen = new Set([root]); let q = [root];
    while (q.length) { const u = q.shift(); for (const v of adj2[u]) if (!seen.has(v)) { seen.add(v); d[v] = d[u] + 1; q.push(v); } }
    id.forEach((i, k) => { if (!seen.has(i)) d[i] = k % 4; });
    return d;
  }
  const d = {}; id.forEach((i) => (d[i] = 0));
  const deg = { ...indeg };
  let q = id.filter((i) => deg[i] === 0);
  while (q.length) { const u = q.shift(); for (const v of adj[u]) { d[v] = Math.max(d[v], d[u] + 1); if (--deg[v] === 0) q.push(v); } }
  return d;
}
function forceLayout(nodes, edges) {
  const N = nodes.length;
  if (N < 2) return nodes.map((n) => ({ ...n }));
  const sz = nodes.map(sizeOf);
  let pts = nodes.map((n, i) => ({ ...n, x: n.x || VW / 2 + Math.cos(i) * 20, y: n.y || VH / 2 + Math.sin(i) * 20 }));
  const k = Math.sqrt(((VW - 160) * (VH - 200)) / N) * 0.9;
  const idx = Object.fromEntries(pts.map((p, i) => [p.id, i]));
  let temp = Math.min(VW, VH) / 8;
  const iters = N > 14 ? 500 : 360;
  for (let it = 0; it < iters; it++) {
    const disp = pts.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.hypot(dx, dy) || 0.01;
      const ux = dx / d, uy = dy / d;
      let f = (k * k) / d;
      // repulsão extra quando as caixas (com seus tamanhos) estão perto de se sobrepor
      const minD = (sz[i].w + sz[j].w) / 2 + 34;
      if (d < minD) f += (minD - d) * 2.4;
      disp[i].x += ux * f; disp[i].y += uy * f; disp[j].x -= ux * f; disp[j].y -= uy * f;
    }
    for (const e of edges) {
      const a = idx[e.from], b = idx[e.to]; if (a == null || b == null) continue;
      let dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y, d = Math.hypot(dx, dy) || 0.01;
      const f = (d * d) / k, ux = dx / d, uy = dy / d;
      disp[a].x -= ux * f; disp[a].y -= uy * f; disp[b].x += ux * f; disp[b].y += uy * f;
    }
    for (let i = 0; i < N; i++) { const dd = Math.hypot(disp[i].x, disp[i].y) || 0.01; const lim = Math.min(dd, temp); pts[i].x += (disp[i].x / dd) * lim; pts[i].y += (disp[i].y / dd) * lim; }
    temp *= 0.98;
  }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const pad = 90, tpad = 70, bpad = 140;
  const s = Math.min((VW - 2 * pad) / Math.max(1, maxx - minx), (VH - tpad - bpad) / Math.max(1, maxy - miny), 1.6);
  let out = pts.map((p) => ({ ...p, x: Math.round(pad + (p.x - minx) * s), y: Math.round(tpad + (p.y - miny) * s) }));
  // passe final: remove qualquer sobreposição residual entre caixas
  out = declutter(out, 260, 16);
  return out;
}
function arrange(nodes, edges, kind) {
  if (!nodes.length) return nodes;
  if (kind === "organica") return forceLayout(nodes, edges);
  if (kind === "rede") {
    const cx = VW / 2, cy = VH / 2 - 30, R = Math.min(VW, VH) * 0.34;
    return nodes.map((n, i) => { const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2; return { ...n, x: Math.round(cx + R * Math.cos(a)), y: Math.round(cy + R * Math.sin(a) * 0.78) }; });
  }
  const d = depths(nodes, edges);
  const byLayer = {};
  nodes.forEach((n) => { (byLayer[d[n.id]] ??= []).push(n); });
  const layers = Object.keys(byLayer).map(Number).sort((a, b) => a - b);
  const out = {};
  if (kind === "vertical") {
    const top = 80, bot = VH - 130, gap = layers.length > 1 ? (bot - top) / (layers.length - 1) : 0;
    layers.forEach((L, li) => { const row = byLayer[L], y = layers.length > 1 ? top + li * gap : (top + bot) / 2; row.forEach((n, k) => { out[n.id] = { ...n, x: Math.round((VW * (k + 1)) / (row.length + 1)), y: Math.round(y) }; }); });
  } else {
    const left = 110, right = VW - 110, gap = layers.length > 1 ? (right - left) / (layers.length - 1) : 0;
    layers.forEach((L, li) => { const col = byLayer[L], x = layers.length > 1 ? left + li * gap : (left + right) / 2; col.forEach((n, k) => { out[n.id] = { ...n, x: Math.round(x), y: Math.round(60 + (VH - 190) * ((k + 1) / (col.length + 1))) }; }); });
  }
  return nodes.map((n) => out[n.id] || n);
}

/* ---------- desafogar: separa só o que está sobreposto, com mínimo deslocamento ---------- */
function declutter(nodes, iters = 120, pad = 12) {
  const pts = nodes.map((n) => ({ ...n }));
  const sz = pts.map(sizeOf);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], sa = sz[i], sb = sz[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const ox = (sa.w / 2 + sb.w / 2 + pad) - Math.abs(dx);
      const oy = (sa.h / 2 + sb.h / 2 + pad) - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        moved = true;
        if (ox <= oy) { const push = (ox / 2) * (dx < 0 ? -1 : 1); a.x -= push; b.x += push; }
        else { const push = (oy / 2) * (dy < 0 ? -1 : 1); a.y -= push; b.y += push; }
      }
    }
    if (!moved) break;
  }
  pts.forEach((p, i) => {
    const s = sz[i];
    p.x = Math.round(Math.max(s.w / 2 + 8, Math.min(VW - s.w / 2 - 8, p.x)));
    p.y = Math.round(Math.max(s.h / 2 + 30, Math.min(VH - s.h / 2 - 8, p.y)));
  });
  return pts;
}

/* ---------- preencher: desafoga, centraliza e escala para ocupar a área útil ---------- */
function fillLayout(state) {
  setDims(state.W, state.H);
  let nodes = declutter(state.nodes);
  if (!nodes.length) return nodes;
  const legH = state.showLegend ? legendMetaFor(state, VW).legendH : 0;
  const subGap = (state.subs && (state.subs.a || (state.twoPanel && state.subs.b))) ? 22 : 0;
  const left = 44, right = VW - 44;
  const top = state.twoPanel ? 52 : 46;
  const bottom = VH - (legH ? legH + 14 : 0) - subGap - 16;
  const areaW = Math.max(60, right - left), areaH = Math.max(60, bottom - top);
  const areaCx = (left + right) / 2, areaCy = (top + bottom) / 2;
  let cMinX = Infinity, cMaxX = -Infinity, cMinY = Infinity, cMaxY = -Infinity, maxW = 0, maxH = 0;
  for (const n of nodes) { const { w, h } = sizeOf(n); maxW = Math.max(maxW, w); maxH = Math.max(maxH, h); cMinX = Math.min(cMinX, n.x); cMaxX = Math.max(cMaxX, n.x); cMinY = Math.min(cMinY, n.y); cMaxY = Math.max(cMaxY, n.y); }
  const cloudCx = (cMinX + cMaxX) / 2, cloudCy = (cMinY + cMaxY) / 2;
  const centerW = Math.max(1, cMaxX - cMinX), centerH = Math.max(1, cMaxY - cMinY);
  const margin = 16;
  const targetW = Math.max(10, areaW - maxW - margin), targetH = Math.max(10, areaH - maxH - margin);
  let s = Math.min(targetW / centerW, targetH / centerH);
  if (!isFinite(s) || s <= 0) s = 1;
  s = Math.max(0.3, Math.min(3, s));
  nodes = nodes.map((n) => ({ ...n, x: areaCx + (n.x - cloudCx) * s, y: areaCy + (n.y - cloudCy) * s }));
  // remove sobreposição residual (no-op se já estiver limpo) e recentraliza
  nodes = declutter(nodes);
  {
    let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
    for (const n of nodes) { const { w, h } = sizeOf(n); bMinX = Math.min(bMinX, n.x - w / 2); bMaxX = Math.max(bMaxX, n.x + w / 2); bMinY = Math.min(bMinY, n.y - h / 2); bMaxY = Math.max(bMaxY, n.y + h / 2); }
    const dx = areaCx - (bMinX + bMaxX) / 2, dy = areaCy - (bMinY + bMaxY) / 2;
    nodes = nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }));
  }
  return nodes.map((n) => { const { w, h } = sizeOf(n); return { ...n, x: Math.round(Math.max(left + w / 2, Math.min(right - w / 2, n.x))), y: Math.round(Math.max(top + h / 2, Math.min(bottom - h / 2, n.y))) }; });
}

/* ---------- caixa-preta (pontualização) ---------- */
function foldBox(state, ids, label) {
  const idset = new Set(ids);
  const inside = state.nodes.filter((n) => idset.has(n.id));
  if (inside.length < 2) return state;
  const cx = Math.round(inside.reduce((a, n) => a + n.x, 0) / inside.length);
  const cy = Math.round(inside.reduce((a, n) => a + n.y, 0) / inside.length);
  const incident = state.edges.filter((e) => idset.has(e.from) || idset.has(e.to));
  const boxId = "box" + Date.now();
  const seen = new Set(), rw = [];
  for (const e of incident) {
    const fin = idset.has(e.from), tin = idset.has(e.to);
    if (fin && tin) continue;
    const nf = fin ? boxId : e.from, nt = tin ? boxId : e.to;
    const key = nf + ">" + nt + ":" + (e.style || "") + ":" + (e.moment || "") + ":" + (e.kind || "");
    if (seen.has(key)) continue; seen.add(key);
    rw.push({ ...e, id: "rw_" + e.id + "_" + boxId, from: nf, to: nt, _rw: true, curve: undefined });
  }
  const box = { id: boxId, label: label || "Caixa-preta", x: cx, y: cy, type: "caixapreta", emph: false, nat: "indef", folded: { nodes: inside, edges: incident } };
  return {
    ...state,
    nodes: [...state.nodes.filter((n) => !idset.has(n.id)), box],
    edges: [...state.edges.filter((e) => !incident.includes(e)), ...rw],
  };
}
function unfoldBox(state, boxId) {
  const box = state.nodes.find((n) => n.id === boxId);
  if (!box || !box.folded) return state;
  return {
    ...state,
    nodes: [...state.nodes.filter((n) => n.id !== boxId), ...box.folded.nodes],
    edges: [...state.edges.filter((e) => !(e._rw && (e.from === boxId || e.to === boxId))), ...box.folded.edges],
  };
}

/* ---------- import/export grafo ---------- */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return null;
  const rows = lines.map((l) => l.split(/[;,\t]/).map((s) => s.trim().replace(/^"|"$/g, "")));
  let start = 0;
  const h = rows[0].map((s) => s.toLowerCase());
  if (h.includes("source") || h.includes("from") || h.includes("origem") || h.includes("target") || h.includes("destino")) start = 1;
  const idset = new Set(), pairs = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]; if (r.length < 2 || !r[0] || !r[1]) continue;
    idset.add(r[0]); idset.add(r[1]); pairs.push([r[0], r[1], r[2] || ""]);
  }
  if (!idset.size) return null;
  const nodes = [...idset].map((id) => ({ id, label: id, type: "intermediario", emph: false, nat: "indef", x: VW / 2, y: VH / 2 }));
  const edges = pairs.map((p, i) => ({ id: "e" + i + "_" + Date.now(), from: p[0], to: p[1], style: "solida", directed: true, label: p[2] }));
  return { nodes: forceLayout(nodes, edges), edges };
}
function toGraphML(state) {
  const n = state.nodes.map((nd) => `    <node id="${esc(nd.id)}"><data key="d0">${esc(nd.label)}</data><data key="d1">${nd.type}</data></node>`).join("\n");
  const e = state.edges.map((ed, i) => `    <edge id="e${i}" source="${esc(ed.from)}" target="${esc(ed.to)}"><data key="d2">${esc(ed.label || "")}</data></edge>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n  <key id="d0" for="node" attr.name="label" attr.type="string"/>\n  <key id="d1" for="node" attr.name="type" attr.type="string"/>\n  <key id="d2" for="edge" attr.name="label" attr.type="string"/>\n  <graph edgedefault="directed">\n${n}\n${e}\n  </graph>\n</graphml>`;
}
function toGEXF(state) {
  const n = state.nodes.map((nd) => `      <node id="${esc(nd.id)}" label="${esc(nd.label).replace(/\n/g, " ")}"/>`).join("\n");
  const e = state.edges.map((ed, i) => `      <edge id="${i}" source="${esc(ed.from)}" target="${esc(ed.to)}" label="${esc(ed.label || "")}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gexf xmlns="http://gexf.net/1.3" version="1.3">\n  <graph defaultedgetype="directed">\n    <nodes>\n${n}\n    </nodes>\n    <edges>\n${e}\n    </edges>\n  </graph>\n</gexf>`;
}

/* ---------- seeds ---------- */
function seedVazio() {
  return baseState([], [], false, "", "", "", "");
}
function seedDidatico() {
  const N = (id, label, x, y, type, ex = {}) => ({ id, label, x, y, type, emph: false, ...ex });
  const nodes = [
    N("opp", "Ponto de passagem:\nconseguir terreno e água", 450, 215, "opp", { emph: true }),
    N("assoc", "Associação de moradores", 165, 115, "mediador", { nat: "humano", estab: "prova" }),
    N("pref", "Prefeitura", 165, 215, "intermediario", { nat: "humano" }),
    N("morad", "Moradores", 165, 320, "mediador", { nat: "humano" }),
    N("irrig", "Sistema de irrigação", 735, 115, "mediador", { nat: "nao", estab: "estab" }),
    N("manual", "Manual de cultivo", 735, 215, "intermediario", { nat: "nao" }),
    N("calend", "Calendário de plantio", 450, 100, "caixapreta"),
    N("sement", "Sementes", 450, 325, "quaseobjeto", { nat: "nao" }),
    N("cetic", "Vizinhos céticos", 735, 320, "silenciado", { nat: "humano" }),
  ];
  const E = (from, to, ex = {}) => ({ id: from + "_" + to, from, to, style: "solida", directed: true, label: "", ...ex });
  const edges = [
    E("assoc", "opp", { moment: "problematizacao", label: "problematiza", front: "programa", fonteTipo: "observacao", fonte: "exemplo de uso" }),
    E("pref", "opp", { moment: "interessamento", label: "interessa" }),
    E("irrig", "opp", { moment: "interessamento" }),
    E("opp", "morad", { moment: "alistamento", label: "alista" }),
    E("opp", "sement", { moment: "mobilizacao", label: "mobiliza" }),
    E("assoc", "morad", { kind: "porta-voz", label: "fala por" }),
    E("calend", "morad", { kind: "delegacao", label: "inscreve rotina" }),
    E("manual", "sement", { kind: "referencia", ganha: "instrução", perde: "improviso" }),
    E("cetic", "opp", { front: "antiprograma", style: "tracejada", label: "resiste" }),
  ];
  const st = baseState(nodes, edges, false,
    "Exemplo didático: uma rede de tradução (horta comunitária)", "",
    "Exemplo para explorar o programa: cada tipo de caixa e de ligação aparece aqui. Selecione, mova, edite e troque os tipos para ver o efeito.", "");
  st.H = 620;
  return st;
}
function seedRedeLivre() {
  const N = (id, label, type, ex = {}) => ({ id, label, type, emph: false, ...ex });
  const defs = [
    N("opp", "Adotar a plataforma\nna rede de ensino?", "opp", { emph: true }),
    N("secr", "Secretaria de Educação", "mediador", { nat: "humano" }),
    N("escola", "Escola", "mediador", { nat: "humano" }),
    N("doc", "Docentes", "mediador", { nat: "humano" }),
    N("est", "Estudantes", "mediador", { nat: "humano" }),
    N("plat", "Plataforma", "mediador", { nat: "nao" }),
    N("dados", "Dados de uso", "mediador", { nat: "nao" }),
    N("alg", "Algoritmo de recomendação", "caixapreta"),
    N("fam", "Famílias", "silenciado", { nat: "humano" }),
  ];
  const cx = VW / 2, cy = VH / 2 - 30, R = Math.min(VW, VH) * 0.34;
  const nodes = defs.map((n, i) => { const a = (i / defs.length) * Math.PI * 2 - Math.PI / 2; return { ...n, x: Math.round(cx + R * Math.cos(a)), y: Math.round(cy + R * Math.sin(a) * 0.78) }; });
  const E = (from, to, ex = {}) => ({ id: from + "_" + to, from, to, style: "solida", directed: true, label: "", ...ex });
  const edges = [
    E("secr", "opp", { moment: "problematizacao", label: "problematiza" }),
    E("plat", "opp", { moment: "interessamento", label: "interessa" }),
    E("escola", "opp", { moment: "interessamento" }),
    E("opp", "doc", { moment: "alistamento", label: "alista" }),
    E("opp", "est", { moment: "mobilizacao", label: "mobiliza" }),
    E("plat", "dados", { label: "produz" }),
    E("dados", "alg"),
    E("alg", "est", { style: "tracejada", label: "modula" }),
    E("doc", "fam", { style: "tracejada", label: "repõe" }),
    E("est", "fam", { directed: false, style: "tracejada" }),
  ];
  return baseState(nodes, edges, false,
    "Controvérsia em rede: adoção de uma plataforma educacional", "",
    "comece pela rede; dê forma vertical/horizontal e use os momentos da tradução", "");
}
function seedRedeUnica() {
  const N = (id, label, x, y, type, ex = {}) => ({ id, label, x, y, type, emph: false, ...ex });
  const nodes = [
    N("opp", "Passagem obrigatória:\npublicar o resultado validado", 450, 250, "opp", { emph: true }),
    N("pesq", "Pesquisador", 200, 120, "mediador", { nat: "humano" }),
    N("rev", "Revisor", 700, 120, "mediador", { nat: "humano" }),
    N("gpu", "Cluster / GPU", 720, 250, "mediador", { nat: "nao" }),
    N("dados", "Dados experimentais", 200, 250, "mediador", { nat: "nao" }),
    N("metodo", "Método estatístico", 450, 95, "caixapreta"),
    N("manus", "Manuscrito", 450, 410, "quaseobjeto", { nat: "nao" }),
    N("bolsa", "Bolsista", 200, 390, "silenciado", { nat: "humano" }),
    N("form", "Formulário de submissão", 700, 390, "intermediario", { nat: "nao" }),
  ];
  const E = (from, to, style, directed, label, moment) => ({ id: from + "_" + to, from, to, style: style || "solida", directed: !!directed, label: label || "", moment });
  const edges = [
    E("pesq", "opp", "solida", true, "problematiza", "problematizacao"), E("dados", "opp", "solida", true, "interessa", "interessamento"),
    E("gpu", "opp", "solida", true, "alista", "alistamento"), E("rev", "opp", "solida", true, "mobiliza", "mobilizacao"),
    E("metodo", "opp", "solida", false, ""), E("opp", "manus", "solida", true, "inscreve"),
    E("manus", "form", "tracejada", true, ""), E("bolsa", "dados", "tracejada", true, "repõe"),
  ];
  return baseState(nodes, edges, false,
    "Tradução: alistar actantes em torno de um ponto de passagem obrigatório", "",
    "humanos e não-humanos entram na rede sem hierarquia prévia; a estabilidade é conquistada", "");
}
function seedComparativo() {
  const N = (id, label, x, y, type, emph) => ({ id, label, x, y, type, emph: !!emph });
  const nodes = [
    N("a_cap", "CAPITAL /\nRACIONALIDADE NEOLIBERAL", 210, 92, "mediador", true),
    N("a_plat", "PLATAFORMA", 95, 215, "intermediario"), N("a_est", "ESTADO", 178, 215, "intermediario"),
    N("a_doc", "DOCENTE", 262, 215, "intermediario"), N("a_dado", "DADO", 340, 215, "intermediario"),
    N("a_ef", "EFEITOS\nprecarização · controle · vigilância · padronização", 215, 340, "intermediario"),
    N("b_plat", "PLATAFORMA", 645, 92, "mediador"), N("b_alg", "ALGORITMO", 560, 150, "intermediario"),
    N("b_dado", "DADO", 795, 150, "mediador"), N("b_bi", "BI /\nDASHBOARD", 665, 205, "mediador"),
    N("b_doc", "DOCENTE", 560, 262, "mediador"), N("b_gest", "GESTOR", 700, 285, "mediador"),
    N("b_cont", "CONTRATO /\nEDTECH", 820, 248, "intermediario"), N("b_infra", "INFRAESTRUTURA", 560, 360, "silenciado"),
    N("b_aprop", "APROPRIAÇÕES\n(burla, desvio)", 690, 368, "silenciado"), N("b_est", "ESTUDANTE", 820, 350, "silenciado"),
  ];
  const E = (from, to, style, directed) => ({ id: from + "_" + to, from, to, style: style || "solida", directed: !!directed, label: "" });
  const edges = [
    E("a_cap", "a_plat", "solida", true), E("a_cap", "a_est", "solida", true), E("a_cap", "a_doc", "solida", true), E("a_cap", "a_dado", "solida", true),
    E("a_plat", "a_ef", "solida", true), E("a_est", "a_ef", "solida", true), E("a_doc", "a_ef", "solida", true), E("a_dado", "a_ef", "solida", true),
    E("b_plat", "b_alg"), E("b_plat", "b_dado"), E("b_alg", "b_bi"), E("b_dado", "b_bi"), E("b_dado", "b_cont"),
    E("b_bi", "b_doc"), E("b_bi", "b_gest"), E("b_doc", "b_gest"),
    E("b_doc", "b_infra", "tracejada"), E("b_gest", "b_aprop", "tracejada"), E("b_cont", "b_est", "tracejada"), E("b_dado", "b_est", "tracejada"),
  ];
  return baseState(nodes, edges, true,
    "(a) A ontologia vertical: o motor único", "(b) A ontologia horizontal: a rede",
    "actantes tratados como intermediários de uma força anterior", "actantes que se coproduzem; sem causa única, sem hierarquia fixa");
}
function seedCadeia() {
  const N = (id, label, x, y, type, ex = {}) => ({ id, label, x, y, type, emph: false, ...ex });
  const nodes = [
    N("mundo", "Solo da floresta\n(o mundo)", 130, 200, "mediador", { nat: "nao", estab: "estab" }),
    N("amostra", "Amostra de terra\nem caixa", 340, 200, "quaseobjeto", { nat: "nao" }),
    N("diagrama", "Diagrama de cores\n(pedocomparador)", 560, 200, "quaseobjeto", { nat: "nao" }),
    N("tabela", "Tabela de dados", 770, 200, "quaseobjeto", { nat: "nao" }),
    N("texto", "Artigo científico", 770, 400, "caixapreta"),
  ];
  const E = (from, to, ganha, perde, label) => ({ id: from + "_" + to, from, to, style: "solida", directed: true, kind: "referencia", ganha, perde, label });
  const edges = [
    E("mundo", "amostra", "mobilidade", "localidade, contexto", "coleta"),
    E("amostra", "diagrama", "padronização", "matéria, volume", "classifica"),
    E("diagrama", "tabela", "cálculo, síntese", "cor, textura", "registra"),
    E("tabela", "texto", "circulação, prova", "casos particulares", "redige"),
  ];
  return baseState(nodes, edges, false,
    "Cadeia de referência: do mundo ao texto", "",
    "a cada elo perde-se matéria e localidade e ganha-se mobilidade; a referência se mantém pela cadeia reversível", "");
}
function baseState(nodes, edges, twoPanel, ta, tb, sa, sb) {
  return {
    nodes, edges, twoPanel, showLegend: true, regions: [], showNature: true, showSources: true, maxW: 170, W: 900, H: 540,
    fonts: { titulo: 1, no: 1, aresta: 1, legenda: 1, sub: 1, entrelinha: 1.25 },
    titles: { a: ta, b: tb }, subs: { a: sa, b: sb },
    legend: {
      mediador: "mediador (produz diferença)", intermediario: "intermediário (transmite sem transformar)",
      silenciado: "actante silenciado, reaberto pela TAR", opp: "ponto de passagem obrigatório",
      caixapreta: "caixa-preta (rede pontualizada)", quaseobjeto: "quase-objeto / token (circula)",
      solida: "associação descrita", tracejada: "associação reposta pela leitura ator-rede",
      portavoz: "porta-voz (relação de representação)",
      delegacao: "delegação / inscrição (ação inscrita num objeto)",
      referencia: "cadeia de referência (transformação do mundo ao texto)",
      programa: "associação do programa de ação",
      antiprograma: "associação do antiprograma (resistência)",
      estabilizado: "actante estabilizado (resistiu às provas)",
      prova: "actante em prova de força (em disputa)",
      calc: "centro de cálculo (acumula móveis imutáveis, age à distância)",
      fonte: "nota de fonte: E entrevista, D documento, O observação",
      humano: "actante humano", nao: "actante não-humano",
    },
  };
}

/* ============================================================ */
function EditorTAR({ active = true }) {
  const [state, setStateRaw] = useState(seedDidatico);
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
  const [viewMode, setViewMode] = useState("diagrama");
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
  useEffect(() => { setDims(state.W, state.H); SIZE_CTX = { force, degree: degreeMap(state.nodes, state.edges), maxW: state.maxW || 170, fontNo: (state.fonts && state.fonts.no) || 1, lineSpace: (state.fonts && state.fonts.entrelinha != null) ? state.fonts.entrelinha : 1.25 }; }, [state, force]);
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

  const LS_KEY = "tar_editor_autosave_v1";
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
        <strong style={{ fontSize: 15, marginRight: 4 }}>Ator-Rede</strong>
        <div id="tour-tabs" style={{ display: "flex", border: "1px solid #cfd6dd", borderRadius: 6, overflow: "hidden", marginRight: 6 }}>
          {[["analise", "Análise"], ["diagrama", "Diagrama"]].map(([v, l]) => (
            <button key={v} onClick={() => setViewMode(v)} style={{ border: "none", padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: viewMode === v ? "#1f7a8c" : "#fff", color: viewMode === v ? "#fff" : "#5a6b7a" }}>{l}</button>
          ))}
        </div>
        <button style={ui.mini} onClick={() => setShowHelp(true)} title="ajuda: o que o software faz">? Ajuda</button>
        {hasSaved && <button style={ui.btn("primary")} onClick={carregarSalvo} title="restaurar o último projeto salvo automaticamente neste navegador">Continuar de onde parei</button>}
        {hasSaved && <button style={ui.mini} onClick={descartarSalvo} title="apagar o projeto salvo automaticamente neste navegador">Descartar salvo</button>}
        <button style={ui.mini} onClick={undo} disabled={!past.length} title="desfazer (Ctrl+Z)">↶</button>
        <button style={ui.mini} onClick={redo} disabled={!future.length} title="refazer (Ctrl+Shift+Z)">↷</button>
        <span style={ui.div} />
        <span style={{ fontSize: 12, color: "#7a8b99" }}>Organizar:{hint("Acomoda os nós automaticamente: em círculo, force-directed (orgânica) ou em camadas.")}</span>
        <button style={ui.mini} onClick={() => organizar("rede")} title="círculo">Rede ○</button>
        <button style={ui.mini} onClick={() => organizar("organica")} title="force-directed">Orgânica ⚛</button>
        <button style={ui.mini} onClick={() => organizar("vertical")} title="cascata vertical">Vert ↓</button>
        <button style={ui.mini} onClick={() => organizar("horizontal")} title="cascata horizontal">Horiz →</button>
        <button style={ui.mini} onClick={desafogar} title="afasta só o que está sobreposto, sem reorganizar tudo">Desafogar ⤧</button>
        <button style={ui.mini} onClick={preencher} title="desafoga, centraliza e amplia a rede para preencher a área útil da tela">Preencher ⤢</button>
        <button style={ui.mini} onClick={carregarExemplo} title="carrega um diagrama de exemplo (horta comunitária) para explorar o programa">Exemplo</button>
        <button style={ui.mini} onClick={limparTudo} title="apaga todos os actantes e associações (dá para desfazer)">Limpar</button>
        <span style={ui.div} />
        <label style={ui.chk}><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grade</label>
        <label style={ui.chk}><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Aderir</label>
        <select style={{ ...ui.mini, padding: "4px 6px" }} value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}>{[10, 20, 25, 50].map((g) => (<option key={g} value={g}>{g}px</option>))}</select>
        <label style={ui.chk}><input type="checkbox" checked={useGuides} onChange={(e) => setUseGuides(e.target.checked)} /> Guias</label>
        <label style={ui.chk}><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Força</label>
        <span style={ui.div} />
        <button style={ui.mini} onClick={() => setView((v) => ({ ...v, w: v.w * 0.9, h: v.h * 0.9 }))} aria-label="aproximar (zoom)" title="aproximar">＋</button>
        <button style={ui.mini} onClick={() => setView((v) => ({ ...v, w: v.w * 1.1, h: v.h * 1.1 }))} aria-label="afastar (zoom)" title="afastar">－</button>
        <button style={ui.mini} onClick={resetView} aria-label="ajustar à tela" title="ajustar">⤢</button>
        <span style={ui.div} />
        <button style={ui.btn("primary")} onClick={exportSVG}>SVG</button>
        <button style={ui.mini} onClick={exportPNG}>PNG</button>
        <button id="tour-save" style={ui.mini} onClick={exportJSON} title="salva o projeto inteiro (actantes, categorias, associações, relatos) para continuar depois ou compartilhar">Salvar projeto</button>
        <button style={ui.mini} onClick={() => fileRef.current?.click()} title="abrir um projeto salvo (.json)">Abrir projeto</button>
        <button style={ui.mini} onClick={exportGraphML}>GraphML</button>
        <button style={ui.mini} onClick={exportGEXF}>GEXF</button>
        <button style={ui.mini} onClick={() => csvRef.current?.click()}>Importar CSV</button>
        <input ref={fileRef} type="file" accept="application/json" onChange={importJSON} style={{ display: "none" }} />
        <input ref={csvRef} type="file" accept=".csv,text/csv,text/plain" onChange={importCSV} style={{ display: "none" }} />
        {maxStep > 0 && (
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
              <div style={{ display: "flex", gap: 6 }}>{REGION_COLORS.map((c) => (<button key={c} onClick={() => mut((s) => ({ ...s, regions: s.regions.map((r) => (r.id === selRegion ? { ...r, color: c } : r)) }))} style={{ width: 26, height: 22, borderRadius: 5, border: selRegionObj.color === c ? "2px solid #1f7a8c" : "1px solid #cfd6dd", background: c, cursor: "pointer" }} />))}</div>
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


/* ===== Módulo: Análise textual qualitativa (Codifica - Bardin / ATD) ===== */
const AnaliseQualitativa = (() => {

/*
  Codifica - análise qualitativa simples (tipo ATLAS, enxuto)
  Suporta o ciclo comum a Bardin (codificação > categorização > inferência)
  e à Análise Textual Discursiva de Moraes & Galiazzi (unitarização > categorização > metatexto).

  Fluxo: abrir/colar texto -> selecionar trecho -> aplicar código(s) ->
         agrupar códigos em categorias -> ver quantitativo -> escrever metatexto/inferência.
  Tudo é salvo automaticamente (persistência do artefato) e pode ser exportado em JSON.
*/

const PALETTE = [
  "#c0392b", "#d35400", "#b7950b", "#27ae60", "#16a085",
  "#2980b9", "#8e44ad", "#c2185b", "#7f8c8d", "#5d6d7e",
  "#a04000", "#1e8449",
];

const uid = () => Math.random().toString(36).slice(2, 9);
const STORE = {
  index: "qa:index",
  active: "qa:active",
  proj: (id) => "qa:p:" + id,
};

const STOPWORDS_PT = new Set(("a à às ao aos as o os e é são foi era ser estar este esta isso isto esse essa aquele aquela " +
  "de do da dos das em no na nos nas um uma uns umas com como por para per pelo pela pelos pelas que se sua seu suas seus " +
  "mais menos muito muita muitos muitas pouco pouca tem têm ter tinha havia há sobre entre até depois antes ainda também " +
  "já não sim ou nem mas porém contudo quando onde porque pois então assim cada todo toda todos todas outro outra outros outras " +
  "qual quais quem cujo cujas seja sejam fica ficar foram somos sou está estão estava estavam vai vão ia iam pode podem podia " +
  "deve devem lhe lhes me te nos vos eu tu ele ela nós vós eles elas meu minha minhas meus teu tua dele dela deles delas " +
  "isso aqui ali lá aí num numa dum duma desse dessa neste nesta nisso daquele daquela este aquilo coisa ter").split(/\s+/));

function dlBlob(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}
function exportSvgElement(svgEl, baseName, kind) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  const wpx = (vb && vb.width) || svgEl.clientWidth || parseFloat(svgEl.getAttribute("width")) || 800;
  const hpx = (vb && vb.height) || svgEl.clientHeight || parseFloat(svgEl.getAttribute("height")) || 400;
  if (!clone.getAttribute("width")) clone.setAttribute("width", wpx);
  if (!clone.getAttribute("height")) clone.setAttribute("height", hpx);
  const xml = new XMLSerializer().serializeToString(clone);
  if (kind === "svg") {
    dlBlob(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }), baseName + ".svg");
    return;
  }
  const data = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  img.onload = () => {
    const scale = 2, canvas = document.createElement("canvas");
    canvas.width = wpx * scale; canvas.height = hpx * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, wpx, hpx);
    canvas.toBlob((b) => { if (b) dlBlob(b, baseName + ".png"); }, "image/png");
  };
  img.onerror = () => { try { window.alert("Não foi possível gerar o PNG."); } catch {} };
  img.src = data;
}
function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
function buildWordCloud(words, W, H) {
  if (!words.length) return [];
  const max = words[0][1], min = words[words.length - 1][1];
  const cx = W / 2, cy = H / 2, placed = [];
  const sizeFor = (n) => { const t = max === min ? 1 : (n - min) / (max - min); return Math.round(13 + t * 40); };
  for (let wi = 0; wi < words.length; wi++) {
    const [word, n] = words[wi];
    const fs = sizeFor(n);
    const wpx = word.length * fs * 0.62 + 6, hpx = fs * 1.15;
    let ok = false;
    for (let t = 0; t < 1400 && !ok; t++) {
      const r = 2.2 * t * 0.45, ang = t * 0.4;
      const x = cx + r * Math.cos(ang) - wpx / 2;
      const y = cy + r * Math.sin(ang) - hpx / 2;
      if (x < 2 || y < 2 || x + wpx > W - 2 || y + hpx > H - 2) continue;
      const rect = { x, y, w: wpx, h: hpx };
      if (!placed.some((p) => rectsOverlap(p, rect))) { placed.push({ ...rect, word, fs, n, ci: wi }); ok = true; }
    }
  }
  return placed;
}

async function loadKey(key) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveKey(key, val) {
  try {
    await window.storage.set(key, JSON.stringify(val));
  } catch (e) {
    console.error("storage", e);
  }
}

function emptyProject(name = "Novo projeto") {
  return {
    id: uid(),
    name,
    text: "",
    codes: [],        // {id, name, color, desc}
    excerpts: [],     // {id, start, end, text, codeIds:[], memo}
    categories: [],   // {id, name, tipo:'emergente'|'apriori', desc, codeIds:[]}
    metatexts: [],    // {id, title, categoryId|null, body}
    wordExclude: [],  // palavras removidas da nuvem/frequentes
    updated: Date.now(),
  };
}
function exampleProject() {
  const text = `ENTREVISTA — Experiência de trabalho remoto
(participante: profissional, 34 anos; entrevista semiestruturada)

Entrevistador: Como foi para você começar a trabalhar de casa?
Participante: No começo foi confuso. Eu não tinha um espaço só para o trabalho, então usava a mesa da cozinha. A internet caía toda hora e eu perdia parte das reuniões, o que me deixava ansioso. Levei umas três semanas para criar uma rotina que funcionasse.

Entrevistador: E o contato com os colegas, como ficou?
Participante: Senti muita falta da convivência. Antes a gente resolvia as coisas no corredor, rápido. De casa, tudo virava mensagem ou reunião marcada, e eu me senti bastante isolado, principalmente nas primeiras semanas.

Entrevistador: Teve algum ponto positivo?
Participante: Sim, vários. Economizei o tempo do deslocamento, que antes eram duas horas por dia, e consegui organizar meu trabalho no meu próprio ritmo. Passei a almoçar com a minha família, coisa que não acontecia havia anos. Essa flexibilidade foi o que mais valorizei.

Entrevistador: E as dificuldades continuaram?
Participante: Algumas sim. Como o computador estava sempre ali, eu acabava trabalhando além da hora, respondendo mensagem à noite. Eram tarefas demais e eu passava o dia inteiro na tela. No fim de alguns meses eu estava exausto, mesmo gostando da liberdade que o modelo trouxe.

Entrevistador: Olhando para trás, o que você mudaria?
Participante: Eu definiria horários mais claros desde o início e combinaria com a equipe momentos fixos para conversar. O problema não foi o trabalho remoto em si, mas a falta de combinados.`;
  const codes = [
    { id: "c1", name: "Dificuldade técnica", color: PALETTE[0], desc: "internet, equipamento, espaço de trabalho" },
    { id: "c2", name: "Adaptação", color: PALETTE[2], desc: "criar rotina, ajustar-se ao novo modelo" },
    { id: "c3", name: "Isolamento", color: PALETTE[1], desc: "falta de convívio e troca informal" },
    { id: "c4", name: "Flexibilidade", color: PALETTE[3], desc: "tempo, deslocamento, família" },
    { id: "c5", name: "Autonomia", color: PALETTE[5], desc: "organizar o próprio trabalho" },
    { id: "c6", name: "Sobrecarga", color: PALETTE[6], desc: "excesso de jornada e de tela" },
  ];
  const mk = (id, sub, codeIds, memo = "") => { const start = text.indexOf(sub); return { id, start, end: start + sub.length, text: sub, codeIds, memo }; };
  const excerpts = [
    mk("e1", "A internet caía toda hora e eu perdia parte das reuniões", ["c1"], "problema de acesso"),
    mk("e2", "Levei umas três semanas para criar uma rotina", ["c2"]),
    mk("e3", "me senti bastante isolado, principalmente nas primeiras semanas", ["c3"]),
    mk("e4", "Economizei o tempo do deslocamento, que antes eram duas horas por dia", ["c4"]),
    mk("e5", "consegui organizar meu trabalho no meu próprio ritmo", ["c5"]),
    mk("e6", "Essa flexibilidade foi o que mais valorizei", ["c4"], "valor central para o participante"),
    mk("e7", "eu acabava trabalhando além da hora, respondendo mensagem à noite", ["c6"]),
    mk("e8", "Eram tarefas demais e eu passava o dia inteiro na tela", ["c6", "c1"], "sobrecarga ligada à tela"),
  ];
  const categories = [
    { id: "k1", name: "Desafios da transição", tipo: "emergente", desc: "o que dificultou a mudança para o remoto", codeIds: ["c1", "c2", "c3", "c6"] },
    { id: "k2", name: "Ganhos percebidos", tipo: "emergente", desc: "o que o participante passou a valorizar", codeIds: ["c4", "c5"] },
  ];
  const metatexts = [
    { id: "m1", title: "Desafios da transição", categoryId: "k1", body: "Os relatos descrevem uma transição inicialmente custosa para o trabalho remoto: problemas técnicos de acesso, a necessidade de construir uma rotina nova, a perda do convívio informal e, mais adiante, a sobrecarga ligada ao tempo de tela. Este é um rascunho de exemplo: substitua por sua própria interpretação, apoiada nos recortes." },
  ];
  return { id: uid(), name: "Exemplo: entrevista (trabalho remoto)", text, codes, excerpts, categories, metatexts, updated: Date.now() };
}
function exampleCodingB() {
  const base = exampleProject();
  const text = base.text;
  const codes = base.codes.map((c) => ({ ...c }));
  const mk = (id, sub, codeIds) => { const start = text.indexOf(sub); return { id, start: start < 0 ? 0 : start, end: start < 0 ? 0 : start + sub.length, text: sub, codeIds, memo: "" }; };
  // Codificador B: concorda na maior parte, com algumas diferenças realistas
  // (limites distintos, um recorte a menos, um código trocado e um recorte a mais).
  const excerpts = [
    mk("b1", "A internet caía toda hora e eu perdia parte das reuniões", ["c1"]),
    mk("b2", "Levei umas três semanas para criar uma rotina que funcionasse", ["c2"]), // limite maior que A
    mk("b3", "me senti bastante isolado", ["c3"]),                                       // limite menor que A
    mk("b4", "Economizei o tempo do deslocamento, que antes eram duas horas por dia", ["c4"]),
    mk("b5", "consegui organizar meu trabalho no meu próprio ritmo", ["c5"]),
    // (B não marcou "Essa flexibilidade foi o que mais valorizei")
    mk("b7", "eu acabava trabalhando além da hora, respondendo mensagem à noite", ["c6"]),
    mk("b8", "Eram tarefas demais e eu passava o dia inteiro na tela", ["c6"]),          // A usou c6+c1; B só c6
    mk("b9", "Senti muita falta da convivência", ["c3"]),                                 // recorte extra de B
  ];
  return { id: uid(), name: "Exemplo: codificador B (mesma entrevista)", text, codes, excerpts, categories: [], metatexts: [], updated: Date.now() };
}
const QHELP = [
  { h: "O que é", items: ["Módulo de análise qualitativa de texto. Apoia o ciclo da Análise de Conteúdo (Bardin: codificação > categorização > inferência) e da Análise Textual Discursiva (Moraes e Galiazzi: unitarização > categorização > metatexto)."] },
  { h: "Fluxo geral", items: ["1) Importe (.txt/.docx), cole ou abra um texto. 2) Selecione um trecho e aplique um ou mais códigos. 3) Agrupe os códigos em categorias. 4) Veja o quantitativo (frequências, nuvem de palavras). 5) Escreva o metatexto/inferência. 6) Se houver dois codificadores, confira a concordância na aba Confiabilidade."] },
  { h: "As abas", items: [
    ["Codificação", "o texto fica à esquerda; selecione um trecho e marque com códigos (cores). Cada trecho marcado é um recorte (unidade de análise). Aqui também se renomeia e se mescla códigos."],
    ["Categorias", "crie categorias e associe códigos a elas. Categoria emergente nasce dos dados; a priori vem da teoria."],
    ["Quantitativo", "frequência de cada código e categoria, co-ocorrências, palavras frequentes e nuvem de palavras (com exportação em PNG/SVG)."],
    ["Confiabilidade", "compara duas codificações do mesmo texto e calcula a concordância entre codificadores (kappa de Cohen)."],
    ["Metatexto", "onde se escreve a interpretação: inferência (Bardin) ou metatexto descritivo-interpretativo (Moraes e Galiazzi). Pode vincular a uma categoria."],
  ] },
  { h: "Importar texto e buscar", items: [
    ["Importar texto", "abra um arquivo .txt ou .docx (Word) pela tela inicial ou pelo botão Importar texto no cabeçalho do texto. Importar um texto novo substitui o atual e remove os recortes."],
    ["Buscar", "o campo de busca destaca as ocorrências no texto; use ‹ › (ou Enter / Shift+Enter) para navegar e ✕ para limpar."],
  ] },
  { h: "Códigos e recortes", items: [
    "Um código é um rótulo com cor e descrição. Um recorte pode receber vários códigos. Use o memo para anotar por que aquele trecho foi marcado.",
    ["Renomear", "clique no nome do código na lista (aba Codificação) e edite."],
    ["Mesclar", "em MESCLAR CÓDIGOS, escolha 'de' um código 'em' outro: os recortes do primeiro passam a usar o segundo e o primeiro é removido."],
  ] },
  { h: "Quantitativo, nuvem e exportação", items: [
    ["Palavras frequentes", "as 30 palavras mais frequentes do texto, ignorando palavras vazias (artigos, preposições etc.) e com menos de 3 letras."],
    ["Excluir palavras", "use o × na palavra (ou o campo 'excluir palavra') para tirar termos que não interessam à nuvem, como 'entrevistador' ou 'participante'. O ↺ restaura. As exclusões ficam salvas no projeto."],
    ["Nuvem de palavras", "gerada a partir das palavras frequentes; exporte em PNG ou SVG."],
    ["Exportar gráficos", "o gráfico de frequência por código e a nuvem têm botões PNG/SVG (SVG é vetorial, ideal para artigo)."],
  ] },
  { h: "Confiabilidade entre codificadores", items: [
    ["Como usar", "as duas codificações precisam ser do mesmo texto. A é o projeto atual; escolha B em outro projeto ou abrindo um .json. O botão 'carregar exemplo (A e B)' mostra uma demonstração pronta."],
    ["O que calcula", "kappa de Cohen, concordância observada (Po), esperada por acaso (Pe) e a concordância por código. Os códigos dos dois são pareados pelo nome."],
    ["Referência", "Cohen (1960); bandas de interpretação de Landis e Koch (1977)."],
  ] },
  { h: "Salvar e compartilhar", items: [
    ["Salvar / Abrir", "guarda o projeto em arquivo .json (texto, códigos, recortes, categorias, metatextos, palavras excluídas)."],
    ["Salvar QualMap", "no topo do programa, salva e restaura num único arquivo o trabalho das duas ferramentas (diagrama + análise textual)."],
    ["Compartilhar", "gera um HTML do projeto para leitura."],
    ["Relatório", "documento com o texto codificado, os códigos, as categorias e os metatextos."],
    ["Exemplo", "carrega um projeto pronto (trabalho remoto) já codificado, para ver como tudo funciona."],
  ] },
  { h: "Salvamento", items: ["O trabalho é salvo automaticamente no navegador. Para levar a outro computador, use Salvar (.json) ou Salvar QualMap (backup completo)."] },
];

// ---- confiabilidade entre codificadores (kappa de Cohen) ----
// Unidade de análise: caractere. Cada caractere recebe o rótulo do código que o
// cobre (primeiro recorte que o cobre); sem cobertura = "—". Os códigos dos dois
// codificadores são pareados pelo NOME (minúsculas).
// Referência: Cohen, J. (1960). A coefficient of agreement for nominal scales.
// Educational and Psychological Measurement, 20(1), 37-46. Bandas de interpretação:
// Landis, J. R., & Koch, G. G. (1977). Biometrics, 33(1), 159-174.
function coderCharLabels(project) {
  const text = (project && project.text) || "";
  const labels = new Array(text.length).fill(null);
  const byId = {}; ((project && project.codes) || []).forEach((c) => { byId[c.id] = c; });
  for (const ex of (project && project.excerpts) || []) {
    const cid = (ex.codeIds && ex.codeIds[0]) || null;
    const code = cid ? byId[cid] : null;
    const name = code ? (code.name || "").trim().toLowerCase() : "";
    if (!name) continue;
    const s = Math.max(0, ex.start | 0), e = Math.min(text.length, ex.end | 0);
    for (let i = s; i < e; i++) if (labels[i] == null) labels[i] = name;
  }
  return labels.map((l) => (l == null ? "—" : l));
}
function interCoderKappa(projA, projB) {
  const ta = (projA && projA.text) || "", tb = (projB && projB.text) || "";
  if (!(ta.length > 0 && ta === tb)) return { sameText: false };
  const a = coderCharLabels(projA), b = coderCharLabels(projB), n = a.length;
  const cats = Array.from(new Set([...a, ...b]));
  const countA = {}, countB = {};
  let agree = 0, unionCoded = 0, unionAgree = 0;
  const perCode = {}; cats.forEach((c) => { if (c !== "—") perCode[c] = { both: 0, aOnly: 0, bOnly: 0 }; });
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (x === y) agree++;
    countA[x] = (countA[x] || 0) + 1; countB[y] = (countB[y] || 0) + 1;
    if (x !== "—" || y !== "—") { unionCoded++; if (x === y) unionAgree++; }
    if (x !== "—" && x === y) perCode[x].both++;
    else { if (x !== "—") perCode[x].aOnly++; if (y !== "—") perCode[y].bOnly++; }
  }
  const po = n ? agree / n : 0;
  let pe = 0; for (const c of cats) pe += ((countA[c] || 0) / n) * ((countB[c] || 0) / n);
  const kappa = pe < 1 ? (po - pe) / (1 - pe) : 1;
  const poUnion = unionCoded ? unionAgree / unionCoded : 0;
  return {
    sameText: true, n, po, pe, kappa, poUnion, unionCoded, perCode,
    codesA: Object.keys(countA).filter((c) => c !== "—"),
    codesB: Object.keys(countB).filter((c) => c !== "—"),
  };
}
function kappaBand(k) {
  if (k < 0) return "pobre (poor)";
  if (k <= 0.20) return "leve (slight)";
  if (k <= 0.40) return "razoável (fair)";
  if (k <= 0.60) return "moderada (moderate)";
  if (k <= 0.80) return "substancial (substantial)";
  return "quase perfeita (almost perfect)";
}

function parseJSON(text) {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const m = clean.match(/[\[{][\s\S]*[\]}]/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

// ---- segmentação do texto para destaque + mapeamento de offset ----
function buildSegments(text, excerpts) {
  const pts = new Set([0, text.length]);
  excerpts.forEach((e) => { pts.add(e.start); pts.add(e.end); });
  const sorted = [...pts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i], en = sorted[i + 1];
    if (s === en) continue;
    const covering = excerpts.filter((e) => e.start <= s && e.end >= en);
    segs.push({ start: s, end: en, text: text.slice(s, en), covering });
  }
  if (segs.length === 0 && text.length > 0) segs.push({ start: 0, end: text.length, text, covering: [] });
  return segs;
}

function absOffset(node, offset) {
  let el = node.nodeType === 3 ? node.parentElement : node;
  while (el && !(el.dataset && el.dataset.start != null)) el = el.parentElement;
  if (!el) return null;
  const base = parseInt(el.dataset.start, 10);
  if (node.nodeType === 3) return base + offset;
  return base;
}

function escapeHTML(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// gera um HTML autocontido (somente leitura) que abre em qualquer navegador
function buildStandaloneHTML(project) {
  const codeMap = Object.fromEntries(project.codes.map((c) => [c.id, c]));
  const segs = buildSegments(project.text, project.excerpts);
  const textHTML = segs.map((seg) => {
    const c0 = seg.covering[0] ? codeMap[seg.covering[0].codeIds[0]] : null;
    const names = seg.covering.flatMap((e) => e.codeIds.map((id) => codeMap[id]?.name)).filter(Boolean).join(", ");
    const style = c0 ? `background:${c0.color}33;border-bottom:2px solid ${c0.color};` : "";
    const title = names ? ` title="${escapeHTML(names)}"` : "";
    return `<span style="${style}border-radius:2px"${title}>${escapeHTML(seg.text)}</span>`;
  }).join("");
  const codeRows = project.codes.map((c) => {
    const n = project.excerpts.filter((e) => e.codeIds.includes(c.id)).length;
    return `<li style="margin:3px 0"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${c.color};margin-right:6px;vertical-align:middle"></span>${escapeHTML(c.name)} <b>(${n})</b></li>`;
  }).join("");
  const catBlocks = project.categories.map((cat) => {
    const codes = project.codes.filter((c) => cat.codeIds.includes(c.id));
    const exs = project.excerpts.filter((e) => e.codeIds.some((id) => cat.codeIds.includes(id)));
    const chips = codes.map((c) => `<span style="background:${c.color};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;margin:2px;display:inline-block">${escapeHTML(c.name)}</span>`).join("");
    return `<div style="margin-bottom:16px"><h3 style="margin:0 0 4px">${escapeHTML(cat.name)} <span style="font-weight:400;color:#999;font-size:13px">(${cat.tipo} · ${exs.length} recortes)</span></h3>${cat.desc ? `<p style="margin:0 0 6px;color:#555">${escapeHTML(cat.desc)}</p>` : ""}<div>${chips}</div></div>`;
  }).join("");
  const metaBlocks = project.metatexts.map((m) => `<div style="margin-bottom:18px"><h3 style="margin:0 0 6px">${escapeHTML(m.title)}</h3><p style="white-space:pre-wrap;line-height:1.7;margin:0">${escapeHTML(m.body)}</p></div>`).join("");
  const stamp = new Date().toLocaleDateString("pt-BR");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(project.name)}</title></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2b3a48;background:#ffffff;margin:0">
<div style="max-width:880px;margin:0 auto;padding:34px 24px">
<h1 style="margin:0 0 4px">${escapeHTML(project.name)}</h1>
<p style="font-family:system-ui;color:#888;font-size:13px;margin:0 0 24px">Análise qualitativa · ${project.excerpts.length} recortes · ${project.codes.length} códigos · ${project.categories.length} categorias · exportado em ${stamp}</p>
<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px">Texto codificado</h2>
<div style="font-size:16px;line-height:1.9;white-space:pre-wrap;background:#fff;padding:20px;border:1px solid #e3e9ee;border-radius:6px">${textHTML || "<i>(sem texto)</i>"}</div>
<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:28px">Códigos</h2>
<ul style="font-family:system-ui;font-size:14px;list-style:none;padding:0">${codeRows || "<li>—</li>"}</ul>
<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:28px">Categorias</h2>${catBlocks || "<p>—</p>"}
<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:28px">Metatextos e inferências</h2>${metaBlocks || "<p>—</p>"}
</div></body></html>`;
}

function App() {
  const [project, setProject] = useState(null);
  const [index, setIndex] = useState([]); // [{id,name}]
  const [tab, setTab] = useState("codificacao");
  const [cmpB, setCmpB] = useState(null);
  async function onPickB(id) {
    if (!id) { setCmpB(null); return; }
    try { const p = await loadKey(STORE.proj(id)); if (p) setCmpB(p); } catch (e) {}
  }
  function onFileB(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const o = parseJSON(String(r.result)); if (o && typeof o.text === "string") setCmpB(o); else { try { window.alert("Arquivo de projeto inválido."); } catch {} } };
    r.readAsText(f); e.target.value = "";
  }
  const [pending, setPending] = useState(null); // {start,end,text}
  const [selExcerpt, setSelExcerpt] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteVal, setPasteVal] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => { if (!showHelp) return; const h = (e) => { if (e.key === "Escape") setShowHelp(false); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [showHelp]);
  const saveTimer = useRef(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const fileRef = useRef(null);
  const qHelpRef = useRef(null);

  // carregar na montagem
  useEffect(() => {
    (async () => {
      let idx = (await loadKey(STORE.index)) || [];
      let activeId = await loadKey(STORE.active);
      let proj = activeId ? await loadKey(STORE.proj(activeId)) : null;
      if (!proj) {
        proj = exampleProject();
        idx = [{ id: proj.id, name: proj.name }];
        await saveKey(STORE.proj(proj.id), proj);
        await saveKey(STORE.index, idx);
        await saveKey(STORE.active, proj.id);
      }
      setIndex(idx);
      setProject(proj);
    })();
  }, []);

  // autosave
  useEffect(() => {
    if (!project) return;
    setSaving(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const p = { ...project, updated: Date.now() };
      await saveKey(STORE.proj(p.id), p);
      const idx = (await loadKey(STORE.index)) || [];
      const ni = idx.map((x) => (x.id === p.id ? { id: p.id, name: p.name } : x));
      if (!ni.find((x) => x.id === p.id)) ni.push({ id: p.id, name: p.name });
      setIndex(ni);
      await saveKey(STORE.index, ni);
      setSaving(false); setSavedAt(Date.now());
    }, 600);
  }, [project]);

  const update = useCallback((patch) => setProject((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) })), []);
  useEffect(() => {
    SUITE.getQual = async () => {
      let idx = [];
      try { idx = (await loadKey(STORE.index)) || []; } catch {}
      const projects = {};
      for (const it of idx) { try { const p = await loadKey(STORE.proj(it.id)); if (p) projects[it.id] = p; } catch {} }
      if (project) { projects[project.id] = project; if (!idx.find((x) => x.id === project.id)) idx = [...idx, { id: project.id, name: project.name }]; }
      let active = null; try { active = await loadKey(STORE.active); } catch {}
      return { index: idx, projects, active: active || (project && project.id) };
    };
    SUITE.setQual = async (data) => {
      if (!data || !data.projects) return;
      const idx = data.index || Object.values(data.projects).map((p) => ({ id: p.id, name: p.name }));
      for (const id in data.projects) { try { await saveKey(STORE.proj(id), data.projects[id]); } catch {} }
      try { await saveKey(STORE.index, idx); } catch {}
      const activeId = data.active && data.projects[data.active] ? data.active : (idx[0] && idx[0].id);
      if (activeId) { try { await saveKey(STORE.active, activeId); } catch {} const p = data.projects[activeId]; if (p) { setProject(p); setIndex(idx); setPending(null); setSelExcerpt(null); } }
    };
    return () => { SUITE.getQual = null; SUITE.setQual = null; };
  }, [project]);

  // ---- projetos ----
  async function switchProject(id) {
    const p = await loadKey(STORE.proj(id));
    if (p) { setProject(p); await saveKey(STORE.active, id); setPending(null); setSelExcerpt(null); }
  }
  async function newProject() {
    const p = emptyProject("Projeto " + (index.length + 1));
    await saveKey(STORE.proj(p.id), p);
    const ni = [...index, { id: p.id, name: p.name }];
    setIndex(ni); await saveKey(STORE.index, ni); await saveKey(STORE.active, p.id);
    setProject(p); setPending(null); setSelExcerpt(null);
  }
  async function loadExample() {
    const p = exampleProject();
    await saveKey(STORE.proj(p.id), p);
    const ni = [...index, { id: p.id, name: p.name }];
    setIndex(ni); await saveKey(STORE.index, ni); await saveKey(STORE.active, p.id);
    setProject(p); setPending(null); setSelExcerpt(null); setTab("codificacao");
  }
  async function loadReliabilityExample() {
    const p = exampleProject();
    await saveKey(STORE.proj(p.id), p);
    const ni = [...index, { id: p.id, name: p.name }];
    setIndex(ni); await saveKey(STORE.index, ni); await saveKey(STORE.active, p.id);
    setProject(p); setPending(null); setSelExcerpt(null);
    setCmpB(exampleCodingB()); setTab("confiabilidade");
  }
  function excludeWord(word) {
    const w = (word || "").toLowerCase();
    if (!w) return;
    update((p) => ({ wordExclude: [...new Set([...(p.wordExclude || []), w])] }));
  }
  function includeWord(word) {
    update((p) => ({ wordExclude: (p.wordExclude || []).filter((x) => x !== word) }));
  }
  async function deleteProject() {
    if (!confirm("Apagar este projeto? Esta ação não pode ser desfeita.")) return;
    const ni = index.filter((x) => x.id !== project.id);
    try { await window.storage.delete(STORE.proj(project.id)); } catch (e) {}
    if (ni.length === 0) { const p = emptyProject("Projeto 1"); await saveKey(STORE.proj(p.id), p); ni.push({ id: p.id, name: p.name }); }
    setIndex(ni); await saveKey(STORE.index, ni);
    await switchProject(ni[0].id);
  }

  // ---- texto ----
  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) { return; }
    if (project.text && project.excerpts.length) {
      let ok = true; try { ok = window.confirm("Importar um novo texto vai substituir o texto atual e remover os recortes existentes. Continuar?"); } catch {}
      if (!ok) { e.target.value = ""; return; }
    }
    const name = (f.name || "").toLowerCase();
    if (name.endsWith(".docx") && typeof window !== "undefined" && window.mammoth) {
      const r = new FileReader();
      r.onload = async () => {
        try {
          const out = await window.mammoth.extractRawText({ arrayBuffer: r.result });
          update({ text: (out && out.value) || "", excerpts: [] }); setPending(null); setSelExcerpt(null);
        } catch (err) { try { window.alert("Não foi possível ler este .docx."); } catch {} }
      };
      r.readAsArrayBuffer(f);
    } else {
      const r = new FileReader();
      r.onload = () => { update({ text: String(r.result), excerpts: [] }); setPending(null); setSelExcerpt(null); };
      r.readAsText(f);
    }
    e.target.value = "";
  }
  function applyPaste() {
    update({ text: pasteVal, excerpts: [] });
    setPasteMode(false); setPasteVal(""); setPending(null); setSelExcerpt(null);
  }

  // ---- seleção de trecho ----
  function onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const a = absOffset(range.startContainer, range.startOffset);
    const b = absOffset(range.endContainer, range.endOffset);
    if (a == null || b == null) return;
    const s = Math.min(a, b), en = Math.max(a, b);
    if (en > s) { setPending({ start: s, end: en, text: project.text.slice(s, en) }); setSelExcerpt(null); }
  }

  // ---- códigos ----
  function addCode(name) {
    const n = name.trim();
    if (!n) return null;
    const exist = project.codes.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (exist) return exist.id;
    const color = PALETTE[project.codes.length % PALETTE.length];
    const code = { id: uid(), name: n, color, desc: "" };
    update((p) => ({ codes: [...p.codes, code] }));
    return code.id;
  }
  function assignCode(codeId) {
    if (!pending || !codeId) return;
    update((p) => {
      const same = p.excerpts.find((e) => e.start === pending.start && e.end === pending.end);
      if (same) {
        return { excerpts: p.excerpts.map((e) => e === same ? { ...e, codeIds: [...new Set([...e.codeIds, codeId])] } : e) };
      }
      const ex = { id: uid(), start: pending.start, end: pending.end, text: pending.text, codeIds: [codeId], memo: "" };
      return { excerpts: [...p.excerpts, ex] };
    });
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }
  function removeCode(codeId) {
    const c = project.codes.find((x) => x.id === codeId);
    const n = project.excerpts.filter((e) => e.codeIds.includes(codeId)).length;
    if (n > 0) { let ok = true; try { ok = window.confirm(`Excluir o código "${c ? c.name : ""}"? Ele será removido de ${n} recorte(s).`); } catch {} if (!ok) return; }
    update((p) => ({
      codes: p.codes.filter((c) => c.id !== codeId),
      excerpts: p.excerpts.map((e) => ({ ...e, codeIds: e.codeIds.filter((c) => c !== codeId) })).filter((e) => e.codeIds.length > 0),
      categories: p.categories.map((cat) => ({ ...cat, codeIds: cat.codeIds.filter((c) => c !== codeId) })),
    }));
  }
  function renameCode(codeId, name) {
    update((p) => ({ codes: p.codes.map((c) => c.id === codeId ? { ...c, name } : c) }));
  }
  function mergeCode(fromId, intoId) {
    if (!fromId || !intoId || fromId === intoId) return;
    update((p) => ({
      codes: p.codes.filter((c) => c.id !== fromId),
      excerpts: p.excerpts.map((e) => e.codeIds.includes(fromId)
        ? { ...e, codeIds: [...new Set(e.codeIds.map((c) => c === fromId ? intoId : c))] } : e),
      categories: p.categories.map((cat) => ({ ...cat, codeIds: [...new Set(cat.codeIds.map((c) => c === fromId ? intoId : c))] })),
    }));
  }
  function removeExcerpt(id) {
    update((p) => ({ excerpts: p.excerpts.filter((e) => e.id !== id) }));
    if (selExcerpt === id) setSelExcerpt(null);
  }
  function setExcerptMemo(id, memo) {
    update((p) => ({ excerpts: p.excerpts.map((e) => e.id === id ? { ...e, memo } : e) }));
  }
  function toggleCodeOnExcerpt(exId, codeId) {
    update((p) => ({
      excerpts: p.excerpts.map((e) => e.id === exId
        ? { ...e, codeIds: e.codeIds.includes(codeId) ? e.codeIds.filter((c) => c !== codeId) : [...e.codeIds, codeId] }
        : e),
    }));
  }

  // ---- categorias ----
  function addCategory(name = "Nova categoria", tipo = "emergente") {
    update((p) => ({ categories: [...p.categories, { id: uid(), name, tipo, desc: "", codeIds: [] }] }));
  }
  function updateCategory(id, patch) {
    update((p) => ({ categories: p.categories.map((c) => c.id === id ? { ...c, ...patch } : c) }));
  }
  function removeCategory(id) {
    const c = project.categories.find((x) => x.id === id);
    let ok = true; try { ok = window.confirm(`Excluir a categoria "${c ? c.name : ""}"? Os códigos não são apagados, apenas desvinculados.`); } catch {}
    if (!ok) return;
    update((p) => ({ categories: p.categories.filter((c) => c.id !== id) }));
  }
  function clearProject() {
    const hasContent = project.text || project.codes.length || project.excerpts.length || project.categories.length || project.metatexts.length;
    if (hasContent) { let ok = true; try { ok = window.confirm("Limpar este projeto? Texto, códigos, recortes, categorias e metatextos serão apagados (o nome é mantido)."); } catch {} if (!ok) return; }
    update(() => ({ text: "", codes: [], excerpts: [], categories: [], metatexts: [], wordExclude: [] }));
    setPending(null); setSelExcerpt(null); setTab("codificacao");
  }
  function toggleCodeInCategory(catId, codeId) {
    update((p) => ({
      categories: p.categories.map((c) => c.id === catId
        ? { ...c, codeIds: c.codeIds.includes(codeId) ? c.codeIds.filter((x) => x !== codeId) : [...c.codeIds, codeId] }
        : c),
    }));
  }

  // ---- metatexto ----
  function addMetatext(categoryId = null) {
    const cat = project.categories.find((c) => c.id === categoryId);
    const m = { id: uid(), title: cat ? cat.name : "Metatexto", categoryId, body: "" };
    update((p) => ({ metatexts: [...p.metatexts, m] }));
    return m.id;
  }
  function updateMetatext(id, patch) {
    update((p) => ({ metatexts: p.metatexts.map((m) => m.id === id ? { ...m, ...patch } : m) }));
  }
  function removeMetatext(id) {
    update((p) => ({ metatexts: p.metatexts.filter((m) => m.id !== id) }));
  }

  // ---- export / import ----
  function downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  function saveFile() {
    const base = (project.name || "projeto").replace(/\s+/g, "_");
    downloadFile(base + ".codifica.json", JSON.stringify(project, null, 2), "application/json");
  }
  function exportHTML() {
    const base = (project.name || "projeto").replace(/\s+/g, "_");
    downloadFile(base + ".html", buildStandaloneHTML(project), "text/html;charset=utf-8");
  }
  function exportReport() {
    const lines = [];
    lines.push("# " + project.name + "\n");
    lines.push("## Categorias\n");
    project.categories.forEach((cat) => {
      lines.push(`### ${cat.name} (${cat.tipo})`);
      if (cat.desc) lines.push(cat.desc);
      const codes = project.codes.filter((c) => cat.codeIds.includes(c.id));
      codes.forEach((c) => {
        const exs = project.excerpts.filter((e) => e.codeIds.includes(c.id));
        lines.push(`- **${c.name}** (${exs.length})`);
        exs.slice(0, 50).forEach((e) => lines.push(`  > ${e.text.replace(/\n/g, " ").trim()}`));
      });
      lines.push("");
    });
    if (project.metatexts.length) {
      lines.push("## Metatextos / Inferências\n");
      project.metatexts.forEach((m) => { lines.push(`### ${m.title}`); lines.push(m.body + "\n"); });
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (project.name || "relatorio").replace(/\s+/g, "_") + ".md";
    a.click(); URL.revokeObjectURL(url);
  }
  function openFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      const obj = parseJSON(String(r.result));
      if (!obj || typeof obj.text !== "string" || !Array.isArray(obj.codes)) {
        alert("Arquivo inválido. Use um arquivo .codifica.json salvo por esta ferramenta.");
        return;
      }
      const p = { ...emptyProject(), ...obj, id: uid() };
      await saveKey(STORE.proj(p.id), p);
      const ni = [...index, { id: p.id, name: p.name }];
      setIndex(ni); await saveKey(STORE.index, ni); await saveKey(STORE.active, p.id);
      setProject(p); setPending(null); setSelExcerpt(null);
    };
    r.readAsText(f);
    e.target.value = "";
  }

  // ---- derivados ----
  const codeMap = useMemo(() => Object.fromEntries((project?.codes || []).map((c) => [c.id, c])), [project]);
  const segments = useMemo(() => project ? buildSegments(project.text, project.excerpts) : [], [project]);
  const codeFreq = useMemo(() => {
    if (!project) return [];
    return project.codes.map((c) => ({
      id: c.id, name: c.name, color: c.color,
      n: project.excerpts.filter((e) => e.codeIds.includes(c.id)).length,
    })).sort((a, b) => b.n - a.n);
  }, [project]);
  const catFreq = useMemo(() => {
    if (!project) return [];
    return project.categories.map((cat) => {
      const exs = project.excerpts.filter((e) => e.codeIds.some((id) => cat.codeIds.includes(id)));
      return { id: cat.id, name: cat.name, tipo: cat.tipo, codes: cat.codeIds.length, n: exs.length };
    });
  }, [project]);
  const cooc = useMemo(() => {
    if (!project) return [];
    const m = {};
    project.excerpts.forEach((e) => {
      const ids = [...new Set(e.codeIds)];
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join("|");
          m[key] = (m[key] || 0) + 1;
        }
    });
    return Object.entries(m).map(([k, n]) => { const [a, b] = k.split("|"); return { a, b, n }; }).sort((x, y) => y.n - x.n).slice(0, 12);
  }, [project]);

  useModalTrap(showHelp, qHelpRef, () => setShowHelp(false));

  if (!project) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#5d4e42" }}>Carregando…</div>;

  const C = {
    paper: "#ffffff", ink: "#2b3a48", sub: "#6b7c8a", line: "#e3e9ee",
    panel: "#f7f9fb", accent: "#1f7a8c", accentSoft: "#e6eff3",
  };

  const TABS = [
    ["codificacao", "Codificação"],
    ["categorias", "Categorias"],
    ["quantitativo", "Quantitativo"],
    ["confiabilidade", "Confiabilidade"],
    ["metatexto", "Metatexto"],
  ];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: C.ink, background: C.paper, height: "88vh", minHeight: 560, display: "flex", flexDirection: "column", borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 8, gap: 12, padding: "10px 16px", borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ fontWeight: 700, letterSpacing: 0.5, fontSize: 16, color: C.accent }}>Análise textual</div>
        <span style={{ fontSize: 11, color: C.sub, fontFamily: "system-ui" }}>análise qualitativa</span>
        <Btn onClick={loadExample}>Exemplo</Btn>
        <Btn onClick={() => setShowHelp(true)}>? Ajuda</Btn>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: saving ? C.sub : "#2e7d4f", fontFamily: "system-ui", minWidth: 78, textAlign: "right" }} title="o trabalho é salvo automaticamente no navegador">
          {saving ? "salvando…" : savedAt ? "✓ salvo " + new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
        <select value={project.id} onChange={(e) => switchProject(e.target.value)}
          style={{ fontFamily: "system-ui", fontSize: 12, padding: "4px 8px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff" }}>
          {index.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input value={project.name} onChange={(e) => update({ name: e.target.value })}
          style={{ fontFamily: "system-ui", fontSize: 12, padding: "4px 8px", width: 130, border: `1px solid ${C.line}`, borderRadius: 4 }} />
        <label style={btnStyle(C)}>Abrir<input type="file" accept=".json,application/json" onChange={openFile} style={{ display: "none" }} /></label>
        <Btn onClick={saveFile}>Salvar</Btn>
        <Btn onClick={exportHTML}>Compartilhar</Btn>
        <Btn onClick={exportReport}>Relatório</Btn>
        <Btn onClick={newProject}>+ projeto</Btn>
        <Btn onClick={clearProject}>Limpar</Btn>
        <Btn onClick={deleteProject} danger>apagar</Btn>
      </div>
      {showHelp && (
        <div onClick={() => setShowHelp(false)} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(20,30,38,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000 }}>
          <div ref={qHelpRef} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, maxWidth: 700, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,.25)", padding: "22px 26px", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: "#2b3a42" }}>Ajuda — Análise textual</h2>
              <button onClick={() => setShowHelp(false)} aria-label="fechar" style={{ border: "none", background: "#eef3f6", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: "#5a6b7a" }}>×</button>
            </div>
            <div style={{ fontSize: 12.5, color: "#7a8b99", marginBottom: 16 }}>Como fazer análise qualitativa de texto aqui. Pressione Esc para fechar.</div>
            {QHELP.map((sec, i) => (
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

      {/* tabs */}
      <div style={{ display: "flex", gap: 2, padding: "6px 16px 0", background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            fontFamily: "system-ui", fontSize: 13, padding: "7px 14px", border: "none", cursor: "pointer",
            background: tab === k ? C.paper : "transparent", color: tab === k ? C.accent : C.sub,
            borderBottom: tab === k ? `2px solid ${C.accent}` : "2px solid transparent", fontWeight: tab === k ? 600 : 400,
            borderRadius: "4px 4px 0 0",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {tab === "codificacao" && (
          <CodificacaoView {...{ project, segments, codeMap, C, pending, setPending, selExcerpt, setSelExcerpt,
            addCode, assignCode, removeCode, renameCode, mergeCode, removeExcerpt, setExcerptMemo, toggleCodeOnExcerpt,
            pasteMode, setPasteMode, pasteVal, setPasteVal, applyPaste, fileRef, onFile, onMouseUp }} />
        )}
        {tab === "categorias" && (
          <CategoriasView {...{ project, codeFreq, C, addCategory, updateCategory, removeCategory, toggleCodeInCategory }} />
        )}
        {tab === "quantitativo" && (
          <QuantitativoView {...{ project, codeFreq, catFreq, cooc, codeMap, C, excludeWord, includeWord }} />
        )}
        {tab === "confiabilidade" && (
          <ConfiabilidadeView {...{ projectA: project, index, cmpB, onPickB, onFileB, onExample: loadReliabilityExample, C }} />
        )}
        {tab === "metatexto" && (
          <MetatextoView {...{ project, C, addMetatext, updateMetatext, removeMetatext }} />
        )}
      </div>
    </div>
  );
}

function btnStyle(C) {
  return { fontFamily: "system-ui", fontSize: 12, padding: "5px 10px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff", color: C.ink, cursor: "pointer", whiteSpace: "nowrap" };
}
function Btn({ children, onClick, danger }) {
  const C = { line: "#e3e9ee", ink: "#2b3a48" };
  return <button onClick={onClick} style={{ ...btnStyle(C), color: danger ? "#b03a2e" : C.ink }}>{children}</button>;
}

// ============ CODIFICAÇÃO ============
function CodificacaoView(props) {
  const { project, segments, codeMap, C, pending, setPending, selExcerpt, setSelExcerpt,
    addCode, assignCode, removeCode, renameCode, mergeCode, removeExcerpt, setExcerptMemo, toggleCodeOnExcerpt,
    pasteMode, setPasteMode, pasteVal, setPasteVal, applyPaste, fileRef, onFile, onMouseUp } = props;
  const [newCode, setNewCode] = useState("");
  const ex = selExcerpt ? project.excerpts.find((e) => e.id === selExcerpt) : null;
  const [q, setQ] = useState("");
  const [mi, setMi] = useState(0);
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const scrollRef = useRef(null);
  const matchPositions = useMemo(() => {
    if (!q.trim() || !project.text) return [];
    const res = []; const t = project.text.toLowerCase(); const needle = q.toLowerCase();
    let idx = t.indexOf(needle);
    while (idx >= 0) { res.push(idx); idx = t.indexOf(needle, idx + needle.length); }
    return res;
  }, [q, project.text]);
  useEffect(() => { setMi(0); }, [q]);
  useEffect(() => {
    if (!matchPositions.length || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-mi="${mi}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [mi, matchPositions]);
  const renderSegContent = (seg) => {
    if (!q.trim()) return seg.text;
    const t = seg.text, lower = t.toLowerCase(), needle = q.toLowerCase();
    const parts = []; let from = 0, idx = lower.indexOf(needle), k = 0;
    while (idx >= 0) {
      if (idx > from) parts.push(t.slice(from, idx));
      const abs = seg.start + idx, gi = matchPositions.indexOf(abs);
      parts.push(<mark key={"m" + k++} data-mi={gi} style={{ background: gi === mi ? "#ffca28" : "#fff1a8", color: "inherit", padding: 0, borderRadius: 2 }}>{t.slice(idx, idx + needle.length)}</mark>);
      from = idx + needle.length; idx = lower.indexOf(needle, from);
    }
    if (from < t.length) parts.push(t.slice(from));
    return parts;
  };

  return (
    <>
      {/* texto */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.line}` }}>
        {!project.text && !pasteMode && (
          <div style={{ margin: "auto", textAlign: "center", fontFamily: "system-ui", color: C.sub }}>
            <p style={{ marginBottom: 16, fontSize: 14 }}>Comece pelo material a analisar.</p>
            <label style={{ ...btnStyle(C), display: "inline-block", marginRight: 8, background: C.accent, color: "#fff", border: "none", padding: "8px 16px" }}>
              Abrir arquivo (.txt, .docx)<input ref={fileRef} type="file" accept=".txt,.docx,text/plain" onChange={onFile} style={{ display: "none" }} />
            </label>
            <button onClick={() => setPasteMode(true)} style={{ ...btnStyle(C), padding: "8px 16px" }}>Colar texto</button>
          </div>
        )}
        {pasteMode && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%" }}>
            <textarea value={pasteVal} onChange={(e) => setPasteVal(e.target.value)} placeholder="Cole aqui a entrevista, documento ou corpus…"
              style={{ flex: 1, fontFamily: "system-ui", fontSize: 14, padding: 12, border: `1px solid ${C.line}`, borderRadius: 4, resize: "none" }} />
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button onClick={applyPaste} style={{ ...btnStyle(C), background: C.accent, color: "#fff", border: "none" }}>Usar este texto</button>
              <button onClick={() => setPasteMode(false)} style={btnStyle(C)}>Cancelar</button>
            </div>
          </div>
        )}
        {project.text && !pasteMode && (
          <>
            <div style={{ padding: "6px 12px", fontFamily: "system-ui", fontSize: 11, color: C.sub, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>{project.text.length} caracteres</span>
              <span>{project.excerpts.length} recortes</span>
              <label style={{ ...btnStyle(C), padding: "3px 9px", fontSize: 11, cursor: "pointer" }} title="substituir o texto por um arquivo .txt ou .docx">
                Importar texto<input type="file" accept=".txt,.docx,text/plain" onChange={onFile} style={{ display: "none" }} />
              </label>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar no texto…"
                  onKeyDown={(e) => { if (e.key === "Enter" && matchPositions.length) setMi((mi + (e.shiftKey ? -1 : 1) + matchPositions.length) % matchPositions.length); }}
                  style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 8px", border: `1px solid ${C.line}`, borderRadius: 4, width: 150 }} />
                {q.trim() !== "" && (
                  <>
                    <span style={{ minWidth: 64, textAlign: "center" }}>{matchPositions.length ? `${mi + 1} de ${matchPositions.length}` : "0 de 0"}</span>
                    <button onClick={() => matchPositions.length && setMi((mi - 1 + matchPositions.length) % matchPositions.length)} disabled={!matchPositions.length} style={{ ...btnStyle(C), padding: "2px 8px", fontSize: 12 }} aria-label="ocorrência anterior" title="anterior">‹</button>
                    <button onClick={() => matchPositions.length && setMi((mi + 1) % matchPositions.length)} disabled={!matchPositions.length} style={{ ...btnStyle(C), padding: "2px 8px", fontSize: 12 }} aria-label="próxima ocorrência" title="próxima">›</button>
                    <button onClick={() => setQ("")} style={{ ...btnStyle(C), padding: "2px 8px", fontSize: 12 }} aria-label="limpar busca" title="limpar busca">✕</button>
                  </>
                )}
              </div>
            </div>
            <div ref={scrollRef} onMouseUp={onMouseUp} style={{ flex: 1, overflow: "auto", padding: "18px 22px", fontSize: 16, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>
              {segments.map((seg, i) => {
                const cov = seg.covering;
                const c0 = cov[0] ? codeMap[cov[0].codeIds[0]] : null;
                const isSel = cov.some((e) => e.id === selExcerpt);
                return (
                  <span key={i} data-start={seg.start}
                    onClick={() => cov.length && setSelExcerpt(cov[cov.length - 1].id)}
                    title={cov.length ? cov.flatMap((e) => e.codeIds.map((id) => codeMap[id]?.name)).filter(Boolean).join(", ") : ""}
                    style={{
                      background: c0 ? (c0.color + (isSel ? "55" : "30")) : "transparent",
                      borderBottom: cov.length > 1 ? `2px dotted ${c0?.color || C.accent}` : c0 ? `2px solid ${c0.color}` : "none",
                      cursor: cov.length ? "pointer" : "text",
                      boxShadow: isSel ? `0 0 0 1px ${c0?.color || C.accent}` : "none",
                      borderRadius: 2,
                    }}>{renderSegContent(seg)}</span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* painel direito */}
      <div style={{ width: 320, display: "flex", flexDirection: "column", background: C.panel, overflow: "auto" }}>
        {/* recorte pendente */}
        {pending && (
          <div style={{ padding: 14, borderBottom: `1px solid ${C.line}`, background: C.accentSoft }}>
            <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 6 }}>RECORTE SELECIONADO</div>
            <div style={{ fontSize: 13, fontStyle: "italic", maxHeight: 70, overflow: "auto", marginBottom: 8 }}>"{pending.text}"</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newCode.trim()) { assignCode(addCode(newCode)); setNewCode(""); } }}
                placeholder="novo código + Enter"
                style={{ flex: 1, fontFamily: "system-ui", fontSize: 12, padding: "5px 8px", border: `1px solid ${C.line}`, borderRadius: 4 }} />
            </div>
            <div style={{ fontFamily: "system-ui", fontSize: 10, color: C.sub, marginBottom: 4 }}>aplicar código existente:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {project.codes.map((c) => (
                <button key={c.id} onClick={() => assignCode(c.id)}
                  style={{ fontFamily: "system-ui", fontSize: 11, padding: "3px 8px", border: "none", borderRadius: 10, background: c.color, color: "#fff", cursor: "pointer" }}>{c.name}</button>
              ))}
            </div>
            <button onClick={() => setPending(null)} style={{ ...btnStyle(C), fontSize: 11, marginTop: 8 }}>cancelar</button>
          </div>
        )}

        {/* excerto selecionado */}
        {ex && !pending && (
          <div style={{ padding: 14, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 6 }}>RECORTE CODIFICADO</div>
            <div style={{ fontSize: 13, fontStyle: "italic", maxHeight: 80, overflow: "auto", marginBottom: 8 }}>"{ex.text}"</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {project.codes.map((c) => (
                <button key={c.id} onClick={() => toggleCodeOnExcerpt(ex.id, c.id)}
                  style={{ fontFamily: "system-ui", fontSize: 11, padding: "3px 8px", border: `1px solid ${c.color}`, borderRadius: 10,
                    background: ex.codeIds.includes(c.id) ? c.color : "#fff", color: ex.codeIds.includes(c.id) ? "#fff" : c.color, cursor: "pointer" }}>{c.name}</button>
              ))}
            </div>
            <textarea value={ex.memo} onChange={(e) => setExcerptMemo(ex.id, e.target.value)} placeholder="memo analítico deste recorte…"
              style={{ width: "100%", fontFamily: "system-ui", fontSize: 12, padding: 8, border: `1px solid ${C.line}`, borderRadius: 4, resize: "vertical", minHeight: 50, boxSizing: "border-box" }} />
            <button onClick={() => removeExcerpt(ex.id)} style={{ ...btnStyle(C), fontSize: 11, marginTop: 8, color: "#b03a2e" }}>remover recorte</button>
          </div>
        )}

        {/* lista de códigos */}
        <div style={{ padding: 14 }}>
          <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 8 }}>CÓDIGOS ({project.codes.length})</div>
          {project.codes.length === 0 && <div style={{ fontFamily: "system-ui", fontSize: 12, color: C.sub }}>Nenhum código ainda. Selecione um trecho no texto.</div>}
          {project.codes.map((c) => {
            const n = project.excerpts.filter((e) => e.codeIds.includes(c.id)).length;
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                <input value={c.name} onChange={(e) => renameCode(c.id, e.target.value)}
                  style={{ flex: 1, fontFamily: "system-ui", fontSize: 13, border: "none", background: "transparent", borderBottom: `1px solid transparent` }}
                  onFocus={(e) => e.target.style.borderBottom = `1px solid ${C.line}`} onBlur={(e) => e.target.style.borderBottom = "1px solid transparent"} />
                <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>{n}</span>
                <button onClick={() => removeCode(c.id)} style={{ border: "none", background: "transparent", color: C.sub, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            );
          })}
          {project.codes.length >= 2 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 6 }}>MESCLAR CÓDIGOS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 6px", border: `1px solid ${C.line}`, borderRadius: 4, maxWidth: 110 }}>
                  <option value="">de…</option>
                  {project.codes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span style={{ fontSize: 12, color: C.sub }}>em</span>
                <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 6px", border: `1px solid ${C.line}`, borderRadius: 4, maxWidth: 110 }}>
                  <option value="">…</option>
                  {project.codes.filter((c) => c.id !== mergeFrom).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button disabled={!mergeFrom || !mergeInto} onClick={() => {
                  const a = project.codes.find((c) => c.id === mergeFrom), b = project.codes.find((c) => c.id === mergeInto);
                  let ok = true; try { ok = window.confirm(`Mesclar "${a?.name}" em "${b?.name}"? Os recortes de "${a?.name}" passam a usar "${b?.name}" e o código "${a?.name}" é removido.`); } catch {}
                  if (ok) { mergeCode(mergeFrom, mergeInto); setMergeFrom(""); setMergeInto(""); }
                }} style={{ ...btnStyle(C), fontSize: 12, padding: "3px 10px", opacity: (!mergeFrom || !mergeInto) ? 0.5 : 1 }}>mesclar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============ CATEGORIAS ============
function CategoriasView({ project, codeFreq, C, addCategory, updateCategory, removeCategory, toggleCodeInCategory }) {
  const assigned = new Set(project.categories.flatMap((c) => c.codeIds));
  const livres = codeFreq.filter((c) => !assigned.has(c.id));
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => addCategory("Nova categoria", "emergente")} style={{ ...btnStyle(C), background: C.accent, color: "#fff", border: "none" }}>+ categoria emergente</button>
        <button onClick={() => addCategory("Nova categoria", "apriori")} style={btnStyle(C)}>+ categoria a priori</button>
        <span style={{ marginLeft: "auto", fontFamily: "system-ui", fontSize: 11, color: C.sub }}>{livres.length} código(s) sem categoria</span>
      </div>


      {/* códigos livres */}
      {livres.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, border: `1px dashed ${C.line}`, borderRadius: 6 }}>
          <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub, marginBottom: 8 }}>SEM CATEGORIA — clique para incluir na categoria desejada abaixo</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {livres.map((c) => <span key={c.id} style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 8px", borderRadius: 10, background: c.color, color: "#fff" }}>{c.name} ({c.n})</span>)}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {project.categories.map((cat) => (
          <div key={cat.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <input value={cat.name} onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                style={{ flex: 1, fontFamily: "system-ui", fontSize: 14, fontWeight: 600, border: "none", background: "transparent" }} />
              <select value={cat.tipo} onChange={(e) => updateCategory(cat.id, { tipo: e.target.value })}
                style={{ fontFamily: "system-ui", fontSize: 10, border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 4px" }}>
                <option value="emergente">emergente</option>
                <option value="apriori">a priori</option>
              </select>
              <button onClick={() => removeCategory(cat.id)} style={{ border: "none", background: "transparent", color: C.sub, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <textarea value={cat.desc} onChange={(e) => updateCategory(cat.id, { desc: e.target.value })} placeholder="definição da categoria…"
              style={{ width: "100%", fontFamily: "system-ui", fontSize: 12, padding: 6, border: `1px solid ${C.line}`, borderRadius: 4, resize: "vertical", minHeight: 36, boxSizing: "border-box", marginBottom: 8 }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {codeFreq.map((c) => {
                const inCat = cat.codeIds.includes(c.id);
                return (
                  <button key={c.id} onClick={() => toggleCodeInCategory(cat.id, c.id)}
                    style={{ fontFamily: "system-ui", fontSize: 11, padding: "3px 8px", borderRadius: 10, cursor: "pointer",
                      border: `1px solid ${c.color}`, background: inCat ? c.color : "#fff", color: inCat ? "#fff" : c.color, opacity: inCat ? 1 : 0.55 }}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {project.categories.length === 0 && <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub, marginTop: 20 }}>Nenhuma categoria. Crie uma e clique nos códigos para agregá-los, ou peça uma sugestão à IA.</div>}
    </div>
  );
}

// ============ QUANTITATIVO ============
function QuantitativoView({ project, codeFreq, catFreq, cooc, codeMap, C, excludeWord, includeWord }) {
  const totalRec = project.excerpts.length;
  const excluded = useMemo(() => new Set((project.wordExclude || []).map((w) => w.toLowerCase())), [project.wordExclude]);
  const topWords = useMemo(() => {
    const toks = (project.text || "").toLowerCase().match(/[\p{L}]+/gu) || [];
    const counts = {};
    for (const w of toks) { if (w.length < 3 || STOPWORDS_PT.has(w) || excluded.has(w)) continue; counts[w] = (counts[w] || 0) + 1; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [project.text, excluded]);
  const cloudW = 580, cloudH = 360;
  const cloud = useMemo(() => buildWordCloud(topWords, cloudW, cloudH), [topWords]);
  const cloudRef = useRef(null);
  const chartRef = useRef(null);
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18, fontFamily: "system-ui" }}>
        <Stat label="recortes" value={totalRec} C={C} />
        <Stat label="códigos" value={project.codes.length} C={C} />
        <Stat label="categorias" value={project.categories.length} C={C} />
        <Stat label="densidade média (cód/recorte)" value={totalRec ? (project.excerpts.reduce((s, e) => s + e.codeIds.length, 0) / totalRec).toFixed(2) : "0"} C={C} />
      </div>

      <SectionTitle C={C}>Frequência por código</SectionTitle>
      {codeFreq.length > 0 ? (
        <>
          <div ref={chartRef} style={{ height: Math.max(180, codeFreq.length * 26), marginBottom: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={codeFreq} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontFamily: "system-ui", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontFamily: "system-ui", fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="n" radius={[0, 3, 3, 0]}>
                  {codeFreq.map((c) => <Cell key={c.id} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
            <button onClick={() => exportSvgElement(chartRef.current && chartRef.current.querySelector("svg"), "frequencia-codigos", "png")} style={{ ...btnStyle(C), fontSize: 11 }}>PNG</button>
            <button onClick={() => exportSvgElement(chartRef.current && chartRef.current.querySelector("svg"), "frequencia-codigos", "svg")} style={{ ...btnStyle(C), fontSize: 11 }}>SVG</button>
          </div>
        </>
      ) : <Empty C={C} />}

      <SectionTitle C={C}>Frequência por categoria</SectionTitle>
      {catFreq.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui", fontSize: 13, marginBottom: 24 }}>
          <thead><tr style={{ textAlign: "left", color: C.sub, borderBottom: `1px solid ${C.line}` }}>
            <th style={{ padding: 6 }}>Categoria</th><th>Tipo</th><th>Códigos</th><th>Recortes</th><th>%</th>
          </tr></thead>
          <tbody>
            {catFreq.map((c) => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                <td style={{ padding: 6, fontWeight: 600 }}>{c.name}</td>
                <td style={{ color: C.sub }}>{c.tipo}</td>
                <td>{c.codes}</td><td>{c.n}</td>
                <td>{totalRec ? Math.round((c.n / totalRec) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty C={C} />}

      <SectionTitle C={C}>Coocorrência de códigos (mesmo recorte)</SectionTitle>
      {cooc.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {cooc.map((p, i) => (
            <div key={i} style={{ fontFamily: "system-ui", fontSize: 12, padding: "5px 10px", border: `1px solid ${C.line}`, borderRadius: 16, background: C.panel }}>
              <b style={{ color: codeMap[p.a]?.color }}>{codeMap[p.a]?.name}</b> + <b style={{ color: codeMap[p.b]?.color }}>{codeMap[p.b]?.name}</b> · {p.n}
            </div>
          ))}
        </div>
      ) : <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub }}>Nenhum recorte com dois ou mais códigos ainda.</div>}

      <SectionTitle C={C}>Palavras frequentes no texto</SectionTitle>
      {topWords.length > 0 ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
            {topWords.map(([word, n]) => {
              const size = 12 + Math.round((n / topWords[0][1]) * 12);
              return (
                <span key={word} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "system-ui", fontSize: size, lineHeight: 1.5, padding: "2px 6px 2px 8px", borderRadius: 14, background: C.panel, border: `1px solid ${C.line}`, color: C.ink }}>
                  {word} <span style={{ color: C.sub, fontSize: 11 }}>{n}</span>
                  <button onClick={() => excludeWord(word)} title="excluir esta palavra da nuvem e das frequentes" style={{ border: "none", background: "transparent", color: C.sub, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>excluir palavra:</span>
            <input placeholder="ex.: entrevistador" onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { excludeWord(e.target.value.trim()); e.target.value = ""; } }}
              style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 8px", border: `1px solid ${C.line}`, borderRadius: 4, width: 150 }} />
            <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>(Enter)</span>
          </div>
          {(project.wordExclude || []).length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
              <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>excluídas:</span>
              {(project.wordExclude || []).map((word) => (
                <span key={word} style={{ fontFamily: "system-ui", fontSize: 11, padding: "2px 6px", borderRadius: 10, background: "#fff", border: `1px dashed ${C.line}`, color: C.sub, textDecoration: "line-through" }}>
                  {word} <button onClick={() => includeWord(word)} title="restaurar" style={{ border: "none", background: "transparent", color: C.accent, cursor: "pointer", fontSize: 12, textDecoration: "none" }}>↺</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub, marginTop: 8 }}>palavras com 3+ letras, sem palavras vazias (artigos, preposições, pronomes etc.)</div>

          <SectionTitle C={C}>Nuvem de palavras</SectionTitle>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", display: "inline-block", maxWidth: "100%", overflow: "hidden" }}>
            <svg ref={cloudRef} viewBox={`0 0 ${cloudW} ${cloudH}`} width={cloudW} height={cloudH} style={{ maxWidth: "100%", height: "auto", display: "block" }} xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width={cloudW} height={cloudH} fill="#ffffff" />
              {cloud.map((p, i) => (
                <text key={i} x={p.x + p.w / 2} y={p.y + p.h * 0.74} textAnchor="middle"
                  fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" fontSize={p.fs} fontWeight={p.n >= (topWords[0] ? topWords[0][1] : 1) * 0.6 ? 700 : 500}
                  fill={PALETTE[p.ci % PALETTE.length]}>{p.word}</text>
              ))}
            </svg>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => exportSvgElement(cloudRef.current, "nuvem-palavras", "png")} style={{ ...btnStyle(C), fontSize: 11 }}>PNG</button>
            <button onClick={() => exportSvgElement(cloudRef.current, "nuvem-palavras", "svg")} style={{ ...btnStyle(C), fontSize: 11 }}>SVG</button>
          </div>
        </>
      ) : <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub }}>Importe ou cole um texto para ver as palavras mais frequentes.</div>}
    </div>
  );
}
function Stat({ label, value, C }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 16px", minWidth: 90 }}>
    <div style={{ fontSize: 24, fontWeight: 700, color: C.accent }}>{value}</div>
    <div style={{ fontSize: 11, color: C.sub }}>{label}</div>
  </div>;
}
function SectionTitle({ children, C }) {
  return <div style={{ fontFamily: "system-ui", fontSize: 12, fontWeight: 600, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5, margin: "4px 0 10px" }}>{children}</div>;
}
function Empty({ C }) { return <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub, marginBottom: 20 }}>Sem dados ainda.</div>; }

// ============ CONFIABILIDADE ENTRE CODIFICADORES ============
function ConfiabilidadeView({ projectA, index, cmpB, onPickB, onFileB, onExample, C }) {
  const res = useMemo(() => (cmpB ? interCoderKappa(projectA, cmpB) : null), [projectA, cmpB]);
  const pct = (x) => (x * 100).toFixed(1) + "%";
  const others = (index || []).filter((p) => p.id !== projectA.id);
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <SectionTitle C={C}>Confiabilidade entre codificadores</SectionTitle>
        <button onClick={onExample} style={{ ...btnStyle(C), fontSize: 11, marginBottom: 10, background: C.accent, color: "#fff", border: "none" }} title="carrega a entrevista de exemplo já com duas codificações (A e B) para ver o cálculo">carregar exemplo (A e B)</button>
      </div>
      <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5, marginBottom: 14, maxWidth: 720 }}>
        Escolha a <b>Codificação B</b> abaixo (outro projeto ou um arquivo .json) para comparar com o projeto atual,
        ou clique em <b>carregar exemplo (A e B)</b> para ver uma demonstração pronta. As duas codificações precisam ser do mesmo texto;
        os códigos são pareados pelo nome.
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>CODIFICAÇÃO A (projeto atual)</div>
          <div style={{ fontWeight: 600 }}>{projectA.name}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>CODIFICAÇÃO B</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={(cmpB && cmpB.id) || ""} onChange={(e) => onPickB(e.target.value)}
              style={{ fontSize: 12, padding: "5px 8px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff" }}>
              <option value="">— escolher projeto —</option>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span style={{ fontSize: 11, color: C.sub }}>ou</span>
            <label style={{ ...btnStyle(C), fontSize: 12 }}>abrir .json<input type="file" accept=".json,application/json" onChange={onFileB} style={{ display: "none" }} /></label>
          </div>
          {cmpB && <div style={{ fontSize: 12, marginTop: 4 }}>B: <b>{cmpB.name}</b></div>}
        </div>
      </div>

      {!cmpB && <Empty C={C} />}
      {cmpB && res && !res.sameText && (
        <div style={{ fontSize: 13, color: "#b3261e", background: "#fdecea", border: "1px solid #f5c6c0", borderRadius: 6, padding: "10px 14px", maxWidth: 720 }}>
          As duas codificações precisam ser exatamente do mesmo texto. Confira se A e B partem do mesmo material.
        </div>
      )}
      {cmpB && res && res.sameText && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Stat label="kappa de Cohen (κ)" value={res.kappa.toFixed(3)} C={C} />
            <Stat label="observada (Po)" value={pct(res.po)} C={C} />
            <Stat label="por acaso (Pe)" value={pct(res.pe)} C={C} />
            <Stat label="nos trechos codificados" value={pct(res.poUnion)} C={C} />
          </div>
          <div style={{ fontSize: 13, marginBottom: 18, maxWidth: 720 }}>
            Concordância <b>{kappaBand(res.kappa)}</b> pela escala de Landis & Koch (1977), sobre {res.n.toLocaleString("pt-BR")} caracteres
            {" "}({res.unionCoded.toLocaleString("pt-BR")} codificados por ao menos um codificador).
          </div>

          <SectionTitle C={C}>Concordância por código</SectionTitle>
          {Object.keys(res.perCode).length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 18, maxWidth: 620 }}>
              <thead><tr style={{ textAlign: "left", color: C.sub, borderBottom: `1px solid ${C.line}` }}>
                <th style={{ padding: 6 }}>Código</th><th>Ambos</th><th>Só A</th><th>Só B</th><th>Concord.</th>
              </tr></thead>
              <tbody>
                {Object.entries(res.perCode).sort((x, y) => (y[1].both + y[1].aOnly + y[1].bOnly) - (x[1].both + x[1].aOnly + x[1].bOnly)).map(([name, v]) => {
                  const tot = v.both + v.aOnly + v.bOnly;
                  return (
                    <tr key={name} style={{ borderBottom: `1px solid ${C.line}` }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{name}</td>
                      <td>{v.both}</td><td>{v.aOnly}</td><td>{v.bOnly}</td>
                      <td>{tot ? Math.round((v.both / tot) * 100) : 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Empty C={C} />}
          {(res.codesA.length === 0 || res.codesB.length === 0) && (
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>Atenção: uma das codificações não tem códigos aplicados.</div>
          )}

          <SectionTitle C={C}>Modelo utilizado</SectionTitle>
          <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6, maxWidth: 720 }}>
            κ = (Po − Pe) / (1 − Pe), em que Po é a concordância observada e Pe a concordância esperada ao acaso.
            <div style={{ marginTop: 6 }}>Cohen, J. (1960). A coefficient of agreement for nominal scales. <i>Educational and Psychological Measurement</i>, 20(1), 37-46.</div>
            <div>Landis, J. R., &amp; Koch, G. G. (1977). The measurement of observer agreement for categorical data. <i>Biometrics</i>, 33(1), 159-174.</div>
          </div>
        </>
      )}
    </div>
  );
}

// ============ METATEXTO ============
function MetatextoView({ project, C, addMetatext, updateMetatext, removeMetatext }) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => addMetatext(null)} style={{ ...btnStyle(C), background: C.accent, color: "#fff", border: "none" }}>+ novo metatexto</button>
        <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>vincule a uma categoria para gerar a partir dos excertos</span>
      </div>
      {project.metatexts.length === 0 && <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub }}>Nenhum metatexto. É aqui que se escreve a interpretação (inferência em Bardin; comunicação/metatexto em Moraes e Galiazzi).</div>}
      {project.metatexts.map((m) => (
        <div key={m.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, marginBottom: 16, maxWidth: 820 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input value={m.title} onChange={(e) => updateMetatext(m.id, { title: e.target.value })}
              style={{ flex: 1, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", fontSize: 18, fontWeight: 700, border: "none", background: "transparent" }} />
            <select value={m.categoryId || ""} onChange={(e) => updateMetatext(m.id, { categoryId: e.target.value || null })}
              style={{ fontFamily: "system-ui", fontSize: 12, padding: "4px 8px", border: `1px solid ${C.line}`, borderRadius: 4 }}>
              <option value="">(sem categoria)</option>
              {project.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => removeMetatext(m.id)} style={{ border: "none", background: "transparent", color: C.sub, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          <textarea value={m.body} onChange={(e) => updateMetatext(m.id, { body: e.target.value })} placeholder="Escreva aqui o metatexto descritivo-interpretativo, com a interpretação apoiada nos recortes…"
            style={{ width: "100%", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", fontSize: 15, lineHeight: 1.7, padding: 12, border: `1px solid ${C.line}`, borderRadius: 4, resize: "vertical", minHeight: 160, boxSizing: "border-box" }} />
        </div>
      ))}
    </div>
  );
}


return App;
})();

/* ===== Casca: seletor de ferramentas ===== */
const TOURQ = [
  { t: "Bem-vindo ao QualMap", b: "O QualMap reúne duas ferramentas de análise qualitativa: o Editor Ator-Rede (diagramas) e a Análise textual (codificação de texto). Vamos ver as duas. Cada uma já abre com um exemplo pronto." },
  { t: "Editor Ator-Rede", b: "Aqui você desenha redes da Teoria Ator-Rede: actantes (caixas) e associações (ligações). O exemplo na tela mostra os tipos de caixa, os momentos da tradução e as relações. Use a seção Inserir para criar e Organizar para arrumar.", tool: "tar" },
  { t: "Editor — análise quantitativa", b: "Dentro do editor, a aba Análise traz tabelas, métricas de rede (grau, intermediação), gráficos e exportação (CSV e relatório em PDF). O botão ? Ajuda do editor explica tudo em detalhe.", tool: "tar" },
  { t: "Análise textual", b: "Aqui você analisa texto: o exemplo já traz uma entrevista codificada. Selecione trechos e aplique códigos, agrupe em categorias, veja o quantitativo e escreva o metatexto. O botão ? Ajuda explica o fluxo.", tool: "qual" },
  { t: "Pronto para usar", b: "Cada ferramenta tem o botão Exemplo (recarrega o exemplo) e o ? Ajuda (guia completo). Você pode salvar e compartilhar o trabalho. Bom uso!", tool: "qual" },
];
export default function App() {
  const [tool, setTool] = useState("tar");
  const [tourQ, setTourQ] = useState(-1);
  const tabs = [["tar", "Editor Ator-Rede"], ["qual", "Análise textual"]];
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
      const payload = { __qualmap: 1, savedAt: new Date().toISOString(), tar, qual };
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
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div style={{ display: tool === "tar" ? "block" : "none", height: "100%" }}><EditorTAR active={tool === "tar"} /></div>
        <div style={{ display: tool === "qual" ? "block" : "none", height: "100%" }}><AnaliseQualitativa /></div>
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
