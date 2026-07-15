import nodemailer from "nodemailer";

// NodeMailer transporter — .env mein SMTP keys dalne ke baad ready hai.
export const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMail(opts: { to: string; subject: string; html: string }) {
  return mailer.sendMail({
    from: process.env.SMTP_FROM,
    ...opts,
  });
}
