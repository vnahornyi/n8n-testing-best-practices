const axios = require("axios");

const validOrder = require("./fixtures/valid-order.json");
const invalidOrder = require("./fixtures/invalid-order.json");
const dryRunOrder = require("./fixtures/dry-run-order.json");

describe("Order Processing Workflow", () => {
  test("should process valid order", async () => {
    const res = await axios.post(
      "http://localhost:5678/webhook/order",
      validOrder,
    );

    expect(res.data).toMatchObject({
      success: expect.any(Boolean),
      message: expect.any(String),
    });
  });

  test("should reject invalid payload", async () => {
    try {
      await axios.post("http://localhost:5678/webhook/order", invalidOrder);
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.success).toBe(false);
    }
  });

  test("should support dry-run mode", async () => {
    const res = await axios.post(
      "http://localhost:5678/webhook/order",
      dryRunOrder,
    );

    expect(res.data.success).toBe(true);
    expect(res.data.dryRun).toBe(true);
  });
  test("should reject duplicate order", async () => {
    const payload = {
      orderId: "ORD-1",
      email: "test@test.com",
      amount: 100,
    };

    await axios.post(
      "http://localhost:5678/webhook/order",

      payload,
    );

    await expect(
      axios.post(
        "http://localhost:5678/webhook/order",

        payload,
      ),
    ).rejects.toThrow();
  });
});
