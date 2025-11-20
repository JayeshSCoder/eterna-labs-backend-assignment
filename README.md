# Backend Order Execution Engine

A high-performance order execution system that routes trades through multiple DEX (Decentralized Exchange) providers, selects the best price, and provides real-time updates via WebSocket connections.

**Live Deployment:** https://eterna-labs-backend-assignment.onrender.com

## Overview

This backend service simulates an order execution engine that:
- Accepts order submissions via REST API
- Compares prices across multiple DEX providers (Raydium & Meteora)
- Selects the best execution route based on price
- Executes trades and provides real-time status updates
- Maintains order history in PostgreSQL database
- Uses Redis-backed job queues for reliable order processing

## Architecture

### Technology Stack
- **Runtime:** Node.js with TypeScript
- **Web Framework:** Fastify
- **Database:** PostgreSQL (Neon DB)
- **Cache/Queue:** Redis (Upstash) + BullMQ
- **WebSocket:** @fastify/websocket
- **Deployment:** Render

### System Components
1. **REST API Server** - Handles order submissions
2. **WebSocket Server** - Real-time order status updates
3. **Job Queue** - BullMQ-based order processing
4. **Mock DEX Router** - Simulates Raydium and Meteora price quotes
5. **PostgreSQL Database** - Persistent order storage

## Features

### Order Execution Flow
1. **Order Submission** - Client submits order via POST `/api/orders`
2. **Order Queuing** - Order is queued with BullMQ for processing
3. **Price Discovery** - Fetch quotes from Raydium and Meteora (parallel)
4. **Route Selection** - Select DEX with best effective price
5. **Transaction Building** - Prepare swap transaction
6. **Transaction Submission** - Submit to blockchain (simulated)
7. **Confirmation** - Update database and notify client

### Order Status Lifecycle
- `pending` - Order received and queued
- `routing` - Comparing DEX prices
- `building` - Creating transaction
- `submitted` - Transaction sent to network
- `confirmed` - Transaction successful (includes txHash)
- `failed` - Execution failed (includes error details)

### Queue Configuration
- **Concurrency:** 10 parallel jobs
- **Rate Limiting:** 100 orders per minute
- **Retry Policy:** 3 attempts with exponential backoff (1s initial delay)
- **Auto-cleanup:** Completed jobs are automatically removed

## API Endpoints

### REST API

#### POST `/api/orders`
Submit a new order for execution.

**Request Body:**
```json
{
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": 1.5
}
```

**Response:**
```json
{
  "orderId": "uuid-v4-string",
  "message": "Order queued",
  "status": "pending"
}
```

#### GET `/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-20T10:00:00.000Z"
}
```

### WebSocket API

#### WS `/ws/orders/:orderId`
Real-time order status updates.

**Connection Acknowledgment:**
```json
{
  "type": "connection_ack",
  "orderId": "uuid-v4-string"
}
```

**Status Updates:**
```json
{
  "type": "order_update",
  "status": "routing|building|submitted|confirmed|failed",
  "data": {
    "message": "Status description",
    "selectedDex": "Raydium|Meteora",
    "bestPrice": 1.009,
    "txHash": "0x...",
    "error": "Error message (if failed)"
  }
}
```

## Database Schema

### Orders Table
```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(255) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  token_in VARCHAR(255) NOT NULL,
  token_out VARCHAR(255) NOT NULL,
  amount DECIMAL(36, 18) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN 
    ('pending', 'routing', 'building', 'submitted', 'confirmed', 'failed')),
  provider VARCHAR(255),
  tx_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (or Neon DB account)
- Redis instance (or Upstash account)

### Local Development

1. **Clone the repository:**
```bash
git clone https://github.com/JayeshSCoder/eterna-labs-backend-assignment.git
cd eterna-labs-backend-assignment
```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment variables:**
Create a `.env` file in the root directory:
```env
PORT=3000
POSTGRES_URL=postgresql://username:password@host:5432/database?sslmode=require
REDIS_URL=rediss://default:password@host:6379
```

4. **Run development server:**
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Build for Production

```bash
npm run build
npm start
```

## Testing

### Test Script
Use the provided `test-order.ts` script to simulate order submission and real-time updates:

```bash
npx ts-node test-order.ts
```

**Expected Output:**
```
Submitting order...

Order submitted successfully!
Order ID: ce4e0650-9a12-4c5a-82c9-a158faf5efab
Message: Order queued
Initial Status: pending

WebSocket connection established

Waiting for real-time updates...

Live Update: { type: 'order_update', status: 'routing', data: { message: 'Comparing DEX prices' } }
Live Update: { type: 'order_update', status: 'building', data: { selectedDex: 'Meteora', bestPrice: 1.012558 } }
Live Update: { type: 'order_update', status: 'submitted', data: { message: 'Transaction sent to network' } }
Live Update: { type: 'order_update', status: 'confirmed', data: { txHash: '0x...' } }

Order processing completed!
WebSocket connection closed
```

### Manual Testing with cURL

**Submit Order:**
```bash
curl -X POST https://eterna-labs-backend-assignment.onrender.com/api/orders \
  -H "Content-Type: application/json" \
  -d '{"tokenIn":"SOL","tokenOut":"USDC","amount":1.5}'
```

**WebSocket Connection (using wscat):**
```bash
npm install -g wscat
wscat -c "wss://eterna-labs-backend-assignment.onrender.com/ws/orders/YOUR_ORDER_ID"
```

## Project Structure

```
eterna-labs-backend-assignment/
├── src/
│   ├── config/
│   │   ├── database.ts       # PostgreSQL connection & schema
│   │   └── redis.ts          # Redis client configuration
│   ├── controllers/
│   │   └── orderController.ts # Order submission handler
│   ├── services/
│   │   ├── dexRouter.ts      # Mock DEX price quotes & execution
│   │   ├── orderQueue.ts     # BullMQ job queue & worker
│   │   └── websocketService.ts # WebSocket connection manager
│   └── index.ts              # Main application entry point
├── test-order.ts             # Test script for order simulation
├── tsconfig.json             # TypeScript configuration
├── package.json              # Dependencies & scripts
└── .env                      # Environment variables (not in git)
```

## Deployment (Render)

### Environment Variables
Configure the following in Render dashboard:

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `POSTGRES_URL` | PostgreSQL connection string | `postgresql://...` |
| `REDIS_URL` | Redis connection string | `rediss://...` |

### Build Configuration
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Auto-Deploy:** Enabled on `main` branch

The `postinstall` script automatically compiles TypeScript after dependencies are installed.

## Security Features

- SSL/TLS for PostgreSQL (Neon DB)
- TLS for Redis connections (Upstash)
- Environment variable isolation
- Input validation on API endpoints
- Rate limiting on job queue

## Performance Characteristics

- **Order Processing:** 10 concurrent orders
- **Throughput:** 100 orders per minute (rate limited)
- **DEX Quote Latency:** ~200ms per DEX (simulated)
- **Transaction Confirmation:** 2-3 seconds (simulated)
- **WebSocket:** Real-time updates (<100ms)

## Mock DEX Router

The system simulates two DEX providers:

### Raydium
- Price variance: ±2% around base price
- Fee: 0.25%
- Quote latency: 200ms

### Meteora  
- Price variance: ±2.5% around base price
- Fee: 0.30%
- Quote latency: 200ms

The best route is selected based on **effective price** (price after fees).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production server |
| `npx ts-node test-order.ts` | Test order submission & WebSocket |

## Contributing

This is a technical assessment project. For questions or issues, please contact the repository owner.

## License

ISC

## Author

**Jayesh**  
GitHub: [@JayeshSCoder](https://github.com/JayeshSCoder)

---

**Live API:** https://eterna-labs-backend-assignment.onrender.com  
**Repository:** https://github.com/JayeshSCoder/eterna-labs-backend-assignment
