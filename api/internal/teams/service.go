package teams

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

type Service struct{ client *Client }

var defaultService struct {
	mu      sync.Mutex
	service *Service
}

func NewService(c Config) *Service { return &Service{client: NewClient(c)} }

// DefaultService is shared by HTTP handlers and LMS session creation, allowing
// the client-credentials token cache to be reused for the process lifetime.
func DefaultService() (*Service, error) {
	defaultService.mu.Lock()
	defer defaultService.mu.Unlock()
	if defaultService.service != nil {
		return defaultService.service, nil
	}
	config, err := LoadConfig()
	if err != nil {
		return nil, err
	}
	defaultService.service = NewService(config)
	return defaultService.service, nil
}

func (s *Service) CreateMeeting(ctx context.Context, r CreateMeetingRequest) (*MeetingDTO, error) {
	r.Subject = strings.TrimSpace(r.Subject)
	if r.Subject == "" {
		return nil, fmt.Errorf("subject is required")
	}
	start, err := time.Parse(time.RFC3339, r.StartTime)
	if err != nil {
		return nil, fmt.Errorf("start_time must be RFC3339")
	}
	end, err := time.Parse(time.RFC3339, r.EndTime)
	if err != nil || !end.After(start) {
		return nil, fmt.Errorf("end_time must be after start_time")
	}
	r.StartTime = start.UTC().Format(time.RFC3339)
	r.EndTime = end.UTC().Format(time.RFC3339)
	return s.client.CreateOnlineMeeting(ctx, r)
}

func (s *Service) CreateCalendarEvent(ctx context.Context, r CreateCalendarEventRequest) (*CalendarEventDTO, error) {
	r.Subject = strings.TrimSpace(r.Subject)
	if r.Subject == "" {
		return nil, fmt.Errorf("subject is required")
	}
	if r.TransactionID == "" {
		return nil, fmt.Errorf("transaction ID is required")
	}
	if !r.EndTime.After(r.StartTime) {
		return nil, fmt.Errorf("end time must be after start time")
	}
	for i := range r.Attendees {
		r.Attendees[i].Name = strings.TrimSpace(r.Attendees[i].Name)
		r.Attendees[i].Email = strings.TrimSpace(r.Attendees[i].Email)
		if r.Attendees[i].Email == "" || !strings.Contains(r.Attendees[i].Email, "@") {
			return nil, fmt.Errorf("attendee email is invalid")
		}
	}
	return s.client.CreateCalendarEvent(ctx, r)
}

func (s *Service) Health(ctx context.Context) (*HealthDTO, error) {
	return s.client.GetOrganizer(ctx)
}

func (s *Service) UpdateCalendarEvent(ctx context.Context, r UpdateCalendarEventRequest) error {
	r.Subject = strings.TrimSpace(r.Subject)
	if r.EventID == "" {
		return fmt.Errorf("provider event ID is required")
	}
	if r.Subject == "" {
		return fmt.Errorf("subject is required")
	}
	if !r.EndTime.After(r.StartTime) {
		return fmt.Errorf("end time must be after start time")
	}
	for i := range r.Attendees {
		r.Attendees[i].Name = strings.TrimSpace(r.Attendees[i].Name)
		r.Attendees[i].Email = strings.TrimSpace(r.Attendees[i].Email)
		if r.Attendees[i].Email == "" || !strings.Contains(r.Attendees[i].Email, "@") {
			return fmt.Errorf("attendee email is invalid")
		}
	}
	return s.client.UpdateCalendarEvent(ctx, r)
}

func (s *Service) DeleteCalendarEvent(ctx context.Context, eventID string) error {
	if strings.TrimSpace(eventID) == "" {
		return fmt.Errorf("provider event ID is required")
	}
	return s.client.DeleteCalendarEvent(ctx, eventID)
}
