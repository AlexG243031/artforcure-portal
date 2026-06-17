const { onDocumentCreated } = require('firebase-functions/v2/firestore');
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
              <p>What wonderful news! We are absolutely thrilled and deeply grateful that you have chosen to give your precious time to volunteer with Art for Cure. It truly means the world to us.</p>
              <p>Volunteers like you are the beating heart of everything we do. Without your generosity and warmth, our events simply would not be the magical, life-affirming occasions they are — occasions that bring art, beauty, and hope to those who need it most.</p>
              <p>We are so very much looking forward to welcoming you into the Art for Cure family. Ahead of our next event, we will be in touch to let you know the details and to find out when you might be available. There is no pressure at all — we understand life is busy — and every hour you are able to give will be treasured.</p>
              <p>In the meantime, if you have any questions at all, please do not hesitate to get in touch. We are always delighted to hear from you.</p>
              <p>With the most heartfelt thanks and warm wishes,</p>
              <p><strong>Belinda</strong><br/>
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
