import type { LineKind } from '../lib/timber'

export interface Species {
  id: string
  name: string
  local_name: string | null
  botanical_name: string | null
  origin: string | null
  category: 'hardwood' | 'softwood' | 'imported' | 'plantation'
  density_kg_m3: number | null
  durability: string | null
  uses: string | null
  description: string | null
  color_hex: string
  grain_hex: string
  log_rate_cft: number
  sawn_rate_cft: number
  hsn_log: string
  hsn_sawn: string
  gst_rate: number
  is_public: boolean
  sort_order: number
  active: boolean
}

export interface Product {
  id: string
  kind: 'sawn' | 'panel' | 'unit' | 'service' | 'byproduct'
  name: string
  species_id: string | null
  grade: string | null
  thickness_in: number | null
  width_in: number | null
  panel_length_ft: number | null
  panel_width_ft: number | null
  thickness_mm: number | null
  sheet_sqft: number | null
  uom: string
  hsn: string | null
  gst_rate: number
  sale_rate: number
  qty_on_hand: number
  avg_cost: number
  min_stock: number
  bay: string | null
  brand: string | null
  active: boolean
}

export interface SawnStockRow {
  product_id: string
  name: string
  species_id: string
  species_name: string
  color_hex: string
  grain_hex: string
  grade: string | null
  thickness_in: number
  width_in: number
  length_ft: number
  pieces: number
  cft: number
  avg_cost: number
  sale_rate: number
  bay: string | null
  min_stock: number
  updated_at: string
}

export interface Log {
  id: string
  log_no: string
  species_id: string
  purchase_id: string | null
  grade: string | null
  length_ft: number
  girth_in: number
  bark_allowance_in: number
  cft: number
  cost_per_cft: number
  sale_rate_cft: number | null
  status: 'in_yard' | 'sawn' | 'sold' | 'written_off'
  bay: string | null
  remarks: string | null
  received_on: string
  species?: { name: string; color_hex: string; grain_hex: string; log_rate_cft: number }
}

export interface Party {
  id: string
  name: string
  is_customer: boolean
  is_supplier: boolean
  is_carpenter: boolean
  category: string | null
  phone: string | null
  alt_phone: string | null
  email: string | null
  gstin: string | null
  state_code: string
  address: string | null
  city: string | null
  pincode: string | null
  credit_limit: number
  credit_days: number
  opening_balance: number
  commission_pct: number
  notes: string | null
  active: boolean
}

export interface PartyBalance {
  party_id: string
  name: string
  phone: string | null
  city: string | null
  category: string | null
  is_customer: boolean
  is_supplier: boolean
  is_carpenter: boolean
  credit_limit: number
  credit_days: number
  commission_pct: number
  gstin: string | null
  active: boolean
  balance: number
  invoices_due: number
  overdue: number
  oldest_due: string | null
  billed_total: number
  purchase_total: number
  commission_earned: number
  last_receipt: string | null
}

export interface SalesDoc {
  id: string
  doc_type: 'quotation' | 'invoice' | 'credit_note'
  doc_no: string
  doc_date: string
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  customer_gstin: string | null
  billing_address: string | null
  shipping_address: string | null
  place_of_supply: string
  is_interstate: boolean
  referred_by: string | null
  commission_pct: number
  commission_amount: number
  subtotal: number
  discount: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
  round_off: number
  total: number
  amount_paid: number
  credited_amount: number
  cost_total: number
  restock: boolean
  status: 'open' | 'converted' | 'expired' | 'posted' | 'cancelled'
  due_date: string | null
  valid_until: string | null
  source_doc_id: string | null
  enquiry_id: string | null
  delivery_mode: 'pickup' | 'delivery'
  delivery_status: 'na' | 'pending' | 'dispatched' | 'delivered'
  delivery_address: string | null
  vehicle_no: string | null
  driver_name: string | null
  driver_phone: string | null
  dispatched_at: string | null
  delivered_at: string | null
  notes: string | null
  cancel_reason: string | null
  created_at: string
  sales_lines?: SalesLine[]
}

export interface SalesLine {
  id: string
  doc_id: string
  line_no: number
  line_kind: LineKind
  product_id: string | null
  log_id: string | null
  species_id: string | null
  source_line_id: string | null
  description: string
  hsn: string | null
  thickness_in: number | null
  width_in: number | null
  length_ft: number | null
  pieces: number | null
  qty: number
  uom: string
  rate: number
  discount_pct: number
  amount: number
  taxable: number
  gst_rate: number
  cgst: number
  sgst: number
  igst: number
  unit_cost: number
}

export interface Purchase {
  id: string
  ref_no: string
  bill_no: string | null
  bill_date: string
  supplier_id: string
  permit_no: string | null
  vehicle_no: string | null
  lot_code: string | null
  is_interstate: boolean
  subtotal: number
  freight: number
  unloading: number
  other_charges: number
  cgst: number
  sgst: number
  igst: number
  round_off: number
  total: number
  amount_paid: number
  due_date: string | null
  status: 'posted' | 'cancelled'
  notes: string | null
  cancel_reason: string | null
  created_at: string
  parties?: { name: string }
  purchase_lines?: PurchaseLine[]
}

export interface PurchaseLine {
  id: string
  line_no: number
  line_kind: string
  log_id: string | null
  product_id: string | null
  species_id: string | null
  description: string
  length_ft: number | null
  pieces: number | null
  qty: number
  uom: string
  rate: number
  amount: number
  gst_rate: number
  tax: number
  landed_unit_cost: number
}

export interface Conversion {
  id: string
  ref_no: string
  conv_date: string
  input_cft: number
  output_cft: number
  yield_pct: number
  input_cost: number
  processing_cost: number
  firewood_kg: number
  sawdust_bags: number
  byproduct_value: number
  cost_per_cft: number
  operator: string | null
  notes: string | null
  created_at: string
  conversion_inputs?: { id: string; log_id: string | null; product_id: string | null; length_ft: number | null; pieces: number | null; cft: number; cost: number; logs?: { log_no: string; length_ft: number; girth_in: number; species?: { name: string; color_hex: string } } | null; products?: { name: string } | null }[]
  conversion_outputs?: { id: string; product_id: string; length_ft: number; pieces: number; cft: number; products?: { name: string; thickness_in: number; width_in: number; species_id: string } }[]
}

export interface Payment {
  id: string
  ref_no: string
  pay_date: string
  direction: 'in' | 'out'
  party_id: string | null
  party_name: string | null
  amount: number
  mode: 'cash' | 'upi' | 'bank' | 'cheque' | 'card'
  reference: string | null
  cheque_date: string | null
  bank_name: string | null
  purpose: string
  status: 'cleared' | 'pending' | 'bounced' | 'void'
  notes: string | null
  created_at: string
  parties?: { name: string } | null
  payment_allocations?: { id: string; amount: number; sales_doc_id: string | null; purchase_id: string | null; sales_docs?: { doc_no: string } | null; purchases?: { ref_no: string } | null }[]
}

export interface Expense {
  id: string
  exp_date: string
  category: string
  amount: number
  mode: string
  paid_to: string | null
  reference: string | null
  notes: string | null
  created_at: string
}

export interface Enquiry {
  id: string
  created_at: string
  name: string
  phone: string
  email: string | null
  city: string | null
  requirement: string
  species_interest: string | null
  est_cft: number | null
  source: string
  status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost'
  notes: string | null
  quotation_id: string | null
}

export interface CompanySettings {
  id: number
  name: string
  tagline: string | null
  gstin: string | null
  pan: string | null
  address: string | null
  city: string | null
  state_name: string
  state_code: string
  pincode: string | null
  phone: string | null
  alt_phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  opening_hours: string | null
  map_query: string | null
  upi_id: string | null
  bank_name: string | null
  bank_account: string | null
  bank_ifsc: string | null
  bank_branch: string | null
  invoice_prefix: string
  invoice_terms: string | null
  quotation_validity_days: number
  default_bark_allowance_in: number
  max_sales_discount_pct: number
  public_show_prices: boolean
}

export interface Dashboard {
  role: string
  today: { sales: number; bills: number; collections: number; cft_sold: number }
  month: { sales: number; taxable: number; gross_profit: number | null; collections: number; expenses: number | null; purchases: number | null; cft_sold: number }
  receivable: number
  payable: number | null
  overdue: number
  stock: { sawn_cft: number; log_cft: number; logs: number; sawn_value: number | null; log_value: number | null; other_value: number | null }
  species: { name: string; color: string; grain: string; sawn_cft: number; log_cft: number }[]
  trend: { d: string; sales: number; collections: number }[]
  top_customers: { name: string; total: number; bills: number }[]
  low_stock: { id: string; name: string; have: number; min: number; unit: string }[]
  deliveries: { pending: number; dispatched: number }
  enquiries_new: number
  quotations_open: { count: number; value: number }
  cheques_pending: { count: number; amount: number } | null
  sawmill: { runs: number; input_cft: number; output_cft: number; yield_pct: number | null }
  recent: { id: string; doc_no: string; type: string; date: string; name: string; total: number; paid: number; status: string }[]
}
