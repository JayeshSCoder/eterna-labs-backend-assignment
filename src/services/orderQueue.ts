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
    console.log(`Order ${order_id}: Routing - Comparing DEX prices...`);
    websocketService.notifyStatus(order_id, 'routing', {
      message: 'Comparing DEX prices',
    });
    
    await pool.query(
      'UPDATE orders SET status = $1 WHERE order_id = $2',
      ['routing', order_id]
    );

    // Get quotes from both DEXs
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      mockDexRouter.getRaydiumQuote(token_in, token_out, amount),
      mockDexRouter.getMeteoraQuote(token_in, token_out, amount),
    ]);

    console.log(`  - Raydium quote: Price ${raydiumQuote.price}, Fee ${raydiumQuote.fee}`);
    console.log(`  - Meteora quote: Price ${meteoraQuote.price}, Fee ${meteoraQuote.fee}`);

    // Step 2: Selection - Calculate effective prices and determine best route
    const raydiumEffectivePrice = raydiumQuote.price * (1 - raydiumQuote.fee);
    const meteoraEffectivePrice = meteoraQuote.price * (1 - meteoraQuote.fee);

    let selectedDex: 'Raydium' | 'Meteora';
    let bestPrice: number;

    if (raydiumEffectivePrice > meteoraEffectivePrice) {
      selectedDex = 'Raydium';
      bestPrice = raydiumEffectivePrice;
      console.log(`Best route selected: Raydium (${raydiumEffectivePrice.toFixed(6)}) vs Meteora (${meteoraEffectivePrice.toFixed(6)})`);
    } else {
      selectedDex = 'Meteora';
      bestPrice = meteoraEffectivePrice;
      console.log(`Best route selected: Meteora (${meteoraEffectivePrice.toFixed(6)}) vs Raydium (${raydiumEffectivePrice.toFixed(6)})`);
    }

    // Step 3: Building - Create transaction
    console.log(`Order ${order_id}: Building transaction on ${selectedDex}...`);
    websocketService.notifyStatus(order_id, 'building', {
      message: 'Creating transaction',
      selectedDex,
      bestPrice,
      raydiumPrice: raydiumEffectivePrice,
      meteoraPrice: meteoraEffectivePrice,
    });

    await pool.query(
      'UPDATE orders SET status = $1, provider = $2 WHERE order_id = $3',
      ['building', selectedDex, order_id]
    );

    // Simulate building transaction (small delay)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 4: Submitted - Execute swap
    console.log(`Order ${order_id}: Submitting transaction to network...`);
    websocketService.notifyStatus(order_id, 'submitted', {
      message: 'Transaction sent to network',
      selectedDex,
    });

    await pool.query(
      'UPDATE orders SET status = $1 WHERE order_id = $2',
      ['submitted', order_id]
    );

    const swapResult = await mockDexRouter.executeSwap(selectedDex, token_in, amount);

    console.log(`Order ${order_id}: Transaction confirmed! TxHash: ${swapResult.txHash}`);

    // Step 5: Confirmed - Update database with confirmed status
    await pool.query(
      'UPDATE orders SET status = $1, tx_hash = $2 WHERE order_id = $3',
      ['confirmed', swapResult.txHash, order_id]
    );

    const result = {
      order_id,
      selectedDex,
      bestPrice,
      txHash: swapResult.txHash,
      status: 'confirmed',
      message: 'Transaction successful',
    };

    // Notify success via WebSocket
    websocketService.notifyStatus(order_id, 'confirmed', result);
    console.log(`Order ${order_id}: Successfully confirmed`);

    return result;
  } catch (error) {
    // Step 6: Failed - Error Handling
    console.error(`Order ${order_id}: Failed -`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    try {
      await pool.query(
        'UPDATE orders SET status = $1 WHERE order_id = $2',
        ['failed', order_id]
      );

      websocketService.notifyStatus(order_id, 'failed', {
        message: 'Order execution failed',
        error: errorMessage,
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
