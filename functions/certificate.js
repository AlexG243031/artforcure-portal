// ---------------------------------------------------------------------------
// Art for Cure — Certificate of Authenticity and Receipt (PDF builder)
// Used by the generateCertificate Cloud Function in index.js.
//
// Fonts and the signature live in functions/private/ which is git-ignored, so they are
// deployed with the functions but never published to the public GitHub repo:
//   private/GOTHIC.TTF, private/GOTHICB.TTF, private/GOTHICI.TTF   (Century Gothic)
//   private/signature.png   (Belinda's signature — optional; typed name used if missing)
// ---------------------------------------------------------------------------
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const PINK = '#D30582', INK = '#1F1F1F', GREY = '#6B6B6B', RULE = '#E6C2D6', TINT = '#FBF1F6';
const MM = 72 / 25.4;
const PRIVATE_DIR = path.join(__dirname, 'private');

function fontPath(file) {
  const p = path.join(PRIVATE_DIR, file);
  return fs.existsSync(p) ? p : null;
}

function signatureBuffer() {
  const p = path.join(PRIVATE_DIR, 'signature.png');
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

// d = { certNo, title, artist, category, medium, dimensions, edition, framing,
//       date, buyer, orderNo, pricePaid, supports }     (all strings, already formatted)
// assets = { logo: Buffer, artwork: Buffer|null }
function buildCertificatePdf(d, assets) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
      Title: `Art for Cure — Certificate ${d.certNo}`, Author: 'Art for Cure' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const reg = fontPath('GOTHIC.TTF'), bold = fontPath('GOTHICB.TTF'), ital = fontPath('GOTHICI.TTF');
    doc.registerFont('R', reg || 'Helvetica');
    doc.registerFont('B', bold || 'Helvetica-Bold');
    doc.registerFont('I', ital || 'Helvetica-Oblique');

    const W = doc.page.width, H = doc.page.height;
    const L = 26 * MM, R = W - 26 * MM, CW = R - L;

    // Border
    doc.lineWidth(1.6).strokeColor(PINK).rect(12 * MM, 12 * MM, W - 24 * MM, H - 24 * MM).stroke();
    doc.lineWidth(0.5).strokeColor(RULE).rect(15 * MM, 15 * MM, W - 30 * MM, H - 30 * MM).stroke();

    // Logo
    let y = 24 * MM;
    if (assets.logo) {
      const lw = 52 * MM;
      doc.image(assets.logo, (W - lw) / 2, y, { width: lw });
      y += lw * 133 / 288 + 8 * MM;
    }

    // Title block
    doc.font('B').fontSize(20).fillColor(PINK).text('Certificate of Authenticity', L, y, { width: CW, align: 'center' });
    y += 9 * MM;
    doc.font('R').fontSize(11.5).fillColor(GREY).text('and Receipt of Purchase', L, y, { width: CW, align: 'center' });
    y += 6 * MM;
    doc.font('R').fontSize(8.5).text(`Certificate no. ${d.certNo}`, L, y, { width: CW, align: 'center' });
    y += 10 * MM;

    const section = (title) => {
      doc.font('B').fontSize(10).fillColor(PINK).text(title.toUpperCase(), L, y);
      doc.lineWidth(0.6).strokeColor(RULE).moveTo(L, y + 4.5 * MM).lineTo(R, y + 4.5 * MM).stroke();
      y += 8 * MM;
    };
    // Label/value row inside a column starting at x with width w
    const row = (x, w, label, value, isBold) => {
      if (!value) return;
      const lw = 34 * MM, vw = w - lw;
      doc.font(isBold ? 'B' : 'R').fontSize(10.5);
      const h = doc.heightOfString(value, { width: vw });
      doc.font('R').fontSize(9).fillColor(GREY).text(label, x, y + 1, { width: lw });
      doc.font(isBold ? 'B' : 'R').fontSize(10.5).fillColor(INK).text(value, x + lw, y, { width: vw });
      y += Math.max(h, 12) + 2.6 * MM;
    };

    // ---- The artwork: photo on the left, details on the right ----
    section('The artwork');
    const top = y;
    let detailX = L, detailW = CW;
    if (assets.artwork) {
      const box = 58 * MM;
      try {
        doc.image(assets.artwork, L, top, { fit: [box, box], align: 'center', valign: 'top' });
        detailX = L + box + 8 * MM; detailW = R - detailX;
      } catch (e) { /* unreadable image — carry on without it */ }
    }
    row(detailX, detailW, 'Title', d.title, true);
    row(detailX, detailW, 'Artist', d.artist);
    row(detailX, detailW, 'Category', d.category);
    row(detailX, detailW, 'Medium', d.medium);
    row(detailX, detailW, 'Dimensions', d.dimensions);
    row(detailX, detailW, 'Edition', d.edition);
    row(detailX, detailW, 'Framing', d.framing);
    if (detailX !== L) y = Math.max(y, top + 58 * MM + 2 * MM);
    y += 4 * MM;

    // ---- The purchase ----
    section('The purchase');
    row(L, CW, 'Date of purchase', d.date);
    row(L, CW, 'Purchased by', d.buyer);
    row(L, CW, 'Order number', d.orderNo);
    row(L, CW, 'Price paid', d.pricePaid, true);

    if (d.supports) {
      y += 1 * MM;
      doc.roundedRect(L, y, CW, 11 * MM, 3 * MM).fill(TINT);
      doc.font('B').fontSize(10).fillColor(PINK)
        .text(`${d.supports} of this purchase supports the work of Art for Cure. Thank you.`, L, y + 3.6 * MM, { width: CW, align: 'center' });
      y += 17 * MM;
    }

    // ---- Statement ----
    doc.font('R').fontSize(9.5).fillColor(INK);
    const stmt = `Art for Cure certifies that the artwork described above is an original work by ${d.artist}, ` +
      `supplied directly by the artist and sold by Art for Cure on the artist's behalf. ` +
      `Please keep this certificate with the artwork as a record of its provenance.`;
    doc.text(stmt, L, y, { width: CW, lineGap: 2.5 });
    y += doc.heightOfString(stmt, { width: CW, lineGap: 2.5 }) + 6 * MM;

    // ---- Signature ----
    const sigY = Math.max(y + 16 * MM, H - 58 * MM);
    const sig = signatureBuffer();
    if (sig) doc.image(sig, L, sigY - 16 * MM, { fit: [60 * MM, 15 * MM], valign: 'bottom' });
    doc.lineWidth(0.5).strokeColor(INK).moveTo(L, sigY).lineTo(L + 64 * MM, sigY).stroke();
    doc.moveTo(R - 64 * MM, sigY).lineTo(R, sigY).stroke();
    doc.font('B').fontSize(9.5).fillColor(INK).text('Belinda Gray MBE', L, sigY + 2 * MM);
    doc.font('R').fontSize(8.5).fillColor(GREY).text('Founder, Art for Cure', L, sigY + 6.5 * MM);
    doc.font('B').fontSize(9.5).fillColor(INK).text('Date of issue', R - 64 * MM, sigY + 2 * MM);
    doc.font('R').fontSize(8.5).fillColor(GREY).text(d.date, R - 64 * MM, sigY + 6.5 * MM);

    // ---- Footer ----
    doc.font('R').fontSize(8).fillColor(GREY)
      .text('Art for Cure  ·  Registered charity no. 1175161  ·  artforcure.org.uk', L, H - 27 * MM, { width: CW, align: 'center' })
      .text('Bredfield House, Bredfield, Woodbridge, Suffolk, IP13 6AA', L, H - 23 * MM, { width: CW, align: 'center' });

    doc.end();
  });
}

// Turn a portal submission + Shopify sale into the strings printed on the certificate.
function certificateFields(sub, sale) {
  const p = (sub && sub.piece) || {};
  let edition = '';
  if (p.edition === 'One Off') edition = 'One-off original';
  else if (p.edition) edition = p.edition + (p.editionNum ? ' — ' + p.editionNum : '');
  let framing = '';
  if (p.framed) {
    framing = p.framed + (p.frameDesc ? ' — ' + p.frameDesc : '') + (p.glazed && p.framed !== 'Unframed' ? ` (${p.glazed})` : '');
  }
  return {
    title: p.name || sale.pieceName || '',
    artist: (sub && sub.artist && sub.artist.name) || sale.artistName || '',
    category: (sub && sub.category) || '',
    medium: p.medium || '',
    dimensions: p.dimensions || '',
    edition, framing,
  };
}

module.exports = { buildCertificatePdf, certificateFields };
