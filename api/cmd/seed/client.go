package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// apiClient is a thin authenticated HTTP client for one persona's JWT.
type apiClient struct {
	baseURL string
	token   string
	http    *http.Client
}

func newAPIClient(baseURL string) *apiClient {
	return &apiClient{baseURL: baseURL, http: &http.Client{Timeout: 30 * time.Second}}
}

// envelope mirrors the project-wide {data, meta, error} response shape (CLAUDE.md).
type envelope struct {
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Field   string `json:"field"`
	} `json:"error"`
}

func (c *apiClient) login(email, password string) error {
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	resp, err := c.http.Post(c.baseURL+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("login request: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return fmt.Errorf("login: bad response body: %s", raw)
	}
	if resp.StatusCode != http.StatusOK || env.Error != nil {
		return fmt.Errorf("login failed for %s: HTTP %d, body=%s", email, resp.StatusCode, raw)
	}

	var payload struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(env.Data, &payload); err != nil {
		return fmt.Errorf("login: parsing token: %w", err)
	}
	if payload.AccessToken == "" {
		return fmt.Errorf("login for %s: no access_token in response: %s", email, raw)
	}
	c.token = payload.AccessToken
	return nil
}

// do sends an authenticated request and unmarshals `data` into out (if non-nil).
// path must start with "/api/v1/...". Returns the raw envelope for callers that
// need to inspect it further.
func (c *apiClient) do(method, path string, body any, out any) (*envelope, error) {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, c.baseURL+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var env envelope
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &env); err != nil {
			return nil, fmt.Errorf("%s %s: bad response body: %s", method, path, raw)
		}
	}
	if resp.StatusCode >= 300 || env.Error != nil {
		return &env, fmt.Errorf("%s %s: HTTP %d: %s", method, path, resp.StatusCode, raw)
	}
	if out != nil && len(env.Data) > 0 {
		if err := json.Unmarshal(env.Data, out); err != nil {
			return &env, fmt.Errorf("%s %s: parsing data: %w (raw=%s)", method, path, err, raw)
		}
	}
	return &env, nil
}

func (c *apiClient) post(path string, body any, out any) error {
	_, err := c.do(http.MethodPost, path, body, out)
	return err
}

func (c *apiClient) patch(path string, body any, out any) error {
	_, err := c.do(http.MethodPatch, path, body, out)
	return err
}

func (c *apiClient) get(path string, out any) error {
	_, err := c.do(http.MethodGet, path, nil, out)
	return err
}
