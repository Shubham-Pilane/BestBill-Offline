const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db/db');
const creditRepository = require('../repositories/creditRepository');
const inventoryRepository = require('../repositories/inventoryRepository');

// --- DASHBOARD SUMMARY ---
router.get('/dashboard', auth, async (req, res) => {
  try {
    const summary = await creditRepository.getDashboardSummary(req.user.hotel_id);
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error retrieving credit summary', error: err.message });
  }
});

// --- GROUPED CUSTOMER ACCOUNTS ---
router.get('/customers', auth, async (req, res) => {
  try {
    const { search } = req.query;
    const customers = await creditRepository.getCustomerAccounts(req.user.hotel_id, search);
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching customer accounts', error: err.message });
  }
});

router.get('/customers/lookup', auth, async (req, res) => {
  try {
    const { phone } = req.query;
    const customer = await creditRepository.getCustomerLookup(req.user.hotel_id, phone);
    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error looking up customer', error: err.message });
  }
});

router.get('/customers/:phone', auth, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const details = await creditRepository.getCustomerDetails(req.user.hotel_id, phone);
    if (!details) return res.status(404).json({ message: 'Customer record not found' });
    res.json(details);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error retrieving customer details', error: err.message });
  }
});

router.post('/customers/:phone/settle', auth, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const { amount_paid, method, notes } = req.body;
    const result = await creditRepository.settleCustomerAccount(req.user.hotel_id, phone, amount_paid, method, notes);
    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error settling customer account', error: err.message });
  }
});

// --- SAVE CREDIT TRANSACTION ---
router.post('/save', auth, async (req, res) => {
  try {
    const { bill_id, party_type, vendor_id, customer_name, customer_phone, amount } = req.body;
    if (!party_type || !amount) {
      return res.status(400).json({ message: 'Party type and amount are required' });
    }

    if (party_type === 'vendor' && !vendor_id) {
      return res.status(400).json({ message: 'Vendor ID is required for vendor credits' });
    }

    if (party_type === 'customer' && !customer_name) {
      return res.status(400).json({ message: 'Customer name is required for customer credits' });
    }

    const credit = await creditRepository.saveCreditTransaction(
      req.user.hotel_id,
      { bill_id, party_type, vendor_id, customer_name, customer_phone, amount }
    );
    res.status(201).json(credit);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving credit transaction', error: err.message });
  }
});

// --- LIST CREDIT TRANSACTIONS ---
router.get('/transactions', auth, async (req, res) => {
  try {
    const list = await creditRepository.getCreditsList(req.user.hotel_id, req.query);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching credit list', error: err.message });
  }
});

// --- SINGLE CREDIT TRANSACTION DETAIL ---
router.get('/transactions/:id', auth, async (req, res) => {
  try {
    const detail = await creditRepository.getCreditById(req.user.hotel_id, req.params.id);
    if (!detail) return res.status(404).json({ message: 'Credit transaction not found' });
    res.json(detail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error retrieving transaction details', error: err.message });
  }
});

// --- SETTLE CREDIT TRANSACTION ---
router.post('/transactions/:id/settle', auth, async (req, res) => {
  try {
    const { method, amount_paid, notes } = req.body;
    const payMethod = method || 'cash';

    const result = await creditRepository.settleCreditTransaction(
      req.user.hotel_id,
      req.params.id,
      payMethod.toLowerCase(),
      amount_paid,
      notes
    );

    if (!result) return res.status(404).json({ message: 'Credit record not found' });
    if (result.error) return res.status(400).json({ message: result.error });

    res.json({ success: true, credit: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error settling credit transaction', error: err.message });
  }
});

// --- VENDORS (SUPPLIERS) CRUD FOR CREDIT MODULE ---
router.get('/vendors', auth, async (req, res) => {
  try {
    const vendors = await inventoryRepository.getSuppliers(req.user.hotel_id);
    res.json(vendors);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching vendors', error: err.message });
  }
});

router.post('/vendors', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Vendor name is required' });
    const vendor = await inventoryRepository.createSupplier(req.user.hotel_id, req.body);
    res.status(201).json(vendor);
  } catch (err) {
    res.status(500).json({ message: 'Error creating vendor', error: err.message });
  }
});

router.put('/vendors/:id', auth, async (req, res) => {
  try {
    const vendor = await inventoryRepository.updateSupplier(req.user.hotel_id, req.params.id, req.body);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    res.json(vendor);
  } catch (err) {
    res.status(500).json({ message: 'Error updating vendor', error: err.message });
  }
});

router.delete('/vendors/:id', auth, async (req, res) => {
  try {
    const success = await inventoryRepository.deleteSupplier(req.user.hotel_id, req.params.id);
    if (!success) return res.status(404).json({ message: 'Vendor not found' });
    res.json({ message: 'Vendor deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting vendor', error: err.message });
  }
});

module.exports = router;
