\set ON_ERROR_STOP 1
\pset pager off
\t on
create schema if not exists t;
grant usage on schema t to authenticated, anon;
create or replace function t.expect_error(q text, pat text) returns text language plpgsql as $$
begin
  execute q;
  raise exception 'EXPECTED-ERROR /%/ but it succeeded: %', pat, q;
exception when others then
  if sqlerrm like 'EXPECTED-ERROR%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'WRONG-ERROR for %: got "%" expected /%/', q, sqlerrm, pat; end if;
  return 'ok  error: ' || left(sqlerrm, 100);
end $$;
create or replace function t.eq(a numeric, b numeric, label text) returns text language plpgsql as $$
begin
  if a is distinct from b then raise exception 'ASSERT FAILED % : got % expected %', label, a, b; end if;
  return 'ok  ' || label || ' = ' || a;
end $$;
create or replace function t.near(a numeric, b numeric, tol numeric, label text) returns text language plpgsql as $$
begin
  if a is null or abs(a - b) > tol then raise exception 'ASSERT FAILED % : got % expected % ±%', label, a, b, tol; end if;
  return 'ok  ' || label || ' ≈ ' || a;
end $$;
grant execute on all functions in schema t to authenticated, anon;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000001', 'owner@x'), ('00000000-0000-0000-0000-000000000002', 'sales@x'),
 ('00000000-0000-0000-0000-000000000003', 'yard@x'), ('00000000-0000-0000-0000-000000000004', 'stranger@x');
insert into profiles (id, full_name, role) values
 ('00000000-0000-0000-0000-000000000001', 'Owner', 'owner'), ('00000000-0000-0000-0000-000000000002', 'Counter', 'sales'),
 ('00000000-0000-0000-0000-000000000003', 'Yard', 'yard');
update company_settings set gstin = '29ABCDE1234F1Z5', max_sales_discount_pct = 10;

-- ══════════ owner ══════════
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

insert into species (id, name, log_rate_cft, sawn_rate_cft, color_hex) values
 ('10000000-0000-0000-0000-000000000001', 'Ghana Teak', 3800, 4200, '#B8742F'),
 ('10000000-0000-0000-0000-000000000002', 'Sal', 1500, 1900, '#8B4A2B');
insert into products (id, kind, name, panel_length_ft, panel_width_ft, thickness_mm, uom, hsn, sale_rate) values
 ('20000000-0000-0000-0000-000000000001', 'panel', '18mm BWP Plywood 8×4', 8, 4, 18, 'sqft', '4412', 95);
insert into products (id, kind, name, uom, hsn, sale_rate, gst_rate) values
 ('20000000-0000-0000-0000-000000000002', 'service', 'Cutting / sizing charges', 'job', '998898', 300, 18),
 ('20000000-0000-0000-0000-000000000003', 'byproduct', 'Firewood (off-cuts)', 'kg', '4401', 6, 5);
insert into parties (id, name, is_customer, is_supplier, state_code) values ('30000000-0000-0000-0000-000000000001', 'Coastal Timber Imports', false, true, '29');
insert into parties (id, name, is_customer, credit_limit, credit_days, phone) values ('30000000-0000-0000-0000-000000000002', 'Shree Builders', true, 200000, 30, '9876543210');
insert into parties (id, name, is_customer, credit_limit) values ('30000000-0000-0000-0000-000000000003', 'No-Credit Customer', true, 0);
insert into parties (id, name, is_customer, is_carpenter, commission_pct) values ('30000000-0000-0000-0000-000000000004', 'Ramesh Mestri', false, true, 2);
insert into parties (id, name, is_customer, gstin, state_code, credit_limit) values ('30000000-0000-0000-0000-000000000005', 'Chennai Interiors', true, '33AAACC1234D1Z9', '33', 500000);

\echo '── purchase'
select post_purchase('{
  "supplier_id":"30000000-0000-0000-0000-000000000001","bill_no":"CTI/889","permit_no":"KFD-TP-2231","vehicle_no":"ka01ab1234",
  "freight":5000,"unloading":1000,
  "lines":[
   {"line_kind":"log","species_id":"10000000-0000-0000-0000-000000000001","log_no":"GT-101","length_ft":12,"girth_in":60,"bark_allowance_in":2,"rate":3000},
   {"line_kind":"log","species_id":"10000000-0000-0000-0000-000000000001","log_no":"GT-102","length_ft":10,"girth_in":52,"rate":3000},
   {"line_kind":"sawn","species_id":"10000000-0000-0000-0000-000000000001","grade":"A","thickness_in":5,"width_in":3,"length_ft":8,"pieces":20,"rate":3200},
   {"line_kind":"panel","product_id":"20000000-0000-0000-0000-000000000001","pieces":10,"rate":70}
  ],
  "payment":{"amount":50000,"mode":"bank","reference":"NEFT123"}}'::jsonb);
select t.eq((select cft from logs where log_no='GT-101'), 17.521, 'Hoppus GT-101');
select t.eq((select cft from logs where log_no='GT-102'), 11.736, 'Hoppus GT-102');
select t.eq((select subtotal from purchases limit 1), 163505.40, 'purchase subtotal');
select t.eq((select cgst from purchases limit 1), 14715.49, 'purchase CGST');
select t.eq((select total from purchases limit 1), 198936, 'purchase total');
select t.eq((select round_off from purchases limit 1), -0.38, 'purchase round off');
select t.eq((select amount_paid from purchases limit 1), 50000, 'purchase paid');
select t.near((select sum(qty * landed_unit_cost) from purchase_lines), 169505.40, 0.2, 'landed value = subtotal + charges');
select t.eq((select pieces from sawn_stock), 20, 'sawn stock pcs');
select t.eq((select qty_on_hand from products where kind='panel'), 10, 'plywood sheets');
select t.eq(party_balance('30000000-0000-0000-0000-000000000001'), -148936, 'supplier balance (we owe)');
select ref_no from purchases;

\echo '── sawmill conversion'
select post_conversion(jsonb_build_object(
  'logs', jsonb_build_array((select id from logs where log_no='GT-101')),
  'outputs', '[{"species_id":"10000000-0000-0000-0000-000000000001","grade":"A","thickness_in":4,"width_in":2,"length_ft":10,"pieces":12},
               {"species_id":"10000000-0000-0000-0000-000000000001","grade":"A","thickness_in":6,"width_in":2,"length_ft":8,"pieces":5}]'::jsonb,
  'processing_cost', 1500, 'firewood_kg', 200, 'operator', 'Manju'));
select t.eq((select output_cft from conversions), 10.000, 'conversion output CFT');
select t.eq((select yield_pct from conversions), 57.07, 'yield %');
select t.eq((select byproduct_value from conversions), 1200, 'firewood credit');
select t.near((select cost_per_cft from conversions), ((select input_cost from conversions) + 300) / 10, 0.01, 'cost per CFT');
select t.eq((select (status = 'sawn')::int from logs where log_no='GT-101'), 1, 'log marked sawn');
select t.eq((select qty_on_hand from products where kind='byproduct'), 200, 'firewood stock kg');
select t.expect_error($$select post_conversion(jsonb_build_object('logs', jsonb_build_array((select id from logs where log_no='GT-102')),
  'outputs', '[{"species_id":"10000000-0000-0000-0000-000000000001","thickness_in":6,"width_in":6,"length_ft":10,"pieces":10}]'::jsonb))$$, 'physically');
select t.expect_error($$select post_conversion(jsonb_build_object('logs', jsonb_build_array((select id from logs where log_no='GT-101')),
  'outputs', '[{"species_id":"10000000-0000-0000-0000-000000000001","thickness_in":2,"width_in":2,"length_ft":10,"pieces":1}]'::jsonb))$$, 'no longer in the yard');

\echo '── invoice with discount, carpenter, part payment'
select post_sale(jsonb_build_object('doc_type','invoice','customer_id','30000000-0000-0000-0000-000000000002',
  'referred_by','30000000-0000-0000-0000-000000000004','discount',500,
  'delivery_mode','delivery','delivery_address','Site, Whitefield',
  'lines', jsonb_build_array(
     jsonb_build_object('line_kind','sawn','product_id',(select id from products where kind='sawn' and thickness_in=5),'length_ft',8,'pieces',5,'rate',4200),
     jsonb_build_object('line_kind','panel','product_id','20000000-0000-0000-0000-000000000001','pieces',2,'rate',95),
     jsonb_build_object('line_kind','service','product_id','20000000-0000-0000-0000-000000000002','qty',1,'rate',300)),
  'payment', jsonb_build_object('amount',10000,'mode','upi','reference','UPI-77')));
select t.eq((select subtotal from sales_docs where doc_type='invoice'), 23881.40, 'invoice subtotal');
select t.eq((select taxable from sales_docs where doc_type='invoice'), 23381.40, 'invoice taxable after discount');
select t.eq((select l.taxable from sales_lines l join sales_docs d on d.id=l.doc_id where d.doc_type='invoice' and l.line_no=1), 17134.98, 'line 1 taxable');
select t.eq((select cgst from sales_docs where doc_type='invoice'), 2104.32, 'invoice CGST');
select t.eq((select sgst from sales_docs where doc_type='invoice'), 2104.32, 'invoice SGST');
select t.eq((select total from sales_docs where doc_type='invoice'), 27590, 'invoice total');
select t.eq((select round_off from sales_docs where doc_type='invoice'), -0.04, 'invoice round off');
select t.eq((select commission_amount from sales_docs where doc_type='invoice'), 467.63, 'carpenter commission 2%');
select t.eq((select amount_paid from sales_docs where doc_type='invoice'), 10000, 'invoice paid');
select t.eq((select pieces from sawn_stock s join products p on p.id=s.product_id where p.thickness_in=5), 15, 'stock after sale');
select t.eq((select qty_on_hand from products where kind='panel'), 8, 'plywood after sale');
select doc_no, due_date - doc_date as credit_days, delivery_status from sales_docs where doc_type='invoice';

\echo '── controls'
select t.expect_error($$select post_sale(jsonb_build_object('customer_id','30000000-0000-0000-0000-000000000003',
  'lines', jsonb_build_array(jsonb_build_object('line_kind','sawn','product_id',(select id from products where kind='sawn' and thickness_in=5),'length_ft',8,'pieces',1,'rate',4200))))$$, '^CREDIT_LIMIT\|No-Credit');
select t.expect_error($$select post_sale(jsonb_build_object('customer_name','Walk in',
  'lines', jsonb_build_array(jsonb_build_object('line_kind','sawn','product_id',(select id from products where kind='sawn' and thickness_in=5),'length_ft',8,'pieces',1,'rate',4200)),
  'payment', jsonb_build_object('amount',100,'mode','cash')))$$, 'Walk-in bills must be paid in full');
select t.expect_error($$select post_sale(jsonb_build_object('customer_name','Walk in',
  'lines', jsonb_build_array(jsonb_build_object('line_kind','sawn','product_id',(select id from products where kind='sawn' and thickness_in=5),'length_ft',8,'pieces',100,'rate',4200)),
  'payment', jsonb_build_object('amount',999999,'mode','cash')))$$, 'Only 15 pcs');
select t.expect_error($$select post_sale(jsonb_build_object('customer_name','Walk in','customer_gstin','29BADGSTIN',
  'lines', jsonb_build_array(jsonb_build_object('line_kind','service','description','x','qty',1,'rate',10))))$$, 'not valid');
-- owner may override the credit limit
select (post_sale(jsonb_build_object('customer_id','30000000-0000-0000-0000-000000000003','override_credit',true,
  'lines', jsonb_build_array(jsonb_build_object('line_kind','sawn','product_id',(select id from products where kind='sawn' and thickness_in=5),'length_ft',8,'pieces',1,'rate',4200)))))->>'doc_no' as override_invoice;

\echo '── counter staff (sales role)'
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select t.expect_error($$select post_sale(jsonb_build_object('customer_name','Walk in',
  'lines', jsonb_build_array(jsonb_build_object('line_kind','sawn','product_id',(select id from products where kind='sawn' and thickness_in=5),'length_ft',8,'pieces',1,'rate',3500)),
  'payment', jsonb_build_object('amount',99999,'mode','cash')))$$, 'below the list rate');
select t.expect_error($$select post_sale(jsonb_build_object('customer_id','30000000-0000-0000-0000-000000000003','override_credit',true,
  'lines', jsonb_build_array(jsonb_build_object('line_kind','sawn','product_id',(select id from products where kind='sawn' and thickness_in=5),'length_ft',8,'pieces',1,'rate',4200))))$$, 'CREDIT_LIMIT');
select (post_sale(jsonb_build_object('customer_name','Walk in Ravi','customer_phone','9000000001',
  'lines', jsonb_build_array(jsonb_build_object('line_kind','sawn','product_id',(select id from products where kind='sawn' and thickness_in=5),'length_ft',8,'pieces',1,'rate',3800)),
  'payment', jsonb_build_object('amount',99999,'mode','cash'))))->>'total' as walkin_total;
select t.eq((select amount_paid from sales_docs where customer_name='Walk in Ravi'), (select total from sales_docs where customer_name='Walk in Ravi'), 'walk-in paid in full (capped)');
select t.expect_error($$select post_purchase('{}'::jsonb)$$, 'not allowed');
select t.eq((select count(*) from purchases), 0, 'sales role cannot read purchases');
select t.eq((select count(*) from payments where direction='out'), 0, 'sales role cannot read payments out');

\echo '── yard role'
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select t.expect_error($$select post_sale('{"lines":[{}]}'::jsonb)$$, 'not allowed');
select t.eq(((dashboard_snapshot()->'month'->>'gross_profit') is null)::int, 1, 'yard sees no profit');

\echo '── stranger (signed in, no staff profile)'
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select t.eq((select count(*) from parties), 0, 'stranger reads no parties');
select t.eq((select count(*) from v_party_balances), 0, 'stranger reads no balances');
select t.expect_error($$select dashboard_snapshot()$$, 'sign in');

\echo '── returns, receipts, cheques (owner)'
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select post_credit_note(jsonb_build_object('invoice_id',(select id from sales_docs where doc_type='invoice' and customer_id='30000000-0000-0000-0000-000000000002'),
  'reason','2 pieces not used at site',
  'lines', jsonb_build_array(jsonb_build_object('line_id',(select l.id from sales_lines l join sales_docs d on d.id=l.doc_id where d.customer_id='30000000-0000-0000-0000-000000000002' and d.doc_type='invoice' and l.line_no=1),'pieces',2))));
select t.eq((select taxable from sales_docs where doc_type='credit_note'), 6853.99, 'credit note taxable');
select t.eq((select total from sales_docs where doc_type='credit_note'), 8088, 'credit note total');
select t.eq((select commission_amount from sales_docs where doc_type='credit_note'), 137.08, 'commission reversed on return');
select t.eq((select credited_amount from sales_docs where doc_type='invoice' and customer_id='30000000-0000-0000-0000-000000000002'), 8088, 'credit applied to invoice');
select t.eq((select pieces from sawn_stock s join products p on p.id=s.product_id where p.thickness_in=5), 15 - 1 - 1 + 2, 'stock after return');
select t.expect_error($$select post_credit_note(jsonb_build_object('invoice_id',(select id from sales_docs where doc_type='invoice' and customer_id='30000000-0000-0000-0000-000000000002'),
  'reason','again','lines', jsonb_build_array(jsonb_build_object('line_id',(select l.id from sales_lines l join sales_docs d on d.id=l.doc_id where d.customer_id='30000000-0000-0000-0000-000000000002' and d.doc_type='invoice' and l.line_no=1),'pieces',4))))$$, 'only 3 left');

select record_payment('{"direction":"in","party_id":"30000000-0000-0000-0000-000000000002","amount":5000,"mode":"cash","auto_allocate":true}'::jsonb);
select t.eq((select total - amount_paid - credited_amount from sales_docs where doc_type='invoice' and customer_id='30000000-0000-0000-0000-000000000002'), 4502, 'due after cash receipt');
select record_payment('{"direction":"in","party_id":"30000000-0000-0000-0000-000000000002","amount":4502,"mode":"cheque","reference":"CHQ 445566","auto_allocate":true}'::jsonb);
select t.eq((select total - amount_paid - credited_amount from sales_docs where doc_type='invoice' and customer_id='30000000-0000-0000-0000-000000000002'), 0, 'due after cheque');
select set_payment_status((select id from payments where reference='CHQ 445566'), 'bounced', 'Insufficient funds');
select t.eq((select total - amount_paid - credited_amount from sales_docs where doc_type='invoice' and customer_id='30000000-0000-0000-0000-000000000002'), 4502, 'due back after bounce');
select t.eq(party_balance('30000000-0000-0000-0000-000000000002'), 4502, 'customer balance = outstanding');
select t.eq(party_balance('30000000-0000-0000-0000-000000000004'), -330.55, 'carpenter commission due');
select t.eq((select balance from v_party_balances where party_id='30000000-0000-0000-0000-000000000002'), 4502, 'view balance matches');
select t.expect_error($$select record_payment(('{"direction":"in","party_id":"30000000-0000-0000-0000-000000000002","amount":50000,"mode":"cash","allocations":[{"sales_doc_id":"'||(select id from sales_docs where doc_type='invoice' and customer_id='30000000-0000-0000-0000-000000000002')||'","amount":50000}]}')::jsonb)$$, 'is due on');

\echo '── inter-state IGST and cancellation'
select post_sale(jsonb_build_object('customer_id','30000000-0000-0000-0000-000000000005',
  'lines', jsonb_build_array(jsonb_build_object('line_kind','sawn','product_id',(select id from products where kind='sawn' and thickness_in=5),'length_ft',8,'pieces',1,'rate',4200))));
select t.eq((select igst from sales_docs where customer_id='30000000-0000-0000-0000-000000000005'), 629.75, 'IGST for Tamil Nadu');
select t.eq((select cgst from sales_docs where customer_id='30000000-0000-0000-0000-000000000005'), 0, 'no CGST inter-state');
select t.eq((select total from sales_docs where customer_id='30000000-0000-0000-0000-000000000005'), 4128, 'IGST invoice total');
select cancel_sale((select id from sales_docs where customer_id='30000000-0000-0000-0000-000000000005'), 'Customer changed order');
select t.eq((select pieces from sawn_stock s join products p on p.id=s.product_id where p.thickness_in=5), 15, 'stock restored on cancel');
select t.expect_error($$select cancel_sale((select id from sales_docs where doc_type='invoice' and customer_id='30000000-0000-0000-0000-000000000002'), 'x')$$, 'credit notes');

\echo '── log sale, quotation conversion'
select post_sale(jsonb_build_object('doc_type','quotation','customer_id','30000000-0000-0000-0000-000000000002',
  'lines', jsonb_build_array(jsonb_build_object('line_kind','log','log_id',(select id from logs where log_no='GT-102')))));
select t.eq((select (status = 'in_yard')::int from logs where log_no='GT-102'), 1, 'quotation does not touch stock');
select post_sale(jsonb_build_object('customer_id','30000000-0000-0000-0000-000000000002','source_doc_id',(select id from sales_docs where doc_type='quotation'),
  'lines', jsonb_build_array(jsonb_build_object('line_kind','log','log_id',(select id from logs where log_no='GT-102')))));
select t.eq((select (status = 'converted')::int from sales_docs where doc_type='quotation'), 1, 'quotation converted');
select t.eq((select (status = 'sold')::int from logs where log_no='GT-102'), 1, 'log sold');
select t.eq((select qty from sales_lines where line_kind='log' and doc_id in (select id from sales_docs where doc_type='invoice')), 11.736, 'log billed by Hoppus CFT');
select t.expect_error($$select post_sale(jsonb_build_object('customer_id','30000000-0000-0000-0000-000000000002','source_doc_id',(select id from sales_docs where doc_type='quotation'),
  'lines', jsonb_build_array(jsonb_build_object('line_kind','service','description','x','qty',1,'rate',10))))$$, 'already been converted');

\echo '── numbering'
select doc_type, doc_no from sales_docs order by created_at;

\echo '── reports'
select jsonb_pretty(report_gst(today_ist() - 1, today_ist() + 1) - 'b2b');
select jsonb_pretty(report_ageing());
select jsonb_pretty(report_profit(today_ist() - 30, today_ist()) - 'monthly' - 'by_kind');
select jsonb_pretty(report_daybook(today_ist(), today_ist()) - 'rows');
select jsonb_pretty(report_commissions(today_ist() - 30, today_ist()));
select jsonb_pretty(party_ledger('30000000-0000-0000-0000-000000000002', today_ist() - 30, today_ist()) - 'party');
select jsonb_pretty(dashboard_snapshot() - 'trend' - 'recent');

\echo '── website (anon)'
reset request.jwt.claim.sub;
set role anon;
select t.expect_error($$select count(*) from parties$$, 'permission denied');
select t.expect_error($$select post_sale('{}'::jsonb)$$, 'permission denied');
select jsonb_pretty(public_catalog() - 'species');
select submit_enquiry('{"name":"Anil","phone":"+91 98450 12345","requirement":"Teak door frame 5x3 for 3 doors","species":"Teak","est_cft":"12"}'::jsonb);
select t.expect_error($$select submit_enquiry('{"name":"A","phone":"12345","requirement":"x"}'::jsonb)$$, 'mobile');
reset role;
select name, phone, est_cft from enquiries;
\echo 'ALL SCENARIOS PASSED'
