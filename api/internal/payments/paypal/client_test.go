package paypal

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func testConfig(baseURL string) Config {
	return Config{ClientID: "test-id", ClientSecret: "test-secret", Mode: "sandbox", BaseURL: baseURL}
}

// TestGetAccessTokenFetchesAndCaches confirms a second call within the
// token's lifetime does NOT hit the server again — the task explicitly
// calls out that PayPal tokens last ~9 hours and must not be refetched on
// every request.
func TestGetAccessTokenFetchesAndCaches(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		if r.URL.Path != "/v1/oauth2/token" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		user, pass, ok := r.BasicAuth()
		if !ok || user != "test-id" || pass != "test-secret" {
			t.Fatalf("expected Basic Auth with client credentials, got user=%q pass-ok=%v", user, ok)
		}
		body, _ := readAll(r)
		if !strings.Contains(body, "grant_type=client_credentials") {
			t.Fatalf("expected grant_type=client_credentials body, got %q", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "fresh-token",
			"expires_in":   32400,
			"token_type":   "Bearer",
		})
	}))
	defer server.Close()

	client := NewClient(testConfig(server.URL), server.Client())
	for i := 0; i < 3; i++ {
		token, err := client.GetAccessToken(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if token != "fresh-token" {
			t.Fatalf("token = %q", token)
		}
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("token endpoint called %d times, want 1 (cached)", got)
	}
}

// TestGetAccessTokenRefetchesAfterExpiry confirms an expired cached token IS
// refetched — the counterpart to the caching test above.
func TestGetAccessTokenRefetchesAfterExpiry(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "token", "expires_in": 3600})
	}))
	defer server.Close()

	c := NewClient(testConfig(server.URL), server.Client()).(*httpClient)
	fakeNow := time.Now()
	c.now = func() time.Time { return fakeNow }

	if _, err := c.GetAccessToken(context.Background()); err != nil {
		t.Fatal(err)
	}
	// Advance past expiry (3600s - 60s margin).
	fakeNow = fakeNow.Add(2 * time.Hour)
	if _, err := c.GetAccessToken(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Fatalf("token endpoint called %d times, want 2 (expired, refetched)", got)
	}
}

// TestGetAccessTokenInvalidClient confirms the sandbox/live credential
// mismatch failure mode the task calls out is classified as
// IsInvalidClient(), not a generic error.
func TestGetAccessTokenInvalidClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error":             "invalid_client",
			"error_description": "Client Authentication failed",
		})
	}))
	defer server.Close()

	client := NewClient(testConfig(server.URL), server.Client())
	_, err := client.GetAccessToken(context.Background())
	if err == nil {
		t.Fatal("expected error")
	}
	provErr, ok := err.(*ProviderError)
	if !ok {
		t.Fatalf("error type = %T, want *ProviderError", err)
	}
	if !provErr.IsInvalidClient() {
		t.Fatalf("IsInvalidClient() = false, want true (Name=%q)", provErr.Name)
	}
}

func TestCreateOrder(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/oauth2/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 3600})
		case "/v2/checkout/orders":
			if auth := r.Header.Get("Authorization"); auth != "Bearer tok" {
				t.Fatalf("Authorization = %q", auth)
			}
			var body struct {
				Intent        string `json:"intent"`
				PurchaseUnits []struct {
					ReferenceID string `json:"reference_id"`
					Amount      struct {
						CurrencyCode string `json:"currency_code"`
						Value        string `json:"value"`
					} `json:"amount"`
				} `json:"purchase_units"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body.Intent != "CAPTURE" {
				t.Fatalf("intent = %q, want CAPTURE", body.Intent)
			}
			if len(body.PurchaseUnits) != 1 {
				t.Fatalf("purchase_units len = %d, want 1", len(body.PurchaseUnits))
			}
			unit := body.PurchaseUnits[0]
			if unit.ReferenceID != "order-ref-123" {
				t.Fatalf("reference_id = %q", unit.ReferenceID)
			}
			if unit.Amount.CurrencyCode != "USD" || unit.Amount.Value != "49.99" {
				t.Fatalf("amount = %+v, want USD 49.99", unit.Amount)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":     "PAYPAL-ORDER-1",
				"status": "CREATED",
				"links": []map[string]string{
					{"href": "https://example.com/self", "rel": "self", "method": "GET"},
					{"href": "https://example.com/approve", "rel": "approve", "method": "GET"},
				},
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewClient(testConfig(server.URL), server.Client())
	order, err := client.CreateOrder(context.Background(), CreateOrderRequest{
		AmountMinorUnits: 4999, Currency: "USD", ReferenceID: "order-ref-123",
	})
	if err != nil {
		t.Fatal(err)
	}
	if order.ID != "PAYPAL-ORDER-1" || order.Status != "CREATED" {
		t.Fatalf("order = %+v", order)
	}
	if order.ApprovalLink != "https://example.com/approve" {
		t.Fatalf("ApprovalLink = %q", order.ApprovalLink)
	}
}

func TestCaptureOrder(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/oauth2/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 3600})
		case "/v2/checkout/orders/PAYPAL-ORDER-1/capture":
			if r.Method != http.MethodPost {
				t.Fatalf("method = %s, want POST", r.Method)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":     "PAYPAL-ORDER-1",
				"status": "COMPLETED",
				"purchase_units": []map[string]any{
					{"payments": map[string]any{"captures": []map[string]any{
						{"id": "CAPTURE-1", "status": "COMPLETED"},
					}}},
				},
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewClient(testConfig(server.URL), server.Client())
	capture, err := client.CaptureOrder(context.Background(), "PAYPAL-ORDER-1")
	if err != nil {
		t.Fatal(err)
	}
	if capture.ID != "CAPTURE-1" || capture.Status != "COMPLETED" {
		t.Fatalf("capture = %+v", capture)
	}
}

func TestCreateOrderProviderError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/oauth2/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 3600})
		case "/v2/checkout/orders":
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string]any{"name": "UNPROCESSABLE_ENTITY", "message": "boom"})
		}
	}))
	defer server.Close()

	client := NewClient(testConfig(server.URL), server.Client())
	_, err := client.CreateOrder(context.Background(), CreateOrderRequest{AmountMinorUnits: 100, Currency: "USD", ReferenceID: "r"})
	if err == nil {
		t.Fatal("expected error")
	}
	provErr, ok := err.(*ProviderError)
	if !ok {
		t.Fatalf("error type = %T, want *ProviderError", err)
	}
	if provErr.Name != "UNPROCESSABLE_ENTITY" || provErr.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("provErr = %+v", provErr)
	}
}

func readAll(r *http.Request) (string, error) {
	raw, err := io.ReadAll(r.Body)
	return string(raw), err
}

func TestVerifyWebhookSignatureSuccess(t *testing.T) {
	rawEvent := []byte(`{"id":"WH-EVENT-1","event_type":"PAYMENT.CAPTURE.COMPLETED"}`)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/oauth2/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 3600})
		case "/v1/notifications/verify-webhook-signature":
			if auth := r.Header.Get("Authorization"); auth != "Bearer tok" {
				t.Fatalf("Authorization = %q", auth)
			}
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			for _, field := range []string{"auth_algo", "cert_url", "transmission_id", "transmission_sig", "transmission_time", "webhook_id"} {
				if body[field] != "test-"+field {
					t.Fatalf("field %s = %v, want %q", field, body[field], "test-"+field)
				}
			}
			event, ok := body["webhook_event"].(map[string]any)
			if !ok || event["id"] != "WH-EVENT-1" {
				t.Fatalf("webhook_event not embedded as parsed JSON: %+v", body["webhook_event"])
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"verification_status": "SUCCESS"})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewClient(testConfig(server.URL), server.Client())
	headers := WebhookHeaders{
		AuthAlgo: "test-auth_algo", CertURL: "test-cert_url", TransmissionID: "test-transmission_id",
		TransmissionSig: "test-transmission_sig", TransmissionTime: "test-transmission_time",
	}
	verified, err := client.VerifyWebhookSignature(context.Background(), headers, rawEvent, "test-webhook_id")
	if err != nil {
		t.Fatal(err)
	}
	if !verified {
		t.Fatal("verified = false, want true")
	}
}

func TestVerifyWebhookSignatureFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/oauth2/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 3600})
		case "/v1/notifications/verify-webhook-signature":
			_ = json.NewEncoder(w).Encode(map[string]any{"verification_status": "FAILURE"})
		}
	}))
	defer server.Close()

	client := NewClient(testConfig(server.URL), server.Client())
	verified, err := client.VerifyWebhookSignature(context.Background(), WebhookHeaders{}, []byte(`{}`), "wh-id")
	if err != nil {
		t.Fatal(err)
	}
	if verified {
		t.Fatal("verified = true, want false for FAILURE status")
	}
}

func TestVerifyWebhookSignatureProviderError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/oauth2/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "tok", "expires_in": 3600})
		case "/v1/notifications/verify-webhook-signature":
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{"name": "VALIDATION_ERROR", "message": "malformed request"})
		}
	}))
	defer server.Close()

	client := NewClient(testConfig(server.URL), server.Client())
	_, err := client.VerifyWebhookSignature(context.Background(), WebhookHeaders{}, []byte(`{}`), "wh-id")
	if err == nil {
		t.Fatal("expected error")
	}
	provErr, ok := err.(*ProviderError)
	if !ok {
		t.Fatalf("error type = %T, want *ProviderError", err)
	}
	if provErr.Name != "VALIDATION_ERROR" {
		t.Fatalf("provErr = %+v", provErr)
	}
}
