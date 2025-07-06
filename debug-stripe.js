import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function debugSubscriptions() {
  try {
    // Find customer by email
    const customers = await stripe.customers.list({
      email: "demo@example.com",
      limit: 1
    });

    if (customers.data.length === 0) {
      console.log('No customer found with email demo@example.com');
      return;
    }

    const customer = customers.data[0];
    console.log('Customer ID:', customer.id);

    // Get all subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      limit: 10
    });

    console.log('\n=== All Subscriptions ===');
    for (const sub of subscriptions.data) {
      console.log(`Subscription ${sub.id}:`);
      console.log(`  Status: ${sub.status}`);
      console.log(`  Created: ${new Date(sub.created * 1000).toLocaleString()}`);
      console.log(`  Available fields:`, Object.keys(sub));
      
      // Get full subscription details
      const fullSub = await stripe.subscriptions.retrieve(sub.id);
      console.log(`  Billing Cycle Anchor: ${new Date(fullSub.billing_cycle_anchor * 1000).toLocaleString()}`);
      console.log(`  Full subscription fields:`, Object.keys(fullSub));
      
      // Get expanded details
      const expandedSub = await stripe.subscriptions.retrieve(sub.id, {
        expand: ['latest_invoice.payment_intent']
      });
      
      const latestInvoice = expandedSub.latest_invoice;
      if (latestInvoice) {
        console.log(`  Latest Invoice: ${latestInvoice.id}`);
        console.log(`  Invoice Status: ${latestInvoice.status}`);
        console.log(`  Invoice Amount: ${latestInvoice.amount_due / 100} ${latestInvoice.currency.toUpperCase()}`);
        console.log(`  Invoice Period Start: ${latestInvoice.period_start ? new Date(latestInvoice.period_start * 1000).toLocaleString() : 'N/A'}`);
        console.log(`  Invoice Period End: ${latestInvoice.period_end ? new Date(latestInvoice.period_end * 1000).toLocaleString() : 'N/A'}`);
        
        const paymentIntent = latestInvoice.payment_intent;
        if (paymentIntent) {
          console.log(`  Payment Intent: ${paymentIntent.id}`);
          console.log(`  Payment Status: ${paymentIntent.status}`);
          console.log(`  Payment Amount: ${paymentIntent.amount / 100} ${paymentIntent.currency.toUpperCase()}`);
          if (paymentIntent.last_payment_error) {
            console.log(`  Payment Error: ${paymentIntent.last_payment_error.message}`);
          }
        } else {
          console.log(`  No Payment Intent found for this invoice`);
        }
      }
      console.log('---');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugSubscriptions();