#!/usr/bin/env node
/*
 * build_qualmap.mjs — gera o QualMap.html offline (tudo embutido) a partir do .jsx.
 *
 * Uso:
 *   node build_qualmap.mjs [entrada.jsx] [saida.html]
 *   (padrão: qualmap_v9.jsx  ->  QualMap.html)
 *
 * Pré-requisitos (uma vez):
 *   npm install @babel/core @babel/preset-react react react-dom prop-types recharts mammoth
 *
 * O script:
 *   1) lê o .jsx e remove as duas linhas de import (React e recharts);
 *   2) injeta um preâmbulo que pega React/hooks/Recharts do escopo global (UMD);
 *   3) troca "export default function App()" por "function App()" e monta o render;
 *   4) transpila com Babel (preset-react CLÁSSICO: usa React.createElement);
 *   5) embute as bibliotecas UMD (react, react-dom, prop-types, recharts, mammoth);
 *   6) escreve um HTML único, offline, que abre por duplo clique.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as babel from "@babel/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN = process.argv[2] || "qualmap_v9.jsx";
const OUT = process.argv[3] || "QualMap.html";

// procura node_modules em ./ , ./offline/ ou no diretório do script
function nm() {
  const cands = [
    join(process.cwd(), "node_modules"),
    join(process.cwd(), "offline", "node_modules"),
    join(__dirname, "node_modules"),
    join(__dirname, "offline", "node_modules"),
  ];
  for (const c of cands) if (existsSync(join(c, "react"))) return c;
  throw new Error("node_modules não encontrado. Rode: npm install @babel/core @babel/preset-react react react-dom prop-types recharts mammoth");
}
const NM = nm();
const esc = (s) => s.replace(/<\/script>/gi, "<\\/script>");
const lib = (p) => esc(readFileSync(join(NM, p), "utf8"));

// 1+2+3: prepara o código-fonte
let src = readFileSync(IN, "utf8");
const code = src
  .split("\n")
  .filter((l) => !(l.startsWith("import React") || l.startsWith("import { BarChart")))
  .join("\n");
const preamble =
  'const { useState, useRef, useMemo, useEffect, useCallback } = React;\n' +
  'const __R = (typeof Recharts !== "undefined" && Recharts) || {};\n' +
  'const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } = __R;\n\n';
let body = code.replace("export default function App() {", "function App() {");
body += '\n\nReactDOM.createRoot(document.getElementById("rootapp")).render(<App />);\n';

// 4: transpila
const out = babel.transformSync(preamble + body, {
  presets: [["@babel/preset-react", { runtime: "classic" }]],
  compact: false,
  filename: IN,
});
const app = esc(out.code);

// 5: bibliotecas UMD embutidas (ordem importa: react, react-dom, prop-types, recharts, mammoth)
const react = lib("react/umd/react.production.min.js");
const reactdom = lib("react-dom/umd/react-dom.production.min.js");
const proptypes = lib("prop-types/prop-types.min.js");
const recharts = lib("recharts/umd/Recharts.js");
const mammoth = lib("mammoth/mammoth.browser.min.js");

// 6: HTML final
const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QualMap</title>
<style>
  html,body,#rootapp{height:100%;margin:0}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  #loadmsg{padding:40px;color:#5a6b7a;font-size:14px}
  #errbox{display:none;padding:16px 40px;color:#b3261e;font-size:13px;white-space:pre-wrap;font-family:ui-monospace,monospace}
  /* acessibilidade: foco visível por teclado */
  :focus-visible{outline:2px solid #1f7a8c;outline-offset:1px;border-radius:3px}
  button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible,label:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:2px solid #1f7a8c;outline-offset:1px}
</style>
</head><body>
<div id="rootapp"><div id="loadmsg">Carregando o QualMap...</div></div><pre id="errbox" role="alert"></pre>
<script>
window.addEventListener("error",function(e){var b=document.getElementById("errbox");if(b){b.style.display="block";b.textContent="Erro:\\n"+(e.message||e.error||e)+"\\n"+((e.error&&e.error.stack)||"");}});
window.storage=window.storage||{get:async(k)=>{const v=localStorage.getItem(k);return v==null?null:{key:k,value:v};},set:async(k,v)=>{localStorage.setItem(k,String(v));return{key:k,value:v};},delete:async(k)=>{localStorage.removeItem(k);return{key:k,deleted:true};},list:async(p="")=>{const keys=[];for(let i=0;i<localStorage.length;i++){const kk=localStorage.key(i);if(kk.indexOf(p)===0)keys.push(kk);}return{keys};}};
</script>
<script>${react}</script><script>${reactdom}</script><script>${proptypes}</script><script>${recharts}</script>
<script>${mammoth}</script>
<script>try{ ${app} }catch(e){var b=document.getElementById("errbox");if(b){b.style.display="block";b.textContent="Erro ao iniciar o app:\\n"+(e.message||e)+"\\n"+(e.stack||"");}var l=document.getElementById("loadmsg");if(l)l.textContent="";}</script>
</body></html>`;

writeFileSync(OUT, html);
console.log(`OK: ${OUT} gerado (${Math.round(html.length / 1024)} KB) a partir de ${IN}`);
