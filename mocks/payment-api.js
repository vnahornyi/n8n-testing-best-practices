const express = require('express');

const app = express();
app.use(express.json());

const transientAttempts = new Map();
let totalPayRequests = 0;
let successfulPayments = 0;
let failedPayments = 0;

app.get('/__stats', (_req, res) => {
  return res.status(200).json({
    totalPayRequests,
    successfulPayments,
    failedPayments,
    transientTrackedOrders: transientAttempts.size
  });
});

app.post('/__reset', (_req, res) => {
  transientAttempts.clear();
  totalPayRequests = 0;
  successfulPayments = 0;
  failedPayments = 0;
  return res.status(200).json({ success: true, message: 'Mock state reset' });
});

app.post('/pay', (req, res) => {
  const { orderId, amount, forceFail, simulateTransientFailure } = req.body || {};
  totalPayRequests += 1;

  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    failedPayments += 1;
    return res.status(400).json({
      success: false,
      message: 'Invalid amount',
      error: 'amount must be a positive number'
    });
  }

  if (amount > 500) {
    failedPayments += 1;
    return res.status(400).json({
      success: false,
      message: 'Payment rejected',
      error: 'Limit exceeded'
    });
  }

  if (forceFail === true) {
    failedPayments += 1;
    return res.status(500).json({
      success: false,
      message: 'Payment processor error',
      error: 'Forced failure for testing'
    });
  }

  if (simulateTransientFailure === true) {
    const key = orderId || 'unknown-order';
    const nextAttempt = (transientAttempts.get(key) || 0) + 1;
    transientAttempts.set(key, nextAttempt);

    if (nextAttempt <= 2) {
      failedPayments += 1;
      return res.status(500).json({
        success: false,
        message: 'Temporary payment gateway outage',
        error: 'Transient failure',
        attempt: nextAttempt
      });
    }
  }

  successfulPayments += 1;
  return res.status(200).json({
    success: true,
    message: 'Payment accepted',
    paymentId: 'pay_mock_123',
    orderId
  });
});

app.listen(3001, () => {
  console.log('Mock payment API running on http://localhost:3001');
});
