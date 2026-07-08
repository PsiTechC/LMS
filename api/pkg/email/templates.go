package email

import "fmt"

func VerifyEmailTemplate(name, verifyURL string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F7FB;font-family:Poppins,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F5F7FB;padding:40px 0;">
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
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1C2551;">Verify your email address</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#8b90a7;line-height:1.6;">
              Hi <strong style="color:#1C2551;">%s</strong>,<br><br>
              Welcome to XA LMS! Click the button below to verify your email address and activate your account.
              This link expires in <strong style="color:#1C2551;">24 hours</strong>.
            </p>

            <a href="%s" style="display:inline-block;background:#EF4E24;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;">
              Verify My Email →
            </a>

            <div style="margin-top:28px;padding:16px 20px;background:#F5F7FB;border-radius:10px;border:1px solid #EAECF4;">
              <div style="font-size:11px;font-weight:700;color:#8b90a7;letter-spacing:0.5px;margin-bottom:6px;">OR COPY THIS LINK</div>
              <div style="font-size:11px;color:#6B73BF;word-break:break-all;line-height:1.5;">%s</div>
            </div>

            <p style="margin:24px 0 0;font-size:12px;color:#8b90a7;line-height:1.6;">
              If you did not create an account on XA LMS, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F5F7FB;padding:20px 40px;border-top:1px solid #EAECF4;">
            <div style="font-size:11px;color:#8b90a7;">
              © XA LMS · Executive Acceleration Learning · This is an automated message, please do not reply.
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`, name, verifyURL, verifyURL)
}

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

            <p style="margin:20px 0 0;font-size:12px;color:#8b90a7;line-height:1.6;">
              Button not working? <a href="%s" style="color:#EF4E24;font-weight:700;text-decoration:none;">Open invitation link →</a>
            </p>

            <p style="margin:16px 0 0;font-size:12px;color:#8b90a7;line-height:1.6;">
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
</html>`, orgName, cohortName, orgName, recipientEmail, inviteURL, inviteURL)
}

// Feedback360InviteTemplate notifies a participant they've been added to an
// admin-initiated 360° feedback cycle and should set up their reviewers.
func Feedback360InviteTemplate(name, cycleName, orgName string) string {
	return feedback360Email(
		name, orgName,
		"You've been invited to a 360° Feedback cycle",
		fmt.Sprintf(`<strong style="color:#EF4E24;">%s</strong> has added you to the 360° feedback cycle
			<strong style="color:#1C2551;">"%s"</strong>.`, orgName, cycleName),
		`Open the <strong style="color:#1C2551;">360° Feedback</strong> tab in your dashboard to choose your
		 reviewers (manager, peers, direct reports) and begin. You'll be able to track responses and send
		 reminders from there.`,
	)
}

// Feedback360ReminderTemplate nudges a participant to complete an open 360° cycle.
func Feedback360ReminderTemplate(name, cycleName, orgName string) string {
	return feedback360Email(
		name, orgName,
		"Reminder: complete your 360° Feedback",
		fmt.Sprintf(`Your 360° feedback cycle <strong style="color:#1C2551;">"%s"</strong> is still open.`, cycleName),
		`Please open the <strong style="color:#1C2551;">360° Feedback</strong> tab to finish setting up your
		 reviewers and ensure enough responses come in to generate your report.`,
	)
}

// feedback360Email is the shared branded shell for the two 360° notices above.
func feedback360Email(name, orgName, heading, lead, action string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F7FB;font-family:Poppins,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F5F7FB;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(28,37,81,0.10);">
        <tr>
          <td style="background:#1C2551;padding:28px 40px;">
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">XA <span style="color:#EF4E24;">LMS</span></div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">by Executive Acceleration</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1C2551;">%s</h2>
            <p style="margin:0 0 16px;font-size:14px;color:#8b90a7;line-height:1.6;">
              Hi <strong style="color:#1C2551;">%s</strong>,<br><br>%s
            </p>
            <p style="margin:0 0 8px;font-size:14px;color:#8b90a7;line-height:1.6;">%s</p>
          </td>
        </tr>
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
</html>`, heading, name, lead, action)
}

// OTPTemplate is the dev sign-in code email.
func OTPTemplate(name, code string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F7FB;font-family:Poppins,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F5F7FB;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(28,37,81,0.10);">
        <tr><td style="background:#1C2551;padding:26px 32px;">
          <div style="color:#fff;font-size:18px;font-weight:700;">XA LMS</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="font-size:15px;color:#1C2551;margin-bottom:12px;">Hi %s,</div>
          <div style="font-size:13px;color:#4a5074;line-height:1.6;margin-bottom:20px;">Use the code below to sign in. It expires in 10 minutes.</div>
          <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#EF4E24;background:#F5F7FB;border-radius:12px;padding:18px 0;text-align:center;">%s</div>
          <div style="font-size:11px;color:#8b90a7;margin-top:20px;">If you didn't request this, you can ignore this email.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, name, code)
}
