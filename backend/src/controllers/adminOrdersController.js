const { pool } = require('../utils/db');
const Order = require('../models/order.model');
const InvoiceService = require('../services/invoiceService');

const ALLOWED_STATUSES = [
  'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED'
];

module.exports = {
  async list(req, res) {
    const { rows } = await pool.query(
      `SELECT id, status, total_xpf, delivery_method, invoice_number, created_at
       FROM orders
       ORDER BY created_at DESC`
    );
    res.json({ orders: rows });
  },

  async get(req, res) {
    const order = await Order.getByIdWithItems(req.params.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    res.json({ order });
  },

  async updateStatus(req, res) {
    const id = req.params.id;
    const status = String(req.body.status || '').trim();
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Statut non autorisé' });
    }
    await Order.setStatus(id, status);
    res.json({ ok: true, status });
  },

  async downloadInvoice(req, res) {
    const order = await Order.getByIdWithItems(req.params.id);
    if (!order || !order.invoice_number) {
      return res.status(404).json({ error: 'Facture indisponible' });
    }

    const pdf = await InvoiceService.generatePdf(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="facture-${order.invoice_number}.pdf"`);
    res.send(pdf);
  }
};
