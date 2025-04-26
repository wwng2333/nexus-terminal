import axios from "axios";
import { INotificationSender } from "../notification.dispatcher.service";
import { ProcessedNotification } from "../notification.processor.service";
import { TelegramConfig } from "../../types/notification.types";

class TelegramSenderService implements INotificationSender {
  async send(notification: ProcessedNotification): Promise<void> {
    const config = notification.config as TelegramConfig;
    const { botToken, chatId } = config;
    const messageBody = notification.body;

    if (!botToken || !chatId) {
      console.error(
        "[TelegramSender] Missing botToken or chatId in configuration."
      );
      throw new Error(
        "Telegram configuration is incomplete (missing botToken or chatId)."
      );
    }

    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
      console.log(
        `[TelegramSender] Sending notification to chat ID: ${chatId}`
      );
      const response = await axios.post(
        apiUrl,
        {
          chat_id: chatId,
          text: messageBody,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        },
        {
          timeout: 10000,
        }
      );

      if (response.data && response.data.ok) {
        console.log(
          `[TelegramSender] Successfully sent notification to chat ID: ${chatId}`
        );
      } else {
        const errorDescription =
          response.data?.description || "Unknown error from Telegram API";
        console.error(
          `[TelegramSender] Failed to send notification. Telegram API response: ${errorDescription}`,
          response.data
        );
        throw new Error(`Telegram API error: ${errorDescription}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error(
          `[TelegramSender] Axios error sending notification: ${error.message}`,
          error.response?.data
        );
        throw new Error(
          `Failed to send Telegram notification (Axios Error): ${error.message}`
        );
      } else {
        console.error(
          `[TelegramSender] Unexpected error sending notification:`,
          error
        );
        throw new Error(
          `Failed to send Telegram notification (Unexpected Error): ${
            error.message || error
          }`
        );
      }
    }
  }
}

const telegramSenderService = new TelegramSenderService();
export default telegramSenderService;
