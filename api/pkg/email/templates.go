package email

import "fmt"

func InviteTemplate(recipientEmail, cohortName, orgName, inviteURL string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F9FC;font-family:Poppins,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F8F9FC;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(28,37,81,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:#1C2551;padding:28px 40px;">
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">XA <span style="color:#EF4E24;">LMS</span></div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">by Executive Acceleration</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1C2551;">You've been invited!</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#8b90a7;line-height:1.6;">
              <strong style="color:#1C2551;">%s</strong> has invited you to join the
              <strong style="color:#EF4E24;">%s</strong> cohort as part of the
              <strong style="color:#1C2551;">%s</strong> leadership program.
            </p>

            <div style="background:#F8F9FC;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #EAECF4;">
              <div style="font-size:11px;font-weight:700;color:#8b90a7;letter-spacing:0.5px;margin-bottom:8px;">YOUR INVITE</div>
              <div style="font-size:13px;color:#1C2551;">📧 %s</div>
            </div>

            <a href="%s" style="display:inline-block;background:#EF4E24;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;">
              Accept Invitation &amp; Enroll →
            </a>

            <p style="margin:24px 0 0;font-size:12px;color:#8b90a7;line-height:1.6;">
              This link expires in <strong>48 hours</strong>. If you did not expect this invitation, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8F9FC;padding:20px 40px;border-top:1px solid #EAECF4;">
            <div style="font-size:11px;color:#8b90a7;">
              © XA LMS · Executive Acceleration Learning · This is an automated message, please do not reply.
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`, orgName, cohortName, orgName, recipientEmail, inviteURL)
}
