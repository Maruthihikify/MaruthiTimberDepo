-- GO-LIVE: clears every demo transaction so the depot starts with real data.
-- Keeps: company settings, species & rate card, the product catalogue (stock and cost reset to zero), staff logins.
-- Run:  npx supabase db query --linked --project-ref pozqgnihmzxjtpjioegb -f supabase/purge_demo_data.sql
begin;
delete from public.payment_allocations;
delete from public.payments;
delete from public.expenses;
delete from public.stock_moves;
update public.enquiries set quotation_id = null;
delete from public.enquiries;
delete from public.sales_lines;
delete from public.sales_docs;
delete from public.conversion_outputs;
delete from public.conversion_inputs;
delete from public.conversions;
delete from public.purchase_lines;
delete from public.logs;
delete from public.purchases;
delete from public.sawn_stock;
update public.products set qty_on_hand = 0, avg_cost = 0;
delete from public.parties;
delete from public.doc_counters;
delete from public.audit_log;
commit;
