-- Maruthi Timber Depot — core schema
-- Units used everywhere:
--   sawn timber   thickness & width in inches, length in feet, volume in CFT = T × W × L / 144 per piece
--   logs          mid-girth in inches, length in feet, volume by Hoppus (quarter-girth): ((G − bark)/4)² × L / 144
--   panels        stock counted in sheets, billed and costed per sq.ft (sheet sq.ft = length ft × width ft)
--   units, byproducts  counted in their own unit (nos, kg, load)
-- Money is numeric(14,2); dates are Indian Standard Time.

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.today_ist() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- Indian financial year label for a date: 2026-10-25 -> '26-27', 2027-02-01 -> '26-27'
create or replace function public.fy_label(d date) returns text
language sql immutable as $$
  select lpad((y % 100)::text, 2, '0') || '-' || lpad(((y + 1) % 100)::text, 2, '0')
  from (select case when extract(month from d) >= 4 then extract(year from d)::int
                    else extract(year from d)::int - 1 end as y) s
$$;

create or replace function public.sawn_cft(t numeric, w numeric, l numeric, pcs numeric) returns numeric
language sql immutable as $$ select round(t * w * l * pcs / 144.0, 3) $$;

create or replace function public.hoppus_cft(girth numeric, bark numeric, len numeric) returns numeric
language sql immutable as $$ select round(((girth - bark) / 4) * ((girth - bark) / 4) * len / 144.0, 3) $$;

-- 5 -> '5', 1.500 -> '1.5'
create or replace function public.fmt_num(n numeric) returns text
language sql immutable as $$
  select case when n is null then '' when n = trunc(n) then trunc(n)::text
              else rtrim(rtrim(n::text, '0'), '.') end
$$;

-- ───────────────────────── people & settings ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  login_email text,
  role text not null default 'sales' check (role in ('owner','manager','accounts','sales','yard')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

-- owner always passes; has_role() with no arguments means "owner only"
create or replace function public.has_role(variadic roles text[] default '{}') returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' or role = any(roles) from public.profiles where id = auth.uid() and active), false)
$$;

create table public.company_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Maruthi Timber Depot',
  tagline text default 'Seasoned timber · Sawmill · Doors & frames',
  gstin text,
  pan text,
  address text,
  city text,
  state_name text not null default 'Karnataka',
  state_code text not null default '29',
  pincode text,
  phone text,
  alt_phone text,
  whatsapp text,
  email text,
  website text,
  opening_hours text default 'Mon–Sat 8:30 AM – 7:30 PM · Sun 9 AM – 1 PM',
  map_query text,
  upi_id text,
  bank_name text,
  bank_account text,
  bank_ifsc text,
  bank_branch text,
  invoice_prefix text not null default 'MTD',
  invoice_terms text default E'1. Goods once sold will be taken back only as per our return policy within 7 days, unused and uncut.\n2. Measurements are taken in the presence of the customer.\n3. Interest @18% p.a. will be charged on bills unpaid beyond the due date.\n4. Subject to local jurisdiction.',
  quotation_validity_days int not null default 7,
  default_bark_allowance_in numeric(5,2) not null default 0,
  max_sales_discount_pct numeric(5,2) not null default 10,
  public_show_prices boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.company_settings (id) values (1) on conflict do nothing;

-- ───────────────────────── catalogue ─────────────────────────
create table public.species (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  local_name text,
  botanical_name text,
  origin text,
  category text not null default 'hardwood' check (category in ('hardwood','softwood','imported','plantation')),
  density_kg_m3 int,
  durability text,
  uses text,
  description text,
  color_hex text not null default '#B8742F',
  grain_hex text not null default '#6B3F1D',
  log_rate_cft numeric(12,2) not null default 0,
  sawn_rate_cft numeric(12,2) not null default 0,
  hsn_log text not null default '4403',
  hsn_sawn text not null default '4407',
  gst_rate numeric(5,2) not null default 18 check (gst_rate >= 0 and gst_rate <= 28),
  is_public boolean not null default true,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sawn','panel','unit','service','byproduct')),
  name text not null,
  species_id uuid references public.species(id),
  grade text,
  thickness_in numeric(6,3),
  width_in numeric(6,3),
  panel_length_ft numeric(6,2),
  panel_width_ft numeric(6,2),
  thickness_mm numeric(6,2),
  sheet_sqft numeric(8,3) generated always as (panel_length_ft * panel_width_ft) stored,
  uom text not null check (uom in ('cft','sqft','nos','rft','kg','load','job')),
  hsn text,
  gst_rate numeric(5,2) not null default 18 check (gst_rate >= 0 and gst_rate <= 28),
  sale_rate numeric(12,2) not null default 0 check (sale_rate >= 0),
  qty_on_hand numeric(14,3) not null default 0,   -- panels: sheets · units/byproducts: their uom · sawn: unused (see sawn_stock)
  avg_cost numeric(14,4) not null default 0,      -- per uom (per CFT for sawn, per sq.ft for panels)
  min_stock numeric(14,3) not null default 0,     -- sawn: CFT · panels: sheets · others: uom
  bay text,
  brand text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint products_sawn_shape check (kind <> 'sawn' or (species_id is not null and thickness_in > 0 and width_in > 0 and uom = 'cft')),
  constraint products_panel_shape check (kind <> 'panel' or (panel_length_ft > 0 and panel_width_ft > 0 and uom = 'sqft'))
);
create unique index products_sawn_section on public.products (species_id, coalesce(grade, ''), thickness_in, width_in) where kind = 'sawn';
create index products_kind on public.products (kind, active);

create table public.sawn_stock (
  product_id uuid not null references public.products(id) on delete cascade,
  length_ft numeric(5,2) not null check (length_ft > 0),
  pieces int not null default 0 check (pieces >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, length_ft)
);

-- ───────────────────────── parties ─────────────────────────
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_customer boolean not null default true,
  is_supplier boolean not null default false,
  is_carpenter boolean not null default false,
  category text,
  phone text,
  alt_phone text,
  email text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  state_code text not null default '29',
  address text,
  city text,
  pincode text,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  credit_days int not null default 0 check (credit_days >= 0),
  opening_balance numeric(14,2) not null default 0,   -- + they owe us, − we owe them
  commission_pct numeric(5,2) not null default 0 check (commission_pct >= 0 and commission_pct <= 20),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index parties_name on public.parties (lower(name));
create index parties_phone on public.parties (phone);

-- ───────────────────────── purchases & logs ─────────────────────────
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  bill_no text,
  bill_date date not null default public.today_ist(),
  supplier_id uuid not null references public.parties(id),
  permit_no text,
  vehicle_no text,
  lot_code text,
  is_interstate boolean not null default false,
  subtotal numeric(14,2) not null default 0,
  freight numeric(14,2) not null default 0,
  unloading numeric(14,2) not null default 0,
  other_charges numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  round_off numeric(8,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  due_date date,
  status text not null default 'posted' check (status in ('posted','cancelled')),
  notes text,
  cancel_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index purchases_date on public.purchases (bill_date desc);
create index purchases_supplier on public.purchases (supplier_id);

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  log_no text not null unique,
  species_id uuid not null references public.species(id),
  purchase_id uuid references public.purchases(id) on delete set null,
  grade text,
  length_ft numeric(6,2) not null check (length_ft > 0),
  girth_in numeric(6,2) not null check (girth_in > 0),
  bark_allowance_in numeric(5,2) not null default 0 check (bark_allowance_in >= 0),
  cft numeric(12,3) generated always as (round(((girth_in - bark_allowance_in) / 4) * ((girth_in - bark_allowance_in) / 4) * length_ft / 144, 3)) stored,
  cost_per_cft numeric(12,2) not null default 0,
  sale_rate_cft numeric(12,2),
  status text not null default 'in_yard' check (status in ('in_yard','sawn','sold','written_off')),
  bay text,
  remarks text,
  received_on date not null default public.today_ist(),
  created_at timestamptz not null default now(),
  constraint logs_girth_after_bark check (girth_in > bark_allowance_in)
);
create index logs_status on public.logs (status, species_id);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  line_no int not null,
  line_kind text not null check (line_kind in ('log','sawn','panel','unit','byproduct')),
  log_id uuid references public.logs(id) on delete set null,
  product_id uuid references public.products(id),
  species_id uuid references public.species(id),
  description text not null,
  length_ft numeric(6,2),
  pieces int,
  qty numeric(14,3) not null,
  uom text not null,
  rate numeric(12,2) not null,
  amount numeric(14,2) not null,
  gst_rate numeric(5,2) not null default 18,
  tax numeric(14,2) not null default 0,
  landed_unit_cost numeric(14,4) not null default 0
);
create index purchase_lines_doc on public.purchase_lines (purchase_id);

-- ───────────────────────── sawmill ─────────────────────────
create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  conv_date date not null default public.today_ist(),
  input_cft numeric(12,3) not null,
  output_cft numeric(12,3) not null,
  yield_pct numeric(6,2) not null,
  input_cost numeric(14,2) not null,
  processing_cost numeric(14,2) not null default 0,
  firewood_kg numeric(10,2) not null default 0,
  sawdust_bags numeric(10,2) not null default 0,
  byproduct_value numeric(14,2) not null default 0,
  cost_per_cft numeric(12,2) not null,
  operator text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index conversions_date on public.conversions (conv_date desc);

create table public.conversion_inputs (
  id uuid primary key default gen_random_uuid(),
  conversion_id uuid not null references public.conversions(id) on delete cascade,
  log_id uuid references public.logs(id),
  product_id uuid references public.products(id),
  length_ft numeric(6,2),
  pieces int,
  cft numeric(12,3) not null,
  cost numeric(14,2) not null,
  check (num_nonnulls(log_id, product_id) = 1)
);
create index conversion_inputs_doc on public.conversion_inputs (conversion_id);

create table public.conversion_outputs (
  id uuid primary key default gen_random_uuid(),
  conversion_id uuid not null references public.conversions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  length_ft numeric(6,2) not null,
  pieces int not null check (pieces > 0),
  cft numeric(12,3) not null
);
create index conversion_outputs_doc on public.conversion_outputs (conversion_id);

-- ───────────────────────── sales ─────────────────────────
create table public.sales_docs (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('quotation','invoice','credit_note')),
  doc_no text not null unique,
  doc_date date not null default public.today_ist(),
  customer_id uuid references public.parties(id),
  customer_name text not null,
  customer_phone text,
  customer_gstin text,
  billing_address text,
  shipping_address text,
  place_of_supply text not null default '29',
  is_interstate boolean not null default false,
  referred_by uuid references public.parties(id),
  commission_pct numeric(5,2) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  taxable numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  round_off numeric(8,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,     -- receipts allocated (invoice) / refunded (credit note)
  credited_amount numeric(14,2) not null default 0, -- invoice: settled by credit notes · credit note: applied to its invoice
  cost_total numeric(14,2) not null default 0,
  restock boolean not null default true,            -- credit note: returned goods went back into stock
  status text not null check (status in ('open','converted','expired','posted','cancelled')),
  due_date date,
  valid_until date,
  source_doc_id uuid references public.sales_docs(id),
  enquiry_id uuid,
  delivery_mode text not null default 'pickup' check (delivery_mode in ('pickup','delivery')),
  delivery_status text not null default 'na' check (delivery_status in ('na','pending','dispatched','delivered')),
  delivery_address text,
  vehicle_no text,
  driver_name text,
  driver_phone text,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  notes text,
  cancel_reason text,
  cancelled_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index sales_docs_type_date on public.sales_docs (doc_type, doc_date desc);
create index sales_docs_customer on public.sales_docs (customer_id);
create index sales_docs_source on public.sales_docs (source_doc_id);
create index sales_docs_delivery on public.sales_docs (delivery_status) where delivery_status in ('pending','dispatched');

create table public.sales_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.sales_docs(id) on delete cascade,
  line_no int not null,
  line_kind text not null check (line_kind in ('sawn','log','panel','unit','service','byproduct')),
  product_id uuid references public.products(id),
  log_id uuid references public.logs(id),
  species_id uuid references public.species(id),
  source_line_id uuid references public.sales_lines(id),
  description text not null,
  hsn text,
  thickness_in numeric(6,3),
  width_in numeric(6,3),
  length_ft numeric(6,2),
  pieces numeric(12,3),
  qty numeric(14,3) not null check (qty > 0),
  uom text not null,
  rate numeric(12,2) not null check (rate >= 0),
  discount_pct numeric(5,2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  amount numeric(14,2) not null,
  taxable numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 18,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  unit_cost numeric(14,4) not null default 0
);
create index sales_lines_doc on public.sales_lines (doc_id);
create index sales_lines_source on public.sales_lines (source_line_id);

-- ───────────────────────── money ─────────────────────────
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  pay_date date not null default public.today_ist(),
  direction text not null check (direction in ('in','out')),
  party_id uuid references public.parties(id),
  party_name text,
  amount numeric(14,2) not null check (amount > 0),
  mode text not null check (mode in ('cash','upi','bank','cheque','card')),
  reference text,
  cheque_date date,
  bank_name text,
  purpose text not null default 'sale' check (purpose in ('sale','purchase','commission','advance','refund','other')),
  status text not null default 'cleared' check (status in ('cleared','pending','bounced','void')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index payments_party on public.payments (party_id);
create index payments_date on public.payments (pay_date desc);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  sales_doc_id uuid references public.sales_docs(id),
  purchase_id uuid references public.purchases(id),
  amount numeric(14,2) not null check (amount > 0),
  check (num_nonnulls(sales_doc_id, purchase_id) = 1)
);
create index payment_allocations_payment on public.payment_allocations (payment_id);
create index payment_allocations_sale on public.payment_allocations (sales_doc_id);
create index payment_allocations_purchase on public.payment_allocations (purchase_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  exp_date date not null default public.today_ist(),
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  mode text not null default 'cash' check (mode in ('cash','upi','bank','cheque','card')),
  paid_to text,
  reference text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index expenses_date on public.expenses (exp_date desc);

-- ───────────────────────── website enquiries ─────────────────────────
create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text,
  city text,
  requirement text not null,
  species_interest text,
  est_cft numeric(10,2),
  source text not null default 'website',
  status text not null default 'new' check (status in ('new','contacted','quoted','won','lost')),
  notes text,
  quotation_id uuid references public.sales_docs(id),
  handled_by uuid references public.profiles(id)
);
create index enquiries_status on public.enquiries (status, created_at desc);

-- ───────────────────────── ledgers ─────────────────────────
create table public.stock_moves (
  id bigint generated always as identity primary key,
  moved_at timestamptz not null default now(),
  move_date date not null default public.today_ist(),
  product_id uuid references public.products(id),
  log_id uuid references public.logs(id),
  length_ft numeric(6,2),
  pieces numeric(12,3),
  qty numeric(14,3),           -- signed, in the item's cost unit (CFT / sq.ft / uom)
  unit_cost numeric(14,4),
  ref_type text not null check (ref_type in ('purchase','purchase_cancel','conversion_in','conversion_out','sale','sale_cancel','credit_note','adjustment')),
  ref_id uuid,
  ref_no text,
  note text,
  created_by uuid default auth.uid()
);
create index stock_moves_product on public.stock_moves (product_id, moved_at desc);
create index stock_moves_log on public.stock_moves (log_id);

create table public.doc_counters (
  series text not null,
  fy text not null,
  last_no int not null default 0,
  primary key (series, fy)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  action text not null,
  entity text not null,
  entity_id uuid,
  summary text
);
create index audit_log_at on public.audit_log (at desc);

-- ───────────────────────── row level security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.company_settings enable row level security;
alter table public.species enable row level security;
alter table public.products enable row level security;
alter table public.sawn_stock enable row level security;
alter table public.parties enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.logs enable row level security;
alter table public.conversions enable row level security;
alter table public.conversion_inputs enable row level security;
alter table public.conversion_outputs enable row level security;
alter table public.sales_docs enable row level security;
alter table public.sales_lines enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.expenses enable row level security;
alter table public.enquiries enable row level security;
alter table public.stock_moves enable row level security;
alter table public.doc_counters enable row level security;
alter table public.audit_log enable row level security;

-- every active staff member can read the working tables
create policy staff_read on public.profiles for select to authenticated using (public.is_staff());
create policy staff_read on public.company_settings for select to authenticated using (public.is_staff());
create policy staff_read on public.species for select to authenticated using (public.is_staff());
create policy staff_read on public.products for select to authenticated using (public.is_staff());
create policy staff_read on public.sawn_stock for select to authenticated using (public.is_staff());
create policy staff_read on public.parties for select to authenticated using (public.is_staff());
create policy staff_read on public.logs for select to authenticated using (public.is_staff());
create policy staff_read on public.conversions for select to authenticated using (public.is_staff());
create policy staff_read on public.conversion_inputs for select to authenticated using (public.is_staff());
create policy staff_read on public.conversion_outputs for select to authenticated using (public.is_staff());
create policy staff_read on public.sales_docs for select to authenticated using (public.is_staff());
create policy staff_read on public.sales_lines for select to authenticated using (public.is_staff());
create policy staff_read on public.enquiries for select to authenticated using (public.is_staff());
create policy staff_read on public.stock_moves for select to authenticated using (public.is_staff());

-- money and purchase costs: owner, manager, accounts only
create policy money_read on public.purchases for select to authenticated using (public.has_role('manager','accounts'));
create policy money_read on public.purchase_lines for select to authenticated using (public.has_role('manager','accounts'));
create policy money_read on public.payments for select to authenticated using (public.has_role('manager','accounts') or (public.has_role('sales') and direction = 'in'));
create policy money_read on public.payment_allocations for select to authenticated using (public.is_staff());
create policy money_read on public.expenses for select to authenticated using (public.has_role('manager','accounts'));
create policy owner_read on public.audit_log for select to authenticated using (public.has_role('manager'));

-- direct edits on master data (transactions only go through the functions in 0002)
create policy owner_write on public.company_settings for update to authenticated using (public.has_role()) with check (public.has_role());
create policy owner_write on public.profiles for update to authenticated using (public.has_role()) with check (public.has_role());
create policy masters_write on public.species for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy masters_write on public.products for all to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
create policy parties_write on public.parties for insert to authenticated with check (public.has_role('manager','accounts','sales'));
create policy parties_update on public.parties for update to authenticated using (public.has_role('manager','accounts','sales')) with check (public.has_role('manager','accounts','sales'));
create policy expenses_write on public.expenses for insert to authenticated with check (public.has_role('manager','accounts'));
create policy expenses_update on public.expenses for update to authenticated using (public.has_role('manager','accounts')) with check (public.has_role('manager','accounts'));
create policy expenses_delete on public.expenses for delete to authenticated using (public.has_role('manager'));
create policy enquiries_update on public.enquiries for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- measurements drive stock value, so only managers edit logs directly; yard staff move logs with set_log_bay()
create policy logs_update on public.logs for update to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));
