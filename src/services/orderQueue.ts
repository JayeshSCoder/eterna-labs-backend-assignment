import { Queue, Worker, Job } from 'bullmq';
import redis from '../config/redis';
import mockDexRouter from './dexRouter';
import websocketService from './websocketService';
import pool from '../config/database';

// Create the order queue
export const orderQueue = new Queue('order-execution-queue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
  },
});

// Add order to queue
export async function addOrderToQueue(orderData: any): Promise<void> {
  await orderQueue.add('process-order', orderData);
  console.log(`Order added to queue: ${orderData.order_id || 'N/A'}`);
}

// Process order function (worker handler)
async function processOrder(job: Job): Promise<any> {
  console.log(`Processing order: ${job.id}`);

  const { order_id, token_in, token_out, amount } = job.data;

  try {
    // Step 1: Routing - Update status and get quotes
    websocketService.notifyStatus(order_id, 'routing');
    
    await pool.query(
      'UPDATE orders SET status = $1 WHERE order_id = $2',
      ['routing', order_id]
    );
    console.log(`Order ${order_id}: Status updated to 'routing'`);

    // Get quotes from both DEXs
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      mockDexRouter.getRaydiumQuote(token_in, token_out, amount),
      mockDexRouter.getMeteoraQuote(token_in, token_out, amount),
    ]);

    console.log(`Raydium quote: Price ${raydiumQuote.price}, Fee ${raydiumQuote.fee}`);
    console.log(`Meteora quote: Price ${meteoraQuote.price}, Fee ${meteoraQuote.fee}`);

    // Step 2: Selection - Calculate effective prices and determine best route
    const raydiumEffectivePrice = raydiumQuote.price * (1 - raydiumQuote.fee);
    const meteoraEffectivePrice = meteoraQuote.price * (1 - meteoraQuote.fee);

    let selectedDex: 'Raydium' | 'Meteora';
    let bestPrice: number;

    if (raydiumEffectivePrice > meteoraEffectivePrice) {
      selectedDex = 'Raydium';
      bestPrice = raydiumEffectivePrice;
      console.log(`✓ Best route: Raydium (${raydiumEffectivePrice}) vs Meteora (${meteoraEffectivePrice})`);
    } else {
      selectedDex = 'Meteora';
      bestPrice = meteoraEffectivePrice;
      console.log(`✓ Best route: Meteora (${meteoraEffectivePrice}) vs Raydium (${raydiumEffectivePrice})`);
    }

    // Step 3: Execution - Notify processing and execute swap
    websocketService.notifyStatus(order_id, 'processing', {
      bestRoute: selectedDex,
      bestPrice,
      raydiumPrice: raydiumEffectivePrice,
      meteoraPrice: meteoraEffectivePrice,
    });

    console.log(`Executing swap on ${selectedDex}...`);
    const swapResult = await mockDexRouter.executeSwap(selectedDex, token_in, amount);

    console.log(`✓ Swap completed! TxHash: ${swapResult.txHash}`);

    // Step 4: Success - Update database with confirmed status
    await pool.query(
      'UPDATE orders SET status = $1, tx_hash = $2, provider = $3 WHERE order_id = $4',
      ['confirmed', swapResult.txHash, selectedDex, order_id]
    );

    const result = {
      order_id,
      selectedDex,
      bestPrice,
      txHash: swapResult.txHash,
      status: swapResult.status,
    };

    // Notify success via WebSocket
    websocketService.notifyStatus(order_id, 'confirmed', result);
    console.log(`Order ${order_id}: Successfully confirmed`);

    return result;
  } catch (error) {
    // Step 5: Error Handling - Update database and notify failure
    console.error(`Error processing order ${order_id}:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    try {
      await pool.query(
        'UPDATE orders SET status = $1 WHERE order_id = $2',
        ['failed', order_id]
      );

      websocketService.notifyStatus(order_id, 'failed', {
        reason: errorMessage,
      });

      console.log(`Order ${order_id}: Status updated to 'failed'`);
    } catch (dbError) {
      console.error(`Failed to update database for order ${order_id}:`, dbError);
    }

    throw error;
  }
}

// Create and export the worker
export const orderWorker = new Worker('order-execution-queue', processOrder, {
  connection: redis,
  concurrency: 10,
  limiter: {
    max: 100,
    duration: 60000,
  },
});

// Worker event handlers
orderWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

orderWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

orderWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

console.log('Order worker initialized and ready to process jobs');
