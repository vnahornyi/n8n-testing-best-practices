# n8n Workflow Testing Demo

Production-style n8n workflow testing example.

## Features

- webhook workflow
- validation layer
- dry-run support
- mocked payment API
- automated Jest tests
- deterministic fixtures

## Architecture

Webhook
→ Normalize Input
→ Validation
→ Dry Run Check
→ Payment API
→ Success / Failure

## Run project

### Install

npm install

### Start mock API

npm run start:mocks

### Start n8n

npm run start:n8n

### Run tests

npm test

## Testing strategy

- integration testing
- mocked APIs
- deterministic payloads
- validation-first workflow design
- dry-run architecture
