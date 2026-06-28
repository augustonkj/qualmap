import React from "react";

/*
  Diagrama Geral — mapa conceitual / mental livre, independente das outras abas.
  Placeholder (passo 3a). O editor completo é construído no passo 3b.
*/
function DiagramaGeral({ active = true }) {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", padding: 32, color: "#46555f", maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, color: "#1f7a8c", margin: "0 0 8px" }}>Diagrama Geral</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        Mapa conceitual / mental livre — nós e ligações sem as regras da Teoria
        Ator-Rede, independente das outras abas.
      </p>
      <p style={{ fontSize: 12.5, color: "#7a8b99" }}>Em construção (passo 3b).</p>
    </div>
  );
}

export { DiagramaGeral };
