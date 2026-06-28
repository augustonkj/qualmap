#!/usr/bin/env node
/*
 * build_qualmap.mjs — gera o QualMap.html offline (tudo embutido) a partir de src/.
 *
 * Uso:
 *   node build_qualmap.mjs [entrada.jsx] [saida.html]
 *   (padrão: src/main.jsx  ->  QualMap.html)
 *
 * Pré-requisitos (uma vez):
 *   npm install   (instala react, react-dom, recharts, mammoth, esbuild)
 *
 * O script:
 *   1) faz o bundle de src/main.jsx com esbuild (resolve os imports do src/ e
 *      empacota react, react-dom e recharts direto no bundle — sem UMD avulso);
 *   2) embute o mammoth como UMD (continua sendo usado como window.mammoth);
 *   3) injeta o shim window.storage (localStorage) usado pela persistência;
 *   4) escreve um HTML único, offline, que abre por duplo clique.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN = process.argv[2] || "src/main.jsx";
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
  throw new Error("node_modules não encontrado. Rode: npm install");
}
const NM = nm();
const esc = (s) => s.replace(/<\/script>/gi, "<\\/script>");

// 1: bundle do app (react + react-dom + recharts entram no bundle)
const result = await esbuild.build({
  entryPoints: [join(__dirname, IN)],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2018",
  jsx: "transform", // clássico: React.createElement (cada arquivo .jsx importa React)
  loader: { ".js": "jsx" }, // lib.js contém JSX (componente Hint)
  minify: true,
  legalComments: "none",
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const app = esc(result.outputFiles[0].text);

// 2: mammoth como UMD embutido (usado como window.mammoth na importação de .docx)
const mammoth = esc(readFileSync(join(NM, "mammoth/mammoth.browser.min.js"), "utf8"));

// 3+4: HTML final
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
<script>${mammoth}</script>
<script>try{ ${app} }catch(e){var b=document.getElementById("errbox");if(b){b.style.display="block";b.textContent="Erro ao iniciar o app:\\n"+(e.message||e)+"\\n"+(e.stack||"");}var l=document.getElementById("loadmsg");if(l)l.textContent="";}</script>
</body></html>`;

writeFileSync(OUT, html);
console.log(`OK: ${OUT} gerado (${Math.round(html.length / 1024)} KB) a partir de ${IN}`);
