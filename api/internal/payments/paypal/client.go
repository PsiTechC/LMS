package paypal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const responseLimit = 1 << 20

// tokenExpiryMargin is subtracted from the token's reported expires_in so a
// cached token already close to expiry is refetched before an in-flight
// request could hit an expired-token error mid-call.
const tokenExpiryMargin = 60 * time.Second

// Client is the PayPal API surface this system needs. Kept as an interface
// (mirroring RazorpayClient in razorpay_client.go) so callers can mock it in
// tests without hitting real PayPal sandbox/live endpoints.
type Client interface {
	// GetAccessToken returns a cached OAuth token, fetching a fresh one only
	// once the cached one is at (or near) expiry.
	GetAccessToken(ctx context.Context) (string, error)
	CreateOrder(ctx context.Context, req CreateOrderRequest) (Order, error)
	CaptureOrder(ctx context.Context, paypalOrderID string) (Capture, error)
	// VerifyWebhookSignature asks PayPal's own verify-webhook-signature API
	// to confirm a webhook delivery is genuine - unlike Razorpay's local
	// HMAC check, PayPal signature verification is itself an API call.
	VerifyWebhookSignature(ctx context.Context, headers WebhookHeaders, rawBody []byte, webhookID string) (bool, error)
}

// WebhookHeaders are the PayPal-specific headers every webhook delivery
// includes, required by the verify-webhook-signature call.
type WebhookHeaders struct {
	TransmissionID   string
	TransmissionTime string
	TransmissionSig  string
	CertURL          string
	AuthAlgo         string
}

// CreateOrderRequest mirrors this system's own convention: amounts are
// always minor-unit integers (see model.go's PaymentOrder.Amount), converted
// to PayPal's decimal-string format internally via FormatAmount.
type CreateOrderRequest struct {
	AmountMinorUnits int64
	Currency         string
	ReferenceID      string
}

// Order is what CreateOrder returns - ApprovalLink is the "approve" link the
// frontend redirects the payer to (or the id needed for PayPal's JS SDK
// button flow).
type Order struct {
	ID           string
	Status       string
	ApprovalLink string
}

// Capture is what CaptureOrder returns.
type Capture struct {
	ID     string
	Status string
}

// ProviderError distinguishes PayPal API failures from network/transport
// errors, same role as RazorpayProviderError. Name holds PayPal's own error
// identifier - "invalid_client" from the OAuth token endpoint, or a
// SCREAMING_SNAKE_CASE "name" field from the v2 orders API (e.g.
// "RESOURCE_NOT_FOUND").
type ProviderError struct {
	StatusCode int
	Name       string
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("paypal API error (%d): %s", e.StatusCode, e.Name)
}

// IsInvalidClient reports whether this is the specific "invalid_client"
// failure from the OAuth token endpoint - almost always a sandbox/live
// credential mismatch (see LoadConfig's doc comment) rather than a transient
// provider issue, so callers/logs should treat it as an actionable config
// error, not a generic "something went wrong".
func (e *ProviderError) IsInvalidClient() bool {
	return strings.EqualFold(e.Name, "invalid_client")
}

type httpClient struct {
	config     Config
	httpClient *http.Client
	now        func() time.Time

	mu          sync.Mutex
	cachedToken string
	tokenExpiry time.Time
}

func NewClient(config Config, client *http.Client) Client {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &httpClient{config: config, httpClient: client, now: time.Now}
}

func (c *httpClient) GetAccessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.cachedToken != "" && c.now().Before(c.tokenExpiry) {
		return c.cachedToken, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.config.BaseURL+"/v1/oauth2/token",
		strings.NewReader(url.Values{"grant_type": {"client_credentials"}}.Encode()))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(c.config.ClientID, c.config.ClientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	response, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("paypal token request failed: %w", err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, responseLimit))
	if err != nil {
		return "", err
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var oauthErr struct {
			Error            string `json:"error"`
			ErrorDescription string `json:"error_description"`
		}
		_ = json.Unmarshal(raw, &oauthErr)
		provErr := &ProviderError{StatusCode: response.StatusCode, Name: oauthErr.Error}
		if provErr.IsInvalidClient() {
			// Actionable config error, not a generic provider failure - see
			// LoadConfig's doc comment: sandbox and live are separate
			// credential pools, so this is almost always PAYPAL_MODE not
			// matching the pasted-in PAYPAL_CLIENT_ID/SECRET pair.
			log.Printf("[paypal] invalid_client fetching access token - PAYPAL_MODE=%s does not match the configured client credentials (sandbox and live use separate credential pools)", c.config.Mode)
		}
		return "", provErr
	}

	var token struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.Unmarshal(raw, &token); err != nil {
		return "", fmt.Errorf("invalid PayPal token response")
	}
	if token.AccessToken == "" {
		return "", fmt.Errorf("paypal token response missing access_token")
	}

	c.cachedToken = token.AccessToken
	ttl := time.Duration(token.ExpiresIn)*time.Second - tokenExpiryMargin
	if ttl < 0 {
		ttl = 0
	}
	c.tokenExpiry = c.now().Add(ttl)
	return c.cachedToken, nil
}

func (c *httpClient) CreateOrder(ctx context.Context, req CreateOrderRequest) (Order, error) {
	token, err := c.GetAccessToken(ctx)
	if err != nil {
		return Order{}, err
	}

	body := map[string]any{
		"intent": "CAPTURE",
		"purchase_units": []map[string]any{
			{
				"reference_id": req.ReferenceID,
				"amount": map[string]string{
					"currency_code": strings.ToUpper(req.Currency),
					"value":         FormatAmount(req.AmountMinorUnits, req.Currency),
				},
			},
		},
	}

	var raw struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Links  []struct {
			Href string `json:"href"`
			Rel  string `json:"rel"`
		} `json:"links"`
	}
	if err := c.doJSON(ctx, token, http.MethodPost, "/v2/checkout/orders", body, &raw); err != nil {
		return Order{}, err
	}

	out := Order{ID: raw.ID, Status: raw.Status}
	for _, link := range raw.Links {
		if link.Rel == "approve" {
			out.ApprovalLink = link.Href
			break
		}
	}
	return out, nil
}

func (c *httpClient) CaptureOrder(ctx context.Context, paypalOrderID string) (Capture, error) {
	token, err := c.GetAccessToken(ctx)
	if err != nil {
		return Capture{}, err
	}

	var raw struct {
		ID            string `json:"id"`
		Status        string `json:"status"`
		PurchaseUnits []struct {
			Payments struct {
				Captures []struct {
					ID     string `json:"id"`
					Status string `json:"status"`
				} `json:"captures"`
			} `json:"payments"`
		} `json:"purchase_units"`
	}
	if err := c.doJSON(ctx, token, http.MethodPost, "/v2/checkout/orders/"+paypalOrderID+"/capture", map[string]any{}, &raw); err != nil {
		return Capture{}, err
	}

	out := Capture{Status: raw.Status}
	if len(raw.PurchaseUnits) > 0 && len(raw.PurchaseUnits[0].Payments.Captures) > 0 {
		capture := raw.PurchaseUnits[0].Payments.Captures[0]
		out.ID = capture.ID
		if capture.Status != "" {
			out.Status = capture.Status
		}
	}
	return out, nil
}

// VerifyWebhookSignature calls POST /v1/notifications/verify-webhook-signature
// with the PAYPAL-* transmission headers plus the raw webhook body, and
// reports whether PayPal confirmed verification_status == "SUCCESS". The
// webhook_event field must be the parsed JSON object, not the raw body as a
// string - json.RawMessage embeds it as-is without re-encoding.
func (c *httpClient) VerifyWebhookSignature(ctx context.Context, headers WebhookHeaders, rawBody []byte, webhookID string) (bool, error) {
	token, err := c.GetAccessToken(ctx)
	if err != nil {
		return false, err
	}

	body := map[string]any{
		"auth_algo":         headers.AuthAlgo,
		"cert_url":          headers.CertURL,
		"transmission_id":   headers.TransmissionID,
		"transmission_sig":  headers.TransmissionSig,
		"transmission_time": headers.TransmissionTime,
		"webhook_id":        webhookID,
		"webhook_event":     json.RawMessage(rawBody),
	}

	var out struct {
		VerificationStatus string `json:"verification_status"`
	}
	if err := c.doJSON(ctx, token, http.MethodPost, "/v1/notifications/verify-webhook-signature", body, &out); err != nil {
		return false, err
	}
	return out.VerificationStatus == "SUCCESS", nil
}

func (c *httpClient) doJSON(ctx context.Context, token, method, path string, input any, output any) error {
	var body io.Reader
	if input != nil {
		raw, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.config.BaseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	response, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("paypal request failed: %w", err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, responseLimit))
	if err != nil {
		return err
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var provider struct {
			Name string `json:"name"`
		}
		_ = json.Unmarshal(raw, &provider)
		return &ProviderError{StatusCode: response.StatusCode, Name: provider.Name}
	}
	if err := json.Unmarshal(raw, output); err != nil {
		return fmt.Errorf("invalid PayPal response")
	}
	return nil
}
