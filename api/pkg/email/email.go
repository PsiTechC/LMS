package email

import (
	"crypto/tls"
	"errors"
	"fmt"
	"log"
	"mime"
	"net/smtp"
	"os"
	"strings"
)

// loginAuth implements the SMTP AUTH LOGIN mechanism, which net/smtp omits.
// Many shared/cPanel mail hosts (e.g. mysecurecloudhost) permit only LOGIN and
// reject AUTH PLAIN. Used automatically when the server advertises LOGIN.
type loginAuth struct{ username, password string }

func (a *loginAuth) Start(_ *smtp.ServerInfo) (string, []byte, error) {
	return "LOGIN", nil, nil
}

func (a *loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(string(fromServer))) {
	case "username:":
		return []byte(a.username), nil
	case "password:":
		return []byte(a.password), nil
	default:
		return nil, errors.New("unexpected LOGIN auth challenge: " + string(fromServer))
	}
}

// Send sends a plain-text + HTML email via SMTP.
// If SMTP_HOST is not set, it logs the message to stdout (dev fallback).
//
// Supports both transport modes:
//   - Implicit TLS / SMTPS (port 465, or SMTP_USE_SSL=true): the whole
//     connection is wrapped in TLS from the start (tls.Dial).
//   - STARTTLS (port 587/25): plaintext connect, upgraded via STARTTLS by
//     net/smtp.SendMail.
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
	// The envelope-from must be a bare address (the authenticated user). The
	// header "From:" may carry a display name — SMTP_FROM is often just a label
	// (e.g. "Elev8"), so combine it with the user address for the header.
	envelopeFrom := user
	headerFrom := from
	if headerFrom == "" {
		headerFrom = user
	} else if !strings.Contains(headerFrom, "@") && user != "" {
		headerFrom = fmt.Sprintf("%s <%s>", headerFrom, user)
	}

	msg := buildMIME(headerFrom, to, subject, htmlBody)
	addr := fmt.Sprintf("%s:%s", host, port)
	useSSL := strings.EqualFold(os.Getenv("SMTP_USE_SSL"), "true") || port == "465"

	if err := deliver(addr, host, user, pass, envelopeFrom, to, []byte(msg), useSSL); err != nil {
		return fmt.Errorf("smtp send: %w", err)
	}
	log.Printf("📧 Email sent → %s | %s", to, subject)
	return nil
}

// deliver opens an SMTP session (implicit TLS for SMTPS, or plaintext+STARTTLS
// otherwise), authenticates using whichever mechanism the server advertises
// (LOGIN preferred — many hosts reject PLAIN), and sends one message.
func deliver(addr, host, user, pass, from, to string, msg []byte, useSSL bool) error {
	var client *smtp.Client
	var err error

	if useSSL {
		conn, derr := tls.Dial("tcp", addr, &tls.Config{ServerName: host})
		if derr != nil {
			return fmt.Errorf("tls dial: %w", derr)
		}
		client, err = smtp.NewClient(conn, host)
		if err != nil {
			return fmt.Errorf("smtp client: %w", err)
		}
	} else {
		client, err = smtp.Dial(addr)
		if err != nil {
			return fmt.Errorf("dial: %w", err)
		}
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: host}); err != nil {
				return fmt.Errorf("starttls: %w", err)
			}
		}
	}
	defer client.Close()

	if ok, exts := client.Extension("AUTH"); ok && user != "" {
		var auth smtp.Auth
		if strings.Contains(strings.ToUpper(exts), "LOGIN") {
			auth = &loginAuth{username: user, password: pass}
		} else {
			auth = smtp.PlainAuth("", user, pass, host)
		}
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("RCPT TO: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close body: %w", err)
	}
	return client.Quit()
}

func buildMIME(from, to, subject, htmlBody string) string {
	// Email headers must be pure ASCII. RFC 2047-encode the subject so non-ASCII
	// characters (e.g. the "°" in "360° Feedback") are transmitted correctly —
	// a raw non-ASCII subject header gets mail spam-foldered or dropped by many
	// providers (Gmail included). The display name in From can carry the same.
	encSubject := mime.QEncoding.Encode("UTF-8", subject)
	encFrom := encodeHeaderName(from)
	return strings.Join([]string{
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		fmt.Sprintf("From: %s", encFrom),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", encSubject),
		"",
		htmlBody,
	}, "\r\n")
}

// encodeHeaderName RFC 2047-encodes the display-name part of a "Name <addr>"
// From header if it contains non-ASCII, leaving the address untouched.
func encodeHeaderName(from string) string {
	i := strings.LastIndex(from, "<")
	if i <= 0 {
		return mime.QEncoding.Encode("UTF-8", from)
	}
	name := strings.TrimSpace(from[:i])
	addr := from[i:]
	return mime.QEncoding.Encode("UTF-8", name) + " " + addr
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
