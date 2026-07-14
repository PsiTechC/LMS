package notify

import "context"

// Message is one decided-to-fire notification, ready for delivery.
type Message struct {
	SubjectID string
	RuleKey   string
	Title     string
	Body      string
}

// Dispatcher delivers a Message through some channel (email, in-app, push).
// No implementation is wired in this phase — actual delivery belongs to the
// communications module's own HTTP API (modules never import each other's
// packages directly), so the real implementation here will be an HTTP
// client call into communications, added when a concrete caller needs it.
type Dispatcher interface {
	Dispatch(ctx context.Context, msg Message) error
}
