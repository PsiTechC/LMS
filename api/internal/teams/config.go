package teams

import (
	"fmt"
	"os"
	"strings"
)

type Config struct{ TenantID, ClientID, ClientSecret, Organizer, GraphBaseURL string }

func LoadConfig() (Config, error) {
	c := Config{strings.TrimSpace(os.Getenv("MICROSOFT_TENANT_ID")), strings.TrimSpace(os.Getenv("MICROSOFT_CLIENT_ID")), strings.TrimSpace(os.Getenv("MICROSOFT_CLIENT_SECRET")), strings.TrimSpace(os.Getenv("MICROSOFT_TEAMS_ORGANIZER")), strings.TrimRight(strings.TrimSpace(os.Getenv("MICROSOFT_GRAPH_BASE_URL")), "/")}
	if c.TenantID == "" || c.ClientID == "" || c.ClientSecret == "" || c.Organizer == "" {
		return Config{}, fmt.Errorf("Microsoft Teams configuration is incomplete")
	}
	if c.GraphBaseURL == "" {
		c.GraphBaseURL = "https://graph.microsoft.com/v1.0"
	}
	return c, nil
}
