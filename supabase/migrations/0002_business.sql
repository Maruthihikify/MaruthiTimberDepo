-- Maruthi Timber Depot — business rules
-- Every stock or money transaction goes through one of these functions, so quantities, tax,
-- numbering, stock and balances are always computed on the server in a single transaction.

-- ───────────────────────── plumbing ─────────────────────────
create or replace function public.require_role(variadic roles text[] default '{}') returns text
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  select role into r from profiles where id = auth.uid() and active;
  if r is null then
    raise exception 'Please sign in with an active staff login' using errcode = '42501';
  end if;
  if r <> 'owner' and not (r = any(roles)) then
    raise exception 'Your role (%) is not allowed to do this', r using errcode = '42501';
  end if;
  return r;
end $$;

-- Gap-free numbering per financial year: MTD/26-27/0001. The counter row is locked by the
-- upsert, and rolls back together with the document if anything later fails.
create or replace function public.next_doc_no(p_series text, p_prefix text, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare v_fy text := fy_label(p_date); v_no int;
begin
  insert into doc_counters (series, fy, last_no) values (p_series, v_fy, 1)
  on conflict (series, fy) do update set last_no = doc_counters.last_no + 1
  returning last_no into v_no;
  return p_prefix || '/' || v_fy || '/' || lpad(v_no::text, 4, '0');
end $$;

create or replace function public.log_audit(p_action text, p_entity text, p_id uuid, p_summary text) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (action, entity, entity_id, summary) values (p_action, p_entity, p_id, p_summary)
$$;

-- Stock on hand of a product in its costing unit (CFT for sawn, sq.ft for panels, uom otherwise)
create or replace function public.stock_cost_units(p_product uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case p.kind
    when 'sawn' then coalesce((select sum(sawn_cft(p.thickness_in, p.width_in, s.length_ft, s.pieces)) from sawn_stock s where s.product_id = p.id), 0)
    when 'panel' then p.qty_on_hand * p.sheet_sqft
    else p.qty_on_hand end
  from products p where p.id = p_product
$$;

-- Weighted-average cost. Call BEFORE adding the incoming quantity to stock.
create or replace function public.apply_cost_in(p_product uuid, p_qty numeric, p_unit_cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_cur numeric; v_avg numeric;
begin
  if p_qty <= 0 then return; end if;
  select avg_cost into v_avg from products where id = p_product for update;
  v_cur := greatest(stock_cost_units(p_product), 0);
  update products
     set avg_cost = case when v_cur + p_qty > 0 then round((v_cur * v_avg + p_qty * p_unit_cost) / (v_cur + p_qty), 4) else p_unit_cost end
   where id = p_product;
end $$;

-- Reverse of apply_cost_in, used when an inward entry is cancelled. Call BEFORE removing the stock.
create or replace function public.apply_cost_out(p_product uuid, p_qty numeric, p_unit_cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_cur numeric; v_avg numeric;
begin
  if p_qty <= 0 then return; end if;
  select avg_cost into v_avg from products where id = p_product for update;
  v_cur := greatest(stock_cost_units(p_product), 0);
  if v_cur - p_qty > 0.0005 then
    update products set avg_cost = greatest(round((v_cur * v_avg - p_qty * p_unit_cost) / (v_cur - p_qty), 4), 0) where id = p_product;
  end if;
end $$;

-- Find or create the sawn section product for species + grade + thickness × width
create or replace function public.ensure_sawn_product(p_species uuid, p_grade text, p_t numeric, p_w numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sp species%rowtype; v_grade text := nullif(trim(coalesce(p_grade, '')), '');
begin
  if p_species is null or coalesce(p_t, 0) <= 0 or coalesce(p_w, 0) <= 0 then
    raise exception 'Pick a species and enter thickness and width';
  end if;
  select id into v_id from products
   where kind = 'sawn' and species_id = p_species and coalesce(grade, '') = coalesce(v_grade, '')
     and thickness_in = p_t and width_in = p_w;
  if v_id is not null then return v_id; end if;
  select * into v_sp from species where id = p_species;
  if not found then raise exception 'Unknown species'; end if;
  insert into products (kind, name, species_id, grade, thickness_in, width_in, uom, hsn, gst_rate, sale_rate)
  values ('sawn',
          v_sp.name || coalesce(' (' || v_grade || ')', '') || ' ' || fmt_num(p_t) || '" × ' || fmt_num(p_w) || '"',
          p_species, v_grade, p_t, p_w, 'cft', v_sp.hsn_sawn, v_sp.gst_rate, v_sp.sawn_rate_cft)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then -- lost a race with another insert
    select id into v_id from products
     where kind = 'sawn' and species_id = p_species and coalesce(grade, '') = coalesce(v_grade, '')
       and thickness_in = p_t and width_in = p_w;
  end if;
  return v_id;
end $$;

create or replace function public.sawn_stock_add(p_product uuid, p_len numeric, p_pcs int) returns void
language sql security definer set search_path = public as $$
  insert into sawn_stock (product_id, length_ft, pieces) values (p_product, p_len, p_pcs)
  on conflict (product_id, length_ft) do update set pieces = sawn_stock.pieces + excluded.pieces, updated_at = now()
$$;

-- Take pieces out, with a clear message when the yard does not have them
create or replace function public.sawn_stock_take(p_product uuid, p_len numeric, p_pcs int) returns void
language plpgsql security definer set search_path = public as $$
declare v_have int; v_name text;
begin
  update sawn_stock set pieces = pieces - p_pcs, updated_at = now()
   where product_id = p_product and length_ft = p_len and pieces >= p_pcs;
  if not found then
    select pieces into v_have from sawn_stock where product_id = p_product and length_ft = p_len;
    select name into v_name from products where id = p_product;
    raise exception 'Only % pcs of % × % ft in stock (needed %)', coalesce(v_have, 0), v_name, fmt_num(p_len), p_pcs;
  end if;
end $$;

create or replace function public.product_take(p_product uuid, p_qty numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_have numeric; v_name text;
begin
  update products set qty_on_hand = qty_on_hand - p_qty where id = p_product and qty_on_hand >= p_qty;
  if not found then
    select qty_on_hand, name into v_have, v_name from products where id = p_product;
    raise exception 'Only % of % in stock (needed %)', fmt_num(coalesce(v_have, 0)), coalesce(v_name, 'this item'), fmt_num(p_qty);
  end if;
end $$;

-- Re-derive paid amounts from allocations of live (cleared/pending) payments
create or replace function public.refresh_sale_paid(p_doc uuid) returns void
language sql security definer set search_path = public as $$
  update sales_docs d set amount_paid = coalesce((
    select sum(a.amount) from payment_allocations a join payments p on p.id = a.payment_id
     where a.sales_doc_id = d.id and p.status in ('cleared','pending')), 0)
  where d.id = p_doc
$$;

create or replace function public.refresh_purchase_paid(p_doc uuid) returns void
language sql security definer set search_path = public as $$
  update purchases d set amount_paid = coalesce((
    select sum(a.amount) from payment_allocations a join payments p on p.id = a.payment_id
     where a.purchase_id = d.id and p.status in ('cleared','pending')), 0)
  where d.id = p_doc
$$;

-- Running balance of a party: + they owe us, − we owe them
create or replace function public.party_balance(p_party uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select opening_balance from parties where id = p_party), 0)
       + coalesce((select sum(case doc_type when 'invoice' then total when 'credit_note' then -total else 0 end)
                     from sales_docs where customer_id = p_party and status = 'posted'), 0)
       - coalesce((select sum(case doc_type when 'invoice' then commission_amount else -commission_amount end) from sales_docs
                    where referred_by = p_party and doc_type in ('invoice','credit_note') and status = 'posted'), 0)
       - coalesce((select sum(total) from purchases where supplier_id = p_party and status = 'posted'), 0)
       + coalesce((select sum(case direction when 'out' then amount else -amount end)
                     from payments where party_id = p_party and status in ('cleared','pending')), 0)
$$;

-- ───────────────────────── purchases ─────────────────────────
-- p = { supplier_id, bill_no, bill_date, permit_no, vehicle_no, lot_code, freight, unloading, other_charges, notes,
--       lines: [ {line_kind:'log', species_id, log_no, length_ft, girth_in, bark_allowance_in, rate, grade, bay}
--              | {line_kind:'sawn', product_id | (species_id, grade, thickness_in, width_in), length_ft, pieces, rate}
--              | {line_kind:'panel', product_id, pieces, rate /*per sq.ft*/}
--              | {line_kind:'unit'|'byproduct', product_id, qty, rate} ],
--       payment: {amount, mode, reference} }
create or replace function public.post_purchase(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := require_role('manager','accounts');
  v_date date := coalesce(nullif(p->>'bill_date','')::date, today_ist());
  v_sup parties%rowtype;
  v_home text;
  v_inter boolean;
  v_id uuid := gen_random_uuid();
  v_ref text;
  v_freight numeric := greatest(coalesce((p->>'freight')::numeric, 0), 0);
  v_unload numeric := greatest(coalesce((p->>'unloading')::numeric, 0), 0);
  v_other numeric := greatest(coalesce((p->>'other_charges')::numeric, 0), 0);
  v_charges numeric;
  ln jsonb; v_n int := 0;
  v_kind text; v_pid uuid; v_sp species%rowtype; v_prod products%rowtype;
  v_len numeric; v_pcs int; v_qty numeric; v_units numeric; v_rate numeric; v_amt numeric; v_gst numeric; v_desc text; v_uom text;
  v_log_id uuid; v_landed numeric;
  v_sub numeric := 0; v_cgst numeric := 0; v_sgst numeric := 0; v_igst numeric := 0; v_grand numeric; v_total numeric;
  r record;
  v_pay numeric;
begin
  select * into v_sup from parties where id = nullif(p->>'supplier_id','')::uuid;
  if not found then raise exception 'Choose the supplier'; end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then raise exception 'Add at least one item to the bill'; end if;
  select state_code into v_home from company_settings where id = 1;
  v_inter := v_sup.state_code <> v_home;
  v_charges := v_freight + v_unload + v_other;
  v_ref := next_doc_no('purchase', 'PB', v_date);

  insert into purchases (id, ref_no, bill_no, bill_date, supplier_id, permit_no, vehicle_no, lot_code, is_interstate,
                         freight, unloading, other_charges, notes, due_date)
  values (v_id, v_ref, nullif(p->>'bill_no',''), v_date, v_sup.id, nullif(p->>'permit_no',''), nullif(upper(p->>'vehicle_no'),''),
          nullif(p->>'lot_code',''), v_inter, v_freight, v_unload, v_other, nullif(p->>'notes',''), v_date + v_sup.credit_days);

  -- pass 1: lines with amounts and tax (no stock yet: landed cost needs the bill subtotal)
  for ln in select * from jsonb_array_elements(p->'lines') loop
    v_n := v_n + 1;
    v_kind := ln->>'line_kind';
    v_rate := round(coalesce((ln->>'rate')::numeric, -1), 2);
    if v_rate < 0 then raise exception 'Line %: enter the rate', v_n; end if;
    v_pid := null; v_len := null; v_pcs := null;

    if v_kind = 'log' then
      select * into v_sp from species where id = (ln->>'species_id')::uuid;
      if not found then raise exception 'Line %: pick the species', v_n; end if;
      if coalesce(trim(ln->>'log_no'), '') = '' then raise exception 'Line %: enter the log number', v_n; end if;
      if exists (select 1 from logs where log_no = trim(ln->>'log_no')) then raise exception 'Log number % already exists', trim(ln->>'log_no'); end if;
      v_len := (ln->>'length_ft')::numeric;
      if coalesce(v_len, 0) <= 0 or coalesce((ln->>'girth_in')::numeric, 0) <= coalesce((ln->>'bark_allowance_in')::numeric, 0) then
        raise exception 'Line %: enter a valid length and girth', v_n;
      end if;
      v_qty := hoppus_cft((ln->>'girth_in')::numeric, coalesce((ln->>'bark_allowance_in')::numeric, 0), v_len);
      v_uom := 'cft'; v_gst := v_sp.gst_rate; v_pcs := 1;
      v_desc := v_sp.name || ' log #' || trim(ln->>'log_no') || ' — ' || fmt_num(v_len) || ' ft × ' || fmt_num((ln->>'girth_in')::numeric) || '" girth';
    elsif v_kind = 'sawn' then
      v_pid := coalesce(nullif(ln->>'product_id','')::uuid,
                        ensure_sawn_product(nullif(ln->>'species_id','')::uuid, ln->>'grade', (ln->>'thickness_in')::numeric, (ln->>'width_in')::numeric));
      select * into v_prod from products where id = v_pid and kind = 'sawn';
      if not found then raise exception 'Line %: unknown sawn size', v_n; end if;
      v_len := (ln->>'length_ft')::numeric; v_pcs := (ln->>'pieces')::int;
      if coalesce(v_len, 0) <= 0 or coalesce(v_pcs, 0) <= 0 then raise exception 'Line %: enter length and pieces', v_n; end if;
      v_qty := sawn_cft(v_prod.thickness_in, v_prod.width_in, v_len, v_pcs);
      v_uom := 'cft'; v_gst := v_prod.gst_rate;
      v_desc := v_prod.name || ' × ' || fmt_num(v_len) || ' ft — ' || v_pcs || ' pcs';
    elsif v_kind = 'panel' then
      select * into v_prod from products where id = (ln->>'product_id')::uuid and kind = 'panel';
      if not found then raise exception 'Line %: pick the panel item', v_n; end if;
      v_pid := v_prod.id; v_pcs := (ln->>'pieces')::int;
      if coalesce(v_pcs, 0) <= 0 then raise exception 'Line %: enter number of sheets', v_n; end if;
      v_qty := round(v_pcs * v_prod.sheet_sqft, 3); v_uom := 'sqft'; v_gst := v_prod.gst_rate;
      v_desc := v_prod.name || ' — ' || v_pcs || ' sheets';
    elsif v_kind in ('unit','byproduct') then
      select * into v_prod from products where id = (ln->>'product_id')::uuid and kind = v_kind;
      if not found then raise exception 'Line %: pick the item', v_n; end if;
      v_pid := v_prod.id; v_qty := (ln->>'qty')::numeric;
      if coalesce(v_qty, 0) <= 0 then raise exception 'Line %: enter quantity', v_n; end if;
      v_uom := v_prod.uom; v_gst := v_prod.gst_rate; v_desc := v_prod.name;
    else
      raise exception 'Line %: unknown item type %', v_n, v_kind;
    end if;

    v_amt := round(v_qty * v_rate, 2);
    v_sub := v_sub + v_amt;
    insert into purchase_lines (purchase_id, line_no, line_kind, product_id, species_id, description, length_ft, pieces, qty, uom, rate, amount, gst_rate, tax)
    values (v_id, v_n, v_kind, v_pid, case when v_kind = 'log' then v_sp.id else v_prod.species_id end,
            v_desc, v_len, v_pcs, v_qty, v_uom, v_rate, v_amt, v_gst, round(v_amt * v_gst / 100, 2));
    if v_inter then v_igst := v_igst + round(v_amt * v_gst / 100, 2);
    else v_cgst := v_cgst + round(v_amt * v_gst / 200, 2); v_sgst := v_sgst + round(v_amt * v_gst / 200, 2); end if;
  end loop;

  -- pass 2: stock in at landed cost (charges spread over lines by value; GST is input credit, not cost)
  for r in select pl.*, ln2.value as src
             from purchase_lines pl
             join lateral (select value from jsonb_array_elements(p->'lines') with ordinality e(value, ord) where ord = pl.line_no) ln2 on true
            where pl.purchase_id = v_id order by pl.line_no loop
    v_landed := case when v_sub > 0 then (r.amount + v_charges * r.amount / v_sub) / r.qty else r.rate end;
    if r.line_kind = 'log' then
      insert into logs (log_no, species_id, purchase_id, grade, length_ft, girth_in, bark_allowance_in, cost_per_cft, bay, received_on)
      values (trim(r.src->>'log_no'), r.species_id, v_id, nullif(r.src->>'grade',''), r.length_ft, (r.src->>'girth_in')::numeric,
              coalesce((r.src->>'bark_allowance_in')::numeric, 0), round(v_landed, 2), nullif(r.src->>'bay',''), v_date)
      returning id into v_log_id;
      update purchase_lines set log_id = v_log_id, landed_unit_cost = round(v_landed, 4) where id = r.id;
      insert into stock_moves (move_date, log_id, pieces, qty, unit_cost, ref_type, ref_id, ref_no)
      values (v_date, v_log_id, 1, r.qty, round(v_landed, 4), 'purchase', v_id, v_ref);
    else
      perform apply_cost_in(r.product_id, r.qty, v_landed);
      if r.line_kind = 'sawn' then perform sawn_stock_add(r.product_id, r.length_ft, r.pieces);
      elsif r.line_kind = 'panel' then update products set qty_on_hand = qty_on_hand + r.pieces where id = r.product_id;
      else update products set qty_on_hand = qty_on_hand + r.qty where id = r.product_id; end if;
      update purchase_lines set landed_unit_cost = round(v_landed, 4) where id = r.id;
      insert into stock_moves (move_date, product_id, length_ft, pieces, qty, unit_cost, ref_type, ref_id, ref_no)
      values (v_date, r.product_id, r.length_ft, r.pieces, r.qty, round(v_landed, 4), 'purchase', v_id, v_ref);
    end if;
  end loop;

  v_grand := v_sub + v_cgst + v_sgst + v_igst + v_charges;
  v_total := round(v_grand, 0);
  update purchases set subtotal = v_sub, cgst = v_cgst, sgst = v_sgst, igst = v_igst,
                       round_off = v_total - v_grand, total = v_total
   where id = v_id;

  v_pay := coalesce((p->'payment'->>'amount')::numeric, 0);
  if v_pay > 0 then
    perform record_payment(jsonb_build_object(
      'direction', 'out', 'party_id', v_sup.id, 'amount', v_pay, 'mode', coalesce(p->'payment'->>'mode', 'cash'),
      'reference', p->'payment'->>'reference', 'pay_date', v_date, 'purpose', 'purchase',
      'allocations', jsonb_build_array(jsonb_build_object('purchase_id', v_id, 'amount', least(v_pay, v_total)))));
  end if;

  perform log_audit('create', 'purchase', v_id, v_ref || ' from ' || v_sup.name || ' ₹' || v_total);
  return jsonb_build_object('id', v_id, 'ref_no', v_ref, 'total', v_total);
end $$;

create or replace function public.cancel_purchase(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text := require_role('manager'); v_doc purchases%rowtype; r record;
begin
  select * into v_doc from purchases where id = p_id for update;
  if not found or v_doc.status <> 'posted' then raise exception 'Bill not found or already cancelled'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for cancelling'; end if;
  for r in select * from purchase_lines where purchase_id = p_id loop
    if r.line_kind = 'log' then
      update logs set status = 'written_off', remarks = coalesce(remarks || ' · ', '') || 'Purchase ' || v_doc.ref_no || ' cancelled'
       where id = r.log_id and status = 'in_yard';
      if not found then raise exception 'Log in line % has already been sawn or sold — cannot cancel this bill', r.line_no; end if;
      insert into stock_moves (log_id, pieces, qty, unit_cost, ref_type, ref_id, ref_no)
      values (r.log_id, -1, -r.qty, r.landed_unit_cost, 'purchase_cancel', p_id, v_doc.ref_no);
    else
      perform apply_cost_out(r.product_id, r.qty, r.landed_unit_cost);
      if r.line_kind = 'sawn' then perform sawn_stock_take(r.product_id, r.length_ft, r.pieces);
      elsif r.line_kind = 'panel' then perform product_take(r.product_id, r.pieces);
      else perform product_take(r.product_id, r.qty); end if;
      insert into stock_moves (product_id, length_ft, pieces, qty, unit_cost, ref_type, ref_id, ref_no)
      values (r.product_id, r.length_ft, -r.pieces, -r.qty, r.landed_unit_cost, 'purchase_cancel', p_id, v_doc.ref_no);
    end if;
  end loop;
  delete from payment_allocations where purchase_id = p_id; -- payments stay as advance to the supplier
  update purchases set status = 'cancelled', amount_paid = 0, cancel_reason = p_reason where id = p_id;
  perform log_audit('cancel', 'purchase', p_id, v_doc.ref_no || ': ' || p_reason);
end $$;

-- ───────────────────────── sawmill conversion ─────────────────────────
-- p = { conv_date, operator, notes, processing_cost, firewood_kg, sawdust_bags,
--       logs: [log_id...], sawn_inputs: [{product_id, length_ft, pieces}],
--       outputs: [{product_id | (species_id, grade, thickness_in, width_in), length_ft, pieces}] }
create or replace function public.post_conversion(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := require_role('manager','yard');
  v_date date := coalesce(nullif(p->>'conv_date','')::date, today_ist());
  v_id uuid := gen_random_uuid();
  v_ref text;
  v_in_cft numeric := 0; v_in_cost numeric := 0; v_out_cft numeric := 0;
  v_proc numeric := greatest(coalesce((p->>'processing_cost')::numeric, 0), 0);
  v_fw_kg numeric := greatest(coalesce((p->>'firewood_kg')::numeric, 0), 0);
  v_fw products%rowtype; v_fw_value numeric := 0;
  v_cost_cft numeric; v_total_cost numeric;
  v_log logs%rowtype; v_prod products%rowtype; v_pid uuid; v_len numeric; v_pcs int; v_cft numeric;
  e jsonb; r record;
begin
  if jsonb_array_length(coalesce(p->'logs','[]'::jsonb)) +jsonb_array_length(coalesce(p->'sawn_inputs','[]'::jsonb)) = 0 then
    raise exception 'Pick the logs or timber going into the saw';
  end if;
  if jsonb_array_length(coalesce(p->'outputs','[]'::jsonb)) = 0 then raise exception 'Enter the sizes that came out'; end if;
  v_ref := next_doc_no('conversion', 'SM', v_date);
  insert into conversions (id, ref_no, conv_date, input_cft, output_cft, yield_pct, input_cost, processing_cost, cost_per_cft, operator, notes, sawdust_bags)
  values (v_id, v_ref, v_date, 0, 0, 0, 0, v_proc, 0, nullif(p->>'operator',''), nullif(p->>'notes',''), greatest(coalesce((p->>'sawdust_bags')::numeric, 0), 0));

  for e in select * from jsonb_array_elements(coalesce(p->'logs','[]'::jsonb)) loop
    update logs set status = 'sawn' where id = (e #>> '{}')::uuid and status = 'in_yard' returning * into v_log;
    if not found then raise exception 'A selected log is no longer in the yard'; end if;
    v_in_cft := v_in_cft + v_log.cft; v_in_cost := v_in_cost + round(v_log.cft * v_log.cost_per_cft, 2);
    insert into conversion_inputs (conversion_id, log_id, cft, cost) values (v_id, v_log.id, v_log.cft, round(v_log.cft * v_log.cost_per_cft, 2));
    insert into stock_moves (move_date, log_id, pieces, qty, unit_cost, ref_type, ref_id, ref_no)
    values (v_date, v_log.id, -1, -v_log.cft, v_log.cost_per_cft, 'conversion_in', v_id, v_ref);
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p->'sawn_inputs','[]'::jsonb)) loop
    select * into v_prod from products where id = (e->>'product_id')::uuid and kind = 'sawn';
    if not found then raise exception 'Unknown timber size in inputs'; end if;
    v_len := (e->>'length_ft')::numeric; v_pcs := (e->>'pieces')::int;
    perform sawn_stock_take(v_prod.id, v_len, v_pcs);
    v_cft := sawn_cft(v_prod.thickness_in, v_prod.width_in, v_len, v_pcs);
    v_in_cft := v_in_cft + v_cft; v_in_cost := v_in_cost + round(v_cft * v_prod.avg_cost, 2);
    insert into conversion_inputs (conversion_id, product_id, length_ft, pieces, cft, cost) values (v_id, v_prod.id, v_len, v_pcs, v_cft, round(v_cft * v_prod.avg_cost, 2));
    insert into stock_moves (move_date, product_id, length_ft, pieces, qty, unit_cost, ref_type, ref_id, ref_no)
    values (v_date, v_prod.id, v_len, -v_pcs, -v_cft, v_prod.avg_cost, 'conversion_in', v_id, v_ref);
  end loop;

  -- outputs first pass: volume
  for e in select * from jsonb_array_elements(p->'outputs') loop
    v_pid := coalesce(nullif(e->>'product_id','')::uuid,
                      ensure_sawn_product(nullif(e->>'species_id','')::uuid, e->>'grade', (e->>'thickness_in')::numeric, (e->>'width_in')::numeric));
    select * into v_prod from products where id = v_pid and kind = 'sawn';
    v_len := (e->>'length_ft')::numeric; v_pcs := (e->>'pieces')::int;
    if coalesce(v_len, 0) <= 0 or coalesce(v_pcs, 0) <= 0 then raise exception 'Every output size needs a length and pieces'; end if;
    v_cft := sawn_cft(v_prod.thickness_in, v_prod.width_in, v_len, v_pcs);
    v_out_cft := v_out_cft + v_cft;
    insert into conversion_outputs (conversion_id, product_id, length_ft, pieces, cft) values (v_id, v_pid, v_len, v_pcs, v_cft);
  end loop;

  -- Hoppus measure under-states a log's true volume by π/4, so sawn output can never exceed ~127% of it.
  if v_in_cft > 0 and v_out_cft > v_in_cft * 1.273 then
    raise exception 'Output % CFT is more than the input % CFT can physically give — check the sizes', round(v_out_cft, 2), round(v_in_cft, 2);
  end if;

  if v_fw_kg > 0 then
    select * into v_fw from products where kind = 'byproduct' and uom = 'kg' and active order by created_at limit 1;
    if found then
      v_fw_value := round(v_fw_kg * v_fw.sale_rate, 2);  -- byproduct credited at net realisable value
      perform apply_cost_in(v_fw.id, v_fw_kg, v_fw.sale_rate);
      update products set qty_on_hand = qty_on_hand + v_fw_kg where id = v_fw.id;
      insert into stock_moves (move_date, product_id, qty, unit_cost, ref_type, ref_id, ref_no, note)
      values (v_date, v_fw.id, v_fw_kg, v_fw.sale_rate, 'conversion_out', v_id, v_ref, 'Firewood / off-cuts');
    end if;
  end if;

  v_total_cost := greatest(v_in_cost + v_proc - v_fw_value, 0);
  v_cost_cft := round(v_total_cost / v_out_cft, 2);

  -- outputs second pass: into stock at the conversion cost (cost first, then quantity, one size at a time)
  for r in select * from conversion_outputs where conversion_id = v_id order by id loop
    perform apply_cost_in(r.product_id, r.cft, v_cost_cft);
    perform sawn_stock_add(r.product_id, r.length_ft, r.pieces);
    insert into stock_moves (move_date, product_id, length_ft, pieces, qty, unit_cost, ref_type, ref_id, ref_no)
    values (v_date, r.product_id, r.length_ft, r.pieces, r.cft, v_cost_cft, 'conversion_out', v_id, v_ref);
  end loop;

  update conversions set input_cft = v_in_cft, output_cft = v_out_cft,
         yield_pct = case when v_in_cft > 0 then round(v_out_cft / v_in_cft * 100, 2) else 0 end,
         input_cost = v_in_cost, firewood_kg = v_fw_kg, byproduct_value = v_fw_value, cost_per_cft = v_cost_cft
   where id = v_id;

  perform log_audit('create', 'conversion', v_id, v_ref || ': ' || round(v_in_cft, 2) || ' → ' || round(v_out_cft, 2) || ' CFT');
  return jsonb_build_object('id', v_id, 'ref_no', v_ref, 'input_cft', v_in_cft, 'output_cft', v_out_cft,
                            'yield_pct', case when v_in_cft > 0 then round(v_out_cft / v_in_cft * 100, 2) else 0 end, 'cost_per_cft', v_cost_cft);
end $$;
