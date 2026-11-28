import "server-only";

export type EmailDeliveryResult = {
  success: boolean;
  id?: string;
  error?: string;
};

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY is not configured in .env.local" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, error: data.message || `Resend responded with status ${res.status}` };
    }

    const data = (await res.json()) as { id?: string };
    return { success: true, id: data.id };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function sendStaffInviteEmail({
  to,
  name,
  setupUrl,
}: {
  to: string;
  name: string;
  setupUrl: string;
}): Promise<EmailDeliveryResult> {
  return sendEmail({
    to,
    subject: "Set up your Study Case Manager account",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1e293b;">
        <h2 style="margin-top: 0; color: #0f172a; font-size: 22px;">Welcome to Study Case Manager</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #334155;">Hello ${name || "there"},</p>
        <p style="font-size: 15px; line-height: 1.6; color: #334155;">
          You have been invited to join the staff portal of your institution on Study Case Manager.
        </p>
        <div style="margin: 32px 0;">
          <a href="${setupUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block;">
            Set up your account
          </a>
        </div>
        <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-top: 24px;">
          If the button above does not work, copy and paste this link into your browser:
        </p>
        <p style="font-size: 13px; line-height: 1.5; color: #4f46e5; word-break: break-all;">
          ${setupUrl}
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          This link was sent from your institution's Study Case Manager portal.
        </p>
      </div>
    `,
  });
}
