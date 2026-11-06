import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { formatarData, formatarDataHora, formatarMoeda, formatarQuantidade } from '@estoque/shared';
import type { Coluna, Relatorio } from './relatorios.service';

const ROTULOS_TOTAIS: Record<string, string> = {
  valor: 'Valor total',
  produtos: 'Produtos',
  registros: 'Registros',
  valorVenda: 'Valor de venda',
  valorCusto: 'Custo',
  valorParado: 'Valor parado',
  valorDivergencia: 'Valor das divergências',
  valorPedido: 'Valor dos pedidos',
  valorRecebido: 'Valor recebido',
  perdas: 'Perdas e avarias',
  saldoAjustes: 'Saldo líquido',
  dias: 'Janela (dias)',
};
const TOTAIS_MONETARIOS = new Set([
  'valor',
  'valorVenda',
  'valorCusto',
  'valorParado',
  'valorDivergencia',
  'valorPedido',
  'valorRecebido',
  'perdas',
  'saldoAjustes',
]);

export function formatarCelula(valor: unknown, tipo: Coluna['tipo']): string {
  if (valor === null || valor === undefined || valor === '') return '';
  switch (tipo) {
    case 'moeda':
      return formatarMoeda(valor);
    case 'quantidade':
      return formatarQuantidade(valor);
    case 'numero':
      return formatarQuantidade(valor, 4);
    case 'percentual':
      return `${formatarQuantidade(valor, 2)}%`;
    case 'data':
      return formatarData(valor as string);
    case 'dataHora':
      return formatarDataHora(valor as string);
    default:
      return String(valor);
  }
}

function descreverTotais(r: Relatorio) {
  return Object.entries(r.totais ?? {}).map(([k, v]) => ({
    rotulo: ROTULOS_TOTAIS[k] ?? k,
    valor: TOTAIS_MONETARIOS.has(k) ? formatarMoeda(v) : String(v),
  }));
}

export async function gerarXlsx(r: Relatorio): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Estoque Agrogest';
  wb.created = new Date();
  const ws = wb.addWorksheet(r.titulo.slice(0, 31), { views: [{ state: 'frozen', ySplit: 4 }] });

  ws.addRow([r.titulo]).font = { bold: true, size: 14 };
  ws.addRow([
    `Gerado em ${formatarDataHora(r.geradoEm)}` +
      (Object.keys(r.filtros).length
        ? ` · Filtros: ${Object.entries(r.filtros)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ')}`
        : ''),
  ]).font = { italic: true, color: { argb: 'FF555555' } };
  ws.addRow([]);
  const cabecalho = ws.addRow(r.colunas.map((c) => c.titulo));
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5F3A' } };
  });

  for (const linha of r.linhas) {
    ws.addRow(
      r.colunas.map((c) => {
        const v = linha[c.chave];
        if (v === null || v === undefined) return null;
        if (['moeda', 'quantidade', 'numero', 'percentual'].includes(c.tipo)) return Number(v);
        if (c.tipo === 'data' || c.tipo === 'dataHora') return new Date(v as string);
        return String(v);
      }),
    );
  }

  r.colunas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(10, Math.round((c.largura ?? 1) * 14));
    if (c.tipo === 'moeda') col.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    if (c.tipo === 'quantidade') col.numFmt = '#,##0.####';
    if (c.tipo === 'percentual') col.numFmt = '0.00"%"';
    if (c.tipo === 'data') col.numFmt = 'dd/mm/yyyy';
    if (c.tipo === 'dataHora') col.numFmt = 'dd/mm/yyyy hh:mm';
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: r.colunas.length } };

  const totais = descreverTotais(r);
  if (totais.length) {
    ws.addRow([]);
    for (const t of totais) ws.addRow([t.rotulo, t.valor]).font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function gerarPdf(r: Relatorio): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 40, bottom: 40, left: 30, right: 30 },
      bufferPages: true,
      info: { Title: r.titulo, Author: 'Estoque Agrogest', Subject: 'Relatório gerencial' },
      lang: 'pt-BR',
      displayTitle: true,
    });
    const partes: Buffer[] = [];
    doc.on('data', (p: Buffer) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const larguraUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pesos = r.colunas.map((c) => c.largura ?? 1);
    const somaPesos = pesos.reduce((a, b) => a + b, 0);
    const larguras = pesos.map((p) => (p / somaPesos) * larguraUtil);
    const alinhamentoDireita = (c: Coluna) =>
      ['moeda', 'quantidade', 'numero', 'percentual'].includes(c.tipo);
    const fonte = r.colunas.length > 10 ? 6.5 : 7.5;

    const cabecalhoTabela = () => {
      let x = doc.page.margins.left;
      const y = doc.y;
      doc.rect(x, y - 2, larguraUtil, 14).fill('#1F5F3A');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(fonte);
      r.colunas.forEach((c, i) => {
        doc.text(c.titulo, x + 2, y + 1, {
          width: larguras[i]! - 4,
          height: fonte + 2,
          align: alinhamentoDireita(c) ? 'right' : 'left',
          lineBreak: false,
          ellipsis: true,
        });
        x += larguras[i]!;
      });
      doc.fillColor('#000000').font('Helvetica');
      doc.y = y + 14;
    };

    doc.font('Helvetica-Bold').fontSize(15).text(r.titulo);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text(`Estoque Agrogest · Gerado em ${formatarDataHora(r.geradoEm)}`);
    if (Object.keys(r.filtros).length) {
      doc.text(
        `Filtros: ${Object.entries(r.filtros)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ')}`,
      );
    }
    doc.fillColor('#000000').moveDown(0.8);
    cabecalhoTabela();

    r.linhas.forEach((linha, idx) => {
      const textos = r.colunas.map((c) => formatarCelula(linha[c.chave], c.tipo));
      doc.fontSize(fonte);
      const altura =
        Math.max(
          ...textos.map((t, i) => doc.heightOfString(t || ' ', { width: larguras[i]! - 4 })),
        ) + 4;
      if (doc.y + altura > doc.page.height - doc.page.margins.bottom - 10) {
        doc.addPage();
        cabecalhoTabela();
      }
      const y = doc.y;
      if (idx % 2 === 1)
        doc
          .rect(doc.page.margins.left, y, larguraUtil, altura)
          .fill('#F2F6F3')
          .fillColor('#000000');
      let x = doc.page.margins.left;
      textos.forEach((t, i) => {
        doc.text(t, x + 2, y + 2, {
          width: larguras[i]! - 4,
          align: alinhamentoDireita(r.colunas[i]!) ? 'right' : 'left',
        });
        x += larguras[i]!;
      });
      doc.y = y + altura;
    });

    if (!r.linhas.length)
      doc.moveDown().fontSize(9).text('Nenhum registro encontrado para os filtros informados.');

    const totais = descreverTotais(r);
    if (totais.length) {
      doc.moveDown().font('Helvetica-Bold').fontSize(9);
      for (const t of totais) doc.text(`${t.rotulo}: ${t.valor}`, { align: 'right' });
    }

    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(i);
      // Sem margem inferior temporariamente: escrever no rodapé não deve criar nova página
      const margemInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(7).fillColor('#777777');
      doc.text(`Página ${i + 1} de ${paginas.count}`, doc.page.margins.left, doc.page.height - 28, {
        width: larguraUtil,
        align: 'right',
        lineBreak: false,
      });
      doc.page.margins.bottom = margemInferior;
    }
    doc.end();
  });
}
