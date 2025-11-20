import { FastifyRequest, FastifyReply } from 'fastify';
import pool from '../config/database';
import { addOrderToQueue } from '../services/orderQueue';
import { randomUUID } from 'crypto';

interface OrderRequestBody {
  tokenIn: string;
  tokenOut: string;
  amount: number;
}

export async function submitOrder(
  req: FastifyRequest<{ Body: OrderRequestBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { tokenIn, tokenOut, amount } = req.body;

    // Validate input
    if (!tokenIn || !tokenOut || !amount) {
      reply.code(400).send({
        error: 'Missing required fields: tokenIn, tokenOut, amount',
      });
      return;
    }

    // Generate order ID
    const orderId = randomUUID();

    // Mock user ID (in production, get from auth)
    const userId = 'user_123';

    // Insert order into database
    const insertQuery = `
      INSERT INTO orders (order_id, user_id, token_in, token_out, amount, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    await pool.query(insertQuery, [
      orderId,
      userId,
      tokenIn,
      tokenOut,
      amount,
      'pending',
    ]);

    console.log(`Order created: ${orderId}`);

    // Add order to processing queue
    await addOrderToQueue({
      order_id: orderId,
      user_id: userId,
      token_in: tokenIn,
      token_out: tokenOut,
      amount,
    });

    // Return success response
    reply.code(201).send({
      orderId,
      message: 'Order queued',
      status: 'pending',
    });
  } catch (error) {
    console.error('Error submitting order:', error);
    reply.code(500).send({
      error: 'Failed to submit order',
    });
  }
}
