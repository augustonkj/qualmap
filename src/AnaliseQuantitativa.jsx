import React from "react";

/*
  Janela — Análise Quantitativa.
  Espaço dedicado a TESTES ESTATÍSTICOS, independente das outras abas (não puxa
  dados da rede TAR nem da análise textual). Conteúdo a ser construído.
*/
function AnaliseQuantitativa({ active = true }) {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", padding: 32, color: "#46555f", maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, color: "#1f7a8c", margin: "0 0 8px" }}>Análise Quantitativa</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        Janela dedicada a <strong>testes estatísticos</strong>. É independente das
        demais abas: os dados e funções serão próprios desta análise.
      </p>
      <p style={{ fontSize: 12.5, color: "#7a8b99" }}>Em construção — as funções estatísticas serão adicionadas aqui.</p>
    </div>
  );
}

export { AnaliseQuantitativa };
