import { Queue, Worker, Job } from 'bullmq';
import redis from '../config/redis';
import mockDexRouter from './dexRouter';

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
    // Get quotes from both DEXs
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      mockDexRouter.getRaydiumQuote(token_in, token_out, amount),
      mockDexRouter.getMeteoraQuote(token_in, token_out, amount),
    ]);

    console.log(`Raydium quote: Price ${raydiumQuote.price}, Fee ${raydiumQuote.fee}`);
    console.log(`Meteora quote: Price ${meteoraQuote.price}, Fee ${meteoraQuote.fee}`);

    // Calculate effective prices (including fees)
    const raydiumEffectivePrice = raydiumQuote.price * (1 - raydiumQuote.fee);
    const meteoraEffectivePrice = meteoraQuote.price * (1 - meteoraQuote.fee);

    // Determine which DEX is cheaper (better price)
    let selectedDex: 'Raydium' | 'Meteora';
    let bestPrice: number;

    if (raydiumEffectivePrice > meteoraEffectivePrice) {
      selectedDex = 'Raydium';
      bestPrice = raydiumEffectivePrice;
      console.log(`✓ Raydium is cheaper: ${raydiumEffectivePrice} vs Meteora: ${meteoraEffectivePrice}`);
    } else {
      selectedDex = 'Meteora';
      bestPrice = meteoraEffectivePrice;
      console.log(`✓ Meteora is cheaper: ${meteoraEffectivePrice} vs Raydium: ${raydiumEffectivePrice}`);
    }

    // Execute swap on selected DEX
    console.log(`Executing swap on ${selectedDex}...`);
    const swapResult = await mockDexRouter.executeSwap(selectedDex, token_in, amount);

    console.log(`✓ Swap completed! TxHash: ${swapResult.txHash}`);

    return {
      order_id,
      selectedDex,
      bestPrice,
      txHash: swapResult.txHash,
      status: swapResult.status,
    };
  } catch (error) {
    console.error(`Error processing order ${order_id}:`, error);
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
