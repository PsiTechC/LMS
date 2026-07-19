package paypal

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"
)

const frankfurterINRToUSDURL = "https://api.frankfurter.dev/v2/rate/INR/USD"

var fxCache struct {
	sync.Mutex
	rate    float64
	fetched time.Time
}

// INRMinorToUSDMinor converts paise to USD cents using a server-side rate.
// It rounds up by one cent when necessary so a paid INR catalog price is never
// under-collected because of fractional-cent rounding.
func INRMinorToUSDMinor(ctx context.Context, amountINRMinor int64, client *http.Client) (int64, string, error) {
	if amountINRMinor <= 0 {
		return 0, "", ErrInvalidAmount
	}
	fxCache.Lock()
	defer fxCache.Unlock()
	if time.Since(fxCache.fetched) > 15*time.Minute || fxCache.rate <= 0 {
		if client == nil {
			client = &http.Client{Timeout: 5 * time.Second}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, frankfurterINRToUSDURL, nil)
		if err != nil {
			return 0, "", err
		}
		res, err := client.Do(req)
		if err != nil {
			return 0, "", fmt.Errorf("exchange-rate request failed: %w", err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return 0, "", fmt.Errorf("exchange-rate service returned %d", res.StatusCode)
		}
		var quote struct {
			Rate float64 `json:"rate"`
		}
		if err := json.NewDecoder(res.Body).Decode(&quote); err != nil || quote.Rate <= 0 {
			return 0, "", fmt.Errorf("invalid INR/USD exchange rate")
		}
		fxCache.rate, fxCache.fetched = quote.Rate, time.Now()
	}
	cents := int64(math.Ceil(float64(amountINRMinor) * fxCache.rate))
	if cents <= 0 {
		cents = 1
	}
	return cents, fmt.Sprintf("%.10f", fxCache.rate), nil
}
