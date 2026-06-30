import React, { useState, useMemo, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, CartesianGrid, Customized, LabelList, LineChart, Line, AreaChart, Area, Legend } from "recharts";
import * as ST from "./stats.js";

const CHART_COLORS = ["#1f7a8c", "#7a5ea8", "#2e7d4f", "#b06a1f", "#c0392b", "#16a085"];
function histogram(x, nbins = 8) {
  if (x.length < 2) return [];
  const min = Math.min(...x), max = Math.max(...x); if (max === min) return [{ label: String(min), n: x.length }];
  const w = (max - min) / nbins; const bins = Array.from({ length: nbins }, () => 0);
  x.forEach((v) => { let i = Math.floor((v - min) / w); if (i >= nbins) i = nbins - 1; if (i < 0) i = 0; bins[i]++; });
  return bins.map((n, i) => ({ label: (min + i * w).toFixed(1).replace(".", ","), n }));
}

/*
  Janela — Análise Quantitativa (testes estatísticos).
  Independente das outras abas. Fluxo: colar/abrir uma tabela (1ª linha = nomes das
  variáveis), escolher o teste, indicar as variáveis e calcular.
  Inspirado nos tópicos do livro de Moreira. Matemática em stats.js.
*/

const LSK = "qualmap_quant_v2";

// catálogo de testes. impl=false => no roteiro (ainda não implementado).
const TESTS = [
  { group: "Descritivas e estimação", items: [
    { key: "describe", label: "Medidas descritivas (tendência central, variabilidade)", impl: true, kind: "multinum" },
    { key: "ci", label: "Intervalo de confiança da média", impl: true, kind: "num+conf" },
  ] },
  { group: "Comparação de médias (paramétricos)", items: [
    { key: "t1", label: "Teste t — uma amostra", impl: true, kind: "num+mu" },
    { key: "t2", label: "Teste t — duas amostras independentes", impl: true, kind: "num+group" },
    { key: "tp", label: "Teste t — amostras pareadas", impl: true, kind: "2num" },
    { key: "anova", label: "ANOVA de um fator (teste F)", impl: true, kind: "num+group" },
    { key: "anova2", label: "ANOVA fatorial (dois fatores, interação)", impl: true, kind: "num+2group" },
  ] },
  { group: "Correlação e fidedignidade", items: [
    { key: "pearson", label: "Correlação de Pearson", impl: true, kind: "2num" },
    { key: "spearman", label: "Correlação de Spearman (ρ)", impl: true, kind: "2num" },
    { key: "cronbach", label: "Alfa de Cronbach (consistência interna)", impl: true, kind: "multinum" },
  ] },
  { group: "Não-paramétricos", items: [
    { key: "mw", label: "Mann-Whitney U (2 amostras independentes)", impl: true, kind: "num+group" },
    { key: "wilcoxon", label: "Wilcoxon (2 amostras relacionadas)", impl: true, kind: "2num" },
    { key: "chi2", label: "Qui-quadrado (independência)", impl: true, kind: "2cat" },
    { key: "runs", label: "Teste de aleatoriedade (runs / Wald-Wolfowitz)", impl: true, kind: "1num" },
    { key: "fisher", label: "Probabilidade exata de Fisher (2×2)", impl: true, kind: "2cat" },
    { key: "median", label: "Teste da Mediana", impl: true, kind: "num+group" },
    { key: "ks2", label: "Kolmogorov-Smirnov (2 amostras)", impl: true, kind: "num+group" },
    { key: "ww2", label: "Wald-Wolfowitz (2 amostras independentes)", impl: true, kind: "num+group" },
    { key: "moses", label: "Moses (reações extremas)", impl: true, kind: "moses" },
  ] },
];
const ALL = TESTS.flatMap((g) => g.items);

const fmt = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d).replace(".", ",") : "—");
const fmtP = (p) => (!Number.isFinite(p) ? "—" : p < 0.001 ? "< 0,001" : fmt(p, 4));

// detecta o separador de colunas (tab > ; > ,) para não confundir vírgula decimal
function detectDelim(line) {
  const t = (line.match(/\t/g) || []).length, sc = (line.match(/;/g) || []).length, cm = (line.match(/,/g) || []).length;
  if (t > 0 && t >= sc && t >= cm) return "\t";
  if (sc > 0 && sc >= cm) return ";";
  if (cm > 0) return ",";
  return "\t";
}
// parser CSV/TSV com um único separador (respeita aspas)
function parseDelim(text, delim) {
  const rows = []; let i = 0, field = "", row = [], inQ = false;
  const pushF = () => { row.push(field); field = ""; }; const pushR = () => { pushF(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; } field += c; i++; continue; }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === delim) { pushF(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushR(); i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) pushR();
  return rows.filter((r) => r.length && !(r.length === 1 && r[0].trim() === ""));
}
function parseTable(text) {
  const firstLine = String(text).split(/\r?\n/)[0] || "";
  const rows = parseDelim(text, detectDelim(firstLine));
  if (!rows.length) return null;
  const headers = rows[0].map((h, i) => (String(h).trim() || `col${i + 1}`));
  const body = rows.slice(1);
  const cols = {};
  headers.forEach((h, j) => { cols[h] = body.map((r) => (r[j] != null ? r[j] : "")); });
  const numeric = {};
  headers.forEach((h) => { const vals = cols[h].filter((v) => String(v).trim() !== ""); const ok = vals.filter((v) => Number.isFinite(parseFloat(String(v).replace(",", ".")))).length; numeric[h] = vals.length > 0 && ok / vals.length >= 0.8; });
  return { headers, rows: body, cols, numeric, n: body.length };
}

const T = {
  page: { fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: "#2b3a48", padding: "14px 18px", maxWidth: 1180, margin: "0 auto" },
  h2: { fontSize: 17, color: "#1f7a8c", margin: "2px 0 2px" },
  sub: { fontSize: 12, color: "#7a8b99", margin: "0 0 12px" },
  cols: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" },
  card: { background: "#fff", border: "1px solid #e3e9ee", borderRadius: 8, padding: 14 },
  cardH: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a", marginBottom: 8 },
  ta: { width: "100%", boxSizing: "border-box", minHeight: 120, fontFamily: "ui-monospace, monospace", fontSize: 12, padding: 8, border: "1px solid #cfd6dd", borderRadius: 6, resize: "vertical" },
  btn: { padding: "7px 12px", fontSize: 12.5, border: "1px solid #cfd6dd", borderRadius: 6, cursor: "pointer", background: "#fff", color: "#34495e", fontWeight: 600 },
  prim: { padding: "8px 16px", fontSize: 13, border: "none", borderRadius: 6, cursor: "pointer", background: "#1f7a8c", color: "#fff", fontWeight: 700 },
  sel: { padding: "6px 8px", fontSize: 12.5, border: "1px solid #cfd6dd", borderRadius: 5, fontFamily: "inherit", background: "#fff", maxWidth: 260 },
  lbl: { fontSize: 12, color: "#5a6b7a", display: "block", margin: "10px 0 3px", fontWeight: 600 },
  kv: { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13, padding: "3px 0", borderBottom: "1px solid #f2f5f7" },
  th: { textAlign: "left", fontSize: 11, color: "#5a6b7a", fontWeight: 700, padding: "4px 8px", borderBottom: "1px solid #e3e9ee" },
  td: { padding: "3px 8px", fontSize: 12, borderBottom: "1px solid #f2f5f7", whiteSpace: "nowrap" },
};

// seletores (no escopo do módulo p/ não remontar a cada render)
function Picker({ label, value, set, opts }) {
  return (
    <div><label style={T.lbl}>{label}</label>
      <select style={T.sel} value={value || ""} onChange={(e) => set(e.target.value)}>
        <option value="">— escolher —</option>
        {opts.map((h) => <option key={h} value={h}>{h}</option>)}
      </select></div>
  );
}
function MultiPicker({ label, opts, items, onToggle }) {
  return (
    <div><label style={T.lbl}>{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {opts.map((h) => { const on = items.includes(h); return (
          <label key={h} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, border: "1px solid " + (on ? "#1f7a8c" : "#cfd6dd"), background: on ? "#e3f1f4" : "#fff", borderRadius: 5, padding: "4px 8px", cursor: "pointer" }}>
            <input type="checkbox" checked={on} onChange={(e) => onToggle(h, e.target.checked)} />{h}
          </label>); })}
      </div></div>
  );
}

// ---- mini-construtores de MathML (nativo do navegador, sem dependências) ----
const mi = (s) => `<mi>${s}</mi>`, mn = (s) => `<mn>${s}</mn>`, mo = (s) => `<mo>${s}</mo>`, mt = (s) => `<mtext>${s}</mtext>`;
const frac = (a, b) => `<mfrac><mrow>${a}</mrow><mrow>${b}</mrow></mfrac>`;
const sq = (a) => `<msqrt><mrow>${a}</mrow></msqrt>`;
const sp = (a, b) => `<msup><mrow>${a}</mrow><mrow>${b}</mrow></msup>`;
const sb = (a, b) => `<msub><mrow>${a}</mrow><mrow>${b}</mrow></msub>`;
const ov = (a) => `<mover><mrow>${a}</mrow><mo>¯</mo></mover>`;
const par = (a) => mo("(") + a + mo(")");
const M = (b) => `<math xmlns="http://www.w3.org/1998/Math/MathML">${b}</math>`;
const EQ = mo("="), PL = mo("+"), MI_ = mo("−"), PM = mo("±"), CD = mo("·"), SUM = mo("Σ"), BANG = mo("!");
const Xb = ov(mi("X")), Yb = ov(mi("Y"));
const n1 = sb(mi("n"), mn("1")), n2 = sb(mi("n"), mn("2")), X1 = sb(ov(mi("X")), mn("1")), X2 = sb(ov(mi("X")), mn("2"));
const sq2 = (a) => sp(a, mn("2"));

// explicação (reescrita) + fórmula (MathML) + legenda + referência por teste.
// A referência só aparece quando a própria fonte aponta um autor (Siegel, Kerlinger…).
const INFO = {
  describe: {
    e: "Resumem uma distribuição de escores: as medidas de tendência central (média, mediana, moda) indicam em torno de que valor os dados se concentram; as de variabilidade (desvio padrão, amplitude) indicam o quanto eles se espalham. A média sozinha pode esconder diferenças — daí também olhar a dispersão.",
    f: [M(Xb + EQ + frac(SUM + sb(mi("X"), mi("i")) + sb(mi("n"), mi("i")), mi("N"))),
        M(mt("dp") + EQ + sq(frac(SUM + sq2(par(sb(mi("X"), mi("j")) + MI_ + Xb)), mi("N"))))],
    leg: "Mediana: ponto central (50% acima, 50% abaixo). Moda: escore de maior frequência.",
  },
  ci: {
    e: "Faixa de valores dentro da qual, com dado grau de confiança (p.ex. 95%), se espera encontrar a média da população. Quanto mais estreita a faixa, mais precisa a estimativa.",
    f: [M(mt("IC") + EQ + Xb + PM + mi("t") + CD + frac(mi("s"), sq(mi("n"))))],
    leg: "Amostras grandes: t ≈ 1,96 (95%) ou 2,58 (99%).",
  },
  t1: {
    e: "Compara a média de uma amostra com um valor de referência (μ₀). Indicado para amostras pequenas (n<30), supondo escores de uma população normal; verifica se a diferença observada pode ser apenas erro de amostragem.",
    f: [M(mi("t") + EQ + frac(Xb + MI_ + sb(mi("μ"), mn("0")), mi("s") + mo("/") + sq(mi("n"))))],
    leg: "gl = n − 1",
  },
  t2: {
    e: "Compara as médias de dois grupos independentes para decidir se a diferença entre eles é real ou fruto do acaso na amostragem. Supõe normalidade; a versão de Welch (usada aqui) não exige variâncias iguais.",
    f: [M(mt("Welch:") + mi("t") + EQ + frac(X1 + MI_ + X2, sq(frac(sq2(sb(mi("s"), mn("1"))), n1) + PL + frac(sq2(sb(mi("s"), mn("2"))), n2)))),
        M(mt("Student:") + mi("t") + EQ + frac(X1 + MI_ + X2, mi("σ") + CD + sq(frac(mn("1"), n1) + PL + frac(mn("1"), n2)))),
        M(mi("σ") + EQ + sq(frac(n1 + CD + sq2(sb(mi("dp"), mn("1"))) + PL + n2 + CD + sq2(sb(mi("dp"), mn("2"))), n1 + PL + n2 + MI_ + mn("2"))))],
    leg: "Student: gl = n₁ + n₂ − 2. O QualMap usa a versão de Welch.",
  },
  tp: {
    e: "Compara dois escores do mesmo sujeito (ou de pares), por exemplo antes e depois de um tratamento, analisando a média das diferenças. Reduz a influência das diferenças individuais entre os sujeitos.",
    f: [M(mi("t") + EQ + frac(ov(mi("d")), sb(mi("s"), mi("d")) + mo("/") + sq(mi("n"))))],
    leg: "d = X₁ − X₂ (diferença de cada par); gl = n − 1.",
  },
  anova: {
    e: "Generaliza o teste t para três ou mais grupos: compara a variância entre as médias dos grupos com a variância dentro dos grupos (razão F). Indica se há diferença geral, mas não diz qual grupo difere dos demais.",
    f: [M(mi("F") + EQ + frac(sb(mi("V"), mi("b")), sb(mi("V"), mi("w")))),
        M(sb(mi("V"), mi("b")) + EQ + frac(SUM + sq2(sb(mi("x"), mi("b"))), mi("k") + MI_ + mn("1")))],
    leg: "V_w = média das variâncias dentro dos grupos; x_b = média do grupo − média geral; k = nº de grupos.",
  },
  anova2: {
    e: "Analisa ao mesmo tempo o efeito de dois fatores e a interação entre eles sobre a variável dependente. Há interação quando o efeito de um fator depende do nível do outro (no gráfico, as linhas deixam de ser paralelas).",
    f: [M(sb(mt("SQ"), mt("total")) + EQ + sb(mt("SQ"), mi("A")) + PL + sb(mt("SQ"), mi("B")) + PL + sb(mt("SQ"), mt("AB")) + PL + sb(mt("SQ"), mt("erro"))),
        M(mi("F") + EQ + frac(sb(mt("QM"), mt("fonte")), sb(mt("QM"), mt("erro"))) + mt("  ,  ") + mt("QM") + EQ + frac(mt("SQ"), mt("gl")))],
    leg: "Exata para delineamento balanceado.",
    r: "Método conforme Kerlinger (1964).",
  },
  pearson: {
    e: "Mede o grau de associação linear entre duas variáveis, variando de −1 a +1 (0 = sem relação linear). Vale lembrar: correlação, ainda que alta, não implica relação de causa.",
    f: [M(mi("r") + EQ + frac(SUM + mi("x") + mi("y"), sq(par(SUM + sq2(mi("x"))) + par(SUM + sq2(mi("y")))))),
        M(mi("t") + EQ + mi("r") + CD + sq(frac(mi("n") + MI_ + mn("2"), mn("1") + MI_ + sq2(mi("r")))))],
    leg: "x = X − X̄, y = Y − Ȳ; gl = n − 2.",
  },
  spearman: {
    e: "Versão por postos da correlação: mede associação monotônica entre duas variáveis. Útil para dados ordinais ou quando não se quer supor normalidade.",
    f: [M(mi("ρ") + EQ + mn("1") + MI_ + frac(mn("6") + CD + SUM + sq2(mi("d")), mi("n") + par(sq2(mi("n")) + MI_ + mn("1"))))],
    leg: "Sobre os postos (d = diferença de postos). Com empates, usa-se Pearson dos postos.",
    r: "Siegel (1956).",
  },
  cronbach: {
    e: "Avalia a consistência interna de um teste ou escala: o quanto os itens medem a mesma coisa. Só faz sentido somar escores de itens se eles forem internamente consistentes. Vai até 1 — quanto mais próximo de 1, melhor.",
    f: [M(mi("α") + EQ + frac(mi("k"), mi("k") + MI_ + mn("1")) + par(mn("1") + MI_ + frac(SUM + sb(mi("V"), mi("i")), sb(mi("V"), mi("t")))))],
    leg: "k = nº de itens; V_i = variância de cada item; V_t = variância do total.",
    r: "Roteiro de Fernando Lang da Silveira (Instituto de Física, UFRGS).",
  },
  mw: {
    e: "Alternativa não paramétrica ao teste t para dois grupos independentes; trabalha com os postos dos escores, não com seus valores. Indicado para dados ordinais ou quando não se supõe normalidade.",
    f: [M(mi("U") + EQ + sb(mi("R"), mn("1")) + MI_ + frac(n1 + par(n1 + PL + mn("1")), mn("2"))),
        M(mi("z") + EQ + frac(mi("U") + MI_ + frac(n1 + n2, mn("2")), sq(frac(n1 + n2 + par(mi("N") + PL + mn("1")), mn("12")))))],
    leg: "R₁ = soma dos postos do grupo 1 (com correção de empates).",
    r: "Siegel (1956, p. 116).",
  },
  wilcoxon: {
    e: "Alternativa não paramétrica para duas amostras relacionadas (pareadas): usa os postos das diferenças entre os pares, dispensando a suposição de normalidade exigida pelo teste t pareado.",
    f: [M(mi("W") + EQ + mt("mín") + par(sp(mi("W"), mo("+")) + mo(",") + sp(mi("W"), mo("−")))),
        M(mi("z") + EQ + frac(mi("W") + MI_ + frac(mi("n") + par(mi("n") + PL + mn("1")), mn("4")), sq(frac(mi("n") + par(mi("n") + PL + mn("1")) + par(mn("2") + mi("n") + PL + mn("1")), mn("24")))))],
    leg: "Postos de |X₁ − X₂|, com os zeros descartados.",
    r: "Siegel (1956).",
  },
  chi2: {
    e: "Verifica se duas variáveis categóricas estão associadas, comparando as frequências observadas com as esperadas caso fossem independentes. Funciona até com escalas nominais.",
    f: [M(sp(mi("χ"), mn("2")) + EQ + SUM + frac(sq2(par(mi("O") + MI_ + mi("E"))), mi("E")))],
    leg: "E = (total da linha × total da coluna) / N; gl = (linhas − 1)·(colunas − 1).",
    r: "Siegel (1956).",
  },
  fisher: {
    e: "Calcula a probabilidade exata de uma tabela 2×2 com os totais marginais fixos. Indicado quando as amostras são pequenas (frequências esperadas baixas), situação em que o χ² é pouco confiável.",
    f: [M(mi("p") + EQ + frac(par(mi("A") + PL + mi("B")) + BANG + CD + par(mi("C") + PL + mi("D")) + BANG + CD + par(mi("A") + PL + mi("C")) + BANG + CD + par(mi("B") + PL + mi("D")) + BANG, mi("N") + BANG + CD + mi("A") + BANG + CD + mi("B") + BANG + CD + mi("C") + BANG + CD + mi("D") + BANG))],
    leg: "Soma das tabelas tão ou menos prováveis → p bicaudal.",
    r: "Siegel (1956).",
  },
  median: {
    e: "Verifica se dois ou mais grupos diferem em tendência central, contando quantos casos de cada grupo ficam acima e abaixo da mediana global e aplicando o χ² a essa tabela.",
    f: [M(sp(mi("χ"), mn("2")) + EQ + SUM + frac(sq2(par(mi("O") + MI_ + mi("E"))), mi("E")))],
    leg: "Tabela: acima vs. ≤ mediana global, por grupo; gl = nº de grupos − 1.",
    r: "Siegel (1956).",
  },
  ks2: {
    e: "Verifica se duas amostras vêm da mesma distribuição, pela maior distância entre suas distribuições acumuladas. A forma bilateral é sensível a diferenças de qualquer tipo (posição, dispersão, forma).",
    f: [M(mi("D") + EQ + mt("máx") + mo("|") + sb(mi("F"), mn("1")) + par(mi("x")) + MI_ + sb(mi("F"), mn("2")) + par(mi("x")) + mo("|"))],
    leg: "F₁, F₂ = distribuições acumuladas (ECDF); p por aproximação de Kolmogorov, n_e = n₁n₂/(n₁+n₂).",
    r: "Siegel (1956).",
  },
  ww2: {
    e: "Testa se duas amostras vêm da mesma população contra a alternativa de que diferem em qualquer aspecto (posição, dispersão, forma). Baseia-se no número de sequências (runs) ao ordenar os dados combinados dos dois grupos.",
    f: [M(mi("z") + EQ + frac(mi("R") + MI_ + sb(mi("μ"), mi("R")), sb(mi("σ"), mi("R"))) + mt("  ,  ") + sb(mi("μ"), mi("R")) + EQ + frac(mn("2") + n1 + n2, mi("N")) + PL + mn("1"))],
    leg: "R = nº de sequências (runs) ao ordenar os dois grupos combinados.",
    r: "Siegel (1956).",
  },
  runs: {
    e: "Verifica se uma sequência de valores é aleatória, contando as sequências (runs) de valores acima e abaixo da mediana. Poucos ou muitos runs sugerem que a ordem não é casual.",
    f: [M(mi("z") + EQ + frac(mi("R") + MI_ + sb(mi("μ"), mi("R")), sb(mi("σ"), mi("R"))) + mt("  ,  ") + sb(mi("μ"), mi("R")) + EQ + frac(mn("2") + n1 + n2, mi("N")) + PL + mn("1"))],
    leg: "R = nº de sequências (runs) acima/abaixo da mediana.",
    r: "Siegel (1956).",
  },
  moses: {
    e: "Detecta reações extremas: avalia se um grupo experimental se espalha mais (para os dois lados) que o grupo de controle. Útil quando se espera que uma condição leve alguns sujeitos a um extremo e outros ao extremo oposto.",
    f: [M(sb(mi("s"), mi("h")) + EQ + sb(mt("posto"), mt("máx")) + MI_ + sb(mt("posto"), mt("mín")) + PL + mn("1"))],
    leg: "Span dos postos do grupo-controle (aparando h de cada ponta); p exata pela distribuição combinatória do span.",
    r: "Siegel (1956).",
  },
};

// "Quando usar" cada teste (orientação prática)
const WHEN = {
  describe: "Para resumir e descrever uma variável numérica (nota, idade, escore) antes de qualquer teste.",
  ci: "Para estimar a média da população a partir da amostra, com uma margem de confiança.",
  t1: "Para comparar a média de um grupo com um valor de referência (uma meta, uma norma).",
  t2: "Para comparar as médias de dois grupos independentes (ex.: turma A × turma B).",
  tp: "Para comparar duas medidas dos mesmos sujeitos (ex.: pré-teste × pós-teste).",
  anova: "Para comparar as médias de três ou mais grupos de uma vez.",
  anova2: "Para avaliar o efeito de dois fatores e a interação entre eles (ex.: método × turno).",
  pearson: "Para medir a associação linear entre duas variáveis numéricas (ex.: horas de estudo × nota).",
  spearman: "Como Pearson, mas para dados ordinais ou sem normalidade (associação por postos).",
  cronbach: "Para avaliar a consistência interna de uma escala/questionário (vários itens medindo o mesmo construto).",
  mw: "Alternativa não paramétrica ao t de 2 grupos (dados ordinais ou sem normalidade).",
  wilcoxon: "Alternativa não paramétrica ao t pareado (pré × pós sem normalidade).",
  chi2: "Para verificar associação entre duas variáveis categóricas (ex.: sexo × preferência).",
  fisher: "Como o qui-quadrado, mas para tabelas 2×2 com poucos casos.",
  median: "Para comparar a tendência central de 2+ grupos contando acima/abaixo da mediana.",
  ks2: "Para verificar se duas amostras vêm da mesma distribuição (posição, dispersão, forma).",
  ww2: "Para verificar se duas amostras diferem em qualquer aspecto (teste de sequências).",
  runs: "Para verificar se uma sequência de valores é aleatória.",
  moses: "Para detectar reações extremas de um grupo (espalhamento) frente a um controle.",
};

// exemplo carregável por teste: dados + seleção de variáveis (+ parâmetros)
const EX = {
  describe: { d: "nota\n7,5\n8\n6\n9\n7\n5,5\n8,5\n6,5", v: { items: ["nota"] } },
  ci: { d: "nota\n7,5\n8\n6\n9\n7\n5,5\n8,5\n6,5", v: { num: "nota" } },
  t1: { d: "nota\n7,5\n8\n6\n9\n7\n5,5\n8,5\n6,5", v: { num: "nota" }, mu0: "7" },
  t2: { d: "grupo\tnota\nA\t7\nA\t8\nA\t6\nA\t7\nB\t5\nB\t6\nB\t5\nB\t4", v: { num: "nota", group: "grupo" } },
  tp: { d: "pre\tpos\n5\t7\n6\t8\n4\t6\n5\t7\n6\t7\n4\t6", v: { num: "pre", num2: "pos" } },
  anova: { d: "metodo\tnota\nA\t6\nA\t7\nA\t6\nB\t7\nB\t8\nB\t7\nC\t5\nC\t6\nC\t5", v: { num: "nota", group: "metodo" } },
  anova2: { d: "metodo\tturno\tnota\nA\tmanha\t7\nA\tmanha\t8\nA\ttarde\t6\nA\ttarde\t7\nB\tmanha\t5\nB\tmanha\t6\nB\ttarde\t4\nB\ttarde\t5", v: { num: "nota", groupA: "metodo", groupB: "turno" } },
  pearson: { d: "horas\tnota\n1\t5\n2\t6\n3\t6\n4\t7\n5\t8\n6\t9", v: { num: "horas", num2: "nota" } },
  spearman: { d: "horas\tnota\n1\t5\n2\t6\n3\t6\n4\t7\n5\t8\n6\t9", v: { num: "horas", num2: "nota" } },
  cronbach: { d: "i1\ti2\ti3\ti4\n4\t5\t4\t5\n3\t3\t4\t3\n5\t5\t5\t4\n2\t3\t2\t3\n4\t4\t5\t4\n3\t4\t3\t4", v: { items: ["i1", "i2", "i3", "i4"] } },
  mw: { d: "grupo\tnota\nA\t7\nA\t8\nA\t6\nA\t7\nB\t5\nB\t6\nB\t5\nB\t4", v: { num: "nota", group: "grupo" } },
  wilcoxon: { d: "pre\tpos\n5\t7\n6\t8\n4\t6\n5\t7\n6\t7\n4\t6", v: { num: "pre", num2: "pos" } },
  chi2: { d: "sexo\tprefere\nM\tsim\nM\tsim\nM\tnao\nF\tnao\nF\tnao\nF\tsim\nM\tsim\nF\tnao", v: { cat1: "sexo", cat2: "prefere" } },
  fisher: { d: "grupo\tcurou\nA\tsim\nA\tsim\nA\tnao\nB\tnao\nB\tnao\nB\tsim", v: { cat1: "grupo", cat2: "curou" } },
  median: { d: "metodo\tnota\nA\t6\nA\t7\nA\t6\nB\t7\nB\t8\nB\t7\nC\t5\nC\t6\nC\t5", v: { num: "nota", group: "metodo" } },
  ks2: { d: "grupo\tnota\nA\t7\nA\t8\nA\t6\nA\t7\nB\t5\nB\t6\nB\t5\nB\t4", v: { num: "nota", group: "grupo" } },
  ww2: { d: "grupo\tnota\nA\t7\nA\t8\nA\t6\nA\t7\nB\t5\nB\t6\nB\t5\nB\t4", v: { num: "nota", group: "grupo" } },
  runs: { d: "valor\n2\n8\n3\n7\n2\n9\n3\n8\n2\n7", v: { num: "valor" } },
  moses: { d: "grupo\tvalor\nC\t5\nC\t6\nC\t7\nC\t8\nE\t1\nE\t2\nE\t10\nE\t11", v: { num: "valor", group: "grupo" }, h: "0" },
};

// grade (planilha) editável -> dataset; e texto colado -> grade
function emptyGrid(cols = 2, rows = 6) {
  return { headers: Array.from({ length: cols }, (_, i) => "var" + (i + 1)), rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => "")) };
}
function gridToData(grid) {
  const used = new Set();
  const headers = grid.headers.map((h, i) => { let base = String(h).trim() || ("col" + (i + 1)), name = base, k = 2; while (used.has(name)) name = base + "_" + k++; used.add(name); return name; });
  const body = grid.rows.filter((r) => r.some((c) => String(c).trim() !== "")).map((r) => headers.map((_, j) => (r[j] != null ? r[j] : "")));
  if (!headers.length || !body.length) return null;
  const cols = {}; headers.forEach((h, j) => { cols[h] = body.map((r) => r[j]); });
  const numeric = {};
  headers.forEach((h) => { const vals = cols[h].filter((v) => String(v).trim() !== ""); const ok = vals.filter((v) => Number.isFinite(parseFloat(String(v).replace(",", ".")))).length; numeric[h] = vals.length > 0 && ok / vals.length >= 0.8; });
  return { headers, rows: body, cols, numeric, n: body.length };
}
function textToGrid(text) {
  const firstLine = String(text).split(/\r?\n/)[0] || "";
  const rows = parseDelim(text, detectDelim(firstLine));
  if (!rows.length) return null;
  const headers = rows[0].map((h, i) => String(h).trim() || ("col" + (i + 1)));
  const body = rows.slice(1).map((r) => headers.map((_, j) => (r[j] != null ? String(r[j]) : "")));
  return { headers, rows: body.length ? body : [headers.map(() => "")] };
}

function AnaliseQuantitativa({ active = true }) {
  const [grid, setGrid] = useState(() => emptyGrid());
  const [err, setErr] = useState("");
  const [testKey, setTestKey] = useState("describe");
  const [vars, setVars] = useState({});      // seleções: {num, num2, group, cat1, cat2, items:[]}
  const [mu0, setMu0] = useState("0");
  const [conf, setConf] = useState("0.95");
  const [hMoses, setHMoses] = useState("0");
  const [showFormula, setShowFormula] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [result, setResult] = useState(null);
  const [pendingCalc, setPendingCalc] = useState(false);
  const resultRef = useRef(null);
  const chartRef = useRef(null);
  const [chartColor, setChartColor] = useState("#1f7a8c");
  const [chartBins, setChartBins] = useState(8);
  const [chartTitle, setChartTitle] = useState("");
  const [chartH, setChartH] = useState(220);
  const [chartW, setChartW] = useState(null); // null = largura total
  const [chartType, setChartType] = useState("");
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");
  const [showGrid, setShowGrid] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const [showSig, setShowSig] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [sigColor, setSigColor] = useState("#34495e");
  const [sigLegend, setSigLegend] = useState("");
  const [posthocMethod, setPosthocMethod] = useState("welch");
  const [shownPairs, setShownPairs] = useState(() => new Set());
  const [chartOpts, setChartOpts] = useState(false);
  const resultKey = result ? result.key : null;
  useEffect(() => { setChartTitle(""); setXLabel(""); setYLabel(""); setChartType(""); setSigLegend(""); }, [resultKey]); // só zera ao trocar de teste (não a cada recálculo)
  // ao trocar de teste: mostra por padrão os pares significativos da ANOVA (preserva a escolha ao recalcular/trocar método)
  useEffect(() => {
    if (result && result.key === "anova" && result.res.posthoc) setShownPairs(new Set(result.res.posthoc.filter((p) => p.padj < 0.05).map((p) => p.a + "|" + p.b)));
    else setShownPairs(new Set());
  }, [resultKey]);
  // ao trocar o método de pós-hoc, recalcula a ANOVA atual
  useEffect(() => { if (result && result.key === "anova") calcular(); }, [posthocMethod]);

  // arrastar para redimensionar (alça própria, confiável entre navegadores)
  const startResize = (e) => {
    e.preventDefault();
    const el = chartRef.current; if (!el) return;
    const r = el.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY, sw = r.width, sh = r.height;
    const move = (ev) => { setChartW(Math.max(260, Math.round(sw + (ev.clientX - sx)))); setChartH(Math.max(160, Math.round(sh + (ev.clientY - sy)))); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const pValue = result && result.res && Number.isFinite(result.res.p) ? result.res.p : null;
  const stars = (p) => (p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "n.s.");
  const BRACKET_KINDS = ["t2", "anova", "mw", "median", "ks2", "ww2", "moses", "anova2", "chi2", "fisher"];
  const BAR_KINDS = ["t2", "anova", "mw", "median", "ks2", "ww2", "moses", "anova2"];
  const barsType = () => !chartType || chartType === "barras"; // colchete só faz sentido em barras verticais
  // colchetes de pós-hoc da ANOVA (pares significativos), no nível visível em px
  const anovaBrackets = () => (result && result.key === "anova" && result.res.posthoc) ? result.res.posthoc.filter((p) => p.padj < 0.05) : [];
  // desenha o(s) colchete(s) com asteriscos no topo e a legenda do p embaixo — tudo dentro do SVG
  const SigAnno = (props) => {
    if (pValue == null || !showSig || !result) return null;
    const w = props.width || 320, h = props.height || 220, off = props.offset || { left: 40, width: w - 60 };
    const s = stars(pValue);
    const pTxt = pValue < 0.001 ? "p < 0,001" : "p = " + pValue.toFixed(4).replace(".", ",");
    const legend = sigLegend || ((s === "n.s." ? "n.s. (não significativo)" : s) + "  ·  " + pTxt + "   ( ∗ p<0,05 · ∗∗ p<0,01 · ∗∗∗ p<0,001 )");
    const els = [];
    const bracket = (x1, x2, y, st, key) => { const c = (x1 + x2) / 2; els.push(<line key={key + "b"} x1={x1} y1={y} x2={x2} y2={y} stroke={sigColor} strokeWidth={1.2} />, <line key={key + "1"} x1={x1} y1={y} x2={x1} y2={y + 5} stroke={sigColor} strokeWidth={1.2} />, <line key={key + "2"} x1={x2} y1={y} x2={x2} y2={y + 5} stroke={sigColor} strokeWidth={1.2} />, <text key={key + "s"} x={c} y={y - 3} textAnchor="middle" fontSize={14} fontWeight={700} fill={sigColor}>{st === "n.s." ? "ns" : st}</text>); };
    // posições exatas das barras pela escala do eixo X (categórico)
    const xa = props.xAxisMap && props.xAxisMap[Object.keys(props.xAxisMap)[0]]; const scale = xa && xa.scale;
    const cx = (nm) => (scale ? scale(nm) + (scale.bandwidth ? scale.bandwidth() / 2 : 0) : null);
    if (BAR_KINDS.includes(result.key) && barsType() && scale) {
      const gf = result.key === "anova2" ? vars.groupA : vars.group;
      const order = groupMeans(vars.num, gf).map((r) => r.name);
      if (result.key === "anova" && result.res.posthoc) {
        const chosen = result.res.posthoc.filter((p) => shownPairs.has(p.a + "|" + p.b));
        chosen.sort((p, q) => Math.abs(order.indexOf(p.a) - order.indexOf(p.b)) - Math.abs(order.indexOf(q.a) - order.indexOf(q.b)));
        chosen.forEach((pr, i) => { const x1 = cx(pr.a), x2 = cx(pr.b); if (x1 != null && x2 != null) bracket(Math.min(x1, x2), Math.max(x1, x2), 14 + i * 16, stars(pr.padj), "p" + i); });
      } else if (order.length >= 2) {
        const x1 = cx(order[0]), x2 = cx(order[order.length - 1]); if (x1 != null && x2 != null) bracket(Math.min(x1, x2), Math.max(x1, x2), 16, s, "o");
      }
    } else if (result.key === "chi2" || result.key === "fisher") {
      bracket(off.left + off.width * 0.2, off.left + off.width * 0.8, 16, s, "c");
    }
    els.push(<text key="leg" x={w / 2} y={h - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill={sigColor}>{legend}</text>);
    return <g>{els}</g>;
  };

  const dlFile = (blob, name) => { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); };
  const saveChart = (fmt) => {
    const svg = chartRef.current && chartRef.current.querySelector("svg"); if (!svg) return;
    const r = svg.getBoundingClientRect(); const w = Math.round(r.width) || 320, h = Math.round(r.height) || 200;
    const clone = svg.cloneNode(true); clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); clone.setAttribute("width", w); clone.setAttribute("height", h);
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect"); bg.setAttribute("x", 0); bg.setAttribute("y", 0); bg.setAttribute("width", w); bg.setAttribute("height", h); bg.setAttribute("fill", "#ffffff"); clone.insertBefore(bg, clone.firstChild);
    const str = new XMLSerializer().serializeToString(clone);
    if (fmt === "svg") { dlFile(new Blob([str], { type: "image/svg+xml" }), "grafico.svg"); return; }
    const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2; const ctx = c.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); c.toBlob((b) => b && dlFile(b, "grafico.png")); };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(str)));
  };

  const exportPDF = () => {
    const w = window.open("", "_blank"); if (!w) { try { window.alert("Permita pop-ups para gerar o relatório em PDF."); } catch {} return; }
    let dataTbl = "<p>Sem dados.</p>";
    if (data) {
      const head = data.headers.map((h) => `<th style="text-align:left;border-bottom:1px solid #ccc;padding:3px 8px">${h}</th>`).join("");
      const body = data.rows.map((r) => "<tr>" + data.headers.map((_, j) => `<td style="padding:2px 8px;border-bottom:1px solid #eee">${(r[j] != null ? String(r[j]) : "")}</td>`).join("") + "</tr>").join("");
      dataTbl = `<table style="border-collapse:collapse;font-size:13px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }
    const resHTML = result && resultRef.current ? resultRef.current.innerHTML : "<p>Nenhum teste calculado.</p>";
    let metodoBlock = "";
    if (result && INFO[result.key]) {
      const inf = INFO[result.key];
      metodoBlock = `<h2>Método e fórmula</h2><p style="font-size:13px;line-height:1.5">${inf.e}</p><div style="font-size:18px;margin:8px 0">${inf.f.join("")}</div>${inf.leg ? `<p style="font-size:12px;color:#5a6b7a">${inf.leg}</p>` : ""}${inf.r ? `<p style="font-size:11px;color:#888;font-style:italic">${inf.r}</p>` : ""}`;
    }
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Análise Quantitativa</title><style>@media print{.noprint{display:none!important}}@page{margin:16mm}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2b3a48;margin:0}h1{font-size:20px}h2{font-size:15px;border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:24px}</style></head><body onload="setTimeout(function(){window.print()},300)"><div class="noprint" style="position:sticky;top:0;display:flex;gap:10px;align-items:center;background:#1f7a8c;color:#fff;padding:10px 16px">Relatório pronto. <button onclick="window.print()" style="border:none;background:#fff;color:#1f7a8c;font-weight:700;border-radius:6px;padding:6px 14px;cursor:pointer">Imprimir / Salvar como PDF</button><span style="font-size:12px;opacity:.85">escolha "Salvar como PDF" no destino</span></div><div style="max-width:900px;margin:0 auto;padding:24px"><h1>Análise Quantitativa</h1><p style="color:#888;font-size:13px">${data ? data.n + " casos · " + data.headers.length + " variáveis" : "sem dados"}</p><h2>Dados</h2>${dataTbl}<h2>Resultado</h2><div>${resHTML}</div>${metodoBlock}</div></body></html>`;
    w.document.open(); w.document.write(doc); w.document.close();
  };

  // restaurar / autosave (grade)
  useEffect(() => { try { const s = window.localStorage.getItem(LSK); if (s) { const o = JSON.parse(s); if (o && o.grid && Array.isArray(o.grid.headers)) setGrid(o.grid); } } catch {} }, []);
  useEffect(() => { const t = setTimeout(() => { try { window.localStorage.setItem(LSK, JSON.stringify({ grid })); } catch {} }, 600); return () => clearTimeout(t); }, [grid]);

  const data = useMemo(() => gridToData(grid), [grid]);
  const test = ALL.find((t) => t.key === testKey);
  const numCols = useMemo(() => (data ? data.headers.filter((h) => data.numeric[h]) : []), [data]);
  const allCols = data ? data.headers : [];

  // edição da grade
  const setCell = (r, c, v) => setGrid((g) => ({ ...g, rows: g.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) }));
  const setHeader = (c, v) => setGrid((g) => ({ ...g, headers: g.headers.map((h, j) => (j === c ? v : h)) }));
  const addRow = () => setGrid((g) => ({ ...g, rows: [...g.rows, g.headers.map(() => "")] }));
  const addCol = () => setGrid((g) => ({ headers: [...g.headers, "var" + (g.headers.length + 1)], rows: g.rows.map((row) => [...row, ""]) }));
  const removeRow = (r) => setGrid((g) => ({ ...g, rows: g.rows.length > 1 ? g.rows.filter((_, i) => i !== r) : g.rows }));
  const removeCol = (c) => setGrid((g) => (g.headers.length > 1 ? { headers: g.headers.filter((_, j) => j !== c), rows: g.rows.map((row) => row.filter((_, j) => j !== c)) } : g));
  const limpar = () => { setGrid(emptyGrid()); setResult(null); setErr(""); };

  const processar = (txt) => {
    const g = textToGrid(txt);
    if (!g || !g.headers.length) { setErr("Não consegui ler a tabela colada. Verifique se a 1ª linha tem os nomes das colunas."); return; }
    setErr(""); setGrid(g); setShowPaste(false); setResult(null);
  };
  const onFile = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => processar(String(r.result)); r.readAsText(f); e.target.value = ""; };
  const exemplo = () => { setGrid(textToGrid("grupo\tnota\tidade\tpre\tpos\nA\t7,5\t20\t5\t7\nA\t8,0\t22\t6\t8\nA\t6,5\t19\t4\t6\nA\t7,0\t21\t5\t7\nB\t5,5\t23\t4\t5\nB\t6,0\t20\t5\t6\nB\t5,0\t24\t3\t5\nB\t6,5\t22\t4\t6")); setResult(null); setErr(""); };

  const col = (name) => (data && name ? data.cols[name] : []);
  const groupsOf = (numName, groupName) => {
    const g = {}; const order = [];
    data.rows.forEach((r) => {
      const gi = data.headers.indexOf(groupName), ni = data.headers.indexOf(numName);
      const key = String(r[gi]).trim(); const val = parseFloat(String(r[ni]).replace(",", "."));
      if (key === "" || !Number.isFinite(val)) return;
      if (!g[key]) { g[key] = []; order.push(key); }
      g[key].push(val);
    });
    return { order, map: g };
  };
  const contingency = (c1, c2) => {
    const r1 = [...new Set(col(c1).map((v) => String(v).trim()).filter(Boolean))];
    const r2 = [...new Set(col(c2).map((v) => String(v).trim()).filter(Boolean))];
    const tbl = r1.map(() => r2.map(() => 0));
    data.rows.forEach((row) => { const a = String(row[data.headers.indexOf(c1)]).trim(), b = String(row[data.headers.indexOf(c2)]).trim(); const i = r1.indexOf(a), j = r2.indexOf(b); if (i >= 0 && j >= 0) tbl[i][j]++; });
    return { r1, r2, tbl };
  };

  const calcular = () => {
    setErr("");
    try {
      const c = conf ? parseFloat(conf) : 0.95;
      let res = null;
      if (testKey === "describe") {
        const sel = vars.items && vars.items.length ? vars.items : numCols;
        res = { multi: sel.map((h) => ({ name: h, d: ST.describe(col(h)) })).filter((x) => x.d) };
      } else if (testKey === "ci") {
        res = ST.ciMean(col(vars.num), c);
      } else if (testKey === "t1") {
        res = ST.oneSampleT(col(vars.num), parseFloat(String(mu0).replace(",", ".")) || 0, c);
      } else if (testKey === "tp") {
        res = ST.pairedT(col(vars.num), col(vars.num2), c);
      } else if (testKey === "pearson") {
        res = ST.pearson(col(vars.num), col(vars.num2), c);
      } else if (testKey === "spearman") {
        res = ST.spearman(col(vars.num), col(vars.num2));
      } else if (testKey === "wilcoxon") {
        res = ST.wilcoxonSignedRank(col(vars.num), col(vars.num2));
      } else if (testKey === "cronbach") {
        res = ST.cronbach((vars.items || []).map(col));
      } else if (testKey === "runs") {
        res = ST.runsTest(col(vars.num));
      } else if (testKey === "t2" || testKey === "anova" || testKey === "mw" || testKey === "median" || testKey === "ks2" || testKey === "ww2") {
        const { order, map } = groupsOf(vars.num, vars.group);
        if (order.length < 2) throw new Error("A variável de grupo precisa ter ao menos 2 categorias.");
        if (testKey === "anova") {
          res = ST.oneWayAnova(order.map((k) => map[k]), order);
          const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
          const kG = order.length, nP = kG * (kG - 1) / 2; const pairs = [];
          for (let i = 0; i < kG; i++) for (let j = i + 1; j < kG; j++) {
            const a = order[i], b = order[j], ga = map[a], gb = map[b];
            if (posthocMethod === "tukey") {
              const se = Math.sqrt(res.msw / 2 * (1 / ga.length + 1 / gb.length)); const q = Math.abs(mean(ga) - mean(gb)) / se;
              const padj = Math.min(1, 1 - ST.ptukey(q, kG, res.dfw)); pairs.push({ a, b, p: padj, padj });
            } else {
              const tt = ST.twoSampleT(ga, gb, { welch: true }); if (tt && Number.isFinite(tt.p)) pairs.push({ a, b, p: tt.p, padj: Math.min(1, tt.p * nP) });
            }
          }
          res.posthoc = pairs; res.posthocMethod = posthocMethod;
        }
        else if (testKey === "median") res = ST.medianTest(order.map((k) => map[k]), order);
        else {
          if (order.length > 2) throw new Error("Selecione um fator com exatamente 2 grupos (há " + order.length + ").");
          const A = map[order[0]], B = map[order[1]];
          if (testKey === "t2") res = { ...ST.twoSampleT(A, B, { welch: true, conf: c }), g1: order[0], g2: order[1] };
          else if (testKey === "mw") res = { ...ST.mannWhitney(A, B), g1: order[0], g2: order[1] };
          else if (testKey === "ks2") res = { ...ST.ks2(A, B), g1: order[0], g2: order[1] };
          else res = { ...ST.waldWolfowitz2(A, B), g1: order[0], g2: order[1] };
        }
      } else if (testKey === "moses") {
        const { order, map } = groupsOf(vars.num, vars.group);
        if (order.length !== 2) throw new Error("Moses exige exatamente 2 grupos (controle e experimental).");
        res = { ...ST.moses(map[order[0]], map[order[1]], parseInt(hMoses, 10) || 0), control: order[0], experimental: order[1] };
      } else if (testKey === "anova2") {
        if (!vars.num || !vars.groupA || !vars.groupB) throw new Error("Escolha a variável numérica e os dois fatores.");
        res = ST.twoWayAnova(col(vars.num), col(vars.groupA), col(vars.groupB), vars.groupA, vars.groupB);
      } else if (testKey === "chi2" || testKey === "fisher") {
        const { r1, r2, tbl } = contingency(vars.cat1, vars.cat2);
        if (r1.length < 2 || r2.length < 2) throw new Error("Cada variável categórica precisa de ao menos 2 categorias.");
        if (testKey === "fisher") {
          if (r1.length !== 2 || r2.length !== 2) throw new Error("Fisher exige tabela 2×2 (cada variável com exatamente 2 categorias).");
          res = { ...ST.fisherExact(tbl[0][0], tbl[0][1], tbl[1][0], tbl[1][1]), r1, r2, tbl };
        } else res = { ...ST.chiSquareIndependence(tbl), r1, r2, tbl };
      }
      if (res && res.error) { setErr(res.error); setResult(null); } else { setResult({ key: testKey, res }); }
    } catch (e) { setErr(e.message || "Erro no cálculo."); setResult(null); }
  };

  // carrega o exemplo do teste atual (preenche a grade, seleciona as variáveis e calcula)
  const carregarExemploTeste = () => {
    const ex = EX[testKey]; if (!ex) return;
    setErr(""); setGrid(textToGrid(ex.d)); setVars(ex.v || {});
    if (ex.mu0 != null) setMu0(ex.mu0);
    if (ex.h != null) setHMoses(ex.h);
    setResult(null); setPendingCalc(true);
  };
  // quando o exemplo termina de carregar (grade + variáveis prontas), calcula sozinho
  useEffect(() => {
    if (!pendingCalc || !data) return;
    calcular(); setPendingCalc(false);
  }, [pendingCalc, data, vars]);

  // ---------- gráfico apropriado ao teste ----------
  const groupMeans = (numName, grpName) => { const { order, map } = groupsOf(numName, grpName); return order.map((g) => ({ name: g, média: map[g].reduce((a, b) => a + b, 0) / map[g].length })); };
  // monta a definição do gráfico (tipo + título padrão + elemento) conforme o teste
  const chartSpec = () => {
    if (!result || !data) return null;
    const k = result.key;
    const hasP = pValue != null && showSig;
    const nBr = (k === "anova") ? Math.max(1, Math.min(6, shownPairs.size)) : (BRACKET_KINDS.includes(k) ? 1 : 0);
    const drawsBracket = hasP && nBr > 0 && (BAR_KINDS.includes(k) ? barsType() : true);
    const grid = showGrid ? <CartesianGrid stroke="#eef1f4" strokeDasharray="3 3" /> : null;
    const xlab = xLabel ? { value: xLabel, position: "insideBottom", offset: -4, style: { fontSize: 11, fill: "#5a6b7a" } } : undefined;
    const ylab = yLabel ? { value: yLabel, angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#5a6b7a" } } : undefined;
    const sig = hasP ? <Customized component={SigAnno} /> : null;
    const margin = { top: drawsBracket ? (14 + nBr * 16) : 8, right: 12, left: yLabel ? 8 : 0, bottom: (hasP ? 20 : 2) + (xLabel ? 14 : 0) };
    const vlab = (key, dec) => showValues && <LabelList dataKey={key} position="top" formatter={dec != null ? (v) => Number(v).toFixed(dec) : undefined} style={{ fontSize: 10, fill: "#5a6b7a" }} />;
    const xtit = (dk, type) => <XAxis dataKey={dk} type={type} tick={{ fontSize: 10 }} label={xlab} />;
    const ytit = (extra) => <YAxis tick={{ fontSize: 10 }} label={ylab} {...(extra || {})} />;
    const pick = (types) => (chartType && types.some((t) => t[0] === chartType) ? chartType : types[0][0]);
    try {
      if (["describe", "ci", "t1", "runs"].includes(k)) {
        const name = vars.num || (vars.items && vars.items[0]) || numCols[0]; if (!name) return null;
        const h = histogram(ST.toNums(col(name)), chartBins); if (!h.length) return null;
        const types = [["barras", "Histograma (barras)"], ["poligono", "Polígono de frequência"], ["area", "Área"]]; const t = pick(types);
        let el;
        if (t === "poligono") el = <LineChart data={h} margin={margin}>{grid}{xtit("label")}{ytit({ allowDecimals: false })}<Tooltip />{sig}<Line type="monotone" dataKey="n" name="freq." stroke={chartColor} strokeWidth={2} dot>{vlab("n")}</Line></LineChart>;
        else if (t === "area") el = <AreaChart data={h} margin={margin}>{grid}{xtit("label")}{ytit({ allowDecimals: false })}<Tooltip />{sig}<Area type="monotone" dataKey="n" name="freq." stroke={chartColor} fill={chartColor} fillOpacity={0.35}>{vlab("n")}</Area></AreaChart>;
        else el = <BarChart data={h} margin={margin}>{grid}{xtit("label")}{ytit({ allowDecimals: false })}<Tooltip />{sig}<Bar dataKey="n" name="freq." fill={chartColor}>{vlab("n")}</Bar></BarChart>;
        return { kind: "hist", def: "Distribuição — " + name, types, el };
      }
      if (k === "pearson" || k === "spearman" || k === "tp" || k === "wilcoxon") {
        const xn = vars.num, yn = vars.num2; const X = ST.toNums(col(xn)), Y = ST.toNums(col(yn)); const n = Math.min(X.length, Y.length);
        const pts = Array.from({ length: n }, (_, i) => ({ x: X[i], y: Y[i] }));
        const types = [["pontos", "Dispersão (pontos)"], ["linha", "Linha"]]; const t = pick(types);
        const def = (k === "tp" || k === "wilcoxon") ? "Antes × Depois" : "Dispersão — " + xn + " × " + yn;
        let el;
        if (t === "linha") { const ord = [...pts].sort((a, b) => a.x - b.x); el = <LineChart data={ord} margin={margin}>{grid || <CartesianGrid stroke="#eef1f4" />}<XAxis dataKey="x" type="number" tick={{ fontSize: 10 }} label={xlab} />{ytit()}<Tooltip />{sig}<Line type="monotone" dataKey="y" stroke={chartColor} strokeWidth={2} dot /></LineChart>; }
        else el = <ScatterChart margin={margin}>{grid || <CartesianGrid stroke="#eef1f4" />}<XAxis type="number" dataKey="x" name={xn} tick={{ fontSize: 10 }} label={xlab} /><YAxis type="number" dataKey="y" name={yn} tick={{ fontSize: 10 }} label={ylab} /><Tooltip cursor={{ strokeDasharray: "3 3" }} />{sig}<Scatter data={pts} fill={chartColor} /></ScatterChart>;
        return { kind: "scatter", def, types, el };
      }
      const meansChart = (rows) => {
        const types = [["barras", "Barras"], ["horizontais", "Barras horizontais"], ["linha", "Linha"]]; const t = pick(types);
        let el;
        if (t === "horizontais") el = <BarChart data={rows} layout="vertical" margin={{ ...margin, left: 24 }}>{grid}<XAxis type="number" tick={{ fontSize: 10 }} label={xlab} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} label={ylab} /><Tooltip />{sig}<Bar dataKey="média" fill={chartColor}>{vlab("média", 1)}</Bar></BarChart>;
        else if (t === "linha") el = <LineChart data={rows} margin={margin}>{grid}{xtit("name")}{ytit()}<Tooltip />{sig}<Line type="monotone" dataKey="média" stroke={chartColor} strokeWidth={2} dot>{vlab("média", 1)}</Line></LineChart>;
        else el = <BarChart data={rows} margin={margin}>{grid}{xtit("name")}{ytit()}<Tooltip />{sig}<Bar dataKey="média" fill={chartColor}>{vlab("média", 1)}</Bar></BarChart>;
        return { types, el };
      };
      if (["t2", "anova", "mw", "median", "ks2", "ww2", "moses"].includes(k)) { const m = meansChart(groupMeans(vars.num, vars.group)); return { kind: "bars", def: "Médias por grupo — " + vars.num, types: m.types, el: m.el }; }
      if (k === "anova2") { const m = meansChart(groupMeans(vars.num, vars.groupA)); return { kind: "bars", def: "Médias por " + vars.groupA, types: m.types, el: m.el }; }
      if (k === "chi2" || k === "fisher") {
        const { r1, r2, tbl } = contingency(vars.cat1, vars.cat2);
        const rows = r1.map((rn, i) => { const o = { name: rn }; r2.forEach((cn, j) => (o[cn] = tbl[i][j])); return o; });
        const types = [["agrupadas", "Barras agrupadas"], ["empilhadas", "Barras empilhadas"]]; const t = pick(types);
        const el = <BarChart data={rows} margin={margin}>{grid}{xtit("name")}{ytit({ allowDecimals: false })}<Tooltip />{showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}{sig}{r2.map((cn, j) => <Bar key={cn} dataKey={cn} stackId={t === "empilhadas" ? "a" : undefined} fill={CHART_COLORS[j % CHART_COLORS.length]}>{showValues && <LabelList dataKey={cn} position={t === "empilhadas" ? "center" : "top"} style={{ fontSize: 9, fill: t === "empilhadas" ? "#fff" : "#5a6b7a" }} />}</Bar>)}</BarChart>;
        return { kind: "contingency", def: "Frequências — " + vars.cat1 + " × " + vars.cat2, types, el };
      }
    } catch (e) { return null; }
    return null;
  };
  const renderChart = () => {
    const spec = chartSpec(); if (!spec) return null;
    const ctrl = { fontSize: 11.5, padding: "3px 7px", border: "1px solid #cfd6dd", borderRadius: 5, background: "#fff", color: "#34495e", cursor: "pointer" };
    const chk = { fontSize: 11.5, color: "#46555f", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" };
    const inp = { fontSize: 11.5, padding: "4px 7px", border: "1px solid #cfd6dd", borderRadius: 5, width: "100%", boxSizing: "border-box" };
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <input value={chartTitle} onChange={(e) => setChartTitle(e.target.value)} placeholder={spec.def} title="título do gráfico" style={{ flex: "1 1 140px", minWidth: 110, fontSize: 11.5, padding: "4px 7px", border: "1px solid #cfd6dd", borderRadius: 5 }} />
          {spec.types && spec.types.length > 1 && <select value={chartType || spec.types[0][0]} onChange={(e) => setChartType(e.target.value)} title="tipo de gráfico" style={ctrl}>{spec.types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          {spec.kind !== "contingency" && <label title="cor da série" style={{ display: "flex", alignItems: "center", gap: 2 }}><input type="color" value={chartColor} onChange={(e) => setChartColor(e.target.value)} style={{ width: 26, height: 24, padding: 0, border: "1px solid #cfd6dd", borderRadius: 5, background: "none", cursor: "pointer" }} /></label>}
          {pValue != null && <label title="cor da significância (∗ e legenda)" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 12, color: "#5a6b7a" }}>∗<input type="color" value={sigColor} onChange={(e) => setSigColor(e.target.value)} style={{ width: 26, height: 24, padding: 0, border: "1px solid #cfd6dd", borderRadius: 5, background: "none", cursor: "pointer" }} /></label>}
          {spec.kind === "hist" && <select value={chartBins} onChange={(e) => setChartBins(Number(e.target.value))} title="nº de classes" style={ctrl}>{[5, 8, 10, 15, 20].map((b) => <option key={b} value={b}>{b} classes</option>)}</select>}
          <button onClick={() => setChartOpts((v) => !v)} style={{ ...ctrl, fontWeight: 600 }} title="mais opções">⚙ {chartOpts ? "▾" : "▸"}</button>
          <button onClick={() => saveChart("png")} style={ctrl} title="salvar como PNG">PNG</button>
          <button onClick={() => saveChart("svg")} style={ctrl} title="salvar como SVG">SVG</button>
        </div>
        {chartOpts && (
          <div style={{ background: "#f7f9fb", border: "1px solid #e3e9ee", borderRadius: 6, padding: "8px 10px", marginBottom: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ ...chk, display: "block" }}>Rótulo do eixo X<input value={xLabel} onChange={(e) => setXLabel(e.target.value)} style={inp} /></label>
            <label style={{ ...chk, display: "block" }}>Rótulo do eixo Y<input value={yLabel} onChange={(e) => setYLabel(e.target.value)} style={inp} /></label>
            <label style={{ ...chk, display: "block" }}>Largura (px)<input type="number" min="260" value={chartW || ""} placeholder="auto (total)" onChange={(e) => setChartW(e.target.value ? Number(e.target.value) : null)} style={inp} /></label>
            <label style={{ ...chk, display: "block" }}>Altura (px)<input type="number" min="140" value={chartH} onChange={(e) => setChartH(Number(e.target.value) || 220)} style={inp} /></label>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <label style={chk}><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grade</label>
              <label style={chk}><input type="checkbox" checked={showValues} onChange={(e) => setShowValues(e.target.checked)} /> Valores</label>
              <label style={chk}><input type="checkbox" checked={showSig} onChange={(e) => setShowSig(e.target.checked)} /> Significância (∗)</label>
              {spec.kind === "contingency" && <label style={chk}><input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} /> Legenda</label>}
              <button onClick={() => { setChartW(null); setChartH(220); }} style={{ ...ctrl, marginLeft: "auto" }}>tamanho padrão</button>
            </div>
            {pValue != null && showSig && <label style={{ ...chk, display: "block", gridColumn: "1 / -1" }}>Texto da legenda de significância<input value={sigLegend} onChange={(e) => setSigLegend(e.target.value)} placeholder={(stars(pValue) === "n.s." ? "n.s. (não significativo)" : stars(pValue)) + "  ·  p" + (pValue < 0.001 ? " < 0,001" : " = " + pValue.toFixed(4).replace(".", ",")) + "   ( ∗ p<0,05 · ∗∗ p<0,01 · ∗∗∗ p<0,001 )"} style={inp} /></label>}
            {result && result.key === "anova" && result.res.posthoc && (
              <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e3e9ee", paddingTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5a6b7a" }}>Pós-hoc:</span>
                  <select value={posthocMethod} onChange={(e) => setPosthocMethod(e.target.value)} style={ctrl}><option value="welch">t de Welch (Bonferroni)</option><option value="tukey">Tukey HSD</option></select>
                  <span style={{ fontSize: 11, color: "#9aa7b2" }}>marque quais comparações mostrar no gráfico:</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {result.res.posthoc.map((pp) => { const key = pp.a + "|" + pp.b; const st = pp.padj < 0.001 ? "***" : pp.padj < 0.01 ? "**" : pp.padj < 0.05 ? "*" : "n.s."; return (
                    <label key={key} style={chk}><input type="checkbox" checked={shownPairs.has(key)} onChange={(e) => setShownPairs((s) => { const n = new Set(s); e.target.checked ? n.add(key) : n.delete(key); return n; })} /> {pp.a}×{pp.b} <b style={{ color: pp.padj < 0.05 ? "#2e7d4f" : "#9aa7b2" }}>{st}</b></label>); })}
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: "#5a6b7a", marginBottom: 4 }}>{chartTitle || spec.def}</div>
        <div style={{ position: "relative", width: chartW ? chartW : "100%", maxWidth: "100%", display: "inline-block" }}>
          <div ref={chartRef} style={{ width: "100%", height: chartH, minHeight: 140, background: "#fff", border: "1px dashed #e3e9ee", borderRadius: 4 }}><ResponsiveContainer width="100%" height="100%">{spec.el}</ResponsiveContainer></div>
          <div onPointerDown={startResize} title="arraste para redimensionar" style={{ position: "absolute", right: 0, bottom: 0, width: 18, height: 18, cursor: "nwse-resize", background: "linear-gradient(135deg, transparent 50%, #9aa7b2 50%, #9aa7b2 60%, transparent 60%, transparent 72%, #9aa7b2 72%, #9aa7b2 82%, transparent 82%)" }} />
        </div>
        <div style={{ fontSize: 10.5, color: "#9aa7b2", marginTop: 3 }}>arraste o canto inferior direito para redimensionar · ⚙ para mais opções (tipo, eixos, tamanho em px…)</div>
      </div>
    );
  };

  // ---------- seletores de variáveis por tipo ----------
  const toggleItem = (h, checked) => setVars((s) => ({ ...s, items: checked ? [...(s.items || []), h] : (s.items || []).filter((x) => x !== h) }));

  const renderPickers = () => {
    if (!test || !test.impl) return null;
    switch (test.kind) {
      case "multinum": return <>{numCols.length ? <MultiPicker label={testKey === "cronbach" ? "Itens (≥ 2 colunas numéricas)" : "Variáveis (vazio = todas as numéricas)"} opts={numCols} items={vars.items || []} onToggle={toggleItem} /> : <em style={{ fontSize: 12, color: "#9aa7b2" }}>nenhuma coluna numérica</em>}</>;
      case "num+conf": return <><Picker label="Variável numérica" value={vars.num} set={(v) => setVars({ num: v })} opts={numCols} /><div><label style={T.lbl}>Confiança</label><select style={T.sel} value={conf} onChange={(e) => setConf(e.target.value)}>{["0.90", "0.95", "0.99"].map((c) => <option key={c} value={c}>{Math.round(+c * 100)}%</option>)}</select></div></>;
      case "num+mu": return <><Picker label="Variável numérica" value={vars.num} set={(v) => setVars({ num: v })} opts={numCols} /><div><label style={T.lbl}>Valor de referência (μ₀)</label><input style={{ ...T.sel, maxWidth: 120 }} value={mu0} onChange={(e) => setMu0(e.target.value)} /></div></>;
      case "2num": return <><Picker label="Variável 1" value={vars.num} set={(v) => setVars((s) => ({ ...s, num: v }))} opts={numCols} /><Picker label="Variável 2" value={vars.num2} set={(v) => setVars((s) => ({ ...s, num2: v }))} opts={numCols} /></>;
      case "num+group": return <><Picker label="Variável numérica" value={vars.num} set={(v) => setVars((s) => ({ ...s, num: v }))} opts={numCols} /><Picker label="Variável de grupo (fator)" value={vars.group} set={(v) => setVars((s) => ({ ...s, group: v }))} opts={allCols} /></>;
      case "moses": return <><Picker label="Variável numérica" value={vars.num} set={(v) => setVars((s) => ({ ...s, num: v }))} opts={numCols} /><Picker label="Grupo (1º = controle, 2º = experimental)" value={vars.group} set={(v) => setVars((s) => ({ ...s, group: v }))} opts={allCols} /><div><label style={T.lbl}>h (aparar extremos do controle)</label><input style={{ ...T.sel, maxWidth: 100 }} value={hMoses} onChange={(e) => setHMoses(e.target.value)} /></div></>;
      case "num+2group": return <><Picker label="Variável numérica" value={vars.num} set={(v) => setVars((s) => ({ ...s, num: v }))} opts={numCols} /><Picker label="Fator A" value={vars.groupA} set={(v) => setVars((s) => ({ ...s, groupA: v }))} opts={allCols} /><Picker label="Fator B" value={vars.groupB} set={(v) => setVars((s) => ({ ...s, groupB: v }))} opts={allCols} /></>;
      case "2cat": return <><Picker label="Variável categórica 1 (linhas)" value={vars.cat1} set={(v) => setVars((s) => ({ ...s, cat1: v }))} opts={allCols} /><Picker label="Variável categórica 2 (colunas)" value={vars.cat2} set={(v) => setVars((s) => ({ ...s, cat2: v }))} opts={allCols} /></>;
      case "1num": return <Picker label="Variável numérica (sequência observada)" value={vars.num} set={(v) => setVars({ num: v })} opts={numCols} />;
      default: return null;
    }
  };

  return (
    <div style={T.page}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={T.h2}>Análise Quantitativa</h2>
        <div style={{ flex: 1 }} />
        <button style={T.btn} onClick={exportPDF} title="gerar relatório com os dados e o resultado">Relatório PDF</button>
      </div>
      <p style={T.sub}>Testes estatísticos sobre dados que você cola ou abre aqui. Independente das outras janelas.</p>
      <div style={T.cols}>

        {/* ---- coluna 1: dados (grade editável) ---- */}
        <div style={{ ...T.card, flex: "1 1 420px", minWidth: 340 }}>
          <div style={T.cardH}>1 · Dados</div>
          <div style={{ fontSize: 12, color: "#6b7c8a", marginBottom: 8 }}>Preencha as células. A 1ª linha (cabeçalho) é o nome de cada variável.</div>
          <div style={{ overflow: "auto", border: "1px solid #e3e9ee", borderRadius: 6, maxHeight: "52vh" }}>
            <table style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, background: "#f7f9fb", borderBottom: "1px solid #e3e9ee", width: 22 }} />
                  {grid.headers.map((h, c) => (
                    <th key={c} style={{ position: "sticky", top: 0, background: "#f7f9fb", borderBottom: "1px solid #e3e9ee", padding: 2 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <input value={h} onChange={(e) => setHeader(c, e.target.value)} style={{ width: 78, boxSizing: "border-box", padding: "4px 5px", border: "1px solid #cfd6dd", borderRadius: 4, fontSize: 12, fontWeight: 700, color: "#34495e", textAlign: "center" }} />
                          {grid.headers.length > 1 && <button onClick={() => removeCol(c)} title="remover coluna" style={{ border: "none", background: "none", color: "#b3402f", cursor: "pointer", fontSize: 11, padding: 0 }}>✕</button>}
                        </div>
                        {data && data.headers[c] && <div style={{ fontSize: 9, fontWeight: 400, color: data.numeric[data.headers[c]] ? "#2e7d4f" : "#b06a1f", textAlign: "center" }}>{data.numeric[data.headers[c]] ? "num" : "categ"}</div>}
                      </div>
                    </th>
                  ))}
                  <th style={{ position: "sticky", top: 0, background: "#f7f9fb", borderBottom: "1px solid #e3e9ee", padding: "0 4px" }}><button onClick={addCol} title="adicionar coluna" style={{ border: "1px solid #cfd6dd", background: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#1f7a8c", fontWeight: 700, padding: "2px 6px" }}>＋</button></th>
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row, r) => (
                  <tr key={r}>
                    <td style={{ textAlign: "center", color: "#9aa7b2" }}>{grid.rows.length > 1 ? <button onClick={() => removeRow(r)} title="remover linha" style={{ border: "none", background: "none", color: "#c3ccd4", cursor: "pointer", fontSize: 11, padding: 0 }}>✕</button> : null}</td>
                    {grid.headers.map((_, c) => (
                      <td key={c} style={{ padding: 1 }}><input value={row[c] != null ? row[c] : ""} onChange={(e) => setCell(r, c, e.target.value)} style={{ width: 86, boxSizing: "border-box", padding: "4px 5px", border: "1px solid #eef1f4", borderRadius: 3, fontSize: 12.5, fontFamily: "inherit" }} /></td>
                    ))}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button style={T.btn} onClick={addRow}>+ linha</button>
            <button style={T.btn} onClick={addCol}>+ coluna</button>
            <button style={T.btn} onClick={exemplo}>Exemplo</button>
            <button style={T.btn} onClick={limpar}>Limpar</button>
            <button style={T.btn} onClick={() => setShowPaste((v) => !v)}>Colar / abrir {showPaste ? "▾" : "▸"}</button>
          </div>
          {showPaste && (
            <div style={{ marginTop: 8 }}>
              <textarea style={T.ta} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"grupo\tnota\nA\t7,5\nB\t5,5\n(separador: tabulação, vírgula ou ;)"} />
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <button style={T.prim} onClick={() => processar(pasteText)} disabled={!pasteText.trim()}>Preencher grade</button>
                <label style={{ ...T.btn, display: "inline-block" }}>Abrir arquivo<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} style={{ display: "none" }} /></label>
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: data ? "#46555f" : "#9aa7b2", marginTop: 8 }}>{data ? <><strong>{data.n}</strong> casos válidos · <strong>{data.headers.length}</strong> variáveis</> : "Sem dados ainda — preencha as células."}</div>
        </div>

        {/* ---- coluna 2: teste ---- */}
        <div style={{ ...T.card, flex: "1 1 360px", minWidth: 300 }}>
          <div style={T.cardH}>2 · Teste</div>
          <select style={{ ...T.sel, maxWidth: "100%", width: "100%" }} value={testKey} onChange={(e) => { setTestKey(e.target.value); setResult(null); setErr(""); setVars({}); }}>
            {TESTS.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((t) => <option key={t.key} value={t.key} disabled={!t.impl}>{t.label}{t.impl ? "" : " — em breve"}</option>)}</optgroup>)}
          </select>
          {INFO[testKey] && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowFormula((v) => !v)} style={{ background: "none", border: "none", color: "#1f7a8c", fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 600 }}>ƒ Fórmula e referência {showFormula ? "▾" : "▸"}</button>
              {showFormula && (
                <div style={{ marginTop: 6, background: "#f7f9fb", border: "1px solid #e3e9ee", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 12.5, color: "#46555f", lineHeight: 1.5, marginBottom: 6, textAlign: "justify" }}>{INFO[testKey].e}</div>
                  {WHEN[testKey] && <div style={{ fontSize: 12.5, color: "#34495e", lineHeight: 1.5, marginBottom: 8 }}><b>Quando usar:</b> {WHEN[testKey]}</div>}
                  <div style={{ background: "#fff", border: "1px solid #eef1f4", borderRadius: 4, padding: "8px 10px", overflowX: "auto" }}>
                    {INFO[testKey].f.map((m, i) => (<div key={i} style={{ fontSize: 18, margin: "6px 0", color: "#2b3a48" }} dangerouslySetInnerHTML={{ __html: m }} />))}
                  </div>
                  {INFO[testKey].leg && <div style={{ marginTop: 6, fontSize: 11.5, color: "#5a6b7a", lineHeight: 1.45 }}>{INFO[testKey].leg}</div>}
                  {INFO[testKey].r && <div style={{ marginTop: 4, fontSize: 11, color: "#7a8b99", fontStyle: "italic" }}>{INFO[testKey].r}</div>}
                </div>
              )}
            </div>
          )}
          {EX[testKey] && <button onClick={carregarExemploTeste} style={{ ...T.btn, marginTop: 10 }} title="preenche a grade com um exemplo e calcula">↻ Carregar exemplo deste teste</button>}
          {!data ? <div style={{ fontSize: 12.5, color: "#9aa7b2", marginTop: 12 }}>Preencha os dados na grade ao lado (ou carregue um exemplo) para escolher as variáveis.</div> : (
            <div>
              {renderPickers()}
              <button style={{ ...T.prim, marginTop: 14 }} onClick={calcular}>Calcular</button>
            </div>
          )}
          {err && <div style={{ marginTop: 10, fontSize: 12.5, color: "#b3402f", background: "#fbeae7", border: "1px solid #f0c8c0", borderRadius: 6, padding: "8px 10px" }}>{err}</div>}
        </div>

        {/* ---- coluna 3: resultado ---- */}
        <div style={{ ...T.card, flex: "1 1 360px", minWidth: 300 }}>
          <div style={T.cardH}>3 · Resultado</div>
          <div ref={resultRef}>{!result ? <div style={{ fontSize: 12.5, color: "#9aa7b2" }}>O resultado aparece aqui.</div> : <Result data={result} />}</div>
        </div>

      </div>

      {/* ---- gráfico (largura total, editável e redimensionável) ---- */}
      {result && chartSpec() && (<div style={{ ...T.card, marginTop: 16 }}>
        <div style={T.cardH}>Gráfico</div>
        {renderChart()}
      </div>)}
    </div>
  );
}

/* ---------- renderização de resultados ---------- */
function Row({ k, v }) { return <div style={T.kv}><span style={{ color: "#5a6b7a" }}>{k}</span><strong>{v}</strong></div>; }
function Sig({ p }) {
  const s = Number.isFinite(p) && p < 0.05;
  return <div style={{ marginTop: 10, fontSize: 12.5, padding: "8px 10px", borderRadius: 6, background: s ? "#e7f3ec" : "#f2f5f7", border: "1px solid " + (s ? "#bfe0cc" : "#e3e9ee"), color: "#34495e" }}>
    <strong>{s ? "Estatisticamente significativo" : "Não significativo"}</strong> ao nível de 5% (p {fmtP(p)} {s ? "<" : "≥"} 0,05).
  </div>;
}

function Result({ data }) {
  const { key, res } = data;
  if (key === "describe") return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{["Variável", "n", "Média", "Mediana", "Moda", "DP", "Variância", "Mín", "Máx", "Amplitude", "Q1", "Q3", "Assim.", "Curtose"].map((h) => <th key={h} style={T.th}>{h}</th>)}</tr></thead>
        <tbody>{res.multi.map((m) => <tr key={m.name}>
          <td style={T.td}><strong>{m.name}</strong></td><td style={T.td}>{m.d.n}</td><td style={T.td}>{fmt(m.d.mean, 3)}</td><td style={T.td}>{fmt(m.d.median, 3)}</td>
          <td style={T.td}>{Array.isArray(m.d.mode) ? m.d.mode.map((x) => fmt(x, 2)).join("; ") : fmt(m.d.mode, 2)}</td>
          <td style={T.td}>{fmt(m.d.sd, 3)}</td><td style={T.td}>{fmt(m.d.variance, 3)}</td><td style={T.td}>{fmt(m.d.min, 2)}</td><td style={T.td}>{fmt(m.d.max, 2)}</td>
          <td style={T.td}>{fmt(m.d.range, 2)}</td><td style={T.td}>{fmt(m.d.q1, 2)}</td><td style={T.td}>{fmt(m.d.q3, 2)}</td><td style={T.td}>{fmt(m.d.skew, 2)}</td><td style={T.td}>{fmt(m.d.kurtosis, 2)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1f7a8c", marginBottom: 8 }}>{res.test}</div>
      {key === "ci" && <><Row k="Média" v={fmt(res.mean, 4)} /><Row k={`IC ${Math.round(res.conf * 100)}%`} v={`[${fmt(res.lo, 4)} ; ${fmt(res.hi, 4)}]`} /><Row k="Erro-padrão" v={fmt(res.se, 4)} /><Row k="gl" v={res.df} /></>}
      {key === "t1" && <><Row k="Média" v={fmt(res.mean, 4)} /><Row k="μ₀" v={fmt(res.mu0, 4)} /><Row k="DP" v={fmt(res.sd, 4)} /><Row k="t" v={fmt(res.t, 4)} /><Row k="gl" v={res.df} /><Row k="p (bicaudal)" v={fmtP(res.p)} /><Row k={`IC ${Math.round(res.conf * 100)}% da média`} v={`[${fmt(res.ci[0], 3)} ; ${fmt(res.ci[1], 3)}]`} /><Row k="d de Cohen" v={fmt(res.d, 3)} /><Sig p={res.p} /></>}
      {(key === "t2") && <><Row k={`Média ${res.g1}`} v={`${fmt(res.mean1, 3)} (n=${res.n1})`} /><Row k={`Média ${res.g2}`} v={`${fmt(res.mean2, 3)} (n=${res.n2})`} /><Row k="t" v={fmt(res.t, 4)} /><Row k="gl" v={fmt(res.df, 2)} /><Row k="p (bicaudal)" v={fmtP(res.p)} /><Row k="d de Cohen" v={fmt(res.d, 3)} /><Sig p={res.p} /></>}
      {key === "tp" && <><Row k="Média 1" v={fmt(res.mean1, 3)} /><Row k="Média 2" v={fmt(res.mean2, 3)} /><Row k="Média das diferenças" v={fmt(res.meanDiff, 4)} /><Row k="t" v={fmt(res.t, 4)} /><Row k="gl" v={res.df} /><Row k="p (bicaudal)" v={fmtP(res.p)} /><Row k="d de Cohen" v={fmt(res.d, 3)} /><Sig p={res.p} /></>}
      {key === "anova" && <><Row k="F" v={fmt(res.F, 4)} /><Row k="gl" v={`${res.dfb} ; ${res.dfw}`} /><Row k="p" v={fmtP(res.p)} /><Row k="η² (eta²)" v={fmt(res.eta2, 3)} /><div style={{ overflowX: "auto", marginTop: 8 }}><table style={{ borderCollapse: "collapse" }}><thead><tr>{["Grupo", "n", "Média", "DP"].map((h) => <th key={h} style={T.th}>{h}</th>)}</tr></thead><tbody>{res.groups.map((g) => <tr key={g.name}><td style={T.td}>{g.name}</td><td style={T.td}>{g.n}</td><td style={T.td}>{fmt(g.mean, 3)}</td><td style={T.td}>{fmt(g.sd, 3)}</td></tr>)}</tbody></table></div><Sig p={res.p} />{res.posthoc && res.posthoc.length > 0 && <div style={{ marginTop: 10 }}><div style={{ fontSize: 11.5, fontWeight: 700, color: "#5a6b7a", marginBottom: 4 }}>Pós-hoc — quais grupos diferem <span style={{ fontWeight: 400, color: "#9aa7b2" }}>({res.posthocMethod === "tukey" ? "Tukey HSD" : "t de Welch · Bonferroni"})</span></div><div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse" }}><thead><tr>{["Par", "p", "p ajustado", ""].map((h) => <th key={h} style={T.th}>{h}</th>)}</tr></thead><tbody>{res.posthoc.map((pp, i) => <tr key={i}><td style={T.td}>{pp.a} × {pp.b}</td><td style={T.td}>{fmtP(pp.p)}</td><td style={T.td}>{fmtP(pp.padj)}</td><td style={{ ...T.td, fontWeight: 700, color: pp.padj < 0.05 ? "#2e7d4f" : "#9aa7b2" }}>{pp.padj < 0.001 ? "***" : pp.padj < 0.01 ? "**" : pp.padj < 0.05 ? "*" : "n.s."}</td></tr>)}</tbody></table></div></div>}</>}
      {key === "pearson" && <><Row k="r" v={fmt(res.r, 4)} /><Row k="r² (variância explicada)" v={fmt(res.r2, 4)} /><Row k="t" v={fmt(res.t, 4)} /><Row k="gl" v={res.df} /><Row k="p" v={fmtP(res.p)} /><Row k={`IC ${Math.round(res.conf * 100)}% de r`} v={`[${fmt(res.ci[0], 3)} ; ${fmt(res.ci[1], 3)}]`} /><Sig p={res.p} /></>}
      {key === "spearman" && <><Row k="ρ (rho)" v={fmt(res.rho, 4)} /><Row k="t" v={fmt(res.t, 4)} /><Row k="gl" v={res.df} /><Row k="p" v={fmtP(res.p)} /><Sig p={res.p} /></>}
      {key === "wilcoxon" && <><Row k="W⁺" v={fmt(res.Wplus, 1)} /><Row k="W⁻" v={fmt(res.Wminus, 1)} /><Row k="W" v={fmt(res.W, 1)} /><Row k="z" v={fmt(res.z, 4)} /><Row k="p (aprox. normal)" v={fmtP(res.p)} /><Row k="n (pares ≠ 0)" v={res.n} /><Sig p={res.p} /></>}
      {key === "mw" && <><Row k={`grupos`} v={`${res.g1} (n=${res.n1}) vs ${res.g2} (n=${res.n2})`} /><Row k="U" v={fmt(res.U, 1)} /><Row k="z" v={fmt(res.z, 4)} /><Row k="p (aprox. normal)" v={fmtP(res.p)} /><Sig p={res.p} /></>}
      {key === "runs" && <><Row k="Nº de sequências (runs)" v={res.runs} /><Row k="Esperado" v={fmt(res.expected, 2)} /><Row k="Acima / abaixo da mediana" v={`${res.n1} / ${res.n2}`} /><Row k="z" v={fmt(res.z, 4)} /><Row k="p" v={fmtP(res.p)} /><div style={{ marginTop: 10, fontSize: 12.5, padding: "8px 10px", borderRadius: 6, background: "#f2f5f7", border: "1px solid #e3e9ee" }}>{res.p < 0.05 ? "Sequência provavelmente não aleatória (p < 0,05)." : "Compatível com aleatoriedade (p ≥ 0,05)."}</div></>}
      {key === "chi2" && <><Row k="χ²" v={fmt(res.chi2, 4)} /><Row k="gl" v={res.df} /><Row k="p" v={fmtP(res.p)} /><Row k="N" v={res.n} /><Row k="V de Cramér" v={fmt(res.cramerV, 3)} /><Row k="Menor freq. esperada" v={fmt(res.minExpected, 2)} />{res.minExpected < 5 && <div style={{ fontSize: 11.5, color: "#b06a1f", marginTop: 4 }}>Atenção: frequência esperada &lt; 5 — o χ² pode ser pouco confiável (considere Fisher).</div>}<div style={{ overflowX: "auto", marginTop: 8 }}><table style={{ borderCollapse: "collapse" }}><thead><tr><th style={T.th}></th>{res.r2.map((c) => <th key={c} style={T.th}>{c}</th>)}</tr></thead><tbody>{res.tbl.map((row, i) => <tr key={i}><td style={T.td}><strong>{res.r1[i]}</strong></td>{row.map((v, j) => <td key={j} style={T.td}>{v}</td>)}</tr>)}</tbody></table></div><Sig p={res.p} /></>}
      {key === "anova2" && <><div style={{ fontSize: 12, color: "#6b7c8a", marginBottom: 6 }}>{res.balanced ? "Delineamento balanceado." : "Atenção: delineamento NÃO balanceado — as somas de quadrados são aproximadas."}</div><div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr>{["Fonte", "SQ", "gl", "QM", "F", "p"].map((h) => <th key={h} style={T.th}>{h}</th>)}</tr></thead><tbody>{[["Fator A (" + res.nameA + ")", res.A], ["Fator B (" + res.nameB + ")", res.B], ["Interação A×B", res.AB]].map(([nm, r]) => <tr key={nm}><td style={T.td}>{nm}</td><td style={T.td}>{fmt(r.ss, 2)}</td><td style={T.td}>{r.df}</td><td style={T.td}>{fmt(r.ms, 2)}</td><td style={T.td}>{fmt(r.F, 3)}</td><td style={T.td}>{fmtP(r.p)}</td></tr>)}<tr><td style={T.td}>Resíduo</td><td style={T.td}>{fmt(res.resid.ss, 2)}</td><td style={T.td}>{res.resid.df}</td><td style={T.td}>{fmt(res.resid.ms, 2)}</td><td style={T.td}>—</td><td style={T.td}>—</td></tr></tbody></table></div><div style={{ fontSize: 12, marginTop: 8, color: "#34495e" }}>Interação {res.AB.p < 0.05 ? "significativa" : "não significativa"} (p {fmtP(res.AB.p)}).</div></>}
      {key === "fisher" && <><Row k="Razão de chances (OR)" v={Number.isFinite(res.oddsRatio) ? fmt(res.oddsRatio, 3) : "∞"} /><Row k="p exato (bicaudal)" v={fmtP(res.p)} /><div style={{ overflowX: "auto", marginTop: 8 }}><table style={{ borderCollapse: "collapse" }}><thead><tr><th style={T.th}></th>{res.r2.map((c) => <th key={c} style={T.th}>{c}</th>)}</tr></thead><tbody>{res.tbl.map((row, i) => <tr key={i}><td style={T.td}><strong>{res.r1[i]}</strong></td>{row.map((v, j) => <td key={j} style={T.td}>{v}</td>)}</tr>)}</tbody></table></div><Sig p={res.p} /></>}
      {key === "median" && <><Row k="Mediana global" v={fmt(res.median, 3)} /><Row k="χ²" v={fmt(res.chi2, 4)} /><Row k="gl" v={res.df} /><Row k="p" v={fmtP(res.p)} /><div style={{ overflowX: "auto", marginTop: 8 }}><table style={{ borderCollapse: "collapse" }}><thead><tr>{["Grupo", "n", "Acima da mediana"].map((h) => <th key={h} style={T.th}>{h}</th>)}</tr></thead><tbody>{res.groups.map((g) => <tr key={g.name}><td style={T.td}>{g.name}</td><td style={T.td}>{g.n}</td><td style={T.td}>{g.above}</td></tr>)}</tbody></table></div><Sig p={res.p} /></>}
      {key === "ks2" && <><Row k={`grupos`} v={`${res.g1} (n=${res.n1}) vs ${res.g2} (n=${res.n2})`} /><Row k="D (máx. diferença das ECDF)" v={fmt(res.D, 4)} /><Row k="p (aprox.)" v={fmtP(res.p)} /><Sig p={res.p} /></>}
      {key === "ww2" && <><Row k={`grupos`} v={`${res.g1} (n=${res.n1}) vs ${res.g2} (n=${res.n2})`} /><Row k="Nº de sequências (runs)" v={res.runs} /><Row k="Esperado" v={fmt(res.expected, 2)} /><Row k="z" v={fmt(res.z, 4)} /><Row k="p" v={fmtP(res.p)} /><Sig p={res.p} /></>}
      {key === "moses" && <><Row k="Controle / experimental" v={`${res.control} (n=${res.m}) / ${res.experimental} (n=${res.n})`} /><Row k="h (aparado)" v={res.h} /><Row k="Span do controle" v={res.span} /><Row k="p (unicaudal)" v={fmtP(res.p)} /><div style={{ marginTop: 10, fontSize: 12.5, padding: "8px 10px", borderRadius: 6, background: res.p < 0.05 ? "#e7f3ec" : "#f2f5f7", border: "1px solid " + (res.p < 0.05 ? "#bfe0cc" : "#e3e9ee") }}>{res.p < 0.05 ? "O grupo experimental apresenta reações mais extremas que o controle (p < 0,05)." : "Sem evidência de reações extremas (p ≥ 0,05)."}</div></>}
      {key === "cronbach" && <><Row k="α de Cronbach" v={fmt(res.alpha, 4)} /><Row k="Itens (k)" v={res.k} /><Row k="Casos (n)" v={res.n} /><div style={{ marginTop: 10, fontSize: 12.5, padding: "8px 10px", borderRadius: 6, background: "#f2f5f7", border: "1px solid #e3e9ee" }}>{res.alpha >= 0.9 ? "Excelente" : res.alpha >= 0.8 ? "Boa" : res.alpha >= 0.7 ? "Aceitável" : res.alpha >= 0.6 ? "Questionável" : "Baixa"} consistência interna.</div></>}
    </div>
  );
}

export { AnaliseQuantitativa };
