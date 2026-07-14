package chatbot

import (
	"context"
	"testing"

	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

func TestRegisterIsolatesRoles(t *testing.T) {
	defer resetRegistryForTest()

	Register("role_a", Tool{
		Def: provider.ToolDef{Name: "tool_a"},
		Run: func(context.Context, scope.Scope, string) (string, error) { return "{}", nil },
	})
	Register("role_b", Tool{
		Def: provider.ToolDef{Name: "tool_b"},
		Run: func(context.Context, scope.Scope, string) (string, error) { return "{}", nil },
	})

	if len(ToolsForRole("role_a")) != 1 || ToolsForRole("role_a")[0].Def.Name != "tool_a" {
		t.Fatalf("expected role_a to have exactly tool_a, got %+v", ToolsForRole("role_a"))
	}
	if len(ToolsForRole("role_b")) != 1 || ToolsForRole("role_b")[0].Def.Name != "tool_b" {
		t.Fatalf("expected role_b to have exactly tool_b, got %+v", ToolsForRole("role_b"))
	}
	if len(ToolsForRole("role_with_nothing_registered")) != 0 {
		t.Fatalf("expected an unregistered role to have zero tools, got %d", len(ToolsForRole("role_with_nothing_registered")))
	}
}

func TestRegisterPanicsOnDuplicateToolName(t *testing.T) {
	defer resetRegistryForTest()

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected Register to panic on a duplicate tool name within the same role")
		}
	}()
	Register("role_c",
		Tool{Def: provider.ToolDef{Name: "dup"}, Run: func(context.Context, scope.Scope, string) (string, error) { return "", nil }},
		Tool{Def: provider.ToolDef{Name: "dup"}, Run: func(context.Context, scope.Scope, string) (string, error) { return "", nil }},
	)
}

func resetRegistryForTest() {
	registry = map[string][]Tool{}
}
