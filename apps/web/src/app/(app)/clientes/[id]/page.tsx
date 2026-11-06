'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatarCnpj, formatarDataHora, formatarMoeda } from '@estoque/shared';
import { EtiquetaStatus } from '@/components/listagem';
import {
  CabecalhoPagina,
  Carregando,
  Cartao,
  ErroCarregamento,
  ListaDados,
} from '@/components/ui/basicos';
import { Tabela } from '@/components/ui/tabela';
import { useConsulta } from '@/lib/hooks';

interface Cliente {
  id: string;
  crmId: string;
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  removidoNoCrm: boolean;
  sincronizadoEm: string;
  pedidos: {
    id: string;
    numero: string;
    status: string;
    valorTotal: string;
    criadoEm: string;
    idExterno: string | null;
  }[];
}

export default function DetalheCliente() {
  const { id } = useParams<{ id: string }>();
  const { data: c, error, isLoading } = useConsulta<Cliente>(`/clientes/${id}`);
  if (isLoading) return <Carregando />;
  if (error || !c) return <ErroCarregamento erro={error} />;
  return (
    <>
      <CabecalhoPagina
        titulo={c.nome}
        descricao="Dados mantidos pelo CRM Agrogest (somente leitura)"
      />
      <Cartao className="mb-4">
        <ListaDados
          itens={[
            ['Razão social', c.razaoSocial],
            ['CNPJ', c.cnpj ? formatarCnpj(c.cnpj) : null],
            ['CPF', c.cpf],
            ['E-mail', c.email],
            ['Telefone', c.telefone],
            ['Cidade/UF', [c.cidade, c.uf].filter(Boolean).join('/') || null],
            [
              'ID no CRM',
              <code key="id" className="text-xs">
                {c.crmId}
              </code>,
            ],
            ['Última sincronização', formatarDataHora(c.sincronizadoEm)],
            ['Situação no CRM', c.removidoNoCrm ? 'Removido no CRM' : 'Ativo'],
          ]}
        />
      </Cartao>
      <h2 className="mb-2 text-lg font-semibold">Pedidos de venda</h2>
      <Tabela
        legenda="Pedidos do cliente"
        dados={c.pedidos}
        chave={(p) => p.id}
        textoVazio="Nenhum pedido para este cliente."
        colunas={[
          {
            titulo: 'Pedido',
            celula: (p) => (
              <Link className="underline" href={`/pedidos/${p.id}`}>
                nº {p.numero}
              </Link>
            ),
          },
          { titulo: 'ID externo', celula: (p) => p.idExterno ?? '—' },
          { titulo: 'Data', celula: (p) => formatarDataHora(p.criadoEm) },
          { titulo: 'Status', celula: (p) => <EtiquetaStatus status={p.status} /> },
          { titulo: 'Valor', alinhamento: 'direita', celula: (p) => formatarMoeda(p.valorTotal) },
        ]}
      />
    </>
  );
}
