import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { submitOrder } from './controllers/orderController';
import websocketService from './services/websocketService';
import { initDb } from './config/database';

// Load environment variables
dotenv.config();

// Initialize Fastify app
const app = Fastify({
  logger: true,
});

// Register WebSocket plugin
app.register(websocket);

// WebSocket route for order updates
app.register(async function (fastify) {
  fastify.get('/ws/orders/:orderId', { websocket: true }, (connection, req) => {
    const { orderId } = req.params as { orderId: string };
    websocketService.handleConnection(connection, orderId);
  });
});

// REST API Routes
app.post('/api/orders', submitOrder);

// Health check endpoint
app.get('/health', async (_request, reply) => {
  reply.send({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const start = async () => {
  try {
    // Initialize database
    await initDb();
    console.log('Database initialized');

    const port = parseInt(process.env.PORT || '3000', 10);
    const host = '0.0.0.0';

    await app.listen({ port, host });
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`WebSocket endpoint: ws://localhost:${port}/ws/orders/:orderId`);
    console.log(`REST API endpoint: http://localhost:${port}/api/orders`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};


start();
