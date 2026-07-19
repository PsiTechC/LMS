package teams

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"time"
)

type Client struct {
	c    Config
	t    *TokenProvider
	http *http.Client
}

func NewClient(c Config) *Client {
	return &Client{c: c, t: NewTokenProvider(c), http: &http.Client{Timeout: 15 * time.Second}}
}

func (c *Client) CreateOnlineMeeting(ctx context.Context, req CreateMeetingRequest) (*MeetingDTO, error) {
	token, err := c.t.Token(ctx)
	if err != nil {
		return nil, err
	}
	body, err := json.Marshal(map[string]any{
		"subject":       req.Subject,
		"startDateTime": map[string]string{"dateTime": req.StartTime, "timeZone": "UTC"},
		"endDateTime":   map[string]string{"dateTime": req.EndTime, "timeZone": "UTC"},
	})
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.c.GraphBaseURL+"/users/"+url.PathEscape(c.c.Organizer)+"/onlineMeetings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return nil, decodeGraphError(res)
	}
	var out struct {
		ID         string `json:"id"`
		Subject    string `json:"subject"`
		JoinWebURL string `json:"joinWebUrl"`
	}
	if err = json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &MeetingDTO{ID: out.ID, Subject: out.Subject, JoinURL: out.JoinWebURL, Organizer: c.c.Organizer}, nil
}

func (c *Client) GetOrganizer(ctx context.Context) (*HealthDTO, error) {
	token, err := c.t.Token(ctx)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.c.GraphBaseURL+"/users/"+url.PathEscape(c.c.Organizer)+"?$select=id,displayName,userPrincipalName", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	res, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return nil, decodeGraphError(res)
	}
	var user struct {
		ID                string `json:"id"`
		DisplayName       string `json:"displayName"`
		UserPrincipalName string `json:"userPrincipalName"`
	}
	if err := json.NewDecoder(res.Body).Decode(&user); err != nil {
		return nil, err
	}
	return &HealthDTO{Connected: true, Organizer: user.UserPrincipalName, OrganizerID: user.ID, DisplayName: user.DisplayName}, nil
}

func (c *Client) CreateCalendarEvent(ctx context.Context, in CreateCalendarEventRequest) (*CalendarEventDTO, error) {
	token, err := c.t.Token(ctx)
	if err != nil {
		return nil, err
	}
	attendees := make([]map[string]any, 0, len(in.Attendees))
	for _, attendee := range in.Attendees {
		attendees = append(attendees, map[string]any{
			"emailAddress": map[string]string{"name": attendee.Name, "address": attendee.Email},
			"type":         "required",
		})
	}
	payload := map[string]any{
		"subject":               in.Subject,
		"body":                  map[string]string{"contentType": "HTML", "content": in.Description},
		"start":                 map[string]string{"dateTime": in.StartTime.Format("2006-01-02T15:04:05"), "timeZone": "India Standard Time"},
		"end":                   map[string]string{"dateTime": in.EndTime.Format("2006-01-02T15:04:05"), "timeZone": "India Standard Time"},
		"attendees":             attendees,
		"isOnlineMeeting":       true,
		"onlineMeetingProvider": "teamsForBusiness",
		"transactionId":         in.TransactionID,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.c.GraphBaseURL+"/users/"+url.PathEscape(c.c.Organizer)+"/events", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return nil, decodeGraphError(res)
	}

	var event struct {
		ID            string `json:"id"`
		WebLink       string `json:"webLink"`
		OnlineMeeting struct {
			JoinURL string `json:"joinUrl"`
		} `json:"onlineMeeting"`
	}
	if err := json.NewDecoder(res.Body).Decode(&event); err != nil {
		return nil, err
	}
	if event.ID == "" || event.OnlineMeeting.JoinURL == "" {
		return nil, &GraphError{Status: http.StatusBadGateway, Code: "online_meeting_join_url_missing"}
	}
	return &CalendarEventDTO{ID: event.ID, JoinURL: event.OnlineMeeting.JoinURL, WebLink: event.WebLink, Organizer: c.c.Organizer}, nil
}

func decodeGraphError(res *http.Response) error {
	var failure struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	_ = json.NewDecoder(res.Body).Decode(&failure)
	return &GraphError{Status: res.StatusCode, Code: failure.Error.Code}
}

func (c *Client) UpdateCalendarEvent(ctx context.Context, in UpdateCalendarEventRequest) error {
	token, err := c.t.Token(ctx)
	if err != nil {
		return err
	}
	attendees := make([]map[string]any, 0, len(in.Attendees))
	for _, attendee := range in.Attendees {
		attendees = append(attendees, map[string]any{
			"emailAddress": map[string]string{"name": attendee.Name, "address": attendee.Email},
			"type":         "required",
		})
	}
	payload := map[string]any{
		"subject":   in.Subject,
		"body":      map[string]string{"contentType": "HTML", "content": in.Description},
		"start":     map[string]string{"dateTime": in.StartTime.Format("2006-01-02T15:04:05"), "timeZone": "India Standard Time"},
		"end":       map[string]string{"dateTime": in.EndTime.Format("2006-01-02T15:04:05"), "timeZone": "India Standard Time"},
		"attendees": attendees,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPatch,
		c.c.GraphBaseURL+"/users/"+url.PathEscape(c.c.Organizer)+"/events/"+url.PathEscape(in.EventID), bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return decodeGraphError(res)
	}
	return nil
}

// DeleteCalendarEvent removes the organizer's calendar event. Graph returning
// 404 is safe to treat as success: the desired external state already exists.
func (c *Client) DeleteCalendarEvent(ctx context.Context, eventID string) error {
	token, err := c.t.Token(ctx)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.c.GraphBaseURL+"/users/"+url.PathEscape(c.c.Organizer)+"/events/"+url.PathEscape(eventID), nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	res, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound || res.StatusCode/100 == 2 {
		return nil
	}
	return decodeGraphError(res)
}
