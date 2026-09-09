import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const required = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PAYSTACK_SECRET_KEY'];
const missing = required.filter(k => !process.env[k] || process.env[k].includes('PUT_'));
if (missing.length) console.warn('Missing server environment variables:', missing.join(', '));

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.static(__dirname));

const clean = v => typeof v === 'string' ? v.trim() : '';
const makeOrderNumber = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `BB-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};
const whatsappUrl = order => {
  const lines = [
    '*Bestbite Enterprise Order*', `Order: ${order.order_number}`, '',
    ...(order.order_items || []).map(i => `${i.product_name} x ${i.quantity} — ₦${Number(i.unit_price).toLocaleString()}`),
    '', `Subtotal: ₦${Number(order.subtotal).toLocaleString()}`,
    `Delivery: ₦${Number(order.delivery_fee).toLocaleString()}`,
    `Total: ₦${Number(order.total_amount).toLocaleString()}`,
    `Customer: ${order.customer_name}`, `Phone: ${order.customer_phone}`,
    `Address: ${order.delivery_address}`,
    order.customer_notes ? `Notes: ${order.customer_notes}` : ''
  ].filter(Boolean);
  return `https://wa.me/2349041130288?text=${encodeURIComponent(lines.join('\n'))}`;
};

app.get('/api/health', (req,res) => res.json({ok:true, service:'Bestbite Enterprise'}));

app.get('/api/products', async (req,res) => {
  if (!supabase) return res.status(500).json({error:'Server is not configured'});
  const { data, error } = await supabase.from('products').select('*').eq('is_available', true).order('created_at');
  if (error) return res.status(500).json({error:error.message});
  res.json({products:data});
});

app.post('/api/orders', async (req,res) => {
  try {
    if (!supabase) return res.status(500).json({error:'Server is not configured'});
    const body = req.body || {};
    const customer_name = clean(body.customer_name);
    const customer_email = clean(body.customer_email);
    const customer_phone = clean(body.customer_phone);
    const delivery_address = clean(body.delivery_address);
    const customer_notes = clean(body.notes);
    const payment_method = ['whatsapp','cash_on_delivery','bank_transfer','paystack'].includes(body.payment_method) ? body.payment_method : 'whatsapp';
    if (!customer_name || !customer_phone || !delivery_address) return res.status(400).json({error:'Name, phone and delivery address are required'});
    if (payment_method === 'paystack' && !customer_email) return res.status(400).json({error:'Email is required for Paystack'});
    if (!Array.isArray(body.items) || !body.items.length) return res.status(400).json({error:'Cart is empty'});

    const names = [...new Set(body.items.map(i => clean(i.name)).filter(Boolean))];
    if (!names.length || names.length !== body.items.length) return res.status(400).json({error:'Invalid cart items'});
    const {data: products, error: pe} = await supabase.from('products').select('id,name,price,is_available').in('name', names).eq('is_available', true);
    if (pe) throw pe;
    const byName = new Map((products || []).map(p => [p.name, p]));
    const normalized = [];
    for (const item of body.items) {
      const p = byName.get(clean(item.name));
      const qty = Number(item.qty);
      if (!p || !Number.isInteger(qty) || qty < 1 || qty > 50) return res.status(400).json({error:`Invalid product or quantity: ${item.name}`});
      normalized.push({product_id:p.id, product_name:p.name, quantity:qty, unit_price:Number(p.price)});
    }
    const subtotal = normalized.reduce((s,i)=>s+i.quantity*i.unit_price,0);
    const delivery_fee = subtotal ? 600 : 0;
    const total_amount = subtotal + delivery_fee;

    let customer_id = null;
    const {data: customer} = await supabase.from('customers').insert({name:customer_name,email:customer_email||null,phone:customer_phone,address:delivery_address}).select('id').single();
    if (customer) customer_id = customer.id;

    const order_number = makeOrderNumber();
    const {data: order, error: oe} = await supabase.from('orders').insert({order_number,customer_id,customer_name,customer_email:customer_email||null,customer_phone,delivery_address,customer_notes,subtotal,delivery_fee,total_amount,payment_method,payment_status:'pending',order_status:'new'}).select('*').single();
    if (oe) throw oe;
    const {error: ie} = await supabase.from('order_items').insert(normalized.map(i=>({...i,order_id:order.id})));
    if (ie) throw ie;
    const {data: full, error: fe} = await supabase.from('orders').select('*,order_items(*)').eq('id',order.id).single();
    if (fe) throw fe;
    res.json({order:full, whatsapp_url:whatsappUrl(full)});
  } catch (e) { console.error(e); res.status(500).json({error:e.message || 'Could not create order'}); }
});

app.post('/api/paystack/initialize', async (req,res) => {
  try {
    if (!supabase || !process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY.includes('PUT_')) return res.status(500).json({error:'Paystack server secret is not configured'});
    const order_number = clean(req.body?.order_number);
    const {data: order, error} = await supabase.from('orders').select('*').eq('order_number',order_number).single();
    if (error || !order) return res.status(404).json({error:'Order not found'});
    if (order.payment_method !== 'paystack') return res.status(400).json({error:'Order is not a Paystack order'});
    const callback_url = `${process.env.SITE_URL || 'http://localhost:'+PORT}/payment-complete.html`;
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method:'POST', headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({email:order.customer_email,amount:Number(order.total_amount)*100,currency:'NGN',reference:order.order_number,callback_url,metadata:{order_id:order.id,order_number:order.order_number}})
    });
    const data = await response.json();
    if (!response.ok || !data.status) return res.status(502).json({error:data.message || 'Paystack initialization failed'});
    await supabase.from('orders').update({paystack_reference:data.data.reference}).eq('id',order.id);
    await supabase.from('payments').upsert({order_id:order.id,provider:'paystack',reference:data.data.reference,amount:Number(order.total_amount)*100,currency:'NGN',status:'pending'}, {onConflict:'reference'});
    res.json({authorization_url:data.data.authorization_url,reference:data.data.reference});
  } catch(e){console.error(e);res.status(500).json({error:e.message||'Payment initialization failed'});}
});

async function verifyPaystack(reference){
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`}});
  const data = await response.json();
  if (!response.ok || !data.status) throw new Error(data.message || 'Paystack verification failed');
  const tx = data.data;
  const {data: order, error: oe} = await supabase.from('orders').select('*').eq('order_number',reference).single();
  if (oe || !order) throw new Error('Order for payment reference not found');
  const expected = Number(order.total_amount)*100;
  if (Number(tx.amount) !== expected || tx.currency !== 'NGN') throw new Error('Payment amount/currency does not match the order');
  const paid = tx.status === 'success';
  await supabase.from('payments').upsert({order_id:order.id,provider:'paystack',reference:tx.reference,amount:Number(tx.amount),currency:tx.currency,status:paid?'success':(tx.status||'failed'),gateway_response:tx.gateway_response||null,paid_at:paid?(tx.paid_at||new Date().toISOString()):null,raw_response:tx},{onConflict:'reference'});
  await supabase.from('orders').update({payment_status:paid?'paid':'failed',paystack_reference:tx.reference}).eq('id',order.id);
  return {paid,order_number:order.order_number,transaction:tx};
}

app.get('/api/paystack/verify/:reference', async (req,res)=>{
  try { if(!process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY.includes('PUT_')) return res.status(500).json({error:'Paystack server secret is not configured'}); res.json(await verifyPaystack(clean(req.params.reference))); }
  catch(e){console.error(e);res.status(400).json({error:e.message||'Verification failed'});}
});

app.post('/api/paystack/webhook', async (req,res)=>{
  try {
    if(!process.env.PAYSTACK_SECRET_KEY) return res.sendStatus(500);
    const signature = req.headers['x-paystack-signature'];
    const hash = crypto.createHmac('sha512',process.env.PAYSTACK_SECRET_KEY).update(req.rawBody || Buffer.from(JSON.stringify(req.body))).digest('hex');
    if(!signature || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(hash))) return res.sendStatus(401);
    if(req.body?.event === 'charge.success' && req.body?.data?.reference) await verifyPaystack(req.body.data.reference);
    res.sendStatus(200);
  } catch(e){console.error(e);res.sendStatus(200);}
});

app.get(/.*/, (req,res) => res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT, '0.0.0.0', ()=>console.log(`Bestbite running on port ${PORT}`));
