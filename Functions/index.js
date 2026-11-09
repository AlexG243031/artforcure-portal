const { onDocumentCreated, onDocumentWritten, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');
const { buildCertificatePdf, certificateFields } = require('./certificate');
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
// TRIGGER: Sale detected -> email the artist
// ---------------------------------------------------
exports.saleEmails = onDocumentCreated(
  {
    document: 'saleEmails/{jobId}',
    region: 'europe-west2',
    secrets: [SENDGRID_KEY],
  },
  async (event) => {
    sgMail.setApiKey(SENDGRID_KEY.value());
    const snap = event.data;
    const job = snap.data();
    const { artistEmail, artistName, pieceName, salePrice, buyerName, buyerEmail, buyerPhone, buyerAddr } = job;
    // Exhibition sales: 'collect' = buyer collects from the exhibition (no artist action);
    // 'delivery' + switched = an exhibition sale later switched to "Artist delivers".
    const saleType = job.saleType || 'online';
    const exhibitionName = job.exhibitionName || '';
    const exhibitionEnd = job.exhibitionEnd || '';
    const switched = !!job.switched;
    const isCollect = saleType === 'collect';
    const endText = exhibitionEnd ? new Date(exhibitionEnd + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    if (!artistEmail) { console.warn('saleEmails doc missing artistEmail — skipping', event.params.jobId); return; }

    const buyerRows = [
      buyerName  ? `<p style="margin:0 0 4px"><strong>Name:</strong> ${buyerName}</p>`  : '',
      buyerEmail ? `<p style="margin:0 0 4px"><strong>Email:</strong> ${buyerEmail}</p>` : '',
      buyerPhone ? `<p style="margin:0 0 4px"><strong>Mobile:</strong> ${buyerPhone}</p>` : '',
      buyerAddr  ? `<p style="margin:0"><strong>Address:</strong> ${buyerAddr}</p>`      : '',
    ].filter(Boolean).join('');

    const msg = {
      to: artistEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: switched ? `Please arrange delivery — "${pieceName}"`
             : isCollect ? `Great news — "${pieceName}" has sold at ${exhibitionName}!`
             : `Great news — "${pieceName}" has sold!`,
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
            .price-box { background: #FAF7F2; border: 1px solid #DDD8D0; border-radius: 4px; padding: 16px 20px; margin: 0 0 18px; font-size: 18px; color: #D30180; font-weight: bold; }
            .buyer-box { background: #FAF7F2; border: 1px solid #DDD8D0; border-radius: 4px; padding: 16px 20px; margin: 0 0 18px; font-size: 14px; }
            .buyer-box p { margin: 0 0 4px; }
            .cta { display: inline-block; background: #D30180; color: #FFFFFF !important; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-family: sans-serif; font-size: 14px; font-weight: 700; }
            .footer { padding: 24px 40px; border-top: 1px solid #DDD8D0; font-size: 12px; color: #9B9B9B; font-family: sans-serif; text-align: center; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="header">
              <img src="https://submit.artforcure.org.uk/AFC1.png" alt="Art for Cure" width="160" style="height:auto; max-width:160px; display:inline-block;" />
            </div>
            <div class="body">
              <h2>Dear ${artistName || 'there'},</h2>
              ${isCollect ? `
              <p>Wonderful news — your piece <strong>${pieceName}</strong> has sold at <strong>${exhibitionName}</strong>!</p>
              <div class="price-box">Sale price: ${salePrice}</div>
              <p>The buyer will collect the piece from the exhibition, so there is no need for you to contact them or arrange delivery.</p>
              <p>Once the piece has been collected, Art for Cure will confirm this and raise your invoice. Payment follows collection${endText ? ` — for most pieces this will be after the exhibition closes on ${endText}` : ''}.</p>
              <p>You can see this sale in the artist portal at any time.</p>` : `
              ${switched
                ? `<p>Your piece <strong>${pieceName}</strong>, sold at <strong>${exhibitionName || 'the exhibition'}</strong>, is to be delivered directly to the buyer rather than collected from the exhibition.</p>`
                : `<p>Wonderful news — your piece <strong>${pieceName}</strong> has just sold!</p>`}
              <div class="price-box">Sale price: ${salePrice}</div>
              ${buyerRows ? `<p><strong>Buyer contact details:</strong></p><div class="buyer-box">${buyerRows}</div><p>Please contact the buyer directly to arrange delivery (and let them know of any delivery fee), then confirm in the portal once you've been in touch.</p>` : ''}
              <p>Please log in to the artist portal to view the full details of this sale, confirm you've contacted the buyer, and mark it as fulfilled once it has been delivered.</p>`}
              <p style="text-align:center;margin:28px 0"><a class="cta" href="https://submit.artforcure.org.uk/?tab=sales" target="_blank">View My Sales</a></p>
              <p>Thank you for supporting Art for Cure with your wonderful work.</p>
              <p>With warm wishes,<br/><strong>Art for Cure</strong></p>
            </div>
            <div class="footer">
              Art for Cure &nbsp;|&nbsp; artforcure.org.uk<br/>
              Registered Charity 1175161
            </div>
          </div>
        </body>
        </html>
      `
    };

    const salesTeamMsg = {
      to: 'sales@artforcure.org.uk',
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Sale concluded — "${pieceName}" (${artistName || 'artist'})`,
      html: `
        <p>A sale has just gone through and the artist has been notified.</p>
        <p><strong>Artist:</strong> ${artistName || ''} (${artistEmail})<br/>
        <strong>Piece:</strong> ${pieceName}<br/>
        <strong>Sale price:</strong> ${salePrice}
        ${job.placedVia ? `<br/><strong>Placed via:</strong> ${job.placedVia}` : ''}
        ${exhibitionName ? `<br/><strong>Exhibition:</strong> ${exhibitionName} (${isCollect ? 'buyer collects' : 'artist delivers'})` : ''}</p>
        ${isCollect && job.placedVia === 'Website checkout' ? `<p style="color:#b45309"><strong>Check:</strong> this exhibition sale came through the website checkout. If the buyer isn't collecting from the exhibition, open the sale in the portal and click <em>Change to "Artist delivers"</em>.</p>` : ''}
        ${buyerRows ? `<p><strong>Buyer:</strong></p>${buyerRows}` : ''}
      `
    };

    // Send the artist email first.
    let artistSendOk = true;
    try {
      await sgMail.send(msg);
      console.log(`Sale email sent to ${artistEmail} for "${pieceName}"`);
    } catch (err) {
      artistSendOk = false;
      console.error('SendGrid error (artist email):', err.response ? err.response.body : err);
    }

    // Always attempt the sales-team notification too — this must not depend on
    // the artist email, or on the Firestore status write below, succeeding.
    // (Skipped for a "switched to Artist delivers" follow-up — sales@ already had the sale.)
    try {
      if (!switched) {
        await sgMail.send(salesTeamMsg);
        console.log(`Sale-concluded email sent to sales@artforcure.org.uk for "${pieceName}"`);
      }
    } catch (err) {
      console.error('SendGrid error (sales team email):', err.response ? err.response.body : err);
    }

    // Record the outcome last, and never let a Firestore write failure crash the function.
    try {
      await snap.ref.update(
        artistSendOk ? { status: 'sent', sentAt: new Date() } : { status: 'error', error: 'artist email send failed — see logs' }
      );
    } catch (err) {
      console.error(`Firestore status update failed for saleEmails/${event.params.jobId}:`, err.message);
    }
  }
);

// ---------------------------------------------------
// TRIGGER: Artist confirmed they've contacted the buyer -> alert the sales team
// ---------------------------------------------------
exports.buyerContactedAlerts = onDocumentCreated(
  {
    document: 'buyerContactedAlerts/{jobId}',
    region: 'europe-west2',
    secrets: [SENDGRID_KEY],
  },
  async (event) => {
    sgMail.setApiKey(SENDGRID_KEY.value());
    const snap = event.data;
    const job = snap.data();
    const { artistName, artistEmail, pieceName, buyerName, salePrice } = job;

    const msg = {
      to: 'sales@artforcure.org.uk',
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Buyer contacted — "${pieceName}" (${artistName || 'artist'})`,
      html: `
        <p><strong>${artistName || 'The artist'}</strong> (${artistEmail || ''}) has confirmed they've contacted the buyer${buyerName ? ' ('+buyerName+')' : ''} about the sale of <strong>${pieceName}</strong>${salePrice ? ' ('+salePrice+')' : ''}.</p>
      `
    };
    try {
      await sgMail.send(msg);
      await snap.ref.update({ status: 'sent', sentAt: new Date() });
      console.log(`Buyer-contacted alert sent for "${pieceName}"`);
    } catch (err) {
      console.error('SendGrid error (buyer-contacted alert):', err.response ? err.response.body : err);
      await snap.ref.update({ status: 'error', error: err.message });
    }
  }
);

// -----------------------------------------------------------
// TRIGGER: Admin marks an invoice as paid -> email the artist
// -----------------------------------------------------------
exports.paymentConfirmedEmails = onDocumentCreated(
  {
    document: 'paymentEmails/{jobId}',
    region: 'europe-west2',
    secrets: [SENDGRID_KEY],
  },
  async (event) => {
    sgMail.setApiKey(SENDGRID_KEY.value());
    const snap = event.data;
    const job = snap.data();
    const { artistEmail, artistName, pieceName, amountOwed, invoiceNumber, paidAt } = job;
    if (!artistEmail) { console.warn('paymentEmails doc missing artistEmail — skipping', event.params.jobId); return; }

    const msg = {
      to: artistEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Payment sent — "${pieceName}"`,
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
            .price-box { background: #FAF7F2; border: 1px solid #DDD8D0; border-radius: 4px; padding: 16px 20px; margin: 0 0 18px; font-size: 18px; color: #2a7a50; font-weight: bold; }
            .cta { display: inline-block; background: #D30180; color: #FFFFFF !important; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-family: sans-serif; font-size: 14px; font-weight: 700; }
            .footer { padding: 24px 40px; border-top: 1px solid #DDD8D0; font-size: 12px; color: #9B9B9B; font-family: sans-serif; text-align: center; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="header">
              <img src="https://submit.artforcure.org.uk/AFC1.png" alt="Art for Cure" width="160" style="height:auto; max-width:160px; display:inline-block;" />
            </div>
            <div class="body">
              <h2>Dear ${artistName || 'there'},</h2>
              <p>Great news — your payment for <strong>${pieceName}</strong> has been sent.</p>
              <div class="price-box">Amount paid: ${amountOwed}</div>
              <p>Invoice reference: <strong>${invoiceNumber || ''}</strong>${paidAt ? ` &middot; Paid: ${paidAt}` : ''}</p>
              <p>Please log in to the artist portal to view or print a copy of this invoice for your records.</p>
              <p style="text-align:center;margin:28px 0"><a class="cta" href="https://submit.artforcure.org.uk/?tab=invoices" target="_blank">View My Invoices</a></p>
              <p>Thank you for supporting Art for Cure with your wonderful work.</p>
              <p>With warm wishes,<br/><strong>Art for Cure</strong></p>
            </div>
            <div class="footer">
              Art for Cure &nbsp;|&nbsp; artforcure.org.uk<br/>
              Registered Charity 1175161
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await sgMail.send(msg);
      console.log(`Payment-confirmed email sent to ${artistEmail} for "${pieceName}"`);
    } catch (err) {
      console.error('SendGrid error (payment confirmed email):', err.response ? err.response.body : err);
    }

    try {
      await snap.ref.update({ status: 'sent', sentAt: new Date() });
    } catch (err) {
      console.error(`Firestore status update failed for paymentEmails/${event.params.jobId}:`, err.message);
    }
  }
);

// ---------------------------------------------------
// SCHEDULED: Check Shopify for new sales twice daily (12:00 and 22:00 UK time)
// ---------------------------------------------------
exports.checkForNewSales = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Europe/London',
    region: 'europe-west2',
  },
  async (event) => {
    const db = admin.firestore();

    // Certificates only go out for orders placed after the certificate feature was switched
    // on — otherwise the first run would send certificates for every historic order.
    const certSettingsRef = db.collection('settings').doc('certificates');
    const certSettings = await certSettingsRef.get();
    let certStart = certSettings.exists && certSettings.data().startAt;
    if (!certStart) { certStart = new Date().toISOString(); await certSettingsRef.set({ startAt: certStart }, { merge: true }); }

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

    // Fetch recent orders (customer field gives us buyer name/email/phone/address)
    const ordersRes = await fetch(worker + '/proxy?path=/admin/api/2025-01/orders.json?status=any&limit=100&fields=id,name,email,created_at,source_name,line_items,customer', {
      headers: { 'X-Shopify-Access-Token': token, 'X-Shopify-Store': store }
    });
    if (!ordersRes.ok) { console.error('Shopify orders fetch failed:', await ordersRes.text()); return; }
    const ordersData = await ordersRes.json();
    const orders = ordersData.orders || [];

    // Exhibitions (Settings → Exhibitions): sales on or between an exhibition's dates are
    // exhibition sales — the buyer collects from the exhibition by default.
    const exSnap = await db.collection('settings').doc('exhibitions').get();
    const exhibitions = (exSnap.exists && exSnap.data().list) || [];
    const exhibitionFor = (iso) => {
      if (!iso) return null;
      const day = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
      return exhibitions.find(e => e.start && e.end && e.start <= day && day <= e.end) || null;
    };

    // Load already-notified sale IDs
    const notifiedSnap = await db.collection('sale_notifications').get();
    const notified = new Set(); notifiedSnap.forEach(d => notified.add(d.id));

    // Build a lookup of Shopify product ID -> submission (artist details)
    const subsSnap = await db.collection('submissions').get();
    const subsByShopifyId = {};
    // Keep the document id with the data so each sale records which submission it was
    // (previously the id was dropped, leaving submissionId blank on every sale).
    subsSnap.forEach(d => { const data = d.data(); if (data.shopifyId) subsByShopifyId[String(data.shopifyId)] = { id: d.id, ...data }; });

    // Orders that already have a certificate job (or a "no portal record" alert)
    const certSnap = await db.collection('certificates').select().get();
    const certDone = new Set(); certSnap.forEach(d => certDone.add(d.id));

    let newSalesFound = 0;

    for (const order of orders) {
      const customer = order.customer || {};
      const addr = customer.default_address || {};
      const buyerName = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Unknown';
      const buyerEmail = customer.email || order.email || '';
      const certEligible = order.created_at && new Date(order.created_at) >= new Date(certStart);
      const ex = exhibitionFor(order.created_at);
      // How the order was placed — shown on the sales@ email so online orders during an
      // exhibition stand out (Shopify doesn't record which collection the buyer browsed).
      const src = order.source_name || '';
      const placedVia = src === 'web' ? 'Website checkout'
        : src === 'shopify_draft_order' ? 'Created by Art for Cure staff (Orders tab)'
        : src === 'pos' ? 'Shopify POS'
        : src ? src : 'Unknown';
      const exFields = ex
        ? { saleType: 'collect', exhibitionId: ex.id, exhibitionName: ex.name || '', exhibitionEnd: ex.end || '' }
        : { saleType: 'online' };
      const buyerPhone = customer.phone || addr.phone || '';
      const buyerAddr = [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean).join(', ');

      for (const item of (order.line_items || [])) {
        const orderId = order.id + '_' + item.id;
        if (notified.has(orderId)) continue;
        const matchedSub = subsByShopifyId[String(item.product_id)];
        if (!matchedSub || !matchedSub.artist || !matchedSub.artist.email) {
          // Not a portal piece — no data for a certificate, so tell sales@ once instead.
          if (certEligible && !certDone.has(orderId)) {
            await db.collection('certificates').doc(orderId).set({
              status: 'no_portal_record', orderNo: order.name || '', pieceName: item.title || '',
              buyerName, buyerEmail, createdAt: new Date().toISOString() });
            certDone.add(orderId);
          }
          continue;
        }

        const price = parseFloat(item.price) || 0;
        try {
          await db.collection('saleEmails').add({
            artistEmail: matchedSub.artist.email,
            artistName: matchedSub.artist.name || 'there',
            pieceName: matchedSub.piece?.name || item.title || 'your piece',
            salePrice: '£' + price.toFixed(2),
            buyerName, buyerEmail, buyerPhone, buyerAddr,
            ...exFields, placedVia,
            createdAt: new Date(),
            status: 'pending'
          });
          await db.collection('sale_notifications').doc(orderId).set({
            notifiedAt: new Date().toISOString(),
            artistEmail: matchedSub.artist.email,
            artistName: matchedSub.artist.name || '',
            pieceName: matchedSub.piece?.name || item.title || '',
            salePrice: price,
            buyerName, buyerEmail, buyerPhone, buyerAddr,
            submissionId: matchedSub.id || '',
            ...exFields, placedVia,
            fulfilled: false,
            buyerContacted: false
          });
          notified.add(orderId);
          newSalesFound++;

          if (certEligible && !certDone.has(orderId)) {
            const qty = parseInt(item.quantity) || 1;
            const discount = (item.discount_allocations || []).reduce((t, a) => t + (parseFloat(a.amount) || 0), 0);
            const paid = Math.max(0, price * qty - discount);
            await db.collection('certificates').doc(orderId).set({
              status: 'pending', saleId: orderId, submissionId: matchedSub.id || '',
              orderNo: order.name || '', orderDate: order.created_at || '',
              buyerName, buyerEmail, listPrice: price * qty, pricePaid: paid,
              createdAt: new Date().toISOString() });
            certDone.add(orderId);
          }
        } catch (e) {
          console.error('Failed to queue sale email for', orderId, e);
        }
      }
    }
    console.log('Sale check complete. New sales notified:', newSalesFound);
  }
);

// ---------------------------------------------------
// SCHEDULED: Weekly nudge to all Current Artists -> update their gallery
// Runs every Monday at 9am UK time. "Current Artists" = every distinct
// artist email/name found across submissions (mirrors the logic in
// loadCurrentArtistsList() on the portal's Current Artists tab).
// Queues a job on the existing bulkEmails collection so it reuses the
// onBulkEmailCreated sender/template above rather than duplicating it.
// ---------------------------------------------------
exports.weeklyArtistNudge = onSchedule(
  {
    schedule: '0 9 * * 1',
    timeZone: 'Europe/London',
    region: 'europe-west2',
  },
  async (event) => {
    const db = admin.firestore();

    const subsSnap = await db.collection('submissions').get();
    const byEmail = {};
    subsSnap.forEach(d => {
      const data = d.data();
      const email = (data.artist?.email || '').toLowerCase().trim();
      const name = data.artist?.name || '';
      if (!email || !name) return;
      if (!byEmail[email]) byEmail[email] = { email, firstName: name.split(' ')[0] };
    });
    const recipients = Object.values(byEmail);

    if (!recipients.length) {
      console.log('weeklyArtistNudge: no current artists found — nothing to send.');
      return;
    }

    await db.collection('bulkEmails').add({
      subject: 'A quick update for your Art for Cure gallery',
      message: `Hi {firstName},

Just a quick nudge — if you've got new pieces ready, now's a great time to add them to your gallery.

<a href="https://submit.artforcure.org.uk/?tab=submit" style="color:#D30180;font-weight:700">Update My Gallery &rarr;</a>

Thank you for supporting Art for Cure with your wonderful work.`,
      recipients,
      createLogins: false,
      source: 'weeklyArtistNudge',
      createdAt: new Date(),
      status: 'pending',
    });

    console.log(`weeklyArtistNudge: queued bulk email to ${recipients.length} artist(s).`);
  }
);

// -----------------------------------------------------------
// TRIGGER: Artist changes their own bio -> alert Alex
// (admin edits made "on behalf of" an artist are ignored)
// -----------------------------------------------------------
exports.bioUpdateAlert = onDocumentWritten(
  {
    document: 'artists/{artistId}',
    region: 'europe-west2',
    secrets: [SENDGRID_KEY],
  },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : {};
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return;                                   // profile deleted
    const oldBio = (before.bio || '').trim();
    const newBio = (after.bio || '').trim();
    if (!newBio || oldBio === newBio) return;             // bio didn't change
    if (after.lastEditedBy !== 'artist') return;          // made by an admin

    sgMail.setApiKey(SENDGRID_KEY.value());
    const name = after.name || 'An artist';
    const msg = {
      to: 'alex@artforcure.org.uk',
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Bio updated — ${name}`,
      html: `
        <p><strong>${name}</strong>${after.email ? ' (' + after.email + ')' : ''} has updated their bio in the artist portal.</p>
        <p><a href="https://submit.artforcure.org.uk">Log in to the portal</a> to review it.</p>
      `
    };
    try {
      await sgMail.send(msg);
      console.log(`Bio update alert sent for ${name}`);
    } catch (err) {
      console.error('SendGrid error (bio update alert):', err.response ? err.response.body : err);
    }
  }
);

// ---------------------------------------------------
// TRIGGER: certificate job created by checkForNewSales ->
// build the Certificate of Authenticity & Receipt PDF, store it,
// email it to the buyer (BCC sales@) and link it on the sale.
// A 'no_portal_record' job just alerts sales@ instead.
// ---------------------------------------------------
const SALES_EMAIL = 'sales@artforcure.org.uk';
const LOGO_URL = 'https://submit.artforcure.org.uk/AFC1.png';

async function fetchBuffer(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch (e) { return null; }
}

const gbp = n => '£' + (Number(n) || 0).toFixed(2);
const ukDate = iso => {
  const dt = iso ? new Date(iso) : new Date();
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
};

exports.generateCertificate = onDocumentCreated(
  {
    document: 'certificates/{orderId}',
    region: 'europe-west2',
    secrets: [SENDGRID_KEY],
    memory: '512MiB',
  },
  async (event) => {
    sgMail.setApiKey(SENDGRID_KEY.value());
    const db = admin.firestore();
    const ref = event.data.ref;
    const job = event.data.data();

    if (job.status === 'no_portal_record') {
      await sgMail.send({
        to: SALES_EMAIL,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `No certificate sent — order ${job.orderNo} ("${job.pieceName}")`,
        html: `<p>Order <strong>${job.orderNo}</strong> includes <strong>${job.pieceName}</strong>, which isn't linked to a piece in the submission portal, so no Certificate of Authenticity could be produced.</p>
               <p>Buyer: ${job.buyerName || '—'} (${job.buyerEmail || 'no email'})</p>
               <p>If this buyer should have a certificate, please arrange one manually.</p>`,
      });
      await ref.update({ status: 'alerted', alertedAt: new Date().toISOString() });
      return;
    }

    try {
      // Piece and artist details from the portal
      const subSnap = job.submissionId ? await db.collection('submissions').doc(job.submissionId).get() : null;
      if (!subSnap || !subSnap.exists) throw new Error('Submission not found: ' + job.submissionId);
      const sub = subSnap.data();

      // Sequential certificate number
      const counterRef = db.collection('counters').doc('certificates');
      const seq = await db.runTransaction(async t => {
        const c = await t.get(counterRef);
        const next = ((c.exists && c.data().next) || 1);
        t.set(counterRef, { next: next + 1 }, { merge: true });
        return next;
      });
      const certNo = 'AFC-COA-' + String(seq).padStart(5, '0');

      // Art for Cure's share: what the buyer paid less what the artist is owed
      const c = parseFloat(sub.commission);
      const comm = (!isNaN(c) && c > 0) ? c : (sub.category === 'Sculpture' ? 30 : 50);
      const artistShare = (Number(job.listPrice) || 0) * (100 - comm) / 100;
      const supports = Math.max(0, (Number(job.pricePaid) || 0) - artistShare);

      const fields = certificateFields(sub, job);
      const firstImage = (sub.images || []).find(i => i && i.url);
      const [logo, artwork] = await Promise.all([
        fetchBuffer(LOGO_URL),
        firstImage ? fetchBuffer(firstImage.url) : Promise.resolve(null),
      ]);

      const pdf = await buildCertificatePdf({
        certNo, ...fields,
        date: ukDate(job.orderDate), buyer: job.buyerName || '', orderNo: job.orderNo || '',
        pricePaid: gbp(job.pricePaid), supports: supports > 0 ? gbp(supports) : '',
      }, { logo, artwork });

      // Store the PDF (unguessable download link, saved on the sale for the portal's button)
      const token = crypto.randomUUID();
      const filePath = `certificates/${certNo}.pdf`;
      const bucket = admin.storage().bucket();
      await bucket.file(filePath).save(pdf, { contentType: 'application/pdf',
        metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;

      // Email the buyer (or sales@ if no buyer email)
      const to = job.buyerEmail || SALES_EMAIL;
      const firstName = (job.buyerName || '').split(' ')[0];
      await sgMail.send({
        to,
        ...(job.buyerEmail && job.buyerEmail.toLowerCase() !== SALES_EMAIL ? { bcc: SALES_EMAIL } : {}),
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Your Certificate of Authenticity — "${fields.title}"`,
        html: `<div style="font-family:'Century Gothic',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1F1F1F;line-height:1.6">
          <div style="text-align:center;padding:24px 0"><img src="${LOGO_URL}" alt="Art for Cure" width="160"/></div>
          ${job.buyerEmail ? '' : '<p style="color:#b00"><strong>No buyer email on this order — please print or forward this certificate.</strong></p>'}
          <p>Dear ${firstName || 'collector'},</p>
          <p>Thank you for buying <strong>${fields.title}</strong> by <strong>${fields.artist}</strong> from Art for Cure.</p>
          <p>Attached is your Certificate of Authenticity, which also serves as your receipt. Please keep it with the artwork as a record of its provenance.</p>
          ${supports > 0 ? `<p>${gbp(supports)} of your purchase supports the work of Art for Cure — thank you.</p>` : ''}
          <p>With warm wishes,<br/><strong>Belinda Gray MBE</strong><br/>Founder, Art for Cure</p>
          <p style="font-size:12px;color:#6B6B6B;border-top:1px solid #eee;padding-top:12px;margin-top:24px">Art for Cure · Registered charity no. 1175161 · Bredfield House, Bredfield, Woodbridge, Suffolk, IP13 6AA</p>
        </div>`,
        attachments: [{ content: pdf.toString('base64'), filename: `Art for Cure Certificate ${certNo}.pdf`,
          type: 'application/pdf', disposition: 'attachment' }],
      });

      const sentAt = new Date().toISOString();
      await ref.update({ status: 'sent', certificateNumber: certNo, certificateUrl: url, emailedTo: to, sentAt });
      await db.collection('sale_notifications').doc(event.params.orderId).set({
        certificateNumber: certNo, certificateUrl: url, certificateEmailedTo: to, certificateSentAt: sentAt,
      }, { merge: true });
      console.log(`Certificate ${certNo} sent to ${to} for order ${job.orderNo}`);
    } catch (e) {
      console.error('Certificate failed for', event.params.orderId, e);
      await ref.update({ status: 'error', error: String(e.message || e) });
      await sgMail.send({
        to: SALES_EMAIL, from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Certificate could not be produced — order ${job.orderNo}`,
        html: `<p>The Certificate of Authenticity for order <strong>${job.orderNo}</strong> could not be produced.</p><p>Error: ${String(e.message || e)}</p>`,
      }).catch(() => {});
    }
  }
);

// ---------------------------------------------------
// TRIGGER: an exhibition sale switched from "Collected at exhibition" to
// "Artist delivers" in the portal -> email the artist the buyer's details and
// the usual delivery instructions (reuses the saleEmails sender).
// ---------------------------------------------------
exports.onSaleTypeChanged = onDocumentUpdated(
  {
    document: 'sale_notifications/{saleId}',
    region: 'europe-west2',
  },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (!(before.saleType === 'collect' && after.saleType === 'delivery')) return;
    await admin.firestore().collection('saleEmails').add({
      artistEmail: after.artistEmail || '',
      artistName: after.artistName || 'there',
      pieceName: after.pieceName || 'your piece',
      salePrice: '£' + (Number(after.salePrice) || 0).toFixed(2),
      buyerName: after.buyerName || '', buyerEmail: after.buyerEmail || '',
      buyerPhone: after.buyerPhone || '', buyerAddr: after.buyerAddr || '',
      saleType: 'delivery', switched: true,
      exhibitionName: after.exhibitionName || '', exhibitionEnd: after.exhibitionEnd || '',
      createdAt: new Date(), status: 'pending',
    });
    console.log(`Sale ${event.params.saleId} switched to Artist delivers — artist emailed.`);
  }
);
