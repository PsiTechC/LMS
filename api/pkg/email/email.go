package email

import (
	"fmt"
	"log"
	"net/smtp"
	"os"
	"strings"
)

// Send sends a plain-text + HTML email via SMTP.
// If SMTP_HOST is not set, it logs the message to stdout (dev fallback).
func Send(to, subject, htmlBody string) error {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := os.Getenv("SMTP_FROM")

	if host == "" {
		log.Printf("📧 [DEV EMAIL — no SMTP_HOST set]\nTo: %s\nSubject: %s\n\n%s\n", to, subject, stripHTML(htmlBody))
		return nil
	}
	if port == "" {
		port = "587"
	}
	if from == "" {
		from = user
	}

	auth := smtp.PlainAuth("", user, pass, host)

	msg := buildMIME(from, to, subject, htmlBody)

	addr := fmt.Sprintf("%s:%s", host, port)
	if err := smtp.SendMail(addr, auth, user, []string{to}, []byte(msg)); err != nil {
		return fmt.Errorf("smtp send: %w", err)
	}
	log.Printf("📧 Email sent → %s | %s", to, subject)
	return nil
}

func buildMIME(from, to, subject, htmlBody string) string {
	return strings.Join([]string{
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		fmt.Sprintf("From: %s", from),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"",
		htmlBody,
	}, "\r\n")
}

// stripHTML removes tags for the dev console fallback.
func stripHTML(s string) string {
	var out strings.Builder
	inTag := false
	for _, c := range s {
		switch {
		case c == '<':
			inTag = true
		case c == '>':
			inTag = false
		case !inTag:
			out.WriteRune(c)
		}
	}
	return strings.TrimSpace(out.String())
}
