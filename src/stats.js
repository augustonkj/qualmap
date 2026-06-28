/*
  stats.js — biblioteca estatística do QualMap (Análise Quantitativa).
  Funções puras: distribuições, descritivas e testes (paramétricos e não-paramétricos).
  Inspirado nos tópicos do livro de Moreira. Sem dependências externas.
*/

/* ============ distribuições ============ */
export function lgamma(x) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1; let a = c[0]; const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
// P(a,x): gama incompleta inferior regularizada
export function gammp(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 300; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  const FPMIN = 1e-300; let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i <= 300; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN; c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
  const Q = Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  return 1 - Q;
}
export function erf(x) { const s = x < 0 ? -1 : 1; return s * gammp(0.5, x * x); }
export function normalCDF(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
export function normalPDF(z) { return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }
// Φ⁻¹ (Acklam)
export function normalInv(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425; let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
function betacf(a, b, x) {
  const FPMIN = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}
// I_x(a,b): beta incompleta regularizada
export function betai(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}
// p bicaudal de Student
export function tTwoTailP(t, df) { if (df <= 0) return NaN; return betai(df / 2, 0.5, df / (df + t * t)); }
export function chi2SF(x, df) { if (x <= 0) return 1; return 1 - gammp(df / 2, x / 2); }
export function fSF(f, d1, d2) { if (f <= 0) return 1; return 1 - betai(d1 / 2, d2 / 2, d1 * f / (d1 * f + d2)); }
// t crítico bicaudal para um nível de confiança
export function tCrit(df, conf) {
  const alpha = 1 - conf; let lo = 0, hi = 1e6;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; (tTwoTailP(mid, df) > alpha) ? (lo = mid) : (hi = mid); }
  return (lo + hi) / 2;
}

/* ============ utilitários ============ */
export const toNums = (arr) => arr.map((v) => (typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")))).filter((v) => Number.isFinite(v));
const sum = (a) => a.reduce((s, x) => s + x, 0);
const mean = (a) => sum(a) / a.length;
function variance(a, sample = true) { const m = mean(a); const ss = sum(a.map((x) => (x - m) ** 2)); return ss / (a.length - (sample ? 1 : 0)); }
function quantile(sorted, q) { const pos = (sorted.length - 1) * q; const b = Math.floor(pos); const r = pos - b; return sorted[b + 1] !== undefined ? sorted[b] + r * (sorted[b + 1] - sorted[b]) : sorted[b]; }
// postos com correção de empates (postos médios); devolve {ranks, tieCorrection}
function rankWithTies(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length); let tieT = 0; let i = 0;
  while (i < idx.length) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; const t = j - i + 1; if (t > 1) tieT += t ** 3 - t;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return { ranks, tieT };
}

/* ============ descritivas ============ */
export function describe(raw) {
  const x = toNums(raw); const n = x.length;
  if (!n) return null;
  const s = [...x].sort((a, b) => a - b);
  const m = mean(x); const v = variance(x, true); const sd = Math.sqrt(v);
  const freq = {}; x.forEach((v) => (freq[v] = (freq[v] || 0) + 1));
  const maxF = Math.max(...Object.values(freq));
  const modes = Object.keys(freq).filter((k) => freq[k] === maxF).map(Number);
  const m3 = sum(x.map((v) => (v - m) ** 3)) / n, m4 = sum(x.map((v) => (v - m) ** 4)) / n;
  const sdPop = Math.sqrt(variance(x, false));
  return {
    n, mean: m, median: quantile(s, 0.5), mode: modes.length <= 3 ? modes : modes.slice(0, 3),
    variance: v, sd, sem: sd / Math.sqrt(n), min: s[0], max: s[n - 1], range: s[n - 1] - s[0],
    q1: quantile(s, 0.25), q3: quantile(s, 0.75), iqr: quantile(s, 0.75) - quantile(s, 0.25),
    skew: sdPop ? m3 / sdPop ** 3 : 0, kurtosis: sdPop ? m4 / sdPop ** 4 - 3 : 0, sum: sum(x),
  };
}
export function ciMean(raw, conf = 0.95) {
  const x = toNums(raw); const n = x.length; if (n < 2) return null;
  const m = mean(x); const se = Math.sqrt(variance(x)) / Math.sqrt(n); const tc = tCrit(n - 1, conf);
  return { mean: m, lo: m - tc * se, hi: m + tc * se, conf, df: n - 1, se };
}

/* ============ testes paramétricos ============ */
export function oneSampleT(raw, mu0 = 0, conf = 0.95) {
  const x = toNums(raw); const n = x.length; if (n < 2) return { error: "Mínimo de 2 observações." };
  const m = mean(x); const sd = Math.sqrt(variance(x)); const se = sd / Math.sqrt(n);
  const t = (m - mu0) / se; const df = n - 1; const p = tTwoTailP(t, df); const tc = tCrit(df, conf);
  return { test: "t para uma amostra", n, mean: m, sd, se, mu0, t, df, p, ci: [m - tc * se, m + tc * se], conf, d: (m - mu0) / sd };
}
export function twoSampleT(rawA, rawB, { welch = true, conf = 0.95 } = {}) {
  const x = toNums(rawA), y = toNums(rawB); const n1 = x.length, n2 = y.length;
  if (n1 < 2 || n2 < 2) return { error: "Cada grupo precisa de ao menos 2 observações." };
  const m1 = mean(x), m2 = mean(y), v1 = variance(x), v2 = variance(y);
  let t, df;
  if (welch) { const se = Math.sqrt(v1 / n1 + v2 / n2); t = (m1 - m2) / se; df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)); }
  else { const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2); const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2)); t = (m1 - m2) / se; df = n1 + n2 - 2; }
  const p = tTwoTailP(t, df);
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  return { test: welch ? "t para duas amostras (Welch)" : "t para duas amostras (Student)", n1, n2, mean1: m1, mean2: m2, sd1: Math.sqrt(v1), sd2: Math.sqrt(v2), t, df, p, conf, d: (m1 - m2) / sp };
}
export function pairedT(rawA, rawB, conf = 0.95) {
  const x = toNums(rawA), y = toNums(rawB);
  if (x.length !== y.length || x.length < 2) return { error: "As duas colunas precisam ter o mesmo nº de observações (≥2)." };
  const d = x.map((v, i) => v - y[i]); const r = oneSampleT(d, 0, conf);
  return { ...r, test: "t para amostras pareadas", meanDiff: r.mean, mean1: mean(x), mean2: mean(y) };
}
export function oneWayAnova(groups, names) {
  const G = groups.map(toNums).filter((g) => g.length); const k = G.length;
  if (k < 2) return { error: "Informe ao menos 2 grupos." };
  const all = G.flat(); const N = all.length; const gm = mean(all);
  let ssb = 0, ssw = 0; const rows = [];
  G.forEach((g, i) => { const m = mean(g); ssb += g.length * (m - gm) ** 2; ssw += sum(g.map((v) => (v - m) ** 2)); rows.push({ name: (names && names[i]) || `G${i + 1}`, n: g.length, mean: m, sd: g.length > 1 ? Math.sqrt(variance(g)) : 0 }); });
  const dfb = k - 1, dfw = N - k; const msb = ssb / dfb, msw = ssw / dfw; const F = msb / msw; const p = fSF(F, dfb, dfw);
  const sst = ssb + ssw;
  return { test: "ANOVA de um fator (teste F)", k, N, F, dfb, dfw, p, ssb, ssw, msb, msw, eta2: ssb / sst, groups: rows };
}
export function pearson(rawA, rawB, conf = 0.95) {
  const x = toNums(rawA), y = toNums(rawB); const n = Math.min(x.length, y.length);
  if (n < 3) return { error: "Mínimo de 3 pares." };
  const X = x.slice(0, n), Y = y.slice(0, n); const mx = mean(X), my = mean(Y);
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
  const r = sxy / Math.sqrt(sxx * syy); const df = n - 2; const t = r * Math.sqrt(df / (1 - r * r)); const p = tTwoTailP(t, df);
  const z = 0.5 * Math.log((1 + r) / (1 - r)); const se = 1 / Math.sqrt(n - 3); const zc = normalInv((1 + conf) / 2);
  const ci = [Math.tanh(z - zc * se), Math.tanh(z + zc * se)];
  return { test: "Correlação de Pearson", n, r, r2: r * r, t, df, p, ci, conf };
}
export function spearman(rawA, rawB) {
  const x = toNums(rawA), y = toNums(rawB); const n = Math.min(x.length, y.length);
  if (n < 3) return { error: "Mínimo de 3 pares." };
  const rx = rankWithTies(x.slice(0, n)).ranks, ry = rankWithTies(y.slice(0, n)).ranks;
  const pr = pearson(rx, ry); return { test: "Correlação de Spearman (ρ)", n, rho: pr.r, t: pr.t, df: pr.df, p: pr.p };
}

/* ============ consistência interna ============ */
export function cronbach(itemColumns) {
  const items = itemColumns.map(toNums); const k = items.length;
  if (k < 2) return { error: "Selecione ao menos 2 itens (colunas)." };
  const n = Math.min(...items.map((c) => c.length)); if (n < 2) return { error: "Poucas observações." };
  const cols = items.map((c) => c.slice(0, n));
  const itemVars = cols.map((c) => variance(c)); const sumItemVar = sum(itemVars);
  const totals = []; for (let i = 0; i < n; i++) totals.push(sum(cols.map((c) => c[i])));
  const totalVar = variance(totals);
  const alpha = (k / (k - 1)) * (1 - sumItemVar / totalVar);
  return { test: "Alfa de Cronbach (consistência interna)", k, n, alpha, totalVar, sumItemVar };
}

/* ============ não-paramétricos ============ */
export function mannWhitney(rawA, rawB) {
  const x = toNums(rawA), y = toNums(rawB); const n1 = x.length, n2 = y.length;
  if (n1 < 1 || n2 < 1) return { error: "Cada grupo precisa de observações." };
  const all = [...x, ...y]; const { ranks, tieT } = rankWithTies(all);
  const R1 = sum(ranks.slice(0, n1)); const U1 = R1 - n1 * (n1 + 1) / 2; const U2 = n1 * n2 - U1; const U = Math.min(U1, U2);
  const mu = n1 * n2 / 2; const N = n1 + n2;
  const sigma = Math.sqrt((n1 * n2 / 12) * ((N + 1) - tieT / (N * (N - 1))));
  const z = (U - mu) / sigma; const p = 2 * (1 - normalCDF(Math.abs(z)));
  return { test: "Mann-Whitney U (2 amostras independentes)", n1, n2, U, U1, U2, z, p };
}
export function wilcoxonSignedRank(rawA, rawB) {
  const x = toNums(rawA), y = toNums(rawB);
  if (x.length !== y.length || x.length < 2) return { error: "Colunas pareadas (mesmo nº, ≥2)." };
  const diffs = x.map((v, i) => v - y[i]).filter((d) => d !== 0); const n = diffs.length;
  if (n < 1) return { error: "Todas as diferenças são zero." };
  const { ranks, tieT } = rankWithTies(diffs.map(Math.abs));
  let Wp = 0, Wm = 0; diffs.forEach((d, i) => (d > 0 ? (Wp += ranks[i]) : (Wm += ranks[i])));
  const W = Math.min(Wp, Wm); const mu = n * (n + 1) / 4;
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1) - tieT / 2) / 24);
  const z = (W - mu) / sigma; const p = 2 * (1 - normalCDF(Math.abs(z)));
  return { test: "Wilcoxon (2 amostras relacionadas)", n, Wplus: Wp, Wminus: Wm, W, z, p };
}
export function chiSquareIndependence(table) {
  const r = table.length, c = table[0].length;
  const rowSum = table.map((row) => sum(row)); const colSum = table[0].map((_, j) => sum(table.map((row) => row[j]))); const tot = sum(rowSum);
  if (!tot) return { error: "Tabela vazia." };
  let chi = 0; let minE = Infinity; const exp = [];
  for (let i = 0; i < r; i++) { exp.push([]); for (let j = 0; j < c; j++) { const e = rowSum[i] * colSum[j] / tot; exp[i].push(e); minE = Math.min(minE, e); chi += (table[i][j] - e) ** 2 / e; } }
  const df = (r - 1) * (c - 1); const p = chi2SF(chi, df);
  const phi2 = chi / tot; const cramer = Math.sqrt(phi2 / Math.min(r - 1, c - 1));
  return { test: "Qui-quadrado de independência", chi2: chi, df, p, n: tot, minExpected: minE, cramerV: cramer, expected: exp };
}
export function runsTest(raw) {
  const x = toNums(raw); const n = x.length; if (n < 3) return { error: "Mínimo de 3 observações." };
  const med = quantile([...x].sort((a, b) => a - b), 0.5);
  const seq = x.filter((v) => v !== med).map((v) => v > med ? 1 : 0);
  const n1 = seq.filter((s) => s === 1).length, n2 = seq.filter((s) => s === 0).length;
  if (!n1 || !n2) return { error: "Sem variação em torno da mediana." };
  let runs = 1; for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) runs++;
  const N = n1 + n2; const mu = 2 * n1 * n2 / N + 1; const sigma = Math.sqrt(2 * n1 * n2 * (2 * n1 * n2 - N) / (N * N * (N - 1)));
  const z = (runs - mu) / sigma; const p = 2 * (1 - normalCDF(Math.abs(z)));
  return { test: "Teste de aleatoriedade (runs / Wald-Wolfowitz)", n, runs, n1, n2, expected: mu, z, p };
}
