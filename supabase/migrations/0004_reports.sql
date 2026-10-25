-- Maruthi Timber Depot — views, reports, dashboard and API grants

-- ───────────────────────── views ─────────────────────────
create or replace view public.v_sawn_stock with (security_invoker = true) as
select s.product_id, p.name, p.species_id, sp.name as species_name, sp.color_hex, sp.grain_hex, p.grade,
       p.thickness_in, p.width_in, s.length_ft, s.pieces,
       public.sawn_cft(p.thickness_in, p.width_in, s.length_ft, s.pieces) as cft,
       p.avg_cost, p.sale_rate, p.bay, p.min_stock, s.updated_at
  from public.sawn_stock s
  join public.products p on p.id = s.product_id
  join public.species sp on sp.id = p.species_id
 where s.pieces > 0;

create or replace view public.v_species_stock with (security_invoker = true) as
with sw as (
  select p.species_id, sum(public.sawn_cft(p.thickness_in, p.width_in, s.length_ft, s.pieces)) as cft,
         sum(public.sawn_cft(p.thickness_in, p.width_in, s.length_ft, s.pieces) * p.avg_cost) as value,
         sum(s.pieces) as pieces
    from public.sawn_stock s join public.products p on p.id = s.product_id
   where s.pieces > 0 group by p.species_id
), lg as (
  select species_id, sum(cft) as cft, sum(cft * cost_per_cft) as value, count(*) as n
    from public.logs where status = 'in_yard' group by species_id
)
select sp.id, sp.name, sp.local_name, sp.color_hex, sp.grain_hex, sp.category, sp.sawn_rate_cft, sp.log_rate_cft, sp.sort_order,
       round(coalesce(sw.cft, 0), 3) as sawn_cft, round(coalesce(sw.value, 0), 2) as sawn_value, coalesce(sw.pieces, 0) as sawn_pieces,
       round(coalesce(lg.cft, 0), 3) as log_cft, round(coalesce(lg.value, 0), 2) as log_value, coalesce(lg.n, 0) as log_count
  from public.species sp
  left join sw on sw.species_id = sp.id
  left join lg on lg.species_id = sp.id
 where sp.active;

-- Balances need payments and purchases that some roles cannot read row by row, so this view runs
-- with its owner's rights and is limited to signed-in staff by the where clause.
create or replace view public.v_party_balances as
with s as (
  select customer_id as pid, sum(case doc_type when 'invoice' then total when 'credit_note' then -total else 0 end) as amt,
         sum(case when doc_type = 'invoice' then total else 0 end) as billed
    from public.sales_docs where status = 'posted' and customer_id is not null group by customer_id
), c as (
  select referred_by as pid, sum(case doc_type when 'invoice' then commission_amount else -commission_amount end) as amt
    from public.sales_docs where status = 'posted' and referred_by is not null and doc_type in ('invoice','credit_note') group by referred_by
), pu as (
  select supplier_id as pid, sum(total) as amt from public.purchases where status = 'posted' group by supplier_id
), pa as (
  select party_id as pid, sum(case direction when 'out' then amount else -amount end) as amt,
         max(pay_date) filter (where direction = 'in') as last_receipt
    from public.payments where status in ('cleared','pending') and party_id is not null group by party_id
), od as (
  select customer_id as pid, sum(total - amount_paid - credited_amount) as due,
         sum(total - amount_paid - credited_amount) filter (where due_date < public.today_ist()) as overdue,
         min(due_date) as oldest_due
    from public.sales_docs
   where doc_type = 'invoice' and status = 'posted' and total - amount_paid - credited_amount > 0 group by customer_id
)
select p.id as party_id, p.name, p.phone, p.city, p.category, p.is_customer, p.is_supplier, p.is_carpenter,
       p.credit_limit, p.credit_days, p.commission_pct, p.gstin, p.active,
       round(p.opening_balance + coalesce(s.amt, 0) - coalesce(c.amt, 0) - coalesce(pu.amt, 0) + coalesce(pa.amt, 0), 2) as balance,
       round(coalesce(od.due, 0), 2) as invoices_due,
       round(coalesce(od.overdue, 0), 2) as overdue,
       od.oldest_due,
       round(coalesce(s.billed, 0), 2) as billed_total,
       round(coalesce(pu.amt, 0), 2) as purchase_total,
       round(coalesce(c.amt, 0), 2) as commission_earned,
       pa.last_receipt
  from public.parties p
  left join s on s.pid = p.id
  left join c on c.pid = p.id
  left join pu on pu.pid = p.id
  left join pa on pa.pid = p.id
  left join od on od.pid = p.id
 where public.is_staff();

-- ───────────────────────── party statement ─────────────────────────
create or replace function public.party_ledger(p_party uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := require_role('manager','accounts','sales'); v_party parties%rowtype; v jsonb;
begin
  select * into v_party from parties where id = p_party;
  if not found then raise exception 'Party not found'; end if;
  with e (d, ts, ref, kind, narration, amount, doc_id) as (
  select doc_date, created_at, doc_no, doc_type,
         case doc_type when 'invoice' then 'Sale bill' else 'Return / credit note' end || coalesce(' · ' || nullif(notes, ''), ''),
         case doc_type when 'invoice' then total else -total end, id
    from sales_docs where customer_id = p_party and status = 'posted' and doc_type in ('invoice','credit_note')
  union all
  select doc_date, created_at, doc_no, 'commission', 'Commission on ' || doc_no || ' (' || customer_name || ')',
         case doc_type when 'invoice' then -commission_amount else commission_amount end, id
    from sales_docs where referred_by = p_party and status = 'posted' and commission_amount > 0 and doc_type in ('invoice','credit_note')
  union all
  select bill_date, created_at, ref_no, 'purchase', 'Purchase bill' || coalesce(' ' || bill_no, '') || coalesce(' · permit ' || permit_no, ''), -total, id
    from purchases where supplier_id = p_party and status = 'posted'
  union all
  select pay_date, created_at, ref_no, 'payment_' || direction,
         case direction when 'in' then 'Received' else 'Paid' end || ' · ' || upper(mode) || coalesce(' ' || reference, '') ||
         case when status = 'pending' then ' (cheque pending)' else '' end,
         case direction when 'out' then amount else -amount end, id
    from payments where party_id = p_party and status in ('cleared','pending')
  ), op as (
    select v_party.opening_balance + coalesce(sum(amount) filter (where d < p_from), 0) as bal from e
  ), r as (
    select e.*, (select bal from op) + sum(amount) over (order by d, ts, ref rows unbounded preceding) as bal
      from e where d between p_from and p_to
  )
  select jsonb_build_object(
    'party', to_jsonb(v_party),
    'opening', (select bal from op),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'ref', ref, 'kind', kind, 'narration', narration,
                                 'debit', case when amount > 0 then amount else 0 end,
                                 'credit', case when amount < 0 then -amount else 0 end,
                                 'balance', bal, 'doc_id', doc_id) order by d, ts, ref) from r), '[]'::jsonb),
    'closing', (select bal from op) + coalesce((select sum(amount) from r), 0)
  ) into v;
  return v;
end $$;

-- ───────────────────────── GST ─────────────────────────
-- GSTR-1 style: B2B invoices, B2C by rate, credit notes, and the HSN summary with GST unit codes
-- (CFT is reported in cubic metres — UQC CBM — since CFT is not a GST unit).
create or replace function public.report_gst(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := require_role('manager','accounts'); v jsonb;
begin
  with d as (
    select * from sales_docs where doc_type in ('invoice','credit_note') and status = 'posted' and doc_date between p_from and p_to
  ), l as (
    select l.*, d.doc_type, d.customer_gstin, d.is_interstate, case d.doc_type when 'credit_note' then -1 else 1 end as sgn
      from sales_lines l join d on d.id = l.doc_id
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
        'invoices', count(*) filter (where doc_type = 'invoice'),
        'credit_notes', count(*) filter (where doc_type = 'credit_note'),
        'first_no', min(doc_no) filter (where doc_type = 'invoice'), 'last_no', max(doc_no) filter (where doc_type = 'invoice'),
        'taxable', coalesce(sum(case doc_type when 'invoice' then taxable else -taxable end), 0),
        'cgst', coalesce(sum(case doc_type when 'invoice' then cgst else -cgst end), 0),
        'sgst', coalesce(sum(case doc_type when 'invoice' then sgst else -sgst end), 0),
        'igst', coalesce(sum(case doc_type when 'invoice' then igst else -igst end), 0),
        'total', coalesce(sum(case doc_type when 'invoice' then total else -total end), 0)) from d),
    'b2b', coalesce((select jsonb_agg(jsonb_build_object('doc_no', doc_no, 'date', doc_date, 'type', doc_type, 'gstin', customer_gstin,
                     'name', customer_name, 'pos', place_of_supply, 'taxable', taxable, 'cgst', cgst, 'sgst', sgst, 'igst', igst, 'total', total)
                     order by doc_date, doc_no) from d where customer_gstin is not null), '[]'::jsonb),
    'b2c', coalesce((select jsonb_agg(x order by x->>'rate') from (
                     select jsonb_build_object('rate', gst_rate, 'interstate', is_interstate,
                            'taxable', sum(sgn * taxable), 'cgst', sum(sgn * cgst), 'sgst', sum(sgn * sgst), 'igst', sum(sgn * igst)) as x
                       from l where customer_gstin is null group by gst_rate, is_interstate) q), '[]'::jsonb),
    'hsn', coalesce((select jsonb_agg(x order by x->>'hsn') from (
                     select jsonb_build_object('hsn', coalesce(hsn, '-'), 'rate', gst_rate,
                            'uqc', case uom when 'cft' then 'CBM' when 'sqft' then 'SQF' when 'nos' then 'NOS' when 'kg' then 'KGS' else 'NA' end,
                            'qty', round(sum(sgn * case uom when 'cft' then qty / 35.3147 else qty end), 3),
                            'taxable', sum(sgn * taxable), 'cgst', sum(sgn * cgst), 'sgst', sum(sgn * sgst), 'igst', sum(sgn * igst),
                            'value', sum(sgn * (taxable + cgst + sgst + igst))) as x
                       from l group by hsn, gst_rate, uom) q), '[]'::jsonb),
    'purchases', (select jsonb_build_object('bills', count(*), 'taxable', coalesce(sum(subtotal), 0), 'cgst', coalesce(sum(cgst), 0),
                         'sgst', coalesce(sum(sgst), 0), 'igst', coalesce(sum(igst), 0))
                    from purchases where status = 'posted' and bill_date between p_from and p_to)
  ) into v;
  return v;
end $$;

-- ───────────────────────── receivables ageing ─────────────────────────
create or replace function public.report_ageing(p_as_of date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := require_role('manager','accounts','sales'); v_d date := coalesce(p_as_of, today_ist()); v jsonb;
begin
  with o as (
    select d.customer_id, d.customer_name, d.doc_no, d.doc_date, d.due_date, d.total - d.amount_paid - d.credited_amount as due,
           greatest(v_d - coalesce(d.due_date, d.doc_date), 0) as days_over
      from sales_docs d
     where d.doc_type = 'invoice' and d.status = 'posted' and d.total - d.amount_paid - d.credited_amount > 0 and d.doc_date <= v_d
  )
  select jsonb_build_object(
    'as_of', v_d,
    'totals', (select jsonb_build_object('due', coalesce(sum(due), 0),
        'current', coalesce(sum(due) filter (where days_over = 0), 0),
        'd1_30', coalesce(sum(due) filter (where days_over between 1 and 30), 0),
        'd31_60', coalesce(sum(due) filter (where days_over between 31 and 60), 0),
        'd61_90', coalesce(sum(due) filter (where days_over between 61 and 90), 0),
        'd90p', coalesce(sum(due) filter (where days_over > 90), 0)) from o),
    'parties', coalesce((select jsonb_agg(x order by (x->>'due')::numeric desc) from (
        select jsonb_build_object('party_id', customer_id, 'name', max(customer_name), 'phone', max(pt.phone), 'bills', count(*),
               'due', sum(due),
               'current', coalesce(sum(due) filter (where days_over = 0), 0),
               'd1_30', coalesce(sum(due) filter (where days_over between 1 and 30), 0),
               'd31_60', coalesce(sum(due) filter (where days_over between 31 and 60), 0),
               'd61_90', coalesce(sum(due) filter (where days_over between 61 and 90), 0),
               'd90p', coalesce(sum(due) filter (where days_over > 90), 0),
               'oldest_days', max(days_over)) as x
          from o left join parties pt on pt.id = o.customer_id group by customer_id) q), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ───────────────────────── profit ─────────────────────────
create or replace function public.report_profit(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := require_role('manager','accounts'); v jsonb;
begin
  with l as (
    select l.*, d.doc_date, case d.doc_type when 'credit_note' then -1 else 1 end as sgn
      from sales_lines l join sales_docs d on d.id = l.doc_id
     where d.doc_type in ('invoice','credit_note') and d.status = 'posted' and d.doc_date between p_from and p_to
  ), e as (
    select category, sum(amount) as amt from expenses where exp_date between p_from and p_to group by category
  ), cm as (
    select coalesce(sum(case doc_type when 'invoice' then commission_amount else -commission_amount end), 0) as amt
      from sales_docs where status = 'posted' and doc_type in ('invoice','credit_note') and doc_date between p_from and p_to
  ), sm as (
    select coalesce(sum(processing_cost), 0) as amt from conversions where conv_date between p_from and p_to
  )
  select jsonb_build_object(
    'revenue', coalesce((select sum(sgn * taxable) from l), 0),
    'cogs', coalesce((select sum(sgn * round(qty * unit_cost, 2)) from l), 0),
    'commission', (select amt from cm),
    'expenses', coalesce((select sum(amt) from e), 0),
    'sawmill_processing_in_cost', (select amt from sm),
    'expense_breakup', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'amount', amt) order by amt desc) from e), '[]'::jsonb),
    'by_species', coalesce((select jsonb_agg(x order by (x->>'revenue')::numeric desc) from (
        select jsonb_build_object('species', coalesce(sp.name, 'Other items'), 'color', coalesce(sp.color_hex, '#9CA3AF'),
               'cft', round(sum(sgn * case when l.uom = 'cft' then l.qty else 0 end), 2),
               'revenue', sum(sgn * l.taxable), 'cogs', sum(sgn * round(l.qty * l.unit_cost, 2))) as x
          from l left join species sp on sp.id = l.species_id group by sp.name, sp.color_hex) q), '[]'::jsonb),
    'by_kind', coalesce((select jsonb_agg(jsonb_build_object('kind', line_kind, 'revenue', rev, 'cogs', cogs)) from (
        select line_kind, sum(sgn * taxable) as rev, sum(sgn * round(qty * unit_cost, 2)) as cogs from l group by line_kind) q), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(x order by x->>'month') from (
        select jsonb_build_object('month', to_char(date_trunc('month', doc_date), 'YYYY-MM'),
               'revenue', sum(sgn * taxable), 'cogs', sum(sgn * round(qty * unit_cost, 2))) as x
          from l group by date_trunc('month', doc_date)) q), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ───────────────────────── day book ─────────────────────────
create or replace function public.report_daybook(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := require_role('manager','accounts'); v jsonb;
begin
  with t as (
    select py.pay_date as d, py.created_at as ts, py.ref_no as ref, coalesce(pt.name, py.party_name) as party, py.mode,
           case py.direction when 'in' then 'Receipt' else 'Payment' end || ' · ' || py.purpose as narration,
           case py.direction when 'in' then py.amount else 0 end as money_in,
           case py.direction when 'out' then py.amount else 0 end as money_out, py.status
      from payments py left join parties pt on pt.id = py.party_id
     where py.pay_date between p_from and p_to and py.status in ('cleared','pending')
    union all
    select exp_date, created_at, 'EXP', coalesce(paid_to, category), mode, 'Expense · ' || category || coalesce(' · ' || notes, ''), 0, amount, 'cleared'
      from expenses where exp_date between p_from and p_to
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(t) order by d, ts) from t), '[]'::jsonb),
    'by_mode', coalesce((select jsonb_agg(jsonb_build_object('mode', mode, 'in', i, 'out', o)) from (
        select mode, sum(money_in) as i, sum(money_out) as o from t group by mode) q), '[]'::jsonb),
    'total_in', coalesce((select sum(money_in) from t), 0),
    'total_out', coalesce((select sum(money_out) from t), 0)
  ) into v;
  return v;
end $$;

-- ───────────────────────── carpenter commission ─────────────────────────
create or replace function public.report_commissions(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := require_role('manager','accounts'); v jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'earned')::numeric desc), '[]'::jsonb) into v from (
    select jsonb_build_object('party_id', p.id, 'name', p.name, 'phone', p.phone, 'pct', p.commission_pct,
           'bills', (select count(*) from sales_docs d where d.referred_by = p.id and d.doc_type = 'invoice' and d.status = 'posted' and d.doc_date between p_from and p_to),
           'business', coalesce((select sum(case doc_type when 'invoice' then taxable else -taxable end) from sales_docs d
                                  where d.referred_by = p.id and d.status = 'posted' and d.doc_type in ('invoice','credit_note') and d.doc_date between p_from and p_to), 0),
           'earned', coalesce((select sum(case doc_type when 'invoice' then commission_amount else -commission_amount end) from sales_docs d
                                where d.referred_by = p.id and d.status = 'posted' and d.doc_type in ('invoice','credit_note') and d.doc_date between p_from and p_to), 0),
           'paid', coalesce((select sum(amount) from payments py where py.party_id = p.id and py.direction = 'out' and py.purpose = 'commission'
                              and py.status in ('cleared','pending') and py.pay_date between p_from and p_to), 0),
           'balance_due', -coalesce((select balance from v_party_balances b where b.party_id = p.id), 0)) as x
      from parties p where p.is_carpenter
  ) q;
  return v;
end $$;

-- ───────────────────────── dashboard ─────────────────────────
create or replace function public.dashboard_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := require_role('manager','accounts','sales','yard');
  v_today date := today_ist();
  v_m0 date := date_trunc('month', today_ist())::date;
  v_money boolean;
  v jsonb;
begin
  v_money := v_role in ('owner','manager','accounts');
  with sd as (
    select * from sales_docs where doc_type in ('invoice','credit_note') and status = 'posted' and doc_date >= v_today - 60
  ), days as (
    select v_today - g as d from generate_series(0, 29) g
  )
  select jsonb_build_object(
    'role', v_role,
    'today', jsonb_build_object(
      'sales', coalesce((select sum(case doc_type when 'invoice' then total else -total end) from sd where doc_date = v_today), 0),
      'bills', (select count(*) from sd where doc_date = v_today and doc_type = 'invoice'),
      'collections', coalesce((select sum(amount) from payments where direction = 'in' and status in ('cleared','pending') and pay_date = v_today), 0),
      'cft_sold', coalesce((select sum(case d.doc_type when 'invoice' then l.qty else -l.qty end) from sales_lines l join sd d on d.id = l.doc_id
                             where d.doc_date = v_today and l.uom = 'cft'), 0)),
    'month', jsonb_build_object(
      'sales', coalesce((select sum(case doc_type when 'invoice' then total else -total end) from sales_docs
                          where doc_type in ('invoice','credit_note') and status = 'posted' and doc_date >= v_m0), 0),
      'taxable', coalesce((select sum(case doc_type when 'invoice' then taxable else -taxable end) from sales_docs
                            where doc_type in ('invoice','credit_note') and status = 'posted' and doc_date >= v_m0), 0),
      'gross_profit', case when v_money then coalesce((select sum(case doc_type when 'invoice' then taxable - cost_total else -(taxable - cost_total) end)
                            from sales_docs where doc_type in ('invoice','credit_note') and status = 'posted' and doc_date >= v_m0), 0) end,
      'collections', coalesce((select sum(amount) from payments where direction = 'in' and status in ('cleared','pending') and pay_date >= v_m0), 0),
      'expenses', case when v_money then coalesce((select sum(amount) from expenses where exp_date >= v_m0), 0) end,
      'purchases', case when v_money then coalesce((select sum(total) from purchases where status = 'posted' and bill_date >= v_m0), 0) end,
      'cft_sold', coalesce((select sum(case d.doc_type when 'invoice' then l.qty else -l.qty end) from sales_lines l join sales_docs d on d.id = l.doc_id
                             where d.status = 'posted' and d.doc_type in ('invoice','credit_note') and d.doc_date >= v_m0 and l.uom = 'cft'), 0)),
    'receivable', coalesce((select sum(balance) from v_party_balances where balance > 0), 0),
    'payable', case when v_money then coalesce((select -sum(balance) from v_party_balances where balance < 0), 0) end,
    'overdue', coalesce((select sum(overdue) from v_party_balances), 0),
    'stock', (select jsonb_build_object(
        'sawn_cft', coalesce(sum(sawn_cft), 0), 'log_cft', coalesce(sum(log_cft), 0), 'logs', coalesce(sum(log_count), 0),
        'sawn_value', case when v_money then coalesce(sum(sawn_value), 0) end,
        'log_value', case when v_money then coalesce(sum(log_value), 0) end,
        'other_value', case when v_money then (select round(coalesce(sum(case kind when 'panel' then qty_on_hand * sheet_sqft else qty_on_hand end * avg_cost), 0), 2)
                                                 from products where kind in ('panel','unit','byproduct') and qty_on_hand > 0) end)
        from v_species_stock),
    'species', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'color', color_hex, 'grain', grain_hex,
                        'sawn_cft', sawn_cft, 'log_cft', log_cft) order by sawn_cft + log_cft desc)
                        from v_species_stock where sawn_cft + log_cft > 0), '[]'::jsonb),
    'trend', (select jsonb_agg(jsonb_build_object('d', days.d,
               'sales', coalesce((select sum(case doc_type when 'invoice' then total else -total end) from sd where sd.doc_date = days.d), 0),
               'collections', coalesce((select sum(amount) from payments where direction = 'in' and status in ('cleared','pending') and pay_date = days.d), 0))
               order by days.d) from days),
    'top_customers', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('name', customer_name, 'total', sum(total), 'bills', count(*)) as x
          from sales_docs where doc_type = 'invoice' and status = 'posted' and doc_date >= v_m0
         group by coalesce(customer_id::text, customer_name), customer_name order by sum(total) desc limit 5) q), '[]'::jsonb),
    'low_stock', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', p.id, 'name', p.name, 'have', round(coalesce(sum(sawn_cft(p.thickness_in, p.width_in, s.length_ft, s.pieces)), 0), 2),
                                  'min', p.min_stock, 'unit', 'CFT') as x
          from products p left join sawn_stock s on s.product_id = p.id
         where p.kind = 'sawn' and p.active and p.min_stock > 0
         group by p.id having coalesce(sum(sawn_cft(p.thickness_in, p.width_in, s.length_ft, s.pieces)), 0) < p.min_stock
        union all
        select jsonb_build_object('id', id, 'name', name, 'have', qty_on_hand, 'min', min_stock,
                                  'unit', case kind when 'panel' then 'sheets' else uom end)
          from products where kind in ('panel','unit','byproduct') and active and min_stock > 0 and qty_on_hand < min_stock
        limit 12) q), '[]'::jsonb),
    'deliveries', jsonb_build_object(
        'pending', (select count(*) from sales_docs where doc_type = 'invoice' and status = 'posted' and delivery_status = 'pending'),
        'dispatched', (select count(*) from sales_docs where doc_type = 'invoice' and status = 'posted' and delivery_status = 'dispatched')),
    'enquiries_new', (select count(*) from enquiries where status = 'new'),
    'quotations_open', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total), 0))
                          from sales_docs where doc_type = 'quotation' and status = 'open' and coalesce(valid_until, v_today) >= v_today),
    'cheques_pending', case when v_money then (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
                          from payments where status = 'pending') end,
    'sawmill', (select jsonb_build_object('runs', count(*), 'input_cft', coalesce(sum(input_cft), 0), 'output_cft', coalesce(sum(output_cft), 0),
                        'yield_pct', case when sum(input_cft) > 0 then round(sum(output_cft) / sum(input_cft) * 100, 1) end)
                  from conversions where conv_date >= v_today - 29),
    'recent', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', id, 'doc_no', doc_no, 'type', doc_type, 'date', doc_date, 'name', customer_name, 'total', total,
                                  'paid', amount_paid + credited_amount, 'status', status) as x
          from sales_docs order by created_at desc limit 8) q), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ───────────────────────── API access ─────────────────────────
-- Nothing is open to anonymous visitors except the two website functions.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on function public.public_catalog() to anon;
grant execute on function public.submit_enquiry(jsonb) to anon;
-- internal helpers are only called from the transaction functions
revoke execute on function public.apply_cost_in(uuid, numeric, numeric), public.apply_cost_out(uuid, numeric, numeric),
  public.sawn_stock_add(uuid, numeric, int), public.sawn_stock_take(uuid, numeric, int), public.product_take(uuid, numeric),
  public.refresh_sale_paid(uuid), public.refresh_purchase_paid(uuid), public.next_doc_no(text, text, date),
  public.log_audit(text, text, uuid, text), public.ensure_sawn_product(uuid, text, numeric, numeric) from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
