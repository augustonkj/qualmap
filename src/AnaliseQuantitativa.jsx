import React from "react";

/*
  Janela 4 — Análise Quantitativa.
  Reunirá as frequências da análise textual (códigos, co-ocorrência) e as
  métricas da rede TAR (grau, intermediação). Lê os dois lados pela ponte SUITE
  (SUITE.getTar / SUITE.getQual). Conteúdo a ser preenchido no passo 2b.
*/
function AnaliseQuantitativa({ active = true }) {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", padding: 32, color: "#46555f" }}>
      <h2 style={{ fontSize: 18, color: "#1f7a8c", margin: "0 0 8px" }}>Análise Quantitativa</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: 560 }}>
        Esta janela reunirá as <strong>frequências do texto</strong> (códigos e
        co-ocorrência, vindos da Análise Qualitativa) e as <strong>métricas da
        rede TAR</strong> (grau e intermediação, vindas da Codificação TAR).
      </p>
      <p style={{ fontSize: 12.5, color: "#7a8b99" }}>Em construção (passo 2b da modularização).</p>
    </div>
  );
}

export { AnaliseQuantitativa };
