import React, { useState, useMemo, useEffect } from "react";
import * as ST from "./stats.js";

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

// explicação (reescrita) + fórmula + referência por teste.
// A referência só aparece quando a própria fonte aponta um autor (Siegel, Kerlinger…).
const INFO = {
  describe: { e: "Resumem uma distribuição de escores: as medidas de tendência central (média, mediana, moda) indicam em torno de que valor os dados se concentram; as de variabilidade (desvio padrão, amplitude) indicam o quanto eles se espalham. A média sozinha pode esconder diferenças — daí também olhar a dispersão.", f: "Média:  X̄ = Σ(Xᵢ·nᵢ) / N\nDesvio padrão:  dp = √[ Σ(Xⱼ − X̄)² / N ]\nMediana: ponto central (50% acima, 50% abaixo)\nModa: escore de maior frequência" },
  ci: { e: "Faixa de valores dentro da qual, com dado grau de confiança (p.ex. 95%), se espera encontrar a média da população. Quanto mais estreita a faixa, mais precisa a estimativa.", f: "IC(média) = X̄ ± t·(s/√n)\n(amostras grandes: t ≈ 1,96 para 95%; 2,58 para 99%)" },
  t1: { e: "Compara a média de uma amostra com um valor de referência (μ₀). Indicado para amostras pequenas (n<30), supondo escores de uma população normal; verifica se a diferença observada pode ser apenas erro de amostragem.", f: "t = (X̄ − μ₀) / (s/√n)\ngl = n − 1" },
  t2: { e: "Compara as médias de dois grupos independentes para decidir se a diferença entre eles é real ou fruto do acaso na amostragem. Supõe normalidade; a versão de Welch (usada aqui) não exige variâncias iguais.", f: "Student:  t = (X̄₁ − X̄₂) / (σ·√(1/n₁ + 1/n₂))\nσ = √[ (n₁·dp₁² + n₂·dp₂²) / (n₁+n₂−2) ];  gl = n₁+n₂−2\nWelch (usado aqui):  t = (X̄₁ − X̄₂) / √(s₁²/n₁ + s₂²/n₂)" },
  tp: { e: "Compara dois escores do mesmo sujeito (ou de pares), por exemplo antes e depois de um tratamento, analisando a média das diferenças. Reduz a influência das diferenças individuais entre os sujeitos.", f: "t = d̄ / (s_d/√n),  com d = X₁ − X₂,  gl = n − 1" },
  anova: { e: "Generaliza o teste t para três ou mais grupos: compara a variância entre as médias dos grupos com a variância dentro dos grupos (razão F). Indica se há diferença geral, mas não diz qual grupo difere dos demais.", f: "F = V_b / V_w\nV_b = Σx_b²/(k−1)   (variância entre grupos)\nV_w = média das variâncias dentro dos grupos\nx_b = média do grupo − média geral" },
  anova2: { e: "Analisa ao mesmo tempo o efeito de dois fatores e a interação entre eles sobre a variável dependente. Há interação quando o efeito de um fator depende do nível do outro (no gráfico, as linhas deixam de ser paralelas).", f: "SQ_total = SQ_A + SQ_B + SQ_AB + SQ_erro\nF = QM_fonte / QM_erro,  com QM = SQ/gl\n(exata para delineamento balanceado)", r: "Método conforme Kerlinger (1964)." },
  pearson: { e: "Mede o grau de associação linear entre duas variáveis, variando de −1 a +1 (0 = sem relação linear). Vale lembrar: correlação, ainda que alta, não implica relação de causa.", f: "r = Σ(xy) / √[ (Σx²)(Σy²) ],  x = X − X̄,  y = Y − Ȳ\nt = r·√[(n−2)/(1−r²)],  gl = n − 2" },
  spearman: { e: "Versão por postos da correlação: mede associação monotônica entre duas variáveis. Útil para dados ordinais ou quando não se quer supor normalidade.", f: "ρ = correlação de Pearson sobre os postos\n(sem empates: ρ = 1 − 6·Σd² / [n(n²−1)])", r: "Siegel (1956)." },
  cronbach: { e: "Avalia a consistência interna de um teste ou escala: o quanto os itens medem a mesma coisa. Só faz sentido somar escores de itens se eles forem internamente consistentes. Vai até 1 — quanto mais próximo de 1, melhor.", f: "α = (k/(k−1))·(1 − ΣV_i / V_t)\nk = nº de itens; V_i = variância de cada item; V_t = variância do total", r: "Roteiro de Fernando Lang da Silveira (Instituto de Física, UFRGS)." },
  mw: { e: "Alternativa não paramétrica ao teste t para dois grupos independentes; trabalha com os postos dos escores, não com seus valores. Indicado para dados ordinais ou quando não se supõe normalidade.", f: "U = R₁ − n₁(n₁+1)/2   (R₁ = soma dos postos do grupo 1)\nz = (U − n₁n₂/2) / √[ n₁n₂(N+1)/12 ]  (com correção de empates)", r: "Siegel (1956, p. 116)." },
  wilcoxon: { e: "Alternativa não paramétrica para duas amostras relacionadas (pareadas): usa os postos das diferenças entre os pares, dispensando a suposição de normalidade exigida pelo teste t pareado.", f: "Postos de |X₁−X₂| (zeros descartados); W = min(ΣW⁺, ΣW⁻)\nz = (W − n(n+1)/4) / √[ n(n+1)(2n+1)/24 ]", r: "Siegel (1956)." },
  chi2: { e: "Verifica se duas variáveis categóricas estão associadas, comparando as frequências observadas com as esperadas caso fossem independentes. Funciona até com escalas nominais.", f: "χ² = Σ (O − E)² / E,  com E = (total da linha × total da coluna)/N\ngl = (linhas − 1)·(colunas − 1)", r: "Siegel (1956)." },
  fisher: { e: "Calcula a probabilidade exata de uma tabela 2×2 com os totais marginais fixos. Indicado quando as amostras são pequenas (frequências esperadas baixas), situação em que o χ² é pouco confiável.", f: "p = [ (A+B)!·(C+D)!·(A+C)!·(B+D)! ] / [ N!·A!·B!·C!·D! ]\n(soma das tabelas tão ou menos prováveis → p bicaudal)", r: "Siegel (1956)." },
  median: { e: "Verifica se dois ou mais grupos diferem em tendência central, contando quantos casos de cada grupo ficam acima e abaixo da mediana global e aplicando o χ² a essa tabela.", f: "Dicotomiza cada grupo em > mediana global e ≤ mediana global;\naplica χ² à tabela resultante (gl = nº de grupos − 1)", r: "Siegel (1956)." },
  ks2: { e: "Verifica se duas amostras vêm da mesma distribuição, pela maior distância entre suas distribuições acumuladas. A forma bilateral é sensível a diferenças de qualquer tipo (posição, dispersão, forma).", f: "D = máx | F₁(x) − F₂(x) |   (ECDF das duas amostras)\np por aproximação de Kolmogorov, n_e = n₁n₂/(n₁+n₂)", r: "Siegel (1956)." },
  ww2: { e: "Testa se duas amostras vêm da mesma população contra a alternativa de que diferem em qualquer aspecto (posição, dispersão, forma). Baseia-se no número de sequências (runs) ao ordenar os dados combinados dos dois grupos.", f: "Combina e ordena as duas amostras; conta sequências (runs) R\nz = (R − μ_R)/σ_R,  μ_R = 2n₁n₂/N + 1", r: "Siegel (1956)." },
  runs: { e: "Verifica se uma sequência de valores é aleatória, contando as sequências (runs) de valores acima e abaixo da mediana. Poucos ou muitos runs sugerem que a ordem não é casual.", f: "Dicotomiza pela mediana; conta sequências (runs) R\nz = (R − μ_R)/σ_R,  μ_R = 2n₁n₂/N + 1", r: "Siegel (1956)." },
  moses: { e: "Detecta reações extremas: avalia se um grupo experimental se espalha mais (para os dois lados) que o grupo de controle. Útil quando se espera que uma condição leve alguns sujeitos a um extremo e outros ao extremo oposto.", f: "Span dos postos do grupo-controle (aparando h de cada ponta);\np exata pela distribuição combinatória do span", r: "Siegel (1956)." },
};

function AnaliseQuantitativa({ active = true }) {
  const [text, setText] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [testKey, setTestKey] = useState("describe");
  const [vars, setVars] = useState({});      // seleções: {num, num2, group, cat1, cat2, items:[]}
  const [mu0, setMu0] = useState("0");
  const [conf, setConf] = useState("0.95");
  const [hMoses, setHMoses] = useState("0");
  const [showFormula, setShowFormula] = useState(false);
  const [result, setResult] = useState(null);

  // restaurar
  useEffect(() => { try { const s = window.localStorage.getItem(LSK); if (s) { const o = JSON.parse(s); if (o && o.text) { setText(o.text); const d = parseTable(o.text); setData(d); } } } catch {} }, []);
  useEffect(() => { const t = setTimeout(() => { try { window.localStorage.setItem(LSK, JSON.stringify({ text })); } catch {} }, 600); return () => clearTimeout(t); }, [text]);

  const test = ALL.find((t) => t.key === testKey);
  const numCols = useMemo(() => (data ? data.headers.filter((h) => data.numeric[h]) : []), [data]);
  const allCols = data ? data.headers : [];

  const processar = (txt) => {
    const d = parseTable(txt);
    if (!d || !d.headers.length || !d.n) { setErr("Não consegui ler a tabela. Verifique se a 1ª linha tem os nomes das colunas e as demais, os dados."); setData(null); return; }
    setErr(""); setData(d); setResult(null); setVars({});
  };
  const onFile = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { setText(String(r.result)); processar(String(r.result)); }; r.readAsText(f); e.target.value = ""; };
  const exemplo = () => {
    const ex = "grupo\tnota\tidade\tpre\tpos\nA\t7,5\t20\t5\t7\nA\t8,0\t22\t6\t8\nA\t6,5\t19\t4\t6\nA\t7,0\t21\t5\t7\nB\t5,5\t23\t4\t5\nB\t6,0\t20\t5\t6\nB\t5,0\t24\t3\t5\nB\t6,5\t22\t4\t6";
    setText(ex); processar(ex);
  };

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
        if (testKey === "anova") res = ST.oneWayAnova(order.map((k) => map[k]), order);
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
      <h2 style={T.h2}>Análise Quantitativa</h2>
      <p style={T.sub}>Testes estatísticos sobre dados que você cola ou abre aqui. Independente das outras janelas.</p>
      <div style={T.cols}>

        {/* ---- coluna 1: dados ---- */}
        <div style={{ ...T.card, flex: "1 1 380px", minWidth: 320 }}>
          <div style={T.cardH}>1 · Dados</div>
          <div style={{ fontSize: 12, color: "#6b7c8a", marginBottom: 6 }}>Cole uma tabela (1ª linha = nomes das variáveis; colunas separadas por tabulação, vírgula ou ponto-e-vírgula).</div>
          <textarea style={T.ta} value={text} onChange={(e) => setText(e.target.value)} placeholder={"grupo\tnota\nA\t7,5\nA\t8,0\nB\t5,5"} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button style={T.prim} onClick={() => processar(text)}>Processar dados</button>
            <label style={{ ...T.btn, display: "inline-block" }}>Abrir arquivo<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} style={{ display: "none" }} /></label>
            <button style={T.btn} onClick={exemplo}>Exemplo</button>
            <button style={T.btn} onClick={() => { setText(""); setData(null); setResult(null); setErr(""); }}>Limpar</button>
          </div>
          {data && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#46555f", marginBottom: 4 }}><strong>{data.n}</strong> casos · <strong>{data.headers.length}</strong> variáveis</div>
              <div style={{ overflowX: "auto", border: "1px solid #eef1f4", borderRadius: 6 }}>
                <table style={{ borderCollapse: "collapse" }}>
                  <thead><tr>{data.headers.map((h) => <th key={h} style={T.th}>{h}<div style={{ fontSize: 9, fontWeight: 400, color: data.numeric[h] ? "#2e7d4f" : "#b06a1f" }}>{data.numeric[h] ? "num" : "categ"}</div></th>)}</tr></thead>
                  <tbody>{data.rows.slice(0, 6).map((r, i) => <tr key={i}>{data.headers.map((h, j) => <td key={j} style={T.td}>{r[j]}</td>)}</tr>)}</tbody>
                </table>
              </div>
              {data.n > 6 && <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 3 }}>(mostrando 6 de {data.n})</div>}
            </div>
          )}
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
                  <div style={{ fontSize: 12.5, color: "#46555f", lineHeight: 1.5, marginBottom: 8, textAlign: "justify" }}>{INFO[testKey].e}</div>
                  <pre style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 11.5, whiteSpace: "pre-wrap", color: "#34495e", lineHeight: 1.5, background: "#fff", border: "1px solid #eef1f4", borderRadius: 4, padding: "6px 8px" }}>{INFO[testKey].f}</pre>
                  {INFO[testKey].r && <div style={{ marginTop: 6, fontSize: 11, color: "#7a8b99", fontStyle: "italic" }}>{INFO[testKey].r}</div>}
                </div>
              )}
            </div>
          )}
          {!data ? <div style={{ fontSize: 12.5, color: "#9aa7b2", marginTop: 12 }}>Processe os dados ao lado para escolher as variáveis.</div> : (
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
          {!result ? <div style={{ fontSize: 12.5, color: "#9aa7b2" }}>O resultado aparece aqui.</div> : <Result data={result} />}
        </div>

      </div>
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
      {key === "anova" && <><Row k="F" v={fmt(res.F, 4)} /><Row k="gl" v={`${res.dfb} ; ${res.dfw}`} /><Row k="p" v={fmtP(res.p)} /><Row k="η² (eta²)" v={fmt(res.eta2, 3)} /><div style={{ overflowX: "auto", marginTop: 8 }}><table style={{ borderCollapse: "collapse" }}><thead><tr>{["Grupo", "n", "Média", "DP"].map((h) => <th key={h} style={T.th}>{h}</th>)}</tr></thead><tbody>{res.groups.map((g) => <tr key={g.name}><td style={T.td}>{g.name}</td><td style={T.td}>{g.n}</td><td style={T.td}>{fmt(g.mean, 3)}</td><td style={T.td}>{fmt(g.sd, 3)}</td></tr>)}</tbody></table></div><Sig p={res.p} /></>}
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
