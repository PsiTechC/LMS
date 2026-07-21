package email

import "fmt"

func VerifyEmailTemplate(name, verifyURL string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:Poppins,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(24,40,72,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:#182848;padding:28px 40px;">
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">XA <span style="color:#C8A860;">LMS</span></div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">by Executive Acceleration</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#182848;">Verify your email address</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#4A5573;line-height:1.6;">
              Hi <strong style="color:#182848;">%s</strong>,<br><br>
              Welcome to Intellique! Click the button below to verify your email address and activate your account.
              This link expires in <strong style="color:#182848;">24 hours</strong>.
            </p>

            <a href="%s" style="display:inline-block;background:#C8A860;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;">
              Verify My Email →
            </a>

            <div style="margin-top:28px;padding:16px 20px;background:#F7F5F0;border-radius:10px;border:1px solid #E6DED0;">
              <div style="font-size:11px;font-weight:700;color:#4A5573;letter-spacing:0.5px;margin-bottom:6px;">OR COPY THIS LINK</div>
              <div style="font-size:11px;color:#4A5573;word-break:break-all;line-height:1.5;">%s</div>
            </div>

            <p style="margin:24px 0 0;font-size:12px;color:#4A5573;line-height:1.6;">
              If you did not create an account on Intellique, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F7F5F0;padding:20px 40px;border-top:1px solid #E6DED0;">
            <div style="font-size:11px;color:#4A5573;">
              © Intellique · Executive Acceleration Learning · This is an automated message, please do not reply.
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`, name, verifyURL, verifyURL)
}

func InviteTemplate(recipientEmail, contextName, orgName, inviteURL string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:Poppins,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(24,40,72,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:#182848;padding:28px 40px;">
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">XA <span style="color:#C8A860;">LMS</span></div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">by Executive Acceleration</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#182848;">You've been invited!</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#4A5573;line-height:1.6;">
              <strong style="color:#182848;">%s</strong> has invited you to join the
              <strong style="color:#C8A860;">%s</strong> program.
            </p>

            <div style="background:#F7F5F0;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #E6DED0;">
              <div style="font-size:11px;font-weight:700;color:#4A5573;letter-spacing:0.5px;margin-bottom:8px;">YOUR INVITE</div>
              <div style="font-size:13px;color:#182848;">📧 %s</div>
            </div>

            <a href="%s" style="display:inline-block;background:#C8A860;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;">
              Accept Invitation &amp; Enroll →
            </a>

            <p style="margin:20px 0 0;font-size:12px;color:#4A5573;line-height:1.6;">
              Button not working? <a href="%s" style="color:#C8A860;font-weight:700;text-decoration:none;">Open invitation link →</a>
            </p>

            <p style="margin:16px 0 0;font-size:12px;color:#4A5573;line-height:1.6;">
              This link expires in <strong>48 hours</strong>. If you did not expect this invitation, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F7F5F0;padding:20px 40px;border-top:1px solid #E6DED0;">
            <div style="font-size:11px;color:#4A5573;">
              © Intellique · Executive Acceleration Learning · This is an automated message, please do not reply.
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`, orgName, contextName, recipientEmail, inviteURL, inviteURL)
}

// Feedback360InviteTemplate notifies a participant they've been added to an
// admin-initiated 360° feedback cycle and should set up their reviewers.
func Feedback360InviteTemplate(name, cycleName, orgName string) string {
	return feedback360Email(
		name, orgName,
		"You've been invited to a 360° Feedback cycle",
		fmt.Sprintf(`<strong style="color:#C8A860;">%s</strong> has added you to the 360° feedback cycle
			<strong style="color:#182848;">"%s"</strong>.`, orgName, cycleName),
		`Open the <strong style="color:#182848;">360° Feedback</strong> tab in your dashboard to choose your
		 reviewers (manager, peers, direct reports) and begin. You'll be able to track responses and send
		 reminders from there.`,
	)
}

// Feedback360ReminderTemplate nudges a participant to complete an open 360° cycle.
func Feedback360ReminderTemplate(name, cycleName, orgName string) string {
	return feedback360Email(
		name, orgName,
		"Reminder: complete your 360° Feedback",
		fmt.Sprintf(`Your 360° feedback cycle <strong style="color:#182848;">"%s"</strong> is still open.`, cycleName),
		`Please open the <strong style="color:#182848;">360° Feedback</strong> tab to finish setting up your
		 reviewers and ensure enough responses come in to generate your report.`,
	)
}

// RaterInviteTemplate asks an EXTERNAL rater (not a platform user) to complete a
// 360° feedback form. The link is their unique, single-use token URL - there is
// no account and no password. relationshipLabel names why they were nominated
// (e.g. "Manager", "Peer", "Direct Report") so the ask isn't a mystery.
func RaterInviteTemplate(raterName, participantName, orgName, relationshipLabel, link string) string {
	return raterEmail(
		raterName,
		"You've been asked to give 360° feedback",
		fmt.Sprintf(`<strong style="color:#182848;">%s</strong> has nominated you as their
			<strong style="color:#182848;">%s</strong> to provide confidential
			360° feedback as part of a leadership development programme at
			<strong style="color:#C8A860;">%s</strong>.`, participantName, relationshipLabel, orgName),
		"Give Feedback →",
		link,
		`The form takes about 10 minutes. Your individual responses are confidential - they're combined with
		 other reviewers' before being shared. You don't need an account; just use the button above.`,
	)
}

// RaterReminderTemplate nudges an external rater who hasn't submitted yet.
func RaterReminderTemplate(raterName, participantName, orgName, relationshipLabel, link string) string {
	return raterEmail(
		raterName,
		"Reminder: your 360° feedback is still pending",
		fmt.Sprintf(`This is a gentle reminder that <strong style="color:#182848;">%s</strong> is still waiting on
			your confidential 360° feedback - as their <strong style="color:#182848;">%s</strong> - for their
			development programme at <strong style="color:#C8A860;">%s</strong>.`, participantName, relationshipLabel, orgName),
		"Complete the Form →",
		link,
		`It takes about 10 minutes, and your responses stay confidential. If you've already submitted, you can
		 safely ignore this message.`,
	)
}

// ExternalSurveyInviteTemplate invites an external survey respondent
// (facilitator/manager/business sponsor) to complete a feedback form via
// their token link. roleLabel is free text (e.g. "Manager"); falls back to a
// generic phrasing when empty.
func ExternalSurveyInviteTemplate(respondentName, roleLabel, orgName, formTitle, link string) string {
	as := "to complete"
	if roleLabel != "" {
		as = "as their <strong style=\"color:#182848;\">" + roleLabel + "</strong> to complete"
	}
	return raterEmail(
		respondentName,
		"You've been asked to give feedback",
		fmt.Sprintf(`You've been asked %s the <strong style="color:#182848;">%s</strong>
			feedback form as part of a leadership development programme at
			<strong style="color:#C8A860;">%s</strong>.`, as, formTitle, orgName),
		"Give Feedback →",
		link,
		`The form only takes a few minutes. You don't need an account; just use the button above.`,
	)
}

// ExternalSurveyReminderTemplate nudges an external respondent who hasn't
// submitted yet.
func ExternalSurveyReminderTemplate(respondentName, roleLabel, orgName, formTitle, link string) string {
	as := ""
	if roleLabel != "" {
		as = " as their <strong style=\"color:#182848;\">" + roleLabel + "</strong>"
	}
	return raterEmail(
		respondentName,
		"Reminder: your feedback is still pending",
		fmt.Sprintf(`This is a gentle reminder that your <strong style="color:#182848;">%s</strong>
			feedback%s is still pending for the development programme at
			<strong style="color:#C8A860;">%s</strong>.`, formTitle, as, orgName),
		"Complete the Form →",
		link,
		`It only takes a few minutes. If you've already submitted, you can safely ignore this message.`,
	)
}

// raterEmail is the branded shell for the external, login-less rater emails. It
// leads with a clear CTA because this may be the recipient's first - and only -
// exposure to the product.
func raterEmail(name, heading, lead, cta, link, footnote string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:Poppins,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(24,40,72,0.10);">
        <tr>
          <td style="background:#182848;padding:28px 40px;">
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">XA <span style="color:#C8A860;">LMS</span></div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">by Executive Acceleration</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#182848;">%s</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#4A5573;line-height:1.6;">
              Hi <strong style="color:#182848;">%s</strong>,<br><br>%s
            </p>
            <a href="%s" style="display:inline-block;background:#C8A860;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;">
              %s
            </a>
            <p style="margin:22px 0 0;font-size:12px;color:#4A5573;line-height:1.6;">
              Button not working? <a href="%s" style="color:#C8A860;font-weight:700;text-decoration:none;">Open the feedback form →</a>
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:#4A5573;line-height:1.6;">%s</p>
          </td>
        </tr>
        <tr>
          <td style="background:#F7F5F0;padding:20px 40px;border-top:1px solid #E6DED0;">
            <div style="font-size:11px;color:#4A5573;">
              © Intellique · Executive Acceleration Learning · This is an automated message, please do not reply.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, heading, name, lead, link, cta, link, footnote)
}

// feedback360Email is the shared branded shell for the two 360° notices above.
func feedback360Email(name, orgName, heading, lead, action string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:Poppins,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(24,40,72,0.10);">
        <tr>
          <td style="background:#182848;padding:28px 40px;">
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">XA <span style="color:#C8A860;">LMS</span></div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">by Executive Acceleration</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#182848;">%s</h2>
            <p style="margin:0 0 16px;font-size:14px;color:#4A5573;line-height:1.6;">
              Hi <strong style="color:#182848;">%s</strong>,<br><br>%s
            </p>
            <p style="margin:0 0 8px;font-size:14px;color:#4A5573;line-height:1.6;">%s</p>
          </td>
        </tr>
        <tr>
          <td style="background:#F7F5F0;padding:20px 40px;border-top:1px solid #E6DED0;">
            <div style="font-size:11px;color:#4A5573;">
              © Intellique · Executive Acceleration Learning · This is an automated message, please do not reply.
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
<body style="margin:0;padding:0;background:#F7F5F0;font-family:Poppins,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(24,40,72,0.10);">
        <tr><td style="background:#182848;padding:26px 32px;">
          <div style="color:#fff;font-size:18px;font-weight:700;">Intellique</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="font-size:15px;color:#182848;margin-bottom:12px;">Hi %s,</div>
          <div style="font-size:13px;color:#4a5074;line-height:1.6;margin-bottom:20px;">Use the code below to sign in. It expires in 10 minutes.</div>
          <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#C8A860;background:#F7F5F0;border-radius:12px;padding:18px 0;text-align:center;">%s</div>
          <div style="font-size:11px;color:#4A5573;margin-top:20px;">If you didn't request this, you can ignore this email.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, name, code)
}
