package provider

import "encoding/json"

// ToolDef describes one callable function in OpenAI's tools wire format.
// Parameters is a raw JSON Schema object (not a Go struct) so callers can
// hand-author schemas without an extra reflection layer.
type ToolDef struct {
	Name        string
	Description string
	Parameters  json.RawMessage // JSON Schema object, e.g. {"type":"object","properties":{...}}
}

type toolWire struct {
	Type     string       `json:"type"`
	Function functionWire `json:"function"`
}

type functionWire struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters,omitempty"`
}

func toolDefsToWire(defs []ToolDef) []toolWire {
	if len(defs) == 0 {
		return nil
	}
	out := make([]toolWire, 0, len(defs))
	for _, d := range defs {
		params := d.Parameters
		if len(params) == 0 {
			params = json.RawMessage(`{"type":"object","properties":{}}`)
		}
		out = append(out, toolWire{
			Type: "function",
			Function: functionWire{
				Name:        d.Name,
				Description: d.Description,
				Parameters:  params,
			},
		})
	}
	return out
}

// ToolCall is one function call the model asked to make. ID must be echoed
// back on the corresponding tool-role reply message so the model can match
// results to calls (OpenAI requires this for multi-tool-call turns).
type ToolCall struct {
	ID        string
	Name      string
	Arguments string // raw JSON string of arguments, as the model produced it
}

type toolCallWire struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Function toolCallFuncWire `json:"function"`
}

type toolCallFuncWire struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}
