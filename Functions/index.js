const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
admin.initializeApp();
const SENDGRID_KEY = defineSecret('SENDGRID_KEY');
const FROM_EMAIL = 'belinda@artforcure.org.uk';
const FROM_NAME = 'Belinda - Art for Cure';
// -----------------------------------------------------------
// TRIGGER: New volunteer registered -> send welcome email
// -----------------------------------------------------------
exports.onVolunteerCreated = onDocumentCreated(
  {
    document: 'volunteers/{volunteerId}',
    region: 'europe-west2',
    secrets: [SENDGRID_KEY]
  },
  async (event) => {
    sgMail.setApiKey(SENDGRID_KEY.value());
    const snap = event.data;
    const volunteer = snap.data();
    const { firstName, lastName, email } = volunteer;
    const msg = {
      to: email,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: 'Thank you for volunteering with Art for Cure!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8"/>
          <style>
            body { font-family: Georgia, serif; background: #FAF7F2; margin: 0; padding: 0; }
            .wrapper { max-width: 560px; margin: 40px auto; background: #FFFFFF; border: 1px solid #DDD8D0; }
            .header { background: #FFFFFF; padding: 28px 40px; text-align: center; border-bottom: 1px solid #DDD8D0; }
            .body { padding: 40px; color: #1C1C1C; font-size: 16px; line-height: 1.8; }
            .body h2 { font-size: 26px; font-weight: normal; color: #D30180; margin-bottom: 8px; }
            .body p { margin: 0 0 18px; }
            .footer { padding: 24px 40px; border-top: 1px solid #DDD8D0; font-size: 12px; color: #9B9B9B; font-family: sans-serif; text-align: center; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="header">
              <img src="https://submit.artforcure.org.uk/AFC1.png" alt="Art for Cure" width="160" style="height:auto; max-width:160px; display:inline-block;" />
            </div>
            <div class="body">
              <h2>Dear ${firstName},</h2>
          <p>That is great news! We are so grateful that you have chosen to give your valuable time to volunteer with Art for Cure. Our charity now supports so many support services within East Anglia and women affected by breast cancer as well as UK leading research. Your support to the charity is truly appreciated.</p>
          <p>Volunteers are the beating heart of everything we do, and we cannot run our events without you.</p>
          <p>We look forward to welcoming you and giving you details about our upcoming events and how you can help.</p>
          <p>In the meantime, if you have any questions at all, please do not hesitate to get in touch.</p>
          <p>With the most heartfelt thanks and warm wishes,</p>
          <p><strong>Belinda Gray MBE - Founder</strong><br/>
          <em>Art for Cure</em></p>
            </div>
            <div class="footer">
              Art for Cure &nbsp;|&nbsp; artforcure.org.uk<br/>
              Registered Charity
            </div>
          </div>
        </body>
        </html>
      `
    };
    try {
      await sgMail.send(msg);
      console.log(`Welcome email sent to ${email}`);
    } catch (err) {
      console.error('SendGrid error:', err.response ? err.response.body : err);
    }
  });


// ---------------------------------------------------
// TRIGGER: Bulk email job created -> send to selected volunteers
// ---------------------------------------------------
exports.onBulkEmailCreated = onDocumentCreated(
  {
    document: 'bulkEmails/{jobId}',
    region: 'europe-west2',
    secrets: [SENDGRID_KEY],
  },
  async (event) => {
    sgMail.setApiKey(SENDGRID_KEY.value());
    const snap = event.data;
    const job = snap.data();
 const { subject, message, recipients, createLogins } = job;
    async function getOrCreateLoginLink(email) {
      try {
        await admin.auth().getUserByEmail(email);
      } catch (e) {
        await admin.auth().createUser({ email });
      }
      return admin.auth().generatePasswordResetLink(email, { url: 'https://submit.artforcure.org.uk/login.html' });
    }
    async function ensureLoginAndSendReset(email) {
      try {
        await admin.auth().getUserByEmail(email);
      } catch (e) {
        await admin.auth().createUser({ email });
      }
      const resp = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=AIzaSyCvrAP7gRxzrt-OJKFPMr0ezEY9H4Xw5So', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: email })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);
    }
    function personalize(text, firstName) {
      return text.replace(/\{firstName\}/g, firstName || 'Volunteer').replace(/\n/g, '<br>');
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8"/>
        <style>
          body { font-family: Georgia, serif; background: #FAF7F2; margin: 0; padding: 0; }
          .wrapper { max-width: 560px; margin: 40px auto; background: #FFFFFF; border: 1px solid #DDD8D0; }
          .header { background: #FFFFFF; padding: 28px 40px; text-align: center; border-bottom: 1px solid #DDD8D0; }
          .body { padding: 40px; color: #1C1C1C; font-size: 16px; line-height: 1.8; white-space: pre-wrap; }
          .footer { padding: 24px 40px; border-top: 1px solid #DDD8D0; font-size: 12px; color: #9B9B9B; font-family: sans-serif; text-align: center; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header">
            <img src="https://submit.artforcure.org.uk/AFC1.png" alt="Art for Cure" width="160" style="height:auto; max-width:160px; display:inline-block;" />
          </div>
                <div class="body">__MESSAGE_PLACEHOLDER__</div>
          <div class="footer">
            Art for Cure &nbsp;|&nbsp; artforcure.org.uk<br/>
            Registered Charity
          </div>
        </div>
      </body>
      </html>
    `;

      const messages = [];
    for (const r of recipients) {
      let personalMessage = personalize(message, r.firstName);
      if (createLogins) {
        try {
          const loginLink = await getOrCreateLoginLink(r.email);
          personalMessage += '<br/><br/><a href="' + loginLink + '" style="color:#D30180;font-weight:700">Set up your login to view event details and pick your slots</a>';
        } catch (e) {
          console.error('Login link error for', r.email, e);
        }
      }
      messages.push({
        to: r.email,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: subject,
        html: html.replace('__MESSAGE_PLACEHOLDER__', personalMessage)
      });
    }

    try {
      await sgMail.send(messages);
      await snap.ref.update({ status: 'sent', sentAt: new Date() });
    } catch (e) {
      await snap.ref.update({ status: 'error', error: e.message });
    }
  }
);

// ---------------------------------------------------
// SCHEDULED: Check Shopify for new sales twice daily (12:00 and 22:00 UK time)
// ---------------------------------------------------
exports.checkForNewSales = onSchedule(
  {
    schedule: '0 12,22 * * *',
    timeZone: 'Europe/London',
    region: 'europe-west2',
  },
  async (event) => {
    const db = admin.firestore();

    // Load Shopify integration settings
    const intgDoc = await db.collection('settings').doc('integrations').get();
    if (!intgDoc.exists) { console.warn('No integration settings found — skipping sale check.'); return; }
    const intg = intgDoc.data();
    const { shopifyStore: store, shopifyClientId: clientId, shopifyClientSecret: clientSecret, shopifyWorker } = intg;
    const worker = (shopifyWorker || 'https://holy-hill-e968.alex-7fd.workers.dev').replace(/\/$/, '');
    if (!store || !clientId || !clientSecret) { console.warn('Shopify credentials incomplete — skipping sale check.'); return; }

    // Get a fresh access token
    const tokenRes = await fetch(worker + '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret, shop: store }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) { console.error('Shopify token fetch failed:', tokenData); return; }
    const token = tokenData.access_token;

    // Fetch recent orders
    const ordersRes = await fetch(worker + '/proxy?path=/admin/api/2025-01/orders.json?status=any&limit=100&fields=id,name,line_items', {
      headers: { 'X-Shopify-Access-Token': token, 'X-Shopify-Store': store }
    });
    if (!ordersRes.ok) { console.error('Shopify orders fetch failed:', await ordersRes.text()); return; }
    const ordersData = await ordersRes.json();
    const orders = ordersData.orders || [];

    // Load already-notified sale IDs
    const notifiedSnap = await db.collection('sale_notifications').get();
    const notified = new Set(); notifiedSnap.forEach(d => notified.add(d.id));

    // Build a lookup of Shopify product ID -> submission (artist details)
    const subsSnap = await db.collection('submissions').get();
    const subsByShopifyId = {};
    subsSnap.forEach(d => { const data = d.data(); if (data.shopifyId) subsByShopifyId[String(data.shopifyId)] = data; });

    let newSalesFound = 0;

    for (const order of orders) {
      for (const item of (order.line_items || [])) {
        const orderId = order.id + '_' + item.id;
        if (notified.has(orderId)) continue;
        const matchedSub = subsByShopifyId[String(item.product_id)];
        if (!matchedSub || !matchedSub.artist || !matchedSub.artist.email) continue;

        const price = parseFloat(item.price) || 0;
        try {
          await db.collection('saleEmails').add({
            artistEmail: matchedSub.artist.email,
            artistName: matchedSub.artist.name || 'there',
            pieceName: matchedSub.piece?.name || item.title || 'your piece',
            salePrice: '£' + price.toFixed(2),
            createdAt: new Date(),
            status: 'pending'
          });
          await db.collection('sale_notifications').doc(orderId).set({
            notifiedAt: new Date().toISOString(),
            artistEmail: matchedSub.artist.email,
            artistName: matchedSub.artist.name || '',
            pieceName: matchedSub.piece?.name || item.title || '',
            salePrice: price,
            buyerName: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || 'Unknown',
            submissionId: matchedSub.id || '',
            fulfilled: false
          });
          notified.add(orderId);
          newSalesFound++;
        } catch (e) {
          console.error('Failed to queue sale email for', orderId, e);
        }
      }
    }
    console.log('Sale check complete. New sales notified:', newSalesFound);
  }
);