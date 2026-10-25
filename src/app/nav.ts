import {
  Boxes, Calculator, ChartColumnBig, Cog, FileText, LayoutDashboard, MessageSquareText, PackagePlus, Receipt,
  ReceiptIndianRupee, Settings, TreePine, Trees, Truck, Users, Wallet, Layers, type LucideIcon,
} from 'lucide-react'
import type { Role } from '../lib/auth'

export interface NavItem { to: string; label: string; icon: LucideIcon; roles?: Role[]; end?: boolean }
export interface NavGroup { group: string; items: NavItem[] }

// roles: who besides the owner may open it (owner always can). No roles = every staff member.
export const NAV: NavGroup[] = [
  { group: 'Overview', items: [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    group: 'Sell',
    items: [
      { to: '/app/sales/new', label: 'New bill', icon: ReceiptIndianRupee, roles: ['manager', 'accounts', 'sales'] },
      { to: '/app/sales', label: 'Bills & quotations', icon: FileText, end: true },
      { to: '/app/deliveries', label: 'Deliveries', icon: Truck },
      { to: '/app/enquiries', label: 'Website enquiries', icon: MessageSquareText },
    ],
  },
  {
    group: 'Yard',
    items: [
      { to: '/app/stock', label: 'Timber stock', icon: Layers },
      { to: '/app/logs', label: 'Log yard', icon: TreePine },
      { to: '/app/sawmill', label: 'Sawmill', icon: Cog },
      { to: '/app/purchases', label: 'Purchases', icon: PackagePlus, roles: ['manager', 'accounts'] },
    ],
  },
  {
    group: 'Money',
    items: [
      { to: '/app/parties', label: 'Customers & suppliers', icon: Users, roles: ['manager', 'accounts', 'sales'] },
      { to: '/app/payments', label: 'Receipts & payments', icon: Wallet, roles: ['manager', 'accounts', 'sales'] },
      { to: '/app/expenses', label: 'Expenses', icon: Receipt, roles: ['manager', 'accounts'] },
    ],
  },
  {
    group: 'Insight',
    items: [
      { to: '/app/reports', label: 'Reports & GST', icon: ChartColumnBig, roles: ['manager', 'accounts'] },
      { to: '/app/tools', label: 'CFT calculator', icon: Calculator },
    ],
  },
  {
    group: 'Setup',
    items: [
      { to: '/app/rates', label: 'Species & rates', icon: Trees },
      { to: '/app/products', label: 'Products', icon: Boxes },
      { to: '/app/settings', label: 'Settings & team', icon: Settings, roles: [] },
    ],
  },
]

export const allowed = (item: NavItem, role?: Role | null) =>
  !!role && (role === 'owner' || item.roles === undefined || item.roles.includes(role))
