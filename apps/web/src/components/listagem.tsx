'use client';

import { Search } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  ROTULOS_STATUS_AJUSTE,
  ROTULOS_STATUS_INVENTARIO,
  ROTULOS_STATUS_PEDIDO,
  ROTULOS_STATUS_PEDIDO_COMPRA,
  ROTULOS_TIPO_MOVIMENTACAO,
  type StatusAjuste,
  type StatusInventario,
  type StatusPedido,
  type StatusPedidoCompra,
  type TipoMovimentacao,
} from '@estoque/shared';
import { Etiqueta, type CorEtiqueta } from './ui/basicos';

/** Barra de filtros: campo de busca com atraso (debounce) + filtros adicionais. */
export function BarraFiltros({
  busca,
  aoBuscar,
  placeholder = 'Buscar…',
  children,
}: {
  busca?: string;
  aoBuscar: (v: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const [texto, setTexto] = useState(busca ?? '');
  useEffect(() => setTexto(busca ?? ''), [busca]);
  useEffect(() => {
    if (texto === (busca ?? '')) return;
    const t = setTimeout(() => aoBuscar(texto), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);
  return (
    <div
      role="search"
      className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-borda bg-white p-3"
    >
      <div className="min-w-56 flex-1">
        <label htmlFor={id} className="block text-xs font-medium text-suave">
          Busca
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
            aria-hidden
          />
          <input
            id={id}
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder}
            className="h-10 w-full rounded-md border border-borda bg-white pr-3 pl-9 text-sm"
          />
        </div>
      </div>
      {children}
    </div>
  );
}

/** Filtro de seleção compacto para a barra de filtros. */
export function FiltroSelecao({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  todos = 'Todos',
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: { valor: string; rotulo: string }[];
  todos?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-suave">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="h-10 rounded-md border border-borda bg-white px-2 text-sm"
      >
        <option value="">{todos}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FiltroData({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-suave">
        {rotulo}
      </label>
      <input
        id={id}
        type="date"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="h-10 rounded-md border border-borda bg-white px-2 text-sm"
      />
    </div>
  );
}

const SITUACAO: Record<string, [string, CorEtiqueta]> = {
  DISPONIVEL: ['Disponível', 'verde'],
  BAIXO: ['Estoque baixo', 'amarelo'],
  ESGOTADO: ['Esgotado', 'vermelho'],
};
export function EtiquetaSituacao({ situacao }: { situacao: string }) {
  const [rotulo, cor] = SITUACAO[situacao] ?? [situacao, 'cinza'];
  return <Etiqueta cor={cor}>{rotulo}</Etiqueta>;
}

const COR_TIPO: Record<TipoMovimentacao, CorEtiqueta> = {
  ENTRADA: 'verde',
  SAIDA: 'azul',
  TRANSFERENCIA: 'roxo',
  AJUSTE: 'amarelo',
  ESTORNO: 'vermelho',
};
export function EtiquetaTipo({ tipo }: { tipo: TipoMovimentacao }) {
  return <Etiqueta cor={COR_TIPO[tipo]}>{ROTULOS_TIPO_MOVIMENTACAO[tipo]}</Etiqueta>;
}

const COR_STATUS: Record<string, CorEtiqueta> = {
  RASCUNHO: 'cinza',
  ENVIADO: 'azul',
  PARCIALMENTE_RECEBIDO: 'amarelo',
  RECEBIDO: 'verde',
  CANCELADO: 'vermelho',
  RESERVADO: 'amarelo',
  CONFIRMADO: 'verde',
  EM_CONTAGEM: 'azul',
  EM_REVISAO: 'amarelo',
  FINALIZADO: 'verde',
  PENDENTE: 'amarelo',
  APROVADO: 'verde',
  REJEITADO: 'vermelho',
  ATIVO: 'verde',
  INATIVO: 'cinza',
  BLOQUEADO: 'vermelho',
  SUCESSO: 'verde',
  FALHA: 'vermelho',
  EM_ANDAMENTO: 'azul',
  PROCESSADO: 'verde',
  RECEBIDO_EVT: 'azul',
  ERRO: 'vermelho',
  IGNORADO: 'cinza',
};
const ROTULOS_STATUS: Record<string, string> = {
  ...ROTULOS_STATUS_PEDIDO_COMPRA,
  ...ROTULOS_STATUS_PEDIDO,
  ...ROTULOS_STATUS_INVENTARIO,
  ...ROTULOS_STATUS_AJUSTE,
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  BLOQUEADO: 'Bloqueado',
  SUCESSO: 'Sucesso',
  FALHA: 'Falha',
  EM_ANDAMENTO: 'Em andamento',
  PROCESSADO: 'Processado',
  ERRO: 'Erro',
  IGNORADO: 'Ignorado',
};
export function EtiquetaStatus({
  status,
}: {
  status: StatusPedido | StatusPedidoCompra | StatusInventario | StatusAjuste | string;
}) {
  return (
    <Etiqueta cor={COR_STATUS[status] ?? 'cinza'}>{ROTULOS_STATUS[status] ?? status}</Etiqueta>
  );
}
