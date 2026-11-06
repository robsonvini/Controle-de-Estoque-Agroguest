import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Boxes,
  ClipboardCheck,
  FolderTree,
  LayoutDashboard,
  Package,
  PlugZap,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import type { Permissao } from '@estoque/shared';

export interface ItemMenu {
  rotulo: string;
  href: string;
  icone: LucideIcon;
  /** Exibido se o usuário tiver QUALQUER uma destas permissões. */
  permissoes: Permissao[];
}

/** Menu lateral (estrutura sugerida na especificação, item 12). */
export const MENU: ItemMenu[] = [
  {
    rotulo: 'Dashboard',
    href: '/dashboard',
    icone: LayoutDashboard,
    permissoes: ['dashboard:ler'],
  },
  { rotulo: 'Produtos', href: '/produtos', icone: Package, permissoes: ['produtos:ler'] },
  { rotulo: 'Categorias', href: '/categorias', icone: FolderTree, permissoes: ['categorias:ler'] },
  {
    rotulo: 'Estoque',
    href: '/estoque',
    icone: Warehouse,
    permissoes: ['estoque:ler', 'estoque:configurar'],
  },
  {
    rotulo: 'Entradas',
    href: '/entradas',
    icone: ArrowDownToLine,
    permissoes: ['entradas:ler', 'entradas:registrar'],
  },
  {
    rotulo: 'Saídas',
    href: '/saidas',
    icone: ArrowUpFromLine,
    permissoes: ['saidas:ler', 'saidas:registrar'],
  },
  { rotulo: 'Compras', href: '/compras', icone: Truck, permissoes: ['compras:ler'] },
  {
    rotulo: 'Pedidos de venda',
    href: '/pedidos',
    icone: ShoppingCart,
    permissoes: ['pedidos:ler'],
  },
  {
    rotulo: 'Inventário',
    href: '/inventario',
    icone: ClipboardCheck,
    permissoes: ['inventarios:ler'],
  },
  { rotulo: 'Fornecedores', href: '/fornecedores', icone: Boxes, permissoes: ['fornecedores:ler'] },
  { rotulo: 'Clientes (CRM)', href: '/clientes', icone: Users, permissoes: ['clientes:ler'] },
  { rotulo: 'Relatórios', href: '/relatorios', icone: BarChart3, permissoes: ['relatorios:ler'] },
  { rotulo: 'Integração CRM', href: '/integracao', icone: PlugZap, permissoes: ['integracao:ler'] },
  {
    rotulo: 'Usuários e permissões',
    href: '/usuarios',
    icone: UserCog,
    permissoes: ['usuarios:ler'],
  },
  {
    rotulo: 'Configurações',
    href: '/configuracoes',
    icone: Settings,
    permissoes: ['configuracoes:gerenciar', 'auditoria:ler', 'lgpd:gerenciar'],
  },
];
