package teams

import "fmt"

type GraphError struct {
	Status int
	Code   string
}

func (e *GraphError) Error() string {
	return fmt.Sprintf("Microsoft Graph error (%d): %s", e.Status, e.Code)
}
