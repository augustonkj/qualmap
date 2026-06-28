# Build do QualMap

Gera o `QualMap.html` (arquivo único, offline, abre por duplo clique) a partir do
código-fonte modular em `src/`.

## Pré-requisitos
- Node.js 18 ou superior.

## Passos (uma vez)
Na pasta do projeto (onde estão `src/`, `build_qualmap.mjs` e `package.json`):

```
npm install
```

Isso instala o esbuild (bundler), as bibliotecas empacotadas no app
(react, react-dom, recharts) e o mammoth (embutido para leitura de `.docx`).

## Gerar o HTML
```
npm run build
```
ou diretamente:
```
node build_qualmap.mjs src/main.jsx QualMap.html
```

Saída: `QualMap.html` (~1,3 MB). É só abrir no navegador.

## Estrutura do código (`src/`)
- `lib.js` — camada compartilhada: cores, `NODE_TYPES`, `MOMENTS`, geometria/SVG
  (`buildInner`), layouts, `brandes`, `parseCSV`, seeds, `Hint`, `SUITE` (ponte
  entre as ferramentas). Exporta tudo num barrel no fim do arquivo.
- `EditorTAR.jsx` — editor Ator-Rede. Uma única instância serve duas janelas via
  a prop `viewMode`: **Codificação TAR** (`analise`) e **Diagramas** (`diagrama`).
- `AnaliseQualitativa.jsx` — análise textual (codificação, categorias, metatexto,
  confiabilidade). Persiste em `window.storage` (localStorage).
- `AnaliseQuantitativa.jsx` — janela quantitativa: lê os dois lados pela ponte
  `SUITE` (`getTar`/`getQual`) ao ser aberta. Hoje mostra frequências do texto e
  métricas da rede; é o lugar previsto para os **testes estatísticos**.
- `App.jsx` — casca com as 4 abas + salvar/abrir QualMap + tutorial.
- `main.jsx` — ponto de entrada (`createRoot`).

As 4 janelas:

```
Codificação TAR ─┐ mesma rede        Análise Qualitativa ─┐ mesmo texto
Diagramas ───────┘ (estado do TAR)   Análise Quantitativa ┘ (via SUITE)
```

## Como funciona o build
O `build_qualmap.mjs` faz o bundle de `src/main.jsx` com **esbuild** (resolve os
imports do `src/` e empacota react/react-dom/recharts no próprio bundle, sem UMD
avulso), embute o `mammoth` como UMD (`window.mammoth`), injeta o shim
`window.storage` (localStorage) e o CSS de foco visível, e escreve um HTML único.

## Editar o app
Altere os arquivos em `src/` e rode `npm run build` de novo.

## Observações
- O `.docx` é lido via `mammoth` (embutido), então a importação de Word funciona offline.
- Se aparecer "node_modules não encontrado", confirme que rodou `npm install` nesta pasta.
