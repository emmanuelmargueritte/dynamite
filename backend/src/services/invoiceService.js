const PDFDocument = require('pdfkit');
const { env } = require('../utils/env');
const { pool } = require('../utils/db');

/**
 * Numérotation persistante :
 * - table invoice_counters(year, counter)
 * - format: DYN-YYYY-XXXXXX (6 digits)
 */
const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();

  const counter = await pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO invoice_counters (year, counter) VALUES ($1, 0)
         ON CONFLICT (year) DO NOTHING`,
        [year]
      );

      const { rows } = await client.query(
        `UPDATE invoice_counters SET counter = counter + 1 WHERE year=$1 RETURNING counter`,
        [year]
      );

      await client.query('COMMIT');
      return Number(rows[0].counter);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  return `${env.INVOICE_PREFIX}-${year}-${String(counter).padStart(6, '0')}`;
};

const generatePdf = async (order) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const buffers = [];
  doc.on('data', (d) => buffers.push(d));

  doc.fontSize(20).text('FACTURE', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Société : ${env.INVOICE_COMPANY_NAME}`);
  doc.text(`Adresse : ${env.INVOICE_COMPANY_ADDRESS}`);
  doc.text(`Pays : ${env.INVOICE_COMPANY_COUNTRY}`);
  doc.moveDown();

  doc.text(`Facture : ${order.invoice_number}`);
  doc.text(`Date : ${new Date(order.created_at).toLocaleDateString('fr-FR')}`);
  doc.moveDown();

  doc.fontSize(12).text('Articles :');
  doc.moveDown(0.5);

  order.items.forEach((i) => {
    doc.text(`- Variante: ${i.variant_id} — ${i.quantity} × ${i.unit_price_xpf} XPF`);
  });

  doc.moveDown();
  doc.fontSize(13).text(`Total : ${order.total_xpf} XPF`);

  doc.moveDown();
  doc.fontSize(9).fillColor('#444').text(
    "Mentions : Facture émise par Dynamite. Les montants sont en XPF (entiers). Conservation selon obligations applicables (Nouvelle-Calédonie / France).",
    { align: 'left' }
  );

  doc.end();
  return Buffer.concat(buffers);
};

module.exports = { generateInvoiceNumber, generatePdf };
