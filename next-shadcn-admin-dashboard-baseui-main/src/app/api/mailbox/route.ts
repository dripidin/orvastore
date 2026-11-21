import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { verifyAdminSession } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const user = process.env.HOSTINGER_IMAP_USER || "contact@orva-store.com";
  const password = process.env.HOSTINGER_IMAP_PASSWORD;
  if (!password) return NextResponse.json({ success: false, configured: false, error: "أضف HOSTINGER_IMAP_PASSWORD في متغيرات بيئة الخادم لفتح صندوق البريد." }, { status: 424 });

  const client = new ImapFlow({
    host: process.env.HOSTINGER_IMAP_HOST || "imap.hostinger.com",
    port: Number(process.env.HOSTINGER_IMAP_PORT || 993),
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      const exists = Number(mailbox?.exists ?? 0);
      const start = Math.max(1, exists - 39);
      const messages = [];
      if (exists > 0) {
        for await (const message of client.fetch(`${start}:*`, { uid: true, envelope: true, source: true, flags: true, internalDate: true })) {
          const parsed = await simpleParser(message.source);
          const from = parsed.from?.value.map((address) => address.name ? `${address.name} <${address.address ?? ""}>` : address.address ?? "").filter(Boolean).join(", ") || "مرسل غير معروف";
          messages.push({
            id: String(message.uid),
            subject: parsed.subject || "(بدون عنوان)",
            from,
            date: (message.internalDate ?? parsed.date ?? new Date()).toISOString(),
            unread: !message.flags.has("\\Seen"),
            text: (parsed.text || (typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "")).replace(/\s+/g, " ").trim().slice(0, 5000),
          });
        }
      }
      messages.reverse();
      return NextResponse.json({ success: true, configured: true, account: user, total: exists, messages });
    } finally { lock.release(); }
  } catch (error) {
    return NextResponse.json({ success: false, configured: true, error: error instanceof Error ? error.message : "تعذر الاتصال بصندوق البريد." }, { status: 502 });
  } finally {
    if (client.usable) await client.logout().catch(() => undefined);
  }
}
