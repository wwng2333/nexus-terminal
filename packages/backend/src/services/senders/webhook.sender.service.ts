import axios, { Method } from 'axios';
import { INotificationSender } from '../notification.dispatcher.service';
import { ProcessedNotification } from '../notification.processor.service';
import { WebhookConfig } from '../../types/notification.types';

class WebhookSenderService implements INotificationSender {

    async send(notification: ProcessedNotification): Promise<void> {
        const config = notification.config as WebhookConfig;
        const { url, method = 'POST', headers = {} } = config; // Default method to POST
        const requestBody = notification.body; // Body is already processed by the processor

        if (!url) {
            console.error('[WebhookSender] Missing webhook URL in configuration.');
            throw new Error('Webhook configuration is incomplete (missing URL).');
        }

        // Validate URL format (basic check)
        try {
            new URL(url);
        } catch (e) {
            console.error(`[WebhookSender] Invalid webhook URL format: ${url}`);
            throw new Error(`Invalid webhook URL format: ${url}`);
        }

        // Prepare headers
        const finalHeaders: Record<string, string> = {
            'Content-Type': 'application/json', // Default Content-Type, can be overridden by config
            ...headers, // Merge custom headers from config
        };

        // Determine HTTP method
        const requestMethod: Method = method.toUpperCase() as Method; // Ensure method is uppercase and valid Axios Method type
        const validMethods: Method[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
        if (!validMethods.includes(requestMethod)) {
             console.error(`[WebhookSender] Invalid HTTP method specified: ${method}. Defaulting to POST.`);
             // requestMethod = 'POST'; // Or throw an error
             throw new Error(`Invalid HTTP method specified: ${method}`);
        }


        try {
            console.log(`[WebhookSender] Sending ${requestMethod} notification to webhook URL: ${url}`);

            // Prepare request data based on method
            let requestData: any = undefined;
            let requestParams: any = undefined;

            // For GET requests, data is usually sent as query params.
            // For POST/PUT/PATCH, data is sent in the body.
            // We assume the processed `requestBody` is intended for the body.
            // If the template was designed for GET params, this might need adjustment.
            if (['POST', 'PUT', 'PATCH'].includes(requestMethod)) {
                 // Try to parse body as JSON if Content-Type suggests it, otherwise send as string
                 if (finalHeaders['Content-Type']?.toLowerCase().includes('application/json')) {
                     try {
                         requestData = JSON.parse(requestBody);
                     } catch (parseError) {
                         console.warn(`[WebhookSender] Failed to parse request body as JSON for Content-Type application/json. Sending as raw string. Body: ${requestBody.substring(0,100)}...`);
                         requestData = requestBody;
                     }
                 } else {
                    requestData = requestBody;
                 }
            } else if (requestMethod === 'GET') {
                // For GET, we might need to parse the body (if it's a query string) or handle differently.
                // For simplicity now, we won't automatically convert body to params for GET.
                // User should configure GET webhooks appropriately (e.g., URL includes params).
                console.warn(`[WebhookSender] Sending data in body for GET request might not be standard. URL: ${url}`);
                // If requestBody is intended as query params, parsing logic would be needed here.
                // requestParams = querystring.parse(requestBody); // Example
            }


            const response = await axios({
                method: requestMethod,
                url: url,
                headers: finalHeaders,
                data: requestData,
                params: requestParams,
                timeout: 15000 // Set a timeout (e.g., 15 seconds)
            });

            // Check response status (e.g., 2xx indicates success)
            if (response.status >= 200 && response.status < 300) {
                console.log(`[WebhookSender] Successfully sent notification to webhook. Status: ${response.status}`);
            } else {
                console.warn(`[WebhookSender] Webhook endpoint responded with status: ${response.status}`, response.data);
                // Consider throwing an error for non-2xx responses depending on requirements
                // throw new Error(`Webhook endpoint responded with status: ${response.status}`);
            }

        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                console.error(`[WebhookSender] Axios error sending notification to ${url}: ${error.message}`, error.response?.status, error.response?.data);
                throw new Error(`Failed to send webhook notification (Axios Error): ${error.message}`);
            } else {
                console.error(`[WebhookSender] Unexpected error sending notification to ${url}:`, error);
                throw new Error(`Failed to send webhook notification (Unexpected Error): ${error.message || error}`);
            }
        }
    }
}

// Create and export singleton instance
const webhookSenderService = new WebhookSenderService();
export default webhookSenderService;