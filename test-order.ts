import WebSocket from 'ws';
import axios from 'axios';

const API_URL = 'https://eterna-labs-backend-assignment.onrender.com/api/orders';
const WS_URL = 'wss://eterna-labs-backend-assignment.onrender.com/ws/orders';

async function main() {
  try {
    console.log('Submitting order...\n');

    // Step 1: Send POST request to create order
    const response = await axios.post(API_URL, {
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amount: 1.5,
    });

    const { orderId, message, status } = response.data;
    console.log('Order submitted successfully!');
    console.log(`Order ID: ${orderId}`);
    console.log(`Message: ${message}`);
    console.log(`Initial Status: ${status}\n`);

    // Step 2: Open WebSocket connection
    const ws = new WebSocket(`${WS_URL}/${orderId}`);

    ws.on('open', () => {
      console.log('WebSocket connection established\n');
      console.log('Waiting for real-time updates...\n');
    });

    // Step 3: Listen for messages
    ws.on('message', (data: Buffer) => {
      const parsedData = JSON.parse(data.toString());
      console.log('Live Update:', parsedData);

      // Step 4: Close socket on final status
      if (parsedData.status === 'confirmed' || parsedData.status === 'failed') {
        console.log('\nOrder processing completed!');
        ws.close();
        
        setTimeout(() => {
          process.exit(0);
        }, 500);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
      process.exit(1);
    });

    ws.on('close', () => {
      console.log('\nWebSocket connection closed');
    });

  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message);
    } else {
      console.error('Error:', error);
    }
    process.exit(1);
  }
}

// Run the main function
main();
