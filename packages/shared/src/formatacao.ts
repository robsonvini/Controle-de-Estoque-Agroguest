/** Formatação de números, moeda e datas no padrão brasileiro. */

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const data = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export function paraNumero(valor: unknown): number {
  if (valor == null || valor === '') return 0;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export function formatarMoeda(valor: unknown): string {
  return moeda.format(paraNumero(valor));
}

export function formatarQuantidade(valor: unknown, casas = 4): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(paraNumero(valor));
}

export function formatarDataHora(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  return dataHora.format(new Date(valor));
}

export function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  return data.format(new Date(valor));
}
