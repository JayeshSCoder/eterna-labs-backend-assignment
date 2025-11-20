import { WebSocket } from 'ws';

class WebSocketService {
  private connections = new Map<string, WebSocket>();

  handleConnection(socket: WebSocket, orderId: string): void {
    // Store the socket in the map
    this.connections.set(orderId, socket);
    console.log(`WebSocket connection established for order: ${orderId}`);

    // Send confirmation message
    const confirmationMessage = JSON.stringify({
      type: 'connection_ack',
      orderId,
    });
    socket.send(confirmationMessage);

    // Remove socket from map when it closes
    socket.on('close', () => {
      this.connections.delete(orderId);
      console.log(`WebSocket connection closed for order: ${orderId}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`WebSocket error for order ${orderId}:`, error);
      this.connections.delete(orderId);
    });
  }

  notifyStatus(orderId: string, status: string, data?: any): void {
    const socket = this.connections.get(orderId);

    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'order_update',
        status,
        data,
      });
      
      socket.send(message);
      console.log(`Status update sent for order ${orderId}: ${status}`);
    } else {
      console.log(`No active WebSocket connection found for order: ${orderId}`);
    }
  }

  // Utility method to get connection count
  getConnectionCount(): number {
    return this.connections.size;
  }

  // Utility method to check if an order has an active connection
  hasConnection(orderId: string): boolean {
    return this.connections.has(orderId);
  }
}

// Export singleton instance
export default new WebSocketService();
