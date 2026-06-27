# Build do QualMap

Gera o `QualMap.html` (arquivo único, offline, abre por duplo clique) a partir do código-fonte `qualmap_v9.jsx`.

## Pré-requisitos
- Node.js 18 ou superior.

## Passos (uma vez)
Na pasta onde estão `qualmap_v9.jsx`, `build_qualmap.mjs` e `package.json`:

```
npm install
```

Isso instala as dependências de build e as bibliotecas que são embutidas no HTML
(react, react-dom, prop-types, recharts, mammoth) e o Babel.

## Gerar o HTML
```
npm run build
```
ou diretamente:
```
node build_qualmap.mjs qualmap_v9.jsx QualMap.html
```

Saída: `QualMap.html` (~1,5 MB). É só abrir no navegador.

## Como funciona
O script lê o `.jsx`, remove as linhas de `import`, injeta um preâmbulo que pega
React/Recharts do escopo global (UMD), transpila com Babel (preset-react clássico,
ou seja, `React.createElement`) e embute as bibliotecas e o app num único HTML.
Ele também injeta o CSS de foco visível por teclado (acessibilidade).

## Editar o app
Altere `qualmap_v9.jsx` e rode o build de novo. Para versionar, copie para
`qualmap_v10.jsx` e ajuste o comando/`package.json` para apontar para o novo arquivo.

## Observações
- O `.docx` é lido via `mammoth` (embutido), então a importação de Word funciona offline.
- Se aparecer "node_modules não encontrado", confirme que rodou `npm install` nesta pasta.
