-- Maruthi Timber Depot — billing, returns, receipts & payments, stock adjustments, deliveries, website

-- ───────────────────────── payments ─────────────────────────
-- p = { direction:'in'|'out', party_id | party_name, amount, mode, reference, cheque_date, bank_name, pay_date, purpose, notes,
--       allocations: [{sales_doc_id | purchase_id, amount}]  or  auto_allocate: true (oldest bills first) }
-- Anything not allocated stays on the party's account as an advance.
create or replace function public.record_payment(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_dir text := p->>'direction';
  v_role text;
  v_party parties%rowtype; v_has_party boolean := false;
  v_amt numeric := round(coalesce(nullif(p->>'amount','')::numeric, 0), 2);
  v_mode text := coalesce(nullif(p->>'mode',''), 'cash');
  v_purpose text;
  v_date date := coalesce(nullif(p->>'pay_date','')::date, today_ist());
  v_id uuid := gen_random_uuid(); v_no text;
  v_left numeric; e jsonb; v_alloc numeric; v_out numeric;
  v_sd sales_docs%rowtype; v_pb purchases%rowtype; r record;
begin
  if v_dir = 'in' then v_role := require_role('manager','accounts','sales');
  elsif v_dir = 'out' then v_role := require_role('manager','accounts');
  else raise exception 'Choose whether money was received or paid'; end if;
  if v_amt <= 0 then raise exception 'Enter the amount'; end if;
  if v_mode not in ('cash','upi','bank','cheque','card') then raise exception 'Unknown payment mode %', v_mode; end if;
  if nullif(p->>'party_id','') is not null then
    select * into v_party from parties where id = (p->>'party_id')::uuid;
    if not found then raise exception 'Party not found'; end if;
    v_has_party := true;
  elsif coalesce(trim(p->>'party_name'), '') = '' then
    raise exception 'Choose the party';
  end if;
  v_purpose := coalesce(nullif(p->>'purpose',''), case v_dir when 'in' then 'sale' else 'purchase' end);
  if v_mode = 'cheque' and coalesce(trim(p->>'reference'), '') = '' then raise exception 'Enter the cheque number'; end if;

  v_no := next_doc_no(case v_dir when 'in' then 'receipt' else 'voucher' end, case v_dir when 'in' then 'RC' else 'PV' end, v_date);
  insert into payments (id, ref_no, pay_date, direction, party_id, party_name, amount, mode, reference, cheque_date, bank_name, purpose, status, notes)
  values (v_id, v_no, v_date, v_dir, case when v_has_party then v_party.id end,
          coalesce(nullif(trim(p->>'party_name'),''), v_party.name), v_amt, v_mode, nullif(trim(p->>'reference'),''),
          nullif(p->>'cheque_date','')::date, nullif(p->>'bank_name',''), v_purpose,
          case when v_mode = 'cheque' then 'pending' else 'cleared' end, nullif(p->>'notes',''));

  v_left := v_amt;
  if jsonb_typeof(p->'allocations') = 'array' then
    for e in select * from jsonb_array_elements(p->'allocations') loop
      v_alloc := round(coalesce(nullif(e->>'amount','')::numeric, 0), 2);
      continue when v_alloc <= 0;
      if v_alloc > v_left + 0.001 then raise exception 'Allocated more than the amount received'; end if;
      if nullif(e->>'sales_doc_id','') is not null then
        select * into v_sd from sales_docs where id = (e->>'sales_doc_id')::uuid for update;
        if not found or v_sd.status <> 'posted' then raise exception 'Bill not found or cancelled'; end if;
        if (v_dir = 'in' and v_sd.doc_type <> 'invoice') or (v_dir = 'out' and v_sd.doc_type <> 'credit_note') then
          raise exception 'Receipts settle invoices; refunds settle credit notes';
        end if;
        if v_has_party and v_sd.customer_id is distinct from v_party.id then raise exception '% belongs to another customer', v_sd.doc_no; end if;
        v_out := v_sd.total - v_sd.amount_paid - v_sd.credited_amount;
        if v_alloc > v_out + 0.001 then raise exception 'Only ₹% is due on %', v_out, v_sd.doc_no; end if;
        insert into payment_allocations (payment_id, sales_doc_id, amount) values (v_id, v_sd.id, v_alloc);
        perform refresh_sale_paid(v_sd.id);
      elsif nullif(e->>'purchase_id','') is not null then
        if v_dir <> 'out' then raise exception 'Supplier bills are settled with payments, not receipts'; end if;
        select * into v_pb from purchases where id = (e->>'purchase_id')::uuid for update;
        if not found or v_pb.status <> 'posted' then raise exception 'Purchase bill not found or cancelled'; end if;
        if v_has_party and v_pb.supplier_id <> v_party.id then raise exception '% belongs to another supplier', v_pb.ref_no; end if;
        v_out := v_pb.total - v_pb.amount_paid;
        if v_alloc > v_out + 0.001 then raise exception 'Only ₹% is due on %', v_out, v_pb.ref_no; end if;
        insert into payment_allocations (payment_id, purchase_id, amount) values (v_id, v_pb.id, v_alloc);
        perform refresh_purchase_paid(v_pb.id);
      end if;
      v_left := v_left - v_alloc;
    end loop;
  elsif coalesce((p->>'auto_allocate')::boolean, false) and v_has_party then
    if v_dir = 'in' then
      for r in select id, total - amount_paid - credited_amount as due from sales_docs
                where customer_id = v_party.id and doc_type = 'invoice' and status = 'posted' and total - amount_paid - credited_amount > 0
                order by doc_date, doc_no loop
        exit when v_left <= 0;
        v_alloc := least(v_left, r.due);
        insert into payment_allocations (payment_id, sales_doc_id, amount) values (v_id, r.id, v_alloc);
        perform refresh_sale_paid(r.id);
        v_left := v_left - v_alloc;
      end loop;
    elsif v_purpose = 'purchase' then
      for r in select id, total - amount_paid as due from purchases
                where supplier_id = v_party.id and status = 'posted' and total - amount_paid > 0
                order by bill_date, ref_no loop
        exit when v_left <= 0;
        v_alloc := least(v_left, r.due);
        insert into payment_allocations (payment_id, purchase_id, amount) values (v_id, r.id, v_alloc);
        perform refresh_purchase_paid(r.id);
        v_left := v_left - v_alloc;
      end loop;
    end if;
  end if;

  perform log_audit('create', 'payment', v_id, v_no || ' ' || v_dir || ' ₹' || v_amt || ' ' || coalesce(v_party.name, p->>'party_name'));
  return jsonb_build_object('id', v_id, 'ref_no', v_no, 'unallocated', v_left);
end $$;

-- Cheque cleared / bounced, or a wrong entry voided. Bounced and void payments stop counting everywhere.
create or replace function public.set_payment_status(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text := require_role('manager','accounts'); v_pay payments%rowtype; r record;
begin
  select * into v_pay from payments where id = p_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p_status not in ('cleared','bounced','void') then raise exception 'Unknown status %', p_status; end if;
  if v_pay.status in ('bounced','void') then raise exception 'This payment is already %', v_pay.status; end if;
  if p_status = 'cleared' and v_pay.status <> 'pending' then raise exception 'Only pending cheques can be marked cleared'; end if;
  if p_status = 'void' and v_role not in ('owner','manager') then raise exception 'Only the owner or manager can void a payment'; end if;
  update payments set status = p_status, notes = case when p_note is null then notes else coalesce(notes || ' · ', '') || p_note end where id = p_id;
  for r in select sales_doc_id, purchase_id from payment_allocations where payment_id = p_id loop
    if r.sales_doc_id is not null then perform refresh_sale_paid(r.sales_doc_id); end if;
    if r.purchase_id is not null then perform refresh_purchase_paid(r.purchase_id); end if;
  end loop;
  perform log_audit(p_status, 'payment', p_id, v_pay.ref_no || ' marked ' || p_status || coalesce(': ' || p_note, ''));
end $$;

-- ───────────────────────── billing ─────────────────────────
-- p = { doc_type:'invoice'|'quotation', doc_date, customer_id | customer_name, customer_phone, customer_gstin, billing_address,
--       shipping_address, place_of_supply, referred_by, commission_pct, discount, notes, source_doc_id, enquiry_id,
--       delivery_mode, delivery_address, vehicle_no, driver_name, driver_phone, override_credit,
--       lines: [ {line_kind:'sawn', product_id | (species_id, grade, thickness_in, width_in), length_ft, pieces, rate, discount_pct}
--              | {line_kind:'log', log_id, rate} | {line_kind:'panel', product_id, pieces, rate /*per sq.ft*/}
--              | {line_kind:'unit'|'byproduct', product_id, qty, rate} | {line_kind:'service', product_id?, description, qty, rate, gst_rate} ],
--       payment: {amount, mode, reference} }
create or replace function public.post_sale(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_type text := coalesce(nullif(p->>'doc_type',''), 'invoice');
  v_role text;
  v_date date := coalesce(nullif(p->>'doc_date','')::date, today_ist());
  v_co company_settings%rowtype;
  v_cust parties%rowtype; v_has_cust boolean := false;
  v_carp parties%rowtype; v_comm_pct numeric := 0;
  v_pos text; v_inter boolean; v_gstin text;
  v_id uuid := gen_random_uuid(); v_no text;
  v_src sales_docs%rowtype;
  ln jsonb; v_n int := 0;
  v_kind text; v_pid uuid; v_lid uuid; v_spid uuid; v_prod products%rowtype; v_log logs%rowtype; v_sp species%rowtype;
  v_t numeric; v_w numeric; v_len numeric; v_pcs numeric; v_qty numeric; v_uom text; v_list numeric; v_rate numeric; v_disc numeric;
  v_amt numeric; v_gst numeric; v_hsn text; v_desc text; v_cost numeric;
  v_sub numeric := 0; v_doc_disc numeric := round(greatest(coalesce(nullif(p->>'discount','')::numeric, 0), 0), 2);
  v_diff numeric; v_taxable numeric; v_cgst numeric; v_sgst numeric; v_igst numeric; v_grand numeric; v_total numeric; v_cost_total numeric;
  v_pay numeric := round(greatest(coalesce(nullif(p->'payment'->>'amount','')::numeric, 0), 0), 2);
  v_bal numeric; v_override boolean := coalesce((p->>'override_credit')::boolean, false);
begin
  if v_type not in ('invoice','quotation') then raise exception 'Unknown document type %', v_type; end if;
  v_role := require_role('manager','accounts','sales');
  select * into v_co from company_settings where id = 1;
  if jsonb_array_length(coalesce(p->'lines','[]'::jsonb)) = 0 then raise exception 'Add at least one item'; end if;

  if nullif(p->>'customer_id','') is not null then
    select * into v_cust from parties where id = (p->>'customer_id')::uuid;
    if not found then raise exception 'Customer not found'; end if;
    v_has_cust := true;
  elsif coalesce(trim(p->>'customer_name'), '') = '' then
    raise exception 'Enter the customer name';
  end if;
  v_gstin := upper(coalesce(nullif(trim(p->>'customer_gstin'),''), v_cust.gstin));
  if v_gstin is not null and v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'GSTIN % is not valid', v_gstin;
  end if;
  -- place of supply: explicit > GSTIN state > customer state > our state
  v_pos := coalesce(nullif(p->>'place_of_supply',''), left(v_gstin, 2), case when v_has_cust then v_cust.state_code end, v_co.state_code);
  v_inter := v_pos <> v_co.state_code;

  if nullif(p->>'source_doc_id','') is not null then
    select * into v_src from sales_docs where id = (p->>'source_doc_id')::uuid for update;
    if not found or v_src.doc_type <> 'quotation' or v_src.status <> 'open' then
      raise exception 'This quotation has already been converted or closed';
    end if;
    if v_type <> 'invoice' then raise exception 'A quotation can only be converted into an invoice'; end if;
  end if;

  if v_type = 'invoice' and nullif(p->>'referred_by','') is not null then
    select * into v_carp from parties where id = (p->>'referred_by')::uuid and is_carpenter;
    if not found then raise exception 'Referred-by must be a carpenter / mestri on record'; end if;
    v_comm_pct := coalesce(nullif(p->>'commission_pct','')::numeric, v_carp.commission_pct);
    if v_comm_pct < 0 or v_comm_pct > 20 then raise exception 'Commission must be between 0 and 20 percent'; end if;
  end if;

  v_no := case v_type when 'invoice' then next_doc_no('invoice', v_co.invoice_prefix, v_date)
                      else next_doc_no('quotation', 'QT', v_date) end;

  insert into sales_docs (id, doc_type, doc_no, doc_date, customer_id, customer_name, customer_phone, customer_gstin, billing_address,
                          shipping_address, place_of_supply, is_interstate, referred_by, commission_pct, discount, status, due_date,
                          valid_until, source_doc_id, enquiry_id, delivery_mode, delivery_status, delivery_address, vehicle_no,
                          driver_name, driver_phone, notes)
  values (v_id, v_type, v_no, v_date,
          case when v_has_cust then v_cust.id end,
          coalesce(nullif(trim(p->>'customer_name'),''), v_cust.name),
          coalesce(nullif(trim(p->>'customer_phone'),''), v_cust.phone),
          v_gstin,
          coalesce(nullif(trim(p->>'billing_address'),''), v_cust.address),
          nullif(trim(p->>'shipping_address'),''),
          v_pos, v_inter,
          v_carp.id, v_comm_pct, v_doc_disc,
          case v_type when 'invoice' then 'posted' else 'open' end,
          case when v_type = 'invoice' then v_date + coalesce(v_cust.credit_days, 0) end,
          case when v_type = 'quotation' then v_date + v_co.quotation_validity_days end,
          v_src.id, nullif(p->>'enquiry_id','')::uuid,
          case when p->>'delivery_mode' = 'delivery' then 'delivery' else 'pickup' end,
          case when v_type = 'invoice' and p->>'delivery_mode' = 'delivery' then 'pending' else 'na' end,
          coalesce(nullif(trim(p->>'delivery_address'),''), nullif(trim(p->>'shipping_address'),'')),
          nullif(upper(trim(p->>'vehicle_no')),''), nullif(trim(p->>'driver_name'),''), nullif(trim(p->>'driver_phone'),''),
          nullif(trim(p->>'notes'),''));

  for ln in select * from jsonb_array_elements(p->'lines') loop
    v_n := v_n + 1;
    v_kind := ln->>'line_kind';
    v_pid := null; v_lid := null; v_spid := null; v_t := null; v_w := null; v_len := null; v_pcs := null;
    v_cost := 0; v_desc := null; v_hsn := null; v_list := null;
    v_disc := coalesce(nullif(ln->>'discount_pct','')::numeric, 0);
    if v_disc < 0 or v_disc > 100 then raise exception 'Line %: discount must be between 0 and 100 percent', v_n; end if;

    if v_kind = 'sawn' then
      v_pid := coalesce(nullif(ln->>'product_id','')::uuid,
                        ensure_sawn_product(nullif(ln->>'species_id','')::uuid, ln->>'grade', (ln->>'thickness_in')::numeric, (ln->>'width_in')::numeric));
      select * into v_prod from products where id = v_pid and kind = 'sawn';
      if not found then raise exception 'Line %: unknown timber size', v_n; end if;
      v_len := (ln->>'length_ft')::numeric; v_pcs := (ln->>'pieces')::numeric;
      if coalesce(v_len, 0) <= 0 or coalesce(v_pcs, 0) <= 0 or v_pcs <> trunc(v_pcs) then
        raise exception 'Line %: enter the length and whole pieces', v_n;
      end if;
      v_t := v_prod.thickness_in; v_w := v_prod.width_in; v_spid := v_prod.species_id;
      v_qty := sawn_cft(v_t, v_w, v_len, v_pcs); v_uom := 'cft';
      v_list := v_prod.sale_rate; v_gst := v_prod.gst_rate; v_hsn := v_prod.hsn; v_cost := v_prod.avg_cost;
      v_desc := v_prod.name || ' × ' || fmt_num(v_len) || ' ft — ' || fmt_num(v_pcs) || ' pcs';
      if v_type = 'invoice' then perform sawn_stock_take(v_pid, v_len, v_pcs::int); end if;

    elsif v_kind = 'log' then
      v_lid := nullif(ln->>'log_id','')::uuid;
      if v_type = 'invoice' then
        update logs set status = 'sold' where id = v_lid and status = 'in_yard' returning * into v_log;
        if not found then raise exception 'Line %: this log is no longer in the yard', v_n; end if;
      else
        select * into v_log from logs where id = v_lid;
        if not found then raise exception 'Line %: log not found', v_n; end if;
      end if;
      select * into v_sp from species where id = v_log.species_id;
      v_spid := v_sp.id; v_len := v_log.length_ft; v_pcs := 1; v_qty := v_log.cft; v_uom := 'cft';
      v_list := coalesce(v_log.sale_rate_cft, v_sp.log_rate_cft); v_gst := v_sp.gst_rate; v_hsn := v_sp.hsn_log; v_cost := v_log.cost_per_cft;
      v_desc := v_sp.name || ' log #' || v_log.log_no || ' — ' || fmt_num(v_log.length_ft) || ' ft × ' || fmt_num(v_log.girth_in) || '" girth (Hoppus)';

    elsif v_kind = 'panel' then
      select * into v_prod from products where id = nullif(ln->>'product_id','')::uuid and kind = 'panel';
      if not found then raise exception 'Line %: pick the panel item', v_n; end if;
      v_pid := v_prod.id; v_pcs := (ln->>'pieces')::numeric;
      if coalesce(v_pcs, 0) <= 0 or v_pcs <> trunc(v_pcs) then raise exception 'Line %: enter whole sheets', v_n; end if;
      v_qty := round(v_pcs * v_prod.sheet_sqft, 3); v_uom := 'sqft';
      v_list := v_prod.sale_rate; v_gst := v_prod.gst_rate; v_hsn := v_prod.hsn; v_cost := v_prod.avg_cost;
      v_desc := v_prod.name || ' — ' || fmt_num(v_pcs) || ' sheets × ' || fmt_num(v_prod.sheet_sqft) || ' sq.ft';
      if v_type = 'invoice' then perform product_take(v_pid, v_pcs); end if;

    elsif v_kind in ('unit','byproduct') then
      select * into v_prod from products where id = nullif(ln->>'product_id','')::uuid and kind = v_kind;
      if not found then raise exception 'Line %: pick the item', v_n; end if;
      v_pid := v_prod.id; v_qty := (ln->>'qty')::numeric;
      if coalesce(v_qty, 0) <= 0 then raise exception 'Line %: enter the quantity', v_n; end if;
      v_uom := v_prod.uom; v_list := v_prod.sale_rate; v_gst := v_prod.gst_rate; v_hsn := v_prod.hsn; v_cost := v_prod.avg_cost;
      v_spid := v_prod.species_id; v_desc := v_prod.name;
      if v_type = 'invoice' then perform product_take(v_pid, v_qty); end if;

    elsif v_kind = 'service' then
      if nullif(ln->>'product_id','') is not null then
        select * into v_prod from products where id = (ln->>'product_id')::uuid and kind = 'service';
        if not found then raise exception 'Line %: unknown service', v_n; end if;
        v_pid := v_prod.id; v_uom := v_prod.uom; v_list := v_prod.sale_rate; v_gst := v_prod.gst_rate; v_hsn := v_prod.hsn;
        v_desc := coalesce(nullif(trim(ln->>'description'),''), v_prod.name);
      else
        v_uom := coalesce(nullif(ln->>'uom',''), 'job'); v_gst := coalesce(nullif(ln->>'gst_rate','')::numeric, 18);
        v_hsn := coalesce(nullif(ln->>'hsn',''), '998898'); v_desc := nullif(trim(ln->>'description'),'');
        if v_desc is null then raise exception 'Line %: describe the service', v_n; end if;
      end if;
      v_qty := coalesce(nullif(ln->>'qty','')::numeric, 1);
      if v_qty <= 0 then raise exception 'Line %: enter the quantity', v_n; end if;
    else
      raise exception 'Line %: unknown item type %', v_n, v_kind;
    end if;

    v_rate := round(coalesce(nullif(ln->>'rate','')::numeric, v_list), 2);
    if v_rate is null or v_rate < 0 then raise exception 'Line %: enter the rate', v_n; end if;
    -- counter staff cannot go below the list price by more than the owner's limit
    if v_role = 'sales' and coalesce(v_list, 0) > 0
       and v_rate * (1 - v_disc / 100) < v_list * (1 - v_co.max_sales_discount_pct / 100) - 0.005 then
      raise exception 'Line %: price is more than % below the list rate of ₹% — ask the manager to bill this',
        v_n, fmt_num(v_co.max_sales_discount_pct) || '%', v_list;
    end if;
    if nullif(trim(ln->>'note'),'') is not null then v_desc := v_desc || ' · ' || trim(ln->>'note'); end if;

    v_amt := round(v_qty * v_rate * (1 - v_disc / 100), 2);
    v_sub := v_sub + v_amt;
    insert into sales_lines (doc_id, line_no, line_kind, product_id, log_id, species_id, description, hsn, thickness_in, width_in,
                             length_ft, pieces, qty, uom, rate, discount_pct, amount, gst_rate, unit_cost)
    values (v_id, v_n, v_kind, v_pid, v_lid, v_spid, v_desc, v_hsn, v_t, v_w, v_len, v_pcs, v_qty, v_uom, v_rate, v_disc, v_amt, v_gst, v_cost);

    if v_type = 'invoice' and v_kind <> 'service' then
      insert into stock_moves (move_date, product_id, log_id, length_ft, pieces, qty, unit_cost, ref_type, ref_id, ref_no)
      values (v_date, v_pid, v_lid, v_len, -coalesce(v_pcs, v_qty), -v_qty, v_cost, 'sale', v_id, v_no);
    end if;
  end loop;

  if v_sub <= 0 then raise exception 'Bill amount must be more than zero'; end if;
  if v_doc_disc > v_sub then raise exception 'Discount cannot be more than the bill amount'; end if;
  if v_role = 'sales' and v_doc_disc > round(v_sub * v_co.max_sales_discount_pct / 100, 2) then
    raise exception 'Bill discount is above % percent — ask the manager', fmt_num(v_co.max_sales_discount_pct);
  end if;

  -- spread the bill discount over lines by value (GST is charged on the discounted value), largest line takes the paise
  update sales_lines set taxable = amount - round(v_doc_disc * amount / v_sub, 2) where doc_id = v_id;
  select v_doc_disc - sum(amount - taxable) into v_diff from sales_lines where doc_id = v_id;
  if v_diff <> 0 then
    update sales_lines set taxable = taxable - v_diff
     where id = (select id from sales_lines where doc_id = v_id order by amount desc, line_no limit 1);
  end if;
  update sales_lines set
    cgst = case when v_inter then 0 else round(taxable * gst_rate / 200, 2) end,
    sgst = case when v_inter then 0 else round(taxable * gst_rate / 200, 2) end,
    igst = case when v_inter then round(taxable * gst_rate / 100, 2) else 0 end
   where doc_id = v_id;
  select sum(taxable), sum(cgst), sum(sgst), sum(igst), sum(round(qty * unit_cost, 2))
    into v_taxable, v_cgst, v_sgst, v_igst, v_cost_total from sales_lines where doc_id = v_id;
  v_grand := v_taxable + v_cgst + v_sgst + v_igst;
  v_total := round(v_grand, 0);

  if v_type = 'invoice' then
    v_pay := least(v_pay, v_total);
    if v_total - v_pay > 0 then
      if not v_has_cust then
        raise exception 'Walk-in bills must be paid in full. Choose a customer account to give credit.';
      end if;
      v_bal := party_balance(v_cust.id);
      if v_bal + (v_total - v_pay) > v_cust.credit_limit and not (v_override and v_role in ('owner','manager')) then
        raise exception 'CREDIT_LIMIT|%|%|%', v_cust.name, round(v_bal + v_total - v_pay, 2), v_cust.credit_limit;
      end if;
    end if;
  end if;

  update sales_docs set subtotal = v_sub, taxable = v_taxable, cgst = v_cgst, sgst = v_sgst, igst = v_igst,
                        round_off = v_total - v_grand, total = v_total, cost_total = v_cost_total,
                        commission_amount = case when v_type = 'invoice' then round(v_taxable * v_comm_pct / 100, 2) else 0 end
   where id = v_id;

  if v_type = 'invoice' and v_pay > 0 then
    perform record_payment(jsonb_build_object(
      'direction', 'in', 'party_id', case when v_has_cust then v_cust.id end,
      'party_name', coalesce(nullif(trim(p->>'customer_name'),''), v_cust.name),
      'amount', v_pay, 'mode', coalesce(nullif(p->'payment'->>'mode',''), 'cash'), 'reference', p->'payment'->>'reference',
      'pay_date', v_date, 'purpose', 'sale',
      'allocations', jsonb_build_array(jsonb_build_object('sales_doc_id', v_id, 'amount', v_pay))));
  end if;

  if v_src.id is not null then update sales_docs set status = 'converted' where id = v_src.id; end if;
  if nullif(p->>'enquiry_id','') is not null then
    update enquiries set status = case when v_type = 'invoice' then 'won' else 'quoted' end,
                         quotation_id = case when v_type = 'quotation' then v_id else quotation_id end,
                         handled_by = coalesce(handled_by, auth.uid())
     where id = (p->>'enquiry_id')::uuid;
  end if;

  perform log_audit('create', v_type, v_id, v_no || ' ' || coalesce(nullif(trim(p->>'customer_name'),''), v_cust.name) || ' ₹' || v_total);
  return jsonb_build_object('id', v_id, 'doc_no', v_no, 'total', v_total);
end $$;

-- ───────────────────────── sales returns ─────────────────────────
-- p = { invoice_id, doc_date, reason, restock (default true), lines: [{line_id, pieces | qty}], refund: {mode, reference} }
create or replace function public.post_credit_note(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := require_role('manager','accounts');
  v_inv sales_docs%rowtype;
  v_id uuid := gen_random_uuid(); v_no text;
  v_date date := coalesce(nullif(p->>'doc_date','')::date, today_ist());
  v_restock boolean := coalesce((p->>'restock')::boolean, true);
  e jsonb; v_line sales_lines%rowtype; v_done numeric; v_ret numeric; v_qty numeric; v_frac numeric; v_n int := 0; v_desc text;
  v_taxable numeric; v_cgst numeric; v_sgst numeric; v_igst numeric; v_grand numeric; v_total numeric; v_cost numeric;
  v_due numeric; v_apply numeric; v_rem numeric;
begin
  select * into v_inv from sales_docs where id = nullif(p->>'invoice_id','')::uuid and doc_type = 'invoice' for update;
  if not found or v_inv.status <> 'posted' then raise exception 'Invoice not found or cancelled'; end if;
  if coalesce(trim(p->>'reason'), '') = '' then raise exception 'Give the reason for the return'; end if;
  if jsonb_array_length(coalesce(p->'lines','[]'::jsonb)) = 0 then raise exception 'Pick what is being returned'; end if;
  if v_date < v_inv.doc_date then raise exception 'Return date cannot be before the invoice date'; end if;

  v_no := next_doc_no('credit_note', 'CN', v_date);
  insert into sales_docs (id, doc_type, doc_no, doc_date, customer_id, customer_name, customer_phone, customer_gstin, billing_address,
                          place_of_supply, is_interstate, referred_by, commission_pct, status, source_doc_id, notes, restock)
  values (v_id, 'credit_note', v_no, v_date, v_inv.customer_id, v_inv.customer_name, v_inv.customer_phone, v_inv.customer_gstin,
          v_inv.billing_address, v_inv.place_of_supply, v_inv.is_interstate, v_inv.referred_by, v_inv.commission_pct, 'posted',
          v_inv.id, trim(p->>'reason'), v_restock);

  for e in select * from jsonb_array_elements(p->'lines') loop
    select * into v_line from sales_lines where id = nullif(e->>'line_id','')::uuid and doc_id = v_inv.id;
    if not found then raise exception 'Returned line does not belong to %', v_inv.doc_no; end if;
    select coalesce(sum(case when v_line.line_kind in ('sawn','panel','log') then cl.pieces else cl.qty end), 0) into v_done
      from sales_lines cl join sales_docs cd on cd.id = cl.doc_id
     where cl.source_line_id = v_line.id and cd.status = 'posted';
    if v_line.line_kind in ('sawn','panel','log') then
      v_ret := coalesce(nullif(e->>'pieces','')::numeric, 0);
      continue when v_ret = 0;
      if v_ret < 0 or v_ret <> trunc(v_ret) then raise exception 'Line %: enter whole pieces', v_line.line_no; end if;
      if v_ret > v_line.pieces - v_done then raise exception 'Line %: only % left to return', v_line.line_no, fmt_num(v_line.pieces - v_done); end if;
      v_frac := v_ret / v_line.pieces;
      v_qty := case v_line.line_kind when 'sawn' then sawn_cft(v_line.thickness_in, v_line.width_in, v_line.length_ft, v_ret)
                                     else round(v_line.qty * v_frac, 3) end;
      v_desc := regexp_replace(v_line.description, ' — .*$', '') || ' — ' || fmt_num(v_ret) ||
                case v_line.line_kind when 'sawn' then ' pcs' when 'panel' then ' sheets' else '' end || ' returned';
    else
      v_ret := coalesce(nullif(e->>'qty','')::numeric, 0);
      continue when v_ret = 0;
      if v_ret < 0 or v_ret > v_line.qty - v_done then raise exception 'Line %: only % left to return', v_line.line_no, fmt_num(v_line.qty - v_done); end if;
      v_frac := v_ret / v_line.qty; v_qty := v_ret;
      v_desc := v_line.description || ' — returned';
    end if;
    v_n := v_n + 1;
    insert into sales_lines (doc_id, line_no, line_kind, product_id, log_id, species_id, source_line_id, description, hsn, thickness_in,
                             width_in, length_ft, pieces, qty, uom, rate, discount_pct, amount, taxable, gst_rate, unit_cost)
    values (v_id, v_n, v_line.line_kind, v_line.product_id, v_line.log_id, v_line.species_id, v_line.id, v_desc, v_line.hsn,
            v_line.thickness_in, v_line.width_in, v_line.length_ft,
            case when v_line.line_kind in ('sawn','panel','log') then v_ret end, v_qty, v_line.uom, v_line.rate, v_line.discount_pct,
            round(v_line.amount * v_frac, 2), round(v_line.taxable * v_frac, 2), v_line.gst_rate,
            case when v_restock then v_line.unit_cost else 0 end);

    if v_restock and v_line.line_kind <> 'service' then
      if v_line.line_kind = 'log' then
        update logs set status = 'in_yard' where id = v_line.log_id;
      else
        perform apply_cost_in(v_line.product_id, v_qty, v_line.unit_cost);
        if v_line.line_kind = 'sawn' then perform sawn_stock_add(v_line.product_id, v_line.length_ft, v_ret::int);
        elsif v_line.line_kind = 'panel' then update products set qty_on_hand = qty_on_hand + v_ret where id = v_line.product_id;
        else update products set qty_on_hand = qty_on_hand + v_qty where id = v_line.product_id; end if;
      end if;
      insert into stock_moves (move_date, product_id, log_id, length_ft, pieces, qty, unit_cost, ref_type, ref_id, ref_no)
      values (v_date, v_line.product_id, v_line.log_id, v_line.length_ft, coalesce(case when v_line.line_kind in ('sawn','panel','log') then v_ret end, v_qty),
              v_qty, v_line.unit_cost, 'credit_note', v_id, v_no);
    end if;
  end loop;
  if v_n = 0 then raise exception 'Enter how many pieces are coming back'; end if;

  update sales_lines set
    cgst = case when v_inv.is_interstate then 0 else round(taxable * gst_rate / 200, 2) end,
    sgst = case when v_inv.is_interstate then 0 else round(taxable * gst_rate / 200, 2) end,
    igst = case when v_inv.is_interstate then round(taxable * gst_rate / 100, 2) else 0 end
   where doc_id = v_id;
  select sum(amount), sum(taxable), sum(cgst), sum(sgst), sum(igst), sum(round(qty * unit_cost, 2))
    into v_grand, v_taxable, v_cgst, v_sgst, v_igst, v_cost from sales_lines where doc_id = v_id;
  update sales_docs set subtotal = v_grand, discount = v_grand - v_taxable where id = v_id;
  v_grand := v_taxable + v_cgst + v_sgst + v_igst;
  v_total := round(v_grand, 0);

  -- settle against what is still due on the invoice; the rest is refunded or kept as credit
  v_due := greatest(v_inv.total - v_inv.amount_paid - v_inv.credited_amount, 0);
  v_apply := least(v_due, v_total);
  v_rem := v_total - v_apply;
  update sales_docs set taxable = v_taxable, cgst = v_cgst, sgst = v_sgst, igst = v_igst, round_off = v_total - v_grand,
                        total = v_total, cost_total = v_cost, credited_amount = v_apply,
                        commission_amount = round(v_taxable * v_inv.commission_pct / 100, 2)
   where id = v_id;
  update sales_docs set credited_amount = credited_amount + v_apply where id = v_inv.id;

  if v_rem > 0 then
    if coalesce(p->'refund'->>'mode', '') <> '' then
      perform record_payment(jsonb_build_object(
        'direction', 'out', 'party_id', v_inv.customer_id, 'party_name', v_inv.customer_name, 'amount', v_rem,
        'mode', p->'refund'->>'mode', 'reference', p->'refund'->>'reference', 'pay_date', v_date, 'purpose', 'refund',
        'allocations', jsonb_build_array(jsonb_build_object('sales_doc_id', v_id, 'amount', v_rem))));
    elsif v_inv.customer_id is null then
      raise exception 'This walk-in bill was already paid — choose how ₹% is refunded', v_rem;
    end if;
  end if;

  perform log_audit('create', 'credit_note', v_id, v_no || ' against ' || v_inv.doc_no || ' ₹' || v_total);
  return jsonb_build_object('id', v_id, 'doc_no', v_no, 'total', v_total, 'applied', v_apply, 'refunded_or_credit', v_rem);
end $$;

-- ───────────────────────── cancellation ─────────────────────────
create or replace function public.cancel_sale(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text; v_doc sales_docs%rowtype; r record;
begin
  select * into v_doc from sales_docs where id = p_id for update;
  if not found then raise exception 'Document not found'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for cancelling'; end if;

  if v_doc.doc_type = 'quotation' then
    v_role := require_role('manager','accounts','sales');
    if v_doc.status <> 'open' then raise exception 'Only open quotations can be cancelled'; end if;
    update sales_docs set status = 'cancelled', cancel_reason = p_reason, cancelled_at = now() where id = p_id;
    return;
  end if;

  v_role := require_role('manager');
  if v_doc.status <> 'posted' then raise exception '% is already cancelled', v_doc.doc_no; end if;

  if v_doc.doc_type = 'invoice' then
    if exists (select 1 from sales_docs where source_doc_id = p_id and doc_type = 'credit_note' and status = 'posted') then
      raise exception 'Cancel the returns (credit notes) against % first', v_doc.doc_no;
    end if;
    for r in select * from sales_lines where doc_id = p_id and line_kind <> 'service' loop
      if r.line_kind = 'log' then
        update logs set status = 'in_yard' where id = r.log_id and status = 'sold';
      else
        perform apply_cost_in(r.product_id, r.qty, r.unit_cost);
        if r.line_kind = 'sawn' then perform sawn_stock_add(r.product_id, r.length_ft, r.pieces::int);
        elsif r.line_kind = 'panel' then update products set qty_on_hand = qty_on_hand + r.pieces where id = r.product_id;
        else update products set qty_on_hand = qty_on_hand + r.qty where id = r.product_id; end if;
      end if;
      insert into stock_moves (product_id, log_id, length_ft, pieces, qty, unit_cost, ref_type, ref_id, ref_no, note)
      values (r.product_id, r.log_id, r.length_ft, coalesce(r.pieces, r.qty), r.qty, r.unit_cost, 'sale_cancel', p_id, v_doc.doc_no, p_reason);
    end loop;
  else -- credit note: undo the return
    if v_doc.restock then
      for r in select * from sales_lines where doc_id = p_id and line_kind <> 'service' loop
        if r.line_kind = 'log' then
          update logs set status = 'sold' where id = r.log_id and status = 'in_yard';
          if not found then raise exception 'The returned log has been used since — cannot undo this return'; end if;
        else
          perform apply_cost_out(r.product_id, r.qty, r.unit_cost);
          if r.line_kind = 'sawn' then perform sawn_stock_take(r.product_id, r.length_ft, r.pieces::int);
          elsif r.line_kind = 'panel' then perform product_take(r.product_id, r.pieces);
          else perform product_take(r.product_id, r.qty); end if;
        end if;
        insert into stock_moves (product_id, log_id, length_ft, pieces, qty, unit_cost, ref_type, ref_id, ref_no, note)
        values (r.product_id, r.log_id, r.length_ft, -coalesce(r.pieces, r.qty), -r.qty, r.unit_cost, 'sale_cancel', p_id, v_doc.doc_no, p_reason);
      end loop;
    end if;
    update sales_docs set credited_amount = greatest(credited_amount - v_doc.credited_amount, 0) where id = v_doc.source_doc_id;
  end if;

  -- money: walk-in money is handed back (receipt voided); account customers keep it as an advance
  for r in select a.id, a.payment_id, py.party_id from payment_allocations a join payments py on py.id = a.payment_id
            where a.sales_doc_id = p_id loop
    delete from payment_allocations where id = r.id;
    if r.party_id is null or v_doc.doc_type = 'credit_note' then
      update payments set status = 'void', notes = coalesce(notes || ' · ', '') || 'Reversed with ' || v_doc.doc_no || ' cancellation'
       where id = r.payment_id and status in ('cleared','pending');
    end if;
  end loop;

  update sales_docs set status = 'cancelled', amount_paid = 0, credited_amount = 0, cancel_reason = p_reason, cancelled_at = now(),
                        delivery_status = case when delivery_status = 'delivered' then delivery_status else 'na' end
   where id = p_id;
  perform log_audit('cancel', v_doc.doc_type, p_id, v_doc.doc_no || ': ' || p_reason);
end $$;

-- ───────────────────────── stock housekeeping ─────────────────────────
-- p = { target:'sawn', product_id, length_ft, pieces_delta, reason }
--   | { target:'product', product_id, qty_delta, reason }      (panels: sheets)
--   | { target:'log', log_id, reason }                         (write the log off)
create or replace function public.adjust_stock(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text := require_role('manager'); v_prod products%rowtype; v_log logs%rowtype;
        v_delta numeric; v_len numeric; v_qty numeric; v_reason text := nullif(trim(p->>'reason'),'');
begin
  if v_reason is null then raise exception 'Give a reason for the adjustment'; end if;
  if p->>'target' = 'log' then
    update logs set status = 'written_off', remarks = coalesce(remarks || ' · ', '') || v_reason
     where id = (p->>'log_id')::uuid and status = 'in_yard' returning * into v_log;
    if not found then raise exception 'Log is not in the yard'; end if;
    insert into stock_moves (log_id, pieces, qty, unit_cost, ref_type, note) values (v_log.id, -1, -v_log.cft, v_log.cost_per_cft, 'adjustment', v_reason);
  elsif p->>'target' = 'sawn' then
    select * into v_prod from products where id = (p->>'product_id')::uuid and kind = 'sawn';
    if not found then raise exception 'Unknown timber size'; end if;
    v_len := (p->>'length_ft')::numeric; v_delta := (p->>'pieces_delta')::numeric;
    if coalesce(v_len, 0) <= 0 or coalesce(v_delta, 0) = 0 or v_delta <> trunc(v_delta) then raise exception 'Enter the length and a whole number of pieces'; end if;
    v_qty := sawn_cft(v_prod.thickness_in, v_prod.width_in, v_len, abs(v_delta));
    if v_delta > 0 then perform sawn_stock_add(v_prod.id, v_len, v_delta::int);
    else perform sawn_stock_take(v_prod.id, v_len, (-v_delta)::int); end if;
    insert into stock_moves (product_id, length_ft, pieces, qty, unit_cost, ref_type, note)
    values (v_prod.id, v_len, v_delta, sign(v_delta) * v_qty, v_prod.avg_cost, 'adjustment', v_reason);
  elsif p->>'target' = 'product' then
    select * into v_prod from products where id = (p->>'product_id')::uuid and kind in ('panel','unit','byproduct');
    if not found then raise exception 'Unknown item'; end if;
    v_delta := (p->>'qty_delta')::numeric;
    if coalesce(v_delta, 0) = 0 then raise exception 'Enter the change in quantity'; end if;
    if v_delta > 0 then update products set qty_on_hand = qty_on_hand + v_delta where id = v_prod.id;
    else perform product_take(v_prod.id, -v_delta); end if;
    insert into stock_moves (product_id, pieces, qty, unit_cost, ref_type, note)
    values (v_prod.id, v_delta, case when v_prod.kind = 'panel' then v_delta * v_prod.sheet_sqft else v_delta end, v_prod.avg_cost, 'adjustment', v_reason);
  else
    raise exception 'Unknown adjustment';
  end if;
  perform log_audit('adjust', 'stock', coalesce(v_prod.id, v_log.id), v_reason);
end $$;

create or replace function public.set_log_bay(p_log uuid, p_bay text, p_remarks text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text := require_role('manager','yard');
begin
  update logs set bay = nullif(trim(p_bay), ''), remarks = coalesce(nullif(trim(p_remarks), ''), remarks) where id = p_log;
  if not found then raise exception 'Log not found'; end if;
end $$;

create or replace function public.update_delivery(p_id uuid, p_status text, p_vehicle text default null, p_driver text default null, p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text := require_role('manager','accounts','sales','yard'); v_doc sales_docs%rowtype;
begin
  select * into v_doc from sales_docs where id = p_id and doc_type = 'invoice' and status = 'posted' for update;
  if not found then raise exception 'Invoice not found'; end if;
  if p_status not in ('pending','dispatched','delivered') then raise exception 'Unknown delivery status'; end if;
  if v_doc.delivery_status = 'delivered' and p_status <> 'delivered' then raise exception 'Already delivered'; end if;
  update sales_docs set delivery_mode = 'delivery', delivery_status = p_status,
         vehicle_no = coalesce(nullif(upper(trim(p_vehicle)), ''), vehicle_no),
         driver_name = coalesce(nullif(trim(p_driver), ''), driver_name),
         driver_phone = coalesce(nullif(trim(p_phone), ''), driver_phone),
         dispatched_at = case when p_status in ('dispatched','delivered') then coalesce(dispatched_at, now()) end,
         delivered_at = case when p_status = 'delivered' then now() end
   where id = p_id;
end $$;

-- ───────────────────────── public website ─────────────────────────
create or replace function public.submit_enquiry(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p->>'phone',''), '\D', '', 'g'); v_id uuid;
begin
  if length(v_phone) = 12 and left(v_phone, 2) = '91' then v_phone := right(v_phone, 10); end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Please enter a valid 10-digit mobile number'; end if;
  if length(trim(coalesce(p->>'name',''))) < 2 then raise exception 'Please enter your name'; end if;
  if length(trim(coalesce(p->>'requirement',''))) < 3 then raise exception 'Tell us what you need'; end if;
  if (select count(*) from enquiries where phone = v_phone and created_at > now() - interval '1 day') >= 5
     or (select count(*) from enquiries where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'We have your request — our team will call you shortly';
  end if;
  insert into enquiries (name, phone, email, city, requirement, species_interest, est_cft)
  values (left(trim(p->>'name'), 80), v_phone, left(nullif(trim(p->>'email'),''), 120), left(nullif(trim(p->>'city'),''), 60),
          left(trim(p->>'requirement'), 1500), left(nullif(trim(p->>'species'),''), 80),
          case when coalesce(p->>'est_cft','') ~ '^[0-9]+(\.[0-9]+)?$' then least((p->>'est_cft')::numeric, 99999) end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- What the website may show: business details and live availability (no costs, no customer data)
create or replace function public.public_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  with sawn as (
    select pr.species_id, sum(sawn_cft(pr.thickness_in, pr.width_in, s.length_ft, s.pieces)) as cft, count(distinct pr.id) filter (where s.pieces > 0) as sizes
      from sawn_stock s join products pr on pr.id = s.product_id where s.pieces > 0 group by pr.species_id
  ), lg as (
    select species_id, sum(cft) as cft, count(*) as logs from logs where status = 'in_yard' group by species_id
  )
  select jsonb_build_object(
    'company', (select jsonb_build_object('name', name, 'tagline', tagline, 'address', address, 'city', city, 'state', state_name,
                        'pincode', pincode, 'phone', phone, 'alt_phone', alt_phone, 'whatsapp', whatsapp, 'email', email,
                        'opening_hours', opening_hours, 'map_query', map_query, 'gstin', gstin, 'show_prices', public_show_prices)
                  from company_settings where id = 1),
    'totals', jsonb_build_object(
        'sawn_cft', round(coalesce((select sum(cft) from sawn), 0)),
        'log_cft', round(coalesce((select sum(cft) from lg), 0)),
        'logs', coalesce((select sum(logs) from lg), 0),
        'sizes', coalesce((select sum(sizes) from sawn), 0),
        'species', (select count(*) from species where active and is_public)),
    'species', coalesce((select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'name', sp.name, 'local_name', sp.local_name, 'botanical_name', sp.botanical_name, 'origin', sp.origin,
        'category', sp.category, 'density', sp.density_kg_m3, 'durability', sp.durability, 'uses', sp.uses,
        'description', sp.description, 'color', sp.color_hex, 'grain', sp.grain_hex,
        'sawn_cft', round(coalesce(sawn.cft, 0)), 'log_cft', round(coalesce(lg.cft, 0)), 'sizes', coalesce(sawn.sizes, 0),
        'availability', case when coalesce(sawn.cft, 0) + coalesce(lg.cft, 0) >= 100 then 'in_stock'
                             when coalesce(sawn.cft, 0) + coalesce(lg.cft, 0) > 0 then 'limited' else 'on_order' end,
        'rate_from', case when (select public_show_prices from company_settings where id = 1) then nullif(sp.sawn_rate_cft, 0) end
      ) order by sp.sort_order, sp.name)
      from species sp left join sawn on sawn.species_id = sp.id left join lg on lg.species_id = sp.id
      where sp.active and sp.is_public), '[]'::jsonb)
  )
$$;
