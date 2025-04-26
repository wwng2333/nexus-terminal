import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer'; // Import Mail type for transporter
import SMTPTransport from 'nodemailer/lib/smtp-transport'; // Import SMTPTransport for options type
import { INotificationSender } from '../notification.dispatcher.service';
import { ProcessedNotification } from '../notification.processor.service';
import { EmailConfig } from '../../types/notification.types';
import { settingsService } from '../settings.service'; // Import settingsService

class EmailSenderService implements INotificationSender {

    async send(notification: ProcessedNotification): Promise<void> {
        const config = notification.config as EmailConfig;
        const { to, subjectTemplate, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, from } = config;
        const subject = notification.subject || 'Notification'; // Use processed subject or default
        const body = notification.body; // Use processed body (assuming HTML)

        if (!to) {
            console.error('[EmailSender] Missing recipient address (to) in configuration.');
            throw new Error('Email configuration is incomplete (missing recipient address).');
        }

        try {
            // Get global settings for fallback SMTP configuration using settingsService
            const globalSmtpHost = await settingsService.getSetting('smtpHost');
            const globalSmtpPortStr = await settingsService.getSetting('smtpPort');
            const globalSmtpSecureStr = await settingsService.getSetting('smtpSecure');
            const globalSmtpUser = await settingsService.getSetting('smtpUser');
            const globalSmtpPass = await settingsService.getSetting('smtpPass');
            const globalSmtpFrom = await settingsService.getSetting('smtpFrom');

            // Determine SMTP settings: prioritize channel-specific, then global, then defaults
            const finalSmtpHost = smtpHost || globalSmtpHost;
            const finalSmtpPort = smtpPort ?? (globalSmtpPortStr ? parseInt(globalSmtpPortStr, 10) : 587); // Default port 587
            const finalSmtpSecure = smtpSecure ?? (globalSmtpSecureStr === 'true') ?? false; // Default secure false
            const finalSmtpUser = smtpUser || globalSmtpUser;
            const finalSmtpPass = smtpPass || globalSmtpPass;
            const finalFrom = from || globalSmtpFrom || 'noreply@nexus-terminal.local'; // Default from

            if (!finalSmtpHost) {
                 console.error('[EmailSender] SMTP host is not configured (neither channel-specific nor global).');
                 throw new Error('SMTP host configuration is missing.');
            }
            // Basic validation for port
            if (isNaN(finalSmtpPort) || finalSmtpPort <= 0) {
                console.error(`[EmailSender] Invalid SMTP port configured: ${finalSmtpPort}. Using default 587.`);
                // finalSmtpPort = 587; // Or throw error depending on strictness needed
                 throw new Error(`Invalid SMTP port configured: ${finalSmtpPort}`);
            }

           // Remove explicit type annotation to let TypeScript infer the type
           const transporterOptions: SMTPTransport.Options = { // Use specific SMTPTransport options type
               host: finalSmtpHost,
               port: finalSmtpPort,
               secure: finalSmtpSecure, // true for 465, false for other ports
               auth: (finalSmtpUser && finalSmtpPass) ? {
                   user: finalSmtpUser,
                   pass: finalSmtpPass,
               } : undefined, // Only include auth if user/pass are provided
               tls: {
                   // rejectUnauthorized should be within the tls object according to types
                   rejectUnauthorized: finalSmtpSecure,
                   // minVersion is also a valid TLS option
                   minVersion: 'TLSv1.2' // Explicitly require TLSv1.2 or higher for Gmail compatibility
               }
           };

            const transporter = nodemailer.createTransport(transporterOptions);

            // Verify connection configuration (optional but recommended)
            // try {
            //     await transporter.verify();
            //     console.log('[EmailSender] SMTP configuration verified successfully.');
            // } catch (verifyError) {
            //     console.error('[EmailSender] SMTP configuration verification failed:', verifyError);
            //     throw new Error(`SMTP verification failed: ${verifyError.message}`);
            // }


            const mailOptions: Mail.Options = {
                from: `"${finalFrom.split('@')[0]}" <${finalFrom}>`, // sender address format "Sender Name <sender@example.com>"
                to: to, // list of receivers (comma-separated)
                subject: subject, // Subject line
                // text: 'Plain text body', // Plain text body (optional, provide if HTML is not supported well)
                html: body, // html body
            };

            console.log(`[EmailSender] Sending email notification to: ${to} with subject: "${subject}"`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`[EmailSender] Email sent successfully. Message ID: ${info.messageId}`);

        } catch (error: any) {
            console.error(`[EmailSender] Error sending email notification to ${to}:`, error);
            // Provide more specific error message if possible
            throw new Error(`Failed to send email notification: ${error.message || error}`);
        }
    }
}

// Create and export singleton instance
const emailSenderService = new EmailSenderService();
export default emailSenderService;