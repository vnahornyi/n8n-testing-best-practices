## Джерела (на основі яких побудовано підхід)

- Modexa: перевірка workflow до production-деплою, щоб уникати panic-fixes  
  https://medium.com/@Modexa/n8n-workflow-testing-without-the-panic-deploy-7376586a8b43
- QAwerk: зрілість тестування n8n, failure modes, reliability pillars  
  https://qawerk.com/blog/n8n-workflow-testing/
- n8n Community: чому happy-path UI execution не є нормальним тестуванням  
  https://community.n8n.io/t/stop-testing-your-n8n-workflows-wrong/293699

## Підсумок найкращих практик зі статей

1. Тестувати не тільки happy-path.
2. Валідувати контракт payload до будь-яких side effects.
3. Використовувати детерміновані фікстури.
4. Ізолювати зовнішні залежності через mock API.
5. Мати dry-run гілку для безпечних перевірок.
6. Захищатися від дубльованих webhook-доставок (idempotency).
7. Перевіряти failure/retry сценарії.
8. Перевіряти не лише статус, а й формат відповіді (contract assertions).
9. Зберігати exported workflow JSON у Git і документувати процес імпорту/експорту.

## Архітектура workflow

`Webhook`
-> `Normalize Input`
-> `Zod Validation`
-> `Validation Result IF`
-> `Dry Run Check`
-> `Check Duplicate Order`
-> `Duplicate IF`
-> `Process Payment`
-> `Payment Success IF`
-> `Respond Success / Respond Failure / Respond Validation Error / Respond Dry Run / Respond Duplicate`

## Стратегія валідації (Zod)

- Вхідні дані перевіряються до side effects.
- При невалідному payload повертається структурована помилка:
  - `success: false`
  - `message: "Invalid payload"`
  - `errors` (flattened з Zod)
- Workflow не падає винятком на валідації.

## Dry-run стратегія

- `dryRun: true` повертає успішну відповідь без звернення до payment API.
- У тестах це перевіряється через mock-статистику (`/__stats`): кількість payment-запитів не зростає.

## Idempotency стратегія

- Перед оплатою workflow перевіряє `orderId` у локальному сховищі.
- Дубльований `orderId` -> контрольована помилка з `409` (або `400` для технічної проблеми сховища).
- Runtime state файл `data/processed-orders.json` не комітиться в Git.

## Mock API стратегія

`mocks/payment-api.js` підтримує:

- `amount <= 0` -> `400`
- `amount > 500` -> `400` (limit exceeded)
- `forceFail: true` -> `500`
- `simulateTransientFailure: true` -> перші 2 виклики `500`, 3-й успіх
- normal success -> `paymentId`
- `GET /__stats` -> метрики side effects
- `POST /__reset` -> reset стану між тестами

## Обмеження

- Локальний runtime n8n може мати версійні відмінності у статус-кодах/форматі error response на окремих гілках.
- n8n Cloud обмежує використання довільних npm-пакетів у Code nodes (тому Zod-підхід орієнтований на self-hosted/containerized запуск).
