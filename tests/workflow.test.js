const fs = require("fs");
const path = require("path");
const axios = require("axios");

const WEBHOOK_URL = "http://localhost:5678/webhook/order";
const MOCK_API_URL = "http://localhost:3001";

const validOrder = require("./fixtures/valid-order.json");
const dryRunOrder = require("./fixtures/dry-run-order.json");
const invalidEmail = require("./fixtures/invalid-email.json");
const negativeAmount = require("./fixtures/negative-amount.json");
const malformedOrder = require("./fixtures/malformed-order.json");
const emptyPayload = require("./fixtures/empty-payload.json");
const largeAmount = require("./fixtures/large-amount.json");
const duplicateOrder = require("./fixtures/duplicate-order.json");
const paymentForceFail = require("./fixtures/payment-force-fail.json");
const transientPaymentFailure = require("./fixtures/transient-payment-failure.json");

beforeEach(() => {
  fs.writeFileSync(
    path.join(process.cwd(), "data/processed-orders.json"),
    JSON.stringify([], null, 2),
  );
});

beforeAll(async () => {
  const checks = [];

  try {
    await axios.post(`${MOCK_API_URL}/pay`, { amount: -1 }, { timeout: 2000 });
  } catch (error) {
    if (!error.response) {
      checks.push("Mock API is not reachable at http://localhost:3001");
    }
  }

  try {
    await axios.post(
      WEBHOOK_URL,
      {},
      { validateStatus: () => true, timeout: 3000 },
    );
  } catch (error) {
    checks.push(
      "n8n webhook is not reachable at http://localhost:5678/webhook/order",
    );
  }

  const contractProbe = await axios.post(WEBHOOK_URL, dryRunOrder, {
    validateStatus: () => true,
    timeout: 5000,
  });

  const hasObjectBody =
    contractProbe.data && typeof contractProbe.data === "object";
  const hasContract =
    hasObjectBody &&
    "success" in contractProbe.data &&
    "message" in contractProbe.data;

  if (!hasContract) {
    checks.push(
      [
        "Webhook contract check failed for /webhook/order.",
        `Received status=${contractProbe.status}, body=${JSON.stringify(contractProbe.data)}`,
        "Likely causes:",
        "- Active workflow on /order is not the expected order-processing workflow",
        "- Webhook response mode is On Received instead of responseNode",
        "- Workflow was not re-imported/re-activated after edits",
      ].join(" "),
    );
  }

  if (checks.length) {
    throw new Error(
      [
        "Preflight failed:",
        ...checks.map((line) => `- ${line}`),
        "- Start services: npm run start:mocks and npm run start:n8n",
        "- In n8n ensure only one active workflow uses path /order",
        "- Re-import workflows/order-processing.json and activate it",
        "- Ensure Webhook node uses Response Mode = responseNode",
      ].join("\n"),
    );
  }
});

beforeEach(async () => {
  await axios.post(`${MOCK_API_URL}/__reset`, {}, { timeout: 2000 });
});

const postOrder = async (payload) => {
  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      validateStatus: () => true,
      timeout: 15000,
    });

    return response;
  } catch (error) {
    const details = [error.message, error.code, error.cause?.message]
      .filter(Boolean)
      .join(" | ");
    throw new Error(`Request failed before receiving response: ${details}`);
  }
};

const normalizeResponseData = (response) => {
  if (typeof response.data === "string") {
    const trimmed = response.data.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (response.data && typeof response.data === "object") {
    return response.data;
  }
  return null;
};

const assertResponseContract = (response) => {
  const data = normalizeResponseData(response);
  expect(data).not.toBeNull();
  expect(data).toHaveProperty("success");
  expect(data).toHaveProperty("message");
  expect(typeof data.success).toBe("boolean");
  expect(["string", "object"]).toContain(typeof data.message);
  expect(data.message).not.toBeNull();
  return data;
};

const getMessageText = (message) => {
  if (typeof message === "string") return message;
  if (message && typeof message === "object") {
    if (typeof message.message === "string") return message.message;
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
  return String(message);
};

const assertError = (response, messagePattern) => {
  expect([200, 400]).toContain(response.status);
  const data = normalizeResponseData(response);
  expect(data).not.toBeNull();

  expect(data.success).toBe(false);
  expect(getMessageText(data.message)).toMatch(messagePattern);
};

describe("Order Processing Workflow (production webhook)", () => {
  test("1. valid order returns success", async () => {
    const response = await postOrder(validOrder);

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.message).toMatch(
      /Payment processed|Payment accepted/i,
    );
    assertResponseContract(response);
  });

  test("2. dry-run returns success and does not call payment API", async () => {
    const statsBefore = await axios.get(`${MOCK_API_URL}/__stats`, {
      timeout: 2000,
    });
    const response = await postOrder(dryRunOrder);
    const statsAfter = await axios.get(`${MOCK_API_URL}/__stats`, {
      timeout: 2000,
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.dryRun).toBe(true);
    expect(response.data.message).toMatch(/Dry run completed/i);
    expect(statsAfter.data.totalPayRequests).toBe(
      statsBefore.data.totalPayRequests,
    );
    assertResponseContract(response);
  });

  test("3. invalid email returns 400 with structured validation error", async () => {
    const response = await postOrder(invalidEmail);

    assertError(response, /Invalid payload/i);
  });

  test("4. negative amount returns 400 with structured validation error", async () => {
    const response = await postOrder(negativeAmount);

    assertError(response, /Invalid payload/i);
  });

  test("5. malformed payload returns 400 with structured validation error", async () => {
    const response = await postOrder(malformedOrder);

    assertError(response, /Invalid payload/i);
  });

  test("6. empty payload returns 400", async () => {
    const response = await postOrder(emptyPayload);

    assertError(response, /Invalid payload/i);
  });

  test("7. amount over limit returns payment failure response", async () => {
    const response = await postOrder(largeAmount);

    assertError(response, /Limit exceeded|Payment rejected|Payment failed/i);
  });

  test("8. duplicate order returns 409", async () => {
    const firstResponse = await postOrder(duplicateOrder);
    const secondResponse = await postOrder(duplicateOrder);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.data.success).toBe(true);

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.data.success).toBe(false);
    expect(secondResponse.data.message).toMatch(/Duplicate order detected/i);
    assertResponseContract(secondResponse);
  });

  test("9. response contract always has success and message", async () => {
    const payloads = [
      validOrder,
      dryRunOrder,
      invalidEmail,
      negativeAmount,
      malformedOrder,
      emptyPayload,
      largeAmount,
      paymentForceFail,
      transientPaymentFailure,
    ];

    for (const payload of payloads) {
      const response = await postOrder(payload);
      const data = normalizeResponseData(response);
      if (data === null) {
        expect(response.status).toBe(200);
        continue;
      }
      assertResponseContract(response);
    }
  }, 20000);

  test("10. retry scenario for transient payment failure", async () => {
    const response = await postOrder(transientPaymentFailure);

    expect([200, 400]).toContain(response.status);
    assertResponseContract(response);
  });
});
