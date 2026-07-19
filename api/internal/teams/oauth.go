package teams

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type TokenProvider struct {
	c      Config
	http   *http.Client
	mu     sync.Mutex
	token  string
	expiry time.Time
}

func NewTokenProvider(c Config) *TokenProvider {
	return &TokenProvider{c: c, http: &http.Client{Timeout: 10 * time.Second}}
}

func (p *TokenProvider) Token(ctx context.Context) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.token != "" && time.Now().Before(p.expiry.Add(-time.Minute)) {
		return p.token, nil
	}

	resource := strings.TrimSuffix(p.c.GraphBaseURL, "/v1.0")
	values := url.Values{
		"client_id":     {p.c.ClientID},
		"client_secret": {p.c.ClientSecret},
		"scope":         {resource + "/.default"},
		"grant_type":    {"client_credentials"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://login.microsoftonline.com/"+url.PathEscape(p.c.TenantID)+"/oauth2/v2.0/token",
		strings.NewReader(values.Encode()),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := p.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return "", &GraphError{Status: res.StatusCode, Code: "token_request_failed"}
	}

	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err = json.NewDecoder(res.Body).Decode(&out); err != nil || out.AccessToken == "" {
		return "", err
	}
	p.token = out.AccessToken
	p.expiry = time.Now().Add(time.Duration(out.ExpiresIn) * time.Second)
	return p.token, nil
}
