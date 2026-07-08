import { formatBRL } from "./format";

export type PrintableReceipt = {
  saleNumber: number;
  createdAt: string;
  seller?: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  total: number;
  payments: { method: string; amount: number }[];
  change?: number;
  observation?: string;
  storeName?: string;
  cnpj?: string | null;
  address?: string | null;
  logoUrl?: string | null;
};

const METHOD_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito",
  pix: "Pix", outros: "Outros", fiado: "Fiado",
};

export function receiptHtml(r: PrintableReceipt): string {
  const dateStr = new Date(r.createdAt).toLocaleString("pt-BR");
  const itemsCount = r.items.reduce((s, i) => s + Number(i.quantity), 0);
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>Recibo #${r.saleNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #111; background: #fff; margin: 0; padding: 16px; max-width: 340px; }
    .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #111; }
    .logo { max-width: 110px; max-height: 60px; margin: 0 auto 8px; display: block; }
    .store-name { font-size: 16px; font-weight: 800; letter-spacing: 0.5px; margin: 0; }
    .store-meta { font-size: 10px; color: #555; margin-top: 2px; line-height: 1.4; }
    .sale-info { display: flex; justify-content: space-between; margin: 10px 0; font-size: 11px; }
    .sale-info .label { color: #666; text-transform: uppercase; font-size: 9px; letter-spacing: 0.6px; font-weight: 600; }
    .sale-info .value { font-weight: 700; }
    .badge { display: inline-block; background: #111; color: #fff; padding: 3px 10px; border-radius: 3px; font-weight: 700; font-size: 11px; }
    .section-title { text-transform: uppercase; font-size: 9px; color: #666; letter-spacing: 1px; font-weight: 700; margin: 12px 0 6px; }
    table.items { width: 100%; border-collapse: collapse; }
    table.items th { text-align: left; font-size: 9px; text-transform: uppercase; color: #666; padding: 4px 0; border-bottom: 1px solid #ddd; letter-spacing: 0.5px; }
    table.items td { padding: 5px 0; border-bottom: 1px dashed #eee; font-size: 11px; vertical-align: top; }
    table.items td.qty { text-align: center; width: 40px; color: #666; }
    table.items td.price { text-align: right; width: 70px; font-variant-numeric: tabular-nums; font-weight: 600; }
    table.items td.name { font-weight: 500; }
    .totals { margin-top: 10px; padding: 8px 10px; background: #f6f6f6; border-radius: 4px; }
    .totals .row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
    .totals .row.total { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; font-size: 15px; font-weight: 800; }
    .totals .row .value { font-variant-numeric: tabular-nums; }
    .pay-block { margin-top: 12px; }
    .pay-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #eee; font-size: 11px; }
    .pay-row .method { font-weight: 600; }
    .change { background: #e6f7ea; border: 1px solid #b3e0c1; padding: 6px 10px; border-radius: 4px; margin-top: 6px; display: flex; justify-content: space-between; font-weight: 700; color: #0a6b2c; }
    .obs { margin-top: 10px; padding: 8px 10px; background: #fff8e1; border-left: 3px solid #f0b800; font-size: 11px; }
    .footer { text-align: center; margin-top: 16px; padding-top: 10px; border-top: 1px dashed #999; font-size: 10px; color: #555; }
    .footer .thanks { font-weight: 700; color: #111; font-size: 12px; margin-bottom: 4px; }
    @page { margin: 8mm; size: 80mm auto; }
    @media print { body { padding: 4px; } }
  </style></head><body>
    <div class="header">
      ${r.logoUrl ? `<img class="logo" src="${escape(r.logoUrl)}" alt=""/>` : ""}
      <div class="store-name">${escape(r.storeName ?? "MERCADO")}</div>
      <div class="store-meta">
        ${r.cnpj ? `CNPJ: ${escape(r.cnpj)}<br/>` : ""}
        ${r.address ? escape(r.address) : ""}
      </div>
    </div>

    <div class="sale-info">
      <div>
        <div class="label">Venda</div>
        <div class="value"><span class="badge">#${r.saleNumber}</span></div>
      </div>
      <div style="text-align:right">
        <div class="label">Emitido em</div>
        <div class="value">${dateStr}</div>
      </div>
    </div>
    ${r.seller ? `<div style="font-size:10px;color:#666">Vendedor: <b style="color:#111">${escape(r.seller)}</b></div>` : ""}

    <div class="section-title">Itens (${itemsCount})</div>
    <table class="items">
      <thead><tr><th>Produto</th><th style="text-align:center">Qtd</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        ${r.items.map((i) => `
          <tr>
            <td class="name">${escape(i.name)}<div style="font-size:9px;color:#888">${formatBRL(i.unitPrice)} un</div></td>
            <td class="qty">${i.quantity}</td>
            <td class="price">${formatBRL(i.quantity * i.unitPrice)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span class="value">${formatBRL(r.subtotal)}</span></div>
      ${r.discount > 0 ? `<div class="row" style="color:#c00"><span>Desconto</span><span class="value">- ${formatBRL(r.discount)}</span></div>` : ""}
      <div class="row total"><span>TOTAL</span><span class="value">${formatBRL(r.total)}</span></div>
    </div>

    <div class="section-title">Pagamento</div>
    <div class="pay-block">
      ${r.payments.map((p) => `<div class="pay-row"><span class="method">${escape(METHOD_LABEL[p.method] ?? p.method)}</span><span>${formatBRL(p.amount)}</span></div>`).join("")}
      ${r.change && r.change > 0 ? `<div class="change"><span>Troco</span><span>${formatBRL(r.change)}</span></div>` : ""}
    </div>

    ${r.observation ? `<div class="obs"><b>Observação:</b><br/>${escape(r.observation)}</div>` : ""}

    <div class="footer">
      <div class="thanks">Obrigado pela preferência!</div>
      <div>Volte sempre 🛒</div>
    </div>
  </body></html>`;
}

export function printReceipt(r: PrintableReceipt): void {
  const html = receiptHtml(r).replace(
    "</body>",
    `<script>window.onload=function(){window.print();setTimeout(function(){window.close();},400);};<\/script></body>`,
  );
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) {
    alert("Bloqueador de pop-up impediu abrir o recibo. Libere e tente novamente.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function savePdfReceipt(r: PrintableReceipt): void {
  const html = receiptHtml(r).replace(
    "</body>",
    `<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body>`,
  );
  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) {
    alert("Bloqueador de pop-up impediu abrir o recibo. Libere e tente novamente.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
