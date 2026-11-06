/** Validação e formatação de documentos brasileiros (CPF e CNPJ). */

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function cpfValido(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (fatorInicial: number) => {
    let soma = 0;
    for (let i = 0; i < fatorInicial - 1; i++) soma += Number(cpf[i]) * (fatorInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(10) === Number(cpf[9]) && calc(11) === Number(cpf[10]);
}

export function cnpjValido(valor: string): boolean {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (tamanho: number) => {
    const pesos =
      tamanho === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cnpj[i]) * pesos[i]!;
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export function formatarCpf(valor: string): string {
  const d = somenteDigitos(valor);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : valor;
}

export function formatarCnpj(valor: string): string {
  const d = somenteDigitos(valor);
  return d.length === 14
    ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : valor;
}

export function formatarDocumento(valor: string | null | undefined): string {
  if (!valor) return '';
  const d = somenteDigitos(valor);
  return d.length === 11 ? formatarCpf(d) : d.length === 14 ? formatarCnpj(d) : valor;
}

/** Mascara CPF para exibição e logs (LGPD): ***.456.789-** */
export function mascararCpf(valor: string | null | undefined): string {
  if (!valor) return '';
  const d = somenteDigitos(valor);
  if (d.length !== 11) return '***';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** Mascara documento: CNPJ (pessoa jurídica) é exibido; CPF é mascarado. */
export function mascararDocumento(valor: string | null | undefined): string {
  if (!valor) return '';
  const d = somenteDigitos(valor);
  return d.length === 11 ? mascararCpf(d) : formatarDocumento(d);
}
