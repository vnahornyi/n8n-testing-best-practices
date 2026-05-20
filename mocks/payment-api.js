const express = require("express");

const app = express();

app.use(express.json());

app.post("/pay", (req, res) => {
  const { amount } = req.body;

  if (amount > 500) {
    return res.status(400).json({
      success: false,
      error: "Limit exceeded",
    });
  }

  return res.json({
    success: true,
    paymentId: "pay_123",
  });
});

app.listen(3001, () => {
  console.log("Mock payment API running");
});
