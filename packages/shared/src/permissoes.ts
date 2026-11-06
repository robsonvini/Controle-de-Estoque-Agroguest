/**
 * Catálogo de permissões no formato `modulo:acao`.
 * É a fonte única da verdade: o seed grava estas permissões no banco
 * e o frontend usa a mesma lista para exibir ou ocultar menus e ações.
 */
export const PERMISSOES = {
  'dashboard:ler': 'Visualizar o dashboard',
  'produtos:ler': 'Consultar produtos',
  'produtos:escrever': 'Cadastrar e editar produtos',
  'categorias:ler': 'Consultar categorias',
  'categorias:escrever': 'Cadastrar e editar categorias',
  'estoque:ler': 'Consultar saldos e histórico de estoque',
  'estoque:configurar': 'Gerenciar locais de armazenamento e unidades de medida',
  'entradas:ler': 'Consultar entradas',
  'entradas:registrar': 'Registrar entradas de estoque',
  'saidas:ler': 'Consultar saídas',
  'saidas:registrar': 'Registrar saídas de estoque',
  'transferencias:registrar': 'Registrar transferências entre locais',
  'movimentacoes:estornar': 'Estornar movimentações',
  'compras:ler': 'Consultar pedidos de compra',
  'compras:escrever': 'Criar pedidos de compra e registrar recebimentos',
  'pedidos:ler': 'Consultar pedidos de venda',
  'pedidos:escrever': 'Criar, confirmar e cancelar pedidos de venda',
  'clientes:ler': 'Consultar clientes sincronizados do CRM',
  'inventarios:ler': 'Consultar inventários',
  'inventarios:escrever': 'Abrir inventários e registrar contagens',
  'ajustes:solicitar': 'Solicitar ajustes de estoque',
  'ajustes:aprovar': 'Aprovar ou rejeitar ajustes de estoque',
  'fornecedores:ler': 'Consultar fornecedores',
  'fornecedores:escrever': 'Cadastrar e editar fornecedores',
  'relatorios:ler': 'Visualizar relatórios',
  'relatorios:exportar': 'Exportar relatórios em PDF e Excel',
  'integracao:ler': 'Consultar status e logs da integração com o CRM',
  'integracao:gerenciar': 'Configurar a integração e gerenciar clientes de API',
  'notificacoes:ler': 'Receber notificações e alertas',
  'usuarios:ler': 'Consultar usuários',
  'usuarios:gerenciar': 'Criar, editar e desativar usuários',
  'perfis:gerenciar': 'Gerenciar perfis e permissões',
  'configuracoes:gerenciar': 'Alterar configurações do sistema',
  'auditoria:ler': 'Consultar o registro de atividades',
  'lgpd:gerenciar': 'Exportar e anonimizar dados pessoais (LGPD)',
} as const;

export type Permissao = keyof typeof PERMISSOES;

export const TODAS_PERMISSOES = Object.keys(PERMISSOES) as Permissao[];

export const MODULOS_PERMISSAO: Record<string, string> = {
  dashboard: 'Dashboard',
  produtos: 'Produtos',
  categorias: 'Categorias',
  estoque: 'Estoque',
  entradas: 'Entradas',
  saidas: 'Saídas',
  transferencias: 'Transferências',
  movimentacoes: 'Movimentações',
  compras: 'Compras',
  pedidos: 'Pedidos de venda',
  clientes: 'Clientes (CRM)',
  inventarios: 'Inventário',
  ajustes: 'Ajustes',
  fornecedores: 'Fornecedores',
  relatorios: 'Relatórios',
  integracao: 'Integração CRM',
  notificacoes: 'Notificações',
  usuarios: 'Usuários',
  perfis: 'Perfis',
  configuracoes: 'Configurações',
  auditoria: 'Auditoria',
  lgpd: 'LGPD',
};

const leitura = TODAS_PERMISSOES.filter((p) => p.endsWith(':ler'));

/** Perfis criados pelo seed. Perfis de sistema não podem ser excluídos. */
export const PERFIS_PADRAO: { nome: string; descricao: string; permissoes: Permissao[] }[] = [
  {
    nome: 'Administrador',
    descricao: 'Acesso total ao sistema',
    permissoes: TODAS_PERMISSOES,
  },
  {
    nome: 'Gestor de Estoque',
    descricao: 'Gestão completa do estoque, aprovação de ajustes e estornos',
    permissoes: [
      ...leitura.filter((p) => p !== 'usuarios:ler' && p !== 'auditoria:ler'),
      'produtos:escrever',
      'categorias:escrever',
      'estoque:configurar',
      'entradas:registrar',
      'saidas:registrar',
      'transferencias:registrar',
      'movimentacoes:estornar',
      'compras:escrever',
      'pedidos:escrever',
      'inventarios:escrever',
      'ajustes:solicitar',
      'ajustes:aprovar',
      'fornecedores:escrever',
      'relatorios:exportar',
    ],
  },
  {
    nome: 'Operador de Estoque',
    descricao: 'Registro de entradas, saídas, transferências e contagens',
    permissoes: [
      'dashboard:ler',
      'produtos:ler',
      'categorias:ler',
      'estoque:ler',
      'entradas:ler',
      'entradas:registrar',
      'saidas:ler',
      'saidas:registrar',
      'transferencias:registrar',
      'pedidos:ler',
      'pedidos:escrever',
      'clientes:ler',
      'inventarios:ler',
      'inventarios:escrever',
      'ajustes:solicitar',
      'fornecedores:ler',
      'notificacoes:ler',
    ],
  },
  {
    nome: 'Comprador',
    descricao: 'Fornecedores, pedidos de compra e recebimentos',
    permissoes: [
      'dashboard:ler',
      'produtos:ler',
      'categorias:ler',
      'estoque:ler',
      'entradas:ler',
      'entradas:registrar',
      'compras:ler',
      'compras:escrever',
      'fornecedores:ler',
      'fornecedores:escrever',
      'relatorios:ler',
      'relatorios:exportar',
      'notificacoes:ler',
    ],
  },
  {
    nome: 'Consulta',
    descricao: 'Somente leitura dos dados operacionais',
    permissoes: leitura.filter(
      (p) => !['usuarios:ler', 'auditoria:ler', 'integracao:ler'].includes(p),
    ),
  },
  {
    nome: 'Auditor',
    descricao: 'Leitura completa, auditoria e exportação de relatórios',
    permissoes: [...leitura, 'relatorios:exportar'],
  },
];

/** Escopos concedidos a clientes de API (OAuth 2.0 client credentials). */
export const ESCOPOS_INTEGRACAO = {
  'estoque:consultar': 'Consultar catálogo de produtos e saldos',
  'pedidos:gerenciar': 'Criar, confirmar e cancelar pedidos de venda',
  'webhooks:enviar': 'Enviar eventos por webhook',
} as const;

export type EscopoIntegracao = keyof typeof ESCOPOS_INTEGRACAO;
