const sendgrid = require('@sendgrid/mail');

function getFromEmail() {
  return process.env.SEND_FROM_EMAIL || 'no-reply@reaissistant.com';
}

async function sendEmail({ to, subject, text, html }) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('SendGrid is not configured (SENDGRID_API_KEY missing)');
  }
  if (!to) throw new Error('Email recipient required');
  sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
  await sendgrid.send({
    to,
    from: { email: getFromEmail(), name: 'RE AIssistant' },
    subject: subject || 'RE AIssistant',
    text: text || '',
    html: html || `<pre style="font-family:sans-serif;white-space:pre-wrap">${String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>`,
  });
}

module.exports = {
  sendEmail,
  getFromEmail,
};
