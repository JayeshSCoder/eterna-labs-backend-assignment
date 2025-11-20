export interface Quote {
  price: number;
  fee: number;
  dex: 'Raydium' | 'Meteora';
}

export interface SwapResult {
  txHash: string;
  status: 'confirmed';
}

class MockDexRouter {
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getRaydiumQuote(
    _tokenIn: string,
    _tokenOut: string,
    _amount: number
  ): Promise<Quote> {
    await this.delay(200);

    // Simulate a base price (you can adjust this logic as needed)
    const basePrice = 1.0;
    const price = basePrice * (0.98 + Math.random() * 0.04);
    const fee = 0.0025; // 0.25% fee

    return {
      price,
      fee,
      dex: 'Raydium',
    };
  }

  async getMeteoraQuote(
    _tokenIn: string,
    _tokenOut: string,
    _amount: number
  ): Promise<Quote> {
    await this.delay(200);

    // Simulate a base price (you can adjust this logic as needed)
    const basePrice = 1.0;
    const price = basePrice * (0.97 + Math.random() * 0.05);
    const fee = 0.003; // 0.3% fee

    return {
      price,
      fee,
      dex: 'Meteora',
    };
  }

  async executeSwap(
    _dex: 'Raydium' | 'Meteora',
    _tokenIn: string,
    _amount: number
  ): Promise<SwapResult> {
    // Simulate random blockchain confirmation time between 2000ms and 3000ms
    const confirmationTime = 2000 + Math.random() * 1000;
    await this.delay(confirmationTime);

    // Generate a fake transaction hash
    const txHash = '0x' + Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    return {
      txHash,
      status: 'confirmed',
    };
  }
}

export default new MockDexRouter();
