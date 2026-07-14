package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const razorpayBaseURL = "https://api.razorpay.com/v1"
const razorpayResponseLimit = 1 << 20

type RazorpayClient interface {
	CreateOrder(context.Context, RazorpayOrderRequest) (RazorpayOrder, error)
	GetOrder(context.Context, string) (RazorpayOrder, error)
	GetPayment(context.Context, string) (RazorpayPayment, error)
}
type RazorpayOrderRequest struct {
	Amount   int64             `json:"amount"`
	Currency string            `json:"currency"`
	Receipt  string            `json:"receipt"`
	Notes    map[string]string `json:"notes,omitempty"`
}
type RazorpayOrder struct {
	ID       string `json:"id"`
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
	Receipt  string `json:"receipt"`
	Status   string `json:"status"`
}
type RazorpayPayment struct {
	ID       string `json:"id"`
	OrderID  string `json:"order_id"`
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
	Status   string `json:"status"`
}
type RazorpayProviderError struct {
	StatusCode int
	Code       string
}

func (e *RazorpayProviderError) Error() string {
	return fmt.Sprintf("razorpay API error (%d)", e.StatusCode)
}

type razorpayHTTPClient struct {
	keyID, keySecret, baseURL string
	httpClient                *http.Client
}

func NewRazorpayClient(config Config, client *http.Client) RazorpayClient {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &razorpayHTTPClient{config.KeyID, config.KeySecret, razorpayBaseURL, client}
}
func (c *razorpayHTTPClient) CreateOrder(ctx context.Context, order RazorpayOrderRequest) (RazorpayOrder, error) {
	var out RazorpayOrder
	return out, c.doJSON(ctx, http.MethodPost, "/orders", order, &out)
}
func (c *razorpayHTTPClient) GetOrder(ctx context.Context, id string) (RazorpayOrder, error) {
	var out RazorpayOrder
	return out, c.doJSON(ctx, http.MethodGet, "/orders/"+id, nil, &out)
}
func (c *razorpayHTTPClient) GetPayment(ctx context.Context, id string) (RazorpayPayment, error) {
	var out RazorpayPayment
	return out, c.doJSON(ctx, http.MethodGet, "/payments/"+id, nil, &out)
}
func (c *razorpayHTTPClient) doJSON(ctx context.Context, method, path string, input any, output any) error {
	var body io.Reader
	if input != nil {
		raw, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.keyID, c.keySecret)
	req.Header.Set("Accept", "application/json")
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	response, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("razorpay request failed: %w", err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, razorpayResponseLimit))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var provider struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		_ = json.Unmarshal(raw, &provider)
		return &RazorpayProviderError{StatusCode: response.StatusCode, Code: provider.Error.Code}
	}
	if err := json.Unmarshal(raw, output); err != nil {
		return errors.New("invalid Razorpay response")
	}
	return nil
}
