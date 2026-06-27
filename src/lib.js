import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";


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

function setSizeCtx(v) { SIZE_CTX = v; }

export { VW, VH, SNAP_T, setDims, setSizeCtx, SUITE, useModalTrap, C, NODE_TYPES, TYPE_ORDER, MOMENTS, MOMENT_ORDER, NAT_LBL, ESTAB_LBL, KIND_LBL, brandes, parseCSVfull, csvNorm, colIdx, HELP, TOUR, Hint, REGION_COLORS, wrapText, sizeOf, degreeMap, clipToRect, distToSeg, qPoint, esc, approxW, edgeGeometry, arrowHead, barrierBar, estabBadge, scriptGlyph, calcGlyph, sourceLetter, sourceMark, nodeBody, buildInner, legendMetaFor, snapNode, alignNodes, distributeNodes, depths, forceLayout, arrange, declutter, fillLayout, foldBox, unfoldBox, parseCSV, toGraphML, toGEXF, seedVazio, seedDidatico, seedRedeLivre, seedRedeUnica, seedComparativo, seedCadeia, baseState };
