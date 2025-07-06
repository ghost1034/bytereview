import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import Stripe from "stripe";

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Manual endpoint to check and update incomplete subscriptions
  app.post('/api/check-payments', async (req, res) => {
    try {
      const customers = await stripe.customers.list({
        email: "demo@example.com",
        limit: 1
      });

      if (customers.data.length === 0) {
        return res.json({ message: 'No customer found' });
      }

      const customer = customers.data[0];
      
      // Get incomplete subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'incomplete',
        limit: 10
      });

      let updatedCount = 0;

      for (const sub of subscriptions.data) {
        const expandedSub = await stripe.subscriptions.retrieve(sub.id, {
          expand: ['latest_invoice.payment_intent']
        });
        
        const latestInvoice = expandedSub.latest_invoice as any;
        const paymentIntent = latestInvoice?.payment_intent;
        
        if (paymentIntent?.status === 'succeeded') {
          // Try to activate the subscription
          try {
            await stripe.subscriptions.update(sub.id, {
              default_payment_method: paymentIntent.payment_method
            });
            updatedCount++;
          } catch (error) {
            console.log('Could not update subscription:', sub.id, error);
          }
        }
      }

      res.json({ 
        message: `Checked ${subscriptions.data.length} incomplete subscriptions`,
        updated: updatedCount
      });
    } catch (error: any) {
      console.error('Error checking payments:', error);
      res.status(500).json({ error: error.message });
    }
  });
  

  // Get user subscription status
  app.get("/api/subscription-status", async (req, res) => {
    try {
      // For demo purposes, we'll use a mock user email
      // In a real app, this would come from authenticated user session
      const userEmail = "demo@example.com";
      
      // Find customer by email
      const customers = await stripe.customers.list({
        email: userEmail,
        limit: 1
      });

      if (customers.data.length === 0) {
        return res.json({
          plan: "Free",
          pagesUsed: 3,
          pagesLimit: 10,
          nextBilling: "Upgrade to increase limit",
          status: "active",
          subscriptionId: null
        });
      }

      const customer = customers.data[0];
      
      // Get all subscriptions and check for active or recently paid ones
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 5 // Get more to check recent ones
      });

      // Check for active subscriptions or recently completed payments
      let activeSubscription = null;
      
      for (const sub of subscriptions.data) {
        if (sub.status === 'active') {
          activeSubscription = sub;
          break;
        }
        
        // Check if incomplete subscription has been paid
        if (sub.status === 'incomplete') {
          const expandedSub = await stripe.subscriptions.retrieve(sub.id, {
            expand: ['latest_invoice.payment_intent']
          });
          
          const latestInvoice = expandedSub.latest_invoice as any;
          const paymentIntent = latestInvoice?.payment_intent;
          
          if (paymentIntent?.status === 'succeeded') {
            // Payment succeeded, try to update subscription
            try {
              await stripe.subscriptions.update(sub.id, {
                default_payment_method: paymentIntent.payment_method
              });
              activeSubscription = await stripe.subscriptions.retrieve(sub.id);
              break;
            } catch (error) {
              console.log('Could not update subscription:', error);
            }
          }
        }
      }

      if (!activeSubscription) {
        return res.json({
          plan: "Free",
          pagesUsed: 3,
          pagesLimit: 10,
          nextBilling: "Upgrade to increase limit",
          status: "active",
          subscriptionId: null
        });
      }

      const subscription = activeSubscription;
      const priceId = subscription.items.data[0].price.id;
      
      // Determine plan based on price ID
      let planName = "Unknown";
      let pageLimit = 10;
      
      if (priceId === process.env.STRIPE_PRICE_ID_BASIC) {
        planName = "Basic";
        pageLimit = 100;
      } else if (priceId === process.env.STRIPE_PRICE_ID_PROFESSIONAL) {
        planName = "Professional";
        pageLimit = 1000;
      }

      // Get billing information from the latest invoice
      let nextBilling = "N/A";
      
      try {
        const latestInvoice = await stripe.invoices.retrieve(subscription.latest_invoice as string);
        
        // For paid subscriptions, calculate next billing based on billing cycle anchor
        if (latestInvoice.status === 'paid' && subscription.billing_cycle_anchor) {
          const nextBillingDate = new Date(subscription.billing_cycle_anchor * 1000);
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          nextBilling = nextBillingDate.toLocaleDateString();
        } else if (subscription.billing_cycle_anchor) {
          // Fallback for any other case
          const nextBillingDate = new Date(subscription.billing_cycle_anchor * 1000);
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          nextBilling = nextBillingDate.toLocaleDateString();
        }
      } catch (error) {
        console.log('Could not retrieve billing information:', error);
        // Last resort: use current date + 1 month
        const nextBillingDate = new Date();
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        nextBilling = nextBillingDate.toLocaleDateString();
      }

      const price = subscription.items.data[0]?.price;

      return res.json({
        plan: planName,
        pagesUsed: 3, // TODO: Track actual usage
        pagesLimit: pageLimit,
        nextBilling: nextBilling,
        status: subscription.status,
        subscriptionId: subscription.id,
        amount: price ? (price.unit_amount || 0) / 100 : 0,
        currency: price?.currency || 'usd'
      });

    } catch (error: any) {
      console.error('Subscription status error:', error);
      res.status(500).json({ error: "Failed to fetch subscription status" });
    }
  });

  // Create subscription route
  app.post("/api/create-subscription", async (req, res) => {
    try {
      const { priceId } = req.body;
      
      if (!priceId) {
        return res.status(400).json({ error: "Price ID is required" });
      }

      // Basic validation for Stripe price ID format
      if (!priceId.startsWith('price_')) {
        return res.status(400).json({ error: "Invalid price ID format" });
      }
      
      console.log('Creating subscription with priceId:', priceId);

      // Check if customer already exists
      let customer;
      const existingCustomers = await stripe.customers.list({
        email: 'demo@example.com',
        limit: 1
      });
      
      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await stripe.customers.create({
          email: 'demo@example.com',
          name: 'Demo User',
          metadata: {
            userId: 'demo_user'
          }
        });
      }

      try {
        // Create checkout session instead of direct subscription
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          payment_method_types: ['card'],
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          customer: customer.id,
          success_url: `${req.headers.origin || 'http://localhost:5000'}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin || 'http://localhost:5000'}/pricing`,
        });

        console.log('Checkout session created:', session.id);
        
        return res.json({
          checkoutUrl: session.url,
          sessionId: session.id
        });
      } catch (stripeError: any) {
        console.error('Stripe API error:', stripeError);
        throw new Error(`Stripe error: ${stripeError.message}`);
      }
    } catch (error: any) {
      console.error('Subscription creation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel subscription route
  app.post("/api/cancel-subscription", async (req, res) => {
    try {
      const { subscriptionId } = req.body;
      
      if (!subscriptionId) {
        return res.status(400).json({ error: "Subscription ID is required" });
      }

      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      res.json({ 
        success: true, 
        message: "Subscription will be cancelled at the end of the billing period",
        subscription 
      });
    } catch (error: any) {
      console.error('Subscription cancellation error:', error);
      res.status(500).json({ error: error.message });
    }
  });



  const httpServer = createServer(app);

  return httpServer;
}
